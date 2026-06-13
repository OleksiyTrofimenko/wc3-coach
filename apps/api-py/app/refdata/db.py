"""
DB layer for the reference-data pipeline.

- list_reference_replay_ids: which replays are flagged is_reference (pro data).
- upsert_observations: persist a replay's extracted observations (idempotent).
- recompute_pro_references: aggregate observations per (matchup,race,metric) for a
  patch and upsert provenance='pro' rows into benchmark_references IN PLACE.

Precedence on the in-place upsert: pro overwrites community/pro rows but NOT 'user'
rows (manual overrides are the highest authority — user > pro > community). The raw
observations are preserved regardless, so any aggregate is recomputable.

Core-style SQLAlchemy + asyncpg, mirroring references_db.py / benchmarks/db.py.
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncConnection

from app.benchmarks.references_db import (
    _BENCHMARK_REFERENCES,
    _is_uuid,
)
from app.refdata.aggregate import summarize
from app.refdata.extract import Observation

_REFERENCE_OBSERVATIONS = sa.table(
    "reference_observations",
    sa.column("id", UUID(as_uuid=False)),
    sa.column("matchup", sa.Text),
    sa.column("race_id", sa.Text),
    sa.column("metric", sa.Text),
    sa.column("value", sa.Float),
    sa.column("source_replay_id", UUID(as_uuid=False)),
    sa.column("player_name", sa.Text),
    sa.column("patch_id", UUID(as_uuid=False)),
)

_REPLAYS = sa.table(
    "replays",
    sa.column("id", UUID(as_uuid=False)),
    sa.column("status", sa.Text),
    sa.column("is_reference", sa.Boolean),
)


async def list_reference_replay_ids(conn: AsyncConnection) -> list[str]:
    """Return ids of replays flagged is_reference and fully parsed (status=done)."""
    rows = (
        await conn.execute(
            sa.select(_REPLAYS.c.id).where(
                sa.and_(
                    _REPLAYS.c.is_reference.is_(True),
                    _REPLAYS.c.status == "done",
                )
            )
        )
    ).fetchall()
    return [str(r.id) for r in rows]


async def mark_reference(conn: AsyncConnection, replay_id: str) -> None:
    """Flag a replay as reference/pro data."""
    await conn.execute(
        sa.update(_REPLAYS)
        .where(_REPLAYS.c.id == replay_id)
        .values(is_reference=True)
    )


async def upsert_observations(
    conn: AsyncConnection,
    replay_id: str,
    patch_id: str | None,
    observations: list[Observation],
) -> int:
    """
    Replace this replay's observations (delete-then-insert → idempotent re-run).

    Returns the number of observation rows written.
    """
    await conn.execute(
        sa.delete(_REFERENCE_OBSERVATIONS).where(
            _REFERENCE_OBSERVATIONS.c.source_replay_id == replay_id
        )
    )
    if not observations:
        return 0

    # patch_id may arrive as a UUID object from load_replay_timeline — stringify
    # before the uuid check (mirrors load_reference_table) or it nulls out.
    pid_str = str(patch_id) if patch_id is not None else None
    pid = pid_str if (pid_str is not None and _is_uuid(pid_str)) else None
    await conn.execute(
        sa.insert(_REFERENCE_OBSERVATIONS),
        [
            {
                "matchup": o.matchup,
                "race_id": o.race_id,
                "metric": o.metric,
                "value": o.value,
                "source_replay_id": replay_id,
                "player_name": o.player_name,
                "patch_id": pid,
            }
            for o in observations
        ],
    )
    return len(observations)


async def recompute_pro_references(
    conn: AsyncConnection,
    patch_id: str,
) -> list[tuple[str, str, str, int]]:
    """
    Aggregate observations for `patch_id` and upsert provenance='pro' references.

    Returns a list of (matchup, race, metric, n) for what was written/refreshed.
    """
    rows = (
        await conn.execute(
            sa.select(
                _REFERENCE_OBSERVATIONS.c.matchup,
                _REFERENCE_OBSERVATIONS.c.race_id,
                _REFERENCE_OBSERVATIONS.c.metric,
                _REFERENCE_OBSERVATIONS.c.value,
            ).where(_REFERENCE_OBSERVATIONS.c.patch_id == patch_id)
        )
    ).fetchall()

    grouped: dict[tuple[str, str, str], list[float]] = {}
    for r in rows:
        grouped.setdefault((r.matchup, r.race_id, r.metric), []).append(float(r.value))

    written: list[tuple[str, str, str, int]] = []
    for (matchup, race_id, metric), values in sorted(grouped.items()):
        summary = summarize(values)
        if summary is None:
            continue
        iqr = max(summary.p75 - summary.p25, 0.0)
        stmt = pg_insert(_BENCHMARK_REFERENCES).values(
            matchup=matchup,
            race_id=race_id,
            metric=metric,
            expected=summary.median,
            window_ms=iqr,
            notes=f"Pro aggregate of {summary.n} replay(s)",
            provenance="pro",
            confidence=None,
            sample_size=summary.n,
            dist={"p25": summary.p25, "p75": summary.p75},
            patch_id=patch_id,
        )
        stmt = stmt.on_conflict_do_update(
            constraint="benchmark_references_key_patch_uq",
            set_={
                "expected": stmt.excluded.expected,
                "window_ms": stmt.excluded.window_ms,
                "notes": stmt.excluded.notes,
                "provenance": stmt.excluded.provenance,
                "sample_size": stmt.excluded.sample_size,
                "dist": stmt.excluded.dist,
                "updated_at": sa.func.now(),
            },
            # user overrides win: never let a pro aggregate clobber a manual value.
            where=_BENCHMARK_REFERENCES.c.provenance != "user",
        )
        await conn.execute(stmt)
        written.append((matchup, race_id, metric, summary.n))

    return written
