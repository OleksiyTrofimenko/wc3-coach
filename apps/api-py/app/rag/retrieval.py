"""
RAG retrieval orchestrator for T5.2.

``retrieve`` is the single entry point called by the POST /rag/query endpoint
and (later) by the LLM coach (T5.3) to fetch relevant knowledge chunks for a
game situation.

Flow
----
1.  Embed the query string via Ollama bge-m3 (``embed_texts``).
2.  Open a DB connection via the shared engine.
3.  Call ``search_chunks`` which runs a pgvector cosine-distance nearest-
    neighbour search, filtered by matchup when provided.
4.  Return the ranked list of ``RetrievedChunk`` objects.

Matchup filtering contract
--------------------------
When *matchup* is supplied (e.g. "OvH"), the search returns chunks whose parent
doc has ``matchup = "OvH"`` OR ``matchup IS NULL``.  The NULL rows are the
matchup-agnostic reference docs (timings, scoring, glossary, ontology) that are
relevant to every coaching session.  Matchup-specific docs for OTHER matchups
(OvNE, OvUD) are excluded so the LLM context stays focused.

When *matchup* is None, all chunks are searched — useful for open-ended queries
or diagnostic calls.

Error handling
--------------
``RuntimeError`` from ``embed_texts`` (Ollama unreachable or bad response) is
deliberately allowed to propagate to the caller.  The FastAPI endpoint wraps it
in HTTPException 503 to match the /knowledge/ingest pattern.
"""

from __future__ import annotations

from app.rag.db import get_engine, search_chunks
from app.rag.models import RetrievedChunk
from app.rag.ollama import embed_texts


async def retrieve(
    query: str,
    top_k: int = 5,
    matchup: str | None = None,
) -> list[RetrievedChunk]:
    """
    Embed *query* and return the top-k most semantically relevant knowledge
    chunks from the corpus.

    Parameters
    ----------
    query:
        Natural-language description of a game situation or problem, e.g.
        "Orc expanded too late against Human".
    top_k:
        Maximum number of chunks to return.  Caller is responsible for
        clamping to a sane range (the endpoint enforces 1 ≤ top_k ≤ 20).
    matchup:
        Optional matchup filter.  When provided, restricts results to the
        given matchup's guide chunks PLUS matchup-agnostic reference docs.
        Use the canonical two-letter-vs-two-letter format: "OvH", "OvNE",
        "OvUD".  When None, all chunks are searched.

    Returns
    -------
    list[RetrievedChunk]
        Ordered by descending cosine similarity (best match first),
        length ≤ top_k.

    Raises
    ------
    RuntimeError
        Propagated from embed_texts if Ollama is unreachable or returns an
        error response.  The FastAPI layer converts this to HTTP 503.
    """
    # Step 1: embed the query (single-item batch — bge-m3 handles it fine)
    vectors = await embed_texts([query])
    query_embedding: list[float] = vectors[0]

    # Step 2: retrieve nearest chunks from the vector DB
    engine = get_engine()
    async with engine.connect() as conn:
        return await search_chunks(
            conn,
            query_embedding=query_embedding,
            top_k=top_k,
            matchup=matchup,
        )
