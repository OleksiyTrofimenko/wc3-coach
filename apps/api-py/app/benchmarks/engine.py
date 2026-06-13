"""
Benchmark engine orchestrator.

Wires together all pure metric functions for a given replay timeline.
Entry point: run_benchmarks(events, players, game_duration_ms, patch_id).

Design
------
- Accepts in-memory inputs only (no I/O).
- Resolves each player's matchup code from their race + opponent's race.
- Runs all implemented metrics per player.
- Skips metrics that return None (e.g. T3 in short games).
- Returns a flat list[BenchmarkResult] ordered by slot, then metric name.

Patch awareness
---------------
patch_id is accepted and stored but the reference table is currently seeded
for patch 2.0 only. When T3.2 extends the corpus with per-patch entries,
the engine will pass patch_id into the reference lookup.
"""

from __future__ import annotations

from app.benchmarks.econ import supply_block_approx
from app.benchmarks.metrics import (
    expansion_timing,
    first_hero_timing,
    hero_level3_timing,
    hero_level_at_checkpoint,
    tier2_timing,
    tier3_timing,
    worker_count_approx,
    worker_production_continuity,
)
from app.benchmarks.models import BenchmarkResult, PlayerInfo, TimelineEvent
from app.benchmarks.references import ReferenceTable, infer_matchup_code

# Checkpoints for hero-level-by-time metric (ms → metric name)
# Chosen at tactically significant moments:
#   5 min  = end of typical early-game creep phase
#   8 min  = mid-game power-spike window
#   10 min = late-game transition
_HERO_LEVEL_CHECKPOINTS: list[tuple[int, str]] = [
    (300_000, "hero_level_at_5min"),
    (480_000, "hero_level_at_8min"),
    (600_000, "hero_level_at_10min"),
]


def _race_from_race_id(race_id: str) -> str:
    return race_id.replace("race:", "")


def run_benchmarks(
    events: list[TimelineEvent],
    players: list[PlayerInfo],
    game_duration_ms: int,
    replay_id: str,
    patch_id: str = "patch:2.0",  # noqa: ARG001 — reserved for T3.2
    references: ReferenceTable | None = None,
) -> list[BenchmarkResult]:
    """
    Run all benchmark metrics for every player in the replay.

    Parameters
    ----------
    events          : All game events for the replay (all players), ordered by t_ms.
    players         : Player metadata for each slot.
    game_duration_ms: Total game duration in milliseconds.
    replay_id       : Replay identifier (written into each BenchmarkResult).
    patch_id        : Patch reference (reserved for T3.2 per-patch corpus).
    references      : Optional reference table loaded from the DB (DB-backed
                      references). When None, the in-code seed table is used, so
                      the engine stays pure and unit tests need no DB. The route
                      handler loads the table once and injects it here.

    Returns
    -------
    Flat list[BenchmarkResult] sorted by (slot, metric).
    Metrics that return None (inapplicable for this game) are excluded.
    """
    results: list[BenchmarkResult] = []

    # Build matchup codes: each player's matchup is (their race, opponent's race).
    # In a 1v1, the opponent is the other slot. In FFA/team this is undefined;
    # we fall back to None (no reference → info severity).
    opponent_race: dict[int, str | None] = {}
    if len(players) == 2:  # noqa: PLR2004
        p0, p1 = players[0], players[1]
        opponent_race[p0.slot] = _race_from_race_id(p1.race_id)
        opponent_race[p1.slot] = _race_from_race_id(p0.race_id)
    else:
        for p in players:
            opponent_race[p.slot] = None

    for player in players:
        race = _race_from_race_id(player.race_id)
        opp = opponent_race.get(player.slot)
        matchup = infer_matchup_code(race, opp) if opp else None

        # --- first_hero_timing ---
        results.append(
            first_hero_timing(events, player, matchup, replay_id, references)
        )

        # --- tier2_timing ---
        results.append(
            tier2_timing(events, player, matchup, replay_id, references)
        )

        # --- tier3_timing (skipped for short games) ---
        t3 = tier3_timing(
            events, player, matchup, replay_id, game_duration_ms, references
        )
        if t3 is not None:
            results.append(t3)

        # --- expansion_timing ---
        results.append(
            expansion_timing(
                events, player, matchup, replay_id, game_duration_ms, references
            )
        )

        # --- hero_level3_timing ---
        results.append(
            hero_level3_timing(events, player, matchup, replay_id, references)
        )

        # --- hero_level_at_checkpoint (for each checkpoint ≤ game duration) ---
        for checkpoint_ms, metric_name in _HERO_LEVEL_CHECKPOINTS:
            if checkpoint_ms <= game_duration_ms:
                results.append(
                    hero_level_at_checkpoint(
                        events=events,
                        player=player,
                        matchup=matchup,
                        replay_id=replay_id,
                        checkpoint_ms=checkpoint_ms,
                        expected_level=3.0,  # fallback if no ref
                        metric_name=metric_name,
                        references=references,
                    )
                )

        # --- worker_count_approx at 10 min (if game reached 10 min) ---
        if game_duration_ms >= 600_000:
            results.append(
                worker_count_approx(
                    events=events,
                    player=player,
                    replay_id=replay_id,
                    at_ms=600_000,
                    metric_suffix="10min",
                )
            )

        # --- worker_production_continuity ---
        results.append(
            worker_production_continuity(events, player, replay_id)
        )

        # --- supply_block_approx (Orc supply reconstruction, Path A) ---
        results.append(
            supply_block_approx(events, player, replay_id, game_duration_ms)
        )

    # Sort for deterministic output
    results.sort(key=lambda r: (r.slot, r.metric))
    return results
