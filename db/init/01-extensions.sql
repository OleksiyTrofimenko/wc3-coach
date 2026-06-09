-- =============================================================================
-- db/init/01-extensions.sql
-- =============================================================================
-- PostgreSQL extension bootstrap.
--
-- WHEN THIS RUNS:
--   Docker mounts everything in /docker-entrypoint-initdb.d/ and executes
--   *.sql files in alphanumeric order ONCE — only when the Postgres data
--   directory is empty (i.e., the very first `docker compose up` against a
--   fresh volume, or after `docker compose down -v`).
--   On subsequent starts the data directory already exists, so this file is
--   NOT re-executed. It is safe to leave these as IF NOT EXISTS.
--
-- EXTENSIONS CREATED:
--   uuid-ossp  — provides uuid_generate_v4() used as the default PK value
--                in every table (see db/schema.sql naming conventions).
--   vector     — pgvector: adds the VECTOR column type and IVFFlat / HNSW
--                indexes used by the knowledge_chunks table for RAG similarity
--                search. Pre-compiled in the pgvector/pgvector:pg16 image.
--
-- NOTE (T2.1): The actual CREATE TABLE statements live in db/migrations/ and
--   will be applied by the migration tool chosen in T2.1. Do not add DDL here
--   beyond extension creation.
-- =============================================================================

-- Enable UUID generation helper functions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable pgvector — required for the knowledge_chunks.embedding column
-- (VECTOR(1536) or similar dimension depending on the chosen embedding model)
CREATE EXTENSION IF NOT EXISTS vector;
