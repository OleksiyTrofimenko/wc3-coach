/**
 * @wc3-coach/db — Migration runner
 *
 * Applies pending Drizzle migrations from db/migrations/ to the target DB.
 *
 * Usage:
 *   node --loader tsx/esm src/migrate.ts
 *   (or via the `db:migrate` script in package.json)
 *
 * Requires DATABASE_URL in the environment (or .env loaded beforehand).
 *
 * Migration files live in the repo-root db/migrations/ directory, generated
 * by `corepack pnpm --filter @wc3-coach/db db:generate` (drizzle-kit generate).
 *
 * Flow:
 *   1. Open a short-lived Pool connection.
 *   2. Run drizzle-orm migrator — applies any SQL files in db/migrations/ that
 *      haven't been recorded in the drizzle metadata table yet.
 *   3. Exit 0 on success, 1 on failure.
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) {
  console.error("[migrate] ERROR: DATABASE_URL environment variable is not set.");
  process.exit(1);
}

// Migrations folder is at repo root db/migrations/, two levels above packages/db/.
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, "../../../db/migrations");

async function runMigrations(): Promise<void> {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool);

  console.log(`[migrate] Applying migrations from: ${MIGRATIONS_DIR}`);
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
    console.log("[migrate] All migrations applied successfully.");
  } finally {
    await pool.end();
  }
}

runMigrations().catch((err: unknown) => {
  console.error("[migrate] Migration failed:", err);
  process.exit(1);
});
