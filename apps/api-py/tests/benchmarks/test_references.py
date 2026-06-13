"""
Unit tests for DB-backed reference injection (pure layer, no DB).

These lock in the contract that makes the benchmark engine stay pure while the
reference values become curatable DB data: an injected reference table fully
overrides the in-code seed, and the engine threads it down to every metric.
"""

from __future__ import annotations

from app.benchmarks.engine import run_benchmarks
from app.benchmarks.models import PlayerInfo, TimelineEvent
from app.benchmarks.references import (
    ReferenceEntry,
    ReferenceTable,
    get_reference,
)

ORC = PlayerInfo(
    slot=1, race_id="race:orc", player_name="O", apm=80.0, result="win"
)
NE = PlayerInfo(
    slot=2, race_id="race:nightelf", player_name="N", apm=80.0, result="loss"
)


def _hero_at(slot: int, t_ms: int) -> TimelineEvent:
    return TimelineEvent(
        t_ms=t_ms,
        event_type="hero_level",
        entity_ref="hero:far_seer",
        slot=slot,
        payload={"level": 1},
    )


def test_get_reference_uses_seed_when_no_table() -> None:
    """Default (table=None) falls back to the in-code seed."""
    seed_ref = get_reference("OvNE", "orc", "first_hero_timing")
    assert seed_ref is not None
    assert seed_ref.expected == 62_000


def test_get_reference_injected_table_overrides_seed() -> None:
    """An injected table is consulted instead of the seed."""
    table: ReferenceTable = {
        ("OvNE", "orc", "first_hero_timing"): ReferenceEntry(
            expected=999_000, window_ms=15_000, notes="injected"
        )
    }
    ref = get_reference("OvNE", "orc", "first_hero_timing", table)
    assert ref is not None
    assert ref.expected == 999_000
    assert ref.notes == "injected"


def test_get_reference_injected_table_missing_key_returns_none() -> None:
    """A key absent from the injected table returns None (→ info severity)."""
    table: ReferenceTable = {}
    assert get_reference("OvNE", "orc", "first_hero_timing", table) is None


def test_run_benchmarks_threads_injected_references() -> None:
    """
    run_benchmarks must use the injected reference table, not the seed.

    Same hero timing, two different injected 'expected' values → different delta.
    """
    events = [_hero_at(1, 62_000), _hero_at(2, 62_000)]

    fast_table: ReferenceTable = {
        ("OvNE", "orc", "first_hero_timing"): ReferenceEntry(
            expected=30_000, window_ms=15_000, notes=""
        )
    }
    slow_table: ReferenceTable = {
        ("OvNE", "orc", "first_hero_timing"): ReferenceEntry(
            expected=90_000, window_ms=15_000, notes=""
        )
    }

    def _first_hero(references: ReferenceTable) -> object:
        out = run_benchmarks(
            events=events,
            players=[ORC, NE],
            game_duration_ms=300_000,
            replay_id="r",
            references=references,
        )
        return next(
            r for r in out if r.slot == 1 and r.metric == "first_hero_timing"
        )

    fast = _first_hero(fast_table)
    slow = _first_hero(slow_table)

    # value (62 000) is fixed; expected/delta follow the injected table.
    assert fast.expected == 30_000
    assert fast.delta == 32_000
    assert slow.expected == 90_000
    assert slow.delta == -28_000
