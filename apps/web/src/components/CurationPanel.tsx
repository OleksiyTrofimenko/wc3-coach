"use client";

/**
 * CurationPanel — capture the IDEAL coaching for a replay (training example).
 *
 * Flow: "Draft from facts" assembles the exact coach prompt and seeds tips from
 * the deterministic deviation summaries. You then rewrite them into the ideal
 * coaching a great coach would give for THIS game's facts, and Approve. Approved
 * examples export as JSONL for fine-tuning. We seed from facts, never from the
 * LLM's own output (Principle #4 — teach phrasing, not invented facts).
 */

import { useCallback, useEffect, useState } from "react";
import type { GoldTip, TrainingExample } from "@/types/curation";
import { draftExample, getExample, saveExample } from "@/lib/api";

function factsFromMessages(ex: TrainingExample): string {
  const user = ex.inputMessages.find((m) => m.role === "user");
  return user?.content ?? "(no prompt captured)";
}

export function CurationPanel({ replayId }: { replayId: string }) {
  const [example, setExample] = useState<TrainingExample | null>(null);
  const [tips, setTips] = useState<GoldTip[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFacts, setShowFacts] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const ex = await getExample(replayId);
      setExample(ex);
      setTips(ex?.outputTips ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [replayId]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = useCallback(async (fn: () => Promise<TrainingExample>) => {
    setBusy(true);
    setError(null);
    try {
      const ex = await fn();
      setExample(ex);
      setTips(ex.outputTips);
      setSavedAt(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }, []);

  const updateTip = (i: number, patch: Partial<GoldTip>) =>
    setTips((ts) => ts.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const removeTip = (i: number) =>
    setTips((ts) => ts.filter((_, j) => j !== i));
  const addTip = () =>
    setTips((ts) => [
      ...ts,
      { priority: ts.length + 1, title: "", detail: "" },
    ]);

  const persist = (status: "draft" | "approved") => {
    const normalized = tips.map((t, i) => ({ ...t, priority: i + 1 }));
    void run(() =>
      saveExample(replayId, { outputTips: normalized, status })
    );
  };

  return (
    <div className="cp wc3-panel-elevated">
      <div className="cp-head">
        <h2 className="wc3-heading cp-title">Curate Ideal Coaching</h2>
        {example && (
          <span className={`cp-status cp-status--${example.status}`}>
            {example.status}
          </span>
        )}
      </div>
      <p className="cp-sub">
        Write the coaching a great coach would give for this game&apos;s facts.
        This becomes a training example for the local model — teach phrasing and
        prioritisation, grounded in the captured FACTS.
      </p>

      {error && <div className="cp-err">{error}</div>}

      {loading ? (
        <div className="cp-muted">Loading…</div>
      ) : !example ? (
        <button
          className="btn-action"
          disabled={busy}
          onClick={() => void run(() => draftExample(replayId))}
        >
          {busy ? "Drafting…" : "Draft from facts"}
        </button>
      ) : (
        <>
          {/* Captured FACTS context */}
          <button
            className="cp-facts-toggle"
            onClick={() => setShowFacts((s) => !s)}
          >
            {showFacts ? "▾" : "▸"} Captured prompt (FACTS the model sees)
          </button>
          {showFacts && <pre className="cp-facts">{factsFromMessages(example)}</pre>}

          {/* Editable tips */}
          <div className="cp-tips">
            {tips.map((t, i) => (
              <div className="cp-tip" key={i}>
                <span className="cp-tip__n">{i + 1}</span>
                <div className="cp-tip__fields">
                  <input
                    className="cp-input"
                    placeholder="Tip title"
                    value={t.title}
                    onChange={(e) => updateTip(i, { title: e.target.value })}
                  />
                  <textarea
                    className="cp-input cp-textarea"
                    placeholder="Ideal coaching detail — what, why, when (grounded in the FACTS)"
                    value={t.detail}
                    rows={2}
                    onChange={(e) => updateTip(i, { detail: e.target.value })}
                  />
                </div>
                <button
                  className="btn-ghost cp-rm"
                  onClick={() => removeTip(i)}
                  title="Remove tip"
                >
                  ✕
                </button>
              </div>
            ))}
            <button className="btn-ghost" onClick={addTip}>
              + Add tip
            </button>
          </div>

          {/* Actions */}
          <div className="cp-actions">
            <button
              className="btn-action"
              disabled={busy}
              onClick={() => persist("draft")}
            >
              Save draft
            </button>
            <button
              className="btn-action cp-approve"
              disabled={busy || tips.length < 3 || tips.some((t) => !t.title || !t.detail)}
              title={
                tips.length < 3
                  ? "Need at least 3 complete tips to approve"
                  : "Approve for the training set"
              }
              onClick={() => persist("approved")}
            >
              Approve for training set
            </button>
            {savedAt && <span className="cp-saved">saved {savedAt}</span>}
          </div>
        </>
      )}

      <style>{`
        .cp { padding: 1.25rem 1.5rem; }
        .cp-head { display: flex; align-items: center; gap: 0.75rem; }
        .cp-title { font-size: 1.05rem; }
        .cp-status { font-size: 0.62rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; padding: 2px 7px; border-radius: 2px; }
        .cp-status--draft { background: var(--bg-raised); color: var(--text-muted); border: 1px solid var(--border-dim); }
        .cp-status--approved { background: rgba(34,197,94,0.14); color: #22c55e; border: 1px solid rgba(34,197,94,0.3); }
        .cp-sub { font-size: 0.8rem; color: var(--text-muted); line-height: 1.5; margin: 0.4rem 0 0.9rem; }
        .cp-err { padding: 0.5rem 0.8rem; border: 1px solid rgba(220,38,38,0.4); color: #fca5a5; border-radius: 3px; font-size: 0.8rem; margin-bottom: 0.75rem; }
        .cp-muted { font-size: 0.85rem; color: var(--text-muted); }

        .cp-facts-toggle { background: transparent; border: none; color: var(--gold-dim); font-size: 0.75rem; cursor: pointer; padding: 0; margin-bottom: 0.5rem; }
        .cp-facts { background: var(--bg-void); border: 1px solid var(--border-dim); border-radius: 3px; padding: 0.75rem; font-size: 0.7rem; color: var(--text-secondary); white-space: pre-wrap; max-height: 280px; overflow-y: auto; margin-bottom: 0.9rem; line-height: 1.45; }

        .cp-tips { display: flex; flex-direction: column; gap: 0.6rem; margin-bottom: 0.9rem; }
        .cp-tip { display: grid; grid-template-columns: 22px 1fr auto; gap: 0.6rem; align-items: start; }
        .cp-tip__n { display: flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--gold); color: var(--gold-light); font-size: 0.7rem; font-weight: 700; margin-top: 0.3rem; }
        .cp-tip__fields { display: flex; flex-direction: column; gap: 0.35rem; min-width: 0; }
        .cp-input { width: 100%; padding: 0.4rem 0.55rem; background: var(--bg-void); border: 1px solid var(--border-dim); border-radius: 3px; color: var(--text-primary); font-size: 0.82rem; font-family: inherit; }
        .cp-input:focus { outline: none; border-color: var(--border-gold-bright); }
        .cp-textarea { resize: vertical; line-height: 1.45; }
        .cp-rm { padding: 0.2rem 0.45rem; margin-top: 0.3rem; }

        .cp-actions { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
        .btn-action { padding: 0.45rem 1.1rem; background: transparent; border: 1px solid var(--border-gold-bright); border-radius: 3px; color: var(--gold); font-size: 0.8rem; font-weight: 600; letter-spacing: 0.04em; cursor: pointer; }
        .btn-action:hover:not(:disabled) { background: rgba(200,151,42,0.1); }
        .btn-action:disabled { opacity: 0.4; cursor: not-allowed; }
        .cp-approve { border-color: rgba(34,197,94,0.4); color: #22c55e; }
        .cp-approve:hover:not(:disabled) { background: rgba(34,197,94,0.1); }
        .btn-ghost { padding: 0.3rem 0.6rem; background: transparent; border: 1px solid var(--border-dim); border-radius: 3px; color: var(--text-secondary); font-size: 0.75rem; cursor: pointer; }
        .btn-ghost:hover { border-color: var(--border-gold-bright); color: var(--gold); }
        .cp-saved { font-size: 0.7rem; color: var(--text-muted); }
      `}</style>
    </div>
  );
}
