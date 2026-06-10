/**
 * Local types for the Replay Analyzer UI.
 * ScoredProblem is NOT in shared-types yet — defined here until it graduates.
 */

import type { BenchmarkSeverity } from "@wc3-coach/shared-types";

/** One prioritized coaching problem, as returned by /benchmarks/:id/top */
export type ScoredProblem = {
  metric: string;
  severity: BenchmarkSeverity;
  score: number;
  delta: number | null;
  value: number;
  expected: number | null;
  summary: string;
};

/** Replay status as returned by api-node GET /replays/:id */
export type ReplayStatus = "pending" | "parsing" | "done" | "error";

/** Shape of GET /replays/:id response */
export type ReplayResponse = {
  replayId: string;
  status: ReplayStatus;
  mapId: string | null;
  durationMs: number | null;
  winnerSlot: number | null;
  patchId: string | null;
  players: Array<{
    slot: number;
    playerName: string;
    raceId: string;
    apm: number;
    result: "win" | "loss" | "unknown";
  }>;
  events: Array<{
    id: string;
    slot: number;
    tMs: number;
    type: string;
    entityRef: string;
    payload: Record<string, unknown>;
  }>;
};

/** POST /replays response */
export type UploadResponse = {
  replayId: string;
  status: ReplayStatus;
  deduplicated: boolean;
};
