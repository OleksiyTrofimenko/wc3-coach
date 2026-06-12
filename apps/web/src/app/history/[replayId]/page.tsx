"use client";

/**
 * /history/[replayId] — Full coach report + tip feedback
 *
 * Shows the CoachReport for a specific replay (GET /coach/{id}), renders
 * each tip with the existing CoachReport component styling, and adds a
 * TipFeedbackControl under each tip plus a report-level feedback control
 * at the bottom.
 *
 * Existing feedback is loaded from GET /coach/{id}/feedback on mount and
 * updated optimistically on each submission.
 */

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import type { CoachReport, CoachTip } from "@wc3-coach/shared-types";
import type { TipFeedback } from "@/types/analyzer";
import { getCoachReportById, getReplayFeedback } from "@/lib/api";
import { TipFeedbackControl } from "@/components/TipFeedbackControl";
import { formatMs, humanizeRef } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LoadState =
  | { kind: "loading" }
  | { kind: "loaded"; report: CoachReport; feedback: TipFeedback[] }
  | { kind: "not-found" }
  | { kind: "error"; message: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Tip card with feedback control
// ---------------------------------------------------------------------------

interface TipCardWithFeedbackProps {
  tip: CoachTip;
  index: number;
  replayId: string;
  /** Existing feedback rows that match this tip's priority. */
  feedbackForTip: TipFeedback[];
  onFeedbackSubmitted: (row: TipFeedback) => void;
}

function TipCardWithFeedback({
  tip,
  index,
  replayId,
  feedbackForTip,
  onFeedbackSubmitted,
}: TipCardWithFeedbackProps) {
  return (
    <div className="tip-card-fb">
      {/* Header row */}
      <div className="tip-card__header">
        <span className="tip-priority" aria-label={`Priority ${tip.priority}`}>
          {index + 1}
        </span>
        <h3 className="tip-title">{tip.title}</h3>
        {tip.tMs !== undefined && (
          <span className="tip-timestamp" title={`Occurs at ${formatMs(tip.tMs)}`}>
            @ {formatMs(tip.tMs)}
          </span>
        )}
      </div>

      {/* Prose */}
      <p className="tip-detail">{tip.detail}</p>

      {/* Related benchmark chips */}
      {tip.relatedBenchmarks && tip.relatedBenchmarks.length > 0 && (
        <div className="tip-chips">
          {tip.relatedBenchmarks.map((ref) => (
            <span key={ref} className="tip-chip">
              {humanizeRef(`x:${ref}`)}
            </span>
          ))}
        </div>
      )}

      {/* Feedback control for this tip */}
      <TipFeedbackControl
        replayId={replayId}
        tipPriority={tip.priority}
        label={`Flag Tip ${index + 1}`}
        existing={feedbackForTip}
        onSubmitted={onFeedbackSubmitted}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ReplayReportPage() {
  const params = useParams();
  const router = useRouter();
  const replayId = typeof params.replayId === "string" ? params.replayId : "";

  const [loadState, setLoadState] = useState<LoadState>({ kind: "loading" });

  const load = useCallback(async () => {
    if (!replayId) return;
    setLoadState({ kind: "loading" });
    try {
      const [report, feedback] = await Promise.all([
        getCoachReportById(replayId),
        getReplayFeedback(replayId),
      ]);
      if (report === null) {
        setLoadState({ kind: "not-found" });
      } else {
        setLoadState({ kind: "loaded", report, feedback });
      }
    } catch (err) {
      setLoadState({
        kind: "error",
        message: err instanceof Error ? err.message : "Failed to load report",
      });
    }
  }, [replayId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Optimistically add a newly submitted feedback row to state. */
  const handleFeedbackSubmitted = useCallback((row: TipFeedback) => {
    setLoadState((prev) => {
      if (prev.kind !== "loaded") return prev;
      return {
        ...prev,
        feedback: [row, ...prev.feedback],
      };
    });
  }, []);

  return (
    <main className="page">
      {/* Header */}
      <header className="page-header">
        <div className="header-inner">
          <h1 className="site-title wc3-heading">WC3 Coach</h1>
          <span className="site-sub">Report Review</span>
          <nav className="site-nav">
            <a href="/" className="nav-link">Analyzer</a>
            <span className="nav-sep">|</span>
            <a href="/history" className="nav-link nav-link--active">History</a>
            <span className="nav-sep">|</span>
            <a href="/trainer" className="nav-link">APM Trainer</a>
          </nav>
        </div>
      </header>

      <div className="page-body">
        {/* Back link */}
        <div className="rr-back">
          <button className="rr-back-btn" onClick={() => router.push("/history")}>
            &larr; All replays
          </button>
        </div>

        {/* Loading */}
        {loadState.kind === "loading" && (
          <section className="section">
            <div className="rr-loading wc3-panel">
              <span className="rr-spinner" aria-hidden="true" />
              <span>Loading report...</span>
            </div>
          </section>
        )}

        {/* Not found */}
        {loadState.kind === "not-found" && (
          <section className="section">
            <div className="rr-notice wc3-panel">
              <span className="rr-notice__icon">?</span>
              <div>
                <p className="rr-notice__title">Report not found</p>
                <p className="rr-notice__sub">
                  No coaching report exists for this replay. It may not have been
                  run through the coach yet.
                </p>
              </div>
              <a href="/" className="btn-action">Go to Analyzer</a>
            </div>
          </section>
        )}

        {/* Error */}
        {loadState.kind === "error" && (
          <section className="section">
            <div className="rr-error wc3-panel">
              <span className="rr-error__icon">!</span>
              <div>
                <p className="rr-error__title">Failed to load report</p>
                <p className="rr-error__msg">{loadState.message}</p>
              </div>
              <button className="btn-action" onClick={() => void load()}>
                Retry
              </button>
            </div>
          </section>
        )}

        {/* Report */}
        {loadState.kind === "loaded" && (
          <>
            {/* Report header panel */}
            <section className="section">
              <div className="rr-header-panel wc3-panel-elevated">
                <div className="rr-header-panel__left">
                  <div className="rr-header-panel__row">
                    <h2 className="wc3-heading rr-matchup">
                      {loadState.report.matchup}
                    </h2>
                    <span
                      className={`cr-result cr-result--${loadState.report.result}`}
                    >
                      {loadState.report.result.toUpperCase()}
                    </span>
                  </div>
                  <div className="rr-header-panel__row rr-header-panel__row--sub">
                    <span className="rr-map">{loadState.report.mapName}</span>
                    <span className="rr-duration">
                      {formatMs(loadState.report.durationMs)}
                    </span>
                  </div>
                </div>
                <div className="rr-header-panel__right">
                  <span className="rr-replay-id" title="Replay ID">
                    {loadState.report.replayId.slice(0, 8)}&hellip;
                  </span>
                </div>
              </div>
            </section>

            {/* Tips with feedback controls */}
            <section className="section">
              <div className="rr-tips-label">
                <span className="wc3-heading" style={{ fontSize: "0.95rem" }}>
                  Coach Tips
                </span>
                <span className="rr-tips-hint">
                  Flag any tip that is wrong, partially right, or unclear.
                </span>
              </div>

              <div className="rr-tips-list">
                {loadState.report.tips.map((tip, i) => {
                  const feedbackForTip = loadState.feedback.filter(
                    (f) => f.tipPriority === tip.priority
                  );
                  return (
                    <TipCardWithFeedback
                      key={tip.priority}
                      tip={tip}
                      index={i}
                      replayId={replayId}
                      feedbackForTip={feedbackForTip}
                      onFeedbackSubmitted={handleFeedbackSubmitted}
                    />
                  );
                })}
              </div>
            </section>

            {/* Report-level feedback */}
            <section className="section">
              <div className="rr-report-fb wc3-panel">
                <div className="rr-report-fb__header">
                  <h3 className="wc3-heading" style={{ fontSize: "0.9rem" }}>
                    Overall Report Feedback
                  </h3>
                  <p className="rr-report-fb__sub">
                    Flag the report as a whole — wrong priorities, off-matchup
                    advice, tone, etc.
                  </p>
                </div>
                <TipFeedbackControl
                  replayId={replayId}
                  tipPriority={null}
                  label="Flag this report"
                  existing={loadState.feedback.filter(
                    (f) => f.tipPriority === null
                  )}
                  onSubmitted={handleFeedbackSubmitted}
                />
              </div>
            </section>

            {/* Footer */}
            <section className="section">
              <p className="rr-footer">
                Coaching synthesized by the local LLM from deterministic benchmark
                deviations and the strategy corpus. Flagged tips feed future prompt
                improvements.
              </p>
            </section>
          </>
        )}
      </div>

      <style>{`
        .page {
          min-height: 100vh;
          background:
            radial-gradient(ellipse 80% 50% at 50% -10%, rgba(200,151,42,0.06) 0%, transparent 70%),
            var(--bg-base);
        }
        .page-header {
          border-bottom: 1px solid var(--border-gold);
          background: var(--bg-void);
          padding: 0 1.5rem;
          position: sticky;
          top: 0;
          z-index: 10;
          box-shadow: 0 2px 12px rgba(0,0,0,0.8);
        }
        .header-inner {
          max-width: 760px;
          margin: 0 auto;
          padding: 0.75rem 0;
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        .site-title { font-size: 1.25rem; }
        .site-sub {
          font-size: 0.75rem;
          color: var(--text-muted);
          letter-spacing: 0.04em;
        }
        .site-nav {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-left: auto;
        }
        .nav-link {
          font-size: 0.8rem;
          color: var(--text-muted);
          text-decoration: none;
          letter-spacing: 0.04em;
          transition: color 0.12s;
        }
        .nav-link:hover { color: var(--text-secondary); }
        .nav-link--active { color: var(--gold); }
        .nav-sep { color: var(--border-gold-bright); font-size: 0.7rem; }

        .page-body {
          max-width: 760px;
          margin: 0 auto;
          padding: 1.5rem 1.5rem 4rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .section { }

        /* Back button */
        .rr-back { }
        .rr-back-btn {
          background: none;
          border: none;
          color: var(--text-muted);
          font-size: 0.8rem;
          cursor: pointer;
          padding: 0;
          transition: color 0.1s;
          letter-spacing: 0.03em;
        }
        .rr-back-btn:hover { color: var(--gold); }

        /* Loading */
        .rr-loading {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 1rem 1.25rem;
          font-size: 0.85rem;
          color: var(--text-muted);
        }
        .rr-spinner {
          display: inline-block;
          width: 14px;
          height: 14px;
          border: 2px solid var(--border-dim);
          border-top-color: var(--gold);
          border-radius: 50%;
          animation: rrSpin 0.7s linear infinite;
          flex-shrink: 0;
        }
        @keyframes rrSpin { to { transform: rotate(360deg); } }

        /* Notice (not-found) */
        .rr-notice {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          padding: 1.25rem 1.5rem;
        }
        .rr-notice__icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: var(--gold-dim);
          color: #fff;
          font-weight: 700;
          font-size: 0.75rem;
          flex-shrink: 0;
          margin-top: 2px;
        }
        .rr-notice__title {
          font-weight: 600;
          color: var(--gold);
          margin-bottom: 0.25rem;
        }
        .rr-notice__sub {
          font-size: 0.82rem;
          color: var(--text-secondary);
        }

        /* Error */
        .rr-error {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          padding: 1rem 1.25rem;
        }
        .rr-error__icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: var(--sev-critical);
          color: #fff;
          font-weight: 700;
          font-size: 0.75rem;
          flex-shrink: 0;
          margin-top: 2px;
        }
        .rr-error__title {
          font-weight: 600;
          color: #fca5a5;
          font-size: 0.9rem;
          margin-bottom: 0.2rem;
        }
        .rr-error__msg {
          font-size: 0.8rem;
          color: var(--text-muted);
          word-break: break-word;
        }

        /* Shared action button */
        .btn-action {
          display: inline-block;
          padding: 0.45rem 1.1rem;
          background: transparent;
          border: 1px solid var(--border-gold-bright);
          border-radius: 3px;
          color: var(--gold);
          font-size: 0.8rem;
          font-weight: 600;
          letter-spacing: 0.04em;
          cursor: pointer;
          text-decoration: none;
          transition: background 0.12s, border-color 0.12s;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .btn-action:hover {
          background: rgba(200,151,42,0.1);
          border-color: var(--gold);
        }

        /* Report header panel */
        .rr-header-panel {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          padding: 1.25rem 1.5rem;
          position: relative;
          overflow: hidden;
        }
        .rr-header-panel::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse 60% 40% at 50% 0%, rgba(200,151,42,0.07) 0%, transparent 70%);
          pointer-events: none;
        }
        .rr-header-panel__left {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }
        .rr-header-panel__row {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          flex-wrap: wrap;
        }
        .rr-header-panel__row--sub {
          flex-wrap: nowrap;
        }
        .rr-matchup { font-size: 1.5rem; }
        .cr-result {
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          padding: 3px 8px;
          border-radius: 2px;
        }
        .cr-result--win     { background: rgba(34,197,94,0.15);  color: #22c55e; border: 1px solid rgba(34,197,94,0.3); }
        .cr-result--loss    { background: rgba(220,38,38,0.12);  color: #ef4444; border: 1px solid rgba(220,38,38,0.3); }
        .cr-result--unknown { background: var(--bg-raised);      color: var(--text-muted); border: 1px solid var(--border-dim); }
        .rr-map {
          font-size: 0.82rem;
          color: var(--text-secondary);
        }
        .rr-duration {
          font-family: monospace;
          font-size: 0.82rem;
          color: var(--gold-dim);
        }
        .rr-header-panel__right {
          flex-shrink: 0;
        }
        .rr-replay-id {
          font-family: monospace;
          font-size: 0.68rem;
          color: var(--text-muted);
          background: var(--bg-raised);
          border: 1px solid var(--border-dim);
          border-radius: 2px;
          padding: 2px 6px;
        }

        /* Tips section */
        .rr-tips-label {
          display: flex;
          align-items: baseline;
          gap: 0.75rem;
          margin-bottom: 0.6rem;
        }
        .rr-tips-hint {
          font-size: 0.75rem;
          color: var(--text-muted);
        }
        .rr-tips-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        /* Tip card (same styling as CoachReport.tsx, extended with feedback) */
        .tip-card-fb {
          background: var(--bg-raised);
          border: 1px solid var(--border-dim);
          border-left: 3px solid var(--gold-dim);
          border-radius: 0 4px 4px 0;
          display: flex;
          flex-direction: column;
          gap: 0;
          transition: border-left-color 0.15s;
          overflow: hidden;
        }
        .tip-card-fb:hover {
          border-left-color: var(--gold);
        }
        .tip-card__header {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          flex-wrap: wrap;
          padding: 0.875rem 1rem 0;
        }
        .tip-priority {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          border: 2px solid var(--gold);
          color: var(--gold-light);
          font-size: 0.7rem;
          font-weight: 700;
          flex-shrink: 0;
          text-shadow: 0 0 8px rgba(200,151,42,0.6);
        }
        .tip-title {
          font-size: 0.95rem;
          font-weight: 700;
          color: var(--text-primary);
          line-height: 1.35;
          flex: 1;
        }
        .tip-timestamp {
          font-family: monospace;
          font-size: 0.7rem;
          color: var(--gold-dim);
          background: rgba(200,151,42,0.08);
          border: 1px solid var(--border-gold);
          border-radius: 2px;
          padding: 1px 6px;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .tip-detail {
          font-size: 0.875rem;
          color: var(--text-secondary);
          line-height: 1.55;
          padding: 0.45rem 1rem 0 calc(1rem + 22px + 0.6rem);
        }
        .tip-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem;
          padding: 0.3rem 1rem 0.7rem calc(1rem + 22px + 0.6rem);
        }
        .tip-chip {
          font-size: 0.65rem;
          font-family: monospace;
          letter-spacing: 0.04em;
          color: var(--text-muted);
          background: var(--bg-elevated);
          border: 1px solid var(--border-dim);
          border-radius: 2px;
          padding: 1px 6px;
        }

        /* Report-level feedback panel */
        .rr-report-fb {
          padding: 1rem 1.25rem 0;
          overflow: hidden;
        }
        .rr-report-fb__header {
          padding-bottom: 0.6rem;
        }
        .rr-report-fb__sub {
          font-size: 0.78rem;
          color: var(--text-muted);
          margin-top: 0.2rem;
        }

        /* Footer note */
        .rr-footer {
          font-size: 0.7rem;
          color: var(--text-muted);
          font-style: italic;
          text-align: right;
          line-height: 1.4;
        }
      `}</style>
    </main>
  );
}
