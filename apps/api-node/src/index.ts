/**
 * @wc3-coach/api-node — Node.js ingest API and replay parsing workers
 *
 * This application:
 *  1. Accepts uploaded .w3g replay files (POST /replays)
 *  2. Deduplicates by file_hash
 *  3. Enqueues parse jobs into BullMQ (backed by Redis)
 *  4. Workers call @wc3-coach/parser → store normalized GameEvents in Postgres
 *
 * IMPORTANT — Principle #1 (CLAUDE.md):
 *   This API processes ONLY saved .w3g files uploaded after a game ends.
 *   No live-game data sources. No overlay. No memory readers.
 *
 * TODO(T1.3): Implement ingest endpoint + BullMQ worker:
 *   - POST /replays  → multipart upload, sha256 dedup, enqueue
 *   - GET  /replays/:id → replay status + parsed timeline
 *   - BullMQ worker: parseReplay() → normalizeEvents() → DB insert
 *   Add dependencies: express (or fastify), bullmq, ioredis, pg (or drizzle-orm)
 *
 * TODO(T0.2): Wire up DB and Redis connection strings from docker-compose env vars.
 *
 * See docs/WC3_Coach_Design_Doc.md §3 (ingest flow) for the full design.
 */

import { PARSER_VERSION } from "@wc3-coach/parser";
import { SHARED_TYPES_VERSION } from "@wc3-coach/shared-types";

// Placeholder startup — replace in T1.3 with a real HTTP server.
console.log(
  `[api-node] placeholder startup` +
    ` | shared-types@${SHARED_TYPES_VERSION}` +
    ` | parser@${PARSER_VERSION}`
);
console.log(
  "[api-node] HTTP server not implemented yet. See TODO(T1.3) in this file."
);
