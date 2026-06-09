"""
Pydantic models for the benchmark engine.

BenchmarkResult mirrors packages/shared-types/src/index.ts exactly.
# TODO(T0.4): replace BenchmarkResult with generated model once
#             the JSON-Schema → pydantic generator lands in T0.4.

TimelineEvent and PlayerInfo are the in-memory inputs to the pure metric
functions. They do NOT require a live DB — tests build them by hand.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

# ---------------------------------------------------------------------------
# Input models (in-memory; pure dataclasses — no DB dependency)
# ---------------------------------------------------------------------------

# Matches GameEventType from shared-types/src/index.ts
GameEventType = Literal[
    "build",
    "train",
    "upgrade",
    "learn_skill",
    "item",
    "move",
    "attack",
    "hero_level",
    "unit_spawn",
    "unit_death",
    "expand",
]


@dataclass(frozen=True)
class TimelineEvent:
    """
    One normalized game event from a replay, in memory.

    Maps to game_events DB table. Only the fields the benchmark engine
    needs are kept here; payload is passed through as-is for future use.

    Fields
    ------
    t_ms        : Game time in milliseconds from game start.
    event_type  : Canonical event kind (matches GameEventType).
    entity_ref  : Resolved ontology reference, e.g. 'building:stronghold',
                  'unit:peon', 'hero:blademaster'. Always namespaced.
    slot        : Player slot number (1-based).
    payload     : Type-specific extra data (free bag; unused by T3.1 metrics).
    """

    t_ms: int
    event_type: GameEventType
    entity_ref: str
    slot: int
    payload: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class PlayerInfo:
    """
    One player's metadata for a replay, in memory.

    Maps to replay_players DB table.

    Fields
    ------
    slot         : Player slot number (1-based).
    race_id      : Ontology race reference, e.g. 'race:orc', 'race:nightelf'.
    player_name  : Display name.
    apm          : Raw APM as recorded by the replay.
    result       : Game result from this player's perspective.
    """

    slot: int
    race_id: str
    player_name: str
    apm: float = 0.0
    result: Literal["win", "loss", "unknown"] = "unknown"


# ---------------------------------------------------------------------------
# Output model — mirrors TS BenchmarkResult exactly
# ---------------------------------------------------------------------------

# TODO(T0.4): replace with generated model from @wc3-coach/shared-types
BenchmarkSeverity = Literal["info", "minor", "major", "critical"]


class BenchmarkResult(BaseModel):
    """
    One computed deviation from a reference value for a single metric.

    Mirrors packages/shared-types/src/index.ts BenchmarkResult EXACTLY.
    camelCase aliases ensure JSON output matches the TS contract.

    Fields
    ------
    replayId  : FK into replays.
    slot      : Player slot the metric belongs to.
    metric    : Metric name, e.g. 'expansion_timing', 'tier2_timing'.
    value     : Actual measured value (ms for time metrics, count for levels).
    expected  : Reference value; None when no reference exists for this
                matchup/patch — in that case severity is always 'info'.
    delta     : value − expected; None when expected is None.
    severity  : Impact tier; see BenchmarkSeverity.
    """

    # Pydantic v2: allow population by field name AND alias
    model_config = ConfigDict(populate_by_name=True)

    replay_id: str = Field(alias="replayId")
    slot: int
    metric: str
    value: float
    expected: float | None = Field(default=None, alias="expected")
    delta: float | None = Field(default=None, alias="delta")
    severity: BenchmarkSeverity = "info"


# ---------------------------------------------------------------------------
# Deferred metrics catalogue
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class DeferredMetricInfo:
    """Documents a metric we intentionally do NOT compute."""

    metric: str
    reason: str


# These metrics require game STATE (not just commands).
# They will be implemented after T1.4 (Observer API) delivers the data.
DEFERRED_METRICS: list[DeferredMetricInfo] = [
    DeferredMetricInfo(
        metric="floating_gold",
        reason=(
            "Resource values are not present in the command stream. "
            "Requires live game-state sampling (Observer API, T1.4)."
        ),
    ),
    DeferredMetricInfo(
        metric="floating_lumber",
        reason=(
            "Same as floating_gold — resource values need Observer API (T1.4)."
        ),
    ),
    DeferredMetricInfo(
        metric="supply_block_duration",
        reason=(
            "True food usage requires knowing unit deaths (food freed on death). "
            "Deaths are not recorded in raw .w3g. Needs T1.4."
        ),
    ),
    DeferredMetricInfo(
        metric="army_supply_value",
        reason=(
            "Unit deaths unknown from commands; cumulative train count is only "
            "a lower bound on current army size. Needs T1.4."
        ),
    ),
    DeferredMetricInfo(
        metric="idle_production_time_exact",
        reason=(
            "Exact idle time requires knowing when each production building "
            "became free after a unit completed — needs full game state (T1.4)."
        ),
    ),
    DeferredMetricInfo(
        metric="creep_route_efficiency",
        reason=(
            "Unit positions are not recorded in command stream. "
            "Needs Observer API position sampling (T1.4)."
        ),
    ),
]
