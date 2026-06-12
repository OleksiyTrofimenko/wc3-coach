"""
Unit tests for tip post-processing and JSONB (de)serialisation.

NO live DB or Ollama.  All tests are pure synchronous.

Coverage
--------
- _parse_tips_from_llm: valid JSON → correct CoachTip list
- _parse_tips_from_llm: clamp to 5 (model can't return >5 via schema, but be safe)
- _parse_tips_from_llm: priority numbering (always 1-based rank, not from LLM)
- _parse_tips_from_llm: tMs set ONLY for time-based metrics with value != -1
- _parse_tips_from_llm: tMs NOT set for absent events (value == -1)
- _parse_tips_from_llm: tMs NOT set for level/count metrics
- _parse_tips_from_llm: relatedBenchmarks maps to problem metric
- _parse_tips_from_llm: invalid JSON → empty list (fallback, no crash)
- _tips_to_jsonb / _tips_from_jsonb round-trip: all fields preserved
- _tips_to_jsonb: None tMs / relatedBenchmarks omitted from dict
- CoachTip model: camelCase serialisation via model_dump(by_alias=True)
- CoachReport model: camelCase serialisation
"""

from __future__ import annotations

import json

from app.benchmarks.scoring import ScoredProblem
from app.coach.db import _tips_from_jsonb, _tips_to_jsonb
from app.coach.models import CoachReport, CoachTip
from app.coach.service import _parse_tips_from_llm

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _tip(
    priority: int = 1,
    title: str = "Take your expansion",
    detail: str = "Expand at 5:30 to match opponent economy.",
    t_ms: int | None = None,
    related: list[str] | None = None,
) -> CoachTip:
    return CoachTip(
        priority=priority,
        title=title,
        detail=detail,
        tMs=t_ms,
        relatedBenchmarks=related,
    )


def _problem(
    metric: str = "expansion_timing",
    severity: str = "critical",
    score: float = 30.0,
    value: float = -1.0,
    expected: float = 330_000.0,
    delta: float | None = None,
    summary: str = "No expansion taken (expected by 5:30) — critical economic deficit",
) -> ScoredProblem:
    return ScoredProblem(
        metric=metric,
        severity=severity,  # type: ignore[arg-type]
        score=score,
        delta=delta,
        value=value,
        expected=expected,
        summary=summary,
    )


def _make_llm_json(tips: list[dict[str, str]]) -> str:
    """Build a JSON string matching the _TIP_SCHEMA format the LLM should produce."""
    return json.dumps({"tips": tips})


# ---------------------------------------------------------------------------
# _parse_tips_from_llm
# ---------------------------------------------------------------------------


class TestParseTipsFromLlm:
    def test_parses_3_valid_tips(self) -> None:
        raw = _make_llm_json([
            {"title": "Tip A", "detail": "Detail A"},
            {"title": "Tip B", "detail": "Detail B"},
            {"title": "Tip C", "detail": "Detail C"},
        ])
        tips = _parse_tips_from_llm(raw, [])
        assert len(tips) == 3

    def test_clamps_to_5_tips(self) -> None:
        raw = _make_llm_json([
            {"title": f"Tip {i}", "detail": f"Detail {i}"}
            for i in range(7)
        ])
        tips = _parse_tips_from_llm(raw, [])
        assert len(tips) == 5

    def test_priority_is_1_based_rank(self) -> None:
        raw = _make_llm_json([
            {"title": "Tip 1", "detail": "D1"},
            {"title": "Tip 2", "detail": "D2"},
            {"title": "Tip 3", "detail": "D3"},
        ])
        tips = _parse_tips_from_llm(raw, [])
        assert tips[0].priority == 1
        assert tips[1].priority == 2
        assert tips[2].priority == 3

    def test_skipped_empty_tip_keeps_priorities_contiguous(self) -> None:
        # An empty middle tip must NOT leave a priority gap — surviving tips get
        # contiguous 1-based priorities so the tip↔problem mapping stays aligned.
        raw = _make_llm_json([
            {"title": "Tip 1", "detail": "D1"},
            {"title": "", "detail": ""},  # dropped
            {"title": "Tip 3", "detail": "D3"},
        ])
        prob_a = _problem(metric="worker_production_gap_approx")
        prob_b = _problem(metric="tier2_timing")
        tips = _parse_tips_from_llm(raw, [prob_a, prob_b])
        assert [t.priority for t in tips] == [1, 2]
        # The 2nd surviving tip maps to problems[1] (tier2), not problems[2].
        assert tips[1].related_benchmarks == ["tier2_timing"]

    def test_title_and_detail_preserved(self) -> None:
        raw = _make_llm_json([
            {"title": "Expand at 5:30", "detail": "You must expand."}
        ])
        tips = _parse_tips_from_llm(raw, [])
        assert tips[0].title == "Expand at 5:30"
        assert tips[0].detail == "You must expand."

    def test_related_benchmarks_set_from_problem(self) -> None:
        raw = _make_llm_json([{"title": "X", "detail": "Y"}])
        prob = _problem(metric="tier2_timing")
        tips = _parse_tips_from_llm(raw, [prob])
        assert tips[0].related_benchmarks == ["tier2_timing"]

    def test_t_ms_set_for_time_metric_with_real_value(self) -> None:
        # expansion_timing with a real timestamp (not -1)
        raw = _make_llm_json([{"title": "X", "detail": "Y"}])
        prob = _problem(metric="expansion_timing", value=420_000.0, delta=90_000.0)
        tips = _parse_tips_from_llm(raw, [prob])
        assert tips[0].t_ms == 420_000

    def test_t_ms_not_set_for_absent_event(self) -> None:
        # value == -1 means the event never happened (no timestamp)
        raw = _make_llm_json([{"title": "X", "detail": "Y"}])
        prob = _problem(metric="expansion_timing", value=-1.0)
        tips = _parse_tips_from_llm(raw, [prob])
        assert tips[0].t_ms is None

    def test_t_ms_not_set_for_level_metric(self) -> None:
        # hero_level_at_5min is a level/count metric, not time-based
        raw = _make_llm_json([{"title": "X", "detail": "Y"}])
        prob = _problem(
            metric="hero_level_at_5min", value=2.0, expected=3.0, delta=-1.0
        )
        tips = _parse_tips_from_llm(raw, [prob])
        assert tips[0].t_ms is None

    def test_t_ms_not_set_for_worker_count_metric(self) -> None:
        raw = _make_llm_json([{"title": "X", "detail": "Y"}])
        prob = _problem(
            metric="worker_count_approx_10min", value=9.0, expected=14.0, delta=-5.0
        )
        tips = _parse_tips_from_llm(raw, [prob])
        assert tips[0].t_ms is None

    def test_t_ms_set_for_hero_level3_timing(self) -> None:
        # hero_level3_timing IS a time-based metric
        raw = _make_llm_json([{"title": "X", "detail": "Y"}])
        prob = _problem(metric="hero_level3_timing", value=480_000.0, delta=240_000.0)
        tips = _parse_tips_from_llm(raw, [prob])
        assert tips[0].t_ms == 480_000

    def test_t_ms_set_for_tier2_timing(self) -> None:
        raw = _make_llm_json([{"title": "X", "detail": "Y"}])
        prob = _problem(metric="tier2_timing", value=250_000.0, delta=120_000.0)
        tips = _parse_tips_from_llm(raw, [prob])
        assert tips[0].t_ms == 250_000

    def test_invalid_json_returns_empty_list(self) -> None:
        tips = _parse_tips_from_llm("not json at all", [])
        assert tips == []

    def test_empty_tips_array_returns_empty(self) -> None:
        raw = json.dumps({"tips": []})
        tips = _parse_tips_from_llm(raw, [])
        assert tips == []

    def test_tip_with_empty_title_skipped(self) -> None:
        raw = _make_llm_json([
            {"title": "", "detail": "Some detail"},
            {"title": "Valid tip", "detail": "Valid detail"},
        ])
        tips = _parse_tips_from_llm(raw, [])
        assert len(tips) == 1
        assert tips[0].title == "Valid tip"

    def test_extra_tip_index_beyond_problems_has_no_related(self) -> None:
        # 3 tips, only 1 problem → tips[1] and tips[2] have no relatedBenchmarks
        raw = _make_llm_json([
            {"title": "T1", "detail": "D1"},
            {"title": "T2", "detail": "D2"},
            {"title": "T3", "detail": "D3"},
        ])
        tips = _parse_tips_from_llm(raw, [_problem()])
        assert tips[0].related_benchmarks == ["expansion_timing"]
        assert tips[1].related_benchmarks is None
        assert tips[2].related_benchmarks is None


# ---------------------------------------------------------------------------
# JSONB (de)serialisation round-trip
# ---------------------------------------------------------------------------


class TestTipsJsonbRoundTrip:
    def test_full_round_trip_with_all_fields(self) -> None:
        original = [
            _tip(1, "Tip 1", "Detail 1", t_ms=420_000, related=["expansion_timing"]),
            _tip(2, "Tip 2", "Detail 2", t_ms=None, related=None),
        ]
        serialised = _tips_to_jsonb(original)
        restored = _tips_from_jsonb(serialised)

        assert len(restored) == 2
        assert restored[0].title == "Tip 1"
        assert restored[0].detail == "Detail 1"
        assert restored[0].t_ms == 420_000
        assert restored[0].related_benchmarks == ["expansion_timing"]
        assert restored[1].title == "Tip 2"
        assert restored[1].t_ms is None
        assert restored[1].related_benchmarks is None

    def test_none_t_ms_omitted_from_dict(self) -> None:
        tips = [_tip(1, "X", "Y", t_ms=None)]
        serialised = _tips_to_jsonb(tips)
        assert "tMs" not in serialised[0]

    def test_present_t_ms_in_dict(self) -> None:
        tips = [_tip(1, "X", "Y", t_ms=330_000)]
        serialised = _tips_to_jsonb(tips)
        assert serialised[0]["tMs"] == 330_000

    def test_none_related_omitted_from_dict(self) -> None:
        tips = [_tip(1, "X", "Y", related=None)]
        serialised = _tips_to_jsonb(tips)
        assert "relatedBenchmarks" not in serialised[0]

    def test_present_related_in_dict(self) -> None:
        tips = [_tip(1, "X", "Y", related=["tier2_timing"])]
        serialised = _tips_to_jsonb(tips)
        assert serialised[0]["relatedBenchmarks"] == ["tier2_timing"]

    def test_json_string_input_to_tips_from_jsonb(self) -> None:
        # asyncpg may return text in some edge cases
        tips = [_tip(1, "X", "Y")]
        serialised_str = json.dumps(_tips_to_jsonb(tips))
        restored = _tips_from_jsonb(serialised_str)
        assert len(restored) == 1
        assert restored[0].title == "X"

    def test_empty_list_round_trips(self) -> None:
        assert _tips_from_jsonb(_tips_to_jsonb([])) == []


# ---------------------------------------------------------------------------
# CoachTip camelCase serialisation
# ---------------------------------------------------------------------------


class TestCoachTipSerialisation:
    def test_by_alias_produces_camel_case(self) -> None:
        tip = _tip(
            1, "Expand", "Expand at 5:30.", t_ms=330_000, related=["expansion_timing"]
        )
        data = tip.model_dump(by_alias=True)
        assert "tMs" in data
        assert "relatedBenchmarks" in data
        assert data["priority"] == 1
        assert data["tMs"] == 330_000
        assert data["relatedBenchmarks"] == ["expansion_timing"]

    def test_none_fields_excluded_when_exclude_none(self) -> None:
        tip = _tip(1, "X", "Y")  # no tMs or relatedBenchmarks
        data = tip.model_dump(by_alias=True, exclude_none=True)
        assert "tMs" not in data
        assert "relatedBenchmarks" not in data

    def test_field_names_also_accessible(self) -> None:
        tip = _tip(1, "X", "Y", t_ms=100, related=["foo"])
        assert tip.t_ms == 100
        assert tip.related_benchmarks == ["foo"]


# ---------------------------------------------------------------------------
# CoachReport camelCase serialisation
# ---------------------------------------------------------------------------


class TestCoachReportSerialisation:
    def test_report_camel_case_output(self) -> None:
        report = CoachReport(
            replayId="abc-123",
            matchup="OvNE",
            mapName="Shallow Grave",
            result="loss",
            durationMs=680_000,
            tips=[_tip(1, "Tip", "Detail")],
        )
        data = report.model_dump(by_alias=True)
        assert data["replayId"] == "abc-123"
        assert data["matchup"] == "OvNE"
        assert data["mapName"] == "Shallow Grave"
        assert data["result"] == "loss"
        assert data["durationMs"] == 680_000
        assert len(data["tips"]) == 1

    def test_report_field_names_accessible(self) -> None:
        report = CoachReport(
            replayId="abc-123",
            matchup="OvH",
            mapName="Test Map",
            result="win",
            durationMs=400_000,
            tips=[],
        )
        assert report.replay_id == "abc-123"
        assert report.map_name == "Test Map"
        assert report.duration_ms == 400_000

    def test_result_literal_validation(self) -> None:
        # Valid values
        for result_val in ("win", "loss", "unknown"):
            r = CoachReport(
                replayId="x",
                matchup="OvNE",
                mapName="M",
                result=result_val,  # type: ignore[arg-type]
                durationMs=0,
                tips=[],
            )
            assert r.result == result_val
