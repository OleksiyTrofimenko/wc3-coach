/**
 * Drill engine barrel — re-exports everything the React layer needs.
 */
export { DrillEngine, TOTAL_COUNTDOWN_MS, COUNTDOWN_STEP_MS } from "./DrillEngine";
export { keyComboLabel, matchesCombo } from "./types";
export type { KeyCombo, DrillStep, DrillScenario, StepResult, EngineState, EnginePhase } from "./types";
export { computeMetrics } from "./scoring";
export type { ScoringParams, SessionMetrics } from "./scoring";
export { HOTKEY_SCENARIOS } from "./scenarios/hotkeys";
