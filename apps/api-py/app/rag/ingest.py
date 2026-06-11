"""
Corpus ingestion orchestrator for T5.1.

``ingest_corpus`` is the single entry point called by both the CLI seed
(app/rag/seed.py) and the POST /knowledge/ingest FastAPI endpoint.

Flow
----
1.  Discover corpus files under the wc3-knowledge directory.
2.  Read each file, derive metadata (title, matchup).
3.  Chunk via chunker.chunk_document (pure, deterministic).
4.  Embed all chunks in one Ollama call per document (bge-m3).
5.  Persist: upsert_doc → insert_chunks (single transaction per document).
6.  Return a summary dict: {"docs": N, "chunks": M}.

Idempotency
-----------
Each document is identified by (title, source).  ``upsert_doc`` deletes any
existing row with that key (its chunks cascade) before inserting, so re-running
the ingest is always safe and never duplicates rows.

Corpus path
-----------
Resolved relative to the repository root, NOT to CWD.  The repo root is found
by walking up from this file until a directory containing ``CLAUDE.md`` is
found.  This is robust regardless of where the process is launched from.
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path

from app.rag.chunker import chunk_document
from app.rag.db import get_engine, insert_chunks, upsert_doc
from app.rag.ollama import embed_texts

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Corpus file manifest
# ---------------------------------------------------------------------------

# Relative paths under wc3-knowledge/ to ingest, with their metadata.
# SKIP: SKILL.md, matchups/_TEMPLATE.md
_CORPUS_FILES: list[dict[str, str | None]] = [
    # Matchup guides
    {
        "rel_path": "matchups/OvH.md",
        "title": "OvH Matchup Guide",
        "matchup": "OvH",
        "source": "manual",
    },
    {
        "rel_path": "matchups/OvNE.md",
        "title": "OvNE Matchup Guide",
        "matchup": "OvNE",
        "source": "manual",
    },
    {
        "rel_path": "matchups/OvUD.md",
        "title": "OvUD Matchup Guide",
        "matchup": "OvUD",
        "source": "manual",
    },
    {
        "rel_path": "matchups/OvO.md",
        "title": "OvO Matchup Guide",
        "matchup": "OvO",
        "source": "manual",
    },
    # Reference / general docs (matchup=None)
    {
        "rel_path": "timings.md",
        "title": "Reference Timings",
        "matchup": None,
        "source": "manual",
    },
    {
        "rel_path": "scoring.md",
        "title": "Deviation Scoring Guide",
        "matchup": None,
        "source": "manual",
    },
    {
        "rel_path": "glossary.md",
        "title": "WC3 Glossary",
        "matchup": None,
        "source": "manual",
    },
    {
        "rel_path": "ontology.md",
        "title": "WC3 Ontology Reference",
        "matchup": None,
        "source": "manual",
    },
    {
        "rel_path": "hotkeys.md",
        "title": "WC3 Hotkey Reference (Classic)",
        "matchup": None,
        "source": "manual",
    },
]


# ---------------------------------------------------------------------------
# Repo-root discovery
# ---------------------------------------------------------------------------


def _find_repo_root(start: Path) -> Path:
    """
    Walk upward from *start* until a directory containing ``CLAUDE.md`` is found.

    Raises RuntimeError if the repo root cannot be located.
    """
    candidate = start.resolve()
    for _ in range(20):  # safety limit — never walk past the filesystem root
        if (candidate / "CLAUDE.md").exists():
            return candidate
        parent = candidate.parent
        if parent == candidate:
            break
        candidate = parent
    raise RuntimeError(
        f"Cannot locate repo root (CLAUDE.md not found) starting from {start!r}"
    )


def default_corpus_path() -> Path:
    """Return the default corpus directory path, resolved from the repo root."""
    repo_root = _find_repo_root(Path(__file__))
    return repo_root / ".claude" / "skills" / "wc3-knowledge"


# ---------------------------------------------------------------------------
# Public orchestration function
# ---------------------------------------------------------------------------


async def ingest_corpus(
    corpus_path: Path | None = None,
) -> dict[str, int]:
    """
    Discover, chunk, embed, and store the WC3 knowledge corpus.

    Parameters
    ----------
    corpus_path:
        Root of the wc3-knowledge directory.  Defaults to the canonical
        location relative to the repository root.

    Returns
    -------
    dict with keys:
        "docs"   — number of knowledge_doc rows inserted
        "chunks" — total number of knowledge_chunk rows inserted
    """
    if corpus_path is None:
        corpus_path = default_corpus_path()

    log.info("Ingesting corpus from %s", corpus_path)

    engine = get_engine()
    total_docs = 0
    total_chunks = 0

    for spec in _CORPUS_FILES:
        rel_path = str(spec["rel_path"])
        title = str(spec["title"])
        matchup = spec.get("matchup")
        source = str(spec["source"])

        file_path = corpus_path / rel_path

        if not file_path.exists():
            log.warning("Corpus file not found, skipping: %s", file_path)
            continue

        markdown_text = file_path.read_text(encoding="utf-8")
        chunks = chunk_document(title, markdown_text)

        if not chunks:
            log.warning("No chunks produced from %s — skipping", rel_path)
            continue

        log.info("  %s -> %d chunks", rel_path, len(chunks))

        # Embed all chunks for this document in one Ollama call
        chunk_texts = [c.text for c in chunks]
        embeddings = await embed_texts(chunk_texts)

        # Persist: one transaction per document for atomicity
        async with engine.begin() as conn:
            doc_id = await upsert_doc(
                conn,
                title=title,
                source=source,
                matchup=matchup,
                text=markdown_text,
            )
            await insert_chunks(conn, doc_id, chunk_texts, embeddings)

        total_docs += 1
        total_chunks += len(chunks)

    log.info("Ingest complete: %d docs, %d chunks", total_docs, total_chunks)
    return {"docs": total_docs, "chunks": total_chunks}


# ---------------------------------------------------------------------------
# Convenience wrapper for synchronous callers (CLI)
# ---------------------------------------------------------------------------


def ingest_corpus_sync(corpus_path: Path | None = None) -> dict[str, int]:
    """Run ingest_corpus synchronously (for CLI / __main__ usage)."""
    return asyncio.run(ingest_corpus(corpus_path))
