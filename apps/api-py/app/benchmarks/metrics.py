"""
Pure metric functions for the benchmark engine.

Each function:
  - Takes a list[TimelineEvent] for ONE player + that player's PlayerInfo
    + a matchup code (or None if unknown).
  - Returns one or more BenchmarkResult objects.
  - Is deterministic and has NO side effects (no I/O, no DB, no randomness).
  - Operates only on command-derivable data — no game STATE is assumed.

IMPORTANT: Unit deaths are NOT available from raw .w3g. Any metric that
implies game state is either explicitly approximated (labelled `_approx`)
or deferred (see models.DEFERRED_METRICS). Do not add state-dependent
metrics here without labelling.

Patch: 2.0. All ontology refs use the canonical resolved form.
"""

from __future__ import annotations

from app.benchmarks.models import (
    BenchmarkResult,
    BenchmarkSeverity,
    PlayerInfo,
    TimelineEvent,
)
from app.benchmarks.references import (
    get_reference,
    severity_for_absent_expansion,
    severity_for_level_delta,
    severity_for_time_delta,
)

# ---------------------------------------------------------------------------
# Ontology entity sets — command-derivable key entities per race.
#
# These are the canonical resolved entity_ref strings the benchmark engine
# matches against. They are defined here (not in application code) so they
# can grow independently. Source: ontology.md + game knowledge.
#
# Naming convention: 'building:<key>' and 'unit:<key>' and 'hero:<key>'
# where <key> matches the ontology.md entry key column.
# ---------------------------------------------------------------------------

# Worker units per race (used for production-continuity metrics)
WORKER_UNITS: dict[str, set[str]] = {
    "orc": {"unit:peon"},
    "nightelf": {"unit:wisp"},
    "human": {"unit:peasant"},
    "undead": {"unit:acolyte"},
}

# Tier-2 buildings per race (the main-building upgrade that unlocks T2 units)
TIER2_BUILDINGS: dict[str, set[str]] = {
    "orc": {"building:stronghold"},
    "nightelf": {"building:tree_of_ages"},
    "human": {"building:keep"},
    "undead": {"building:halls_of_the_dead"},
}

# Tier-3 buildings per race
TIER3_BUILDINGS: dict[str, set[str]] = {
    "orc": {"building:fortress"},
    "nightelf": {"building:tree_of_eternity"},
    "human": {"building:castle"},
    "undead": {"building:black_citadel"},
}

# Expansion town-hall buildings per race (not the starting main building)
EXPANSION_BUILDINGS: dict[str, set[str]] = {
    "orc": {"building:great_hall"},         # 2nd+ great_hall = expansion
    "nightelf": {"building:tree_of_life"},  # 2nd+ tree_of_life = expansion
    "human": {"building:town_hall"},
    "undead": {"building:necropolis"},
}

# Hero altars per race (building that produces heroes)
ALTAR_BUILDINGS: dict[str, set[str]] = {
    "orc": {"building:altar_of_storms"},
    "nightelf": {"building:altar_of_elders"},
    "human": {"building:altar_of_kings"},
    "undead": {"building:altar_of_darkness"},
}

# Minimum peon/wisp/peasant/acolyte build time (seconds) for approximation.
# Used in worker_production_continuity to estimate when the next train
# *should* start relative to the last one.
# Source: ontology.md BuildTime column.
WORKER_BUILD_TIME_MS: dict[str, int] = {
    "orc": 15_000,       # peon: 15 s
    "nightelf": 5_000,   # wisp: 5 s
    "human": 15_000,     # peasant: 15 s (approx — not seeded)
    "undead": 15_000,    # acolyte: 15 s (approx — not seeded)
}

# Worker production continuity — idle gap severity thresholds (ms).
# A gap is the time between two consecutive worker train commands.
# Minimum idle: build_time + ~2 s reaction. We flag gaps beyond that.
# Source: timings.md "Worker production continuity" section.
WORKER_GAP_THRESHOLDS: dict[str, int] = {
    "info": 15_000,
    "minor": 30_000,
    "major": 60_000,
}


def _race_from_race_id(race_id: str) -> str:
    """Normalise 'race:orc' → 'orc'."""
    return race_id.replace("race:", "")


# ---------------------------------------------------------------------------
# Helper: filter events for one player
# ---------------------------------------------------------------------------

def _player_events(
    events: list[TimelineEvent],
    slot: int,
) -> list[TimelineEvent]:
    return [e for e in events if e.slot == slot]


# ---------------------------------------------------------------------------
# Metric: first_hero_timing
#
# Strategic meaning: when a player issues the command that produces their
# first hero. Late hero = late XP, late creeping, late power spike.
# Source: hero_level events with level == 1 indicate the moment a hero
# first appeared on the field. Alternatively the first 'train' event whose
# entity_ref starts with 'hero:'.
# ---------------------------------------------------------------------------

def first_hero_timing(
    events: list[TimelineEvent],
    player: PlayerInfo,
    matchup: str | None,
    replay_id: str,
) -> BenchmarkResult:
    """
    Time of the first hero appearing (hero_level event, level 1).

    Strategic meaning: late hero → late XP, late creep access, late power spike.
    Uses hero_level events (level 1) which fire when the hero exits the altar.
    Falls back to the first 'train' event with entity_ref starting 'hero:'.
    """
    race = _race_from_race_id(player.race_id)
    slot_events = _player_events(events, player.slot)

    # Primary: hero_level event at level 1
    hero_time: int | None = None
    for ev in sorted(slot_events, key=lambda e: e.t_ms):
        if ev.event_type == "hero_level":
            level = ev.payload.get("level", 0)
            if level == 1:
                hero_time = ev.t_ms
                break

    # Fallback: first train event for a hero entity
    if hero_time is None:
        for ev in sorted(slot_events, key=lambda e: e.t_ms):
            if ev.event_type == "train" and ev.entity_ref.startswith("hero:"):
                hero_time = ev.t_ms
                break

    ref = get_reference(matchup, race, "first_hero_timing")

    if hero_time is None:
        # No hero produced at all — this is critical in almost any game
        return BenchmarkResult(
            replayId=replay_id,
            slot=player.slot,
            metric="first_hero_timing",
            value=-1,
            expected=ref.expected if ref else None,
            delta=None,
            severity="critical",
        )

    value = float(hero_time)
    if ref is None:
        return BenchmarkResult(
            replayId=replay_id,
            slot=player.slot,
            metric="first_hero_timing",
            value=value,
            expected=None,
            delta=None,
            severity="info",
        )

    delta = value - ref.expected
    return BenchmarkResult(
        replayId=replay_id,
        slot=player.slot,
        metric="first_hero_timing",
        value=value,
        expected=ref.expected,
        delta=delta,
        severity=severity_for_time_delta(delta),
    )


# ---------------------------------------------------------------------------
# Metric: tier2_timing
#
# Strategic meaning: when the player upgrades their main building to T2.
# Late T2 = delayed access to T2 units and upgrades = power-spike deficit.
# Detected from 'build' events for the race's T2 building.
# ---------------------------------------------------------------------------

def tier2_timing(
    events: list[TimelineEvent],
    player: PlayerInfo,
    matchup: str | None,
    replay_id: str,
) -> BenchmarkResult:
    """
    Time of the T2 building command (e.g. Stronghold, Tree of Ages).

    Strategic meaning: late T2 = delayed power spike, late T2 units/upgrades.
    """
    race = _race_from_race_id(player.race_id)
    slot_events = _player_events(events, player.slot)
    t2_buildings = TIER2_BUILDINGS.get(race, set())

    t2_time: int | None = None
    for ev in sorted(slot_events, key=lambda e: e.t_ms):
        if ev.event_type == "build" and ev.entity_ref in t2_buildings:
            t2_time = ev.t_ms
            break

    ref = get_reference(matchup, race, "tier2_timing")

    if t2_time is None:
        # No T2 in the timeline; if the game was long enough this is major
        return BenchmarkResult(
            replayId=replay_id,
            slot=player.slot,
            metric="tier2_timing",
            value=-1,
            expected=ref.expected if ref else None,
            delta=None,
            severity="major",
        )

    value = float(t2_time)
    if ref is None:
        return BenchmarkResult(
            replayId=replay_id,
            slot=player.slot,
            metric="tier2_timing",
            value=value,
            expected=None,
            delta=None,
            severity="info",
        )

    delta = value - ref.expected
    return BenchmarkResult(
        replayId=replay_id,
        slot=player.slot,
        metric="tier2_timing",
        value=value,
        expected=ref.expected,
        delta=delta,
        severity=severity_for_time_delta(delta),
    )


# ---------------------------------------------------------------------------
# Metric: tier3_timing
#
# Strategic meaning: T3 access unlocks end-game units. Only relevant in
# longer games; absence is reported as 'info' if the game ended quickly.
# ---------------------------------------------------------------------------

def tier3_timing(
    events: list[TimelineEvent],
    player: PlayerInfo,
    matchup: str | None,
    replay_id: str,
    game_duration_ms: int,
) -> BenchmarkResult | None:
    """
    Time of the T3 building command (e.g. Fortress, Tree of Eternity).

    Strategic meaning: late T3 in long games = delayed end-game unit access.
    Returns None if the game ended before T3 would be relevant (< 7 min).
    """
    # T3 is only relevant in games longer than ~7 minutes
    if game_duration_ms < 420_000:
        return None

    race = _race_from_race_id(player.race_id)
    slot_events = _player_events(events, player.slot)
    t3_buildings = TIER3_BUILDINGS.get(race, set())

    t3_time: int | None = None
    for ev in sorted(slot_events, key=lambda e: e.t_ms):
        if ev.event_type == "build" and ev.entity_ref in t3_buildings:
            t3_time = ev.t_ms
            break

    ref = get_reference(matchup, race, "tier3_timing")

    if t3_time is None:
        # No T3 in a long game — only flag if game > 10 min
        if game_duration_ms > 600_000:
            return BenchmarkResult(
                replayId=replay_id,
                slot=player.slot,
                metric="tier3_timing",
                value=-1,
                expected=ref.expected if ref else None,
                delta=None,
                severity="minor",
            )
        return None

    value = float(t3_time)
    if ref is None:
        return BenchmarkResult(
            replayId=replay_id,
            slot=player.slot,
            metric="tier3_timing",
            value=value,
            expected=None,
            delta=None,
            severity="info",
        )

    delta = value - ref.expected
    return BenchmarkResult(
        replayId=replay_id,
        slot=player.slot,
        metric="tier3_timing",
        value=value,
        expected=ref.expected,
        delta=delta,
        severity=severity_for_time_delta(delta),
    )


# ---------------------------------------------------------------------------
# Metric: expansion_timing
#
# Strategic meaning: taking a second base locks in economic advantage.
# Late or absent expansion is one of the most common mid-ladder mistakes.
# We detect a second build of the race's main-hall building.
# ---------------------------------------------------------------------------

def expansion_timing(
    events: list[TimelineEvent],
    player: PlayerInfo,
    matchup: str | None,
    replay_id: str,
    game_duration_ms: int,
) -> BenchmarkResult:
    """
    Time of the expansion (second town-hall build command).

    Strategic meaning: late or absent expansion = economic deficit that
    compounds over time. One of the highest-leverage metrics.

    Detection: second 'build' event for the race's main-hall building
    (great_hall, tree_of_life, etc.) or an explicit 'expand' event.
    """
    race = _race_from_race_id(player.race_id)
    slot_events = _player_events(events, player.slot)
    expo_buildings = EXPANSION_BUILDINGS.get(race, set())

    expo_times: list[int] = []

    # Count explicit expand events first
    for ev in sorted(slot_events, key=lambda e: e.t_ms):
        if ev.event_type == "expand":
            expo_times.append(ev.t_ms)

    # Also count build events for the main-hall building
    hall_builds: list[int] = []
    for ev in sorted(slot_events, key=lambda e: e.t_ms):
        if ev.event_type == "build" and ev.entity_ref in expo_buildings:
            hall_builds.append(ev.t_ms)

    # The SECOND build of the main hall = expansion (first is the starting hall)
    expansion_t: int | None = None
    if expo_times:
        expansion_t = expo_times[0]
    elif len(hall_builds) >= 2:
        expansion_t = hall_builds[1]

    ref = get_reference(matchup, race, "expansion_timing")

    if expansion_t is None:
        # No expansion taken at all
        sev = severity_for_absent_expansion(game_duration_ms)
        return BenchmarkResult(
            replayId=replay_id,
            slot=player.slot,
            metric="expansion_timing",
            value=-1,
            expected=ref.expected if ref else None,
            delta=None,
            severity=sev,
        )

    value = float(expansion_t)
    if ref is None:
        return BenchmarkResult(
            replayId=replay_id,
            slot=player.slot,
            metric="expansion_timing",
            value=value,
            expected=None,
            delta=None,
            severity="info",
        )

    delta = value - ref.expected
    return BenchmarkResult(
        replayId=replay_id,
        slot=player.slot,
        metric="expansion_timing",
        value=value,
        expected=ref.expected,
        delta=delta,
        severity=severity_for_time_delta(delta),
    )


# ---------------------------------------------------------------------------
# Metric: hero_level_by_time
#
# Strategic meaning: hero levels are the primary power source in WC3.
# Being under-levelled at key game minutes indicates poor creep routing,
# excessive harass damage taken, or poor creep prioritisation.
# ---------------------------------------------------------------------------

def _hero_max_level_at(
    slot_events: list[TimelineEvent],
    cutoff_ms: int,
) -> int:
    """Return the highest hero level seen up to cutoff_ms (exclusive)."""
    max_level = 0
    for ev in slot_events:
        if ev.event_type == "hero_level" and ev.t_ms <= cutoff_ms:
            level = ev.payload.get("level", 0)
            if isinstance(level, int) and level > max_level:
                max_level = level
    return max_level


def hero_level_at_checkpoint(
    events: list[TimelineEvent],
    player: PlayerInfo,
    matchup: str | None,
    replay_id: str,
    checkpoint_ms: int,
    expected_level: float,
    metric_name: str,
) -> BenchmarkResult:
    """
    Hero level of the primary hero at a specific game-time checkpoint.

    Strategic meaning: under-levelled hero at the checkpoint = power deficit
    in the upcoming fight or tech transition.
    """
    race = _race_from_race_id(player.race_id)
    slot_events = _player_events(events, player.slot)

    actual_level = _hero_max_level_at(slot_events, checkpoint_ms)

    ref = get_reference(matchup, race, metric_name)
    exp: float = ref.expected if ref else expected_level

    delta = float(actual_level) - exp
    sev: BenchmarkSeverity = severity_for_level_delta(delta) if ref else "info"

    return BenchmarkResult(
        replayId=replay_id,
        slot=player.slot,
        metric=metric_name,
        value=float(actual_level),
        expected=exp if ref else None,
        delta=delta if ref else None,
        severity=sev,
    )


def hero_level3_timing(
    events: list[TimelineEvent],
    player: PlayerInfo,
    matchup: str | None,
    replay_id: str,
) -> BenchmarkResult:
    """
    Game time when the primary hero first reached level 3.

    Strategic meaning: level 3 is the first major power spike (ult available
    for some heroes, strong skill combo for others). Late level 3 means the
    player is behind in the creep race and the mid-game engagement window.
    """
    race = _race_from_race_id(player.race_id)
    slot_events = _player_events(events, player.slot)

    level3_t: int | None = None
    for ev in sorted(slot_events, key=lambda e: e.t_ms):
        if ev.event_type == "hero_level":
            level = ev.payload.get("level", 0)
            if isinstance(level, int) and level >= 3:
                level3_t = ev.t_ms
                break

    ref = get_reference(matchup, race, "hero_level3_timing")

    if level3_t is None:
        # Hero never reached level 3 — only penalise if game was long enough
        return BenchmarkResult(
            replayId=replay_id,
            slot=player.slot,
            metric="hero_level3_timing",
            value=-1,
            expected=ref.expected if ref else None,
            delta=None,
            severity="major",
        )

    value = float(level3_t)
    if ref is None:
        return BenchmarkResult(
            replayId=replay_id,
            slot=player.slot,
            metric="hero_level3_timing",
            value=value,
            expected=None,
            delta=None,
            severity="info",
        )

    delta = value - ref.expected
    return BenchmarkResult(
        replayId=replay_id,
        slot=player.slot,
        metric="hero_level3_timing",
        value=value,
        expected=ref.expected,
        delta=delta,
        severity=severity_for_time_delta(delta),
    )


# ---------------------------------------------------------------------------
# Metric: worker_count_over_time (cumulative approximation)
#
# Strategic meaning: worker count drives income. WC3 saturation is ~5 workers
# per gold mine (10 spots). Typical mid-game targets: 14–16 Orc, 12–14 NE.
#
# APPROXIMATION: worker deaths are not known from commands. This metric
# counts cumulative worker trains only — it is a lower bound on the actual
# worker count. It is labelled explicitly as an approximation.
# ---------------------------------------------------------------------------

def worker_count_approx(
    events: list[TimelineEvent],
    player: PlayerInfo,
    replay_id: str,
    at_ms: int,
    metric_suffix: str = "",
) -> BenchmarkResult:
    """
    Approximated worker count at time at_ms (cumulative trains, no deaths).

    APPROXIMATION: worker deaths are unknown. This is a lower bound.
    Metric name: 'worker_count_approx_<suffix>' (e.g. '10min').

    Strategic meaning: under-producing workers = income deficit that
    compounds over time; over-producing past saturation wastes resources.
    """
    race = _race_from_race_id(player.race_id)
    slot_events = _player_events(events, player.slot)
    worker_entities = WORKER_UNITS.get(race, set())

    count = sum(
        1
        for ev in slot_events
        if ev.event_type == "train"
        and ev.entity_ref in worker_entities
        and ev.t_ms <= at_ms
    )

    # Starting workers: all races start with 5 workers (standard 1v1 start)
    total = 5 + count
    metric_name = f"worker_count_approx{'_' + metric_suffix if metric_suffix else ''}"

    # No per-matchup reference for this; use a flat race reference from timings.md
    # Orc: ~14 at 10 min. NE: ~12 at 10 min. Others: ~14.
    WORKER_10MIN_REF: dict[str, float] = {
        "orc": 14.0,
        "nightelf": 12.0,
        "human": 14.0,
        "undead": 14.0,
    }

    if metric_suffix == "10min":
        expected_count = WORKER_10MIN_REF.get(race)
        if expected_count is not None:
            delta = float(total) - expected_count
            # For counts: being behind is bad; being ahead is fine
            sev: BenchmarkSeverity
            if delta >= 0:
                sev = "info"
            elif delta >= -2:
                sev = "minor"
            elif delta >= -4:
                sev = "major"
            else:
                sev = "critical"
            return BenchmarkResult(
                replayId=replay_id,
                slot=player.slot,
                metric=metric_name,
                value=float(total),
                expected=expected_count,
                delta=delta,
                severity=sev,
            )

    return BenchmarkResult(
        replayId=replay_id,
        slot=player.slot,
        metric=metric_name,
        value=float(total),
        expected=None,
        delta=None,
        severity="info",
    )


# ---------------------------------------------------------------------------
# Metric: worker_production_continuity (gap proxy)
#
# Strategic meaning: idle production buildings are the single most common
# macro mistake at mid-ladder. Every second a barracks/main-hall is idle
# is wasted income or army. This metric approximates idle time as the
# maximum gap between consecutive worker train commands.
#
# APPROXIMATION: we measure command times, not completion times. Build time
# is added as an offset to approximate when the next command 'should' fire.
# Worker deaths may create genuine gaps — this is an upper bound on idleness.
# The metric is labelled 'worker_production_gap_approx'.
# ---------------------------------------------------------------------------

def worker_production_continuity(
    events: list[TimelineEvent],
    player: PlayerInfo,
    replay_id: str,
) -> BenchmarkResult:
    """
    Maximum gap between consecutive worker train commands (proxy for idle production).

    APPROXIMATION: command-time gaps include natural build time. True idle
    time requires knowing exact completion timestamps. Worker deaths may also
    create apparent gaps. Labelled _approx.

    Strategic meaning: gaps > 15 s beyond the worker's build time strongly
    suggest the player stopped producing workers (idle production).
    """
    race = _race_from_race_id(player.race_id)
    slot_events = _player_events(events, player.slot)
    worker_entities = WORKER_UNITS.get(race, set())
    build_time_ms = WORKER_BUILD_TIME_MS.get(race, 15_000)

    worker_train_times = sorted(
        ev.t_ms
        for ev in slot_events
        if ev.event_type == "train" and ev.entity_ref in worker_entities
    )

    if len(worker_train_times) < 2:
        # Cannot compute a gap with fewer than 2 events
        return BenchmarkResult(
            replayId=replay_id,
            slot=player.slot,
            metric="worker_production_gap_approx",
            value=0.0,
            expected=None,
            delta=None,
            severity="info",
        )

    max_gap = max(
        worker_train_times[i + 1] - worker_train_times[i]
        for i in range(len(worker_train_times) - 1)
    )

    # Subtract the natural build time to isolate the idle component
    idle_proxy_ms = max(0, max_gap - build_time_ms)

    # Severity from timings.md thresholds
    sev: BenchmarkSeverity
    if idle_proxy_ms < WORKER_GAP_THRESHOLDS["info"]:
        sev = "info"
    elif idle_proxy_ms < WORKER_GAP_THRESHOLDS["minor"]:
        sev = "minor"
    elif idle_proxy_ms < WORKER_GAP_THRESHOLDS["major"]:
        sev = "major"
    else:
        sev = "critical"

    return BenchmarkResult(
        replayId=replay_id,
        slot=player.slot,
        metric="worker_production_gap_approx",
        value=float(idle_proxy_ms),
        expected=0.0,       # ideal = no idle gap
        delta=float(idle_proxy_ms),
        severity=sev,
    )
