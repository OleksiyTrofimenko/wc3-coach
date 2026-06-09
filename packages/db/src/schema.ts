/**
 * @wc3-coach/db — Drizzle ORM schema
 *
 * Tables covering the T2.1 subset needed for the T1.3 ingest pipeline.
 * Design doc §5.2 is the authoritative reference.
 *
 * Conventions:
 *   - snake_case column names in the DB; camelCase TS property names via Drizzle.
 *   - UUIDs use gen_random_uuid() (built into PG 16 core — no uuid-ossp needed).
 *   - game_events uses bigint GENERATED ALWAYS AS IDENTITY (high row volume).
 *   - Union-typed text columns are branded with .$type<>() so the TS layer carries
 *     the correct literal type from @wc3-coach/shared-types.
 *
 * PRINCIPLE #1: These tables store ONLY post-game replay data.
 *   No live-game schemas exist or will be added here.
 */

import {
  pgTable,
  text,
  uuid,
  integer,
  bigint,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { GameEventType, ReplayPlayer } from "@wc3-coach/shared-types";

// ---------------------------------------------------------------------------
// patch_versions
// ---------------------------------------------------------------------------

/**
 * Static patch version records.
 *
 * A replay references a patch via patch_id FK so analytics can compare
 * against the correct balance state. Stats and timings are versioned per patch.
 *
 * Design doc §5.1, §5.2.
 */
export const patchVersions = pgTable(
  "patch_versions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    /** Human-readable version string, e.g. "2.00", "1.36.1". */
    version: text("version").notNull(),
    /** Numeric build number from the .w3g header. */
    buildNumber: integer("build_number").notNull(),
    /** When the patch was officially released (may be null for unknown patches). */
    releasedAt: timestamp("released_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [uniqueIndex("patch_versions_version_build_idx").on(table.version, table.buildNumber)],
);

export type PatchVersionRow = typeof patchVersions.$inferSelect;
export type NewPatchVersionRow = typeof patchVersions.$inferInsert;

// ---------------------------------------------------------------------------
// replays
// ---------------------------------------------------------------------------

/**
 * One replay file; the top-level ingest lifecycle record.
 *
 * `status` drives the state machine:
 *   pending → parsing → done
 *                    └──→ error
 *
 * `file_hash` is a sha-256 hex digest used for deduplication: uploading the
 * same .w3g twice returns the existing row instead of creating a duplicate.
 *
 * Design doc §5.2.
 */
export const replays = pgTable("replays", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  /** SHA-256 hex digest of the raw .w3g file. Unique dedup key. */
  fileHash: text("file_hash").notNull().unique(),
  /** Ontology reference into maps, e.g. "map:echo_isles". Null until parsed. */
  mapId: text("map_id"),
  /** Wall-clock timestamp when the game was played (ISO 8601). Null until parsed. */
  playedAt: timestamp("played_at", { withTimezone: true }),
  /** Total game duration in milliseconds. Null until parsed. */
  durationMs: integer("duration_ms"),
  /** FK into patch_versions. Null until parsed. */
  patchId: uuid("patch_id").references(() => patchVersions.id),
  /** Winning player slot number. Null for draws, FLO replays, or until parsed. */
  winnerSlot: integer("winner_slot"),
  /**
   * Ingest lifecycle state.
   * pending  — row created, file saved, job enqueued.
   * parsing  — worker has started processing.
   * done     — timeline persisted successfully.
   * error    — worker failed (see error column).
   */
  status: text("status")
    .notNull()
    .default("pending")
    .$type<"pending" | "parsing" | "done" | "error">(),
  /** Last error message when status='error'. Null otherwise. */
  error: text("error"),
  /** Raw parsed metadata blob (w3gjs top-level fields). */
  rawMeta: jsonb("raw_meta"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export type ReplayRow = typeof replays.$inferSelect;
export type NewReplayRow = typeof replays.$inferInsert;

// ---------------------------------------------------------------------------
// replay_players
// ---------------------------------------------------------------------------

/**
 * One player slot within a replay.
 *
 * result is branded to ReplayPlayer['result'] from shared-types to keep
 * the literal union ("win" | "loss" | "unknown") in the TS layer.
 *
 * Design doc §5.2.
 */
export const replayPlayers = pgTable(
  "replay_players",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    replayId: uuid("replay_id")
      .notNull()
      .references(() => replays.id, { onDelete: "cascade" }),
    /** 1-based player slot from the replay header. */
    slot: integer("slot").notNull(),
    playerName: text("player_name").notNull(),
    /** Ontology reference into races, e.g. "race:O". Null until ontology resolved. */
    raceId: text("race_id"),
    /** Raw APM as recorded by the replay. Null if not available. */
    apm: integer("apm"),
    result: text("result")
      .notNull()
      .$type<ReplayPlayer["result"]>(),
  },
  (table) => [uniqueIndex("replay_players_replay_slot_idx").on(table.replayId, table.slot)],
);

export type ReplayPlayerRow = typeof replayPlayers.$inferSelect;
export type NewReplayPlayerRow = typeof replayPlayers.$inferInsert;

// ---------------------------------------------------------------------------
// game_events
// ---------------------------------------------------------------------------

/**
 * All normalized game events extracted from a replay.
 *
 * Uses bigint GENERATED ALWAYS AS IDENTITY (not UUID) because a single replay
 * can produce thousands of events — integer identity avoids UUID overhead.
 *
 * Indexed by (replay_id), (replay_id, slot), (replay_id, type) to support the
 * common access patterns: "all events for a replay", "events for one player",
 * "events of a given type in a replay".
 *
 * Design doc §5.2.
 */
export const gameEvents = pgTable(
  "game_events",
  {
    /** Surrogate PK — bigint generated identity for throughput. */
    id: bigint("id", { mode: "bigint" })
      .generatedAlwaysAsIdentity()
      .primaryKey(),
    replayId: uuid("replay_id")
      .notNull()
      .references(() => replays.id, { onDelete: "cascade" }),
    /** Player slot this event belongs to (matches replay_players.slot). */
    slot: integer("slot").notNull(),
    /** Milliseconds from game start. */
    tMs: integer("t_ms").notNull(),
    /** Event kind — branded to GameEventType from shared-types. */
    type: text("type")
      .notNull()
      .$type<GameEventType>(),
    /**
     * Ontology reference string, e.g. "unit:opeo", "building:oalt".
     * Provisional until T2.2 resolves these to canonical ontology IDs.
     */
    entityRef: text("entity_ref").notNull(),
    /**
     * Type-specific payload data (free bag).
     * Includes at minimum: { fourcc, resolved }.
     * See packages/parser/src/normalize.ts for the full shape.
     */
    payload: jsonb("payload").notNull(),
  },
  (table) => [
    index("game_events_replay_idx").on(table.replayId),
    index("game_events_replay_slot_idx").on(table.replayId, table.slot),
    index("game_events_replay_type_idx").on(table.replayId, table.type),
  ],
);

export type GameEventRow = typeof gameEvents.$inferSelect;
export type NewGameEventRow = typeof gameEvents.$inferInsert;
