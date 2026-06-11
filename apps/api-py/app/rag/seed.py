"""
CLI seed for the WC3 knowledge corpus (T5.1).

Run with:
    python -m app.rag.seed

Requires:
    DATABASE_URL  — e.g. postgresql://wc3coach:wc3coach@localhost:5433/wc3coach
    OLLAMA_HOST   — e.g. http://localhost:11434  (default if not set)

The ingest is idempotent: running it multiple times produces the same row
counts (old docs + chunks are deleted before re-inserting).
"""

from __future__ import annotations

import logging
import sys

from app.rag.ingest import ingest_corpus_sync

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
    stream=sys.stdout,
)


def main() -> None:
    print("WC3 Coach — T5.1 corpus ingest")
    print("=" * 40)
    try:
        summary = ingest_corpus_sync()
    except Exception as exc:
        print(f"\nERROR: {exc}", file=sys.stderr)
        sys.exit(1)

    print(f"\nDone.  docs={summary['docs']}  chunks={summary['chunks']}")


if __name__ == "__main__":
    main()
