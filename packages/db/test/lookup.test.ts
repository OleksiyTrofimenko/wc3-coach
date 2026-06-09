/**
 * T2.3 — Unit tests for patch-aware stat lookup.
 *
 * Tests the pure `pickForPatch` selection helper and the `importPatches`
 * seed-shape mapping. No live database is required.
 *
 * The DB-backed getters (getUnit, getBuilding, etc.) compose pickForPatch
 * with a Drizzle query — they are tested indirectly by confirming that
 * pickForPatch exhaustively covers the override model.
 *
 * PRINCIPLE #1 (CLAUDE.md): All fixtures represent static game-fact data only.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pickForPatch } from "../src/lookup.js";
import type { PatchesSeedFile } from "../src/seed/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Minimal row shape for pickForPatch tests
// (matches the real schema constraint: patchId is string | null)
// ---------------------------------------------------------------------------

type MinRow = {
  key: string;
  patchId: string | null;
  hp: number; // stand-in for any stat
};

const PATCH_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const PATCH_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

// ---------------------------------------------------------------------------
// pickForPatch — exhaustive override-model tests
// ---------------------------------------------------------------------------

describe("pickForPatch — selection logic", () => {
  // ------------------------------------------------------------------
  // Case 1: only a baseline row present
  // ------------------------------------------------------------------
  describe("only baseline present", () => {
    const baseline: MinRow = { key: "grunt", patchId: null, hp: 700 };

    it("returns baseline when patchId is undefined", () => {
      const result = pickForPatch([baseline], undefined);
      expect(result).toBe(baseline);
    });

    it("returns baseline when patchId is provided but no specific row exists", () => {
      const result = pickForPatch([baseline], PATCH_A);
      expect(result).toBe(baseline);
    });

    it("returns baseline for a different patch that also has no specific row", () => {
      const result = pickForPatch([baseline], PATCH_B);
      expect(result).toBe(baseline);
    });
  });

  // ------------------------------------------------------------------
  // Case 2: only a patch-specific row present (no baseline)
  // ------------------------------------------------------------------
  describe("only patch-specific row present", () => {
    const specific: MinRow = { key: "grunt", patchId: PATCH_A, hp: 720 };

    it("returns the specific row when patchId matches", () => {
      const result = pickForPatch([specific], PATCH_A);
      expect(result).toBe(specific);
    });

    it("returns undefined when patchId does not match and there is no baseline", () => {
      const result = pickForPatch([specific], PATCH_B);
      expect(result).toBeUndefined();
    });

    it("returns undefined when patchId is undefined and there is no baseline", () => {
      const result = pickForPatch([specific], undefined);
      expect(result).toBeUndefined();
    });
  });

  // ------------------------------------------------------------------
  // Case 3: both baseline and patch-specific row present
  // ------------------------------------------------------------------
  describe("baseline AND patch-specific row both present", () => {
    const baseline: MinRow = { key: "grunt", patchId: null, hp: 700 };
    const specific: MinRow = { key: "grunt", patchId: PATCH_A, hp: 720 };

    it("returns patch-specific row when patchId matches", () => {
      const result = pickForPatch([baseline, specific], PATCH_A);
      expect(result).toBe(specific);
    });

    it("patch-specific wins regardless of array order", () => {
      const resultReversed = pickForPatch([specific, baseline], PATCH_A);
      expect(resultReversed).toBe(specific);
    });

    it("returns baseline when patchId is for a different patch", () => {
      const result = pickForPatch([baseline, specific], PATCH_B);
      expect(result).toBe(baseline);
    });

    it("returns baseline when patchId is undefined", () => {
      const result = pickForPatch([baseline, specific], undefined);
      expect(result).toBe(baseline);
    });
  });

  // ------------------------------------------------------------------
  // Case 4: empty rows array
  // ------------------------------------------------------------------
  describe("empty rows array", () => {
    it("returns undefined when rows is empty and patchId is undefined", () => {
      const result = pickForPatch([], undefined);
      expect(result).toBeUndefined();
    });

    it("returns undefined when rows is empty and patchId is provided", () => {
      const result = pickForPatch([], PATCH_A);
      expect(result).toBeUndefined();
    });
  });

  // ------------------------------------------------------------------
  // Case 5: multiple patch-specific rows for different patches
  // (edge case: same key has overrides for two separate patches)
  // ------------------------------------------------------------------
  describe("multiple patch-specific rows for different patches", () => {
    const baseline: MinRow = { key: "grunt", patchId: null, hp: 700 };
    const specificA: MinRow = { key: "grunt", patchId: PATCH_A, hp: 720 };
    const specificB: MinRow = { key: "grunt", patchId: PATCH_B, hp: 680 };

    it("returns PATCH_A specific when querying PATCH_A", () => {
      const result = pickForPatch([baseline, specificA, specificB], PATCH_A);
      expect(result).toBe(specificA);
      expect(result!.hp).toBe(720);
    });

    it("returns PATCH_B specific when querying PATCH_B", () => {
      const result = pickForPatch([baseline, specificA, specificB], PATCH_B);
      expect(result).toBe(specificB);
      expect(result!.hp).toBe(680);
    });

    it("returns baseline when querying a patch that has no override", () => {
      const PATCH_C = "cccccccc-cccc-cccc-cccc-cccccccccccc";
      const result = pickForPatch([baseline, specificA, specificB], PATCH_C);
      expect(result).toBe(baseline);
      expect(result!.hp).toBe(700);
    });
  });

  // ------------------------------------------------------------------
  // Case 6: correct stat values are returned (not just identity)
  // ------------------------------------------------------------------
  describe("returned row carries the correct stat values", () => {
    it("patch-specific row stat is used when override wins", () => {
      const baseline: MinRow = { key: "footman", patchId: null, hp: 420 };
      const specific: MinRow = { key: "footman", patchId: PATCH_A, hp: 440 };

      const result = pickForPatch([baseline, specific], PATCH_A);
      expect(result!.hp).toBe(440);
    });

    it("baseline stat is used when no override exists for the queried patch", () => {
      const baseline: MinRow = { key: "footman", patchId: null, hp: 420 };
      const specificA: MinRow = { key: "footman", patchId: PATCH_A, hp: 440 };

      const result = pickForPatch([baseline, specificA], PATCH_B);
      expect(result!.hp).toBe(420);
    });
  });
});

// ---------------------------------------------------------------------------
// importPatches seed shape — pure structural validation (no DB)
// ---------------------------------------------------------------------------

describe("patches.json seed shape", () => {
  // Read the actual file synchronously — no DB needed.
  const PATCHES_PATH = resolve(__dirname, "../src/seed/patches.json");
  const patches = JSON.parse(readFileSync(PATCHES_PATH, "utf-8")) as PatchesSeedFile;

  it("has a _meta field", () => {
    expect(patches).toHaveProperty("_meta");
    expect(patches._meta).toHaveProperty("source");
    expect(patches._meta).toHaveProperty("notes");
    expect(patches._meta).toHaveProperty("guardrail");
  });

  it("has a non-empty patches array", () => {
    expect(Array.isArray(patches.patches)).toBe(true);
    expect(patches.patches.length).toBeGreaterThan(0);
  });

  it("every entry has version (string), build_number (number), released_at (string|null)", () => {
    for (const entry of patches.patches) {
      expect(typeof entry.version).toBe("string");
      expect(entry.version.length).toBeGreaterThan(0);
      expect(typeof entry.build_number).toBe("number");
      expect(Number.isInteger(entry.build_number)).toBe(true);
      expect(entry.build_number).toBeGreaterThan(0);
      // released_at must be a string (ISO date) or null — never undefined.
      expect(entry.released_at === null || typeof entry.released_at === "string").toBe(true);
    }
  });

  it("includes the fixture-confirmed patch 2.00 / 6117", () => {
    const confirmed = patches.patches.find(
      (p) => p.version === "2.00" && p.build_number === 6117,
    );
    expect(
      confirmed,
      "patches.json must include version=2.00 / build_number=6117 (confirmed from fixture)",
    ).toBeDefined();
  });

  it("every entry has a notes string (provenance documentation)", () => {
    for (const entry of patches.patches) {
      expect(typeof entry.notes).toBe("string");
      expect(entry.notes.length).toBeGreaterThan(0);
    }
  });

  it("no duplicate (version, build_number) pairs", () => {
    const seen = new Set<string>();
    for (const entry of patches.patches) {
      const key = `${entry.version}|${entry.build_number}`;
      expect(seen.has(key), `Duplicate patch entry: ${key}`).toBe(false);
      seen.add(key);
    }
  });
});
