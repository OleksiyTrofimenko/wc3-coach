"""
Pydantic models for the admin benchmark-reference CRUD endpoints.

camelCase aliases mirror the TS contract (same pattern as app/coach/models.py).
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Provenance = Literal["community", "pro", "user"]
Confidence = Literal["low", "medium", "high"]


class BenchmarkReference(BaseModel):
    """A stored benchmark_references row."""

    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(alias="id")
    matchup: str = Field(alias="matchup")
    race_id: str = Field(alias="raceId")
    metric: str = Field(alias="metric")
    expected: float = Field(alias="expected")
    window_ms: float = Field(alias="windowMs")
    notes: str | None = Field(default=None, alias="notes")
    provenance: Provenance = Field(alias="provenance")
    confidence: Confidence | None = Field(default=None, alias="confidence")
    sample_size: int | None = Field(
        default=None,
        alias="sampleSize",
        description="Number of pro observations aggregated (provenance='pro').",
    )
    dist: dict[str, float] | None = Field(
        default=None,
        alias="dist",
        description="Aggregate spread {p25, p75} for pro-derived rows.",
    )
    patch_id: str | None = Field(default=None, alias="patchId")
    created_at: str = Field(alias="createdAt")
    updated_at: str = Field(alias="updatedAt")


class ReferenceCreate(BaseModel):
    """Request body to create a reference row (identity + value + provenance)."""

    model_config = ConfigDict(populate_by_name=True)

    matchup: str = Field(alias="matchup", min_length=1)
    race_id: str = Field(alias="raceId", min_length=1)
    metric: str = Field(alias="metric", min_length=1)
    expected: float = Field(alias="expected")
    window_ms: float = Field(alias="windowMs", ge=0)
    notes: str | None = Field(default=None, alias="notes")
    provenance: Provenance = Field(default="user", alias="provenance")
    confidence: Confidence | None = Field(default=None, alias="confidence")
    # NULL = patch-agnostic baseline (matched by every replay); a UUID pins it.
    patch_id: str | None = Field(default=None, alias="patchId")


class ReferenceUpdate(BaseModel):
    """Request body to update a reference row's editable (non-identity) fields."""

    model_config = ConfigDict(populate_by_name=True)

    expected: float = Field(alias="expected")
    window_ms: float = Field(alias="windowMs", ge=0)
    notes: str | None = Field(default=None, alias="notes")
    provenance: Provenance = Field(alias="provenance")
    confidence: Confidence | None = Field(default=None, alias="confidence")
