/**
 * @wc3-coach/ontology — FourCC resolver and ontology type helpers (T2.2)
 *
 * This package provides PURE (no DB, no I/O) TypeScript types and helpers:
 *   - EntityKind: the set of entity types the parser can emit
 *   - Race letter → race key mapping
 *   - FourCC→key lookup tables (built from DB at startup, or provided inline)
 *   - resolveEntityRef(): turn provisional "unit:opeo" → "unit:peon"
 *   - buildFourccLookup(): construct a lookup from DB query results
 *
 * PLACEMENT RATIONALE:
 *   Pure resolver logic lives here (packages/ontology) because:
 *   - It has zero DB or I/O dependencies; usable in tests, workers, and API layers.
 *   - packages/db handles DB-backed operations (see resolveReplayRefs in db/src/resolve.ts).
 *   - The ontology package is the natural home per CLAUDE.md architecture.
 *
 * DB-backed resolve (resolveReplayRefs) lives in packages/db/src/resolve.ts
 * because it requires a Drizzle instance and modifies game_events rows.
 *
 * Design doc §5.1 — entity_ref format: "kind:key" e.g. "unit:peon".
 */

// ---------------------------------------------------------------------------
// EntityKind
// ---------------------------------------------------------------------------

/**
 * The set of entity categories the parser emits in game_events.entity_ref.
 * Each provisional ref has the shape "<EntityKind>:<fourcc>".
 * After resolution it becomes "<EntityKind>:<key>".
 */
export type EntityKind =
  | "unit"
  | "building"
  | "hero"
  | "upgrade"
  | "ability"
  | "race";

// ---------------------------------------------------------------------------
// Race letter → race key mapping
//
// The parser emits provisional refs like "race:O", "race:N", "race:H",
// "race:U", "race:R" (random). This map converts the single-letter code to
// the canonical ontology key used in the races table.
// ---------------------------------------------------------------------------

/**
 * Maps the single-letter race code (from the .w3g replay header) to the
 * canonical race key used as the primary identifier in the races table.
 *
 * Source: w3gjs player.race field; values observed in fixture and docs.
 */
export const RACE_LETTER_MAP: Readonly<Record<string, string>> = {
  H: "human",
  O: "orc",
  N: "nightelf",
  U: "undead",
  R: "random",
} as const;

// ---------------------------------------------------------------------------
// FourCC lookup table types
// ---------------------------------------------------------------------------

/**
 * A map from FourCC string to canonical { key, id } for a given EntityKind.
 * `id` is the DB UUID — null when working in-memory without a live DB.
 */
export type FourccEntry = {
  key: string;
  id: string | null;
};

/**
 * Per-kind FourCC→{key,id} lookup, constructed from DB query results.
 * Pass to resolveEntityRef() for O(1) lookups.
 *
 * All EntityKinds except "race" are backed by DB rows with a fourcc column.
 * The "race" kind uses RACE_LETTER_MAP instead of a fourcc column.
 */
export type FourccLookup = Partial<Record<EntityKind, Map<string, FourccEntry>>>;

// ---------------------------------------------------------------------------
// resolveEntityRef — pure resolver
// ---------------------------------------------------------------------------

/**
 * Resolve a provisional entity reference emitted by the parser into a
 * canonical "kind:key" form, or return null if the FourCC is unknown.
 *
 * @param provisionalRef - e.g. "unit:opeo", "building:oalt", "race:O"
 * @param lookup         - FourCC→key maps built from the DB (or a test fixture).
 *                         For "race" kind, RACE_LETTER_MAP is used automatically.
 * @returns Canonical ref like "unit:peon" | null if unresolvable.
 *
 * @example
 *   resolveEntityRef("unit:opeo", lookup)     // "unit:peon"
 *   resolveEntityRef("building:oalt", lookup) // "building:altar_of_storms"
 *   resolveEntityRef("race:O", lookup)        // "race:orc"
 *   resolveEntityRef("unit:xxxx", lookup)     // null
 */
export function resolveEntityRef(
  provisionalRef: string,
  lookup: FourccLookup,
): string | null {
  const colonIdx = provisionalRef.indexOf(":");
  if (colonIdx === -1) return null;

  const kind = provisionalRef.slice(0, colonIdx) as EntityKind;
  const code = provisionalRef.slice(colonIdx + 1);
  if (!code) return null;

  // Race kind: use the letter map directly.
  if (kind === "race") {
    const raceKey = RACE_LETTER_MAP[code];
    if (raceKey == null) return null;
    return `race:${raceKey}`;
  }

  // All other kinds: look up in the FourCC map.
  const kindMap = lookup[kind];
  if (!kindMap) return null;

  const entry = kindMap.get(code);
  if (!entry) return null;

  return `${kind}:${entry.key}`;
}

// ---------------------------------------------------------------------------
// buildFourccLookup — helper to construct lookup from DB query results
//
// Designed to accept the minimal shape returned by a SELECT fourcc, key, id
// query from any of the ontology tables.
// ---------------------------------------------------------------------------

type FourccRow = { fourcc: string | null; key: string; id: string };

/**
 * Build a FourccLookup from DB query results.
 *
 * @param rows  - Array of {fourcc, key, id} objects for a given entity kind.
 *                Rows with null fourcc are skipped.
 * @param kind  - Which EntityKind these rows belong to.
 * @returns     A Map<fourcc, FourccEntry> for that kind.
 *
 * @example
 *   const unitRows = await db.select({fourcc:units.fourcc, key:units.key, id:units.id}).from(units);
 *   const lookup: FourccLookup = {
 *     unit: buildKindLookup(unitRows, "unit"),
 *   };
 */
export function buildKindLookup(
  rows: FourccRow[],
  _kind: EntityKind,
): Map<string, FourccEntry> {
  const map = new Map<string, FourccEntry>();
  for (const row of rows) {
    if (row.fourcc == null) continue;
    map.set(row.fourcc, { key: row.key, id: row.id });
  }
  return map;
}

// ---------------------------------------------------------------------------
// Convenience: resolve a race ref using only the letter map (no DB needed)
// ---------------------------------------------------------------------------

/**
 * Resolve a provisional race ref "race:O" → "race:orc".
 * Pure helper that does not require a DB or lookup table.
 *
 * @returns Canonical race ref, or null if the letter is unknown.
 */
export function resolveRaceRef(provisionalRef: string): string | null {
  return resolveEntityRef(provisionalRef, {});
}

// ---------------------------------------------------------------------------
// Re-export version constant (kept from original stub for consumers that
// imported it; replace with real version bumps via changesets when ready)
// ---------------------------------------------------------------------------

export const ONTOLOGY_VERSION = "0.1.0" as const;
