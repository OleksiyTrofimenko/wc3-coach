/**
 * Types for the curation pipeline (training-example capture).
 * Mirror api-py app/curation/models.py.
 */

export type ExampleStatus = "draft" | "approved";

export type GoldTip = {
  priority: number;
  title: string;
  detail: string;
  tMs?: number | null;
  relatedBenchmarks?: string[] | null;
};

export type ChatMessage = { role: string; content: string };

export type TrainingExample = {
  replayId: string;
  matchup: string | null;
  mapName: string | null;
  result: string | null;
  inputMessages: ChatMessage[];
  outputTips: GoldTip[];
  status: ExampleStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ExampleUpdate = {
  outputTips: GoldTip[];
  status: ExampleStatus;
  notes?: string | null;
};

export type ExampleSummary = {
  replayId: string;
  matchup: string | null;
  mapName: string | null;
  result: string | null;
  status: ExampleStatus;
  tipCount: number;
  updatedAt: string;
};
