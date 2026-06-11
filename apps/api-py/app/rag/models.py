"""
Pydantic output models for the RAG retrieval layer (T5.2).

RetrievedChunk is the unit returned by the retrieval pipeline and the
POST /rag/query endpoint.  It carries the chunk text, its parent doc metadata,
and the cosine similarity score computed from the pgvector distance.

Convention
----------
- camelCase JSON aliases to match the shared-types TS contract (same pattern
  as BenchmarkResult).
- ``score``    = 1 − cosine_distance  (higher is more relevant; range ≈ 0..1)
- ``distance`` = raw cosine distance from pgvector  (lower is more relevant)
  Kept alongside score so callers can apply their own thresholds if needed.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class RetrievedChunk(BaseModel):
    """
    One knowledge chunk returned by the RAG retrieval pipeline.

    Fields
    ------
    chunk_text : The raw text of the chunk (with breadcrumb prefix).
    doc_title  : Title of the parent knowledge_doc (e.g. "OvH Matchup Guide").
    matchup    : Matchup tag of the parent doc, or None for general references.
    score      : Cosine similarity = 1 − distance.  Higher is more relevant.
    distance   : Raw pgvector cosine distance.  Lower is more relevant.
    """

    model_config = ConfigDict(populate_by_name=True)

    chunk_text: str = Field(alias="chunkText")
    doc_title: str = Field(alias="docTitle")
    matchup: str | None = Field(default=None, alias="matchup")
    score: float = Field(alias="score")
    distance: float = Field(alias="distance")
