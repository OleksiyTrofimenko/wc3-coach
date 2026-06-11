/**
 * Unit tests for the drill engine core (T4.1).
 *
 * All tests use a manual clock (fake time) so there is no Date.now() dependency.
 * The tests cover:
 *   - State machine transitions (idle → countdown → running → finished)
 *   - Correct keypress handling and step advancement
 *   - Miss (timeout) detection via tick()
 *   - Repeat mode cycling
 *   - Scoring / metric computation (computeMetrics)
 *   - matchesCombo edge cases
 *   - DrillResult shape produced at session end
 */

import { describe, it, expect, beforeEach } from "vitest";
import { DrillEngine } from "../src/trainer/engine/DrillEngine";
import { computeMetrics } from "../src/trainer/engine/scoring";
import { matchesCombo, keyComboLabel } from "../src/trainer/engine/types";
import type { DrillScenario, StepResult } from "../src/trainer/engine/types";
import type { EngineState } from "../src/trainer/engine/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal 3-step scenario for testing. */
function makeScenario(overrides?: Partial<DrillScenario>): DrillScenario {
  return {
    id: "test:hotkey",
    title: "Test Hotkey Drill",
    description: "For unit tests",
    category: "hotkey",
    defaultWindowMs: 2000,
    totalDurationMs: 0, // run-once mode (each step exactly once)
    repeat: false,
    steps: [
      { id: "s1", prompt: "Press Ctrl+1", target: { key: "1", ctrl: true } },
      { id: "s2", prompt: "Press A",       target: { key: "a" } },
      { id: "s3", prompt: "Press Shift+1", target: { key: "1", shift: true } },
    ],
    ...overrides,
  };
}

/** A fake clock. Call advance(ms) to move time forward. */
function makeClock() {
  let t = 0;
  return {
    now: () => t,
    advance: (ms: number) => { t += ms; },
    set: (ms: number) => { t = ms; },
  };
}

// ---------------------------------------------------------------------------
// matchesCombo
// ---------------------------------------------------------------------------

describe("matchesCombo", () => {
  it("matches exact key (lowercase input)", () => {
    expect(matchesCombo({ key: "a" }, "a", false, false, false)).toBe(true);
  });

  it("matches case-insensitively", () => {
    expect(matchesCombo({ key: "a" }, "A", false, false, false)).toBe(true);
  });

  it("requires ctrl modifier", () => {
    expect(matchesCombo({ key: "1", ctrl: true }, "1", false, false, false)).toBe(false);
    expect(matchesCombo({ key: "1", ctrl: true }, "1", true,  false, false)).toBe(true);
  });

  it("requires shift modifier", () => {
    expect(matchesCombo({ key: "1", shift: true }, "1", false, false, false)).toBe(false);
    expect(matchesCombo({ key: "1", shift: true }, "1", false, true,  false)).toBe(true);
  });

  it("rejects extra modifier (ctrl pressed when not required)", () => {
    expect(matchesCombo({ key: "a" }, "a", true, false, false)).toBe(false);
  });

  it("matches named key F2", () => {
    expect(matchesCombo({ key: "F2" }, "F2", false, false, false)).toBe(true);
    expect(matchesCombo({ key: "F2" }, "f2", false, false, false)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// keyComboLabel
// ---------------------------------------------------------------------------

describe("keyComboLabel", () => {
  it("single key", () => {
    expect(keyComboLabel({ key: "a" })).toBe("A");
  });

  it("Ctrl+digit", () => {
    expect(keyComboLabel({ key: "1", ctrl: true })).toBe("Ctrl+1");
  });

  it("Ctrl+Shift+key", () => {
    expect(keyComboLabel({ key: "z", ctrl: true, shift: true })).toBe("Ctrl+Shift+Z");
  });

  it("named key F2", () => {
    expect(keyComboLabel({ key: "F2" })).toBe("F2");
  });
});

// ---------------------------------------------------------------------------
// DrillEngine — state machine
// ---------------------------------------------------------------------------

describe("DrillEngine state machine", () => {
  let clock: ReturnType<typeof makeClock>;
  let engine: DrillEngine;

  beforeEach(() => {
    clock = makeClock();
    engine = new DrillEngine(clock.now);
  });

  it("starts in idle phase", () => {
    expect(engine.getPhase()).toBe("idle");
  });

  it("load() keeps idle phase and resets step index", () => {
    engine.load(makeScenario());
    expect(engine.getPhase()).toBe("idle");
    expect(engine.getResults()).toHaveLength(0);
  });

  it("start() moves to countdown", () => {
    engine.load(makeScenario());
    engine.start();
    expect(engine.getPhase()).toBe("countdown");
  });

  it("tick() during countdown at t=0 stays in countdown", () => {
    engine.load(makeScenario());
    engine.start();
    clock.advance(100);
    engine.tick();
    expect(engine.getPhase()).toBe("countdown");
  });

  it("tick() after countdown completes moves to running", () => {
    engine.load(makeScenario());
    engine.start();
    clock.advance(2400); // 3 * 800ms countdown
    engine.tick();
    expect(engine.getPhase()).toBe("running");
  });

  it("handleKey() in idle returns false (not consumed)", () => {
    engine.load(makeScenario());
    const consumed = engine.handleKey("1", true, false, false);
    expect(consumed).toBe(false);
  });

  it("handleKey() in running with correct key returns true and records correct result", () => {
    engine.load(makeScenario());
    engine.start();
    clock.advance(2400);
    engine.tick(); // now running

    const consumed = engine.handleKey("1", true, false, false); // Ctrl+1 = step s1
    expect(consumed).toBe(true);
    const results = engine.getResults();
    expect(results).toHaveLength(1);
    expect(results[0]?.correct).toBe(true);
    expect(results[0]?.stepId).toBe("s1");
  });

  it("handleKey() with wrong key records incorrect result", () => {
    engine.load(makeScenario());
    engine.start();
    clock.advance(2400);
    engine.tick(); // running

    engine.handleKey("z", false, false, false); // wrong key
    const results = engine.getResults();
    expect(results[0]?.correct).toBe(false);
    expect(results[0]?.reactionMs).toBeGreaterThanOrEqual(0);
  });

  it("tick() after step window expires records a miss", () => {
    engine.load(makeScenario()); // defaultWindowMs = 2000
    engine.start();
    clock.advance(2400);
    engine.tick(); // running, stepStartMs = 2400

    // Advance past the 2000ms window for the current step
    clock.advance(2100);
    engine.tick(); // should record miss and advance

    const results = engine.getResults();
    expect(results).toHaveLength(1);
    expect(results[0]?.correct).toBe(false);
    expect(results[0]?.answeredAt).toBeNull();
    expect(results[0]?.reactionMs).toBeNull();
  });

  it("finishes after all steps exhausted (repeat:false)", () => {
    engine.load(makeScenario());
    engine.start();
    clock.advance(2400);
    engine.tick(); // running

    // Answer all 3 steps correctly
    engine.handleKey("1", true, false, false); // s1: Ctrl+1
    engine.handleKey("a", false, false, false); // s2: A
    engine.handleKey("1", false, true, false); // s3: Shift+1

    expect(engine.getPhase()).toBe("finished");
    expect(engine.getResults()).toHaveLength(3);
  });

  it("produces a DrillResult in state when finished", () => {
    engine.load(makeScenario());
    engine.start();
    clock.advance(2400);
    engine.tick();

    engine.handleKey("1", true, false, false);
    engine.handleKey("a", false, false, false);
    engine.handleKey("1", false, true, false);

    const states: EngineState[] = [];
    // subscribe captures current state immediately
    engine.subscribe((s) => states.push(s));

    const lastState = states[states.length - 1]!;
    expect(lastState.phase).toBe("finished");
    expect(lastState.drillResult).not.toBeNull();
    expect(lastState.drillResult!.drillType).toBe("test:hotkey");
    expect(lastState.drillResult!.accuracy).toBe(1); // all correct
    expect(lastState.drillResult!.epm).toBeGreaterThan(0);
  });

  it("reset() from finished returns to idle", () => {
    engine.load(makeScenario());
    engine.start();
    clock.advance(2400);
    engine.tick();

    engine.handleKey("1", true, false, false);
    engine.handleKey("a", false, false, false);
    engine.handleKey("1", false, true, false);
    expect(engine.getPhase()).toBe("finished");

    engine.reset();
    expect(engine.getPhase()).toBe("idle");
    expect(engine.getResults()).toHaveLength(0);
  });

  it("repeat mode cycles steps and runs until totalDurationMs", () => {
    const scenario = makeScenario({
      repeat: true,
      totalDurationMs: 5000,
      steps: [
        { id: "s1", prompt: "Press A", target: { key: "a" } },
        { id: "s2", prompt: "Press B", target: { key: "b" } },
      ],
    });
    engine.load(scenario);
    engine.start();
    clock.advance(2400);
    engine.tick(); // running

    // Answer step s1 (A)
    clock.advance(300);
    engine.handleKey("a", false, false, false);
    expect(engine.getPhase()).toBe("running"); // not done yet — totalDurationMs = 5000

    // Answer step s2 (B)
    clock.advance(300);
    engine.handleKey("b", false, false, false);
    // Still running — cycles back to s1

    // Answer step s1 again (repeat)
    clock.advance(300);
    engine.handleKey("a", false, false, false);

    // Advance past totalDurationMs — tick() should end the drill
    clock.advance(3000); // now elapsed = 2400 countdown not counted + 300+300+300+3000 = ~4000ms from drillStart
    // Actually let's push beyond 5000ms from drillStart
    clock.advance(1500);
    engine.tick();

    expect(engine.getPhase()).toBe("finished");
    // At least 3 results recorded
    expect(engine.getResults().length).toBeGreaterThanOrEqual(3);
  });

  it("subscribe gets called on each state change", () => {
    const callCount = { n: 0 };
    engine.load(makeScenario());
    engine.subscribe(() => { callCount.n++; });
    const initialCount = callCount.n; // emitted immediately on subscribe

    engine.start(); // +1
    clock.advance(2400);
    engine.tick(); // +1 (transition to running)

    expect(callCount.n).toBeGreaterThan(initialCount + 1);
  });
});

// ---------------------------------------------------------------------------
// computeMetrics — scoring
// ---------------------------------------------------------------------------

describe("computeMetrics", () => {
  it("all correct, fast reactions → high score", () => {
    const results: StepResult[] = [
      { stepId: "s1", promptedAt: 0,    answeredAt: 300,  correct: true,  reactionMs: 300 },
      { stepId: "s2", promptedAt: 2000, answeredAt: 2200, correct: true,  reactionMs: 200 },
      { stepId: "s3", promptedAt: 4000, answeredAt: 4350, correct: true,  reactionMs: 350 },
    ];
    const metrics = computeMetrics(results, {
      durationMs: 6000,
      defaultWindowMs: 2000,
      targetEpm: 30,
    });
    expect(metrics.accuracy).toBe(1);
    expect(metrics.correctCount).toBe(3);
    expect(metrics.totalCount).toBe(3);
    expect(metrics.score).toBeGreaterThan(700); // high score for perfect accuracy + fast reactions
    expect(metrics.reactionMs).toBeCloseTo((300 + 200 + 350) / 3, 1);
  });

  it("all misses → score 0, epm 0, accuracy 0", () => {
    const results: StepResult[] = [
      { stepId: "s1", promptedAt: 0,    answeredAt: null, correct: false, reactionMs: null },
      { stepId: "s2", promptedAt: 2000, answeredAt: null, correct: false, reactionMs: null },
    ];
    const metrics = computeMetrics(results, {
      durationMs: 4000,
      defaultWindowMs: 2000,
      targetEpm: 30,
    });
    expect(metrics.accuracy).toBe(0);
    expect(metrics.epm).toBe(0);
    expect(metrics.score).toBe(0);
  });

  it("partial accuracy → partial score", () => {
    const results: StepResult[] = [
      { stepId: "s1", promptedAt: 0,    answeredAt: 500,  correct: true,  reactionMs: 500 },
      { stepId: "s2", promptedAt: 2000, answeredAt: null, correct: false, reactionMs: null },
    ];
    const metrics = computeMetrics(results, {
      durationMs: 4000,
      defaultWindowMs: 2000,
      targetEpm: 30,
    });
    expect(metrics.accuracy).toBe(0.5);
    expect(metrics.score).toBeGreaterThan(0);
    expect(metrics.score).toBeLessThan(1000);
  });

  it("APM >= EPM always", () => {
    const results: StepResult[] = [
      { stepId: "s1", promptedAt: 0,    answeredAt: 400,  correct: true,  reactionMs: 400 },
      { stepId: "s2", promptedAt: 2000, answeredAt: 2100, correct: false, reactionMs: 100 },
    ];
    const metrics = computeMetrics(results, {
      durationMs: 4000,
      defaultWindowMs: 2000,
      targetEpm: 30,
    });
    expect(metrics.apm).toBeGreaterThanOrEqual(metrics.epm);
  });

  it("score is integer in [0, 1000]", () => {
    for (let i = 0; i <= 10; i++) {
      const correct = i % 2 === 0;
      const results: StepResult[] = Array.from({ length: 10 }, (_, j) => ({
        stepId: `s${j}`,
        promptedAt: j * 2000,
        answeredAt: correct ? j * 2000 + 500 : null,
        correct,
        reactionMs: correct ? 500 : null,
      }));
      const metrics = computeMetrics(results, {
        durationMs: 20000,
        defaultWindowMs: 2000,
        targetEpm: 30,
      });
      expect(metrics.score).toBeGreaterThanOrEqual(0);
      expect(metrics.score).toBeLessThanOrEqual(1000);
      expect(Number.isInteger(metrics.score)).toBe(true);
    }
  });

  it("zero duration does not throw or produce NaN", () => {
    const results: StepResult[] = [
      { stepId: "s1", promptedAt: 0, answeredAt: 0, correct: true, reactionMs: 0 },
    ];
    const metrics = computeMetrics(results, {
      durationMs: 0,
      defaultWindowMs: 2000,
      targetEpm: 30,
    });
    expect(Number.isFinite(metrics.epm)).toBe(true);
    expect(Number.isFinite(metrics.score)).toBe(true);
  });
});
