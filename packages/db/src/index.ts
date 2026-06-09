/**
 * @wc3-coach/db — Public API
 *
 * Re-exports the schema, client factory, pure mapping functions, and
 * persistence helpers as a single package entry point.
 *
 * Internal split:
 *   schema.ts   — Drizzle table definitions (snake_case DB / camelCase TS)
 *   client.ts   — createDb() factory over a pg Pool
 *   map.ts      — PURE ReplayTimeline → insert-row converters (no DB)
 *   persist.ts  — DB operations: createPendingReplay, persistTimeline, etc.
 *   migrate.ts  — standalone migration runner script (not re-exported)
 */

// Schema + inferred row types
export * from "./schema.js";

// Client factory + DrizzleDb type
export { createDb } from "./client.js";
export type { DrizzleDb } from "./client.js";

// Pure mapping utilities
export {
  timelineToReplayRow,
  timelineToPlayerRows,
  timelineToEventRows,
  parsePatchId,
} from "./map.js";

// Persistence helpers
export {
  createPendingReplay,
  findReplayByHash,
  persistTimeline,
  setReplayStatus,
  getReplayWithTimeline,
} from "./persist.js";

// DB-backed FourCC resolver (T2.2)
export { loadFourccMaps, resolveReplayRefs } from "./resolve.js";
export type { ResolveResult } from "./resolve.js";

// Seed importer (T2.2) — only types exported; importOntology requires a live DB at runtime
export { importOntology, importRaces } from "./seed/import.js";
export type { ImportResult } from "./seed/import.js";
