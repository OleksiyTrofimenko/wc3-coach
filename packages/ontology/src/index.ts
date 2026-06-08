/**
 * @wc3-coach/ontology — unit, building, hero, and upgrade type helpers
 *
 * This package provides TypeScript types and helpers that map game entity IDs
 * (as extracted from .w3g replays) to the canonical ontology defined in:
 *   .claude/skills/wc3-knowledge/ontology.md
 *
 * The ontology is the authoritative source of WC3 facts (HP, armor, DPS, cost,
 * food, tech tree, etc.) tied to patch_versions. Never hard-code stats inline in
 * application code — always reference ontology entries.
 *
 * TODO(T2.2): Implement entity types and helpers:
 *   - EntityKind enum (unit | building | hero | upgrade | creep | item)
 *   - OntologyEntry<T> — generic typed entry with patch_version constraint
 *   - resolveEntity(id: string, patch: string) → OntologyEntry
 *   - Race enum (Human | Orc | NightElf | Undead | Neutral)
 *   - TechTree helpers (requires, unlocks, cost)
 *
 * TODO(T2.3): Add patch versioning utilities.
 *
 * See docs/WC3_Coach_Design_Doc.md §5 for the DB schema these types back.
 */

import type { Placeholder } from "@wc3-coach/shared-types";

// Placeholder export so the package builds cleanly.
// Replace in T2.2 with real ontology types.
export const ONTOLOGY_VERSION = "0.0.1" as const;

export type OntologyPlaceholder = Placeholder & {
  // TODO(T2.2): remove and add real entity types
  _ontology: true;
};
