/**
 * DrillEngine — render-agnostic drill state machine.
 *
 * No React, no DOM, no Date.now() baked in.
 * All time comes from the injected `clock` callback so tests can control it.
 *
 * Usage:
 *   const engine = new DrillEngine(() => performance.now());
 *   engine.subscribe(state => setUiState(state));
 *   engine.load(scenario);
 *   engine.start();
 *   // ... in a keydown handler:
 *   engine.handleKey(e.key, e.ctrlKey, e.shiftKey, e.altKey);
 *   // ... in an animation frame or setInterval:
 *   engine.tick();
 *
 * State machine transitions:
 *   idle → [load] → idle (scenario loaded, ready to start)
 *   idle → [start] → countdown
 *   countdown → [tick, countdown done] → running
 *   running → [handleKey] → running (step result recorded, next step)
 *   running → [tick, step window expires] → running (miss recorded, next step)
 *   running → [tick or step advance, drill done] → finished
 *   any → [reset] → idle
 */

import type { DrillScenario, DrillStep, StepResult, EngineState } from "./types";
import { matchesCombo } from "./types";
import { computeMetrics } from "./scoring";
import type { DrillResult, DrillCheckpoint } from "@wc3-coach/shared-types";

/** Countdown phases in seconds (counts down 3 → 2 → 1 → go). */
const COUNTDOWN_STEPS = [3, 2, 1];
const COUNTDOWN_STEP_MS = 800; // each countdown step lasts 800ms
const TOTAL_COUNTDOWN_MS = COUNTDOWN_STEPS.length * COUNTDOWN_STEP_MS;

export type EngineSubscriber = (state: EngineState) => void;

export class DrillEngine {
  /** Injected clock — returns milliseconds (monotonic, like performance.now()). */
  private readonly clock: () => number;

  private scenario: DrillScenario | null = null;
  private phase: EngineState["phase"] = "idle";

  // Timing
  private drillStartMs = 0;      // clock() when drill entered "running"
  private countdownStartMs = 0;  // clock() when countdown started
  private stepStartMs = 0;       // clock() when current step was presented

  // Step tracking
  private stepIndex = 0;         // index into scenario.steps (may exceed steps.length for repeat)
  private stepResults: StepResult[] = [];

  // Subscribers
  private subscribers: EngineSubscriber[] = [];

  constructor(clock: () => number) {
    this.clock = clock;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Load a scenario. Resets any running state. Phase becomes "idle".
   */
  load(scenario: DrillScenario): void {
    this.scenario = scenario;
    this.phase = "idle";
    this.stepIndex = 0;
    this.stepResults = [];
    this.drillStartMs = 0;
    this.countdownStartMs = 0;
    this.stepStartMs = 0;
    this.notify();
  }

  /**
   * Start the drill (enters countdown phase).
   * No-op if no scenario is loaded or already running/finished.
   */
  start(): void {
    if (!this.scenario) return;
    if (this.phase !== "idle") return;

    this.countdownStartMs = this.clock();
    this.phase = "countdown";
    this.stepIndex = 0;
    this.stepResults = [];
    this.notify();
  }

  /**
   * Reset to idle. Can be called from any phase.
   */
  reset(): void {
    this.phase = "idle";
    this.stepIndex = 0;
    this.stepResults = [];
    this.drillStartMs = 0;
    this.countdownStartMs = 0;
    this.stepStartMs = 0;
    this.notify();
  }

  /**
   * Process a key event. Called by the React component from a keydown handler.
   * Returns true if the key was consumed by the engine (caller can then
   * preventDefault on the browser event).
   *
   * Note on preventDefault strategy: the caller should call preventDefault()
   * when this returns true, which covers Ctrl+1..9 (browser tab shortcuts) and
   * other colliding bindings. We do NOT call preventDefault() ourselves because
   * the engine is DOM-free — the React layer decides.
   */
  handleKey(key: string, ctrlKey: boolean, shiftKey: boolean, altKey: boolean): boolean {
    if (this.phase !== "running") return false;
    if (!this.scenario) return false;

    const step = this.currentStep();
    if (!step) return false;

    const answeredAt = this.clock();
    const correct = matchesCombo(step.target, key, ctrlKey, shiftKey, altKey);
    const reactionMs = answeredAt - this.stepStartMs;

    this.recordStepResult(step, answeredAt, correct, reactionMs);
    return true; // consumed — caller should preventDefault
  }

  /**
   * Advance the engine clock. Must be called regularly (e.g. requestAnimationFrame
   * or setInterval at ~16ms) to:
   *  - progress the countdown
   *  - expire timed steps (miss detection)
   *  - end the drill when totalDurationMs is reached
   */
  tick(): void {
    const now = this.clock();

    if (this.phase === "countdown") {
      const elapsed = now - this.countdownStartMs;
      if (elapsed >= TOTAL_COUNTDOWN_MS) {
        // Transition to running
        this.drillStartMs = now;
        this.stepStartMs = now;
        this.phase = "running";
        this.notify();
      } else {
        this.notify();
      }
      return;
    }

    if (this.phase !== "running") return;
    if (!this.scenario) return;

    const elapsed = now - this.drillStartMs;

    // Check if drill total duration has expired.
    if (this.scenario.totalDurationMs > 0 && elapsed >= this.scenario.totalDurationMs) {
      // Time up — if there's an active step that hasn't been answered, record a miss.
      const step = this.currentStep();
      if (step) {
        this.recordMiss(step, now);
      }
      this.finishDrill();
      return;
    }

    // Check if the current step's window has expired (miss).
    const step = this.currentStep();
    if (step) {
      const windowMs = step.windowMs ?? this.scenario.defaultWindowMs;
      const stepElapsed = now - this.stepStartMs;
      if (stepElapsed >= windowMs) {
        this.recordMiss(step, now);
        // recordMiss calls advanceStep which calls notify
        return;
      }
    }

    this.notify();
  }

  /** Subscribe to state updates. Returns an unsubscribe function. */
  subscribe(subscriber: EngineSubscriber): () => void {
    this.subscribers.push(subscriber);
    // Emit current state immediately so subscriber can render initial state.
    subscriber(this.buildState());
    return () => {
      this.subscribers = this.subscribers.filter((s) => s !== subscriber);
    };
  }

  // ---------------------------------------------------------------------------
  // Accessors (useful for tests)
  // ---------------------------------------------------------------------------

  getPhase(): EngineState["phase"] {
    return this.phase;
  }

  getResults(): StepResult[] {
    return [...this.stepResults];
  }

  getCountdownValue(): number {
    /** Returns the current countdown number (3/2/1) or 0 when done. */
    if (this.phase !== "countdown") return 0;
    const elapsed = this.clock() - this.countdownStartMs;
    const stepIdx = Math.floor(elapsed / COUNTDOWN_STEP_MS);
    const remaining = COUNTDOWN_STEPS.length - stepIdx;
    return Math.max(0, COUNTDOWN_STEPS[Math.min(stepIdx, COUNTDOWN_STEPS.length - 1)] ?? 0);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private currentStep(): DrillStep | null {
    if (!this.scenario) return null;
    const { steps, repeat } = this.scenario;
    if (steps.length === 0) return null;

    if (repeat) {
      return steps[this.stepIndex % steps.length] ?? null;
    } else {
      if (this.stepIndex >= steps.length) return null;
      return steps[this.stepIndex] ?? null;
    }
  }

  private recordStepResult(
    step: DrillStep,
    answeredAt: number,
    correct: boolean,
    reactionMs: number,
  ): void {
    this.stepResults.push({
      stepId: step.id,
      promptedAt: this.stepStartMs,
      answeredAt,
      correct,
      reactionMs,
    });
    this.advanceStep(answeredAt);
  }

  private recordMiss(step: DrillStep, now: number): void {
    this.stepResults.push({
      stepId: step.id,
      promptedAt: this.stepStartMs,
      answeredAt: null,
      correct: false,
      reactionMs: null,
    });
    this.advanceStep(now);
  }

  private advanceStep(now: number): void {
    this.stepIndex++;
    if (!this.scenario) return;

    const elapsed = now - this.drillStartMs;

    // If not repeating and we've exhausted all steps, finish.
    if (!this.scenario.repeat && this.stepIndex >= this.scenario.steps.length) {
      this.finishDrill();
      return;
    }

    // If total duration reached, finish.
    if (this.scenario.totalDurationMs > 0 && elapsed >= this.scenario.totalDurationMs) {
      this.finishDrill();
      return;
    }

    this.stepStartMs = now;
    this.notify();
  }

  private finishDrill(): void {
    this.phase = "finished";
    this.notify();
  }

  private buildDrillResult(durationMs: number): DrillResult {
    if (!this.scenario) {
      throw new Error("Cannot build DrillResult without a loaded scenario");
    }

    // Compute target EPM: how many steps per minute at default window spacing.
    const stepsPerMinute = 60_000 / this.scenario.defaultWindowMs;
    const metrics = computeMetrics(this.stepResults, {
      durationMs: Math.max(durationMs, 1),
      defaultWindowMs: this.scenario.defaultWindowMs,
      targetEpm: stepsPerMinute,
    });

    const checkpoints: DrillCheckpoint[] = this.stepResults.map((r) => ({
      tMs: r.promptedAt - this.drillStartMs,
      ok: r.correct,
    }));

    return {
      drillType: this.scenario.id,
      startedAt: new Date().toISOString(),
      durationMs: Math.max(durationMs, 1),
      epm: metrics.epm,
      apm: metrics.apm,
      accuracy: metrics.accuracy,
      reactionMs: metrics.reactionMs,
      score: metrics.score,
      checkpoints,
    };
  }

  private buildState(): EngineState {
    const now = this.clock();
    const elapsed = this.drillStartMs > 0 ? now - this.drillStartMs : 0;
    const step = this.currentStep();
    const stepElapsed = this.stepStartMs > 0 ? now - this.stepStartMs : 0;
    const windowMs = step?.windowMs ?? this.scenario?.defaultWindowMs ?? 2000;
    const stepRemainingMs = Math.max(0, windowMs - stepElapsed);

    const correctCount = this.stepResults.filter((r) => r.correct).length;
    const totalCount = this.stepResults.length;

    let drillResult: DrillResult | null = null;
    if (this.phase === "finished" && this.scenario) {
      try {
        drillResult = this.buildDrillResult(elapsed);
      } catch {
        // Should never throw here but guard defensively.
      }
    }

    return {
      phase: this.phase,
      scenario: this.scenario,
      currentStepIndex: this.stepIndex,
      currentStep: step,
      elapsedMs: elapsed,
      stepRemainingMs,
      correctCount,
      totalCount,
      results: [...this.stepResults],
      drillResult,
    };
  }

  private notify(): void {
    const state = this.buildState();
    for (const sub of this.subscribers) {
      sub(state);
    }
  }
}

/** Exported countdown total so the UI can render the countdown bar. */
export { TOTAL_COUNTDOWN_MS, COUNTDOWN_STEP_MS };
