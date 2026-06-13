"""
Replays browser API.

GET /replays — list every replay in the DB (personal + pro/reference), with a
derived matchup, players, duration, status, and progress flags (hasReport,
hasExample). Powers the /replays dashboard that doubles as the curation surface.

Read-only; core-style SQLAlchemy (mirrors the other api-py DB layers).
"""

from __future__ import annotations

from typing import Literal

import sqlalchemy as sa
from fastapi import APIRouter, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.dialects.postgresql import UUID

from app.benchmarks.db import get_engine
from app.benchmarks.references import infer_matchup_code

router = APIRouter(tags=["replays"])

_RACE_SHORT = {
    "orc": "O",
    "human": "H",
    "nightelf": "NE",
    "undead": "UD",
    "random": "R",
}

_REPLAYS = sa.table(
    "replays",
    sa.column("id", UUID(as_uuid=False)),
    sa.column("map_id", sa.Text),
    sa.column("duration_ms", sa.Integer),
    sa.column("status", sa.Text),
    sa.column("is_reference", sa.Boolean),
    sa.column("created_at", sa.DateTime(timezone=True)),
)

_REPLAY_PLAYERS = sa.table(
    "replay_players",
    sa.column("replay_id", UUID(as_uuid=False)),
    sa.column("slot", sa.Integer),
    sa.column("player_name", sa.Text),
    sa.column("race_id", sa.Text),
    sa.column("result", sa.Text),
)

_COACH_REPORTS = sa.table(
    "coach_reports",
    sa.column("replay_id", UUID(as_uuid=False)),
)

_TRAINING_EXAMPLES = sa.table(
    "training_examples",
    sa.column("replay_id", UUID(as_uuid=False)),
    sa.column("status", sa.Text),
)


class PlayerLite(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    slot: int = Field(alias="slot")
    player_name: str = Field(alias="playerName")
    race_id: str = Field(alias="raceId")
    result: str = Field(alias="result")


class ReplaySummary(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    replay_id: str = Field(alias="replayId")
    matchup: str = Field(alias="matchup")
    duration_ms: int | None = Field(default=None, alias="durationMs")
    status: str = Field(alias="status")
    is_reference: bool = Field(alias="isReference")
    players: list[PlayerLite] = Field(alias="players")
    has_report: bool = Field(alias="hasReport")
    has_example: bool = Field(alias="hasExample")
    example_status: str | None = Field(default=None, alias="exampleStatus")
    created_at: str = Field(alias="createdAt")


def _race(race_id: str | None) -> str:
    return (race_id or "").replace("race:", "")


def _short(race_id: str | None) -> str:
    r = _race(race_id)
    return _RACE_SHORT.get(r, r.upper() or "?")


def _matchup_for(players: list[PlayerLite]) -> str:
    """Derive a matchup label; the Orc-first canonical code when recognised."""
    if len(players) != 2:  # noqa: PLR2004
        return "—"
    p0, p1 = players[0], players[1]
    code = infer_matchup_code(_race(p0.race_id), _race(p1.race_id))
    if code:
        return code
    return f"{_short(p0.race_id)}v{_short(p1.race_id)}"


@router.get(
    "/replays",
    response_model=list[ReplaySummary],
    summary="List all replays (personal + reference) for the browser",
    description=(
        "Returns every replay in the DB with a derived matchup, players, status, "
        "and progress flags. ?reference=true|false filters by reference/personal."
    ),
)
async def list_replays(
    reference: bool | None = Query(default=None),
    status: Literal["pending", "parsing", "done", "error"] | None = Query(
        default=None
    ),
) -> list[ReplaySummary]:
    engine = get_engine()
    async with engine.connect() as conn:
        where: list[sa.ColumnElement[bool]] = []
        if reference is not None:
            where.append(_REPLAYS.c.is_reference.is_(reference))
        if status is not None:
            where.append(_REPLAYS.c.status == status)

        stmt = sa.select(
            _REPLAYS.c.id,
            _REPLAYS.c.duration_ms,
            _REPLAYS.c.status,
            _REPLAYS.c.is_reference,
            _REPLAYS.c.created_at,
        ).order_by(_REPLAYS.c.created_at.desc())
        if where:
            stmt = stmt.where(sa.and_(*where))
        replay_rows = (await conn.execute(stmt)).fetchall()

        player_rows = (
            await conn.execute(
                sa.select(
                    _REPLAY_PLAYERS.c.replay_id,
                    _REPLAY_PLAYERS.c.slot,
                    _REPLAY_PLAYERS.c.player_name,
                    _REPLAY_PLAYERS.c.race_id,
                    _REPLAY_PLAYERS.c.result,
                ).order_by(_REPLAY_PLAYERS.c.slot)
            )
        ).fetchall()

        report_ids = {
            str(r.replay_id)
            for r in (
                await conn.execute(sa.select(_COACH_REPORTS.c.replay_id))
            ).fetchall()
        }
        # training_examples arrives in Phase 2 (migration 0008); tolerate its
        # absence so the browser works before curation is wired.
        example_status: dict[str, str] = {}
        try:
            example_status = {
                str(r.replay_id): r.status
                for r in (
                    await conn.execute(
                        sa.select(
                            _TRAINING_EXAMPLES.c.replay_id,
                            _TRAINING_EXAMPLES.c.status,
                        )
                    )
                ).fetchall()
            }
        except Exception:  # noqa: BLE001 — table may not exist yet
            await conn.rollback()

    players_by_replay: dict[str, list[PlayerLite]] = {}
    for r in player_rows:
        players_by_replay.setdefault(str(r.replay_id), []).append(
            PlayerLite(
                slot=r.slot,
                playerName=r.player_name,
                raceId=r.race_id or "",
                result=r.result or "unknown",
            )
        )

    out: list[ReplaySummary] = []
    for r in replay_rows:
        rid = str(r.id)
        players = players_by_replay.get(rid, [])
        out.append(
            ReplaySummary(
                replayId=rid,
                matchup=_matchup_for(players),
                durationMs=r.duration_ms,
                status=r.status,
                isReference=bool(r.is_reference),
                players=players,
                hasReport=rid in report_ids,
                hasExample=rid in example_status,
                exampleStatus=example_status.get(rid),
                createdAt=r.created_at.isoformat() if r.created_at else "",
            )
        )
    return out
