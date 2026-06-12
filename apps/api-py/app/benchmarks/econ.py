"""
Economic state reconstruction (Path A) — Orc supply simulation.

T-econ (2026-06-12). PURE module: no DB, no I/O, fully deterministic/testable.

What this is
------------
The .w3g replay is a log of player COMMANDS, not game state. By stepping the
command stream forward and applying verified per-unit food costs + supply-
building contributions, we reconstruct the Orc player's supply (food) curve over
time — `supply_used(t)` vs `supply_cap(t)` — and detect SUPPLY BLOCKS (periods
where the player was food-capped and could not produce).

This is the "wc3v Path A" approach (design doc §6). It is the highest-value
metric we can derive from commands alone because the most common real Orc
mistake is over-producing at the Tier-2 power spike without enough Burrows.

Hard honesty — the no-deaths limitation
---------------------------------------
The .w3g records NO unit deaths (design doc §6). So our reconstructed
`supply_used` only ever RISES — after a big fight, real supply drops but our
model does not, OVERESTIMATING supply late-game. We mitigate this two ways:
  1. We only flag a block as a *mistake* when the player is capped BELOW the 100
     hard cap (i.e. capped by too few Burrows — the coachable error), not when
     they are simply at max army (100, expected late-game).
  2. Supply blocks are most reliable in the pre-/early-combat macro phase, which
     is exactly when burrow-timing blocks happen. Late blocks are lower
     confidence; the metric is documented as approximate (`_approx`).

Provenance of the constants (deep-research, 3-vote adversarial, 2026-06-12)
---------------------------------------------------------------------------
- Orc unit food: Blizzard primary classic.battle.net/war3/orc/unitstats.shtml
  (Peon 1, Grunt 3, Raider 3, Headhunter 2, Shaman 2, Witch Doctor 2,
  Spirit Walker 3, Kodo 4, Wind Rider 4, Demolisher 4, Tauren 5). Matches seed.
- Hero food = 5 each (1st/2nd/3rd): classic.battle.net/war3/basics/heroes.shtml
  ("first Hero is free, only costs 5 supply") + Liquipedia Hero. The "first hero
  free" refers to GOLD/LUMBER only — heroes DO consume 5 supply.
- Orc Great Hall food = 11 (raised 10->11 in patch 1.32.9; unchanged in 2.0):
  Liquipedia Great Hall + warcraft.wiki.gg patch 1.32.9. Stronghold/Fortress are
  in-place UPGRADES of the same building; no separate food contribution is
  documented, so we treat all Orc main-hall tiers as 11 (flagged below).
- Orc Burrow food = 10; hard melee food cap = 100: Liquipedia Food.
All patch 2.0 (Reforged 2.00/6117), Frozen Throne mechanics. Orc-only (sanctuary).
"""

from __future__ import annotations

from dataclasses import dataclass

from app.benchmarks.models import (
    BenchmarkResult,
    BenchmarkSeverity,
    PlayerInfo,
    TimelineEvent,
)

# ---------------------------------------------------------------------------
# Verified Orc economy constants (patch 2.0)
# ---------------------------------------------------------------------------

# Food consumed per Orc unit (entity_ref "unit:<key>" -> food).
# Source: Blizzard classic.battle.net/war3/orc/unitstats.shtml (primary).
ORC_UNIT_FOOD: dict[str, int] = {
    "peon": 1,
    "grunt": 3,
    "raider": 3,
    "troll_headhunter": 2,
    "shaman": 2,
    "witch_doctor": 2,
    "spirit_walker": 3,
    "kodo_beast": 4,
    "wind_rider": 4,
    "demolisher": 4,
    "tauren": 5,
}

# Every hero (1st/2nd/3rd) consumes 5 supply. Blizzard heroes.shtml.
HERO_FOOD: int = 5

# Orc Great Hall (and its Stronghold/Fortress upgrades) own-food.
# 11 confirmed for Great Hall (post-1.32.9). Stronghold/Fortress upgrade food is
# NOT separately documented; we assume unchanged at 11 (flagged — if upgrades
# actually grant more, supply_cap is slightly under-counted here, which would
# only OVER-report blocks; acceptable + conservative).
MAIN_HALL_FOOD: int = 11

# Orc Burrow adds 10 food when complete. Liquipedia Food.
BURROW_FOOD: int = 10

# Hard food cap in standard melee. Liquipedia Food.
FOOD_CAP: int = 100

# Standard Orc melee start: 1 Great Hall + 5 Peons (pre-placed; no events).
_START_PEONS: int = 5

# Orc Burrow build time (seconds) — seed ontology.orc.json. Food is added on
# COMPLETION (command time + build time).
_BURROW_BUILD_S: int = 35
# Great Hall (expansion) build time (seconds) — seed.
_GREAT_HALL_BUILD_S: int = 100

# Entity-ref keys (resolved ontology keys) for the supply-providing builds.
_BURROW_KEY = "orc_burrow"
_GREAT_HALL_KEY = "great_hall"


# ---------------------------------------------------------------------------
# Supply timeline reconstruction
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class SupplyPoint:
    """Supply state immediately AFTER the event at t_ms is applied."""

    t_ms: int
    used: int
    cap: int


def _orc_slot_events(events: list[TimelineEvent], slot: int) -> list[TimelineEvent]:
    return sorted(
        (e for e in events if e.slot == slot), key=lambda e: e.t_ms
    )


def reconstruct_supply(
    events: list[TimelineEvent],
    slot: int,
    game_duration_ms: int,
) -> list[SupplyPoint]:
    """
    Step the Orc player's command stream forward and return the supply curve.

    Model
    -----
    - t=0: used = 5 (5 starting Peons), cap = 11 (starting Great Hall).
    - train <unit>      : used += ORC_UNIT_FOOD[unit] at the TRAIN COMMAND time
                          (food is reserved when training starts in WC3).
    - hero appears      : used += 5 at the hero's first hero_level event.
    - build orc_burrow  : cap += 10 at COMPLETION (t + 35 s), clamped to 100.
    - build/expand great_hall (2nd+) : cap += 11 at COMPLETION (t + 100 s).
      (Stronghold/Fortress are upgrades of the existing hall — no cap change.)

    Building-completion events are merged into the chronological stream so the
    curve is correct even when a burrow finishes between two commands.

    NOTE (no deaths): used never decreases — see module docstring. Reliable for
    the macro/early-mid phase; late-game used is an overestimate.
    """
    # Collect (t_ms, used_delta, cap_delta) deltas.
    deltas: list[tuple[int, int, int]] = []

    seen_heroes: set[str] = set()
    for e in _orc_slot_events(events, slot):
        ref = e.entity_ref
        kind, _, key = ref.partition(":")

        if e.event_type == "train" and kind == "unit":
            food = ORC_UNIT_FOOD.get(key, 0)
            if food:
                deltas.append((e.t_ms, food, 0))

        elif e.event_type == "hero_level" and kind == "hero":
            # First time we see a given hero → it now exists → +5 supply.
            if key not in seen_heroes:
                seen_heroes.add(key)
                deltas.append((e.t_ms, HERO_FOOD, 0))

        elif e.event_type in ("build", "expand") and kind == "building":
            if key == _BURROW_KEY:
                done = e.t_ms + _BURROW_BUILD_S * 1000
                deltas.append((done, 0, BURROW_FOOD))
            elif key == _GREAT_HALL_KEY:
                # Second+ Great Hall = expansion → adds main-hall food on completion.
                done = e.t_ms + _GREAT_HALL_BUILD_S * 1000
                deltas.append((done, 0, MAIN_HALL_FOOD))

    deltas.sort(key=lambda d: d[0])

    points: list[SupplyPoint] = []
    used = _START_PEONS  # 5 starting peons
    cap = MAIN_HALL_FOOD  # starting Great Hall
    points.append(SupplyPoint(0, used, cap))
    for t_ms, du, dc in deltas:
        if t_ms > game_duration_ms:
            break
        used += du
        cap = min(cap + dc, FOOD_CAP)
        points.append(SupplyPoint(t_ms, used, cap))
    return points


@dataclass(frozen=True)
class SupplyBlock:
    """A contiguous interval where the player was food-capped below 100."""

    start_ms: int
    end_ms: int

    @property
    def duration_ms(self) -> int:
        return self.end_ms - self.start_ms


def find_supply_blocks(points: list[SupplyPoint]) -> list[SupplyBlock]:
    """
    Return intervals where used >= cap AND cap < 100 (capped by too few burrows,
    the coachable mistake — NOT the expected max-army 100 cap).

    A block runs from the moment `used` first reaches `cap` until the next point
    where either the cap rises above used (a burrow finished) or `used` is no
    longer >= cap. The block's end is bounded by that resolving event's time.
    """
    blocks: list[SupplyBlock] = []
    block_start: int | None = None

    for p in points:
        capped = p.used >= p.cap and p.cap < FOOD_CAP
        if capped and block_start is None:
            block_start = p.t_ms
        elif not capped and block_start is not None:
            blocks.append(SupplyBlock(block_start, p.t_ms))
            block_start = None

    # An unresolved block (still capped at the last point) is left OPEN — we do
    # not invent an end time past the last event, so it is not counted as a
    # measured block duration (avoids fabricating time the replay doesn't cover).
    return blocks


# ---------------------------------------------------------------------------
# Severity (by block duration) — matchup-agnostic
# ---------------------------------------------------------------------------


def severity_for_supply_block(duration_ms: int) -> BenchmarkSeverity:
    """
    Being food-capped (below 100, i.e. for lack of burrows) stalls ALL
    production. Thresholds chosen so a brief, normal cap is ignored:
        < 10 s  → info     (transient; everyone touches cap briefly)
        10-25 s → minor
        25-45 s → major
        ≥ 45 s  → critical (a sustained block visibly loses the spike fight)
    """
    if duration_ms < 10_000:
        return "info"
    if duration_ms < 25_000:
        return "minor"
    if duration_ms < 45_000:
        return "major"
    return "critical"


# ---------------------------------------------------------------------------
# Metric
# ---------------------------------------------------------------------------


def supply_block_approx(
    events: list[TimelineEvent],
    player: PlayerInfo,
    replay_id: str,
    game_duration_ms: int,
) -> BenchmarkResult:
    """
    Orc supply-block metric: the LONGEST interval the player was food-capped
    below 100 (i.e. blocked by too few Burrows). value = that duration in ms.

    Orc-only (sanctuary). Non-Orc players get a value of 0 / info.

    value    : longest supply-block duration in ms (0 if none).
    expected : 0 (ideal — never food-capped for lack of burrows).
    delta    : value (how far past the ideal of 0).
    severity : severity_for_supply_block(value).
    """
    if player.race_id != "race:orc":
        return BenchmarkResult(
            replayId=replay_id,
            slot=player.slot,
            metric="supply_block_approx",
            value=0.0,
            expected=0.0,
            delta=0.0,
            severity="info",
        )

    points = reconstruct_supply(events, player.slot, game_duration_ms)
    blocks = find_supply_blocks(points)
    longest = max((b.duration_ms for b in blocks), default=0)

    return BenchmarkResult(
        replayId=replay_id,
        slot=player.slot,
        metric="supply_block_approx",
        value=float(longest),
        expected=0.0,
        delta=float(longest),
        severity=severity_for_supply_block(longest),
    )
