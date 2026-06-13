/**
 * @wc3-coach/db — Drizzle ORM schema
 *
 * Tables covering the full T2.1 scope: ingest pipeline tables (T1.3) plus the
 * complete ontology, analytics, and knowledge-base tables defined in the design doc.
 *
 * Design doc §5 is the authoritative reference for the data model.
 * §5.1 — ontology (static game facts)
 * §5.2 — replays + benchmarks (dynamic / analytics)
 * §5.3 — apm_sessions (APM trainer progress)
 * §5.4 — knowledge_docs / knowledge_chunks (RAG)
 *
 * Conventions:
 *   - snake_case column names in the DB; camelCase TS property names via Drizzle.
 *   - UUIDs use gen_random_uuid() (built into PG 16 core — no uuid-ossp needed).
 *   - game_events uses bigint GENERATED ALWAYS AS IDENTITY (high row volume).
 *   - Union-typed text columns are branded with .$type<>() so the TS layer carries
 *     the correct literal type from @wc3-coach/shared-types.
 *
 * PATCH-VERSIONING DECISION (T2.1):
 *   Stat-bearing ontology tables (heroes, units, buildings, upgrades,
 *   hero_abilities) carry a NULLABLE patch_id FK → patch_versions.
 *   NULL means "valid across all patches" (a bootstrap value before per-patch
 *   splits are imported). A non-null patch_id means the row holds the stats
 *   for that specific patch. The UNIQUE constraint on (key, patch_id) enforces
 *   one row per entity per patch version. This implements Principle "stats are
 *   versioned by patch" and is the foundation for T2.3 (patch diff import).
 *   Identity tables races and maps are patch-invariant; they carry no patch_id.
 *
 * PRINCIPLE #1: These tables store ONLY post-game replay data and static game
 *   facts. No live-game schemas exist or will be added here.
 */

import {
  pgTable,
  text,
  uuid,
  integer,
  bigint,
  real,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { vector } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type {
  GameEventType,
  ReplayPlayer,
  BenchmarkSeverity,
  CoachReport,
  CoachTip,
} from "@wc3-coach/shared-types";

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
  /**
   * True when this replay is reference/pro data used to build benchmark
   * references (pro-replay aggregation), NOT a personal game. Reference replays
   * drive aggregation and are hidden from the personal coach history. Set by the
   * refdata ingest CLI after upload; the ingest worker never touches it.
   */
  isReference: boolean("is_reference").notNull().default(false),
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

// ===========================================================================
// ONTOLOGY TABLES — design doc §5.1
//
// PATCH-VERSIONING: stat-bearing tables (heroes, units, buildings, upgrades,
// hero_abilities) carry nullable patch_id. See file-level comment for the
// full decision rationale.
// ===========================================================================

// ---------------------------------------------------------------------------
// races
// ---------------------------------------------------------------------------

/**
 * Race identity table — patch-invariant.
 *
 * `key` is the stable slug used throughout the system to identify a race,
 * e.g. "human", "orc", "undead", "nightelf", "random".
 * The parser emits provisional refs like "race:O" which T2.2 resolves
 * against this key.
 *
 * Design doc §5.1.
 */
export const races = pgTable(
  "races",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    /**
     * Stable slug, e.g. "human", "orc", "undead", "nightelf".
     * The parser's provisional race refs (e.g. "race:O", "race:H") are
     * resolved against this key in T2.2 ontology enrichment.
     */
    key: text("key").notNull(),
    /** Display name, e.g. "Orc", "Human". */
    name: text("name").notNull(),
  },
  (table) => [uniqueIndex("races_key_idx").on(table.key)],
);

export type RaceRow = typeof races.$inferSelect;
export type NewRaceRow = typeof races.$inferInsert;

// ---------------------------------------------------------------------------
// heroes
// ---------------------------------------------------------------------------

/**
 * Hero definitions, optionally scoped to a patch.
 *
 * `patch_id` is nullable: a null row acts as the canonical patch-agnostic
 * definition; non-null rows override stats for a specific patch (T2.3).
 * UNIQUE(key, patch_id) ensures one row per hero per patch.
 *
 * `base_stats` jsonb carries HP, mana, armor, str/agi/int per level, etc.
 * Exact shape defined in T2.2 import and .claude/skills/wc3-knowledge/ontology.md.
 *
 * Design doc §5.1.
 */
export const heroes = pgTable(
  "heroes",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    raceId: uuid("race_id")
      .notNull()
      .references(() => races.id),
    /**
     * FK into patch_versions. NULL = patch-agnostic bootstrap value.
     * Non-null = stats specific to that patch. See patch-versioning decision.
     */
    patchId: uuid("patch_id").references(() => patchVersions.id),
    /** Stable slug, e.g. "paladin", "blademaster", "death_knight". */
    key: text("key").notNull(),
    /** Display name, e.g. "Paladin". */
    name: text("name").notNull(),
    /** Primary attribute — branded to the literal union. */
    primaryAttr: text("primary_attr")
      .notNull()
      .$type<"str" | "agi" | "int">(),
    /**
     * JSONB blob of base stats: HP, mana, armor value, armor type,
     * str/agi/int base and per-level gain. Shape defined in T2.2.
     */
    baseStats: jsonb("base_stats").notNull(),
    /**
     * Warcraft III FourCC identifier for this hero as emitted by w3gjs,
     * e.g. "Obla" (Blademaster), "Nfir" (Priestess of the Moon).
     * Nullable — NULL for entries not yet assigned a FourCC.
     * Non-unique because the same FourCC may appear across multiple patch rows.
     * Used by T2.2 resolver to map provisional "hero:Obla" refs to canonical keys.
     */
    fourcc: text("fourcc"),
  },
  (table) => [
    // NULLS NOT DISTINCT: a NULL patch_id means "patch-agnostic", and there
    // must be at most ONE such row per key. Without this, Postgres treats NULLs
    // as distinct and would allow duplicate patch-agnostic rows for the same key.
    // A unique CONSTRAINT (not uniqueIndex) is used because only the constraint
    // builder exposes .nullsNotDistinct(); it still creates a backing btree index.
    unique("heroes_key_patch_uq").on(table.key, table.patchId).nullsNotDistinct(),
    index("heroes_fourcc_idx").on(table.fourcc),
  ],
);

export type HeroRow = typeof heroes.$inferSelect;
export type NewHeroRow = typeof heroes.$inferInsert;

// ---------------------------------------------------------------------------
// hero_abilities
// ---------------------------------------------------------------------------

/**
 * Abilities belonging to a hero, keyed to the hero row (which already
 * carries a patch_id if patch-specific).
 *
 * `levels` jsonb is an ordered array of per-level data: mana cost, cooldown,
 * effect description, etc. Exact shape defined in T2.2.
 *
 * Design doc §5.1.
 */
export const heroAbilities = pgTable(
  "hero_abilities",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    heroId: uuid("hero_id")
      .notNull()
      .references(() => heroes.id, { onDelete: "cascade" }),
    /** Stable slug, e.g. "holy_light", "storm_bolt". */
    key: text("key").notNull(),
    /** Display name. */
    name: text("name").notNull(),
    /**
     * JSONB array of per-level objects: [{level, manaCost, cooldown, range,
     * aoe, duration, description}, ...]. Exact shape defined in T2.2.
     */
    levels: jsonb("levels").notNull(),
    /**
     * Warcraft III FourCC for this ability as emitted by w3gjs,
     * e.g. "AOmi" (Mirror Image), "ANlm" (Lunar Flare).
     * Nullable — NULL for entries not yet assigned a FourCC.
     * Used by T2.2 resolver to map provisional "ability:AOmi" refs.
     */
    fourcc: text("fourcc"),
  },
  (table) => [index("hero_abilities_fourcc_idx").on(table.fourcc)],
);

export type HeroAbilityRow = typeof heroAbilities.$inferSelect;
export type NewHeroAbilityRow = typeof heroAbilities.$inferInsert;

// ---------------------------------------------------------------------------
// units
// ---------------------------------------------------------------------------

/**
 * Non-hero unit definitions (melee, ranged, casters, summoned, etc.).
 *
 * `patch_id` nullable: same patch-versioning scheme as heroes.
 * UNIQUE(key, patch_id) — one row per unit per patch.
 *
 * `build_time` is in integer seconds (game-seconds as used in the WC3
 * in-game UI, e.g. Footman = 20 s). NOT milliseconds.
 *
 * `key` is the stable ontology slug the parser resolves against, e.g.
 * "footman", "grunt", "ghoul". The parser emits provisional entity_ref
 * strings such as "unit:hfoo" (Footman FOURCC) which T2.2 maps to this
 * key — see game_events.entity_ref and ontology.md for the FOURCC→key table.
 *
 * Design doc §5.1.
 */
export const units = pgTable(
  "units",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    raceId: uuid("race_id")
      .notNull()
      .references(() => races.id),
    /** FK into patch_versions. NULL = patch-agnostic. */
    patchId: uuid("patch_id").references(() => patchVersions.id),
    /**
     * Stable slug, e.g. "footman", "grunt", "crypt_fiend".
     * This is the join target for parser provisional refs like "unit:hfoo" —
     * T2.2 maps FOURCC codes to these keys during ontology enrichment.
     */
    key: text("key").notNull(),
    /** Display name, e.g. "Footman". */
    name: text("name").notNull(),
    /** Maximum hit points. */
    hp: integer("hp").notNull(),
    /** Armor value (numeric). */
    armor: integer("armor").notNull(),
    /**
     * Armor type slug, e.g. "heavy", "medium", "light", "unarmored",
     * "fort", "hero", "divine", "none".
     * Interacts with attack_type for damage multipliers — see ontology.md.
     */
    armorType: text("armor_type").notNull(),
    /**
     * Attack type slug, e.g. "normal", "pierce", "siege", "magic",
     * "chaos", "hero", "spells".
     */
    attackType: text("attack_type").notNull(),
    /**
     * Average damage per second (integer, rounded).
     * Computed from base damage + dice + cooldown; exact formula in T2.2.
     */
    dps: integer("dps").notNull(),
    /** Gold cost. */
    gold: integer("gold").notNull(),
    /** Lumber cost. */
    lumber: integer("lumber").notNull(),
    /** Food (supply) used. */
    food: integer("food").notNull(),
    /**
     * Training time in integer seconds (game-seconds, e.g. Footman = 20).
     * Use integer seconds throughout ontology for consistency with in-game UI.
     */
    buildTime: integer("build_time").notNull(),
    /**
     * JSONB bag of tech-tree requirements, e.g.
     * [{type:"building", key:"blacksmith"}, {type:"upgrade", key:"forged_swords"}].
     * Shape defined in T2.2.
     */
    techReq: jsonb("tech_req"),
    /**
     * Warcraft III FourCC identifier for this unit as emitted by w3gjs,
     * e.g. "opeo" (Peon), "ogru" (Grunt), "ewsp" (Wisp).
     * Nullable — NULL for entries not yet assigned a FourCC.
     * Used by T2.2 resolver to map provisional "unit:opeo" refs to canonical keys.
     */
    fourcc: text("fourcc"),
  },
  (table) => [
    // NULLS NOT DISTINCT — one patch-agnostic (NULL patch) row per key. See heroes.
    unique("units_key_patch_uq").on(table.key, table.patchId).nullsNotDistinct(),
    index("units_race_idx").on(table.raceId),
    index("units_fourcc_idx").on(table.fourcc),
  ],
);

export type UnitRow = typeof units.$inferSelect;
export type NewUnitRow = typeof units.$inferInsert;

// ---------------------------------------------------------------------------
// buildings
// ---------------------------------------------------------------------------

/**
 * Building definitions (production, research, towers, etc.).
 *
 * `patch_id` nullable: same patch-versioning scheme as units.
 * `build_time` in integer seconds (game-seconds).
 * `provides` jsonb: what the building unlocks or does, e.g.
 * [{type:"unit", key:"footman"}, {type:"upgrade", key:"forged_swords"}].
 *
 * Design doc §5.1.
 */
export const buildings = pgTable(
  "buildings",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    raceId: uuid("race_id")
      .notNull()
      .references(() => races.id),
    /** FK into patch_versions. NULL = patch-agnostic. */
    patchId: uuid("patch_id").references(() => patchVersions.id),
    /** Stable slug, e.g. "barracks", "altar_of_kings", "great_hall". */
    key: text("key").notNull(),
    /** Display name. */
    name: text("name").notNull(),
    /** Maximum hit points. */
    hp: integer("hp").notNull(),
    /** Armor value (numeric). */
    armor: integer("armor").notNull(),
    /** Gold cost. */
    gold: integer("gold").notNull(),
    /** Lumber cost. */
    lumber: integer("lumber").notNull(),
    /** Construction time in integer seconds (game-seconds). */
    buildTime: integer("build_time").notNull(),
    /**
     * JSONB list of what this building provides or enables:
     * units it can train, upgrades it can research, abilities it unlocks.
     * Shape: [{type:"unit"|"upgrade"|"ability", key:string}, ...].
     */
    provides: jsonb("provides"),
    /**
     * Warcraft III FourCC identifier for this building as emitted by w3gjs,
     * e.g. "oalt" (Altar of Storms), "emow" (Moon Well).
     * Nullable — NULL for entries not yet assigned a FourCC.
     * Used by T2.2 resolver to map provisional "building:oalt" refs.
     */
    fourcc: text("fourcc"),
  },
  (table) => [
    // NULLS NOT DISTINCT — one patch-agnostic (NULL patch) row per key. See heroes.
    unique("buildings_key_patch_uq").on(table.key, table.patchId).nullsNotDistinct(),
    index("buildings_race_idx").on(table.raceId),
    index("buildings_fourcc_idx").on(table.fourcc),
  ],
);

export type BuildingRow = typeof buildings.$inferSelect;
export type NewBuildingRow = typeof buildings.$inferInsert;

// ---------------------------------------------------------------------------
// upgrades
// ---------------------------------------------------------------------------

/**
 * Research upgrades (weapons, armor, abilities, racial upgrades).
 *
 * `patch_id` nullable: same versioning scheme.
 * `levels` jsonb: ordered array of per-level data (cost, research time,
 * effect). Shape defined in T2.2.
 *
 * Design doc §5.1.
 */
export const upgrades = pgTable(
  "upgrades",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    raceId: uuid("race_id")
      .notNull()
      .references(() => races.id),
    /** FK into patch_versions. NULL = patch-agnostic. */
    patchId: uuid("patch_id").references(() => patchVersions.id),
    /** Stable slug, e.g. "forged_swords", "animal_war_training". */
    key: text("key").notNull(),
    /** Display name, e.g. "Forged Swords". */
    name: text("name").notNull(),
    /**
     * JSONB array of per-level data:
     * [{level, gold, lumber, researchTime, description, effect}, ...].
     * researchTime is in integer seconds (game-seconds). Shape in T2.2.
     */
    levels: jsonb("levels").notNull(),
    /**
     * Warcraft III FourCC identifier for this upgrade as emitted by w3gjs,
     * e.g. "Roen" (Ensnare for Raiders), "Rowt" (Witch Doctor Adept Training).
     * Nullable — NULL for entries not yet assigned a FourCC.
     * Used by T2.2 resolver to map provisional "upgrade:Roen" refs.
     */
    fourcc: text("fourcc"),
  },
  (table) => [
    // NULLS NOT DISTINCT — one patch-agnostic (NULL patch) row per key. See heroes.
    unique("upgrades_key_patch_uq").on(table.key, table.patchId).nullsNotDistinct(),
    index("upgrades_fourcc_idx").on(table.fourcc),
  ],
);

export type UpgradeRow = typeof upgrades.$inferSelect;
export type NewUpgradeRow = typeof upgrades.$inferInsert;

// ---------------------------------------------------------------------------
// maps
// ---------------------------------------------------------------------------

/**
 * Map definitions — patch-invariant identity table.
 *
 * `key` is the stable slug used in replays.map_id and game events, e.g.
 * "echo_isles", "twisted_meadows", "northshire_cliffs".
 * `layout_meta` jsonb carries dimensions, starting positions, expansion
 * locations, and other map-specific metadata needed for heatmaps and
 * creep-camp lookups.
 *
 * Design doc §5.1.
 */
export const maps = pgTable(
  "maps",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    /** Stable slug, e.g. "echo_isles". Used as the FK target from replays.map_id. */
    key: text("key").notNull(),
    /** Display name, e.g. "Echo Isles". */
    name: text("name").notNull(),
    /** Tileset identifier, e.g. "lordaeron_summer", "barrens", "ashenvale". */
    tileset: text("tileset").notNull(),
    /** Number of player slots (2, 4, 6, 8). */
    playerCount: integer("player_count").notNull(),
    /**
     * JSONB of map-specific layout data: dimensions, start positions, expo
     * locations, natural creep camp positions. Shape defined in T2.2.
     */
    layoutMeta: jsonb("layout_meta"),
  },
  (table) => [uniqueIndex("maps_key_idx").on(table.key)],
);

export type MapRow = typeof maps.$inferSelect;
export type NewMapRow = typeof maps.$inferInsert;

// ---------------------------------------------------------------------------
// creep_camps
// ---------------------------------------------------------------------------

/**
 * Neutral creep camp definitions per map.
 *
 * `position` jsonb: {x: number, y: number} in map coordinates.
 * `units` jsonb: array of {key: string, count: number} creep entries.
 * `drops` jsonb: array of possible item drops with drop rates.
 * `difficulty` slug: "green", "orange", "red" following WC3 conventions.
 *
 * Indexed on map_id for fast per-map lookups (used by benchmarks to score
 * creep-route efficiency).
 *
 * Design doc §5.1.
 */
export const creepCamps = pgTable(
  "creep_camps",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    mapId: uuid("map_id")
      .notNull()
      .references(() => maps.id, { onDelete: "cascade" }),
    /**
     * Map coordinates: {x: number, y: number}.
     * Coordinate system matches the w3g replay format used by the Observer API.
     */
    position: jsonb("position").notNull(),
    /**
     * Difficulty tier: "green" | "orange" | "red".
     * Follows standard WC3 creep camp colour conventions.
     */
    difficulty: text("difficulty").notNull(),
    /**
     * JSONB array of creeps in the camp:
     * [{key: string, count: number}, ...] where key is the unit ontology slug.
     */
    units: jsonb("units").notNull(),
    /**
     * JSONB array of possible item drops:
     * [{itemKey: string, dropChance: number}, ...].
     * dropChance in [0, 1]. Shape defined in T2.2.
     */
    drops: jsonb("drops"),
  },
  (table) => [index("creep_camps_map_idx").on(table.mapId)],
);

export type CreepCampRow = typeof creepCamps.$inferSelect;
export type NewCreepCampRow = typeof creepCamps.$inferInsert;

// ===========================================================================
// ANALYTICS TABLES — design doc §5.2, §5.3
// ===========================================================================

// ---------------------------------------------------------------------------
// benchmarks
// ---------------------------------------------------------------------------

/**
 * Computed benchmark deviations from a reference value for a single metric
 * within a replay. Aligns field-for-field to BenchmarkResult in shared-types.
 *
 * Indexed on (replay_id) and (replay_id, slot) to support:
 *   "all benchmarks for a replay" — the primary analytics query.
 *   "benchmarks for one player in a replay" — per-player breakdown.
 *
 * ON DELETE CASCADE: benchmarks are meaningless without their replay.
 *
 * Design doc §5.2, shared-types BenchmarkResult.
 */
export const benchmarks = pgTable(
  "benchmarks",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    replayId: uuid("replay_id")
      .notNull()
      .references(() => replays.id, { onDelete: "cascade" }),
    /** Player slot the metric belongs to (matches replay_players.slot). */
    slot: integer("slot").notNull(),
    /**
     * Human-readable metric name, e.g. "expand_time", "hero_level_3_time",
     * "floating_gold". Matches BenchmarkResult.metric.
     */
    metric: text("metric").notNull(),
    /** Actual measured value (units natural to the metric). Maps to BenchmarkResult.value. */
    value: real("value").notNull(),
    /**
     * Reference value from the benchmark corpus for this matchup + patch.
     * NULLABLE: null when no reference exists for this metric/matchup/patch
     * (in which case severity is always 'info'). Maps to BenchmarkResult.expected.
     */
    expected: real("expected"),
    /**
     * Signed delta: value − expected.
     * Positive = later/more than expected; negative = earlier/less.
     * NULLABLE: null whenever `expected` is null. Maps to BenchmarkResult.delta.
     */
    delta: real("delta"),
    /**
     * Severity tier — branded to BenchmarkSeverity from shared-types.
     * Ordinal: info < minor < major < critical.
     */
    severity: text("severity")
      .notNull()
      .$type<BenchmarkSeverity>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    index("benchmarks_replay_idx").on(table.replayId),
    index("benchmarks_replay_slot_idx").on(table.replayId, table.slot),
  ],
);

export type BenchmarkRow = typeof benchmarks.$inferSelect;
export type NewBenchmarkRow = typeof benchmarks.$inferInsert;

// ---------------------------------------------------------------------------
// benchmark_references
// ---------------------------------------------------------------------------

/**
 * Curatable reference values for benchmark comparisons.
 *
 * This is the DB-backed home for what used to live as Python literals in
 * apps/api-py/app/benchmarks/references.py. Each row is the expected value for
 * one (matchup, race, metric) at a given patch, plus a provenance tier recording
 * where the number came from. Moving these out of code lets us:
 *   - edit timings live via the admin panel (no redeploy), and
 *   - record provenance so pro-replay aggregation can write trustworthy rows
 *     (provenance='pro') that outrank wiki guesses (provenance='community').
 *
 * Severity *thresholds* remain global policy in code (references.py); only the
 * per-(matchup, race, metric) *values* are data.
 *
 * Patch-versioning mirrors the ontology stat tables: NULL patch_id = baseline
 * (valid across patches); a non-null patch_id pins the value to that patch.
 * The loader prefers a patch-specific row, falling back to the NULL baseline.
 */
export const benchmarkReferences = pgTable(
  "benchmark_references",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    /** Canonical matchup code, analysed-race-first, e.g. "OvNE", "HvO". */
    matchup: text("matchup").notNull(),
    /** Analysed player's race id, e.g. "orc" (matches ontology race slug). */
    raceId: text("race_id").notNull(),
    /** Metric name, e.g. "first_hero_timing" (matches BenchmarkResult.metric). */
    metric: text("metric").notNull(),
    /** Expected value (ms for timings; dimensionless for level/count metrics). */
    expected: real("expected").notNull(),
    /** Natural window for this metric (documentation/future per-metric severity). */
    windowMs: real("window_ms").notNull(),
    /** Free-text rationale / source note. */
    notes: text("notes"),
    /**
     * Provenance tier — where the number came from.
     *   community — high-ladder/wiki knowledge (the original seed tier)
     *   pro       — aggregated from pro replays (T-step #2)
     *   user      — manually verified/overridden by the user
     */
    provenance: text("provenance")
      .notNull()
      .default("community")
      .$type<"community" | "pro" | "user">(),
    /** Optional confidence flag for low-certainty values. Nullable. */
    confidence: text("confidence").$type<"low" | "medium" | "high" | null>(),
    /**
     * Number of pro observations this value was aggregated from. NULL for
     * hand-authored (community/user) rows; set for provenance='pro' rows so the
     * UI can show confidence (n=3 weak vs n=120 strong).
     */
    sampleSize: integer("sample_size"),
    /**
     * Aggregate spread for pro-derived rows: { p25, p75 } in the metric's units.
     * NULL for hand-authored rows. Stored for future percentile-based severity.
     */
    dist: jsonb("dist"),
    /** FK into patch_versions. NULL = patch-agnostic baseline. */
    patchId: uuid("patch_id").references(() => patchVersions.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    // One row per (matchup, race, metric) per patch; NULLS NOT DISTINCT so a
    // single NULL-patch baseline row collapses correctly (see ontology tables).
    unique("benchmark_references_key_patch_uq")
      .on(table.matchup, table.raceId, table.metric, table.patchId)
      .nullsNotDistinct(),
    index("benchmark_references_lookup_idx").on(
      table.matchup,
      table.raceId,
      table.metric,
    ),
  ],
);

export type BenchmarkReferenceRow = typeof benchmarkReferences.$inferSelect;
export type NewBenchmarkReferenceRow = typeof benchmarkReferences.$inferInsert;

// ---------------------------------------------------------------------------
// reference_observations
// ---------------------------------------------------------------------------

/**
 * Immutable per-replay metric observations — the raw facts that pro-derived
 * benchmark_references rows are aggregated from (median/p25/p75/n).
 *
 * "Store observations, derive aggregates": keeping every raw value means a
 * reference is recomputable (add replays, change the aggregation method) and
 * auditable ("this number came from these N games") without re-parsing. Mirrors
 * the game_events → benchmarks relationship.
 *
 * One row per (source replay × player-slot perspective × metric). value uses the
 * metric's natural units (ms for timings, count for worker metrics).
 */
export const referenceObservations = pgTable(
  "reference_observations",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    /** Matchup code from the observed player's perspective, e.g. "OvNE". */
    matchup: text("matchup").notNull(),
    /** Observed player's race id, e.g. "orc". */
    raceId: text("race_id").notNull(),
    /** Metric name (matches BenchmarkResult.metric / benchmark_references.metric). */
    metric: text("metric").notNull(),
    /** Measured value in the metric's natural units. */
    value: real("value").notNull(),
    /** Replay this observation was extracted from. */
    sourceReplayId: uuid("source_replay_id")
      .notNull()
      .references(() => replays.id, { onDelete: "cascade" }),
    /** Observed player's name (provenance/audit). */
    playerName: text("player_name"),
    /** FK into patch_versions (the source replay's patch). NULL if unresolved. */
    patchId: uuid("patch_id").references(() => patchVersions.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    index("reference_observations_key_idx").on(
      table.matchup,
      table.raceId,
      table.metric,
    ),
    index("reference_observations_replay_idx").on(table.sourceReplayId),
  ],
);

export type ReferenceObservationRow = typeof referenceObservations.$inferSelect;
export type NewReferenceObservationRow =
  typeof referenceObservations.$inferInsert;

// ---------------------------------------------------------------------------
// training_examples
// ---------------------------------------------------------------------------

/**
 * Curated coaching examples for fine-tuning the local LLM.
 *
 * One example = (captured prompt messages) → (human-curated ideal tips), the
 * exact (input → output) pair a QLoRA run consumes. The input is the system+user
 * messages the coach builds for a replay (CONTEXT + FACTS + REFERENCE MATERIAL);
 * the output is the gold tips a human approved. Per Principle #4 we teach
 * style/grounding discipline, NOT facts — so the gold is seeded from the
 * deterministic fact-summaries and edited by a human, never from the LLM's own
 * (flawed) output.
 *
 * One row per replay (unique replay_id); upsert as curation progresses.
 */
export const trainingExamples = pgTable(
  "training_examples",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    replayId: uuid("replay_id")
      .notNull()
      .references(() => replays.id, { onDelete: "cascade" }),
    /** Denormalized context for browsing/filtering the dataset. */
    matchup: text("matchup"),
    mapName: text("map_name"),
    result: text("result"),
    /** The captured prompt messages (the training INPUT): [{role, content}, ...]. */
    inputMessages: jsonb("input_messages").notNull(),
    /** The curated gold tips (the training OUTPUT): CoachTip[]-shaped. */
    outputTips: jsonb("output_tips").notNull(),
    /** Curation lifecycle: 'draft' (seeded/in-progress) | 'approved' (export-ready). */
    status: text("status")
      .notNull()
      .default("draft")
      .$type<"draft" | "approved">(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    uniqueIndex("training_examples_replay_uq").on(table.replayId),
  ],
);

export type TrainingExampleRow = typeof trainingExamples.$inferSelect;
export type NewTrainingExampleRow = typeof trainingExamples.$inferInsert;

// ---------------------------------------------------------------------------
// apm_sessions
// ---------------------------------------------------------------------------

/**
 * Recorded outcome of one APM trainer drill session.
 * Standalone — NOT FK'd to replays (APM drills are independent of replays).
 * Aligns field-for-field to DrillResult in shared-types.
 *
 * `checkpoints` is nullable jsonb: array of DrillCheckpoint objects
 * [{tMs, ok}, ...] when the drill supports per-step evaluation.
 *
 * Design doc §5.3, shared-types DrillResult.
 */
export const apmSessions = pgTable("apm_sessions", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  /**
   * Drill scenario identifier, e.g. "hotkey:control_groups", "micro:kiting".
   * Maps to DrillResult.drillType.
   */
  drillType: text("drill_type").notNull(),
  /**
   * Wall-clock start timestamp. Maps to DrillResult.startedAt (ISO 8601 in TS).
   */
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  /** Total session duration in milliseconds. Maps to DrillResult.durationMs. */
  durationMs: integer("duration_ms").notNull(),
  /** Effective actions per minute (meaningful inputs only). Maps to DrillResult.epm. */
  epm: real("epm").notNull(),
  /** Raw actions per minute. Maps to DrillResult.apm. */
  apm: real("apm").notNull(),
  /**
   * Fraction of correct actions in [0, 1]. Maps to DrillResult.accuracy.
   */
  accuracy: real("accuracy").notNull(),
  /** Mean reaction time across all reaction prompts (ms). Maps to DrillResult.reactionMs. */
  reactionMs: integer("reaction_ms").notNull(),
  /**
   * Composite score for the session. Maps to DrillResult.score.
   * Scaling is drill-type-specific; see APM trainer design.
   */
  score: real("score").notNull(),
  /**
   * Optional ordered per-step results within the drill.
   * JSONB array: [{tMs: number, ok: boolean}, ...].
   * Maps to DrillResult.checkpoints.
   */
  checkpoints: jsonb("checkpoints"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export type ApmSessionRow = typeof apmSessions.$inferSelect;
export type NewApmSessionRow = typeof apmSessions.$inferInsert;

// ---------------------------------------------------------------------------
// coach_reports
// ---------------------------------------------------------------------------

/**
 * The LLM coach's synthesized output for one replay (EPIC 5, T5.3).
 * Aligns field-for-field to CoachReport in shared-types — this row IS the
 * persisted payload served to the dashboard.
 *
 * One report per replay: `replay_id` is UNIQUE so POST /coach/{id}/run is an
 * idempotent upsert (a re-run replaces the previous report). The report is
 * fully derived from deterministic inputs (scored benchmarks) + retrieved
 * corpus chunks; `model` records which Ollama model produced it for provenance,
 * since regenerating with a different model yields different prose.
 *
 * `tips` is the ordered CoachTip[] (3–5 prioritised tips). Stored as JSONB
 * rather than a child table because tips are always read/written as a whole
 * report and never queried individually.
 *
 * ON DELETE CASCADE: a report is meaningless without its replay.
 *
 * Design doc §7.3 (coach prompt contract → output), shared-types CoachReport.
 */
export const coachReports = pgTable(
  "coach_reports",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    replayId: uuid("replay_id")
      .notNull()
      .references(() => replays.id, { onDelete: "cascade" }),
    /** Matchup code, e.g. "OvH". Maps to CoachReport.matchup. */
    matchup: text("matchup").notNull(),
    /** Map name. Maps to CoachReport.mapName. */
    mapName: text("map_name").notNull(),
    /**
     * Game result from the analysed (Orc) player's perspective.
     * Branded to CoachReport['result']. Maps to CoachReport.result.
     */
    result: text("result")
      .notNull()
      .$type<CoachReport["result"]>(),
    /** Game duration in milliseconds. Maps to CoachReport.durationMs. */
    durationMs: integer("duration_ms").notNull(),
    /**
     * Ordered array of CoachTip objects (3–5 prioritised tips).
     * JSONB; branded to CoachTip[]. Maps to CoachReport.tips.
     */
    tips: jsonb("tips").notNull().$type<CoachTip[]>(),
    /**
     * Ollama model tag that produced this report, e.g.
     * "qwen2.5:14b-instruct-q4_K_M". Provenance — not part of the TS contract.
     */
    model: text("model").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [uniqueIndex("coach_reports_replay_idx").on(table.replayId)],
);

export type CoachReportRow = typeof coachReports.$inferSelect;
export type NewCoachReportRow = typeof coachReports.$inferInsert;

// ---------------------------------------------------------------------------
// tip_feedback
// ---------------------------------------------------------------------------

/**
 * User feedback on coach output — the human-in-the-loop review signal.
 *
 * The user reviews a replay's CoachReport and flags what is wrong (or right),
 * so calibration fixes are driven by real examples rather than guesswork (this
 * is exactly how the Orc expansion mis-calibration was found). One replay can
 * accumulate many feedback rows (one per flagged tip, plus whole-report notes),
 * so this is NOT unique on replay_id.
 *
 * - tip_priority: which tip the feedback targets (1-based, matches
 *   CoachTip.priority). NULL = feedback about the whole report.
 * - verdict: 'wrong' | 'good' | 'partly' — the headline judgement.
 * - category: optional dimension of the problem, e.g. 'timing', 'advice',
 *   'hero', 'priority', 'tone', 'other'. Lets fixes map to a subsystem.
 * - note: free-text explanation ("Orc never expands at 5:30").
 *
 * ON DELETE CASCADE: feedback is meaningless without its replay.
 */
export const tipFeedback = pgTable(
  "tip_feedback",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    replayId: uuid("replay_id")
      .notNull()
      .references(() => replays.id, { onDelete: "cascade" }),
    /** 1-based CoachTip.priority this targets; NULL = whole-report feedback. */
    tipPriority: integer("tip_priority"),
    /** Headline judgement: 'wrong' | 'good' | 'partly'. */
    verdict: text("verdict").notNull(),
    /** Optional problem dimension: timing | advice | hero | priority | tone | other. */
    category: text("category"),
    /** Free-text explanation from the user. */
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [index("tip_feedback_replay_idx").on(table.replayId)],
);

export type TipFeedbackRow = typeof tipFeedback.$inferSelect;
export type NewTipFeedbackRow = typeof tipFeedback.$inferInsert;

// ===========================================================================
// KNOWLEDGE BASE (RAG) — design doc §5.4
//
// pgvector extension must be enabled before these tables are created.
// The 0001 migration prepends: CREATE EXTENSION IF NOT EXISTS vector;
// (pgvector is also enabled unconditionally in db/init/01-extensions.sql
// for the Docker container, but the migration makes each deploy self-sufficient.)
// ===========================================================================

// ---------------------------------------------------------------------------
// knowledge_docs
// ---------------------------------------------------------------------------

/**
 * Top-level knowledge documents — guides, build orders, matchup notes, etc.
 *
 * `source` identifies origin, e.g. "liquipedia", "manual", "vod_transcript".
 * `matchup` is optional, e.g. "OvH", "NEvUD" — null for race-agnostic docs.
 * `tier` is optional skill level: "basic", "advanced", "pro".
 * `patch_id` FK → patch_versions: null = patch-agnostic evergreen content.
 *
 * Design doc §5.4.
 */
export const knowledgeDocs = pgTable("knowledge_docs", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  /** Human-readable title, e.g. "OvH Fast Expo Build Order (2.00)". */
  title: text("title").notNull(),
  /** Data origin, e.g. "liquipedia", "manual", "vod_transcript". */
  source: text("source").notNull(),
  /** Optional matchup code, e.g. "OvH", "NEvUD". Null = race-agnostic. */
  matchup: text("matchup"),
  /** Optional skill-level tier: "basic", "advanced", "pro". */
  tier: text("tier"),
  /** FK into patch_versions. Null = patch-agnostic / evergreen content. */
  patchId: uuid("patch_id").references(() => patchVersions.id),
  /** Full raw text of the document, used for display and re-chunking. */
  text: text("text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export type KnowledgeDocRow = typeof knowledgeDocs.$inferSelect;
export type NewKnowledgeDocRow = typeof knowledgeDocs.$inferInsert;

// ---------------------------------------------------------------------------
// knowledge_chunks
// ---------------------------------------------------------------------------

/**
 * Embedding chunks derived from knowledge_docs, used for vector similarity
 * search (RAG retrieval).
 *
 * `embedding` is a vector(1024) matching bge-m3's output dimensionality.
 * NOTE: switching to a different embedding model with different dimensions
 * (e.g. nomic-embed-text = 768) requires a new migration to ALTER COLUMN or
 * drop-and-recreate the embedding column.
 *
 * HNSW index for cosine distance:
 *   drizzle-kit emits the index DDL from the schema definition below.
 *   The ops class `vector_cosine_ops` is injected via the raw SQL override
 *   prepended to the 0001 migration. See the migration file for the exact DDL:
 *     CREATE INDEX knowledge_chunks_embedding_hnsw_idx
 *       ON knowledge_chunks USING hnsw (embedding vector_cosine_ops);
 *   This index is prepended manually to the generated migration because
 *   drizzle-kit 0.31 cannot express pgvector ops-class names in its index API.
 *
 * ON DELETE CASCADE: chunks are meaningless without their parent doc.
 *
 * Design doc §5.4.
 */
export const knowledgeChunks = pgTable(
  "knowledge_chunks",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    docId: uuid("doc_id")
      .notNull()
      .references(() => knowledgeDocs.id, { onDelete: "cascade" }),
    /** The text fragment that was embedded. Stored for display and re-ranking. */
    chunkText: text("chunk_text").notNull(),
    /**
     * bge-m3 embedding vector (1024 dimensions).
     * Queried with cosine distance: <=> operator in pgvector.
     * Dimensionality change requires a migration — see table JSDoc.
     */
    embedding: vector("embedding", { dimensions: 1024 }).notNull(),
  },
  (table) => [index("knowledge_chunks_doc_idx").on(table.docId)],
);

export type KnowledgeChunkRow = typeof knowledgeChunks.$inferSelect;
export type NewKnowledgeChunkRow = typeof knowledgeChunks.$inferInsert;
