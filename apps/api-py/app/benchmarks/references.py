"""
Seed reference values for benchmark comparisons.

Provenance: High-ladder community knowledge, W3Champions analyses.
Patch: 2.0 (Reforged 2.00, build 6117).
Source file: .claude/skills/wc3-knowledge/timings.md
Added by Strategist in T3.1.

Design
------
- A ReferenceKey = (matchup, race, metric).
  matchup is always the canonical two-race code with the ANALYSED player's
  race listed first, e.g. 'OvNE' for an Orc player in an Orc-vs-NE game.
  Race IDs match the ontology: 'orc', 'nightelf', 'human', 'undead'.
- When no reference exists for a (matchup, race, metric) triple, callers
  receive None for both expected and severity → they must emit severity='info'.
- All time values are in milliseconds. Level/count values are dimensionless.

Severity thresholds (T3.1)
--------------------------
Time-based metrics (delta = ms late relative to expected):
  info     : |delta| < 30 000 ms   (< 30 s)
  minor    : 30 000 ≤ |delta| < 60 000 ms
  major    : 60 000 ≤ |delta| < 120 000 ms
  critical : |delta| ≥ 120 000 ms  (≥ 2 min)

Level/count metrics (delta = actual − expected):
  info     : delta ≥ 0 (on or ahead of reference)
  minor    : delta == −1
  major    : delta == −2
  critical : delta ≤ −3

Absent-expansion special case:
  game_duration > 480 000 ms (8 min) and no expansion → critical
  game_duration ≤ 480 000 ms          and no expansion → major
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from app.benchmarks.models import BenchmarkSeverity

# ---------------------------------------------------------------------------
# Internal reference table
# ---------------------------------------------------------------------------

# matchup codes — always analysed-race-first
# 'OvNE' = Orc player analysed, opponent is Night Elf
# 'NEvO' = Night Elf player analysed, opponent is Orc
# 'OvH'  = Orc player analysed, opponent is Human
# 'HvO'  = Human player analysed, opponent is Orc
# 'OvUD' = Orc player analysed, opponent is Undead
# 'UDvO' = Undead player analysed, opponent is Orc

# race_id values match ontology (race:orc → 'orc', etc.)
RaceId = Literal["orc", "nightelf", "human", "undead", "random"]
MatchupCode = str  # e.g. 'OvNE'


@dataclass(frozen=True)
class ReferenceEntry:
    """One reference value with its natural window (for severity calculation)."""

    expected: float
    # window is used only for documentation; severity calc uses global thresholds
    window_ms: float
    notes: str


# A reference table maps (matchup_code, race_id, metric) → ReferenceEntry.
# The benchmark engine stays PURE: instead of reaching into a module global at
# call time, callers may inject a table loaded from the DB (T-step #1, DB-backed
# references). When no table is injected, the in-code seed below is used — this
# is also the seed source for the DB and the default for unit tests.
ReferenceTable = dict[tuple[str, str, str], ReferenceEntry]


# Seed reference table — the source of truth for the DB seed, the fallback when
# the DB has no reference rows, and the default lookup table for unit tests.
_SEED_REFERENCE_TABLE: ReferenceTable = {

    # -----------------------------------------------------------------------
    # OvNE — Orc (analysed player is Orc)
    # -----------------------------------------------------------------------
    ("OvNE", "orc", "first_hero_timing"): ReferenceEntry(
        expected=62_000, window_ms=15_000,
        notes="Altar 60 s build + a few seconds queue; standard Blademaster opener",
    ),
    ("OvNE", "orc", "tier2_timing"): ReferenceEntry(
        expected=130_000, window_ms=20_000,
        notes="Stronghold upgrade starts ~2:10 in standard OvNE opener",
    ),
    ("OvNE", "orc", "tier3_timing"): ReferenceEntry(
        expected=420_000, window_ms=60_000,
        notes="Fortress at ~7:00; only in long games",
    ),
    ("OvNE", "orc", "expansion_timing"): ReferenceEntry(
        expected=480_000, window_ms=120_000,
        notes="Informational anchor only; 1-base Orc is standard meta. FE "
              "variant ~5:00-6:00; absent expansion scores info, never a "
              "penalty (2026-06-12 calibration)",
    ),
    ("OvNE", "orc", "hero_level3_timing"): ReferenceEntry(
        expected=240_000, window_ms=30_000,
        notes="Blademaster hits 3 after 2–3 creep camps by 4:00",
    ),
    ("OvNE", "orc", "hero_level5_timing"): ReferenceEntry(
        expected=480_000, window_ms=60_000,
        notes="Level 5 in full T2 engagement at ~8:00",
    ),

    # -----------------------------------------------------------------------
    # NEvO — Night Elf (analysed player is Night Elf)
    # -----------------------------------------------------------------------
    ("NEvO", "nightelf", "first_hero_timing"): ReferenceEntry(
        expected=62_000, window_ms=15_000,
        notes="Altar 60 s + queue; Demon Hunter or Tavern hero",
    ),
    ("NEvO", "nightelf", "tier2_timing"): ReferenceEntry(
        expected=150_000, window_ms=20_000,
        notes="Tree of Ages starts ~2:30 in standard NEvO opener",
    ),
    ("NEvO", "nightelf", "tier3_timing"): ReferenceEntry(
        expected=450_000, window_ms=60_000,
        notes="Tree of Eternity at ~7:30; late-game only",
    ),
    ("NEvO", "nightelf", "expansion_timing"): ReferenceEntry(
        expected=360_000, window_ms=60_000,
        notes="NE typically expands later vs aggressive Orc; ~6:00",
    ),
    ("NEvO", "nightelf", "hero_level3_timing"): ReferenceEntry(
        expected=270_000, window_ms=30_000,
        notes="DH/Firelord hits level 3 by 4:30 with standard creep route",
    ),
    ("NEvO", "nightelf", "hero_level5_timing"): ReferenceEntry(
        expected=540_000, window_ms=60_000,
        notes="Level 5 at ~9:00 in T2 fights",
    ),

    # -----------------------------------------------------------------------
    # OvH — Orc (analysed player is Orc vs Human)
    # -----------------------------------------------------------------------
    ("OvH", "orc", "first_hero_timing"): ReferenceEntry(
        expected=62_000, window_ms=15_000,
        notes="Altar 60 s; BM standard opener vs Human",
    ),
    ("OvH", "orc", "tier2_timing"): ReferenceEntry(
        expected=135_000, window_ms=20_000,
        notes="Stronghold starts ~2:15; BM harasses first, then T2",
    ),
    ("OvH", "orc", "tier3_timing"): ReferenceEntry(
        expected=450_000, window_ms=60_000,
        notes="Fortress at ~7:30 in drawn-out OvH games only",
    ),
    ("OvH", "orc", "expansion_timing"): ReferenceEntry(
        expected=540_000, window_ms=120_000,
        notes="Informational anchor; OvH is 1-base BM harass -> T2 spike "
              "close-out. Expansion only if Human survives past ~9 min; "
              "absent expansion is not a mistake",
    ),
    ("OvH", "orc", "hero_level3_timing"): ReferenceEntry(
        expected=270_000, window_ms=30_000,
        notes="BM creep route constrained by HU harassment; ~4:30",
    ),
    ("OvH", "orc", "hero_level5_timing"): ReferenceEntry(
        expected=480_000, window_ms=60_000,
        notes="Mid-T2 fight hero level; ~8:00",
    ),
    ("OvH", "orc", "worker_count_10min"): ReferenceEntry(
        expected=14, window_ms=2,
        notes="Standard mid-game peon saturation",
    ),

    # -----------------------------------------------------------------------
    # HvO — Human (analysed player is Human vs Orc)
    # -----------------------------------------------------------------------
    ("HvO", "human", "first_hero_timing"): ReferenceEntry(
        expected=70_000, window_ms=15_000,
        notes="Altar 60 s + militia opener costs a few extra seconds",
    ),
    ("HvO", "human", "tier2_timing"): ReferenceEntry(
        expected=210_000, window_ms=30_000,
        notes="Keep requires Barracks + Blacksmith; upgrade starts ~3:00–3:30",
    ),
    ("HvO", "human", "tier3_timing"): ReferenceEntry(
        expected=510_000, window_ms=60_000,
        notes="Castle (T3) only in long games; very late at ~8:30",
    ),
    ("HvO", "human", "expansion_timing"): ReferenceEntry(
        expected=270_000, window_ms=60_000,
        notes="AM Brilliance Aura FE at ~4:30; top play goes 4:00",
    ),
    ("HvO", "human", "hero_level3_timing"): ReferenceEntry(
        expected=240_000, window_ms=30_000,
        notes="AM/MK creep route with militia escort; level 3 by ~4:00",
    ),
    ("HvO", "human", "hero_level5_timing"): ReferenceEntry(
        expected=540_000, window_ms=60_000,
        notes="Human heroes level more slowly in HvO; ~9:00",
    ),
    ("HvO", "human", "worker_count_10min"): ReferenceEntry(
        expected=14, window_ms=2,
        notes="AM Brilliance Aura sustains peasant production; ~14 at 10 min",
    ),

    # -----------------------------------------------------------------------
    # OvUD — Orc (analysed player is Orc vs Undead)
    # -----------------------------------------------------------------------
    ("OvUD", "orc", "first_hero_timing"): ReferenceEntry(
        expected=62_000, window_ms=15_000,
        notes="Standard Altar 60 s; BM or FS opener vs UD",
    ),
    ("OvUD", "orc", "tier2_timing"): ReferenceEntry(
        expected=135_000, window_ms=20_000,
        notes="Stronghold ~2:15 vs UD; FE variant delays to ~3:00",
    ),
    ("OvUD", "orc", "tier3_timing"): ReferenceEntry(
        expected=420_000, window_ms=60_000,
        notes="Fortress at ~7:00 if game is even; earlier if Orc is snowballing",
    ),
    ("OvUD", "orc", "expansion_timing"): ReferenceEntry(
        expected=480_000, window_ms=120_000,
        notes="Informational anchor — standard OvUD is 1-base; FE variant ~5:00-6:00 "
              "only when DK route contested; absent expansion not a mistake",
    ),
    ("OvUD", "orc", "hero_level3_timing"): ReferenceEntry(
        expected=240_000, window_ms=30_000,
        notes="BM reaches level 3 while contesting UD creep route; ~4:00",
    ),
    ("OvUD", "orc", "hero_level5_timing"): ReferenceEntry(
        expected=480_000, window_ms=60_000,
        notes="Level 5 in sustained T2 fights; ~8:00",
    ),
    ("OvUD", "orc", "worker_count_10min"): ReferenceEntry(
        expected=14, window_ms=2,
        notes="Standard mid-game peon saturation",
    ),

    # -----------------------------------------------------------------------
    # OvO — Orc mirror (both slots use the same reference row)
    # matchup code is 'OvO' for both the analysed player and the opponent.
    # -----------------------------------------------------------------------
    ("OvO", "orc", "first_hero_timing"): ReferenceEntry(
        expected=62_000, window_ms=15_000,
        notes="Standard Altar 60 s; BM or FS opener; same ref for both mirror slots",
    ),
    ("OvO", "orc", "tier2_timing"): ReferenceEntry(
        expected=130_000, window_ms=20_000,
        notes="Stronghold starts ~2:10; identical to OvNE standard opener (same build)",
    ),
    ("OvO", "orc", "tier3_timing"): ReferenceEntry(
        expected=420_000, window_ms=60_000,
        notes="Fortress at ~7:00 in drawn-out OvO games; low-confidence timing",
    ),
    ("OvO", "orc", "expansion_timing"): ReferenceEntry(
        expected=480_000, window_ms=120_000,
        notes="Informational anchor; BM opener expos after the T2 spike if the "
              "game continues; FS opener fast expo ~4:30-5:00; absent "
              "expansion is not a mistake",
    ),
    ("OvO", "orc", "hero_level3_timing"): ReferenceEntry(
        expected=240_000, window_ms=30_000,
        notes="BM or FS reaches level 3 by 4:00 with 2–3 creep camps",
    ),
    ("OvO", "orc", "hero_level5_timing"): ReferenceEntry(
        expected=480_000, window_ms=60_000,
        notes="Level 5 in sustained T2 engagement at ~8:00; low-confidence",
    ),
    ("OvO", "orc", "worker_count_10min"): ReferenceEntry(
        expected=14, window_ms=2,
        notes="Standard mid-game peon saturation; same for both mirror slots",
    ),

    # -----------------------------------------------------------------------
    # UDvO — Undead (analysed player is Undead vs Orc)
    # -----------------------------------------------------------------------
    ("UDvO", "undead", "first_hero_timing"): ReferenceEntry(
        expected=62_000, window_ms=15_000,
        notes="Altar 60 s; Death Knight standard opener",
    ),
    ("UDvO", "undead", "tier2_timing"): ReferenceEntry(
        expected=160_000, window_ms=20_000,
        notes="Halls of the Dead upgrade starts ~2:30–2:40; requires Crypt + Graveyard",
    ),
    ("UDvO", "undead", "tier3_timing"): ReferenceEntry(
        expected=540_000, window_ms=60_000,
        notes="Black Citadel (T3) at ~9:00; only in extended games",
    ),
    ("UDvO", "undead", "expansion_timing"): ReferenceEntry(
        expected=420_000, window_ms=60_000,
        notes="UD expands late via Haunted Mine; DK focus delays expo to ~7:00",
    ),
    ("UDvO", "undead", "hero_level3_timing"): ReferenceEntry(
        expected=270_000, window_ms=30_000,
        notes="DK/Lich creep route to level 3 by ~4:30",
    ),
    ("UDvO", "undead", "hero_level5_timing"): ReferenceEntry(
        expected=540_000, window_ms=60_000,
        notes="UD heroes level more slowly; sustained army fights; ~9:00",
    ),
    ("UDvO", "undead", "worker_count_10min"): ReferenceEntry(
        expected=12, window_ms=2,
        notes="UD Acolytes; fewer needed due to Haunted Mine mechanics",
    ),
}


# ---------------------------------------------------------------------------
# Race × matchup code inference helpers
# ---------------------------------------------------------------------------

# Maps (race_id, opponent_race_id) → matchup code
_MATCHUP_CODE_MAP: dict[tuple[str, str], str] = {
    ("orc", "nightelf"): "OvNE",
    ("nightelf", "orc"): "NEvO",
    ("orc", "human"): "OvH",
    ("human", "orc"): "HvO",
    ("orc", "undead"): "OvUD",
    ("undead", "orc"): "UDvO",
    # Orc mirror — both slots resolve to the same matchup code
    ("orc", "orc"): "OvO",
    # Other mirror/cross pairs — expand as corpus grows
    ("nightelf", "human"): "NEvH",
    ("human", "nightelf"): "HvNE",
    ("nightelf", "undead"): "NEvUD",
    ("undead", "nightelf"): "UDvNE",
    ("human", "undead"): "HvUD",
    ("undead", "human"): "UDvH",
}


def infer_matchup_code(race_id: str, opponent_race_id: str) -> str | None:
    """
    Return the canonical matchup code for (analysed_race, opponent_race).
    Returns None if the combination is not recognised (e.g. mirrors, random).
    """
    key = (race_id, opponent_race_id)
    return _MATCHUP_CODE_MAP.get(key)


def get_reference(
    matchup: str | None,
    race_id: str,
    metric: str,
    table: ReferenceTable | None = None,
) -> ReferenceEntry | None:
    """
    Look up a reference entry.

    Parameters
    ----------
    table:
        Optional injected reference table (e.g. loaded from the DB). When None,
        the in-code seed table is used. This keeps the benchmark engine pure:
        the DB I/O happens once in the route handler, and the resulting table is
        threaded down to the metric functions.

    Returns None when no reference exists for the given triple.
    Callers must treat None as "no reference available" and emit severity='info'.
    """
    if matchup is None:
        return None
    if table is None:
        table = _SEED_REFERENCE_TABLE
    return table.get((matchup, race_id, metric))


# ---------------------------------------------------------------------------
# Severity calculation
# ---------------------------------------------------------------------------

def severity_for_time_delta(delta_ms: float) -> BenchmarkSeverity:
    """
    Severity for a time-based metric where POSITIVE delta = later than expected.

    We only penalise being late (positive delta). Being early is not penalised
    (some builds intentionally go faster). If delta ≤ 0 → info.

    Thresholds (see timings.md):
        info     : delta < 30 000 ms
        minor    : 30 000 ≤ delta < 60 000 ms
        major    : 60 000 ≤ delta < 120 000 ms
        critical : delta ≥ 120 000 ms
    """
    if delta_ms < 30_000:
        return "info"
    if delta_ms < 60_000:
        return "minor"
    if delta_ms < 120_000:
        return "major"
    return "critical"


def severity_for_level_delta(delta: float) -> BenchmarkSeverity:
    """
    Severity for a level/count metric where NEGATIVE delta = behind reference.

    delta = actual − expected.
    Being ahead (delta ≥ 0) → info.
    Being behind:
        −1 → minor
        −2 → major
        ≤ −3 → critical
    """
    if delta >= 0:
        return "info"
    if delta >= -1:
        return "minor"
    if delta >= -2:
        return "major"
    return "critical"


def severity_for_absent_expansion(game_duration_ms: int) -> BenchmarkSeverity:
    """
    Severity when no expansion was taken at all — ORC ONLY (Orc sanctuary).

    Orc is the aggression-first race. 1-base play across all four Orc matchups
    is the dominant meta through patch 2.0 — BM harass -> T2 spike -> the game
    resolves by ~12-14 min. No expansion is frequently the CORRECT decision, so
    it must NOT be scored as a mistake by itself (this previously flagged winning
    1-base games as a 'critical economic deficit' — wrong advice).

    > 18 min game with no expo → minor (genuinely anomalous; even 1-base Orc
      resolves before ~14 min at high ladder on standard maps)
    ≤ 18 min game with no expo → info (score contribution 0; never surfaces)

    W3Champions / user (Orc main) correction confirmed 2026-06-12.
    """
    if game_duration_ms > 1_080_000:  # 18 min
        return "minor"
    return "info"
