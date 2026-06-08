"""
wc3-coach-api-py — FastAPI application package

Analysis is POST-GAME ONLY (Principle #1, CLAUDE.md).
This service processes replay data and benchmark results stored in Postgres;
it never reads live game state.

TODO(T5.1): Embeddings pipeline (knowledge corpus → pgvector)
TODO(T5.2): RAG pipeline (pgvector retrieval)
TODO(T5.3): LLM coach integration (Ollama)
TODO(T3.1): Benchmark engine (deterministic deviations, no LLM needed)
"""
