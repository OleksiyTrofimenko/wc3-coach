"""
Async Ollama embedding client for the RAG pipeline.

Calls the ``/api/embed`` endpoint on the local Ollama server to produce
bge-m3 embeddings (1024-dimensional float vectors).

Environment
-----------
OLLAMA_HOST : str, default "http://localhost:11434"
    Base URL of the running Ollama server.

Constants
---------
EMBED_MODEL : str
    The embedding model tag to request from Ollama ("bge-m3").
EMBED_DIM : int
    Expected dimensionality of returned vectors (1024).

Usage
-----
    from app.rag.ollama import embed_texts

    vectors = await embed_texts(["Orc T2 timing vs Human", "expand early"])
    # → list[list[float]], len == 2, each inner list has 1024 elements
"""

from __future__ import annotations

import os

import httpx

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

EMBED_MODEL: str = "bge-m3"
EMBED_DIM: int = 1024

_DEFAULT_OLLAMA_HOST = "http://localhost:11434"


def _ollama_host() -> str:
    return os.environ.get("OLLAMA_HOST", _DEFAULT_OLLAMA_HOST).rstrip("/")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def embed_texts(
    texts: list[str],
    *,
    timeout: float = 120.0,
) -> list[list[float]]:
    """
    Embed a batch of text strings via Ollama's /api/embed endpoint.

    Parameters
    ----------
    texts:
        One or more strings to embed.  All are sent in a single HTTP request;
        Ollama processes them as a batch.
    timeout:
        HTTP timeout in seconds.  bge-m3 is fast but some chunks are long;
        120 s is a conservative ceiling for a full corpus batch.

    Returns
    -------
    list[list[float]]
        One float vector per input string, length == EMBED_DIM (1024).

    Raises
    ------
    RuntimeError
        If the Ollama server is unreachable, returns an error response, or
        returns vectors with wrong dimensionality.
    """
    if not texts:
        return []

    url = f"{_ollama_host()}/api/embed"
    payload: dict[str, object] = {"model": EMBED_MODEL, "input": texts}

    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            response = await client.post(url, json=payload)
        except httpx.ConnectError as exc:
            raise RuntimeError(
                f"Cannot reach Ollama at {_ollama_host()!r}. "
                "Is the Ollama container running? "
                "(docker compose --profile gpu up -d)"
            ) from exc

        if response.status_code != 200:
            raise RuntimeError(
                f"Ollama /api/embed returned HTTP {response.status_code}: "
                f"{response.text[:300]}"
            )

    data: dict[str, object] = response.json()
    embeddings: list[list[float]] = data.get("embeddings", [])  # type: ignore[assignment]

    if len(embeddings) != len(texts):
        raise RuntimeError(
            f"Ollama returned {len(embeddings)} embeddings for {len(texts)} inputs."
        )

    for i, vec in enumerate(embeddings):
        if len(vec) != EMBED_DIM:
            raise RuntimeError(
                f"Embedding [{i}] has dimension {len(vec)}, expected {EMBED_DIM}. "
                f"Is the model '{EMBED_MODEL}' actually loaded in Ollama?"
            )

    return embeddings
