"""
Extract reference observations from a replay timeline (pure, no DB).

The benchmark engine already computes each metric's raw measured value
(e.g. first_hero_timing.value = 130146 ms). That value IS the observation we
want to aggregate across pro replays — so extraction is just running the engine
and reading `.value`, keyed by each player slot's matchup + race.

Only metrics the engine actually looks up via get_reference are aggregated (the
ones where a per-matchup "expected" target is meaningful). State-style metrics
that compare against a fixed ideal rather than a reference row — idle-gap and
supply-block (lower-is-better, ideal 0) and worker_count (hardcoded target) —
are deliberately excluded.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.benchmarks.engine import run_benchmarks
from app.benchmarks.models import PlayerInfo, TimelineEvent
from app.benchmarks.references import infer_matchup_code

# Metrics whose value is a meaningful per-matchup "expected" target AND which the
# engine resolves via get_reference. Mirrors the get_reference call sites in
# metrics.py (first_hero/tier2/tier3/expansion/hero_level3 + hero_level_at_*).
AGGREGATABLE_METRICS: frozenset[str] = frozenset(
    {
        "first_hero_timing",
        "tier2_timing",
        "tier3_timing",
        "expansion_timing",
        "hero_level3_timing",
        "hero_level_at_5min",
        "hero_level_at_8min",
        "hero_level_at_10min",
    }
)


@dataclass(frozen=True)
class Observation:
    """One observed metric value from one player's perspective in one replay."""

    matchup: str
    race_id: str  # normalised, e.g. "orc"
    metric: str
    value: float
    player_name: str | None


def _race(race_id: str) -> str:
    return race_id.replace("race:", "")


def observations_for(
    events: list[TimelineEvent],
    players: list[PlayerInfo],
    game_duration_ms: int,
) -> list[Observation]:
    """
    Extract all aggregatable observations from a replay timeline.

    For every player slot we resolve its matchup (1v1 opponent) and emit one
    Observation per aggregatable metric whose measured value is valid
    (value >= 0 — the engine uses -1 as the "event absent" sentinel, which is
    not a real timing and must not pollute the aggregate).
    """
    # Per-slot matchup + race + name (same opponent logic as engine.run_benchmarks)
    meta: dict[int, tuple[str | None, str, str | None]] = {}
    opponent_race: dict[int, str | None] = {}
    if len(players) == 2:  # noqa: PLR2004
        p0, p1 = players[0], players[1]
        opponent_race[p0.slot] = _race(p1.race_id)
        opponent_race[p1.slot] = _race(p0.race_id)
    else:
        for p in players:
            opponent_race[p.slot] = None

    for p in players:
        race = _race(p.race_id)
        opp = opponent_race.get(p.slot)
        matchup = infer_matchup_code(race, opp) if opp else None
        meta[p.slot] = (matchup, race, p.player_name)

    results = run_benchmarks(
        events=events,
        players=players,
        game_duration_ms=game_duration_ms,
        replay_id="",  # label only; unused for extraction
    )

    observations: list[Observation] = []
    for r in results:
        if r.metric not in AGGREGATABLE_METRICS:
            continue
        if r.value is None or r.value < 0:  # absent-event sentinel
            continue
        matchup, race, name = meta.get(r.slot, (None, "", None))
        if matchup is None:
            continue
        observations.append(
            Observation(
                matchup=matchup,
                race_id=race,
                metric=r.metric,
                value=float(r.value),
                player_name=name,
            )
        )
    return observations
