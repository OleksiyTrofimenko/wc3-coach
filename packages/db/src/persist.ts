/**
 * @wc3-coach/db — Persistence helpers
 *
 * Database operations for the ingest pipeline.
 *
 * These functions perform actual DB I/O and must be called with a live Drizzle
 * instance. They are separate from map.ts (pure) for testability.
 *
 * PRINCIPLE #1: All operations target post-game .w3g replay data only.
 */

import { eq, sql, asc } from "drizzle-orm";
import type { DrizzleDb } from "./client.js";
import {
  replays,
  replayPlayers,
  gameEvents,
  patchVersions,
} from "./schema.js";
import type { ReplayRow, ReplayPlayerRow, GameEventRow } from "./schema.js";
import type { ReplayTimeline } from "@wc3-coach/shared-types";
import {
  parsePatchId,
  timelineToReplayRow,
  timelineToPlayerRows,
  timelineToEventRows,
} from "./map.js";

// ---------------------------------------------------------------------------
// createPendingReplay
// ---------------------------------------------------------------------------

/**
 * Insert a minimal `replays` row with status='pending', or return the
 * existing row if a replay with the same file_hash already exists.
 *
 * This is called at upload time (before the file is enqueued) so the row
 * exists before the worker starts. Deduplication is handled here: if the
 * hash already exists, no insert is performed.
 *
 * @returns `{ row, alreadyExisted }` — `alreadyExisted` is true when the
 *   caller should skip re-enqueueing the job.
 */
export async function createPendingReplay(
  db: DrizzleDb,
  fileHash: string,
): Promise<{ row: ReplayRow; alreadyExisted: boolean }> {
  // Try to find an existing row first.
  const existing = await db
    .select()
    .from(replays)
    .where(eq(replays.fileHash, fileHash))
    .limit(1);

  const first = existing[0];
  if (first !== undefined) {
    return { row: first, alreadyExisted: true };
  }

  // Not found — insert a pending row.
  const inserted = await db
    .insert(replays)
    .values({
      fileHash,
      status: "pending",
    })
    .returning();

  const insertedRow = inserted[0];
  if (insertedRow === undefined) {
    throw new Error(`createPendingReplay: insert returned no rows for hash ${fileHash}`);
  }
  return { row: insertedRow, alreadyExisted: false };
}

// ---------------------------------------------------------------------------
// findReplayByHash
// ---------------------------------------------------------------------------

/**
 * Look up a replays row by its SHA-256 file hash.
 *
 * Returns undefined if no matching row exists.
 */
export async function findReplayByHash(
  db: DrizzleDb,
  fileHash: string,
): Promise<ReplayRow | undefined> {
  const rows = await db
    .select()
    .from(replays)
    .where(eq(replays.fileHash, fileHash))
    .limit(1);
  return rows[0];
}

// ---------------------------------------------------------------------------
// persistTimeline
// ---------------------------------------------------------------------------

/**
 * Persist a fully parsed ReplayTimeline into the database.
 *
 * Called by the BullMQ worker after `parseReplayFile` succeeds.
 *
 * Steps (all within a single transaction):
 *   1. Resolve-or-insert the patch_versions row (upsert by version+build).
 *   2. UPDATE the existing replays row (matched by file_hash) with parsed
 *      metadata and set status='done'.
 *   3. INSERT replay_players rows.
 *   4. Bulk INSERT game_events rows.
 *
 * The replays row MUST already exist (created by `createPendingReplay` at
 * upload time). If no row is found for the fileHash, an error is thrown.
 *
 * @param db       - Drizzle DB instance.
 * @param timeline - Parsed timeline from @wc3-coach/parser.
 * @returns The updated replays row.
 */
export async function persistTimeline(
  db: DrizzleDb,
  timeline: ReplayTimeline,
): Promise<ReplayRow> {
  return await db.transaction(async (tx) => {
    // ------------------------------------------------------------------
    // 1. Resolve or create the patch_versions row.
    // ------------------------------------------------------------------
    let resolvedPatchId: string | null = null;
    const parsed = parsePatchId(timeline.patchId);
    if (parsed !== null) {
      // Upsert: if the (version, build_number) pair already exists, return the
      // existing id; otherwise insert a new row.
      const upserted = await tx
        .insert(patchVersions)
        .values({
          version: parsed.version,
          buildNumber: parsed.buildNumber,
        })
        .onConflictDoUpdate({
          target: [patchVersions.version, patchVersions.buildNumber],
          set: {
            // No-op update so we get the existing row back via .returning().
            version: sql`excluded.version`,
          },
        })
        .returning({ id: patchVersions.id });
      const upsertedRow = upserted[0];
      if (upsertedRow !== undefined) {
        resolvedPatchId = upsertedRow.id;
      }
    }

    // ------------------------------------------------------------------
    // 2. UPDATE the pending replays row by file_hash.
    // ------------------------------------------------------------------
    const replayData = timelineToReplayRow(timeline);
    const updated = await tx
      .update(replays)
      .set({
        ...replayData,
        patchId: resolvedPatchId ?? undefined,
        updatedAt: sql`now()`,
      })
      .where(eq(replays.fileHash, timeline.fileHash))
      .returning();

    const replayRow = updated[0];
    if (replayRow === undefined) {
      throw new Error(
        `persistTimeline: no replays row found for fileHash=${timeline.fileHash}. ` +
          `createPendingReplay must be called before persistTimeline.`,
      );
    }

    const replayId = replayRow.id;

    // ------------------------------------------------------------------
    // 3. INSERT replay_players (delete existing first to handle retries).
    // ------------------------------------------------------------------
    await tx
      .delete(replayPlayers)
      .where(eq(replayPlayers.replayId, replayId));

    const playerRows = timelineToPlayerRows(timeline, replayId);
    if (playerRows.length > 0) {
      await tx.insert(replayPlayers).values(playerRows);
    }

    // ------------------------------------------------------------------
    // 4. Bulk INSERT game_events (delete existing first to handle retries).
    // ------------------------------------------------------------------
    await tx
      .delete(gameEvents)
      .where(eq(gameEvents.replayId, replayId));

    const eventRows = timelineToEventRows(timeline, replayId);
    // Batch in chunks of 1 000 to avoid huge single INSERT statements.
    const CHUNK_SIZE = 1_000;
    for (let i = 0; i < eventRows.length; i += CHUNK_SIZE) {
      const chunk = eventRows.slice(i, i + CHUNK_SIZE);
      if (chunk.length > 0) {
        await tx.insert(gameEvents).values(chunk);
      }
    }

    return replayRow;
  });
}

// ---------------------------------------------------------------------------
// setReplayStatus
// ---------------------------------------------------------------------------

/**
 * Update a replay's status and optional error message.
 *
 * Used by the worker to transition to 'parsing' or 'error'.
 */
export async function setReplayStatus(
  db: DrizzleDb,
  replayId: string,
  status: "parsing" | "error",
  error?: string,
): Promise<void> {
  await db
    .update(replays)
    .set({
      status,
      error: error ?? null,
      updatedAt: sql`now()`,
    })
    .where(eq(replays.id, replayId));
}

// ---------------------------------------------------------------------------
// getReplayWithTimeline
// ---------------------------------------------------------------------------

/**
 * Retrieve a replay row with its players and events, reconstructing a
 * ReplayTimeline-shaped object for the GET /replays/:id endpoint.
 *
 * Returns undefined if no row exists for the given id.
 */
export async function getReplayWithTimeline(
  db: DrizzleDb,
  id: string,
): Promise<
  | {
      replay: ReplayRow;
      players: ReplayPlayerRow[];
      events: GameEventRow[];
    }
  | undefined
> {
  const replayRows = await db
    .select()
    .from(replays)
    .where(eq(replays.id, id))
    .limit(1);

  const replay = replayRows[0];
  if (replay === undefined) return undefined;

  const players = await db
    .select()
    .from(replayPlayers)
    .where(eq(replayPlayers.replayId, id))
    .orderBy(asc(replayPlayers.slot));

  // Order by (t_ms, id) so the rebuilt timeline preserves the ascending-tMs
  // contract from shared-types. Postgres does NOT guarantee row order without
  // an explicit ORDER BY, even when rows were inserted in sorted order.
  const events = await db
    .select()
    .from(gameEvents)
    .where(eq(gameEvents.replayId, id))
    .orderBy(asc(gameEvents.tMs), asc(gameEvents.id));

  return { replay, players, events };
}
