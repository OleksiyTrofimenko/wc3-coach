/**
 * @wc3-coach/api-node — BullMQ queue definition
 *
 * Exports the `replayIngestQueue` BullMQ Queue instance and the shared
 * `IngestJobData` type.
 *
 * The queue is backed by Redis (REDIS_URL from config). We pass Redis
 * connection options as a plain object derived from the URL string so that
 * we don't duplicate the ioredis import (BullMQ ships its own pinned version
 * and passing a RedisOptions object avoids a dual-version type conflict).
 *
 * Retry policy: 3 attempts with exponential backoff (1s, 2s, 4s) so transient
 * failures (e.g. DB restart) are handled gracefully. On exhaustion the job
 * moves to the BullMQ failed set for manual inspection.
 *
 * removeOnComplete: keeps the last 100 completed jobs (useful for debugging).
 * removeOnFail: keeps failed jobs indefinitely (for investigation).
 */

import { Queue } from "bullmq";
import { config } from "./config.js";

export type IngestJobData = {
  /** UUID of the replays row created by createPendingReplay. */
  replayId: string;
  /** Absolute path to the saved .w3g file on disk. */
  filePath: string;
};

export const QUEUE_NAME = "replay-ingest";

/**
 * Parse a redis:// URL into BullMQ-compatible RedisOptions.
 *
 * BullMQ accepts a plain `RedisOptions` object (ioredis interface) which
 * avoids instantiating an ioredis client here and the resulting dual-version
 * type conflict under exactOptionalPropertyTypes.
 */
function parseRedisUrl(url: string): { host: string; port: number; password?: string; db?: number } {
  const parsed = new URL(url);
  const opts: { host: string; port: number; password?: string; db?: number } = {
    host: parsed.hostname,
    port: parseInt(parsed.port || "6379", 10),
  };
  if (parsed.password) {
    opts.password = parsed.password;
  }
  const db = parseInt(parsed.pathname.slice(1), 10);
  if (!isNaN(db) && db > 0) {
    opts.db = db;
  }
  return opts;
}

export const redisOptions = {
  ...parseRedisUrl(config.redisUrl),
  maxRetriesPerRequest: null as null, // Required by BullMQ
};

export const replayIngestQueue = new Queue<IngestJobData>(QUEUE_NAME, {
  connection: redisOptions,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 1_000,
    },
    removeOnComplete: { count: 100 },
    removeOnFail: false,
  },
});

/**
 * Ping the queue's Redis connection — used by the /health endpoint.
 * Returns "ok" or an error message string.
 */
export async function pingRedis(): Promise<string> {
  try {
    // BullMQ Queue exposes a client getter that resolves to the underlying
    // ioredis instance. The IRedisClient interface doesn't declare ping(), so
    // we cast to access it — ioredis always has it at runtime.
    const client = await replayIngestQueue.client;
    await (client as unknown as { ping(): Promise<unknown> }).ping();
    return "ok";
  } catch (err: unknown) {
    return err instanceof Error ? err.message : "unreachable";
  }
}
