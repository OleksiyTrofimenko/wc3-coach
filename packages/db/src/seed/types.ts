/**
 * @wc3-coach/db — Seed data shape types
 *
 * Defines the JSON structure expected in ontology.<race>.json seed files.
 * These are the raw JSON shapes before transformation into DB insert rows.
 *
 * The authoritative DB schema is in schema.ts; this file only describes
 * what the seed JSON carries so the importer can be type-safe.
 *
 * Provenance note: all seed data is marked with:
 *   source: "community/liquipedia seed"
 *   patch: "2.0"
 *   verified: false
 * until cross-checked against CASC/MPQ extraction (see T2.2 notes).
 */

// ---------------------------------------------------------------------------
// Tech requirements
// ---------------------------------------------------------------------------

export type TechReq = {
  type: "building" | "upgrade" | "hero";
  key: string;
};

// ---------------------------------------------------------------------------
// Provides (what a building unlocks)
// ---------------------------------------------------------------------------

export type Provides = {
  type: "unit" | "upgrade" | "ability" | "hero";
  key: string;
};

// ---------------------------------------------------------------------------
// Hero ability level data
// ---------------------------------------------------------------------------

export type AbilityLevel = {
  level: number;
  manaCost: number;
  cooldown: number;
  description: string;
};

// ---------------------------------------------------------------------------
// Hero ability (inline inside hero seed; also written to hero_abilities table)
// ---------------------------------------------------------------------------

export type SeedAbility = {
  key: string;
  name: string;
  /** WC3 FourCC for the ability, e.g. "AOmi". Null if not yet assigned. */
  fourcc: string | null;
  levels: AbilityLevel[];
};

// ---------------------------------------------------------------------------
// Unit
// ---------------------------------------------------------------------------

export type SeedUnit = {
  key: string;
  name: string;
  /** WC3 FourCC for the unit, e.g. "opeo". Null if not yet assigned. */
  fourcc: string | null;
  hp: number;
  armor: number;
  armorType: string;
  attackType: string;
  /** Average DPS (integer, rounded). */
  dps: number;
  gold: number;
  lumber: number;
  food: number;
  /** Training time in integer game-seconds. */
  buildTime: number;
  techReq: TechReq[];
};

// ---------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------

export type SeedBuilding = {
  key: string;
  name: string;
  /** WC3 FourCC for the building, e.g. "oalt". Null if not yet assigned. */
  fourcc: string | null;
  hp: number;
  armor: number;
  gold: number;
  lumber: number;
  /** Construction time in integer game-seconds. */
  buildTime: number;
  provides: Provides[];
};

// ---------------------------------------------------------------------------
// Hero base stats (inline in JSONB column)
// ---------------------------------------------------------------------------

export type HeroBaseStats = {
  hp: number;
  mana: number;
  hpRegen: number;
  manaRegen: number;
  armor: number;
  armorType: string;
  attackType: string;
  /** Average DPS at level 1. */
  dps: number;
  str: number;
  agi: number;
  int: number;
  strPerLevel: number;
  agiPerLevel: number;
  intPerLevel: number;
  moveSpeed: number;
};

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

export type SeedHero = {
  key: string;
  name: string;
  /** WC3 FourCC for the hero, e.g. "Obla". Null if not yet assigned. */
  fourcc: string | null;
  primaryAttr: "str" | "agi" | "int";
  baseStats: HeroBaseStats;
  /** Abilities belonging to this hero (written to hero_abilities table). */
  abilities: SeedAbility[];
};

// ---------------------------------------------------------------------------
// Upgrade level data
// ---------------------------------------------------------------------------

export type UpgradeLevel = {
  level: number;
  gold: number;
  lumber: number;
  /** Research time in integer game-seconds. */
  researchTime: number;
  effect: string;
};

// ---------------------------------------------------------------------------
// Upgrade
// ---------------------------------------------------------------------------

export type SeedUpgrade = {
  key: string;
  name: string;
  /** WC3 FourCC for the upgrade, e.g. "Roen". Null if not yet assigned. */
  fourcc: string | null;
  levels: UpgradeLevel[];
};

// ---------------------------------------------------------------------------
// Race identity row
// ---------------------------------------------------------------------------

export type SeedRace = {
  key: string;
  name: string;
};

// ---------------------------------------------------------------------------
// Top-level seed file shape (one per race)
// ---------------------------------------------------------------------------

export type RaceSeedFile = {
  _meta: {
    source: string;
    patch: string;
    verified: boolean;
    notes: string;
  };
  race: SeedRace;
  units: SeedUnit[];
  buildings: SeedBuilding[];
  heroes: SeedHero[];
  upgrades: SeedUpgrade[];
};

// ---------------------------------------------------------------------------
// Races-only seed file (ontology.races.json)
// ---------------------------------------------------------------------------

export type RacesSeedFile = {
  _meta: {
    source: string;
    patch: string;
    verified: boolean;
    notes: string;
  };
  races: SeedRace[];
};

// ---------------------------------------------------------------------------
// Patch registry seed (patches.json)
// ---------------------------------------------------------------------------

/**
 * A single patch entry in the curated patches.json registry.
 *
 * `version`      — human-readable version string, e.g. "2.00".
 * `build_number` — numeric build from the .w3g header (must be confirmed).
 * `released_at`  — ISO 8601 date or null when the date is not confirmed.
 * `notes`        — provenance comment (not written to DB).
 */
export type PatchSeedEntry = {
  version: string;
  build_number: number;
  released_at: string | null;
  notes: string;
};

export type PatchesSeedFile = {
  _meta: {
    source: string;
    notes: string;
    guardrail: string;
  };
  patches: PatchSeedEntry[];
};
