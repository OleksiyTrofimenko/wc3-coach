"""
Pydantic models for the curation pipeline.

GoldTip mirrors CoachTip (the output the model must learn to produce).
TrainingExample is one (input_messages → output_tips) pair.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

ExampleStatus = Literal["draft", "approved"]


class GoldTip(BaseModel):
    """One curated ideal coaching tip (same shape as CoachTip)."""

    model_config = ConfigDict(populate_by_name=True)

    priority: int = Field(alias="priority")
    title: str = Field(alias="title")
    detail: str = Field(alias="detail")
    t_ms: int | None = Field(default=None, alias="tMs")
    related_benchmarks: list[str] | None = Field(
        default=None, alias="relatedBenchmarks"
    )


class TrainingExample(BaseModel):
    """A stored training example: captured prompt input + curated gold output."""

    model_config = ConfigDict(populate_by_name=True)

    replay_id: str = Field(alias="replayId")
    matchup: str | None = Field(default=None, alias="matchup")
    map_name: str | None = Field(default=None, alias="mapName")
    result: str | None = Field(default=None, alias="result")
    input_messages: list[dict[str, Any]] = Field(alias="inputMessages")
    output_tips: list[GoldTip] = Field(alias="outputTips")
    status: ExampleStatus = Field(alias="status")
    notes: str | None = Field(default=None, alias="notes")
    created_at: str = Field(alias="createdAt")
    updated_at: str = Field(alias="updatedAt")


class ExampleUpdate(BaseModel):
    """Request body to save edited gold tips + status for an example."""

    model_config = ConfigDict(populate_by_name=True)

    output_tips: list[GoldTip] = Field(alias="outputTips")
    status: ExampleStatus = Field(default="draft", alias="status")
    notes: str | None = Field(default=None, alias="notes")


class ExampleSummary(BaseModel):
    """One row in the dataset list view."""

    model_config = ConfigDict(populate_by_name=True)

    replay_id: str = Field(alias="replayId")
    matchup: str | None = Field(default=None, alias="matchup")
    map_name: str | None = Field(default=None, alias="mapName")
    result: str | None = Field(default=None, alias="result")
    status: ExampleStatus = Field(alias="status")
    tip_count: int = Field(alias="tipCount")
    updated_at: str = Field(alias="updatedAt")
