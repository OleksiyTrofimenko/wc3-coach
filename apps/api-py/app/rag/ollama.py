"""
Async Ollama client for the RAG pipeline (embeddings) and LLM coach (chat).

Embedding client (T5.1)
------------------------
Calls the ``/api/embed`` endpoint on the local Ollama server to produce
bge-m3 embeddings (1024-dimensional float vectors).

Chat client (T5.3)
------------------
Calls the ``/api/chat`` endpoint to run the LLM coach synthesis step.
Uses Ollama structured outputs (``"format": <JSON schema>``) so the model
returns parseable JSON directly — no post-hoc regex or brittle text parsing.
Model: qwen2.5:14b-instruct-q4_K_M (configured via CHAT_MODEL constant).
Temperature: 0.3 (low variance — coaching tips should be stable).
Timeout: 300 s (LLM generation is slow on the first cold run).

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
CHAT_MODEL : str
    The LLM model tag for coaching tips ("qwen2.5:14b-instruct-q4_K_M").

Usage
-----
    from app.rag.ollama import embed_texts, chat

    # Embeddings
    vectors = await embed_texts(["Orc T2 timing vs Human", "expand early"])
    # → list[list[float]], len == 2, each inner list has 1024 elements

    # Chat (structured output)
    response_text = await chat(messages, format_schema={"type": "object", ...})
    # → str containing valid JSON matching format_schema
"""

from __future__ import annotations

import os
from typing import Any

import httpx

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

EMBED_MODEL: str = "bge-m3"
EMBED_DIM: int = 1024

CHAT_MODEL: str = "qwen2.5:14b-instruct-q4_K_M"
"""LLM model used by the coach synthesis step (T5.3)."""

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


async def chat(
    messages: list[dict[str, str]],
    *,
    format_schema: dict[str, Any] | None = None,
    temperature: float = 0.3,
    timeout: float = 300.0,
) -> str:
    """
    Call Ollama's /api/chat endpoint and return the assistant message content.

    Uses CHAT_MODEL (qwen2.5:14b-instruct-q4_K_M) and non-streaming mode.
    When *format_schema* is provided, it is passed as ``"format"`` in the
    request body, enabling Ollama structured outputs — the model is constrained
    to return JSON that matches the schema.  qwen2.5 supports this natively.

    Anti-hallucination role
    -----------------------
    This function does NOT add instructions or modify the messages list.  All
    anti-hallucination work is done in the prompt (see app/coach/prompt.py).
    The low temperature (0.3) makes outputs stable and deterministic-ish.

    Parameters
    ----------
    messages:
        List of {"role": ..., "content": ...} dicts (system + user at minimum).
    format_schema:
        Optional JSON Schema dict.  When provided, Ollama constrains the model
        output to valid JSON matching this schema (structured output).  This is
        the recommended way to get reliable tip arrays from the LLM.
    temperature:
        Sampling temperature.  0.3 gives stable, low-variance coaching tips.
    timeout:
        HTTP timeout in seconds.  LLM generation on a 14B model can take 60-180 s;
        300 s is a conservative upper bound for worst-case cold runs.

    Returns
    -------
    str
        The assistant's response text.  When format_schema is provided this
        will be a valid JSON string; the caller is responsible for parsing it.

    Raises
    ------
    RuntimeError
        If the Ollama server is unreachable, returns an error status, or the
        response does not contain a message.
    """
    url = f"{_ollama_host()}/api/chat"

    payload: dict[str, Any] = {
        "model": CHAT_MODEL,
        "messages": messages,
        "stream": False,
        "options": {"temperature": temperature},
    }
    if format_schema is not None:
        payload["format"] = format_schema

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
                f"Ollama /api/chat returned HTTP {response.status_code}: "
                f"{response.text[:400]}"
            )

    data: dict[str, Any] = response.json()
    message: dict[str, Any] | None = data.get("message")
    if not message:
        raise RuntimeError(
            f"Ollama /api/chat response missing 'message' field. "
            f"Full response: {str(data)[:400]}"
        )

    content: str = message.get("content", "")
    if not content:
        raise RuntimeError(
            "Ollama /api/chat returned an empty message content."
        )

    return content
