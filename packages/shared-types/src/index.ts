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
 * DB mapping: design doc §5. Field names are camelCase here; the snake_case DB
 * columns are mapped in the ingest/query layer, never in these types.
 */

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

/** Semver of the shared-types contract. Bump on any breaking change. */
export const SHARED_TYPES_VERSION = "0.1.0" as const;

// ---------------------------------------------------------------------------
// GameEvent  (maps to: game_events — design doc §5.2)
// ---------------------------------------------------------------------------

/**
 * Discriminant union of all event kinds recorded from a replay.
 *
 * `unit_death` is INFERRED (design doc §6, Path A/B) — it is never directly
 * present in a raw .w3g file. It is included here so downstream analytics
 * can work with a single event model regardless of how the death was derived.
 */
export type GameEventType =
  | "build"
  | "train"
  | "upgrade"
  | "learn_skill"
  | "item"
  | "move"
  | "attack"
  | "hero_level"
  | "unit_spawn"
  | "unit_death"
  | "expand";

/**
 * A single normalized action or state-change extracted from a replay.
 *
 * Maps to: game_events (design doc §5.2).
 *
 * @property replayId   - FK into replays.
 * @property slot       - Player slot number (1-based, matches replay_players.slot).
 * @property tMs        - Time offset in milliseconds from game start.
 * @property type       - Event kind; see {@link GameEventType}.
 * @property entityRef  - Ontology reference string, e.g. "unit:hu_footman",
 *                        "building:hu_barracks", "hero:paladin". Always namespaced.
 * @property payload    - Type-specific extra data (free bag; kept loosely typed here
 *                        because the shape varies per event kind and will be
 *                        narrowed per-consumer).
 */
export type GameEvent = {
  replayId: string;
  slot: number;
  tMs: number;
  type: GameEventType;
  entityRef: string;
  payload: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// ReplayPlayer  (maps to: replay_players — design doc §5.2)
// ---------------------------------------------------------------------------

/**
 * One player's metadata within a replay.
 *
 * Maps to: replay_players (design doc §5.2).
 */
export type ReplayPlayer = {
  slot: number;
  playerName: string;
  /** Ontology reference into races, e.g. "race:human". */
  raceId: string;
  /** Raw APM as recorded by the replay. */
  apm: number;
  result: "win" | "loss" | "unknown";
};

// ---------------------------------------------------------------------------
// ReplayTimeline  (maps to: replays + replay_players + game_events — design doc §5.2)
// ---------------------------------------------------------------------------

/**
 * Full parsed replay: metadata + per-player roster + ordered event stream.
 *
 * This is the primary output of the Node parser pipeline and the primary input
 * to the Python analytics pipeline.
 *
 * Maps to: replays + replay_players + game_events (design doc §5.2).
 *
 * @property replayId    - Unique replay ID (UUID assigned at ingest).
 * @property fileHash    - SHA-256 of the raw .w3g file (used for dedup).
 * @property mapId       - Ontology reference into maps, e.g. "map:echo_isles".
 * @property playedAt    - ISO 8601 UTC timestamp when the game was played.
 * @property durationMs  - Total game duration in milliseconds.
 * @property patchId     - Ontology reference into patch_versions, e.g. "patch:1.36.1".
 * @property winnerSlot  - Slot number of the winning player; null for draws/unknown.
 * @property players     - Ordered array of player metadata.
 * @property events      - All game events, ordered ascending by tMs.
 */
export type ReplayTimeline = {
  replayId: string;
  fileHash: string;
  mapId: string;
  playedAt: string;
  durationMs: number;
  patchId: string;
  winnerSlot: number | null;
  players: ReplayPlayer[];
  events: GameEvent[];
};

// ---------------------------------------------------------------------------
// BenchmarkResult  (maps to: benchmarks — design doc §5.2)
// ---------------------------------------------------------------------------

/**
 * Severity tiers for benchmark deviations.
 *
 * Ordinal: info < minor < major < critical.
 * Used by the coach to prioritize which deviations to surface first.
 */
export type BenchmarkSeverity = "info" | "minor" | "major" | "critical";

/**
 * One computed deviation from a reference value for a single metric.
 *
 * Maps to: benchmarks (design doc §5.2).
 *
 * @property replayId  - FK into replays.
 * @property slot      - Player slot the metric belongs to.
 * @property metric    - Human-readable metric name, e.g. "expand_time",
 *                       "hero_level_3_time", "floating_gold".
 * @property value     - Actual measured value (in units natural to the metric).
 * @property expected  - Reference value from the benchmark corpus for this
 *                       matchup + patch combination.
 * @property delta     - Signed difference: value − expected.
 *                       Positive = later/more than expected; negative = earlier/less.
 * @property severity  - Assessed impact tier; see {@link BenchmarkSeverity}.
 */
export type BenchmarkResult = {
  replayId: string;
  slot: number;
  metric: string;
  value: number;
  expected: number;
  delta: number;
  severity: BenchmarkSeverity;
};

// ---------------------------------------------------------------------------
// CoachReport  (design doc §7.3 — LLM coach output contract)
// ---------------------------------------------------------------------------

/**
 * A single actionable tip produced by the LLM coach.
 *
 * @property priority           - Rank order; 1 is the most impactful.
 * @property title              - Short title, e.g. "Expand too late".
 * @property detail             - Full explanation (1–3 sentences).
 * @property tMs               - Optional: timestamp in ms this tip refers to.
 *                               Allows the UI to link directly to the timeline moment.
 * @property relatedBenchmarks  - Optional: metric names from BenchmarkResult this
 *                               tip is derived from, for deep-linking.
 */
export type CoachTip = {
  priority: number;
  title: string;
  detail: string;
  tMs?: number;
  relatedBenchmarks?: string[];
};

/**
 * The complete output of one LLM coach run for a single replay.
 *
 * This is the payload written to storage and served to the frontend.
 * Design doc §7.3 defines the prompt contract that produces it.
 *
 * @property replayId   - FK into replays.
 * @property matchup    - Short matchup code, e.g. "OvH", "NEvUD".
 * @property mapName    - Human-readable map name, e.g. "Echo Isles".
 * @property result     - Game result from the perspective of the analysed player.
 * @property durationMs - Game duration in milliseconds (copied from ReplayTimeline).
 * @property tips       - Ordered array of coach tips (3–5 per design contract).
 */
export type CoachReport = {
  replayId: string;
  matchup: string;
  mapName: string;
  result: "win" | "loss" | "unknown";
  durationMs: number;
  tips: CoachTip[];
};

// ---------------------------------------------------------------------------
// DrillResult  (maps to: apm_sessions — design doc §5.3)
// ---------------------------------------------------------------------------

/**
 * A single timed checkpoint within an APM drill session.
 *
 * @property tMs - Milliseconds from drill start when the checkpoint was evaluated.
 * @property ok  - Whether the checkpoint was completed correctly and on time.
 */
export type DrillCheckpoint = {
  tMs: number;
  ok: boolean;
};

/**
 * The recorded outcome of one APM trainer drill session.
 *
 * Maps to: apm_sessions (design doc §5.3).
 *
 * @property drillType   - Identifier for the drill scenario,
 *                         e.g. "hotkey:control_groups", "micro:kiting".
 * @property startedAt   - ISO 8601 UTC timestamp when the session started.
 * @property durationMs  - Total session duration in milliseconds.
 * @property epm         - Effective actions per minute (meaningful inputs only).
 * @property apm         - Raw actions per minute.
 * @property accuracy    - Fraction of correct actions in [0, 1].
 * @property reactionMs  - Mean reaction time across all reaction prompts (ms).
 * @property score       - Composite score for the session (scaling defined per drill).
 * @property checkpoints - Optional ordered list of per-step results within the drill.
 */
export type DrillResult = {
  drillType: string;
  startedAt: string;
  durationMs: number;
  epm: number;
  apm: number;
  accuracy: number;
  reactionMs: number;
  score: number;
  checkpoints?: DrillCheckpoint[];
};
