"""
Deviation scoring and prioritization for the benchmark engine.

T3.3 — pure rules/weights, NO ML.

Design
------
The engine emits a flat list[BenchmarkResult] with severity already set.
This module applies a second layer: per-metric impact weights reflect how much
each mistake actually costs an Orc player a game.  The product of weight ×
severity multiplier × magnitude factor yields a single score; the top N results
by score are returned as ScoredProblem objects for the LLM coach (T5.3).

All weights are documented in:
  .claude/skills/wc3-knowledge/scoring.md
Numbers here MUST stay identical to that file. Any tuning updates both together.

Scope
-----
- Orc coaching only ("Orc sanctuary" project rule).
- Patch 2.0.  Weights are not yet corpus-validated; XGBoost is a future task.
- No I/O.  Pure functions, no DB, no side effects, fully deterministic.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.benchmarks.models import BenchmarkResult, BenchmarkSeverity

# ---------------------------------------------------------------------------
# Impact weight table
#
# Scale: 0–10.  10 = "almost always the primary reason you lose."
# Source and rationale: .claude/skills/wc3-knowledge/scoring.md
# Patch: 2.0
# ---------------------------------------------------------------------------

# Metrics not in this dict default to weight 1.0 (present but low-impact).
IMPACT_WEIGHTS: dict[str, float] = {
    # Economy
    # expansion_timing was 10.0 (highest) — recalibrated to 3.0 on 2026-06-12:
    # Orc is the 1-base aggression race, so expansion is situational, not a
    # game-deciding timing. It must never be the auto-top problem. See scoring.md.
    "expansion_timing":              3.0,
    "worker_production_gap_approx":  8.0,
    "tier2_timing":                  7.0,
    "worker_count_approx_10min":     6.0,

    # Hero progression
    "hero_level3_timing":            5.0,
    "first_hero_timing":             4.0,
    "hero_level_at_5min":            3.0,
    "hero_level_at_8min":            3.0,
    "hero_level_at_10min":           2.0,

    # Late-game tech
    "tier3_timing":                  2.0,
}

# ---------------------------------------------------------------------------
# Severity → multiplier
# Source: scoring.md "Severity multipliers"
# ---------------------------------------------------------------------------

_SEVERITY_MULTIPLIER: dict[BenchmarkSeverity, float] = {
    "info":     0.0,   # excluded from scoring
    "minor":    0.5,
    "major":    1.0,
    "critical": 2.0,
}

# Ordinal for tie-breaking (higher = more severe)
_SEVERITY_ORDINAL: dict[BenchmarkSeverity, int] = {
    "info":     0,
    "minor":    1,
    "major":    2,
    "critical": 3,
}

# Magnitude factor for absent-event results (value == -1, delta is None).
# Applied when the event simply never happened.  Worse than "barely inside
# critical tier", less than "massively beyond it".
_ABSENT_MAGNITUDE: float = 1.5


def _magnitude_factor(result: BenchmarkResult) -> float:
    """
    Within-tier magnitude factor: scales how far within the severity band the
    deviation sits.  Returns a value ≥ 1.0 (tier boundary) with a cap of 3.0.

    Logic
    -----
    Absent-event (value == -1, delta is None) → fixed factor of 1.5.

    Time-based metrics: delta in ms, positive = late.
        minor tier   starts at 30 000 ms  → magnitude = delta / 30 000
        major tier   starts at 60 000 ms  → magnitude = delta / 60 000
        critical tier starts at 120 000 ms → magnitude = delta / 120 000, cap 3.0

    Level/count metrics: delta negative = behind reference.
        minor  (delta == -1) → 1.0
        major  (delta == -2) → 2.0
        critical (≤ -3)      → abs(delta) / 3.0, cap 3.0

    Worker gap (worker_production_gap_approx): value is the idle-proxy in ms,
    delta == value.  Treated as a time-based metric.
    """
    if result.value == -1 or result.delta is None:
        # Absent event — fixed magnitude
        return _ABSENT_MAGNITUDE

    delta = result.delta
    sev = result.severity

    # Level/count metrics: negative delta = behind reference.
    # These metrics have small integer deltas, so we treat |delta| directly.
    _level_metrics = {
        "hero_level_at_5min",
        "hero_level_at_8min",
        "hero_level_at_10min",
        "worker_count_approx_10min",
    }
    if result.metric in _level_metrics:
        abs_delta = abs(delta)
        if sev == "minor":
            return 1.0
        if sev == "major":
            return min(abs_delta / 1.0, 3.0)  # typically 2.0 for delta==-2
        if sev == "critical":
            return min(abs_delta / 3.0 * 1.0, 3.0)
        return 1.0  # info — unreachable due to early return in score_deviation

    # Time-based metrics (ms).  Only positive delta is penalised.
    if sev == "minor":
        return max(1.0, delta / 30_000)
    if sev == "major":
        return max(1.0, delta / 60_000)
    if sev == "critical":
        return min(max(1.0, delta / 120_000), 3.0)

    return 1.0  # info — unreachable


def score_deviation(result: BenchmarkResult) -> float:
    """
    Compute the impact score for a single BenchmarkResult.

    Returns 0.0 for severity=='info' (never surfaces in prioritization).

    Formula: impact_weight × severity_multiplier × magnitude_factor
    Maximum theoretical: 10 × 2.0 × 3.0 = 60.0
    """
    sev_mult = _SEVERITY_MULTIPLIER[result.severity]
    if sev_mult == 0.0:
        return 0.0

    weight = IMPACT_WEIGHTS.get(result.metric, 1.0)
    magnitude = _magnitude_factor(result)

    return weight * sev_mult * magnitude


# ---------------------------------------------------------------------------
# ScoredProblem — structured output for the LLM coach
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class ScoredProblem:
    """
    One prioritized problem for the LLM coach.

    Fields
    ------
    metric   : Metric name (e.g. 'expansion_timing').
    severity : 'minor' | 'major' | 'critical'.
    score    : Impact score (higher = more impactful to surface).
    delta    : Raw deviation from reference (ms for time metrics, levels for
               level metrics). None for absent-event results.
    value    : Actual measured value.
    expected : Reference value. None when no reference exists for the matchup.
    summary  : Short English description of the deviation.  NOT LLM prose —
               structured template for the coach to build a tip from.
    """

    metric: str
    severity: BenchmarkSeverity
    score: float
    delta: float | None
    value: float
    expected: float | None
    summary: str


def _make_summary(result: BenchmarkResult) -> str:
    """
    Generate a short structured English summary of the deviation.

    Produces template-driven text — no LLM.  Enough information for the
    coach (T5.3) to write an actionable tip without needing the raw numbers.
    """
    sev = result.severity
    metric = result.metric
    value_ms = int(result.value)
    expected_ms = int(result.expected) if result.expected is not None else None

    def _fmt_ms(ms: int) -> str:
        """Format ms as M:SS."""
        total_s = ms // 1000
        return f"{total_s // 60}:{total_s % 60:02d}"

    # --- Absent event (value == -1) ---
    if value_ms == -1:
        if metric == "expansion_timing":
            # Orc 1-base play is standard — absent expansion is NOT a deficit.
            # This only surfaces at severity 'minor' for 18+ min games; the
            # wording stays neutral so the coach never frames it as a mistake.
            return (
                "No expansion taken — 1-base play (standard for Orc; only "
                "worth noting in very long games)"
            )
        if metric == "tier2_timing":
            exp_str = (
                f" (expected by {_fmt_ms(expected_ms)})"
                if expected_ms is not None else ""
            )
            return f"T2 upgrade never started{exp_str}"
        if metric == "tier3_timing":
            return "T3 upgrade never started in a long game"
        if metric == "first_hero_timing":
            return "No hero produced — creep route and XP completely missed"
        if metric == "hero_level3_timing":
            return "Hero never reached level 3 — major power-spike deficit"
        return f"{metric} event absent"

    # --- Present event with delta ---
    delta = result.delta
    if delta is None:
        # No reference for this matchup — info, should not appear in top-N
        return f"{metric}: {value_ms} ms (no reference for matchup)"

    # Time-based metrics
    if metric == "expansion_timing":
        delta_s = int(delta / 1000)
        sign = "late" if delta > 0 else "early"
        exp_str = (
            f"expected {_fmt_ms(expected_ms)}"
            if expected_ms is not None else "no reference"
        )
        return (
            f"Expansion at {_fmt_ms(value_ms)}, {abs(delta_s)}s {sign} "
            f"({exp_str}) — {sev}"
        )

    if metric == "tier2_timing":
        delta_s = int(delta / 1000)
        sign = "late" if delta > 0 else "early"
        exp_str = (
            f"expected {_fmt_ms(expected_ms)}"
            if expected_ms is not None else "no reference"
        )
        return (
            f"T2 (Stronghold) at {_fmt_ms(value_ms)}, {abs(delta_s)}s {sign} "
            f"({exp_str}) — {sev}"
        )

    if metric == "tier3_timing":
        delta_s = int(delta / 1000)
        sign = "late" if delta > 0 else "early"
        return (
            f"T3 (Fortress) at {_fmt_ms(value_ms)}, {abs(delta_s)}s {sign} "
            f"({f'expected {_fmt_ms(expected_ms)}' if expected_ms else 'no reference'}) "
            f"— {sev}"
        )

    if metric == "first_hero_timing":
        delta_s = int(delta / 1000)
        sign = "late" if delta > 0 else "early"
        return (
            f"First hero at {_fmt_ms(value_ms)}, {abs(delta_s)}s {sign} "
            f"({f'expected {_fmt_ms(expected_ms)}' if expected_ms else 'no reference'}) "
            f"— {sev}"
        )

    if metric == "hero_level3_timing":
        delta_s = int(delta / 1000)
        sign = "late" if delta > 0 else "early"
        return (
            f"Hero reached level 3 at {_fmt_ms(value_ms)}, {abs(delta_s)}s {sign} "
            f"({f'expected {_fmt_ms(expected_ms)}' if expected_ms else 'no reference'}) "
            f"— {sev}"
        )

    if metric == "worker_production_gap_approx":
        gap_s = int(result.value / 1000)
        return (
            f"Longest worker-production idle gap: {gap_s}s "
            f"(ideal ≈ 0s) — {sev}"
        )

    if metric.startswith("worker_count_approx"):
        actual = int(result.value)
        expected_count = int(result.expected) if result.expected is not None else None
        delta_count = int(delta)
        sign = "below" if delta < 0 else "above"
        exp_str = (
            f"expected {expected_count}"
            if expected_count is not None else "no reference"
        )
        return (
            f"Worker count at {metric.removeprefix('worker_count_approx_')}: "
            f"{actual} ({abs(delta_count)} {sign} reference of {exp_str}) — {sev}"
        )

    if metric.startswith("hero_level_at_"):
        checkpoint = metric.removeprefix("hero_level_at_")
        actual_level = int(result.value)
        exp_level = int(result.expected) if result.expected is not None else None
        delta_level = int(delta)
        sign = "below" if delta < 0 else "above"
        exp_str = f"expected {exp_level}" if exp_level is not None else "no reference"
        return (
            f"Hero level at {checkpoint}: {actual_level} "
            f"({abs(delta_level)} {sign} {exp_str}) — {sev}"
        )

    # Fallback for any future metrics
    return f"{metric}: value={result.value:.0f}, delta={delta:+.0f} — {sev}"


# ---------------------------------------------------------------------------
# Prioritization
# ---------------------------------------------------------------------------

def prioritize(
    results: list[BenchmarkResult],
    top_n: int = 5,
    orc_slot: int | None = None,
) -> list[ScoredProblem]:
    """
    Return the top N most impactful problems for the Orc player.

    Parameters
    ----------
    results  : Flat list from run_benchmarks() — all players, all metrics.
    top_n    : How many problems to return (default 5).
    orc_slot : If provided, filter to only this slot.  If None, include all
               results with severity > info (useful in unit tests; callers
               responsible for passing the Orc player's slot in production).

    Returns
    -------
    Ordered list[ScoredProblem], highest score first.
    Ties broken by (severity ordinal descending, metric name ascending) for
    deterministic output across all runs.

    Notes
    -----
    - info-severity items are always excluded (score == 0.0).
    - top_n == 0 returns an empty list.
    """
    if top_n <= 0:
        return []

    # Filter by slot if specified
    candidates = (
        [r for r in results if r.slot == orc_slot]
        if orc_slot is not None
        else list(results)
    )

    # Score and exclude info items
    scored: list[tuple[float, BenchmarkResult]] = []
    for r in candidates:
        s = score_deviation(r)
        if s > 0.0:
            scored.append((s, r))

    # Sort: score descending, then severity ordinal descending, then metric name asc
    scored.sort(
        key=lambda t: (-t[0], -_SEVERITY_ORDINAL[t[1].severity], t[1].metric)
    )

    # Build ScoredProblem objects for the top N
    problems: list[ScoredProblem] = []
    for score, result in scored[:top_n]:
        problems.append(
            ScoredProblem(
                metric=result.metric,
                severity=result.severity,
                score=round(score, 4),
                delta=result.delta,
                value=result.value,
                expected=result.expected,
                summary=_make_summary(result),
            )
        )

    return problems
