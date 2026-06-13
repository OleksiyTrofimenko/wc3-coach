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
  ReportSummary,
  FeedbackRequest,
  TipFeedback,
} from "@/types/analyzer";
import type {
  BenchmarkReference,
  ReferenceCreate,
  ReferenceUpdate,
} from "@/types/admin";

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

// ---------------------------------------------------------------------------
// Coach history & feedback (T6 — Director: review/feedback UI)
// ---------------------------------------------------------------------------

/**
 * Fetch the analyzed-replay history.
 * Returns ReportSummary[] newest-first from GET /coach.
 */
export async function getCoachHistory(): Promise<ReportSummary[]> {
  const res = await fetch("/api/py/coach");
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`History fetch failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<ReportSummary[]>;
}

/**
 * Fetch the full CoachReport for a single replay.
 * Returns null on 404 (report not yet generated).
 */
export async function getCoachReportById(
  replayId: string
): Promise<CoachReport | null> {
  const res = await fetch(`/api/py/coach/${replayId}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Coach report fetch failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<CoachReport>;
}

/**
 * Submit feedback for a single tip (or whole-report feedback when tipPriority is null).
 * Returns the created TipFeedback row.
 */
export async function submitFeedback(
  replayId: string,
  body: FeedbackRequest
): Promise<TipFeedback> {
  const res = await fetch(`/api/py/coach/${replayId}/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Feedback submit failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<TipFeedback>;
}

/**
 * Fetch all feedback rows for a replay, newest-first.
 */
export async function getReplayFeedback(
  replayId: string
): Promise<TipFeedback[]> {
  const res = await fetch(`/api/py/coach/${replayId}/feedback`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Feedback fetch failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<TipFeedback[]>;
}

// ---------------------------------------------------------------------------
// Admin — benchmark reference CRUD (DB-backed references)
// ---------------------------------------------------------------------------

/** List all benchmark reference rows (admin panel). */
export async function listReferences(): Promise<BenchmarkReference[]> {
  const res = await fetch("/api/py/admin/references");
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`References fetch failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<BenchmarkReference[]>;
}

/** Create a new benchmark reference row. Throws on 409 (duplicate key). */
export async function createReference(
  body: ReferenceCreate
): Promise<BenchmarkReference> {
  const res = await fetch("/api/py/admin/references", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Reference create failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<BenchmarkReference>;
}

/** Update the editable fields of a benchmark reference row. */
export async function updateReference(
  id: string,
  body: ReferenceUpdate
): Promise<BenchmarkReference> {
  const res = await fetch(`/api/py/admin/references/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Reference update failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<BenchmarkReference>;
}

/** Delete a benchmark reference row. */
export async function deleteReference(id: string): Promise<void> {
  const res = await fetch(`/api/py/admin/references/${id}`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 204) {
    const text = await res.text();
    throw new Error(`Reference delete failed (${res.status}): ${text}`);
  }
}
