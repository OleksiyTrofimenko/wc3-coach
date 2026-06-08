/**
 * @wc3-coach/shared-types — canonical event and report types
 *
 * This is the SINGLE SOURCE OF TRUTH for all event and report shapes shared
 * between the Node API (parser/ingest), Python API (analytics/RAG), and the
 * web frontend.
 *
 * Rules:
 *  - All new types that cross service boundaries live here.
 *  - Python schemas are GENERATED from these types (JSON Schema → pydantic).
 *    Do NOT duplicate definitions in api-py.
 *  - Analysis is POST-GAME ONLY — no live-game types belong here.
 *    (Principle #1 from CLAUDE.md)
 *
 * TODO(T0.4): Define canonical types:
 *   - GameEvent       (t_ms, entity_ref, event_kind, payload)
 *   - ReplayTimeline  (replay metadata + ordered GameEvent[])
 *   - BenchmarkResult (deviation from reference build/timings)
 *   - CoachReport     (top 3-5 prioritized tips with t_ms references)
 *   - DrillResult     (APM session score, accuracy, reaction times)
 *
 * See docs/WC3_Coach_Design_Doc.md §4 (data model) for field-level details.
 */

// Placeholder export so the package compiles and dependents can import from it.
// Replace with real types in T0.4.
export const SHARED_TYPES_VERSION = "0.0.1" as const;

export type Placeholder = {
  // TODO(T0.4): remove this placeholder and add GameEvent, ReplayTimeline, etc.
  _placeholder: true;
};
