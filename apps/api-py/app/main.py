"""
WC3 Coach Python API — main FastAPI application entry point

IMPORTANT — Principle #1 (CLAUDE.md):
    This service processes ONLY post-game data (replay events and benchmarks
    stored in Postgres). No live-game data sources, no overlays, no memory
    readers, no packet sniffers.

TODO(T3.1): Benchmark engine endpoints
    GET  /benchmarks/{replay_id}  → BenchmarkResult[]
TODO(T5.1): Knowledge corpus ingestion
    POST /knowledge/ingest        → embed and store guide chunks
TODO(T5.2): RAG retrieval
    POST /rag/query               → top-k relevant chunks for a game situation
TODO(T5.3): LLM coach
    POST /coach/report/{replay_id} → CoachReport (3-5 prioritized tips)
TODO(T0.2): DB / Redis connection config from docker-compose env vars.

See docs/WC3_Coach_Design_Doc.md §3 (Python API) for the full design.
"""

from fastapi import FastAPI

app = FastAPI(
    title="WC3 Coach API",
    description=(
        "Post-game replay analysis, benchmarks, RAG, and LLM coaching. "
        "Analysis is strictly post-game — no live-game data."
    ),
    version="0.0.1",
)


@app.get("/health")
async def health() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "ok", "note": "placeholder — full API wired in T3.1+"}
