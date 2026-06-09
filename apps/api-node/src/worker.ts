/**
 * @wc3-coach/api-node — BullMQ ingest worker
 *
 * Processes replay-ingest jobs: parse the .w3g file and persist the timeline.
 *
 * Lifecycle per job:
 *   1. Set replay status → 'parsing'
 *   2. parseReplayFile(filePath)  — @wc3-coach/parser
 *   3. persistTimeline(db, timeline) — @wc3-coach/db
 *   4. (success) status set to 'done' inside persistTimeline
 *   5. resolveReplayRefs() — rewrite provisional entity_ref/race_id to canonical
 *      ontology keys (T2.2). NON-FATAL: the replay is already 'done' and the
 *      resolver is idempotent, so a failure here is logged and left for re-run.
 *   6. (failure of 2 or 3) set status → 'error', then rethrow so BullMQ retries
 *      (up to 3 attempts with exponential backoff).
 *
 * Concurrency: INGEST_CONCURRENCY (default 4) — the Ryzen 7 9700X has 16
 * threads so 4 parallel parses leaves plenty of headroom for the DB/UI.
 *
 * PRINCIPLE #1 (CLAUDE.md): The worker operates ONLY on saved .w3g files
 * previously uploaded via POST /replays. No live-game data is ever processed.
 */

import { Worker } from "bullmq";
import {
  createDb,
  persistTimeline,
  setReplayStatus,
  loadFourccMaps,
  resolveReplayRefs,
} from "@wc3-coach/db";
import { parseReplayFile } from "@wc3-coach/parser";
import { config } from "./config.js";
import { QUEUE_NAME, redisOptions } from "./queue.js";
import type { IngestJobData } from "./queue.js";

const db = createDb(config.databaseUrl);

// FourCC→ontology maps are loaded once and shared across jobs (a full scan of
// the ontology tables, but < 1000 rows). Single-flight via a cached promise so
// concurrent jobs don't each trigger a load. Inferred type — no ontology dep.
let fourccMapsPromise: ReturnType<typeof loadFourccMaps> | null = null;
function getFourccMaps(): ReturnType<typeof loadFourccMaps> {
  if (fourccMapsPromise === null) {
    fourccMapsPromise = loadFourccMaps(db);
  }
  return fourccMapsPromise;
}

// Separate worker connection (BullMQ best practice: queue and worker use
// separate ioredis instances). We reuse the same parsed options.
const workerConnection = { ...redisOptions };

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

const worker = new Worker<IngestJobData>(
  QUEUE_NAME,
  async (job) => {
    const { replayId, filePath } = job.data;

    console.log(`[worker] Starting job ${job.id} — replayId=${replayId}, file=${filePath}`);

    // Transition to 'parsing'.
    await setReplayStatus(db, replayId, "parsing");

    let timeline;
    try {
      timeline = await parseReplayFile(filePath);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[worker] parseReplayFile failed for ${filePath}: ${message}`);
      await setReplayStatus(db, replayId, "error", message);
      throw err; // rethrow → BullMQ retries
    }

    let persisted;
    try {
      persisted = await persistTimeline(db, timeline);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[worker] persistTimeline failed for replayId=${replayId}: ${message}`);
      await setReplayStatus(db, replayId, "error", message);
      throw err; // rethrow → BullMQ retries
    }

    // Resolve provisional entity_ref/race_id to canonical ontology keys (T2.2).
    // NON-FATAL: the replay is already persisted and 'done'; resolveReplayRefs is
    // idempotent and can be re-run, so a failure here must NOT fail the job or
    // trigger a retry (which would re-parse + re-persist needlessly).
    try {
      const maps = await getFourccMaps();
      const resolved = await resolveReplayRefs(db, persisted.id, maps);
      console.log(`[worker] Resolved refs for replayId=${persisted.id}: ${JSON.stringify(resolved)}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[worker] ref resolution failed (non-fatal) for replayId=${persisted.id}: ${message}`);
    }

    console.log(`[worker] Job ${job.id} completed — replayId=${replayId}`);
  },
  {
    connection: workerConnection,
    concurrency: config.ingestConcurrency,
  },
);

worker.on("completed", (job) => {
  console.log(`[worker] Completed: jobId=${job.id}`);
});

worker.on("failed", (job, err) => {
  console.error(`[worker] Failed: jobId=${job?.id}`, err);
});

worker.on("error", (err) => {
  console.error("[worker] Worker error:", err);
});

console.log(
  `[worker] Listening on queue="${QUEUE_NAME}" concurrency=${config.ingestConcurrency}`,
);
