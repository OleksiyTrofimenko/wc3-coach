/**
 * @wc3-coach/api-node — package entry point
 *
 * The two runnable entrypoints are:
 *   src/server.ts  — Fastify HTTP server (POST /replays, GET /replays/:id, GET /health)
 *   src/worker.ts  — BullMQ ingest worker (parse + persist)
 *
 * This file exists so `tsc -b` has a root to compile from and so tooling that
 * imports the package gets the version constants.
 *
 * PRINCIPLE #1 (CLAUDE.md): This application processes ONLY saved .w3g files
 * uploaded after a game ends. No live-game data sources.
 */

export { PARSER_VERSION } from "@wc3-coach/parser";
export { SHARED_TYPES_VERSION } from "@wc3-coach/shared-types";

export const API_NODE_VERSION = "0.1.0" as const;
