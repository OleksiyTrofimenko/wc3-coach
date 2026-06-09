/**
 * Drizzle Kit configuration for @wc3-coach/db.
 *
 * Generates migration SQL files into the repo-root db/migrations/ directory
 * so all SQL lives alongside the existing db/init/ and db/schema.sql files.
 *
 * Commands:
 *   corepack pnpm --filter @wc3-coach/db db:generate   — generate migration SQL
 *   corepack pnpm --filter @wc3-coach/db db:migrate    — apply to the DB
 *
 * DATABASE_URL must be set in the environment (copy .env.example → .env).
 */

import { defineConfig } from "drizzle-kit";

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) {
  throw new Error(
    "DATABASE_URL environment variable is required for drizzle-kit. " +
      "Copy .env.example to .env and run: source .env (or set it in your shell).",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "../../db/migrations",
  dbCredentials: {
    url: DATABASE_URL,
  },
  migrations: {
    table: "__drizzle_migrations",
    schema: "public",
  },
  verbose: true,
  strict: true,
});
