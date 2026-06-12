"""
Unit tests for the Orc supply reconstruction / supply-block metric (econ.py).

Pure, no DB. Verifies the supply curve, block detection, severity thresholds,
and the supply_block_approx metric (Orc-only).
"""

from __future__ import annotations

from app.benchmarks.econ import (
    BURROW_FOOD,
    FOOD_CAP,
    HERO_FOOD,
    MAIN_HALL_FOOD,
    find_supply_blocks,
    reconstruct_supply,
    severity_for_supply_block,
    supply_block_approx,
)
from app.benchmarks.models import PlayerInfo, TimelineEvent

ORC = PlayerInfo(
    slot=1, race_id="race:orc", player_name="Orc", apm=80.0, result="loss"
)
NE = PlayerInfo(
    slot=2, race_id="race:nightelf", player_name="NE", apm=90.0, result="win"
)


def _ev(slot: int, t_ms: int, etype: str, ref: str) -> TimelineEvent:
    return TimelineEvent(
        slot=slot, t_ms=t_ms, event_type=etype, entity_ref=ref, payload={}  # type: ignore[arg-type]
    )


class TestConstants:
    def test_verified_constants(self) -> None:
        # Locked to the deep-research-verified values (patch 2.0).
        assert MAIN_HALL_FOOD == 11
        assert BURROW_FOOD == 10
        assert HERO_FOOD == 5
        assert FOOD_CAP == 100


class TestReconstructSupply:
    def test_starting_state(self) -> None:
        pts = reconstruct_supply([], slot=1, game_duration_ms=600_000)
        assert pts[0].t_ms == 0
        assert pts[0].used == 5  # 5 starting peons
        assert pts[0].cap == 11  # starting Great Hall

    def test_train_adds_food_at_command(self) -> None:
        evs = [_ev(1, 10_000, "train", "unit:grunt")]  # grunt = 3 food
        pts = reconstruct_supply(evs, slot=1, game_duration_ms=600_000)
        assert pts[-1].used == 5 + 3
        assert pts[-1].t_ms == 10_000

    def test_hero_adds_5_supply_once(self) -> None:
        evs = [
            _ev(1, 60_000, "hero_level", "hero:far_seer"),
            _ev(1, 120_000, "hero_level", "hero:far_seer"),  # same hero leveling
        ]
        pts = reconstruct_supply(evs, slot=1, game_duration_ms=600_000)
        # +5 only once (the hero already exists on subsequent level-ups)
        assert pts[-1].used == 5 + 5

    def test_burrow_adds_cap_on_completion(self) -> None:
        evs = [_ev(1, 5_000, "build", "building:orc_burrow")]  # completes 5+35=40s
        pts = reconstruct_supply(evs, slot=1, game_duration_ms=600_000)
        # cap delta applied at 40_000, not 5_000
        last = pts[-1]
        assert last.t_ms == 40_000
        assert last.cap == 11 + 10

    def test_second_great_hall_adds_main_hall_food(self) -> None:
        evs = [_ev(1, 100_000, "build", "building:great_hall")]  # completes +100s
        pts = reconstruct_supply(evs, slot=1, game_duration_ms=600_000)
        assert pts[-1].cap == 11 + 11

    def test_cap_clamped_to_100(self) -> None:
        # 10 burrows would be 11 + 100 = 111 → clamp to 100
        evs = [
            _ev(1, 1_000 + i * 100, "build", "building:orc_burrow")
            for i in range(10)
        ]
        pts = reconstruct_supply(evs, slot=1, game_duration_ms=600_000)
        assert pts[-1].cap == FOOD_CAP


class TestFindSupplyBlocks:
    def test_detects_block_until_burrow_completes(self) -> None:
        # Burrow at 5s completes at 40s. Train grunts to hit the cap (11) at 12s.
        evs = [
            _ev(1, 5_000, "build", "building:orc_burrow"),  # cap 11→21 at 40s
            _ev(1, 10_000, "train", "unit:grunt"),  # used 5→8
            _ev(1, 12_000, "train", "unit:grunt"),  # used 8→11 == cap → blocked
        ]
        pts = reconstruct_supply(evs, slot=1, game_duration_ms=600_000)
        blocks = find_supply_blocks(pts)
        assert len(blocks) == 1
        assert blocks[0].start_ms == 12_000
        assert blocks[0].end_ms == 40_000
        assert blocks[0].duration_ms == 28_000

    def test_no_block_when_under_cap(self) -> None:
        evs = [_ev(1, 10_000, "train", "unit:grunt")]  # used 8 < cap 11
        pts = reconstruct_supply(evs, slot=1, game_duration_ms=600_000)
        assert find_supply_blocks(pts) == []

    def test_at_100_hard_cap_is_not_a_block(self) -> None:
        # Reach exactly 100 food via burrows + many units → cap == 100 is NOT a
        # coachable burrow-block (it's max army), so it must be ignored.
        evs: list[TimelineEvent] = []
        # 9 burrows (cap 11 + 90 = 101 → clamp 100), all complete early.
        for i in range(9):
            evs.append(_ev(1, 1_000 + i * 100, "build", "building:orc_burrow"))
        # Train enough taurens (5 food) to reach 100 used.
        for i in range(19):
            evs.append(_ev(1, 50_000 + i * 100, "train", "unit:tauren"))  # 5+95=100
        pts = reconstruct_supply(evs, slot=1, game_duration_ms=600_000)
        # used hits 100 and cap is 100 → cap < 100 is False → no block flagged.
        assert find_supply_blocks(pts) == []


class TestSeverity:
    def test_thresholds(self) -> None:
        assert severity_for_supply_block(5_000) == "info"
        assert severity_for_supply_block(15_000) == "minor"
        assert severity_for_supply_block(30_000) == "major"
        assert severity_for_supply_block(60_000) == "critical"


class TestSupplyBlockMetric:
    def test_orc_block_surfaces(self) -> None:
        evs = [
            _ev(1, 5_000, "build", "building:orc_burrow"),
            _ev(1, 10_000, "train", "unit:grunt"),
            _ev(1, 12_000, "train", "unit:grunt"),
        ]
        r = supply_block_approx(evs, ORC, "rid", game_duration_ms=600_000)
        assert r.metric == "supply_block_approx"
        assert r.value == 28_000.0
        assert r.severity == "major"

    def test_non_orc_is_info_zero(self) -> None:
        r = supply_block_approx([], NE, "rid", game_duration_ms=600_000)
        assert r.value == 0.0
        assert r.severity == "info"

    def test_orc_no_block_is_info(self) -> None:
        r = supply_block_approx([], ORC, "rid", game_duration_ms=600_000)
        assert r.value == 0.0
        assert r.severity == "info"
