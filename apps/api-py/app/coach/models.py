"""
Pydantic models for the LLM coach (T5.3).

CoachTip and CoachReport mirror packages/shared-types/src/index.ts EXACTLY.
camelCase aliases ensure JSON output matches the TS contract (same pattern as
BenchmarkResult in app/benchmarks/models.py).

Fields
------
CoachTip:
    priority          - Rank order; 1 = most important.
    title             - Short title, e.g. "Take your expansion".
    detail            - Full explanation (1-3 sentences).
    tMs               - Optional timestamp in ms (UI deep-link to timeline moment).
    relatedBenchmarks - Optional list of metric names this tip addresses.

CoachReport:
    replayId   - FK into replays.
    matchup    - Matchup code, e.g. "OvNE", "OvH".
    mapName    - Human-readable map name, e.g. "Shallow Grave".
    result     - Game result from Orc player's perspective.
    durationMs - Game duration in ms (from replay).
    tips       - Ordered list of CoachTips (3-5 per design contract).
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class CoachTip(BaseModel):
    """
    One actionable coaching tip, produced by the LLM and grounded in the
    scored problems + retrieved knowledge.

    Mirrors TS type CoachTip from packages/shared-types/src/index.ts.
    """

    model_config = ConfigDict(populate_by_name=True)

    priority: int = Field(
        alias="priority",
        description="Rank order; 1 = most important.",
    )
    title: str = Field(
        alias="title",
        description="Short title, e.g. 'Take your expansion'.",
    )
    detail: str = Field(
        alias="detail",
        description="Full explanation (1-3 sentences).",
    )
    t_ms: int | None = Field(
        default=None,
        alias="tMs",
        description=(
            "Optional game timestamp in ms for the moment the tip refers to. "
            "Only set for time-based metrics "
            "(not level/count metrics or absent events)."
        ),
    )
    related_benchmarks: list[str] | None = Field(
        default=None,
        alias="relatedBenchmarks",
        description="Metric names from BenchmarkResult this tip is derived from.",
    )


class CoachReport(BaseModel):
    """
    The complete output of one LLM coach run for a single replay.

    Mirrors TS type CoachReport from packages/shared-types/src/index.ts.
    """

    model_config = ConfigDict(populate_by_name=True)

    replay_id: str = Field(alias="replayId")
    matchup: str = Field(alias="matchup")
    map_name: str = Field(alias="mapName")
    result: Literal["win", "loss", "unknown"] = Field(alias="result")
    duration_ms: int = Field(alias="durationMs")
    tips: list[CoachTip] = Field(alias="tips")
