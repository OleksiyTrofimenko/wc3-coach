/**
 * @wc3-coach/api-node — Configuration
 *
 * Reads and validates all required environment variables at startup.
 * Fails fast with a clear human-readable message if anything is missing.
 *
 * All other modules import from here; nothing reads process.env directly.
 *
 * Environment variables:
 *   DATABASE_URL         — PostgreSQL connection string (required)
 *   REDIS_URL            — Redis connection string (required)
 *   PORT                 — HTTP server port (default: 8787)
 *   REPLAY_STORAGE_DIR   — Directory where uploaded .w3g files are stored
 *                          (default: <repo-root>/game-data/uploads)
 *   INGEST_CONCURRENCY   — BullMQ worker concurrency (default: 4)
 */

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Resolve repo root: apps/api-node/src/config.ts → ../../.. → repo root
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    console.error(
      `[api-node] FATAL: Required environment variable "${name}" is not set.\n` +
        `  Copy .env.example to .env at the repo root and restart.`,
    );
    process.exit(1);
  }
  return val;
}

function optionalEnv(name: string, defaultValue: string): string {
  return process.env[name] ?? defaultValue;
}

export const config = {
  databaseUrl: requireEnv("DATABASE_URL"),
  redisUrl: requireEnv("REDIS_URL"),
  port: parseInt(optionalEnv("PORT", "8787"), 10),
  replayStorageDir: optionalEnv(
    "REPLAY_STORAGE_DIR",
    resolve(REPO_ROOT, "game-data", "uploads"),
  ),
  ingestConcurrency: parseInt(optionalEnv("INGEST_CONCURRENCY", "4"), 10),
} as const;
