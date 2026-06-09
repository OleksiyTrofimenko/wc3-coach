/**
 * @wc3-coach/db — Patch-aware stat lookup (T2.3)
 *
 * Provides the canonical query pattern used by EPIC 3 benchmarks:
 *   "give me the stats for entity X **as of patch P**"
 *
 * Override model (read this before calling anything):
 * -------------------------------------------------------
 * Every stat-bearing ontology table (units, buildings, heroes, upgrades) has
 * a nullable `patch_id` column:
 *
 *   patch_id IS NULL  — the BASELINE row.  Applies to every patch that does
 *                       NOT have its own override for this key.
 *   patch_id = <uuid> — a PATCH-SPECIFIC OVERRIDE for that exact patch.
 *                       Only applies when the lookup is for that patch_id.
 *
 * Lookup rule (applied per key):
 *   1. If a row exists with (key = K AND patch_id = P) → return it.
 *   2. Else if a row exists with (key = K AND patch_id IS NULL) → return it.
 *   3. Else → undefined.
 *
 * Example: patch 2.01 changes Grunt HP from 700 to 720.
 *   Before the patch row is added, all lookups for "grunt" return the baseline.
 *   After adding (grunt, patch_2.01, hp=720), lookups for patch_2.01 return
 *   720 and all other patches still return the baseline (700).
 *
 * The PURE selection helper `pickForPatch` encodes this rule without DB access
 * and is unit-tested independently of the DB-backed getters.
 *
 * SQL approach used in the batch getters:
 *   WHERE key = $K AND (patch_id = $P OR patch_id IS NULL)
 *   ORDER BY patch_id NULLS LAST   ← patch-specific wins over baseline
 *   LIMIT 1 per key                ← via DISTINCT ON (key) equivalent
 *
 * PRINCIPLE #1 (CLAUDE.md): Reads static game-fact tables only.
 * No live-game data is accessed here.
 */

import { and, eq, isNull, or, sql } from "drizzle-orm";
import type { DrizzleDb } from "./client.js";
import {
  units,
  buildings,
  heroes,
  upgrades,
} from "./schema.js";
import type { UnitRow, BuildingRow, HeroRow, UpgradeRow } from "./schema.js";

// ---------------------------------------------------------------------------
// Pure selection helper — no DB access, fully unit-testable
// ---------------------------------------------------------------------------

/**
 * Given an array of rows (all with the same `key`) that may include a
 * patch-specific row, a baseline row (patch_id = null), or both, return the
 * correct one according to the override model.
 *
 * Rules:
 *   - If `patchId` is provided and a row with that exact patch_id is present
 *     → return it (patch-specific override wins).
 *   - Else if a baseline row (patchId === null) is present → return it.
 *   - Else → return undefined.
 *
 * The generic `T` must carry `patchId: string | null` — all stat rows do.
 *
 * @param rows    - Candidate rows for a single key (may contain 0, 1, or 2 rows).
 * @param patchId - The patch UUID to look up, or undefined for baseline-only.
 */
export function pickForPatch<T extends { patchId: string | null }>(
  rows: T[],
  patchId: string | undefined,
): T | undefined {
  if (rows.length === 0) return undefined;

  // 1. Patch-specific override takes precedence.
  if (patchId !== undefined) {
    const specific = rows.find((r) => r.patchId === patchId);
    if (specific !== undefined) return specific;
  }

  // 2. Fall back to the baseline (patch_id IS NULL).
  return rows.find((r) => r.patchId === null);
}

// ---------------------------------------------------------------------------
// Per-entity single-key getters
// ---------------------------------------------------------------------------

/**
 * Return the unit row for `key` as of `patchId`.
 * Falls back to the patch-agnostic baseline if no patch-specific row exists.
 * Returns undefined if neither exists.
 *
 * @param db      - Drizzle database instance.
 * @param key     - Ontology slug, e.g. "grunt", "footman".
 * @param patchId - UUID from patch_versions, or undefined for baseline only.
 */
export async function getUnit(
  db: DrizzleDb,
  key: string,
  patchId?: string,
): Promise<UnitRow | undefined> {
  const rows = await db
    .select()
    .from(units)
    .where(
      and(
        eq(units.key, key),
        patchId !== undefined
          ? or(eq(units.patchId, patchId), isNull(units.patchId))
          : isNull(units.patchId),
      ),
    )
    // Patch-specific row sorts before baseline: NULL sorts last.
    .orderBy(sql`${units.patchId} NULLS LAST`)
    .limit(2); // at most one specific + one baseline

  return pickForPatch(rows, patchId);
}

/**
 * Return the building row for `key` as of `patchId`.
 * Falls back to the patch-agnostic baseline when no override exists.
 */
export async function getBuilding(
  db: DrizzleDb,
  key: string,
  patchId?: string,
): Promise<BuildingRow | undefined> {
  const rows = await db
    .select()
    .from(buildings)
    .where(
      and(
        eq(buildings.key, key),
        patchId !== undefined
          ? or(eq(buildings.patchId, patchId), isNull(buildings.patchId))
          : isNull(buildings.patchId),
      ),
    )
    .orderBy(sql`${buildings.patchId} NULLS LAST`)
    .limit(2);

  return pickForPatch(rows, patchId);
}

/**
 * Return the hero row for `key` as of `patchId`.
 * Falls back to the patch-agnostic baseline when no override exists.
 */
export async function getHero(
  db: DrizzleDb,
  key: string,
  patchId?: string,
): Promise<HeroRow | undefined> {
  const rows = await db
    .select()
    .from(heroes)
    .where(
      and(
        eq(heroes.key, key),
        patchId !== undefined
          ? or(eq(heroes.patchId, patchId), isNull(heroes.patchId))
          : isNull(heroes.patchId),
      ),
    )
    .orderBy(sql`${heroes.patchId} NULLS LAST`)
    .limit(2);

  return pickForPatch(rows, patchId);
}

/**
 * Return the upgrade row for `key` as of `patchId`.
 * Falls back to the patch-agnostic baseline when no override exists.
 */
export async function getUpgrade(
  db: DrizzleDb,
  key: string,
  patchId?: string,
): Promise<UpgradeRow | undefined> {
  const rows = await db
    .select()
    .from(upgrades)
    .where(
      and(
        eq(upgrades.key, key),
        patchId !== undefined
          ? or(eq(upgrades.patchId, patchId), isNull(upgrades.patchId))
          : isNull(upgrades.patchId),
      ),
    )
    .orderBy(sql`${upgrades.patchId} NULLS LAST`)
    .limit(2);

  return pickForPatch(rows, patchId);
}

// ---------------------------------------------------------------------------
// Batch getters — for benchmark runs (one query, not N)
// ---------------------------------------------------------------------------

/**
 * Fetch all unit stats for a given patch in a single query and return a
 * Map<key, UnitRow> with the override model applied per key.
 *
 * Algorithm:
 *   1. SELECT all rows WHERE patch_id = $P OR patch_id IS NULL.
 *   2. Group by key.
 *   3. Per key, apply pickForPatch — patch-specific wins over baseline.
 *
 * This is the preferred access pattern for benchmarks: do one round-trip to
 * the DB, build the map once, then look up keys in O(1).
 *
 * @param db      - Drizzle database instance.
 * @param patchId - UUID from patch_versions, or undefined for baseline-only map.
 */
export async function getUnitsForPatch(
  db: DrizzleDb,
  patchId?: string,
): Promise<Map<string, UnitRow>> {
  const rows = await db
    .select()
    .from(units)
    .where(
      patchId !== undefined
        ? or(eq(units.patchId, patchId), isNull(units.patchId))
        : isNull(units.patchId),
    );

  return buildPatchMap(rows, patchId);
}

/**
 * Batch getter for buildings. See `getUnitsForPatch` for the algorithm.
 */
export async function getBuildingsForPatch(
  db: DrizzleDb,
  patchId?: string,
): Promise<Map<string, BuildingRow>> {
  const rows = await db
    .select()
    .from(buildings)
    .where(
      patchId !== undefined
        ? or(eq(buildings.patchId, patchId), isNull(buildings.patchId))
        : isNull(buildings.patchId),
    );

  return buildPatchMap(rows, patchId);
}

/**
 * Batch getter for heroes. See `getUnitsForPatch` for the algorithm.
 */
export async function getHeroesForPatch(
  db: DrizzleDb,
  patchId?: string,
): Promise<Map<string, HeroRow>> {
  const rows = await db
    .select()
    .from(heroes)
    .where(
      patchId !== undefined
        ? or(eq(heroes.patchId, patchId), isNull(heroes.patchId))
        : isNull(heroes.patchId),
    );

  return buildPatchMap(rows, patchId);
}

/**
 * Batch getter for upgrades. See `getUnitsForPatch` for the algorithm.
 */
export async function getUpgradesForPatch(
  db: DrizzleDb,
  patchId?: string,
): Promise<Map<string, UpgradeRow>> {
  const rows = await db
    .select()
    .from(upgrades)
    .where(
      patchId !== undefined
        ? or(eq(upgrades.patchId, patchId), isNull(upgrades.patchId))
        : isNull(upgrades.patchId),
    );

  return buildPatchMap(rows, patchId);
}

// ---------------------------------------------------------------------------
// Internal helper: group rows by key and apply pickForPatch
// ---------------------------------------------------------------------------

/**
 * Given a flat array of rows (potentially containing both baseline and
 * patch-specific rows for multiple keys), group by key and pick the correct
 * row per key according to the override model.
 *
 * @param rows    - Flat array of stat rows (any ontology table).
 * @param patchId - The target patch UUID (or undefined for baseline only).
 */
function buildPatchMap<T extends { key: string; patchId: string | null }>(
  rows: T[],
  patchId: string | undefined,
): Map<string, T> {
  // Group by key.
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const existing = grouped.get(row.key);
    if (existing !== undefined) {
      existing.push(row);
    } else {
      grouped.set(row.key, [row]);
    }
  }

  // Apply the override model per key.
  const result = new Map<string, T>();
  for (const [key, candidates] of grouped) {
    const picked = pickForPatch(candidates, patchId);
    if (picked !== undefined) {
      result.set(key, picked);
    }
  }

  return result;
}
