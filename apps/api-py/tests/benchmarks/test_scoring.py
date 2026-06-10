"""
Unit tests for the deviation scoring and prioritization layer (T3.3).

NO live database required — all tests use hand-built BenchmarkResult fixtures.

Coverage
--------
- Impact weight ordering (economy > hero > tech)
- Severity multipliers (critical outranks minor at same metric)
- Info items always excluded
- top_n cap
- Tie-breaking determinism (same score → stable sort)
- Absent-event (value == -1) scoring
- ScoredProblem fields are correctly populated
- _make_summary template correctness for key metrics
- Integration with the full engine output (run_benchmarks → prioritize)
"""

from __future__ import annotations

import pytest

from app.benchmarks.engine import run_benchmarks
from app.benchmarks.models import BenchmarkResult, PlayerInfo, TimelineEvent
from app.benchmarks.scoring import (
    IMPACT_WEIGHTS,
    ScoredProblem,
    _make_summary,
    prioritize,
    score_deviation,
)


# ---------------------------------------------------------------------------
# Fixture helpers
# ---------------------------------------------------------------------------

def _br(
    metric: str,
    value: float,
    expected: float | None,
    delta: float | None,
    severity: str,
    slot: int = 1,
    replay_id: str = "test",
) -> BenchmarkResult:
    return BenchmarkResult(
        replayId=replay_id,
        slot=slot,
        metric=metric,
        value=value,
        expected=expected,
        delta=delta,
        severity=severity,  # type: ignore[arg-type]
    )


def _ev(slot: int, t_ms: int, event_type: str, entity_ref: str, payload: dict | None = None) -> TimelineEvent:
    return TimelineEvent(
        slot=slot,
        t_ms=t_ms,
        event_type=event_type,  # type: ignore[arg-type]
        entity_ref=entity_ref,
        payload=payload or {},
    )


# ---------------------------------------------------------------------------
# Impact weight table sanity
# ---------------------------------------------------------------------------

class TestImpactWeights:
    def test_expansion_has_highest_weight(self) -> None:
        assert IMPACT_WEIGHTS["expansion_timing"] == 10.0

    def test_worker_gap_beats_t2(self) -> None:
        assert IMPACT_WEIGHTS["worker_production_gap_approx"] > IMPACT_WEIGHTS["tier2_timing"]

    def test_t2_beats_worker_count(self) -> None:
        assert IMPACT_WEIGHTS["tier2_timing"] > IMPACT_WEIGHTS["worker_count_approx_10min"]

    def test_worker_count_beats_hero_level3(self) -> None:
        assert IMPACT_WEIGHTS["worker_count_approx_10min"] > IMPACT_WEIGHTS["hero_level3_timing"]

    def test_hero_level3_beats_first_hero(self) -> None:
        assert IMPACT_WEIGHTS["hero_level3_timing"] > IMPACT_WEIGHTS["first_hero_timing"]

    def test_first_hero_beats_checkpoint_metrics(self) -> None:
        assert IMPACT_WEIGHTS["first_hero_timing"] > IMPACT_WEIGHTS["hero_level_at_5min"]

    def test_t3_and_level_at_10min_lowest_named(self) -> None:
        assert IMPACT_WEIGHTS["tier3_timing"] == IMPACT_WEIGHTS["hero_level_at_10min"] == 2.0

    def test_unknown_metric_defaults_to_1(self) -> None:
        from app.benchmarks.scoring import IMPACT_WEIGHTS
        assert IMPACT_WEIGHTS.get("nonexistent_metric", 1.0) == 1.0


# ---------------------------------------------------------------------------
# score_deviation
# ---------------------------------------------------------------------------

class TestScoreDeviation:
    def test_info_always_zero(self) -> None:
        r = _br("expansion_timing", 330_000, 330_000, 0.0, "info")
        assert score_deviation(r) == 0.0

    def test_info_zero_even_for_high_weight_metric(self) -> None:
        # Even a large delta with info severity → 0.0
        r = _br("expansion_timing", 600_000, 330_000, 270_000.0, "info")
        assert score_deviation(r) == 0.0

    def test_minor_returns_positive(self) -> None:
        r = _br("expansion_timing", 360_000, 330_000, 30_000.0, "minor")
        assert score_deviation(r) > 0.0

    def test_major_greater_than_minor_same_metric(self) -> None:
        minor = _br("expansion_timing", 360_000, 330_000, 30_000.0, "minor")
        major = _br("expansion_timing", 390_000, 330_000, 60_000.0, "major")
        assert score_deviation(major) > score_deviation(minor)

    def test_critical_greater_than_major_same_metric(self) -> None:
        major = _br("expansion_timing", 390_000, 330_000, 60_000.0, "major")
        critical = _br("expansion_timing", 450_000, 330_000, 120_000.0, "critical")
        assert score_deviation(critical) > score_deviation(major)

    def test_high_weight_critical_beats_low_weight_critical(self) -> None:
        # expansion critical vs tier3 critical at same delta magnitude
        expo_crit = _br("expansion_timing", -1, 330_000, None, "critical")
        t3_crit = _br("tier3_timing", -1, 420_000, None, "critical")
        assert score_deviation(expo_crit) > score_deviation(t3_crit)

    def test_absent_event_uses_absent_magnitude(self) -> None:
        # value == -1, delta is None → absent magnitude factor = 1.5
        r = _br("expansion_timing", -1, 330_000, None, "critical")
        expected_score = 10.0 * 2.0 * 1.5  # = 30.0
        assert score_deviation(r) == pytest.approx(expected_score)

    def test_missing_expansion_critical_score_30(self) -> None:
        r = _br("expansion_timing", -1, 330_000, None, "critical")
        assert score_deviation(r) == pytest.approx(30.0)

    def test_missing_expansion_major_score_15(self) -> None:
        # short game → major severity for absent expansion
        r = _br("expansion_timing", -1, 330_000, None, "major")
        expected_score = 10.0 * 1.0 * 1.5  # = 15.0
        assert score_deviation(r) == pytest.approx(expected_score)

    def test_minor_expansion_score_less_than_major(self) -> None:
        # 45 000 ms late = minor tier
        minor = _br("expansion_timing", 375_000, 330_000, 45_000.0, "minor")
        # 90 000 ms late = major tier
        major = _br("expansion_timing", 420_000, 330_000, 90_000.0, "major")
        assert score_deviation(major) > score_deviation(minor)

    def test_level_metric_minor_score(self) -> None:
        r = _br("hero_level_at_5min", 2.0, 3.0, -1.0, "minor")
        # weight=3, mult=0.5, magnitude=1.0 → 1.5
        assert score_deviation(r) == pytest.approx(1.5)

    def test_level_metric_major_score(self) -> None:
        r = _br("hero_level_at_5min", 1.0, 3.0, -2.0, "major")
        # weight=3, mult=1.0, magnitude=2.0 → 6.0
        assert score_deviation(r) == pytest.approx(6.0)

    def test_level_metric_critical_score(self) -> None:
        r = _br("worker_count_approx_10min", 7.0, 14.0, -7.0, "critical")
        # weight=6, mult=2.0, magnitude=min(7/3, 3.0)=2.333 → 6*2*2.333=28.0
        s = score_deviation(r)
        assert s == pytest.approx(6.0 * 2.0 * min(7 / 3.0, 3.0))

    def test_worker_gap_time_based_scoring(self) -> None:
        # idle gap of 185 000 ms, delta == value for this metric
        r = _br("worker_production_gap_approx", 185_000, 0.0, 185_000.0, "critical")
        # weight=8, mult=2.0, magnitude=min(185000/120000, 3.0)=min(1.54,3.0)=1.54
        expected = 8.0 * 2.0 * min(185_000 / 120_000, 3.0)
        assert score_deviation(r) == pytest.approx(expected)

    def test_unknown_metric_scores_with_default_weight(self) -> None:
        r = _br("some_future_metric", -1, None, None, "critical")
        # weight defaults to 1.0
        assert score_deviation(r) == pytest.approx(1.0 * 2.0 * 1.5)


# ---------------------------------------------------------------------------
# prioritize
# ---------------------------------------------------------------------------

class TestPrioritize:
    def test_empty_input_returns_empty(self) -> None:
        assert prioritize([]) == []

    def test_all_info_returns_empty(self) -> None:
        results = [
            _br("expansion_timing", 330_000, 330_000, 0.0, "info"),
            _br("tier2_timing", 130_000, 130_000, 0.0, "info"),
        ]
        assert prioritize(results) == []

    def test_single_problem_returned(self) -> None:
        results = [
            _br("expansion_timing", -1, 330_000, None, "critical"),
        ]
        out = prioritize(results)
        assert len(out) == 1
        assert out[0].metric == "expansion_timing"

    def test_top_n_caps_output(self) -> None:
        results = [
            _br("expansion_timing", -1, 330_000, None, "critical"),
            _br("tier2_timing", 250_000, 130_000, 120_000.0, "critical"),
            _br("worker_production_gap_approx", 185_000, 0.0, 185_000.0, "critical"),
            _br("hero_level3_timing", 480_000, 240_000, 240_000.0, "critical"),
            _br("first_hero_timing", 250_000, 62_000, 188_000.0, "critical"),
            _br("hero_level_at_5min", 1.0, 3.0, -2.0, "major"),
        ]
        out = prioritize(results, top_n=3)
        assert len(out) == 3

    def test_top_n_zero_returns_empty(self) -> None:
        results = [_br("expansion_timing", -1, 330_000, None, "critical")]
        assert prioritize(results, top_n=0) == []

    def test_higher_score_first(self) -> None:
        # expansion_timing critical should outrank tier3_timing critical
        results = [
            _br("tier3_timing", -1, 420_000, None, "critical"),
            _br("expansion_timing", -1, 330_000, None, "critical"),
        ]
        out = prioritize(results)
        assert out[0].metric == "expansion_timing"

    def test_critical_outranks_minor_same_metric(self) -> None:
        results = [
            _br("expansion_timing", 360_000, 330_000, 30_000.0, "minor"),
            _br("tier2_timing", -1, 130_000, None, "critical"),
        ]
        # tier2 critical score = 7 * 2 * 1.5 = 21.0
        # expansion minor score = 10 * 0.5 * (30000/30000) = 5.0
        out = prioritize(results)
        assert out[0].metric == "tier2_timing"
        assert out[1].metric == "expansion_timing"

    def test_slot_filter(self) -> None:
        results = [
            _br("expansion_timing", -1, 330_000, None, "critical", slot=1),
            _br("tier2_timing", 250_000, 130_000, 120_000.0, "critical", slot=2),
        ]
        out = prioritize(results, orc_slot=1)
        assert len(out) == 1
        assert out[0].metric == "expansion_timing"

    def test_tie_breaking_determinism(self) -> None:
        """Two results with identical scores should be sorted deterministically."""
        # Craft two items that will have the same score by giving them same weight and
        # same severity × magnitude, but different metric names.
        # Use unknown metrics (weight=1.0), same absent-event critical:
        r1 = _br("zzz_unknown_metric", -1, None, None, "critical")
        r2 = _br("aaa_unknown_metric", -1, None, None, "critical")
        # Both score: 1.0 * 2.0 * 1.5 = 3.0
        assert score_deviation(r1) == score_deviation(r2)

        out = prioritize([r1, r2])
        # Tie-break: metric name ascending → aaa first
        assert out[0].metric == "aaa_unknown_metric"
        assert out[1].metric == "zzz_unknown_metric"

    def test_tie_breaking_stable_across_multiple_calls(self) -> None:
        """Determinism: same input → same output every call."""
        results = [
            _br("zzz_unknown_metric", -1, None, None, "critical"),
            _br("aaa_unknown_metric", -1, None, None, "critical"),
            _br("mmm_unknown_metric", -1, None, None, "critical"),
        ]
        out1 = prioritize(results)
        out2 = prioritize(results)
        assert [p.metric for p in out1] == [p.metric for p in out2]

    def test_scored_problem_fields_populated(self) -> None:
        results = [
            _br("expansion_timing", -1, 330_000, None, "critical"),
        ]
        out = prioritize(results)
        p = out[0]
        assert isinstance(p, ScoredProblem)
        assert p.metric == "expansion_timing"
        assert p.severity == "critical"
        assert p.score > 0.0
        assert p.delta is None  # absent event
        assert p.value == -1.0
        assert p.expected == 330_000.0
        assert isinstance(p.summary, str)
        assert len(p.summary) > 0

    def test_output_is_ordered_by_score_descending(self) -> None:
        results = [
            # expansion missing (long game) → highest score
            _br("expansion_timing", -1, 330_000, None, "critical"),
            # minor hero level
            _br("hero_level_at_10min", 4.0, 5.0, -1.0, "minor"),
            # worker gap critical
            _br("worker_production_gap_approx", 185_000, 0.0, 185_000.0, "critical"),
            # t2 minor
            _br("tier2_timing", 160_000, 130_000, 30_000.0, "minor"),
        ]
        out = prioritize(results)
        scores = [p.score for p in out]
        assert scores == sorted(scores, reverse=True)


# ---------------------------------------------------------------------------
# _make_summary
# ---------------------------------------------------------------------------

class TestMakeSummary:
    def test_absent_expansion(self) -> None:
        r = _br("expansion_timing", -1, 330_000, None, "critical")
        s = _make_summary(r)
        assert "No expansion" in s
        assert "5:30" in s  # 330 000 ms = 5:30

    def test_absent_hero(self) -> None:
        r = _br("first_hero_timing", -1, 62_000, None, "critical")
        s = _make_summary(r)
        assert "hero" in s.lower()

    def test_late_expansion_summary(self) -> None:
        r = _br("expansion_timing", 420_000, 330_000, 90_000.0, "critical")
        s = _make_summary(r)
        assert "7:00" in s   # 420 000 ms = 7:00
        assert "5:30" in s   # 330 000 ms = 5:30
        assert "late" in s

    def test_late_t2_summary(self) -> None:
        r = _br("tier2_timing", 250_000, 130_000, 120_000.0, "critical")
        s = _make_summary(r)
        assert "Stronghold" in s or "T2" in s

    def test_worker_gap_summary(self) -> None:
        r = _br("worker_production_gap_approx", 185_000.0, 0.0, 185_000.0, "critical")
        s = _make_summary(r)
        assert "185" in s
        assert "gap" in s.lower() or "idle" in s.lower()

    def test_worker_count_summary(self) -> None:
        r = _br("worker_count_approx_10min", 9.0, 14.0, -5.0, "critical")
        s = _make_summary(r)
        assert "9" in s
        assert "14" in s

    def test_hero_level_at_checkpoint_summary(self) -> None:
        r = _br("hero_level_at_5min", 2.0, 3.0, -1.0, "minor")
        s = _make_summary(r)
        assert "5min" in s
        assert "2" in s

    def test_no_reference_summary_fallback(self) -> None:
        r = _br("expansion_timing", 330_000, None, None, "info")
        s = _make_summary(r)
        assert "no reference" in s.lower()


# ---------------------------------------------------------------------------
# Integration: run_benchmarks → prioritize (pure, no DB)
# ---------------------------------------------------------------------------

class TestIntegration:
    """Full pipeline from engine output to prioritized problems."""

    ORC_PLAYER = PlayerInfo(
        slot=1, race_id="race:orc", player_name="TestOrc", apm=80.0, result="loss"
    )
    NE_PLAYER = PlayerInfo(
        slot=2, race_id="race:nightelf", player_name="TestNE", apm=95.0, result="win"
    )

    # Replay with several Orc problems: missing expo, late T2, worker gap
    ORC_EVENTS = [
        # Worker trains with a big gap
        _ev(1, 10_000, "train", "unit:peon"),
        _ev(1, 28_000, "train", "unit:peon"),
        _ev(1, 46_000, "train", "unit:peon"),
        _ev(1, 200_000, "train", "unit:peon"),   # 154 000 ms gap = critical
        # Hero out on time
        _ev(1, 65_000, "hero_level", "hero:blademaster", {"level": 1}),
        _ev(1, 150_000, "hero_level", "hero:blademaster", {"level": 2}),
        _ev(1, 280_000, "hero_level", "hero:blademaster", {"level": 3}),
        # T2 at 250 000 ms (120 000 ms late vs 130 000 ms reference)
        _ev(1, 250_000, "build", "building:stronghold"),
        # No expansion
    ]
    NE_EVENTS = [
        _ev(2, 62_000, "hero_level", "hero:firelord", {"level": 1}),
        _ev(2, 150_000, "build", "building:tree_of_ages"),
        _ev(2, 360_000, "expand", "building:tree_of_life"),
        _ev(2, 270_000, "hero_level", "hero:firelord", {"level": 3}),
    ]
    GAME_DURATION_MS = 620_000

    def test_prioritize_returns_top5_orc_problems(self) -> None:
        results = run_benchmarks(
            events=self.ORC_EVENTS + self.NE_EVENTS,
            players=[self.ORC_PLAYER, self.NE_PLAYER],
            game_duration_ms=self.GAME_DURATION_MS,
            replay_id="integration-test",
        )
        problems = prioritize(results, top_n=5, orc_slot=1)
        assert len(problems) <= 5
        assert len(problems) > 0

    def test_expansion_is_top_priority(self) -> None:
        results = run_benchmarks(
            events=self.ORC_EVENTS + self.NE_EVENTS,
            players=[self.ORC_PLAYER, self.NE_PLAYER],
            game_duration_ms=self.GAME_DURATION_MS,
            replay_id="integration-test",
        )
        problems = prioritize(results, orc_slot=1)
        assert problems[0].metric == "expansion_timing"

    def test_no_ne_problems_surfaced_when_slot_filtered(self) -> None:
        results = run_benchmarks(
            events=self.ORC_EVENTS + self.NE_EVENTS,
            players=[self.ORC_PLAYER, self.NE_PLAYER],
            game_duration_ms=self.GAME_DURATION_MS,
            replay_id="integration-test",
        )
        problems = prioritize(results, orc_slot=1)
        for p in problems:
            # All surfaced problems come from engine output without slot metadata
            # but slot filter was applied → we verify summary doesn't mention NE metrics
            assert "wisp" not in p.summary.lower()

    def test_scores_in_descending_order(self) -> None:
        results = run_benchmarks(
            events=self.ORC_EVENTS + self.NE_EVENTS,
            players=[self.ORC_PLAYER, self.NE_PLAYER],
            game_duration_ms=self.GAME_DURATION_MS,
            replay_id="integration-test",
        )
        problems = prioritize(results, orc_slot=1)
        scores = [p.score for p in problems]
        assert scores == sorted(scores, reverse=True)

    def test_all_surfaced_problems_above_info(self) -> None:
        results = run_benchmarks(
            events=self.ORC_EVENTS + self.NE_EVENTS,
            players=[self.ORC_PLAYER, self.NE_PLAYER],
            game_duration_ms=self.GAME_DURATION_MS,
            replay_id="integration-test",
        )
        problems = prioritize(results, orc_slot=1)
        for p in problems:
            assert p.severity != "info"
