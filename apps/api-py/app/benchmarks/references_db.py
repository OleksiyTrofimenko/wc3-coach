"""
DB layer for benchmark references (DB-backed references, T-step #1).

This is the bridge between the curatable `benchmark_references` table and the
PURE benchmark engine. The engine never touches the DB: the route handler calls
`load_reference_table()` once, then injects the resulting in-memory table into
`run_benchmarks(..., references=table)`.

Responsibilities
----------------
1. load_reference_table(conn, patch_id) -> ReferenceTable
   Load all reference rows applicable to a replay's patch into the same
   dict[(matchup, race, metric)] -> ReferenceEntry shape the engine expects.
   Patch-specific rows override the NULL-patch baseline. Falls back to the
   in-code seed table when the DB has no rows (fresh/unmigrated DB).

2. resolve_patch_id(conn, version, build) -> str | None
   Look up a patch_versions UUID by (version, build_number). Used by the seed.

3. CRUD helpers (list/get/create/update/delete) for the admin panel.

Pattern mirrors app/benchmarks/db.py and app/coach/db.py: SQLAlchemy core-style
(sa.table / sa.column), asyncpg, shared get_engine.
"""

from __future__ import annotations

import logging
import uuid as _uuid
from typing import Any

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.asyncio import AsyncConnection

from app.benchmarks.db import get_engine as _get_engine
from app.benchmarks.references import (
    _SEED_REFERENCE_TABLE,
    ReferenceEntry,
    ReferenceTable,
)

# Re-export so callers have a single import point
get_engine = _get_engine

logger = logging.getLogger(__name__)

# Editable provenance / confidence vocabularies (validated at the API layer too)
PROVENANCE_VALUES = ("community", "pro", "user")
CONFIDENCE_VALUES = ("low", "medium", "high")

# The single confirmed patch (patches.json). All current references are 2.0
# values, so new admin-created rows default to this patch — they behave exactly
# like the seeded rows and correctly collide (409) with an existing key.
CURRENT_PATCH_VERSION = "2.00"
CURRENT_PATCH_BUILD = 6117

# ---------------------------------------------------------------------------
# Table definitions (core-style — no ORM)
# ---------------------------------------------------------------------------

_BENCHMARK_REFERENCES = sa.table(
    "benchmark_references",
    sa.column("id", UUID(as_uuid=False)),
    sa.column("matchup", sa.Text),
    sa.column("race_id", sa.Text),
    sa.column("metric", sa.Text),
    sa.column("expected", sa.Float),
    sa.column("window_ms", sa.Float),
    sa.column("notes", sa.Text),
    sa.column("provenance", sa.Text),
    sa.column("confidence", sa.Text),
    sa.column("patch_id", UUID(as_uuid=False)),
    sa.column("created_at", sa.DateTime(timezone=True)),
    sa.column("updated_at", sa.DateTime(timezone=True)),
)

_PATCH_VERSIONS = sa.table(
    "patch_versions",
    sa.column("id", UUID(as_uuid=False)),
    sa.column("version", sa.Text),
    sa.column("build_number", sa.Integer),
)


def _is_uuid(value: str) -> bool:
    """True if `value` parses as a UUID (so it can be compared to a uuid column)."""
    try:
        _uuid.UUID(value)
        return True
    except (ValueError, AttributeError, TypeError):
        return False


# ---------------------------------------------------------------------------
# Loader (engine injection path)
# ---------------------------------------------------------------------------


async def load_reference_table(
    conn: AsyncConnection,
    patch_id: str | None,
) -> ReferenceTable:
    """
    Load the reference table for a replay's patch into the engine's dict shape.

    Rows whose patch_id matches `patch_id` override NULL-patch baseline rows for
    the same (matchup, race, metric) key. When `patch_id` is not a UUID (e.g. the
    "patch:2.0" fallback string from load_replay_timeline on an unresolved
    replay), only NULL-baseline rows are considered.

    Falls back to the in-code seed table (_SEED_REFERENCE_TABLE) when the DB has
    zero reference rows — so a fresh or unmigrated DB never breaks benchmarks.
    """
    pid = str(patch_id) if patch_id is not None else None

    where: sa.ColumnElement[bool] = _BENCHMARK_REFERENCES.c.patch_id.is_(None)
    if pid is not None and _is_uuid(pid):
        where = sa.or_(where, _BENCHMARK_REFERENCES.c.patch_id == pid)

    rows = (
        await conn.execute(
            sa.select(
                _BENCHMARK_REFERENCES.c.matchup,
                _BENCHMARK_REFERENCES.c.race_id,
                _BENCHMARK_REFERENCES.c.metric,
                _BENCHMARK_REFERENCES.c.expected,
                _BENCHMARK_REFERENCES.c.window_ms,
                _BENCHMARK_REFERENCES.c.notes,
                _BENCHMARK_REFERENCES.c.patch_id,
            )
            .where(where)
            # NULL-patch rows first so patch-specific rows overwrite them.
            .order_by(_BENCHMARK_REFERENCES.c.patch_id.asc().nullsfirst())
        )
    ).fetchall()

    if not rows:
        logger.warning(
            "benchmark_references is empty — falling back to the in-code seed "
            "table. Run `python -m app.benchmarks.seed_references` to populate it."
        )
        return dict(_SEED_REFERENCE_TABLE)

    table: ReferenceTable = {}
    for r in rows:
        table[(r.matchup, r.race_id, r.metric)] = ReferenceEntry(
            expected=float(r.expected),
            window_ms=float(r.window_ms),
            notes=r.notes or "",
        )
    return table


async def resolve_patch_id(
    conn: AsyncConnection,
    version: str,
    build: int,
) -> str | None:
    """Return the patch_versions UUID for (version, build), or None if absent."""
    row = (
        await conn.execute(
            sa.select(_PATCH_VERSIONS.c.id).where(
                sa.and_(
                    _PATCH_VERSIONS.c.version == version,
                    _PATCH_VERSIONS.c.build_number == build,
                )
            )
        )
    ).fetchone()
    return str(row.id) if row is not None else None


async def resolve_current_patch_id(conn: AsyncConnection) -> str | None:
    """Return the UUID of the current patch (2.0), or None if not registered."""
    return await resolve_patch_id(conn, CURRENT_PATCH_VERSION, CURRENT_PATCH_BUILD)


# ---------------------------------------------------------------------------
# Admin CRUD
# ---------------------------------------------------------------------------


def _row_to_dict(row: Any) -> dict[str, Any]:
    """Map a benchmark_references row to a camelCase API dict."""
    return {
        "id": str(row.id),
        "matchup": row.matchup,
        "raceId": row.race_id,
        "metric": row.metric,
        "expected": float(row.expected),
        "windowMs": float(row.window_ms),
        "notes": row.notes,
        "provenance": row.provenance,
        "confidence": row.confidence,
        "patchId": str(row.patch_id) if row.patch_id else None,
        "createdAt": row.created_at.isoformat() if row.created_at else "",
        "updatedAt": row.updated_at.isoformat() if row.updated_at else "",
    }


_ALL_COLUMNS = (
    _BENCHMARK_REFERENCES.c.id,
    _BENCHMARK_REFERENCES.c.matchup,
    _BENCHMARK_REFERENCES.c.race_id,
    _BENCHMARK_REFERENCES.c.metric,
    _BENCHMARK_REFERENCES.c.expected,
    _BENCHMARK_REFERENCES.c.window_ms,
    _BENCHMARK_REFERENCES.c.notes,
    _BENCHMARK_REFERENCES.c.provenance,
    _BENCHMARK_REFERENCES.c.confidence,
    _BENCHMARK_REFERENCES.c.patch_id,
    _BENCHMARK_REFERENCES.c.created_at,
    _BENCHMARK_REFERENCES.c.updated_at,
)


async def list_references(
    conn: AsyncConnection,
    matchup: str | None = None,
    race_id: str | None = None,
    metric: str | None = None,
) -> list[dict[str, Any]]:
    """List reference rows, optionally filtered, ordered for a stable table view."""
    stmt = sa.select(*_ALL_COLUMNS)
    if matchup is not None:
        stmt = stmt.where(_BENCHMARK_REFERENCES.c.matchup == matchup)
    if race_id is not None:
        stmt = stmt.where(_BENCHMARK_REFERENCES.c.race_id == race_id)
    if metric is not None:
        stmt = stmt.where(_BENCHMARK_REFERENCES.c.metric == metric)
    stmt = stmt.order_by(
        _BENCHMARK_REFERENCES.c.matchup,
        _BENCHMARK_REFERENCES.c.race_id,
        _BENCHMARK_REFERENCES.c.metric,
    )
    rows = (await conn.execute(stmt)).fetchall()
    return [_row_to_dict(r) for r in rows]


async def get_reference_row(
    conn: AsyncConnection,
    ref_id: str,
) -> dict[str, Any] | None:
    """Fetch one reference row by id, or None."""
    row = (
        await conn.execute(
            sa.select(*_ALL_COLUMNS).where(_BENCHMARK_REFERENCES.c.id == ref_id)
        )
    ).fetchone()
    return _row_to_dict(row) if row is not None else None


async def create_reference(
    conn: AsyncConnection,
    *,
    matchup: str,
    race_id: str,
    metric: str,
    expected: float,
    window_ms: float,
    notes: str | None,
    provenance: str,
    confidence: str | None,
    patch_id: str | None,
) -> dict[str, Any]:
    """Insert a new reference row and return it. Raises on unique-key clash."""
    row = (
        await conn.execute(
            sa.insert(_BENCHMARK_REFERENCES)
            .values(
                matchup=matchup,
                race_id=race_id,
                metric=metric,
                expected=expected,
                window_ms=window_ms,
                notes=notes,
                provenance=provenance,
                confidence=confidence,
                patch_id=patch_id,
            )
            .returning(*_ALL_COLUMNS)
        )
    ).fetchone()
    assert row is not None  # INSERT ... RETURNING always yields a row
    return _row_to_dict(row)


async def update_reference(
    conn: AsyncConnection,
    ref_id: str,
    *,
    expected: float,
    window_ms: float,
    notes: str | None,
    provenance: str,
    confidence: str | None,
) -> dict[str, Any] | None:
    """
    Update the editable fields of a reference row and bump updated_at.

    The identity columns (matchup, race_id, metric, patch_id) are intentionally
    NOT editable — change identity by deleting + re-creating, so the unique key
    stays coherent. Returns the updated row, or None if the id does not exist.
    """
    row = (
        await conn.execute(
            sa.update(_BENCHMARK_REFERENCES)
            .where(_BENCHMARK_REFERENCES.c.id == ref_id)
            .values(
                expected=expected,
                window_ms=window_ms,
                notes=notes,
                provenance=provenance,
                confidence=confidence,
                updated_at=sa.func.now(),
            )
            .returning(*_ALL_COLUMNS)
        )
    ).fetchone()
    return _row_to_dict(row) if row is not None else None


async def delete_reference(conn: AsyncConnection, ref_id: str) -> bool:
    """Delete a reference row. Returns True if a row was deleted."""
    result = await conn.execute(
        sa.delete(_BENCHMARK_REFERENCES).where(
            _BENCHMARK_REFERENCES.c.id == ref_id
        )
    )
    return bool(result.rowcount)
