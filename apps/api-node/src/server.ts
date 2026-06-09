/**
 * @wc3-coach/api-node — Fastify HTTP server
 *
 * Endpoints:
 *   POST /replays        — Upload a .w3g file; dedup by SHA-256; enqueue.
 *   GET  /replays/:id    — Replay status + timeline when done.
 *   GET  /health         — Liveness + DB/Redis reachability.
 *
 * PRINCIPLE #1 (CLAUDE.md): This server accepts ONLY saved .w3g replay files
 * uploaded AFTER the game ends. No live-game data sources, no overlays, no
 * memory readers. Any such feature request is rejected unconditionally.
 */

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { createDb, createPendingReplay, getReplayWithTimeline } from "@wc3-coach/db";
import { config } from "./config.js";
import { replayIngestQueue, pingRedis } from "./queue.js";

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

const db = createDb(config.databaseUrl);

const fastify = Fastify({
  logger: {
    transport: {
      target: "pino-pretty",
      options: { colorize: true },
    },
  },
});

await fastify.register(multipart, {
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB max per file
  },
});

// Ensure the upload directory exists.
await mkdir(config.replayStorageDir, { recursive: true });

// ---------------------------------------------------------------------------
// POST /replays
// ---------------------------------------------------------------------------

/**
 * Accept a .w3g multipart upload, deduplicate by SHA-256, save to disk,
 * and enqueue a parse job.
 *
 * Response 202: new upload accepted and enqueued.
 * Response 200: duplicate — returns existing record without re-enqueuing.
 * Response 400: missing file or wrong extension.
 */
fastify.post("/replays", async (request, reply) => {
  const data = await request.file();
  if (!data) {
    return reply.status(400).send({ error: "No file uploaded." });
  }

  if (!data.filename.endsWith(".w3g")) {
    // Drain the stream to avoid Fastify hang.
    data.file.resume();
    return reply.status(400).send({
      error: "Invalid file type. Only .w3g replay files are accepted.",
    });
  }

  // Buffer the entire upload so we can hash it.
  const chunks: Buffer[] = [];
  for await (const chunk of data.file) {
    chunks.push(chunk as Buffer);
  }
  const fileBuffer = Buffer.concat(chunks);
  const fileHash = createHash("sha256").update(fileBuffer).digest("hex");

  // Dedup check + create pending row (unique constraint on file_hash).
  const { row, alreadyExisted } = await createPendingReplay(db, fileHash);

  if (alreadyExisted) {
    return reply.status(200).send({
      replayId: row.id,
      status: row.status,
      deduplicated: true,
    });
  }

  // Save the file to disk: <storageDir>/<sha256>.w3g
  const filePath = resolve(config.replayStorageDir, `${fileHash}.w3g`);
  await writeFile(filePath, fileBuffer);

  // Enqueue the parse job with an idempotent jobId = replay UUID.
  await replayIngestQueue.add(
    "parse",
    { replayId: row.id, filePath },
    { jobId: row.id },
  );

  return reply.status(202).send({
    replayId: row.id,
    status: "pending",
    deduplicated: false,
  });
});

// ---------------------------------------------------------------------------
// GET /replays/:id
// ---------------------------------------------------------------------------

fastify.get<{ Params: { id: string } }>("/replays/:id", async (request, reply) => {
  const { id } = request.params;

  const result = await getReplayWithTimeline(db, id);
  if (result === undefined) {
    return reply.status(404).send({ error: `Replay ${id} not found.` });
  }

  const { replay, players, events } = result;

  if (replay.status !== "done") {
    return reply.send({
      replayId: replay.id,
      status: replay.status,
      error: replay.error ?? undefined,
    });
  }

  // Status is 'done' — include the full timeline data.
  return reply.send({
    replayId: replay.id,
    status: replay.status,
    fileHash: replay.fileHash,
    mapId: replay.mapId,
    durationMs: replay.durationMs,
    winnerSlot: replay.winnerSlot,
    patchId: replay.patchId,
    players: players.map((p) => ({
      slot: p.slot,
      playerName: p.playerName,
      raceId: p.raceId,
      apm: p.apm,
      result: p.result,
    })),
    // bigint id → string for JSON safety
    events: events.map((e) => ({
      id: e.id.toString(),
      slot: e.slot,
      tMs: e.tMs,
      type: e.type,
      entityRef: e.entityRef,
      payload: e.payload,
    })),
  });
});

// ---------------------------------------------------------------------------
// GET /health
// ---------------------------------------------------------------------------

fastify.get("/health", async (_request, reply) => {
  const checks: Record<string, string> = {};

  // DB check — trivial SELECT.
  try {
    await db.execute("SELECT 1");
    checks["db"] = "ok";
  } catch {
    checks["db"] = "unreachable";
  }

  // Redis check — ping via queue client.
  checks["redis"] = await pingRedis();

  const healthy = Object.values(checks).every((v) => v === "ok");
  return reply.status(healthy ? 200 : 503).send({ ok: healthy, checks });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function start(): Promise<void> {
  try {
    await fastify.listen({ port: config.port, host: "0.0.0.0" });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

await start();
