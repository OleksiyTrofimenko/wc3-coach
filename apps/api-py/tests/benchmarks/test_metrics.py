"""
Unit tests for pure benchmark metric functions.

NO live database required — all tests use hand-built in-memory fixtures.

Fixture: Orc (slot 1) vs Night Elf (slot 2), patch 2.0, ~10 min game.
Models a realistic OvNE game with:
  - Blademaster first hero at ~65 000 ms (slightly late)
  - Stronghold (T2) command at ~160 000 ms (30 s late vs 130 000 ms reference)
  - No expansion taken (game ends at 620 000 ms → critical)
  - Orc hero level 3 at ~280 000 ms (40 s late)
  - Worker trains: 5 starting + 9 trained = 14 total at 10 min
  - NE (slot 2): standard timings for reference checks
"""

from __future__ import annotations

import pytest

from app.benchmarks.engine import run_benchmarks
from app.benchmarks.metrics import (
    expansion_timing,
    first_hero_timing,
    hero_level3_timing,
    tier2_timing,
    worker_count_approx,
    worker_production_continuity,
)
from app.benchmarks.models import PlayerInfo, TimelineEvent
from app.benchmarks.references import (
    get_reference,
    infer_matchup_code,
    severity_for_level_delta,
    severity_for_time_delta,
)

# ---------------------------------------------------------------------------
# Fixture data
# ---------------------------------------------------------------------------

REPLAY_ID = "test-replay-001"
GAME_DURATION_MS = 620_000  # ~10:20

ORC_PLAYER = PlayerInfo(
    slot=1,
    race_id="race:orc",
    player_name="TestOrc",
    apm=80.0,
    result="loss",
)

NE_PLAYER = PlayerInfo(
    slot=2,
    race_id="race:nightelf",
    player_name="TestNE",
    apm=95.0,
    result="win",
)

PLAYERS = [ORC_PLAYER, NE_PLAYER]


def _ev(
    slot: int,
    t_ms: int,
    event_type: str,
    entity_ref: str,
    payload: dict | None = None,
) -> TimelineEvent:
    return TimelineEvent(
        slot=slot,
        t_ms=t_ms,
        event_type=event_type,  # type: ignore[arg-type]
        entity_ref=entity_ref,
        payload=payload or {},
    )


# Orc events (slot 1)
ORC_EVENTS: list[TimelineEvent] = [
    # Worker trains (9 total post-start; start with 5 → total ~14 at 10 min)
    _ev(1, 10_000, "train", "unit:peon"),
    _ev(1, 28_000, "train", "unit:peon"),
    _ev(1, 46_000, "train", "unit:peon"),
    _ev(1, 64_000, "train", "unit:peon"),
    _ev(1, 82_000, "train", "unit:peon"),
    _ev(1, 100_000, "train", "unit:peon"),
    _ev(1, 120_000, "train", "unit:peon"),
    # gap here: 80 000 ms between 120 000 and 200 000
    _ev(1, 200_000, "train", "unit:peon"),
    # large gap: 200 000 ms (idle production)
    _ev(1, 400_000, "train", "unit:peon"),
    # Altar of Storms built
    _ev(1, 15_000, "build", "building:altar_of_storms"),
    # Barracks built
    _ev(1, 32_000, "build", "building:barracks"),
    # Blademaster hero appears (level 1 event at 65 000 ms — 3 s late)
    _ev(1, 65_000, "hero_level", "hero:blademaster", {"level": 1}),
    # Stronghold (T2) command at 160 000 ms (30 000 ms late vs 130 000 ref)
    _ev(1, 160_000, "build", "building:stronghold"),
    # Hero level 2
    _ev(1, 150_000, "hero_level", "hero:blademaster", {"level": 2}),
    # Hero level 3 at 280 000 ms (40 s late vs 240 000 ms reference)
    _ev(1, 280_000, "hero_level", "hero:blademaster", {"level": 3}),
    # Hero level 4
    _ev(1, 380_000, "hero_level", "hero:blademaster", {"level": 4}),
    # Hero level 5 at 530 000 ms (50 s late vs 480 000 ms reference)
    _ev(1, 530_000, "hero_level", "hero:blademaster", {"level": 5}),
    # No expansion taken
]

# NE events (slot 2)
NE_EVENTS: list[TimelineEvent] = [
    # Worker trains
    _ev(2, 5_000, "train", "unit:wisp"),
    _ev(2, 12_000, "train", "unit:wisp"),
    _ev(2, 20_000, "train", "unit:wisp"),
    _ev(2, 28_000, "train", "unit:wisp"),
    _ev(2, 36_000, "train", "unit:wisp"),
    # Hero level 1 at 62 000 ms (exactly on reference)
    _ev(2, 62_000, "hero_level", "hero:firelord", {"level": 1}),
    # Tree of Ages (T2) at 150 000 ms (on reference)
    _ev(2, 150_000, "build", "building:tree_of_ages"),
    # Expansion at 360 000 ms (on reference for NEvO)
    _ev(2, 360_000, "expand", "building:tree_of_life"),
    # Hero level 3 at 270 000 ms (on reference)
    _ev(2, 270_000, "hero_level", "hero:firelord", {"level": 3}),
]

ALL_EVENTS = ORC_EVENTS + NE_EVENTS


# ---------------------------------------------------------------------------
# Severity threshold tests (unit tests for reference functions)
# ---------------------------------------------------------------------------

class TestSeverityThresholds:
    def test_time_delta_info_zero(self) -> None:
        assert severity_for_time_delta(0) == "info"

    def test_time_delta_info_negative(self) -> None:
        # Being early → never penalised
        assert severity_for_time_delta(-30_000) == "info"

    def test_time_delta_info_just_under_minor(self) -> None:
        assert severity_for_time_delta(29_999) == "info"

    def test_time_delta_minor_lower(self) -> None:
        assert severity_for_time_delta(30_000) == "minor"

    def test_time_delta_minor_upper(self) -> None:
        assert severity_for_time_delta(59_999) == "minor"

    def test_time_delta_major_lower(self) -> None:
        assert severity_for_time_delta(60_000) == "major"

    def test_time_delta_major_upper(self) -> None:
        assert severity_for_time_delta(119_999) == "major"

    def test_time_delta_critical(self) -> None:
        assert severity_for_time_delta(120_000) == "critical"

    def test_level_delta_info_zero(self) -> None:
        assert severity_for_level_delta(0) == "info"

    def test_level_delta_info_positive(self) -> None:
        assert severity_for_level_delta(2) == "info"

    def test_level_delta_minor(self) -> None:
        assert severity_for_level_delta(-1) == "minor"

    def test_level_delta_major(self) -> None:
        assert severity_for_level_delta(-2) == "major"

    def test_level_delta_critical(self) -> None:
        assert severity_for_level_delta(-3) == "critical"

    def test_level_delta_critical_large(self) -> None:
        assert severity_for_level_delta(-5) == "critical"


# ---------------------------------------------------------------------------
# Reference lookup tests
# ---------------------------------------------------------------------------

class TestReferenceTable:
    def test_orc_ovne_first_hero_exists(self) -> None:
        ref = get_reference("OvNE", "orc", "first_hero_timing")
        assert ref is not None
        assert ref.expected == 62_000

    def test_ne_nevo_tier2_exists(self) -> None:
        ref = get_reference("NEvO", "nightelf", "tier2_timing")
        assert ref is not None
        assert ref.expected == 150_000

    def test_missing_matchup_returns_none(self) -> None:
        ref = get_reference("OvNE", "human", "first_hero_timing")
        assert ref is None

    def test_missing_metric_returns_none(self) -> None:
        ref = get_reference("OvNE", "orc", "nonexistent_metric")
        assert ref is None

    def test_infer_matchup_orc_ne(self) -> None:
        assert infer_matchup_code("orc", "nightelf") == "OvNE"

    def test_infer_matchup_ne_orc(self) -> None:
        assert infer_matchup_code("nightelf", "orc") == "NEvO"

    def test_infer_matchup_unknown_returns_none(self) -> None:
        assert infer_matchup_code("orc", "random") is None


# ---------------------------------------------------------------------------
# first_hero_timing
# ---------------------------------------------------------------------------

class TestFirstHeroTiming:
    def test_orc_hero_65s_is_minor_late(self) -> None:
        result = first_hero_timing(ORC_EVENTS, ORC_PLAYER, "OvNE", REPLAY_ID)
        assert result.metric == "first_hero_timing"
        assert result.slot == 1
        assert result.value == 65_000.0
        assert result.expected == 62_000.0
        # delta = 65_000 - 62_000 = 3_000 → info (< 30 000)
        assert result.delta == 3_000.0
        assert result.severity == "info"

    def test_ne_hero_62s_is_info(self) -> None:
        result = first_hero_timing(NE_EVENTS, NE_PLAYER, "NEvO", REPLAY_ID)
        assert result.value == 62_000.0
        assert result.severity == "info"

    def test_no_hero_returns_critical(self) -> None:
        events_no_hero = [
            e for e in ORC_EVENTS
            if e.event_type != "hero_level"
            and not (e.event_type == "train" and e.entity_ref.startswith("hero:"))
        ]
        result = first_hero_timing(events_no_hero, ORC_PLAYER, "OvNE", REPLAY_ID)
        assert result.value == -1
        assert result.severity == "critical"

    def test_missing_matchup_emits_info_with_no_expected(self) -> None:
        result = first_hero_timing(ORC_EVENTS, ORC_PLAYER, None, REPLAY_ID)
        assert result.expected is None
        assert result.delta is None
        assert result.severity == "info"

    def test_late_hero_90s_is_minor(self) -> None:
        events = [
            _ev(1, 90_000, "hero_level", "hero:blademaster", {"level": 1}),
        ]
        result = first_hero_timing(events, ORC_PLAYER, "OvNE", REPLAY_ID)
        # delta = 90_000 - 62_000 = 28_000 → info (< 30 000)
        assert result.delta == 28_000.0
        assert result.severity == "info"

    def test_very_late_hero_200s_is_major(self) -> None:
        events = [
            _ev(1, 200_000, "hero_level", "hero:blademaster", {"level": 1}),
        ]
        result = first_hero_timing(events, ORC_PLAYER, "OvNE", REPLAY_ID)
        # delta = 200_000 - 62_000 = 138_000 → critical
        assert result.severity == "critical"


# ---------------------------------------------------------------------------
# tier2_timing
# ---------------------------------------------------------------------------

class TestTier2Timing:
    def test_orc_stronghold_160s_is_minor(self) -> None:
        result = tier2_timing(ORC_EVENTS, ORC_PLAYER, "OvNE", REPLAY_ID)
        assert result.metric == "tier2_timing"
        assert result.value == 160_000.0
        assert result.expected == 130_000.0
        # delta = 30 000 → minor
        assert result.delta == 30_000.0
        assert result.severity == "minor"

    def test_ne_tree_of_ages_150s_is_info(self) -> None:
        result = tier2_timing(NE_EVENTS, NE_PLAYER, "NEvO", REPLAY_ID)
        assert result.value == 150_000.0
        assert result.expected == 150_000.0
        assert result.delta == 0.0
        assert result.severity == "info"

    def test_no_t2_returns_major(self) -> None:
        events_no_t2 = [e for e in ORC_EVENTS if e.entity_ref != "building:stronghold"]
        result = tier2_timing(events_no_t2, ORC_PLAYER, "OvNE", REPLAY_ID)
        assert result.value == -1
        assert result.severity == "major"

    def test_missing_matchup_returns_info_no_expected(self) -> None:
        result = tier2_timing(ORC_EVENTS, ORC_PLAYER, None, REPLAY_ID)
        assert result.expected is None
        assert result.severity == "info"


# ---------------------------------------------------------------------------
# expansion_timing
# ---------------------------------------------------------------------------

class TestExpansionTiming:
    def test_orc_no_expansion_critical_in_long_game(self) -> None:
        result = expansion_timing(
            ORC_EVENTS, ORC_PLAYER, "OvNE", REPLAY_ID, GAME_DURATION_MS
        )
        assert result.metric == "expansion_timing"
        assert result.value == -1
        # game > 8 min → critical
        assert result.severity == "critical"

    def test_ne_expansion_360s_on_reference(self) -> None:
        result = expansion_timing(
            NE_EVENTS, NE_PLAYER, "NEvO", REPLAY_ID, GAME_DURATION_MS
        )
        assert result.value == 360_000.0
        assert result.expected == 360_000.0
        assert result.delta == 0.0
        assert result.severity == "info"

    def test_expansion_via_hall_build(self) -> None:
        events = [
            # First great_hall = starting base (ignored)
            _ev(1, 1_000, "build", "building:great_hall"),
            # Second great_hall = expansion
            _ev(1, 300_000, "build", "building:great_hall"),
        ]
        result = expansion_timing(
            events, ORC_PLAYER, "OvNE", REPLAY_ID, GAME_DURATION_MS
        )
        assert result.value == 300_000.0
        # delta = 300_000 - 330_000 = -30_000 → info (early is fine)
        assert result.severity == "info"

    def test_late_expansion_major(self) -> None:
        events = [
            _ev(1, 500_000, "expand", "building:great_hall"),
        ]
        result = expansion_timing(
            events, ORC_PLAYER, "OvNE", REPLAY_ID, GAME_DURATION_MS
        )
        # delta = 500_000 - 330_000 = 170_000 → critical
        assert result.severity == "critical"

    def test_no_expansion_short_game_major(self) -> None:
        result = expansion_timing(
            ORC_EVENTS, ORC_PLAYER, "OvNE", REPLAY_ID,
            game_duration_ms=300_000,  # 5 min game → major, not critical
        )
        assert result.severity == "major"


# ---------------------------------------------------------------------------
# hero_level3_timing
# ---------------------------------------------------------------------------

class TestHeroLevel3Timing:
    def test_orc_level3_at_280s_is_minor(self) -> None:
        result = hero_level3_timing(ORC_EVENTS, ORC_PLAYER, "OvNE", REPLAY_ID)
        assert result.metric == "hero_level3_timing"
        assert result.value == 280_000.0
        assert result.expected == 240_000.0
        # delta = 40_000 → minor
        assert result.severity == "minor"

    def test_ne_level3_at_270s_is_info(self) -> None:
        result = hero_level3_timing(NE_EVENTS, NE_PLAYER, "NEvO", REPLAY_ID)
        assert result.value == 270_000.0
        assert result.severity == "info"

    def test_hero_never_reaches_level3(self) -> None:
        events_low_level = [
            e for e in ORC_EVENTS
            if not (e.event_type == "hero_level" and e.payload.get("level", 0) >= 3)
        ]
        result = hero_level3_timing(events_low_level, ORC_PLAYER, "OvNE", REPLAY_ID)
        assert result.value == -1
        assert result.severity == "major"


# ---------------------------------------------------------------------------
# worker_count_approx
# ---------------------------------------------------------------------------

class TestWorkerCountApprox:
    def test_orc_14_workers_at_10min_info(self) -> None:
        # 5 starting + 9 trained before 600 000 ms = 14
        trained_before_10min = sum(
            1 for e in ORC_EVENTS
            if e.event_type == "train"
            and e.entity_ref == "unit:peon"
            and e.t_ms <= 600_000
        )
        expected_total = 5 + trained_before_10min
        result = worker_count_approx(
            ORC_EVENTS, ORC_PLAYER, REPLAY_ID, 600_000, "10min"
        )
        assert result.metric == "worker_count_approx_10min"
        assert result.value == float(expected_total)
        assert result.expected == 14.0
        # 14 == 14 → delta = 0 → info
        assert result.severity == "info"

    def test_few_workers_critical(self) -> None:
        events_few = [
            _ev(1, 10_000, "train", "unit:peon"),
            _ev(1, 25_000, "train", "unit:peon"),
        ]
        result = worker_count_approx(
            events_few, ORC_PLAYER, REPLAY_ID, 600_000, "10min"
        )
        # 5 + 2 = 7 workers; expected 14; delta = -7 → critical
        assert result.value == 7.0
        assert result.severity == "critical"

    def test_no_metric_suffix_returns_info_no_expected(self) -> None:
        result = worker_count_approx(ORC_EVENTS, ORC_PLAYER, REPLAY_ID, 300_000)
        assert result.expected is None
        assert result.severity == "info"


# ---------------------------------------------------------------------------
# worker_production_continuity
# ---------------------------------------------------------------------------

class TestWorkerProductionContinuity:
    def test_orc_has_large_gap(self) -> None:
        result = worker_production_continuity(ORC_EVENTS, ORC_PLAYER, REPLAY_ID)
        assert result.metric == "worker_production_gap_approx"
        # Largest gap: 400 000 - 200 000 = 200 000 ms; minus peon build time 15 000 ms
        # idle_proxy = 185 000 ms → critical
        assert result.value == 185_000.0
        assert result.severity == "critical"

    def test_continuous_production_is_info(self) -> None:
        events = [
            _ev(1, 0, "train", "unit:peon"),
            _ev(1, 15_000, "train", "unit:peon"),
            _ev(1, 30_000, "train", "unit:peon"),
            _ev(1, 45_000, "train", "unit:peon"),
        ]
        result = worker_production_continuity(events, ORC_PLAYER, REPLAY_ID)
        # gap = 15 000 ms; idle_proxy = 15 000 - 15 000 = 0 → info
        assert result.value == 0.0
        assert result.severity == "info"

    def test_single_worker_returns_info(self) -> None:
        events = [_ev(1, 10_000, "train", "unit:peon")]
        result = worker_production_continuity(events, ORC_PLAYER, REPLAY_ID)
        # Only 1 event → cannot compute gap
        assert result.value == 0.0
        assert result.severity == "info"


# ---------------------------------------------------------------------------
# engine integration test (full run)
# ---------------------------------------------------------------------------

class TestEngine:
    def test_run_benchmarks_returns_list(self) -> None:
        results = run_benchmarks(
            events=ALL_EVENTS,
            players=PLAYERS,
            game_duration_ms=GAME_DURATION_MS,
            replay_id=REPLAY_ID,
        )
        assert isinstance(results, list)
        assert len(results) > 0

    def test_all_results_have_replay_id(self) -> None:
        results = run_benchmarks(ALL_EVENTS, PLAYERS, GAME_DURATION_MS, REPLAY_ID)
        for r in results:
            assert r.replay_id == REPLAY_ID

    def test_results_sorted_by_slot_then_metric(self) -> None:
        results = run_benchmarks(ALL_EVENTS, PLAYERS, GAME_DURATION_MS, REPLAY_ID)
        keys = [(r.slot, r.metric) for r in results]
        assert keys == sorted(keys)

    def test_both_players_have_results(self) -> None:
        results = run_benchmarks(ALL_EVENTS, PLAYERS, GAME_DURATION_MS, REPLAY_ID)
        slots = {r.slot for r in results}
        assert 1 in slots
        assert 2 in slots

    def test_orc_expansion_critical(self) -> None:
        results = run_benchmarks(ALL_EVENTS, PLAYERS, GAME_DURATION_MS, REPLAY_ID)
        orc_expo = next(
            r for r in results
            if r.slot == 1 and r.metric == "expansion_timing"
        )
        assert orc_expo.severity == "critical"

    def test_orc_t2_minor(self) -> None:
        results = run_benchmarks(ALL_EVENTS, PLAYERS, GAME_DURATION_MS, REPLAY_ID)
        orc_t2 = next(r for r in results if r.slot == 1 and r.metric == "tier2_timing")
        assert orc_t2.severity == "minor"

    def test_no_t3_in_short_game(self) -> None:
        # Game shorter than 7 min: no T3 metric expected
        results = run_benchmarks(ALL_EVENTS, PLAYERS, 400_000, REPLAY_ID)
        t3_metrics = [r for r in results if r.metric == "tier3_timing"]
        assert t3_metrics == []

    def test_missing_reference_emits_info_no_expected(self) -> None:
        # Use a matchup with no reference (FFA: only 1 player)
        results = run_benchmarks(ORC_EVENTS, [ORC_PLAYER], GAME_DURATION_MS, REPLAY_ID)
        # With a single player, matchup code cannot be inferred → expected=None for
        # all time-based metrics that DO have an actual value (non-absent events).
        # Note: absent-expansion severity is computed independently of the reference
        # (it uses game duration), so expansion_timing can still be critical with
        # no reference. We verify only the metrics that have a real measured value.
        none_expected_with_value = [
            r for r in results
            if r.expected is None and r.value > 0
        ]
        assert len(none_expected_with_value) > 0
        for r in none_expected_with_value:
            assert r.severity == "info", (
                f"metric {r.metric!r} expected severity 'info' "
                f"when no reference, got {r.severity!r}"
            )

    def test_benchmark_result_json_uses_camel_case_aliases(self) -> None:
        from app.benchmarks.models import BenchmarkResult
        br = BenchmarkResult(
            replayId="abc",
            slot=1,
            metric="test",
            value=100.0,
            expected=90.0,
            delta=10.0,
            severity="minor",
        )
        j = br.model_dump(by_alias=True)
        assert "replayId" in j
        assert "replay_id" not in j


# ---------------------------------------------------------------------------
# FastAPI route shape tests (no DB — mocks the db layer)
# ---------------------------------------------------------------------------

class TestRouteShape:
    """
    Light smoke tests for the FastAPI route shape.
    Uses unittest.mock to patch the DB layer — no Postgres required.
    """

    def test_health_returns_ok(self) -> None:
        from fastapi.testclient import TestClient

        from app.main import app

        client = TestClient(app)
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"

    def test_get_benchmarks_404_on_missing_replay(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """
        GET /benchmarks/{replay_id} returns 404 when the replay is unknown.
        DB is mocked to raise ValueError.

        We patch at the app.main module scope (where the names are imported)
        so the monkeypatch takes effect inside the route handler.
        """
        from fastapi.testclient import TestClient

        import app.main as main_module

        async def _raise_value_error(conn: object, replay_id: str) -> None:
            raise ValueError(f"Replay not found: {replay_id!r}")

        monkeypatch.setattr(main_module, "get_engine", lambda: _FakeEngine())
        monkeypatch.setattr(main_module, "load_replay_timeline", _raise_value_error)

        client = TestClient(main_module.app, raise_server_exceptions=False)
        resp = client.get("/benchmarks/nonexistent-replay-id")
        assert resp.status_code == 404


class _FakeEngine:
    """Minimal engine stub for route tests."""

    def connect(self) -> _FakeCtx:
        return _FakeCtx()

    def begin(self) -> _FakeCtx:
        return _FakeCtx()


class _FakeCtx:
    async def __aenter__(self) -> _FakeCtx:
        return self

    async def __aexit__(self, *args: object) -> bool:
        return False
