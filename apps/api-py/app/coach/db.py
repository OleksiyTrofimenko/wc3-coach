"""
DB layer for the LLM coach (T5.3).

Responsibilities
----------------
1. load_replay_meta(conn, replay_id) -> dict[str, str | None]
   Load the map_id from the replays table (and any other coach-needed fields).
   Used to derive mapName for the CoachReport header.

2. upsert_report(conn, report, model)
   Idempotent: delete any existing coach_reports row for replay_id, then
   insert fresh.  replay_id has a UNIQUE index so one report per replay.
   Tips are stored as JSONB (list of dicts with camelCase keys matching CoachTip).

3. fetch_report(conn, replay_id) -> CoachReport | None
   Load the stored report and reconstruct the CoachReport pydantic model.
   Returns None if no report exists yet.

Pattern
-------
Mirrors app/benchmarks/db.py exactly:
  - SQLAlchemy async core-style (sa.table / sa.column — no ORM)
  - asyncpg driver
  - Engine re-uses the shared benchmarks engine (get_engine from benchmarks.db)
    to avoid spinning up a second pool for the same DATABASE_URL.
  - Same postgresql:// → postgresql+asyncpg:// rewrite is handled by benchmarks.db.

mapName derivation
------------------
The replays table stores map_id as the raw ontology ref, e.g.
"map:61_w3c_..._ShallowGrave_v1.5.w3x".  The maps table uses a separate
uuid PK (id) and a text key column that stores the same ontology ref format.
Strategy (documented in service.py):
  LEFT JOIN maps ON replays.map_id = maps.key → use maps.name if found
  else strip the "map:" prefix from map_id
  else "Unknown"
"""

from __future__ import annotations

import json
from typing import Any

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.asyncio import AsyncConnection

from app.benchmarks.db import get_engine as _get_engine
from app.coach.models import CoachReport, CoachTip

# Re-export for callers that want a single import point
get_engine = _get_engine

# ---------------------------------------------------------------------------
# Table definitions (core-style — no ORM)
# ---------------------------------------------------------------------------

_REPLAYS = sa.table(
    "replays",
    sa.column("id", UUID(as_uuid=False)),
    sa.column("map_id", sa.Text),
)

_MAPS = sa.table(
    "maps",
    sa.column("id", UUID(as_uuid=False)),
    sa.column("key", sa.Text),
    sa.column("name", sa.Text),
)

_COACH_REPORTS = sa.table(
    "coach_reports",
    sa.column("id", UUID(as_uuid=False)),
    sa.column("replay_id", UUID(as_uuid=False)),
    sa.column("matchup", sa.Text),
    sa.column("map_name", sa.Text),
    sa.column("result", sa.Text),
    sa.column("duration_ms", sa.Integer),
    sa.column("tips", sa.JSON),
    sa.column("model", sa.Text),
    sa.column("created_at", sa.DateTime(timezone=True)),
)

_TIP_FEEDBACK = sa.table(
    "tip_feedback",
    sa.column("id", UUID(as_uuid=False)),
    sa.column("replay_id", UUID(as_uuid=False)),
    sa.column("tip_priority", sa.Integer),
    sa.column("verdict", sa.Text),
    sa.column("category", sa.Text),
    sa.column("note", sa.Text),
    sa.column("created_at", sa.DateTime(timezone=True)),
)

# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def load_replay_meta(
    conn: AsyncConnection,
    replay_id: str,
) -> dict[str, Any]:
    """
    Load replay metadata needed for CoachReport header fields.

    Performs a LEFT JOIN replays → maps to resolve map_id → map name.

    Returns
    -------
    dict with keys:
        map_id   : raw map_id string, e.g. "map:61_w3c_..._ShallowGrave_v1.5.w3x"
        map_name : resolved human-readable name; fallback logic applied here:
                   1. maps.name if a maps row exists for this map_id
                   2. strip "map:" prefix from map_id
                   3. "Unknown"

    Raises
    ------
    ValueError
        If the replay_id does not exist in the replays table.
        (load_replay_timeline in benchmarks/db.py also raises this; we mirror it
        so callers get a consistent 404 signal.)
    """
    row = (
        await conn.execute(
            sa.select(
                _REPLAYS.c.map_id,
                _MAPS.c.name.label("map_name"),
            )
            .select_from(
                _REPLAYS.outerjoin(
                    _MAPS,
                    _REPLAYS.c.map_id == _MAPS.c.key,
                )
            )
            .where(_REPLAYS.c.id == replay_id)
        )
    ).fetchone()

    if row is None:
        raise ValueError(f"Replay not found: {replay_id!r}")

    map_id: str = row.map_id or ""
    map_name: str | None = row.map_name  # None if LEFT JOIN produced no match

    if map_name:
        resolved_name = map_name
    elif map_id:
        # Strip the "map:" prefix if present
        resolved_name = map_id.removeprefix("map:")
    else:
        resolved_name = "Unknown"

    return {
        "map_id": map_id,
        "map_name": resolved_name,
    }


def _tips_to_jsonb(tips: list[CoachTip]) -> list[dict[str, Any]]:
    """
    Serialise CoachTip list to a JSON-compatible list of dicts.

    Uses camelCase aliases (matching the TS contract) and omits None fields
    (tMs, relatedBenchmarks) so the JSONB stays compact.
    """
    result: list[dict[str, Any]] = []
    for tip in tips:
        d: dict[str, Any] = {
            "priority": tip.priority,
            "title": tip.title,
            "detail": tip.detail,
        }
        if tip.t_ms is not None:
            d["tMs"] = tip.t_ms
        if tip.related_benchmarks is not None:
            d["relatedBenchmarks"] = tip.related_benchmarks
        result.append(d)
    return result


def _tips_from_jsonb(raw: Any) -> list[CoachTip]:
    """
    Deserialise JSONB tips back into CoachTip models.

    raw is either a Python list (asyncpg decodes JSONB automatically) or
    a JSON string (fallback for any driver that returns text).
    """
    if isinstance(raw, str):
        raw = json.loads(raw)
    tips: list[CoachTip] = []
    for d in raw:
        tips.append(
            CoachTip(
                priority=d["priority"],
                title=d["title"],
                detail=d["detail"],
                tMs=d.get("tMs"),
                relatedBenchmarks=d.get("relatedBenchmarks"),
            )
        )
    return tips


async def upsert_report(
    conn: AsyncConnection,
    report: CoachReport,
    model: str,
) -> None:
    """
    Idempotent upsert: delete existing report for replay_id, then insert fresh.

    The coach_reports table has a UNIQUE INDEX on replay_id (migration 0004).
    We use DELETE + INSERT rather than ON CONFLICT UPDATE to ensure the JSONB
    tips are fully replaced (no partial-merge semantics).

    Parameters
    ----------
    conn:
        Active async connection, must be inside a transaction (begin()).
    report:
        The CoachReport to persist.
    model:
        Ollama model tag used to generate this report (for auditing/debugging).
    """
    # Delete previous report (if any) for this replay
    await conn.execute(
        sa.delete(_COACH_REPORTS).where(
            _COACH_REPORTS.c.replay_id == report.replay_id
        )
    )

    await conn.execute(
        sa.insert(_COACH_REPORTS).values(
            replay_id=report.replay_id,
            matchup=report.matchup,
            map_name=report.map_name,
            result=report.result,
            duration_ms=report.duration_ms,
            tips=_tips_to_jsonb(report.tips),
            model=model,
        )
    )


async def fetch_report(
    conn: AsyncConnection,
    replay_id: str,
) -> CoachReport | None:
    """
    Load the stored CoachReport for replay_id, or None if not yet generated.

    Parameters
    ----------
    conn:
        Active async connection (read-only).
    replay_id:
        UUID string of the replay.

    Returns
    -------
    CoachReport | None
        Fully reconstructed CoachReport, or None if no row exists for replay_id.
        (The caller is responsible for distinguishing "no report yet" from
        "replay not found" — check with load_replay_timeline first if needed.)
    """
    row = (
        await conn.execute(
            sa.select(
                _COACH_REPORTS.c.replay_id,
                _COACH_REPORTS.c.matchup,
                _COACH_REPORTS.c.map_name,
                _COACH_REPORTS.c.result,
                _COACH_REPORTS.c.duration_ms,
                _COACH_REPORTS.c.tips,
            )
            .where(_COACH_REPORTS.c.replay_id == replay_id)
        )
    ).fetchone()

    if row is None:
        return None

    return CoachReport(
        replayId=str(row.replay_id),
        matchup=row.matchup,
        mapName=row.map_name,
        result=row.result,
        durationMs=row.duration_ms,
        tips=_tips_from_jsonb(row.tips),
    )


# ---------------------------------------------------------------------------
# Review / feedback layer (replay history + tip feedback)
# ---------------------------------------------------------------------------


async def list_reports(conn: AsyncConnection) -> list[dict[str, Any]]:
    """
    Return all coach reports as summary rows for the analyzed-replay history,
    newest first. Each row carries tip_count and feedback_count so the UI can
    show "3 tips · 2 flags" without a second query.
    """
    fb_count = (
        sa.select(
            _TIP_FEEDBACK.c.replay_id,
            sa.func.count().label("feedback_count"),
        )
        .group_by(_TIP_FEEDBACK.c.replay_id)
        .subquery()
    )
    rows = (
        await conn.execute(
            sa.select(
                _COACH_REPORTS.c.replay_id,
                _COACH_REPORTS.c.matchup,
                _COACH_REPORTS.c.map_name,
                _COACH_REPORTS.c.result,
                _COACH_REPORTS.c.duration_ms,
                _COACH_REPORTS.c.created_at,
                _COACH_REPORTS.c.tips,
                sa.func.coalesce(fb_count.c.feedback_count, 0).label(
                    "feedback_count"
                ),
            )
            .select_from(
                _COACH_REPORTS.outerjoin(
                    fb_count, _COACH_REPORTS.c.replay_id == fb_count.c.replay_id
                )
            )
            .order_by(_COACH_REPORTS.c.created_at.desc())
        )
    ).fetchall()

    result: list[dict[str, Any]] = []
    for row in rows:
        tips = row.tips if isinstance(row.tips, list) else json.loads(row.tips or "[]")
        result.append(
            {
                "replayId": str(row.replay_id),
                "matchup": row.matchup,
                "mapName": row.map_name,
                "result": row.result,
                "durationMs": row.duration_ms,
                "createdAt": row.created_at.isoformat() if row.created_at else "",
                "tipCount": len(tips),
                "feedbackCount": int(row.feedback_count),
            }
        )
    return result


async def insert_feedback(
    conn: AsyncConnection,
    replay_id: str,
    tip_priority: int | None,
    verdict: str,
    category: str | None,
    note: str | None,
) -> dict[str, Any]:
    """Insert one feedback row and return it (camelCase dict)."""
    row = (
        await conn.execute(
            sa.insert(_TIP_FEEDBACK)
            .values(
                replay_id=replay_id,
                tip_priority=tip_priority,
                verdict=verdict,
                category=category,
                note=note,
            )
            .returning(
                _TIP_FEEDBACK.c.id,
                _TIP_FEEDBACK.c.created_at,
            )
        )
    ).fetchone()

    assert row is not None  # INSERT ... RETURNING always yields a row
    return {
        "id": str(row.id),
        "replayId": replay_id,
        "tipPriority": tip_priority,
        "verdict": verdict,
        "category": category,
        "note": note,
        "createdAt": row.created_at.isoformat() if row.created_at else "",
    }


async def list_feedback(
    conn: AsyncConnection,
    replay_id: str,
) -> list[dict[str, Any]]:
    """Return all feedback rows for a replay, newest first (camelCase dicts)."""
    rows = (
        await conn.execute(
            sa.select(
                _TIP_FEEDBACK.c.id,
                _TIP_FEEDBACK.c.tip_priority,
                _TIP_FEEDBACK.c.verdict,
                _TIP_FEEDBACK.c.category,
                _TIP_FEEDBACK.c.note,
                _TIP_FEEDBACK.c.created_at,
            )
            .where(_TIP_FEEDBACK.c.replay_id == replay_id)
            .order_by(_TIP_FEEDBACK.c.created_at.desc())
        )
    ).fetchall()

    return [
        {
            "id": str(row.id),
            "replayId": replay_id,
            "tipPriority": row.tip_priority,
            "verdict": row.verdict,
            "category": row.category,
            "note": row.note,
            "createdAt": row.created_at.isoformat() if row.created_at else "",
        }
        for row in rows
    ]
