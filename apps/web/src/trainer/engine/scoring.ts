/**
 * Drill scoring — pure functions, no DOM/React imports.
 *
 * Metric definitions:
 *
 * APM (Actions Per Minute)
 *   Raw count of any key press during the drill, normalized to per-minute.
 *   Formula: (totalAttempts / durationMs) * 60_000
 *   Note: In WC3, raw APM includes spam. We only count step-response attempts.
 *
 * EPM (Effective Actions Per Minute)
 *   Only *correct* key presses per minute — the meaningful subset of APM.
 *   Formula: (correctCount / durationMs) * 60_000
 *   This is the metric that correlates with ladder skill; random clicking
 *   inflates APM but not EPM.
 *
 * Accuracy
 *   Fraction of prompts answered correctly in [0, 1].
 *   Formula: correctCount / totalCount  (0 if totalCount === 0)
 *
 * Mean Reaction Time (reactionMs)
 *   Average ms from prompt appearance to correct keypress across all correct
 *   answers. Miss/timeout steps are excluded (they would skew infinitely).
 *   Measures how quickly the muscle memory fires, not whether it fires.
 *
 * Score (composite, 0–1000)
 *   score = accuracy_weight * accuracy
 *         + speed_weight    * speed_factor
 *         + epm_weight      * epm_factor
 *
 *   Where:
 *     accuracy_weight = 0.50
 *     speed_weight    = 0.30  (inversely proportional to mean reaction)
 *     epm_weight      = 0.20
 *
 *   speed_factor  = clamp(1 - reactionMs / windowMs, 0, 1)
 *     — 1.0 at instant reaction, 0.0 at full window expiry
 *     — Uses the scenario defaultWindowMs as the normalization baseline.
 *
 *   epm_factor = clamp(epm / targetEpm, 0, 1)
 *     — 1.0 at or above the target EPM for the scenario.
 *     — targetEpm is the scenario's "par" (steps per window * 60 000 / window).
 *
 *   Final score is rounded to the nearest integer in [0, 1000].
 */

import type { StepResult } from "./types";

export type ScoringParams = {
  durationMs: number;
  defaultWindowMs: number;
  /** Expected EPM for a "perfect" run. Used to normalize the EPM factor. */
  targetEpm: number;
};

export type SessionMetrics = {
  epm: number;
  apm: number;
  accuracy: number;
  reactionMs: number;
  score: number;
  correctCount: number;
  totalCount: number;
};

/**
 * Compute all session metrics from the raw step results.
 * Fully deterministic — no Date.now() or side effects.
 */
export function computeMetrics(
  results: StepResult[],
  params: ScoringParams,
): SessionMetrics {
  const { durationMs, defaultWindowMs, targetEpm } = params;

  const totalCount = results.length;
  const correctCount = results.filter((r) => r.correct).length;

  // Guard against zero-duration (shouldn't happen in production but tests may
  // call with tiny values).
  const durationMinutes = Math.max(durationMs, 1) / 60_000;

  const apm = totalCount / durationMinutes;
  const epm = correctCount / durationMinutes;
  const accuracy = totalCount > 0 ? correctCount / totalCount : 0;

  // Mean reaction across correct answers only.
  const correctReactions = results
    .filter((r) => r.correct && r.reactionMs !== null)
    .map((r) => r.reactionMs as number);
  const reactionMs =
    correctReactions.length > 0
      ? correctReactions.reduce((a, b) => a + b, 0) / correctReactions.length
      : defaultWindowMs; // no correct answers → penalize with full window

  // Speed factor: 1.0 at instant response, 0.0 at window expiry.
  const speedFactor = clamp01(1 - reactionMs / defaultWindowMs);

  // EPM factor: how close to "par" EPM.
  const epmFactor = targetEpm > 0 ? clamp01(epm / targetEpm) : 0;

  // Weighted composite (weights sum to 1.0 → raw [0,1] * 1000).
  const rawScore = 0.5 * accuracy + 0.3 * speedFactor + 0.2 * epmFactor;
  const score = Math.round(rawScore * 1000);

  return { epm, apm, accuracy, reactionMs, score, correctCount, totalCount };
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
