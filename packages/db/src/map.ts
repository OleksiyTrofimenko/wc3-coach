/**
 * @wc3-coach/db — Pure mapping functions
 *
 * Converts a ReplayTimeline (from @wc3-coach/shared-types) into plain insert
 * row objects for the Drizzle schema tables.
 *
 * These functions are PURE — no DB access, no side-effects. They are designed
 * to be unit-testable without a running Postgres instance.
 *
 * Design doc §5.2; shared-types canonical shapes in @wc3-coach/shared-types.
 *
 * Provisional fields
 * ------------------
 * Several fields are "provisional" at this stage:
 *   - patchId: resolved from the patchId string AFTER the patch_versions row
 *     is created (done in persist.ts). The mapping functions leave it undefined.
 *   - playedAt: the w3gjs parser does not provide a wall-clock timestamp;
 *     the field is left null here and may be enriched from FLO data later.
 *   - raceId: passed through as-is from the parser (e.g. "race:O") — ontology
 *     resolution to a full uuid FK happens in T2.2.
 */

import type { ReplayTimeline, GameEvent, ReplayPlayer } from "@wc3-coach/shared-types";
import type { NewReplayRow, NewReplayPlayerRow, NewGameEventRow } from "./schema.js";

// ---------------------------------------------------------------------------
// timelineToReplayRow
// ---------------------------------------------------------------------------

/**
 * Produce the INSERT row for the `replays` table from a parsed timeline.
 *
 * Note: `patchId` (uuid FK) is intentionally omitted here — it is resolved
 * by `persistTimeline` after the patch_versions upsert.
 * `playedAt` is null because w3gjs does not expose wall-clock time (T2.3).
 * `status` is set to "done" because this mapping is only called from the
 * worker after a successful parse; the status='pending' row was already
 * created by `createPendingReplay` at upload time.
 *
 * @param timeline - Canonical parsed timeline from @wc3-coach/parser.
 * @returns A row object suitable for Drizzle INSERT / UPDATE.
 */
export function timelineToReplayRow(
  timeline: ReplayTimeline,
): Omit<NewReplayRow, "patchId"> {
  return {
    fileHash: timeline.fileHash,
    mapId: timeline.mapId !== "" ? timeline.mapId : null,
    // w3gjs does not supply wall-clock time — enrichment deferred (T2.3 / FLO).
    playedAt: null,
    durationMs: timeline.durationMs > 0 ? timeline.durationMs : null,
    winnerSlot: timeline.winnerSlot ?? null,
    status: "done",
    error: null,
    // rawMeta stores a minimal summary; full event data is in game_events.
    rawMeta: {
      patchId: timeline.patchId,
      playerCount: timeline.players.length,
      eventCount: timeline.events.length,
    },
  };
}

// ---------------------------------------------------------------------------
// timelineToPlayerRows
// ---------------------------------------------------------------------------

/**
 * Produce INSERT rows for the `replay_players` table.
 *
 * The `replayId` uuid is injected at call-time (after the replays row is
 * known) — this function accepts it as a parameter to keep the mapping pure.
 *
 * @param timeline  - Canonical parsed timeline.
 * @param replayId  - UUID of the parent replays row (from DB after insert/update).
 * @returns One row per player in the timeline.
 */
export function timelineToPlayerRows(
  timeline: ReplayTimeline,
  replayId: string,
): NewReplayPlayerRow[] {
  return timeline.players.map((p: ReplayPlayer): NewReplayPlayerRow => ({
    replayId,
    slot: p.slot,
    playerName: p.playerName,
    raceId: p.raceId !== "" ? p.raceId : null,
    apm: p.apm > 0 ? p.apm : null,
    result: p.result,
  }));
}

// ---------------------------------------------------------------------------
// timelineToEventRows
// ---------------------------------------------------------------------------

/**
 * Produce INSERT rows for the `game_events` table.
 *
 * `id` is omitted (bigint GENERATED ALWAYS AS IDENTITY — the DB assigns it).
 * The `replayId` uuid is injected at call-time.
 *
 * Event rows are returned in the same order as `timeline.events` (already
 * sorted ascending by tMs per shared-types contract).
 *
 * @param timeline  - Canonical parsed timeline.
 * @param replayId  - UUID of the parent replays row.
 * @returns One row per event in the timeline.
 */
export function timelineToEventRows(
  timeline: ReplayTimeline,
  replayId: string,
): NewGameEventRow[] {
  return timeline.events.map((ev: GameEvent): NewGameEventRow => ({
    replayId,
    slot: ev.slot,
    tMs: ev.tMs,
    type: ev.type,
    entityRef: ev.entityRef,
    payload: ev.payload,
  }));
}

// ---------------------------------------------------------------------------
// parsePatchId
// ---------------------------------------------------------------------------

/**
 * Parse a provisional patchId string (from the parser) into version + build.
 *
 * The parser emits patchId in the format: "patch:<version>+<build>"
 * e.g. "patch:2.00+6117"
 *
 * Returns null if the string does not match the expected format (unexpected
 * replay format — the caller should store null patchId rather than crashing).
 *
 * @param patchId - Provisional patchId from ReplayTimeline.
 */
export function parsePatchId(
  patchId: string,
): { version: string; buildNumber: number } | null {
  // Expected format: "patch:<version>+<buildNumber>"
  const match = /^patch:(.+)\+(\d+)$/.exec(patchId);
  if (!match) return null;
  const [, version, buildStr] = match;
  if (version === undefined || buildStr === undefined) return null;
  const buildNumber = parseInt(buildStr, 10);
  if (isNaN(buildNumber)) return null;
  return { version, buildNumber };
}
