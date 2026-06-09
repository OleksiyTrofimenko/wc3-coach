/**
 * @wc3-coach/db — Ontology seed importer (T2.2)
 *
 * Idempotent upsert of the ontology JSON seed data into the ontology tables.
 * Safe to re-run: uses onConflictDoUpdate targeting UNIQUE(key, patch_id)
 * (NULLS NOT DISTINCT) for stat-bearing tables and UNIQUE(key) for races.
 *
 * Import order respects FK constraints:
 *   1. races (no FKs)
 *   2. heroes     → races FK
 *   3. hero_abilities → heroes FK
 *   4. units      → races FK
 *   5. buildings  → races FK
 *   6. upgrades   → races FK
 *
 * Usage:
 *   import { importOntology } from "./import.js";
 *   const result = await importOntology(db, seeds);
 *
 * Does NOT require a live DB to typecheck or build — only running db:seed
 * or calling importOntology at runtime needs a live connection.
 *
 * PRINCIPLE #1 (CLAUDE.md): Seed data covers static game facts only.
 * No live-game data is imported here.
 */

import { eq, sql } from "drizzle-orm";
import type { DrizzleDb } from "../client.js";
import {
  races,
  heroes,
  heroAbilities,
  units,
  buildings,
  upgrades,
  patchVersions,
} from "../schema.js";
import type {
  RaceSeedFile,
  RacesSeedFile,
  SeedRace,
  SeedHero,
  SeedUnit,
  SeedBuilding,
  SeedUpgrade,
  SeedAbility,
  PatchesSeedFile,
} from "./types.js";

// ---------------------------------------------------------------------------
// Public result type
// ---------------------------------------------------------------------------

export type ImportResult = {
  inserted: number;
  updated: number;
};

// ---------------------------------------------------------------------------
// importPatches — curated patch_versions registry (T2.3)
// ---------------------------------------------------------------------------

/**
 * Idempotent upsert of the curated patches.json seed into `patch_versions`.
 *
 * Each entry is upserted by (version, build_number) — the natural unique key
 * (backed by the UNIQUE INDEX patch_versions_version_build_idx in the schema).
 * On conflict, `released_at` is updated in case the date was null before and
 * is now confirmed. `version` and `build_number` are never mutated (they are
 * the conflict target).
 *
 * Call this BEFORE importOntology / importRaces so that any future FK
 * references from stat rows to patch_versions rows are already present.
 *
 * @param db   - Drizzle database instance (must be connected at call time).
 * @param seed - Parsed patches.json content.
 * @returns    Aggregate inserted + updated row counts.
 */
export async function importPatches(
  db: DrizzleDb,
  seed: PatchesSeedFile,
): Promise<ImportResult> {
  let inserted = 0;
  let updated = 0;

  for (const entry of seed.patches) {
    const releasedAt = entry.released_at ? new Date(entry.released_at) : null;

    const result = await db
      .insert(patchVersions)
      .values({
        version: entry.version,
        buildNumber: entry.build_number,
        releasedAt,
      })
      .onConflictDoUpdate({
        target: [patchVersions.version, patchVersions.buildNumber],
        set: {
          // Update released_at in case it was previously null and is now confirmed.
          releasedAt: sql`COALESCE(excluded.released_at, patch_versions.released_at)`,
        },
      })
      .returning({ id: patchVersions.id, createdAt: patchVersions.createdAt });

    const row = result[0];
    if (row === undefined) {
      throw new Error(
        `importPatches: upsert returned no rows for version=${entry.version} build=${entry.build_number}`,
      );
    }
    // Distinguish insert vs update: a newly inserted row has createdAt very
    // close to now. We rely on the affected-rows heuristic via the onConflict
    // branch. Drizzle does not expose xmax directly, so we count every call
    // as "updated" on conflict and "inserted" on a genuine new row by checking
    // whether any prior row existed.
    //
    // Because the upsert always returns one row, we determine insert vs update
    // by querying the count before — but that adds a round-trip. Instead we
    // use a simpler approach: count each upsert as contributing to inserted OR
    // updated based on whether the returned createdAt is within the last second
    // (a proxy for "just inserted"). This is only used for logging and is not
    // load-bearing. For correctness of the registry the upsert itself is what
    // matters.
    const ageMs = Date.now() - new Date(row.createdAt).getTime();
    if (ageMs < 2000) {
      inserted++;
    } else {
      updated++;
    }
  }

  return { inserted, updated };
}

// ---------------------------------------------------------------------------
// importOntology
// ---------------------------------------------------------------------------

/**
 * Upsert ontology seed data into the database.
 *
 * @param db     - Drizzle database instance (must be connected to a live DB at call time).
 * @param seeds  - Array of race seed files (from JSON imports or inline objects).
 * @returns      Aggregate inserted + updated row counts.
 */
export async function importOntology(
  db: DrizzleDb,
  seeds: RaceSeedFile[],
): Promise<ImportResult> {
  let inserted = 0;
  let updated = 0;

  // Collect all distinct race keys across all seed files (plus "random").
  const allRaceKeys = new Set<string>(["human", "orc", "nightelf", "undead", "random"]);
  for (const seed of seeds) {
    allRaceKeys.add(seed.race.key);
  }

  // -------------------------------------------------------------------------
  // 1. Upsert races
  // -------------------------------------------------------------------------
  for (const seed of seeds) {
    const counts = await upsertRace(db, seed.race);
    inserted += counts.inserted;
    updated += counts.updated;
  }

  // -------------------------------------------------------------------------
  // 2–6. For each race seed, upsert dependent tables
  // -------------------------------------------------------------------------
  for (const seed of seeds) {
    // Resolve the race_id FK for this race.
    const raceRows = await db
      .select({ id: races.id })
      .from(races)
      .where(eq(races.key, seed.race.key));
    const raceId = raceRows[0]?.id;
    if (!raceId) {
      throw new Error(
        `[importOntology] Race row not found for key="${seed.race.key}" after upsert. Check DB connection.`,
      );
    }

    // 2. Heroes (and their abilities)
    for (const hero of seed.heroes) {
      const heroRes = await upsertHero(db, hero, raceId);
      inserted += heroRes.inserted;
      updated += heroRes.updated;

      // Resolve the hero_id FK for ability inserts.
      const heroRows = await db
        .select({ id: heroes.id })
        .from(heroes)
        .where(
          sql`${heroes.key} = ${hero.key} AND ${heroes.patchId} IS NULL`,
        );
      const heroId = heroRows[0]?.id;
      if (!heroId) {
        throw new Error(
          `[importOntology] Hero row not found for key="${hero.key}" after upsert.`,
        );
      }

      // 3. Hero abilities
      for (const ability of hero.abilities) {
        const abilRes = await upsertHeroAbility(db, ability, heroId);
        inserted += abilRes.inserted;
        updated += abilRes.updated;
      }
    }

    // 4. Units
    for (const unit of seed.units) {
      const unitRes = await upsertUnit(db, unit, raceId);
      inserted += unitRes.inserted;
      updated += unitRes.updated;
    }

    // 5. Buildings
    for (const building of seed.buildings) {
      const bldRes = await upsertBuilding(db, building, raceId);
      inserted += bldRes.inserted;
      updated += bldRes.updated;
    }

    // 6. Upgrades
    for (const upgrade of seed.upgrades) {
      const upgRes = await upsertUpgrade(db, upgrade, raceId);
      inserted += upgRes.inserted;
      updated += upgRes.updated;
    }
  }

  return { inserted, updated };
}

// ---------------------------------------------------------------------------
// importRaces — standalone helper for the races-only seed file
// ---------------------------------------------------------------------------

/**
 * Upsert from a races-only seed file (ontology.races.json).
 * Useful for bootstrapping the race rows before importing per-race seeds.
 */
export async function importRaces(
  db: DrizzleDb,
  racesSeed: RacesSeedFile,
): Promise<ImportResult> {
  let inserted = 0;
  let updated = 0;
  for (const race of racesSeed.races) {
    const counts = await upsertRace(db, race);
    inserted += counts.inserted;
    updated += counts.updated;
  }
  return { inserted, updated };
}

// ---------------------------------------------------------------------------
// Internal upsert helpers
// ---------------------------------------------------------------------------

async function upsertRace(db: DrizzleDb, race: SeedRace): Promise<ImportResult> {
  // races has UNIQUE INDEX on (key).
  const existing = await db
    .select({ id: races.id })
    .from(races)
    .where(eq(races.key, race.key));

  if (existing.length > 0) {
    await db
      .update(races)
      .set({ name: race.name })
      .where(eq(races.key, race.key));
    return { inserted: 0, updated: 1 };
  }

  await db.insert(races).values({ key: race.key, name: race.name });
  return { inserted: 1, updated: 0 };
}

async function upsertHero(
  db: DrizzleDb,
  hero: SeedHero,
  raceId: string,
): Promise<ImportResult> {
  // heroes has UNIQUE(key, patch_id) NULLS NOT DISTINCT.
  // We target the patch-agnostic row (patch_id = NULL).
  const existing = await db
    .select({ id: heroes.id })
    .from(heroes)
    .where(sql`${heroes.key} = ${hero.key} AND ${heroes.patchId} IS NULL`);

  const values = {
    raceId,
    key: hero.key,
    name: hero.name,
    primaryAttr: hero.primaryAttr,
    baseStats: hero.baseStats as Record<string, unknown>,
    fourcc: hero.fourcc,
  } as const;

  if (existing.length > 0) {
    await db
      .update(heroes)
      .set(values)
      .where(sql`${heroes.key} = ${hero.key} AND ${heroes.patchId} IS NULL`);
    return { inserted: 0, updated: 1 };
  }

  await db.insert(heroes).values({ ...values, patchId: undefined });
  return { inserted: 1, updated: 0 };
}

async function upsertHeroAbility(
  db: DrizzleDb,
  ability: SeedAbility,
  heroId: string,
): Promise<ImportResult> {
  // hero_abilities has no unique constraint on (key, heroId) in current schema
  // — use heroId + key as the natural dedup key.
  const existing = await db
    .select({ id: heroAbilities.id })
    .from(heroAbilities)
    .where(
      sql`${heroAbilities.heroId} = ${heroId} AND ${heroAbilities.key} = ${ability.key}`,
    );

  const values = {
    heroId,
    key: ability.key,
    name: ability.name,
    levels: ability.levels as unknown[],
    fourcc: ability.fourcc,
  } as const;

  if (existing.length > 0) {
    await db
      .update(heroAbilities)
      .set(values)
      .where(
        sql`${heroAbilities.heroId} = ${heroId} AND ${heroAbilities.key} = ${ability.key}`,
      );
    return { inserted: 0, updated: 1 };
  }

  await db.insert(heroAbilities).values(values);
  return { inserted: 1, updated: 0 };
}

async function upsertUnit(
  db: DrizzleDb,
  unit: SeedUnit,
  raceId: string,
): Promise<ImportResult> {
  const existing = await db
    .select({ id: units.id })
    .from(units)
    .where(sql`${units.key} = ${unit.key} AND ${units.patchId} IS NULL`);

  const values = {
    raceId,
    key: unit.key,
    name: unit.name,
    hp: unit.hp,
    armor: unit.armor,
    armorType: unit.armorType,
    attackType: unit.attackType,
    dps: unit.dps,
    gold: unit.gold,
    lumber: unit.lumber,
    food: unit.food,
    buildTime: unit.buildTime,
    techReq: unit.techReq as unknown[],
    fourcc: unit.fourcc,
  } as const;

  if (existing.length > 0) {
    await db
      .update(units)
      .set(values)
      .where(sql`${units.key} = ${unit.key} AND ${units.patchId} IS NULL`);
    return { inserted: 0, updated: 1 };
  }

  await db.insert(units).values({ ...values, patchId: undefined });
  return { inserted: 1, updated: 0 };
}

async function upsertBuilding(
  db: DrizzleDb,
  building: SeedBuilding,
  raceId: string,
): Promise<ImportResult> {
  const existing = await db
    .select({ id: buildings.id })
    .from(buildings)
    .where(
      sql`${buildings.key} = ${building.key} AND ${buildings.patchId} IS NULL`,
    );

  const values = {
    raceId,
    key: building.key,
    name: building.name,
    hp: building.hp,
    armor: building.armor,
    gold: building.gold,
    lumber: building.lumber,
    buildTime: building.buildTime,
    provides: building.provides as unknown[],
    fourcc: building.fourcc,
  } as const;

  if (existing.length > 0) {
    await db
      .update(buildings)
      .set(values)
      .where(
        sql`${buildings.key} = ${building.key} AND ${buildings.patchId} IS NULL`,
      );
    return { inserted: 0, updated: 1 };
  }

  await db.insert(buildings).values({ ...values, patchId: undefined });
  return { inserted: 1, updated: 0 };
}

async function upsertUpgrade(
  db: DrizzleDb,
  upgrade: SeedUpgrade,
  raceId: string,
): Promise<ImportResult> {
  const existing = await db
    .select({ id: upgrades.id })
    .from(upgrades)
    .where(
      sql`${upgrades.key} = ${upgrade.key} AND ${upgrades.patchId} IS NULL`,
    );

  const values = {
    raceId,
    key: upgrade.key,
    name: upgrade.name,
    levels: upgrade.levels as unknown[],
    fourcc: upgrade.fourcc,
  } as const;

  if (existing.length > 0) {
    await db
      .update(upgrades)
      .set(values)
      .where(
        sql`${upgrades.key} = ${upgrade.key} AND ${upgrades.patchId} IS NULL`,
      );
    return { inserted: 0, updated: 1 };
  }

  await db.insert(upgrades).values({ ...values, patchId: undefined });
  return { inserted: 1, updated: 0 };
}
