"""
DB layer for the benchmark engine.

Responsibilities:
  1. load_replay_timeline(db, replay_id)
     Load game_events + replay_players rows from Postgres into in-memory
     TimelineEvent / PlayerInfo objects.

  2. persist_benchmarks(db, replay_id, results)
     Delete existing benchmark rows for the replay (idempotent re-run),
     then insert the new BenchmarkResult list.

  3. fetch_benchmarks(db, replay_id)
     Load existing benchmark rows for a replay (used by GET endpoint).

This module is the ONLY place in the benchmark package that touches the DB.
Pure metric functions (metrics.py, engine.py) have zero DB dependency.

Uses SQLAlchemy async (core-style) + asyncpg.
DATABASE_URL is read from the environment (set in .env / docker-compose).
"""

from __future__ import annotations

import os
from typing import Any

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncConnection, create_async_engine

from app.benchmarks.models import BenchmarkResult, PlayerInfo, TimelineEvent

# ---------------------------------------------------------------------------
# Engine factory
# ---------------------------------------------------------------------------

def _make_engine() -> Any:
    url = os.environ.get("DATABASE_URL", "")
    if not url:
        raise RuntimeError(
            "DATABASE_URL is not set. "
            "Copy .env.example to .env and start docker compose."
        )
    # asyncpg requires postgresql+asyncpg:// scheme
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return create_async_engine(url, pool_pre_ping=True)


# Lazily created on first use so import does not fail without a DB
_engine: Any = None


def get_engine() -> Any:
    global _engine  # noqa: PLW0603
    if _engine is None:
        _engine = _make_engine()
    return _engine


# ---------------------------------------------------------------------------
# SQL helpers (core-style, no ORM — keeps it thin)
# ---------------------------------------------------------------------------

# game_events table (matches design doc §5.2)
_GAME_EVENTS = sa.table(
    "game_events",
    sa.column("replay_id", sa.Text),
    sa.column("slot", sa.Integer),
    sa.column("t_ms", sa.Integer),
    sa.column("type", sa.Text),
    sa.column("entity_ref", sa.Text),
    sa.column("payload_json", sa.JSON),
)

# replay_players table
_REPLAY_PLAYERS = sa.table(
    "replay_players",
    sa.column("replay_id", sa.Text),
    sa.column("slot", sa.Integer),
    sa.column("race_id", sa.Text),
    sa.column("player_name", sa.Text),
    sa.column("apm", sa.Float),
    sa.column("result", sa.Text),
)

# replays table (just the duration)
_REPLAYS = sa.table(
    "replays",
    sa.column("id", sa.Text),
    sa.column("duration", sa.Integer),
    sa.column("patch_id", sa.Text),
)

# benchmarks table (matches design doc §5.2)
_BENCHMARKS = sa.table(
    "benchmarks",
    sa.column("replay_id", sa.Text),
    sa.column("slot", sa.Integer),
    sa.column("metric", sa.Text),
    sa.column("value", sa.Float),
    sa.column("expected", sa.Float),
    sa.column("delta", sa.Float),
    sa.column("severity", sa.Text),
)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def load_replay_timeline(
    conn: AsyncConnection,
    replay_id: str,
) -> tuple[list[TimelineEvent], list[PlayerInfo], int, str]:
    """
    Load a replay's events + players from Postgres.

    Returns
    -------
    (events, players, game_duration_ms, patch_id)

    Raises
    ------
    ValueError if the replay_id does not exist in the replays table.
    """
    # Verify replay exists and get duration
    row = (await conn.execute(
        sa.select(_REPLAYS.c.duration, _REPLAYS.c.patch_id)
        .where(_REPLAYS.c.id == replay_id)
    )).fetchone()

    if row is None:
        raise ValueError(f"Replay not found: {replay_id!r}")

    game_duration_ms: int = row.duration or 0
    patch_id: str = row.patch_id or "patch:2.0"

    # Load players
    player_rows = (await conn.execute(
        sa.select(
            _REPLAY_PLAYERS.c.slot,
            _REPLAY_PLAYERS.c.race_id,
            _REPLAY_PLAYERS.c.player_name,
            _REPLAY_PLAYERS.c.apm,
            _REPLAY_PLAYERS.c.result,
        )
        .where(_REPLAY_PLAYERS.c.replay_id == replay_id)
        .order_by(_REPLAY_PLAYERS.c.slot)
    )).fetchall()

    players = [
        PlayerInfo(
            slot=r.slot,
            race_id=r.race_id,
            player_name=r.player_name,
            apm=float(r.apm or 0),
            result=r.result or "unknown",
        )
        for r in player_rows
    ]

    # Load events (only types the benchmark engine uses)
    relevant_types = (
        "build", "train", "upgrade", "learn_skill",
        "hero_level", "expand",
    )
    event_rows = (await conn.execute(
        sa.select(
            _GAME_EVENTS.c.slot,
            _GAME_EVENTS.c.t_ms,
            _GAME_EVENTS.c.type,
            _GAME_EVENTS.c.entity_ref,
            _GAME_EVENTS.c.payload_json,
        )
        .where(
            sa.and_(
                _GAME_EVENTS.c.replay_id == replay_id,
                _GAME_EVENTS.c.type.in_(relevant_types),
            )
        )
        .order_by(_GAME_EVENTS.c.t_ms)
    )).fetchall()

    events = [
        TimelineEvent(
            t_ms=r.t_ms,
            event_type=r.type,
            entity_ref=r.entity_ref or "",
            slot=r.slot,
            payload=r.payload_json or {},
        )
        for r in event_rows
    ]

    return events, players, game_duration_ms, patch_id


async def fetch_benchmarks(
    conn: AsyncConnection,
    replay_id: str,
) -> list[BenchmarkResult]:
    """
    Load existing benchmark rows for a replay (for the GET endpoint).

    Returns an empty list if none have been computed yet.
    """
    rows = (await conn.execute(
        sa.select(
            _BENCHMARKS.c.replay_id,
            _BENCHMARKS.c.slot,
            _BENCHMARKS.c.metric,
            _BENCHMARKS.c.value,
            _BENCHMARKS.c.expected,
            _BENCHMARKS.c.delta,
            _BENCHMARKS.c.severity,
        )
        .where(_BENCHMARKS.c.replay_id == replay_id)
        .order_by(_BENCHMARKS.c.slot, _BENCHMARKS.c.metric)
    )).fetchall()

    return [
        BenchmarkResult(
            replayId=r.replay_id,
            slot=r.slot,
            metric=r.metric,
            value=r.value,
            expected=r.expected,
            delta=r.delta,
            severity=r.severity,
        )
        for r in rows
    ]


async def persist_benchmarks(
    conn: AsyncConnection,
    replay_id: str,
    results: list[BenchmarkResult],
) -> None:
    """
    Idempotent upsert: delete existing benchmarks for replay_id, then insert.

    Using DELETE + INSERT (not UPSERT) for simplicity — benchmark runs are
    full re-computations, never partial.
    """
    await conn.execute(
        sa.delete(_BENCHMARKS).where(_BENCHMARKS.c.replay_id == replay_id)
    )

    if not results:
        return

    await conn.execute(
        sa.insert(_BENCHMARKS),
        [
            {
                "replay_id": r.replay_id,
                "slot": r.slot,
                "metric": r.metric,
                "value": r.value,
                "expected": r.expected,
                "delta": r.delta,
                "severity": r.severity,
            }
            for r in results
        ],
    )
