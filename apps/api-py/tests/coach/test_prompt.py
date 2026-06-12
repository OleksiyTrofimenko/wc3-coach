"""
Unit tests for the prompt builder (app/coach/prompt.py).

NO live DB or Ollama.  All tests are pure synchronous.

Coverage
--------
- build_messages returns exactly 2 messages: system + user
- System message contains no-hallucination / Principle-#4 instructions
- System message contains the "Use ONLY" constraint
- System message mentions not inventing timings / numbers
- User CONTEXT section: matchup, map, result, duration as M:SS
- User FACTS section: each problem's summary is present, metric name present
- User REFERENCE MATERIAL section: chunk text and doc_title present
- User TASK section is present
- Duration M:SS formatting (_fmt_duration helper via build_messages)
- Empty problems → clean-game placeholder in FACTS
- Empty chunks → fallback text in REFERENCE MATERIAL
- Roles are "system" and "user" in correct order
"""

from __future__ import annotations

import pytest

from app.benchmarks.models import BenchmarkResult
from app.benchmarks.scoring import ScoredProblem, _make_summary  # noqa: PLC2701
from app.coach.prompt import build_messages
from app.rag.models import RetrievedChunk

# ---------------------------------------------------------------------------
# Fixture helpers
# ---------------------------------------------------------------------------


def _problem(
    metric: str = "expansion_timing",
    severity: str = "critical",
    score: float = 30.0,
    value: float = -1.0,
    expected: float = 330_000.0,
    delta: float | None = None,
    summary: str | None = None,
) -> ScoredProblem:
    """Build a minimal ScoredProblem for prompt tests."""
    if summary is None:
        # Use _make_summary via a real BenchmarkResult to get a realistic string
        br = BenchmarkResult(
            replayId="test",
            slot=1,
            metric=metric,
            value=value,
            expected=expected,
            delta=delta,
            severity=severity,  # type: ignore[arg-type]
        )
        summary = _make_summary(br)

    return ScoredProblem(
        metric=metric,
        severity=severity,  # type: ignore[arg-type]
        score=score,
        delta=delta,
        value=value,
        expected=expected,
        summary=summary,
    )


def _chunk(
    chunk_text: str = "Standard Orc expand around 5:30.",
    doc_title: str = "OvNE Matchup Guide",
    matchup: str | None = "OvNE",
    distance: float = 0.1,
) -> RetrievedChunk:
    return RetrievedChunk(
        chunkText=chunk_text,
        docTitle=doc_title,
        matchup=matchup,
        distance=distance,
        score=1.0 - distance,
    )


# ---------------------------------------------------------------------------
# Message structure
# ---------------------------------------------------------------------------


class TestMessageStructure:
    def test_returns_two_messages(self) -> None:
        msgs = build_messages("OvNE", "Shallow Grave", "loss", 680_000, [], [])
        assert len(msgs) == 2

    def test_first_message_is_system(self) -> None:
        msgs = build_messages("OvNE", "Shallow Grave", "loss", 680_000, [], [])
        assert msgs[0]["role"] == "system"

    def test_second_message_is_user(self) -> None:
        msgs = build_messages("OvNE", "Shallow Grave", "loss", 680_000, [], [])
        assert msgs[1]["role"] == "user"

    def test_messages_have_content_key(self) -> None:
        msgs = build_messages("OvNE", "Shallow Grave", "loss", 680_000, [], [])
        for msg in msgs:
            assert "content" in msg
            assert len(msg["content"]) > 0


# ---------------------------------------------------------------------------
# System message — anti-hallucination / Principle #4
# ---------------------------------------------------------------------------


class TestSystemMessage:
    def _sys(self) -> str:
        msgs = build_messages("OvH", "Echo Isles", "unknown", 400_000, [], [])
        return msgs[0]["content"]

    def test_use_only_constraint_present(self) -> None:
        assert "ONLY" in self._sys()

    def test_no_invent_timings_instruction_present(self) -> None:
        sys_content = self._sys().lower()
        normalised = sys_content.replace("don't", "do not")
        assert "invent" in sys_content or "do not" in normalised

    def test_numbers_not_to_be_invented(self) -> None:
        sys_content = self._sys()
        # The system message should mention not inventing numbers or timings
        assert "numbers" in sys_content.lower() or "timings" in sys_content.lower()

    def test_output_format_specified(self) -> None:
        sys_content = self._sys()
        assert "tip" in sys_content.lower()
        has_count = "3" in sys_content or "3-5" in sys_content
        assert has_count or "five" in sys_content.lower()

    def test_grounded_in_facts_requirement(self) -> None:
        sys_content = self._sys().lower()
        assert "fact" in sys_content or "material" in sys_content

    def test_other_matchup_material_guard_present(self) -> None:
        # The model must be told to ignore reference material about other
        # opponent races (timings.md etc. are matchup-agnostic and leak them).
        sys_content = self._sys().lower()
        assert "opponent" in sys_content
        assert "other" in sys_content

    def test_time_format_instruction_present(self) -> None:
        # Times must be M:SS, never raw milliseconds.
        sys_content = self._sys().lower()
        assert "m:ss" in sys_content
        assert "millisecond" in sys_content


# ---------------------------------------------------------------------------
# User message — CONTEXT section
# ---------------------------------------------------------------------------


class TestContextSection:
    def _user(
        self,
        matchup: str = "OvNE",
        map_name: str = "Shallow Grave",
        result: str = "loss",
        duration_ms: int = 680_000,
    ) -> str:
        msgs = build_messages(matchup, map_name, result, duration_ms, [], [])
        return msgs[1]["content"]

    def test_matchup_present(self) -> None:
        assert "OvNE" in self._user(matchup="OvNE")

    def test_map_name_present(self) -> None:
        assert "Shallow Grave" in self._user(map_name="Shallow Grave")

    def test_result_present(self) -> None:
        assert "loss" in self._user(result="loss")
        assert "win" in self._user(result="win")

    def test_duration_formatted_as_mss(self) -> None:
        # 680 000 ms = 11:20
        content = self._user(duration_ms=680_000)
        assert "11:20" in content

    def test_duration_zero(self) -> None:
        content = self._user(duration_ms=0)
        assert "0:00" in content

    def test_duration_exact_minute(self) -> None:
        # 600 000 ms = 10:00
        content = self._user(duration_ms=600_000)
        assert "10:00" in content

    def test_duration_one_second(self) -> None:
        content = self._user(duration_ms=1_000)
        assert "0:01" in content

    def test_context_section_header_present(self) -> None:
        assert "CONTEXT" in self._user()

    def test_opponent_race_spelled_out(self) -> None:
        # CONTEXT must name the opponent race so the model doesn't guess it
        # from the (to it, opaque) matchup code.
        assert "Night Elf" in self._user(matchup="OvNE")
        assert "Human" in self._user(matchup="OvH")
        assert "Undead" in self._user(matchup="OvUD")

    def test_unknown_matchup_opponent_is_unknown(self) -> None:
        assert "Unknown" in self._user(matchup="unknown")


# ---------------------------------------------------------------------------
# User message — FACTS section
# ---------------------------------------------------------------------------


class TestFactsSection:
    def _user(
        self, problems: list[ScoredProblem] | None = None
    ) -> str:
        if problems is None:
            problems = [_problem()]
        msgs = build_messages("OvNE", "Test Map", "loss", 600_000, problems, [])
        return msgs[1]["content"]

    def test_facts_section_header_present(self) -> None:
        assert "FACTS" in self._user()

    def test_problem_summary_in_facts(self) -> None:
        p = _problem(metric="expansion_timing", value=-1.0, expected=330_000)
        user = self._user([p])
        assert "expansion" in user.lower() or "No expansion" in user

    def test_metric_name_in_facts(self) -> None:
        p = _problem(
            metric="tier2_timing", value=250_000, expected=130_000, delta=120_000
        )
        user = self._user([p])
        assert "tier2_timing" in user

    def test_severity_in_facts(self) -> None:
        p = _problem(severity="critical")
        user = self._user([p])
        assert "CRITICAL" in user or "critical" in user

    def test_impact_score_in_facts(self) -> None:
        p = _problem(score=30.0)
        user = self._user([p])
        assert "30" in user

    def test_multiple_problems_all_present(self) -> None:
        p1 = _problem(metric="expansion_timing", value=-1.0, expected=330_000)
        p2 = _problem(
            metric="tier2_timing", value=250_000, expected=130_000,
            delta=120_000, severity="critical", score=21.0,
        )
        user = self._user([p1, p2])
        assert "expansion_timing" in user
        assert "tier2_timing" in user

    def test_empty_problems_produces_clean_game_placeholder(self) -> None:
        user = self._user([])
        assert "clean" in user.lower() or "no significant" in user.lower()


# ---------------------------------------------------------------------------
# User message — REFERENCE MATERIAL section
# ---------------------------------------------------------------------------


class TestReferenceMaterialSection:
    def _user(self, chunks: list[RetrievedChunk] | None = None) -> str:
        if chunks is None:
            chunks = [_chunk()]
        msgs = build_messages("OvNE", "Test Map", "loss", 600_000, [], chunks)
        return msgs[1]["content"]

    def test_reference_material_header_present(self) -> None:
        assert "REFERENCE MATERIAL" in self._user()

    def test_chunk_text_in_material(self) -> None:
        c = _chunk(chunk_text="Orc should expand at 5:30 in OvNE.")
        user = self._user([c])
        assert "5:30" in user

    def test_doc_title_in_material(self) -> None:
        c = _chunk(doc_title="OvNE Matchup Strategy")
        user = self._user([c])
        assert "OvNE Matchup Strategy" in user

    def test_multiple_chunks_all_present(self) -> None:
        c1 = _chunk(chunk_text="First chunk text.", doc_title="Guide A")
        c2 = _chunk(chunk_text="Second chunk text.", doc_title="Guide B")
        user = self._user([c1, c2])
        assert "First chunk text." in user
        assert "Second chunk text." in user

    def test_empty_chunks_produces_fallback(self) -> None:
        user = self._user([])
        assert "no reference material" in user.lower()


# ---------------------------------------------------------------------------
# User message — TASK section
# ---------------------------------------------------------------------------


class TestHeroesContext:
    def test_heroes_rendered_in_context(self) -> None:
        msgs = build_messages(
            "OvH", "Echo Isles", "win", 720_000, [], [],
            heroes=["Far Seer", "Tauren Chieftain"],
        )
        user = msgs[1]["content"]
        assert "Far Seer" in user
        assert "Tauren Chieftain" in user

    def test_no_heroes_renders_safe_placeholder(self) -> None:
        msgs = build_messages("OvH", "Echo Isles", "win", 720_000, [], [])
        user = msgs[1]["content"]
        assert "not detected" in user.lower()

    def test_system_rule_bans_inventing_heroes(self) -> None:
        msgs = build_messages("OvH", "Echo Isles", "win", 720_000, [], [])
        sys_content = msgs[0]["content"].lower()
        assert "hero" in sys_content
        # Rule 9 explicitly forbids inventing hero names.
        assert "invent a hero" in sys_content or "never name a hero" in sys_content


class TestTaskSection:
    def test_task_section_present(self) -> None:
        msgs = build_messages("OvNE", "Test Map", "loss", 600_000, [], [])
        user = msgs[1]["content"]
        assert "TASK" in user

    def test_tip_count_requirement_in_task(self) -> None:
        msgs = build_messages("OvNE", "Test Map", "loss", 600_000, [], [])
        user = msgs[1]["content"]
        assert "3" in user or "tip" in user.lower()


# ---------------------------------------------------------------------------
# Duration formatting edge cases
# ---------------------------------------------------------------------------


class TestDurationFormatting:
    @pytest.mark.parametrize(
        "ms,expected_str",
        [
            (0, "0:00"),
            (1_000, "0:01"),
            (59_000, "0:59"),
            (60_000, "1:00"),
            (330_000, "5:30"),
            (680_000, "11:20"),
            (3_600_000, "60:00"),
        ],
    )
    def test_duration_format(self, ms: int, expected_str: str) -> None:
        msgs = build_messages("OvNE", "X", "unknown", ms, [], [])
        user = msgs[1]["content"]
        assert expected_str in user
