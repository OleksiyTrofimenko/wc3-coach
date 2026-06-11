/**
 * API client — all calls go through the Next.js rewrites (same-origin).
 * /api/node/* → api-node at 8787
 * /api/py/*   → api-py  at 8001
 */

import type { BenchmarkResult, CoachReport } from "@wc3-coach/shared-types";
import type {
  UploadResponse,
  ReplayResponse,
  ScoredProblem,
} from "@/types/analyzer";

/** Upload a .w3g file. Returns replayId + initial status. */
export async function uploadReplay(file: File): Promise<UploadResponse> {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch("/api/node/replays", {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<UploadResponse>;
}

/** Poll replay status + data until done or error. */
export async function getReplay(replayId: string): Promise<ReplayResponse> {
  const res = await fetch(`/api/node/replays/${replayId}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Replay fetch failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<ReplayResponse>;
}

/** Run benchmarks (idempotent). Returns BenchmarkResult[]. */
export async function runBenchmarks(
  replayId: string
): Promise<BenchmarkResult[]> {
  const res = await fetch(`/api/py/benchmarks/${replayId}/run`, {
    method: "POST",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Benchmark run failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<BenchmarkResult[]>;
}

/** Get top coaching problems for the Orc slot. */
export async function getTopProblems(
  replayId: string,
  orcSlot: number,
  topN = 5
): Promise<ScoredProblem[]> {
  const res = await fetch(
    `/api/py/benchmarks/${replayId}/top?orc_slot=${orcSlot}&top_n=${topN}`
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Top problems fetch failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<ScoredProblem[]>;
}

/**
 * Run the LLM coach for a replay and return the CoachReport.
 * This call is idempotent (safe to re-run) but slow — the local LLM
 * (qwen2.5:14b or similar) may take 5–30 seconds.
 * Throws on 404 (unknown replay) or 503 (Ollama unreachable).
 */
export async function runCoachReport(replayId: string): Promise<CoachReport> {
  const res = await fetch(`/api/py/coach/${replayId}/run`, {
    method: "POST",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Coach report failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<CoachReport>;
}
