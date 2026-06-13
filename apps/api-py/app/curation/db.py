"""
DB layer for the curation pipeline (training_examples table).

Core-style SQLAlchemy + asyncpg, mirroring the other api-py DB layers. Stores
the captured prompt messages (input) and curated gold tips (output) as JSONB.
"""

from __future__ import annotations

import json
from typing import Any

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncConnection

from app.benchmarks.db import get_engine as _get_engine

get_engine = _get_engine

_TRAINING_EXAMPLES = sa.table(
    "training_examples",
    sa.column("id", UUID(as_uuid=False)),
    sa.column("replay_id", UUID(as_uuid=False)),
    sa.column("matchup", sa.Text),
    sa.column("map_name", sa.Text),
    sa.column("result", sa.Text),
    sa.column("input_messages", sa.JSON),
    sa.column("output_tips", sa.JSON),
    sa.column("status", sa.Text),
    sa.column("notes", sa.Text),
    sa.column("created_at", sa.DateTime(timezone=True)),
    sa.column("updated_at", sa.DateTime(timezone=True)),
)


def _as_list(raw: Any) -> list[Any]:
    """asyncpg decodes JSONB to Python; tolerate a JSON string too."""
    if raw is None:
        return []
    if isinstance(raw, str):
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, list) else []
    if isinstance(raw, list):
        return raw
    return []


def _row_to_dict(row: Any) -> dict[str, Any]:
    return {
        "replayId": str(row.replay_id),
        "matchup": row.matchup,
        "mapName": row.map_name,
        "result": row.result,
        "inputMessages": _as_list(row.input_messages),
        "outputTips": _as_list(row.output_tips),
        "status": row.status,
        "notes": row.notes,
        "createdAt": row.created_at.isoformat() if row.created_at else "",
        "updatedAt": row.updated_at.isoformat() if row.updated_at else "",
    }


async def upsert_draft(
    conn: AsyncConnection,
    *,
    replay_id: str,
    matchup: str | None,
    map_name: str | None,
    result: str | None,
    input_messages: list[dict[str, Any]],
    output_tips: list[dict[str, Any]],
) -> dict[str, Any]:
    """
    Create or refresh a draft example for a replay.

    On conflict (replay already has an example) we refresh the captured
    input_messages + denormalized context and bump updated_at, but we do NOT
    overwrite output_tips or status — so re-drafting never clobbers human edits.
    A fresh row seeds output_tips from the deterministic facts.
    """
    stmt = pg_insert(_TRAINING_EXAMPLES).values(
        replay_id=replay_id,
        matchup=matchup,
        map_name=map_name,
        result=result,
        input_messages=input_messages,
        output_tips=output_tips,
        status="draft",
    )
    upsert = stmt.on_conflict_do_update(
        index_elements=[_TRAINING_EXAMPLES.c.replay_id],
        set_={
            "input_messages": stmt.excluded.input_messages,
            "matchup": stmt.excluded.matchup,
            "map_name": stmt.excluded.map_name,
            "result": stmt.excluded.result,
            "updated_at": sa.func.now(),
        },
    ).returning(*_TRAINING_EXAMPLES.c)
    row = (await conn.execute(upsert)).fetchone()
    assert row is not None
    return _row_to_dict(row)


async def get_example(
    conn: AsyncConnection, replay_id: str
) -> dict[str, Any] | None:
    row = (
        await conn.execute(
            sa.select(*_TRAINING_EXAMPLES.c).where(
                _TRAINING_EXAMPLES.c.replay_id == replay_id
            )
        )
    ).fetchone()
    return _row_to_dict(row) if row is not None else None


async def update_example(
    conn: AsyncConnection,
    replay_id: str,
    *,
    output_tips: list[dict[str, Any]],
    status: str,
    notes: str | None,
) -> dict[str, Any] | None:
    row = (
        await conn.execute(
            sa.update(_TRAINING_EXAMPLES)
            .where(_TRAINING_EXAMPLES.c.replay_id == replay_id)
            .values(
                output_tips=output_tips,
                status=status,
                notes=notes,
                updated_at=sa.func.now(),
            )
            .returning(*_TRAINING_EXAMPLES.c)
        )
    ).fetchone()
    return _row_to_dict(row) if row is not None else None


async def list_examples(conn: AsyncConnection) -> list[dict[str, Any]]:
    rows = (
        await conn.execute(
            sa.select(
                _TRAINING_EXAMPLES.c.replay_id,
                _TRAINING_EXAMPLES.c.matchup,
                _TRAINING_EXAMPLES.c.map_name,
                _TRAINING_EXAMPLES.c.result,
                _TRAINING_EXAMPLES.c.output_tips,
                _TRAINING_EXAMPLES.c.status,
                _TRAINING_EXAMPLES.c.updated_at,
            ).order_by(_TRAINING_EXAMPLES.c.updated_at.desc())
        )
    ).fetchall()
    return [
        {
            "replayId": str(r.replay_id),
            "matchup": r.matchup,
            "mapName": r.map_name,
            "result": r.result,
            "status": r.status,
            "tipCount": len(_as_list(r.output_tips)),
            "updatedAt": r.updated_at.isoformat() if r.updated_at else "",
        }
        for r in rows
    ]


async def list_approved(conn: AsyncConnection) -> list[dict[str, Any]]:
    """Approved examples with full input/output, for JSONL export."""
    rows = (
        await conn.execute(
            sa.select(*_TRAINING_EXAMPLES.c)
            .where(_TRAINING_EXAMPLES.c.status == "approved")
            .order_by(_TRAINING_EXAMPLES.c.created_at)
        )
    ).fetchall()
    return [_row_to_dict(r) for r in rows]
