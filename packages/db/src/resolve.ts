/**
 * @wc3-coach/db — DB-backed FourCC resolver (T2.2)
 *
 * Provides:
 *   - loadFourccMaps(): load fourcc→{key,id} maps from DB once at startup.
 *   - resolveReplayRefs(): UPDATE game_events.entity_ref + replay_players.race_id
 *     for a given replay to their canonical ontology forms.
 *
 * The pure resolution logic lives in packages/ontology (resolveEntityRef).
 * This module owns the DB I/O (load + write) side of the resolver.
 *
 * IDEMPOTENT: rows with payload.resolved=true are skipped. Safe to re-run.
 *
 * PRINCIPLE #1 (CLAUDE.md): Operates on post-game replay data only.
 */

import { eq, sql } from "drizzle-orm";
import type { DrizzleDb } from "./client.js";
import {
  heroes,
  heroAbilities,
  units,
  buildings,
  upgrades,
  gameEvents,
  replayPlayers,
} from "./schema.js";
import {
  resolveEntityRef,
  resolveRaceRef,
  buildKindLookup,
} from "@wc3-coach/ontology";
import type { FourccLookup } from "@wc3-coach/ontology";

// ---------------------------------------------------------------------------
// loadFourccMaps
// ---------------------------------------------------------------------------

/**
 * Query all fourcc-bearing ontology rows from the DB and build a
 * FourccLookup for use with resolveEntityRef().
 *
 * Call this ONCE at worker startup and reuse the result — it does a
 * full table scan of each ontology table but is cheap (< 1000 rows total).
 *
 * @param db - Connected Drizzle instance.
 * @returns  FourccLookup populated for unit, building, hero, upgrade, ability.
 */
export async function loadFourccMaps(db: DrizzleDb): Promise<FourccLookup> {
  const [unitRows, buildingRows, heroRows, upgradeRows, abilityRows] =
    await Promise.all([
      db.select({ fourcc: units.fourcc, key: units.key, id: units.id }).from(units),
      db.select({ fourcc: buildings.fourcc, key: buildings.key, id: buildings.id }).from(buildings),
      db.select({ fourcc: heroes.fourcc, key: heroes.key, id: heroes.id }).from(heroes),
      db.select({ fourcc: upgrades.fourcc, key: upgrades.key, id: upgrades.id }).from(upgrades),
      db.select({ fourcc: heroAbilities.fourcc, key: heroAbilities.key, id: heroAbilities.id }).from(heroAbilities),
    ]);

  return {
    unit:     buildKindLookup(unitRows,     "unit"),
    building: buildKindLookup(buildingRows, "building"),
    hero:     buildKindLookup(heroRows,     "hero"),
    upgrade:  buildKindLookup(upgradeRows,  "upgrade"),
    ability:  buildKindLookup(abilityRows,  "ability"),
  };
}

// ---------------------------------------------------------------------------
// ResolveResult
// ---------------------------------------------------------------------------

export type ResolveResult = {
  /** Number of game_events rows updated. */
  eventsResolved: number;
  /** Number of game_events rows that were already resolved (skipped). */
  eventsSkipped: number;
  /** Number of game_events rows where the FourCC had no match (unresolved). */
  eventsUnresolved: number;
  /** Number of replay_players rows updated. */
  playersResolved: number;
  /** Number of replay_players rows where the race letter had no match. */
  playersUnresolved: number;
};

// ---------------------------------------------------------------------------
// resolveReplayRefs
// ---------------------------------------------------------------------------

/**
 * Resolve all provisional entity refs in a replay's game_events and
 * replay_players rows to their canonical ontology keys.
 *
 * For each game_events row with payload.resolved = false:
 *   - Calls resolveEntityRef() with the loaded FourCC maps.
 *   - On success: updates entity_ref to "kind:key" and sets payload.resolved = true.
 *   - On failure (unknown FourCC): leaves entity_ref as-is, sets payload.resolved = false.
 *
 * For each replay_players row with a provisional race_id like "race:O":
 *   - Calls resolveRaceRef() to get "race:orc".
 *   - Updates race_id in place.
 *
 * IDEMPOTENT: rows with payload->>resolved = 'true' are skipped.
 *
 * @param db       - Connected Drizzle instance.
 * @param replayId - UUID of the replay to resolve.
 * @param lookup   - Pre-loaded FourCC maps from loadFourccMaps().
 * @returns        Counts of resolved, skipped, and unresolved rows.
 */
export async function resolveReplayRefs(
  db: DrizzleDb,
  replayId: string,
  lookup: FourccLookup,
): Promise<ResolveResult> {
  let eventsResolved = 0;
  let eventsSkipped = 0;
  let eventsUnresolved = 0;
  let playersResolved = 0;
  let playersUnresolved = 0;

  // -------------------------------------------------------------------------
  // 1. Resolve game_events
  // -------------------------------------------------------------------------
  const eventRows = await db
    .select({
      id: gameEvents.id,
      entityRef: gameEvents.entityRef,
      payload: gameEvents.payload,
    })
    .from(gameEvents)
    .where(eq(gameEvents.replayId, replayId));

  for (const row of eventRows) {
    const payload = row.payload as Record<string, unknown>;

    // Skip already-resolved rows.
    if (payload["resolved"] === true) {
      eventsSkipped++;
      continue;
    }

    const canonicalRef = resolveEntityRef(row.entityRef, lookup);
    if (canonicalRef !== null) {
      await db
        .update(gameEvents)
        .set({
          entityRef: canonicalRef,
          payload: { ...payload, resolved: true } as unknown as typeof gameEvents.$inferSelect["payload"],
        })
        .where(eq(gameEvents.id, row.id));
      eventsResolved++;
    } else {
      // Mark as attempted-but-unresolved to avoid re-processing.
      await db
        .update(gameEvents)
        .set({
          payload: { ...payload, resolved: false, resolveAttempted: true } as unknown as typeof gameEvents.$inferSelect["payload"],
        })
        .where(eq(gameEvents.id, row.id));
      eventsUnresolved++;
    }
  }

  // -------------------------------------------------------------------------
  // 2. Resolve replay_players race_id
  // -------------------------------------------------------------------------
  const playerRows = await db
    .select({ id: replayPlayers.id, raceId: replayPlayers.raceId })
    .from(replayPlayers)
    .where(eq(replayPlayers.replayId, replayId));

  for (const row of playerRows) {
    if (!row.raceId) continue;

    // Already canonical if it doesn't start with "race:" followed by a single letter.
    // (canonical form is "race:orc", provisional is "race:O")
    if (row.raceId.length > 7) {
      // Likely already resolved (e.g. "race:nightelf" = 12 chars).
      playersResolved++;
      continue;
    }

    const canonicalRace = resolveRaceRef(row.raceId);
    if (canonicalRace !== null) {
      await db
        .update(replayPlayers)
        .set({ raceId: canonicalRace })
        .where(eq(replayPlayers.id, row.id));
      playersResolved++;
    } else {
      playersUnresolved++;
    }
  }

  return {
    eventsResolved,
    eventsSkipped,
    eventsUnresolved,
    playersResolved,
    playersUnresolved,
  };
}
