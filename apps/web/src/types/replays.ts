/**
 * Types for the replays browser (GET /replays) — mirrors api-py
 * app/replays/routes.py ReplaySummary.
 */

export type PlayerLite = {
  slot: number;
  playerName: string;
  raceId: string;
  result: "win" | "loss" | "unknown";
};

export type ReplaySummary = {
  replayId: string;
  matchup: string;
  durationMs: number | null;
  status: "pending" | "parsing" | "done" | "error";
  isReference: boolean;
  players: PlayerLite[];
  hasReport: boolean;
  hasExample: boolean;
  exampleStatus: "draft" | "approved" | null;
  createdAt: string;
};
