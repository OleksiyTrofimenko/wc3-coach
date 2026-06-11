"""
WC3 Coach Python API — main FastAPI application entry point

IMPORTANT — Principle #1 (CLAUDE.md):
    This service processes ONLY post-game data (replay events and benchmarks
    stored in Postgres). No live-game data sources, no overlays, no memory
    readers, no packet sniffers.

Benchmark endpoints (T3.1):
    GET  /benchmarks/{replay_id}        → existing BenchmarkResult[] for a replay
                                          (404 if the replay is unknown)
    POST /benchmarks/{replay_id}/run    → compute + persist + return BenchmarkResult[]
                                          (idempotent — safe to re-run)

Prioritization endpoint (T3.3):
    GET  /benchmarks/{replay_id}/top    → top-N scored problems for the Orc player
                                          ?top_n=5 (default)  ?orc_slot=<int> (optional)

Knowledge corpus ingestion (T5.1):
    POST /knowledge/ingest              → embed and store guide chunks (idempotent)

RAG retrieval (T5.2):
    POST /rag/query                     → top-k relevant chunks for a game situation

TODO(T5.3): LLM coach
    POST /coach/report/{replay_id}      → CoachReport (3–5 prioritised tips)

See docs/WC3_Coach_Design_Doc.md §3 (Python API) for the full design.
"""

from __future__ import annotations

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field

from app.benchmarks.db import (
    fetch_benchmarks,
    get_engine,
    load_replay_timeline,
    persist_benchmarks,
)
from app.benchmarks.engine import run_benchmarks
from app.benchmarks.models import BenchmarkResult
from app.benchmarks.scoring import ScoredProblem, prioritize
from app.rag.ingest import ingest_corpus
from app.rag.models import RetrievedChunk
from app.rag.retrieval import retrieve

app = FastAPI(
    title="WC3 Coach API",
    description=(
        "Post-game replay analysis, benchmarks, RAG, and LLM coaching. "
        "Analysis is strictly post-game — no live-game data."
    ),
    version="0.1.0",
)


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/health")
async def health() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "ok", "version": "0.1.0"}


# ---------------------------------------------------------------------------
# Benchmark endpoints (T3.1)
# ---------------------------------------------------------------------------

@app.get(
    "/benchmarks/{replay_id}",
    response_model=list[BenchmarkResult],
    summary="Fetch existing benchmark results for a replay",
    description=(
        "Returns the benchmark results that were previously computed and stored "
        "for the given replay_id. Returns 404 if the replay is not in the DB. "
        "Returns an empty list if the replay exists but benchmarks have not been "
        "run yet (use POST /benchmarks/{replay_id}/run to trigger computation)."
    ),
)
async def get_benchmarks(replay_id: str) -> list[BenchmarkResult]:
    engine = get_engine()
    async with engine.connect() as conn:
        try:
            # load_replay_timeline validates replay existence
            await load_replay_timeline(conn, replay_id)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

        return await fetch_benchmarks(conn, replay_id)


@app.post(
    "/benchmarks/{replay_id}/run",
    response_model=list[BenchmarkResult],
    summary="Compute, persist, and return benchmark results for a replay",
    description=(
        "Runs all deterministic benchmark metrics for every player in the "
        "specified replay, persists results to the benchmarks table "
        "(idempotent — existing rows are deleted first), and returns the "
        "results. Returns 404 if the replay_id does not exist in the DB."
    ),
)
async def run_benchmarks_for_replay(replay_id: str) -> list[BenchmarkResult]:
    engine = get_engine()
    async with engine.begin() as conn:  # begin() → auto-commit on success
        try:
            events, players, game_duration_ms, patch_id = (
                await load_replay_timeline(conn, replay_id)
            )
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

        results = run_benchmarks(
            events=events,
            players=players,
            game_duration_ms=game_duration_ms,
            replay_id=replay_id,
            patch_id=patch_id,
        )

        await persist_benchmarks(conn, replay_id, results)
        return results


# ---------------------------------------------------------------------------
# Prioritization endpoint (T3.3)
# ---------------------------------------------------------------------------

@app.get(
    "/benchmarks/{replay_id}/top",
    response_model=list[ScoredProblem],
    summary="Return the top-N scored problems for the Orc player",
    description=(
        "Loads existing benchmark results (must have been computed via POST "
        "/benchmarks/{replay_id}/run first) and returns the top-N highest-impact "
        "problems for the Orc player, ranked by deviation score.\n\n"
        "Parameters\n"
        "----------\n"
        "top_n    : Number of problems to return (default 5, max 20).\n"
        "orc_slot : Player slot to analyse (1-based). If omitted, all slots are "
        "scored (useful for debugging; for coaching always pass the Orc slot).\n\n"
        "Returns 404 if the replay does not exist in the DB. "
        "Returns an empty list if benchmarks have not been run yet."
    ),
)
async def get_top_problems(
    replay_id: str,
    top_n: int = Query(
        default=5, ge=1, le=20, description="Number of top problems to return"
    ),
    orc_slot: int | None = Query(default=None, description="Orc player slot (1-based)"),
) -> list[ScoredProblem]:
    engine = get_engine()
    async with engine.connect() as conn:
        try:
            await load_replay_timeline(conn, replay_id)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

        results = await fetch_benchmarks(conn, replay_id)

    return prioritize(results, top_n=top_n, orc_slot=orc_slot)


# ---------------------------------------------------------------------------
# Knowledge corpus ingestion (T5.1)
# ---------------------------------------------------------------------------


@app.post(
    "/knowledge/ingest",
    summary="Embed and store the WC3 knowledge corpus",
    description=(
        "Chunks all guide documents under the wc3-knowledge corpus, embeds each "
        "chunk via Ollama bge-m3, and stores the results in knowledge_docs + "
        "knowledge_chunks (pgvector).  "
        "Idempotent — re-running deletes and re-inserts existing docs by "
        "(title, source) key, so no rows are duplicated.  "
        "Requires Ollama to be running with bge-m3 pulled."
    ),
)
async def knowledge_ingest() -> dict[str, int]:
    """Run the corpus ingest pipeline and return a summary."""
    try:
        return await ingest_corpus()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# RAG retrieval endpoint (T5.2)
# ---------------------------------------------------------------------------


class RagQueryRequest(BaseModel):
    """Request body for POST /rag/query."""

    model_config = ConfigDict(populate_by_name=True)

    query: str = Field(
        description="Natural-language description of a game situation or problem.",
        min_length=1,
    )
    top_k: int = Field(
        default=5,
        alias="topK",
        ge=1,
        le=20,
        description="Number of chunks to return (1–20).",
    )
    matchup: str | None = Field(
        default=None,
        description=(
            "Optional matchup filter (e.g. 'OvH', 'OvNE', 'OvUD'). "
            "When set, restricts results to that matchup's guide chunks plus "
            "matchup-agnostic reference docs (timings, scoring, glossary, ontology). "
            "When omitted, all chunks are searched."
        ),
    )


@app.post(
    "/rag/query",
    response_model=list[RetrievedChunk],
    summary="Retrieve the top-k most relevant knowledge chunks for a query",
    description=(
        "Embeds *query* via Ollama bge-m3 and returns the top-k knowledge chunks "
        "from the corpus by cosine similarity (pgvector HNSW index).  "
        "When *matchup* is provided, results are restricted to that matchup's "
        "guide plus general reference documents (timings, scoring, glossary, "
        "ontology).  Each returned chunk includes the cosine similarity score "
        "and the parent document title.  "
        "Requires Ollama to be running with bge-m3 pulled."
    ),
)
async def rag_query(body: RagQueryRequest) -> list[RetrievedChunk]:
    """Embed the query and return top-k relevant knowledge chunks."""
    try:
        return await retrieve(
            query=body.query,
            top_k=body.top_k,
            matchup=body.matchup,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
