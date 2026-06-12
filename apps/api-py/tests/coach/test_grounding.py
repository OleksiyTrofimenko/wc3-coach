"""
Unit tests for the grounding validator (app/coach/grounding.py) and the
_ground_tips service helper.

NO live DB, Ollama, or embeddings.  All tests are pure synchronous.

Coverage
--------
normalize_for_match
  - thousands-separator stripping ("1,800" → "1800")
  - space-before-percent collapse ("70 %" → "70%")
  - lowercasing

find_ungrounded_numbers / is_grounded
  Category (a) — clock times:
    - Fabricated time absent from allowed → flagged
    - Grounded time present in allowed → not flagged
    - Absent-event summary ("No expansion taken") does NOT contain the fabricated
      time the model invented → fabrication caught
  Category (b) — duration phrases:
    - Ungrounded "6 minutes" → flagged
    - Grounded "73s" (digits present in allowed) → not flagged
  Category (c) — percentages:
    - Grounded "70%" → not flagged
    - Ungrounded "99%" → flagged
  Category (d) — resource figures:
    - Grounded "20 gold/s" → not flagged
    - Ungrounded "500 gold" → flagged
  False-positive guard:
    - Bare integers ("level 3", "tier 2", "3 abilities") NOT flagged even if
      those digits are absent from allowed_text

_ground_tips helper (pure — no DB/Ollama)
  - Tip with ungrounded detail → detail replaced with prob.summary, title kept
  - Tip with ungrounded title → title replaced with metric title-case
  - Tip already grounded → returned unchanged
  - Tip at rank beyond problems list → passed through unchanged
  - priority / tMs / relatedBenchmarks preserved after replacement
  - Replacement count logged correctly (tested via return value length)
"""

from __future__ import annotations

import pytest

from app.benchmarks.scoring import ScoredProblem
from app.coach.grounding import (
    find_ungrounded_numbers,
    is_grounded,
    normalize_for_match,
)
from app.coach.models import CoachTip
from app.coach.service import _clean_fallback_detail, _ground_tips


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_problem(
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


def _make_tip(
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


# ---------------------------------------------------------------------------
# normalize_for_match
# ---------------------------------------------------------------------------


class TestNormalizeForMatch:
    def test_thousands_separator_stripped(self) -> None:
        assert normalize_for_match("1,800 gold") == "1800 gold"

    def test_multiple_thousands_separators(self) -> None:
        assert normalize_for_match("1,234,567") == "1234567"

    def test_space_before_percent_collapsed(self) -> None:
        assert normalize_for_match("70 %") == "70%"

    def test_no_space_percent_unchanged(self) -> None:
        assert normalize_for_match("70%") == "70%"

    def test_lowercased(self) -> None:
        assert normalize_for_match("Expansion at 5:30") == "expansion at 5:30"

    def test_combined_transformations(self) -> None:
        result = normalize_for_match("Earned 1,800 Gold (70 %)")
        assert result == "earned 1800 gold (70%)"


# ---------------------------------------------------------------------------
# Category (a) — clock times
# ---------------------------------------------------------------------------


class TestClockTimes:
    def test_fabricated_time_not_in_allowed_is_flagged(self) -> None:
        # The live bug: model wrote "expansion at 7:15" but fact was "No expansion taken"
        tip = "You took your expansion at 7:15, which was very late."
        allowed = "No expansion taken (expected by 5:30) — critical economic deficit"
        assert not is_grounded(tip, allowed)
        offenders = find_ungrounded_numbers(tip, allowed)
        assert "7:15" in offenders

    def test_grounded_time_present_in_allowed_passes(self) -> None:
        tip = "First hero at 2:15, 73s late (expected 1:02)."
        allowed = "First hero at 2:15, 73s late (expected 1:02) — minor"
        assert is_grounded(tip, allowed)

    def test_absent_event_summary_does_not_contain_fabricated_time(self) -> None:
        # The absent-event summary contains "5:30" (expected) but NOT "7:15" (invented)
        tip = "Your expansion came at 7:15, which is very late."
        allowed = "No expansion taken (expected by 5:30) — critical economic deficit"
        offenders = find_ungrounded_numbers(tip, allowed)
        assert "7:15" in offenders

    def test_expected_time_in_absent_event_is_allowed(self) -> None:
        # "5:30" IS in the absent-event summary so it should be allowed
        tip = "You should have expanded by 5:30 but never did."
        allowed = "No expansion taken (expected by 5:30) — critical economic deficit"
        assert is_grounded(tip, allowed)

    def test_multiple_clock_times_all_checked(self) -> None:
        tip = "Hit T2 at 4:00 and expand at 7:15."
        allowed = "T2 at 4:00 — minor"
        offenders = find_ungrounded_numbers(tip, allowed)
        assert "7:15" in offenders
        assert "4:00" not in offenders

    def test_clock_time_in_chunk_text_is_allowed(self) -> None:
        tip = "Expand around 5:30 in OvNE."
        # "5:30" appears in the RAG chunk
        allowed = "Standard Orc expand around 5:30.\n"
        assert is_grounded(tip, allowed)


# ---------------------------------------------------------------------------
# Category (b) — duration phrases
# ---------------------------------------------------------------------------


class TestDurationPhrases:
    def test_grounded_seconds_abbreviation_passes(self) -> None:
        # "73" is in the allowed text as part of "73s late"
        tip = "Your hero was 73s late reaching level 3."
        allowed = "First hero at 2:15, 73s late (expected 1:02) — minor"
        assert is_grounded(tip, allowed)

    def test_ungrounded_minutes_phrase_flagged(self) -> None:
        # The live bug: model wrote "~6 minutes late" but "6" was not in the facts
        tip = "Your T2 was about 6 minutes late."
        allowed = "T2 (Stronghold) at 4:10, 130s late (expected 2:00) — critical"
        offenders = find_ungrounded_numbers(tip, allowed)
        # "6" does not appear as a standalone digit in allowed_text
        assert any("6" in o and "minute" in o.lower() for o in offenders)

    def test_hyphenated_duration_is_checked(self) -> None:
        # The supply-block bug: model wrote "30-second block" but the real value
        # was 59s. The hyphen previously bypassed the duration regex entirely.
        tip = "You had a 30-second supply block."
        allowed = "Supply-blocked (food-capped) for 59s — production stalled — critical"
        offenders = find_ungrounded_numbers(tip, allowed)
        assert any("30" in o for o in offenders)

    def test_hyphenated_grounded_duration_passes(self) -> None:
        tip = "You had a 59-second supply block."
        allowed = "Supply-blocked (food-capped) for 59s — critical"
        assert is_grounded(tip, allowed)

    def test_grounded_seconds_number_passes(self) -> None:
        tip = "Your hero came 30s late."
        allowed = "Hero at 2:00, 30s late — minor"
        assert is_grounded(tip, allowed)

    def test_seconds_digit_present_elsewhere_passes(self) -> None:
        # "3" appears in allowed as "3:00" so digit check passes (we accept FN)
        tip = "3 seconds late is within minor range."
        allowed = "Hero level at 3:00 — info"
        assert is_grounded(tip, allowed)


# ---------------------------------------------------------------------------
# Category (c) — percentages
# ---------------------------------------------------------------------------


class TestPercentages:
    def test_grounded_percentage_passes(self) -> None:
        tip = "Your worker efficiency was 70% of the ideal rate."
        allowed = "Worker production gap: 70% idle time — major"
        assert is_grounded(tip, allowed)

    def test_ungrounded_percentage_flagged(self) -> None:
        tip = "You were 99% sure to win if you had expanded."
        allowed = "No expansion taken (expected by 5:30) — critical"
        offenders = find_ungrounded_numbers(tip, allowed)
        assert any("99" in o for o in offenders)

    def test_space_before_percent_in_tip_handled(self) -> None:
        # "70 %" should be normalised to "70%" and then matched
        tip = "Efficiency was 70 % of ideal."
        allowed = "Worker production gap: 70% idle time — major"
        assert is_grounded(tip, allowed)


# ---------------------------------------------------------------------------
# Category (d) — resource figures
# ---------------------------------------------------------------------------


class TestResourceFigures:
    def test_grounded_gold_per_second_passes(self) -> None:
        tip = "You were farming at 20 gold/s during the lull."
        allowed = "Economy context: 20 gold/s expected at this point."
        assert is_grounded(tip, allowed)

    def test_ungrounded_gold_figure_flagged(self) -> None:
        tip = "You missed out on 500 gold by not expanding."
        allowed = "No expansion taken (expected by 5:30) — critical"
        offenders = find_ungrounded_numbers(tip, allowed)
        assert any("500" in o for o in offenders)

    def test_grounded_lumber_figure_passes(self) -> None:
        tip = "The upgrade costs 75 lumber."
        allowed = "T2 upgrade costs 75 lumber — reference"
        assert is_grounded(tip, allowed)

    def test_thousands_separated_gold_is_normalised(self) -> None:
        # "1,800 gold" in tip should match "1800 gold" in allowed after normalisation
        tip = "You spent 1,800 gold on upgrades."
        allowed = "Total gold expenditure: 1800 gold — reference"
        assert is_grounded(tip, allowed)


# ---------------------------------------------------------------------------
# False-positive guard — bare integers must NOT be flagged
# ---------------------------------------------------------------------------


class TestFalsePositiveGuard:
    def test_level_number_not_flagged(self) -> None:
        # "level 3" — bare integer, should never be flagged by any category
        tip = "Your hero was level 3 by the fight."
        # "3" not in allowed, but that's fine — bare ints are excluded
        allowed = "Hero at 2:15 — minor"
        assert is_grounded(tip, allowed)

    def test_tier_number_not_flagged(self) -> None:
        tip = "You need to reach tier 2 faster."
        allowed = "T2 upgrade never started — major"
        assert is_grounded(tip, allowed)

    def test_ability_count_not_flagged(self) -> None:
        tip = "Put 3 abilities on your hero early."
        allowed = "Hero level at 5min: 1 (2 below expected) — critical"
        assert is_grounded(tip, allowed)

    def test_ordinal_rank_not_flagged(self) -> None:
        tip = "This is the 1st priority fix for your game."
        allowed = "First hero at 2:15 — minor"
        assert is_grounded(tip, allowed)


# ---------------------------------------------------------------------------
# _clean_fallback_detail
# ---------------------------------------------------------------------------


class TestCleanFallbackDetail:
    def test_strips_critical_tail(self) -> None:
        s = "Hero reached level 3 at 6:46, 136s late (expected 4:30) — critical"
        assert _clean_fallback_detail(s) == (
            "Hero reached level 3 at 6:46, 136s late (expected 4:30)"
        )

    def test_strips_major_with_extra_words(self) -> None:
        s = "First hero at 2:09, 67s late (expected 1:02) — major"
        assert _clean_fallback_detail(s).endswith("(expected 1:02)")

    def test_leaves_neutral_summary_untouched(self) -> None:
        s = "No expansion taken — 1-base play (standard for Orc; only worth noting in very long games)"
        # '— 1-base' is not a severity word, so nothing is stripped.
        assert _clean_fallback_detail(s) == s


# ---------------------------------------------------------------------------
# _ground_tips helper
# ---------------------------------------------------------------------------


class TestGroundTips:
    def _allowed(self) -> str:
        return (
            "No expansion taken (expected by 5:30) — critical economic deficit\n"
            "T2 (Stronghold) at 3:50, 110s late — major\n"
            "Standard Orc expand around 5:30 in OvNE matchup guide text."
        )

    def _problems(self) -> list[ScoredProblem]:
        return [
            _make_problem(
                metric="expansion_timing",
                summary="No expansion taken (expected by 5:30) — critical economic deficit",
            ),
            _make_problem(
                metric="tier2_timing",
                severity="major",
                score=14.0,
                value=230_000.0,
                expected=120_000.0,
                delta=110_000.0,
                summary="T2 (Stronghold) at 3:50, 110s late — major",
            ),
        ]

    def test_ungrounded_detail_is_replaced_with_summary(self) -> None:
        tips = [
            _make_tip(
                priority=1,
                title="Take your expansion",
                detail="You should have expanded at 7:15 but never did.",  # 7:15 fabricated
            )
        ]
        result = _ground_tips(tips, self._problems(), self._allowed())
        assert len(result) == 1
        # Fallback detail = the summary with its '— <severity>' jargon tail stripped.
        assert result[0].detail == "No expansion taken (expected by 5:30)"
        # Title was not ungrounded, so it is preserved
        assert result[0].title == "Take your expansion"

    def test_ungrounded_title_is_replaced_with_metric_title_case(self) -> None:
        tips = [
            _make_tip(
                priority=1,
                title="Expand by 7:15 to win",  # 7:15 is fabricated
                detail="No expansion taken (expected by 5:30).",  # grounded
            )
        ]
        result = _ground_tips(tips, self._problems(), self._allowed())
        assert result[0].title == "Expansion Timing"

    def test_grounded_tip_returned_unchanged(self) -> None:
        tips = [
            _make_tip(
                priority=1,
                title="Take your expansion",
                detail="No expansion taken (expected by 5:30) — fix this ASAP.",
            )
        ]
        result = _ground_tips(tips, self._problems(), self._allowed())
        assert result[0].detail == (
            "No expansion taken (expected by 5:30) — fix this ASAP."
        )
        assert result[0].title == "Take your expansion"

    def test_tip_beyond_problems_list_passed_through(self) -> None:
        # 3 tips but only 2 problems — tip at priority 3 has no matching problem
        tips = [
            _make_tip(priority=1, detail="No expansion taken (expected by 5:30)."),
            _make_tip(priority=2, detail="T2 (Stronghold) at 3:50, 110s late."),
            _make_tip(priority=3, detail="Extra tip with 9:99 fabricated time."),
        ]
        result = _ground_tips(tips, self._problems(), self._allowed())
        # First two processed, third passed through as-is (no problem to replace with)
        assert len(result) == 3
        assert result[2].detail == "Extra tip with 9:99 fabricated time."

    def test_priority_tms_related_preserved_after_replacement(self) -> None:
        tips = [
            _make_tip(
                priority=1,
                title="Expand early",
                detail="Expansion should happen at 7:15.",  # fabricated
                t_ms=330_000,
                related=["expansion_timing"],
            )
        ]
        result = _ground_tips(tips, self._problems(), self._allowed())
        assert result[0].priority == 1
        assert result[0].t_ms == 330_000
        assert result[0].related_benchmarks == ["expansion_timing"]

    def test_both_title_and_detail_ungrounded_both_replaced(self) -> None:
        tips = [
            _make_tip(
                priority=1,
                title="Expand at 7:15 for win",  # fabricated time
                detail="You missed expansion which cost 500 gold.",  # fabricated resource
            )
        ]
        result = _ground_tips(tips, self._problems(), self._allowed())
        # Both were bad → both replaced (detail = summary minus severity tail)
        assert result[0].title == "Expansion Timing"
        assert result[0].detail == "No expansion taken (expected by 5:30)"

    def test_second_tip_replacement_uses_correct_problem(self) -> None:
        tips = [
            _make_tip(
                priority=1,
                detail="No expansion taken (expected by 5:30).",  # grounded
            ),
            _make_tip(
                priority=2,
                detail="T2 should have been 9:00 not 3:50.",  # 9:00 fabricated
            ),
        ]
        result = _ground_tips(tips, self._problems(), self._allowed())
        assert result[0].detail == "No expansion taken (expected by 5:30)."
        # second tip replaced with the tier2_timing summary (severity tail stripped)
        assert result[1].detail == "T2 (Stronghold) at 3:50, 110s late"

    def test_empty_tips_returns_empty(self) -> None:
        assert _ground_tips([], self._problems(), self._allowed()) == []

    def test_empty_problems_passes_all_tips_through(self) -> None:
        # No problems → all tips beyond len(problems) are passed through
        tips = [_make_tip(priority=1, detail="Fabricated 7:15 time here.")]
        result = _ground_tips(tips, [], self._allowed())
        assert len(result) == 1
        assert result[0].detail == "Fabricated 7:15 time here."
