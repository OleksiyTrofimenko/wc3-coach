/**
 * @wc3-coach/db — Ontology seed runner (db:seed)
 *
 * Entry point for `corepack pnpm --filter @wc3-coach/db db:seed`.
 * Loads all ontology JSON seed files and calls importOntology + importRaces.
 *
 * Requirements:
 *   DATABASE_URL must be set in the environment (copy .env.example → .env).
 *   The database must be migrated (0000 + 0001 + 0002 applied) before running.
 *
 * This file is executed via tsx at runtime only — the build step does NOT
 * execute this file, so a live DB is never needed during build/typecheck.
 *
 * Usage:
 *   DATABASE_URL=... corepack pnpm --filter @wc3-coach/db db:seed
 * or via the package.json script:
 *   corepack pnpm --filter @wc3-coach/db db:seed
 */

import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createDb } from "../client.js";
import { importPatches, importOntology, importRaces } from "./import.js";
import type { RaceSeedFile, RacesSeedFile, PatchesSeedFile } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function readJson<T>(relPath: string): Promise<T> {
  const abs = resolve(__dirname, relPath);
  const raw = await readFile(abs, "utf-8");
  return JSON.parse(raw) as T;
}

async function main(): Promise<void> {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    console.error(
      "[db:seed] ERROR: DATABASE_URL environment variable is required.\n" +
        "  Copy .env.example → .env and set it, or pass inline:\n" +
        "  DATABASE_URL=postgresql://... corepack pnpm --filter @wc3-coach/db db:seed",
    );
    process.exit(1);
  }

  const db = createDb(databaseUrl);
  console.log("[db:seed] Connected — starting ontology import...");

  try {
    // 0. Import curated patch_versions registry FIRST (FK target for stat rows).
    const patchesSeed = await readJson<PatchesSeedFile>("patches.json");
    const patchResult = await importPatches(db, patchesSeed);
    console.log(
      `[db:seed] Patches  — inserted=${patchResult.inserted}, updated=${patchResult.updated}`,
    );

    // 1. Bootstrap all race identity rows from the races-only seed file.
    const racesSeed = await readJson<RacesSeedFile>("ontology.races.json");
    const racesResult = await importRaces(db, racesSeed);
    console.log(
      `[db:seed] Races — inserted=${racesResult.inserted}, updated=${racesResult.updated}`,
    );

    // 2. Import per-race seed files.
    const raceFiles: string[] = [
      "ontology.orc.json",
      "ontology.nightelf.json",
      "ontology.human.json",
      "ontology.undead.json",
    ];

    const seeds: RaceSeedFile[] = [];
    for (const file of raceFiles) {
      const seed = await readJson<RaceSeedFile>(file);
      seeds.push(seed);
    }

    const result = await importOntology(db, seeds);
    console.log(
      `[db:seed] Ontology import complete — inserted=${result.inserted}, updated=${result.updated}`,
    );
    console.log("[db:seed] Done.");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[db:seed] FAILED: ${message}`);
    if (err instanceof Error && err.stack) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

void main();
