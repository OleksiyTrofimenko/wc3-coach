/**
 * @wc3-coach/db — Drizzle client factory
 *
 * Creates a Drizzle ORM instance over a node-postgres Pool.
 *
 * Usage:
 *   import { createDb } from "@wc3-coach/db";
 *   const db = createDb(process.env.DATABASE_URL!);
 *
 * The returned `db` object is the single Drizzle handle used throughout
 * api-node (server + worker). Pass it around; don't call createDb() multiple
 * times in production — share one Pool per process.
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";

export type DrizzleDb = ReturnType<typeof createDb>;

/**
 * Create and return a Drizzle database instance.
 *
 * @param databaseUrl - Full PostgreSQL connection string, e.g.
 *   "postgresql://wc3coach:wc3coach@localhost:5432/wc3coach"
 */
export function createDb(databaseUrl: string): ReturnType<typeof drizzle<typeof schema>> {
  const pool = new Pool({ connectionString: databaseUrl });
  return drizzle(pool, { schema });
}

// Re-export inferred row types so callers import from one place.
export type {
  PatchVersionRow,
  NewPatchVersionRow,
  ReplayRow,
  NewReplayRow,
  ReplayPlayerRow,
  NewReplayPlayerRow,
  GameEventRow,
  NewGameEventRow,
} from "./schema.js";
