# apps/api-py — Python FastAPI: Benchmarks, RAG, LLM Coach

This is the Python side of the WC3 Coach backend. It is **not** a pnpm
workspace member — it lives in `apps/` for co-location but is managed
independently with Python tooling.

## Stack
- Python 3.12
- FastAPI + uvicorn
- pydantic v2 (types generated from `@wc3-coach/shared-types` JSON Schema)
- asyncpg + SQLAlchemy async (Postgres 16 + pgvector)
- Redis client (receives tasks from BullMQ via Node API)
- Ollama (local LLM + embeddings, GPU passthrough — T5.3)

## Setup (after T0.2 Docker infra is ready)

```bash
# Create a virtual environment
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate

# Install dependencies
pip install -e ".[dev]"

# Run the API
uvicorn app.main:app --reload --port 8001
```

## Type generation from shared-types (T0.4)
Python pydantic schemas are generated from the TypeScript types in
`packages/shared-types`. Do NOT hand-write pydantic models for any type
that is already defined there.

```bash
# TODO(T0.4): run the generation script once shared-types are defined
# node packages/shared-types/scripts/generate-python.mjs
```

## Tests
```bash
pytest                          # run all tests
pytest -k test_health           # run a single test
pytest tests/benchmarks/        # run a test directory
```

## Why Python?
The ML/RAG ecosystem (sentence-transformers, XGBoost, scikit-learn) lives
in Python. Everything else (parsing, ingest, queue) lives in Node/TS.
They meet at Postgres + Redis.
