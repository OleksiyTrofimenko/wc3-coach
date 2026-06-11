"""
DB layer for the RAG / knowledge-corpus pipeline.

Responsibilities
----------------
1.  upsert_doc(conn, title, source, matchup, text)
    Idempotent: delete existing knowledge_doc (and its chunks via CASCADE)
    matching (title, source), then insert a fresh doc row.  Returns the new
    doc UUID.

2.  insert_chunks(conn, doc_id, chunks_text, embeddings)
    Insert knowledge_chunk rows with their 1024-dim embedding vectors.

3.  count_docs / count_chunks
    Lightweight row-count helpers used by the ingest summary and seed output.

This module is the ONLY place in the rag package that touches the DB.
Pure chunking (chunker.py) and Ollama calls (ollama.py) have zero DB dependency.

Pattern
-------
Mirrors apps/api-py/app/benchmarks/db.py exactly:
  - SQLAlchemy async core-style (sa.table / sa.column — no ORM)
  - asyncpg driver
  - Lazy get_engine() factory that reads DATABASE_URL from env
  - postgresql:// → postgresql+asyncpg:// rewrite

pgvector wiring
---------------
The ``embedding`` column stores a pgvector ``vector(1024)``.  We declare it
using ``pgvector.sqlalchemy.Vector`` so SQLAlchemy knows how to encode/decode
the type when talking to asyncpg.  pgvector's SQLAlchemy integration
automatically registers the ``vector`` codec with asyncpg via a connection
event; no manual ``register_vector`` call is required.
"""

from __future__ import annotations

import os
from typing import Any

import sqlalchemy as sa
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.asyncio import AsyncConnection, create_async_engine

from app.rag.models import RetrievedChunk

# ---------------------------------------------------------------------------
# Engine factory — same pattern as benchmarks/db.py
# ---------------------------------------------------------------------------


def _make_engine() -> Any:
    url = os.environ.get("DATABASE_URL", "")
    if not url:
        raise RuntimeError(
            "DATABASE_URL is not set. "
            "Copy .env.example to .env and start docker compose."
        )
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return create_async_engine(url, pool_pre_ping=True)


_engine: Any = None


def get_engine() -> Any:
    global _engine  # noqa: PLW0603
    if _engine is None:
        _engine = _make_engine()
    return _engine


# ---------------------------------------------------------------------------
# Table definitions (core-style — no ORM)
# ---------------------------------------------------------------------------

_KNOWLEDGE_DOCS = sa.table(
    "knowledge_docs",
    sa.column("id", UUID(as_uuid=False)),
    sa.column("title", sa.Text),
    sa.column("source", sa.Text),
    sa.column("matchup", sa.Text),
    sa.column("text", sa.Text),
)

_KNOWLEDGE_CHUNKS = sa.table(
    "knowledge_chunks",
    sa.column("id", UUID(as_uuid=False)),
    sa.column("doc_id", UUID(as_uuid=False)),
    sa.column("chunk_text", sa.Text),
    sa.column("embedding", Vector(1024)),
)

# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def upsert_doc(
    conn: AsyncConnection,
    *,
    title: str,
    source: str,
    matchup: str | None,
    text: str,
) -> str:
    """
    Idempotent doc insert.

    Delete any existing knowledge_doc (+ its chunks, via ON DELETE CASCADE)
    that matches (title, source), then insert a new row.

    Returns
    -------
    str
        The UUID of the newly inserted doc (as a plain string).
    """
    # Delete previous doc (chunks cascade automatically)
    await conn.execute(
        sa.delete(_KNOWLEDGE_DOCS).where(
            sa.and_(
                _KNOWLEDGE_DOCS.c.title == title,
                _KNOWLEDGE_DOCS.c.source == source,
            )
        )
    )

    # Insert fresh doc; let Postgres generate the UUID
    result = await conn.execute(
        sa.insert(_KNOWLEDGE_DOCS)
        .values(
            title=title,
            source=source,
            matchup=matchup,
            text=text,
        )
        .returning(_KNOWLEDGE_DOCS.c.id)
    )
    row = result.fetchone()
    if row is None:
        raise RuntimeError(
            f"INSERT into knowledge_docs returned no row for title={title!r}"
        )
    return str(row[0])


async def insert_chunks(
    conn: AsyncConnection,
    doc_id: str,
    chunk_texts: list[str],
    embeddings: list[list[float]],
) -> None:
    """
    Insert knowledge_chunk rows for *doc_id*.

    Parameters
    ----------
    conn:
        Active async connection (must be inside a transaction via begin()).
    doc_id:
        UUID of the parent knowledge_doc.
    chunk_texts:
        Ordered list of chunk text strings (same order as embeddings).
    embeddings:
        Ordered list of 1024-dim float vectors from Ollama bge-m3.
    """
    if not chunk_texts:
        return

    if len(chunk_texts) != len(embeddings):
        raise ValueError(
            f"chunk_texts length ({len(chunk_texts)}) != "
            f"embeddings length ({len(embeddings)})"
        )

    await conn.execute(
        sa.insert(_KNOWLEDGE_CHUNKS),
        [
            {
                "doc_id": doc_id,
                "chunk_text": text,
                "embedding": embedding,
            }
            for text, embedding in zip(chunk_texts, embeddings, strict=True)
        ],
    )


async def search_chunks(
    conn: AsyncConnection,
    query_embedding: list[float],
    top_k: int,
    matchup: str | None,
) -> list[RetrievedChunk]:
    """
    Return the *top_k* knowledge chunks nearest to *query_embedding* by cosine
    distance, optionally filtered by matchup.

    Parameters
    ----------
    conn:
        Active async connection (read-only; no transaction needed).
    query_embedding:
        1024-dimensional float vector produced by embed_texts for the query.
    top_k:
        Maximum number of chunks to return (LIMIT clause).
    matchup:
        When provided (e.g. "OvH"), restrict to chunks whose parent doc has
        ``matchup = :matchup`` OR ``matchup IS NULL`` (general reference docs
        such as timings, scoring, glossary, ontology apply to all matchups).
        When None, all chunks are searched regardless of matchup.

    Returns
    -------
    list[RetrievedChunk]
        Ordered ascending by cosine distance (i.e. descending by similarity),
        length ≤ top_k.
    """
    # pgvector cosine distance column expression — returns a float between 0 and 2.
    # We label it so we can reference it in ORDER BY without repeating the expr.
    distance_col = _KNOWLEDGE_CHUNKS.c.embedding.cosine_distance(query_embedding)

    stmt = (
        sa.select(
            _KNOWLEDGE_CHUNKS.c.chunk_text,
            _KNOWLEDGE_DOCS.c.title.label("doc_title"),
            _KNOWLEDGE_DOCS.c.matchup,
            distance_col.label("distance"),
        )
        .select_from(
            _KNOWLEDGE_CHUNKS.join(
                _KNOWLEDGE_DOCS,
                _KNOWLEDGE_CHUNKS.c.doc_id == _KNOWLEDGE_DOCS.c.id,
            )
        )
        .order_by(sa.text("distance"))
        .limit(top_k)
    )

    if matchup is not None:
        stmt = stmt.where(
            sa.or_(
                _KNOWLEDGE_DOCS.c.matchup == matchup,
                _KNOWLEDGE_DOCS.c.matchup.is_(None),
            )
        )

    rows = (await conn.execute(stmt)).fetchall()

    return [
        RetrievedChunk(
            chunkText=row.chunk_text,
            docTitle=row.doc_title,
            matchup=row.matchup,
            distance=float(row.distance),
            score=1.0 - float(row.distance),
        )
        for row in rows
    ]


async def count_docs(conn: AsyncConnection) -> int:
    """Return total number of rows in knowledge_docs."""
    row = (
        await conn.execute(sa.select(sa.func.count()).select_from(_KNOWLEDGE_DOCS))
    ).fetchone()
    return int(row[0]) if row else 0


async def count_chunks(conn: AsyncConnection) -> int:
    """Return total number of rows in knowledge_chunks."""
    row = (
        await conn.execute(sa.select(sa.func.count()).select_from(_KNOWLEDGE_CHUNKS))
    ).fetchone()
    return int(row[0]) if row else 0
