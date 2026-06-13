/**
 * Types for the admin benchmark-reference panel.
 * Mirror the api-py app/admin/models.py schemas exactly (camelCase).
 */

export type Provenance = "community" | "pro" | "user";
export type Confidence = "low" | "medium" | "high";

/** A stored benchmark_references row (GET /admin/references). */
export type BenchmarkReference = {
  id: string;
  matchup: string;
  raceId: string;
  metric: string;
  expected: number;
  windowMs: number;
  notes: string | null;
  provenance: Provenance;
  confidence: Confidence | null;
  /** Number of pro observations aggregated (provenance='pro'); null otherwise. */
  sampleSize: number | null;
  /** Aggregate spread for pro-derived rows; null for hand-authored rows. */
  dist: { p25: number; p75: number } | null;
  patchId: string | null;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
};

/** Body for POST /admin/references (identity + value + provenance). */
export type ReferenceCreate = {
  matchup: string;
  raceId: string;
  metric: string;
  expected: number;
  windowMs: number;
  notes?: string | null;
  provenance: Provenance;
  confidence?: Confidence | null;
  patchId?: string | null;
};

/** Body for PUT /admin/references/{id} (editable, non-identity fields). */
export type ReferenceUpdate = {
  expected: number;
  windowMs: number;
  notes?: string | null;
  provenance: Provenance;
  confidence?: Confidence | null;
};
