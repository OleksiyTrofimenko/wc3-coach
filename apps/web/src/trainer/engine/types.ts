import type { DrillResult } from "@wc3-coach/shared-types";

/**
 * Drill engine core types — scenario DSL and runtime state.
 *
 * These are the "data" types that define drills without any React/DOM imports.
 * New drills are written as DrillScenario objects; the engine consumes them.
 *
 * Design:
 *   DrillScenario   — static definition (goal, steps, scoring params)
 *   DrillStep       — one prompt the player must respond to
 *   KeyCombo        — the exact key/combo the player must press
 *   StepResult      — recorded outcome of one step attempt
 *   EngineState     — the running state machine state
 */

// ---------------------------------------------------------------------------
// Key representation
// ---------------------------------------------------------------------------

/**
 * A single key combo the player must press.
 * Matches real WC3 in-game bindings (grid or classic layout).
 *
 * Examples:
 *   { key: "1", ctrl: true }  — Ctrl+1 (assign/recall control group 1)
 *   { key: "a" }              — A (Attack command, classic layout)
 *   { key: "b" }              — B (Build menu, classic layout)
 *   { key: "Tab" }            — Tab (cycle subgroup)
 */
export type KeyCombo = {
  key: string;      // lowercase letter, digit, or named key (e.g. "Tab", "Escape")
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
};

/** Human-readable label for a KeyCombo, e.g. "Ctrl+1", "Shift+F1". */
export function keyComboLabel(combo: KeyCombo): string {
  const parts: string[] = [];
  if (combo.ctrl) parts.push("Ctrl");
  if (combo.alt) parts.push("Alt");
  if (combo.shift) parts.push("Shift");
  parts.push(combo.key.length === 1 ? combo.key.toUpperCase() : combo.key);
  return parts.join("+");
}

/**
 * Returns true if a KeyboardEvent matches the given KeyCombo.
 *
 * NOTE: This is pure logic — it receives the event fields explicitly so the
 * engine core stays DOM-free and testable.
 */
export function matchesCombo(
  combo: KeyCombo,
  evKey: string,
  evCtrl: boolean,
  evShift: boolean,
  evAlt: boolean,
): boolean {
  if (combo.key.toLowerCase() !== evKey.toLowerCase()) return false;
  if (!!combo.ctrl !== evCtrl) return false;
  if (!!combo.shift !== evShift) return false;
  if (!!combo.alt !== evAlt) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Drill scenario DSL
// ---------------------------------------------------------------------------

/**
 * A single prompt step in a drill.
 *
 * The engine presents this to the player, then waits up to `windowMs` for the
 * correct key combo. If no correct response arrives, the step is recorded as
 * a miss/wrong and the drill advances.
 *
 * @property id          - Unique within the scenario (used in checkpoint refs).
 * @property prompt      - The text instruction shown to the player.
 * @property subPrompt   - Optional secondary hint (e.g. the action name).
 * @property target      - The exact key combo the player must press.
 * @property windowMs    - Time window in ms within which the answer is counted
 *                         "correct". Defaults to the scenario-level default if
 *                         omitted (typically 2000ms). After the window elapses
 *                         the step is scored as a miss and the drill advances.
 */
export type DrillStep = {
  id: string;
  prompt: string;
  subPrompt?: string;
  target: KeyCombo;
  windowMs?: number;
};

/**
 * A complete drill scenario definition.
 *
 * This is the "data" that describes a drill. Add new drills by creating new
 * DrillScenario objects — no engine code changes needed.
 *
 * @property id            - Unique scenario identifier, e.g. "hotkey:control_groups".
 * @property title         - Human-readable name.
 * @property description   - Short description shown on the drill selection screen.
 * @property category      - Broad category for grouping in the UI.
 * @property steps         - Ordered sequence of prompts. Engine cycles through them.
 * @property defaultWindowMs - Default reaction window per step (ms). Steps can override.
 * @property totalDurationMs - Total drill duration. Engine runs until this elapses
 *                             (cycling steps if needed) OR until all steps are exhausted
 *                             (whichever comes first for finite-step drills).
 *                             Set to 0 to run exactly once through all steps with no repeat.
 * @property repeat        - If true, cycle through steps until totalDurationMs elapses.
 *                           If false (default), run each step exactly once.
 */
export type DrillScenario = {
  id: string;
  title: string;
  description: string;
  category: "hotkey" | "micro" | "build-order";
  steps: DrillStep[];
  defaultWindowMs: number;
  totalDurationMs: number;
  repeat: boolean;
};

// ---------------------------------------------------------------------------
// Runtime state machine
// ---------------------------------------------------------------------------

/** The drill has not been started yet. */
export type EnginePhase =
  | "idle"
  | "countdown"   // 3-2-1 countdown before the first prompt
  | "running"     // actively presenting prompts
  | "finished";   // session complete, DrillResult available

/**
 * Result of a single step attempt (recorded for scoring).
 *
 * @property stepId      - ID of the step that was presented.
 * @property promptedAt  - Clock value (from injected clock) when prompt appeared.
 * @property answeredAt  - Clock value when the player pressed a key. null = timeout/miss.
 * @property correct     - Whether the key pressed matched the target.
 * @property reactionMs  - promptedAt→answeredAt delta. null if miss.
 */
export type StepResult = {
  stepId: string;
  promptedAt: number;
  answeredAt: number | null;
  correct: boolean;
  reactionMs: number | null;
};

/**
 * Live snapshot of engine state. Consumed by the React UI via the
 * DrillEngine.subscribe() callback — no React state management lib needed.
 */
export type EngineState = {
  phase: EnginePhase;
  scenario: DrillScenario | null;
  /** Index of the currently active step (into scenario.steps, with wrap for repeat). */
  currentStepIndex: number;
  /** The step being displayed right now (null when idle/finished). */
  currentStep: DrillStep | null;
  /** Elapsed ms since the drill started (0 when idle). */
  elapsedMs: number;
  /** Remaining ms in the current step's reaction window. */
  stepRemainingMs: number;
  /** Running tally of correct answers so far. */
  correctCount: number;
  /** Running tally of total prompts presented so far. */
  totalCount: number;
  /** All step results recorded so far (for final scoring). */
  results: StepResult[];
  /** Available once phase === "finished". */
  drillResult: DrillResult | null;
};
