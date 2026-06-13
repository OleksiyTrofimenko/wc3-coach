"use client";

/**
 * /history — Replay coaching history
 *
 * Lists all analyzed replays returned by GET /coach (newest first).
 * Each row shows matchup, result, map, duration, tip count, and feedback count.
 * Clicking a row navigates to /history/[replayId] for the full report + feedback.
 */

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { ReportSummary } from "@/types/analyzer";
import { getCoachHistory } from "@/lib/api";
import { formatMs } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Result badge
// ---------------------------------------------------------------------------

function ResultBadge({ result }: { result: ReportSummary["result"] }) {
  return (
    <span className={`hist-result hist-result--${result}`}>
      {result.toUpperCase()}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function HistoryRow({
  summary,
  onClick,
}: {
  summary: ReportSummary;
  onClick: () => void;
}) {
  const hasFeedback = summary.feedbackCount > 0;

  return (
    <button
      className="hist-row"
      onClick={onClick}
      aria-label={`Open ${summary.matchup} on ${summary.mapName}`}
    >
      {/* Left: matchup + map */}
      <div className="hist-row__main">
        <span className="hist-matchup wc3-heading">{summary.matchup}</span>
        <span className="hist-map">{summary.mapName}</span>
      </div>

      {/* Middle: result + duration */}
      <div className="hist-row__meta">
        <ResultBadge result={summary.result} />
        <span className="hist-duration">{formatMs(summary.durationMs)}</span>
      </div>

      {/* Right: tips, feedback, date */}
      <div className="hist-row__stats">
        <span className="hist-tips" title={`${summary.tipCount} coaching tips`}>
          {summary.tipCount} tips
        </span>
        <span
          className={`hist-flags ${hasFeedback ? "hist-flags--has" : ""}`}
          title={`${summary.feedbackCount} feedback items`}
        >
          {summary.feedbackCount > 0 ? `${summary.feedbackCount} flags` : "no flags"}
        </span>
        <span className="hist-date">{formatDate(summary.createdAt)}</span>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type LoadState =
  | { kind: "loading" }
  | { kind: "loaded"; rows: ReportSummary[] }
  | { kind: "error"; message: string };

export default function HistoryPage() {
  const router = useRouter();
  const [loadState, setLoadState] = useState<LoadState>({ kind: "loading" });

  const load = useCallback(async () => {
    setLoadState({ kind: "loading" });
    try {
      const rows = await getCoachHistory();
      setLoadState({ kind: "loaded", rows });
    } catch (err) {
      setLoadState({
        kind: "error",
        message: err instanceof Error ? err.message : "Failed to load history",
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="page">
      {/* Header — identical structure to Analyzer page */}
      <header className="page-header">
        <div className="header-inner">
          <h1 className="site-title wc3-heading">WC3 Coach</h1>
          <span className="site-sub">Coaching History</span>
          <nav className="site-nav">
            <a href="/" className="nav-link">Analyzer</a>
            <span className="nav-sep">|</span>
            <a href="/history" className="nav-link nav-link--active">History</a>
            <span className="nav-sep">|</span>
            <a href="/trainer" className="nav-link">APM Trainer</a>
            <span className="nav-sep">|</span>
            <a href="/admin/references" className="nav-link">Admin</a>
          </nav>
        </div>
      </header>

      <div className="page-body">
        {/* Section header */}
        <section className="section">
          <div className="hist-section-header">
            <h2 className="wc3-heading hist-title">Analyzed Replays</h2>
            <p className="hist-sub">
              Every replay you have run through the coach. Click a row to review
              the full tips and flag any that are wrong.
            </p>
          </div>
        </section>

        {/* Loading */}
        {loadState.kind === "loading" && (
          <section className="section">
            <div className="hist-loading wc3-panel">
              <span className="hist-loading__spinner" aria-hidden="true" />
              <span>Loading history...</span>
            </div>
          </section>
        )}

        {/* Error */}
        {loadState.kind === "error" && (
          <section className="section">
            <div className="hist-error wc3-panel">
              <span className="hist-error__icon">!</span>
              <div>
                <p className="hist-error__title">Failed to load history</p>
                <p className="hist-error__msg">{loadState.message}</p>
              </div>
              <button className="btn-action" onClick={() => void load()}>
                Retry
              </button>
            </div>
          </section>
        )}

        {/* Empty */}
        {loadState.kind === "loaded" && loadState.rows.length === 0 && (
          <section className="section">
            <div className="hist-empty wc3-panel">
              <span className="hist-empty__icon">&#9876;</span>
              <div>
                <p className="hist-empty__title">No replays analyzed yet</p>
                <p className="hist-empty__sub">
                  Upload a <code>.w3g</code> replay on the Analyzer page, run the
                  coach, and it will appear here.
                </p>
              </div>
              <a href="/" className="btn-action">
                Go to Analyzer
              </a>
            </div>
          </section>
        )}

        {/* List */}
        {loadState.kind === "loaded" && loadState.rows.length > 0 && (
          <section className="section">
            <div className="hist-list wc3-panel">
              <div className="hist-list__head">
                <span>Game</span>
                <span>Result</span>
                <span>Stats</span>
              </div>
              <div className="hist-list__body">
                {loadState.rows.map((row) => (
                  <HistoryRow
                    key={row.replayId}
                    summary={row}
                    onClick={() => router.push(`/history/${row.replayId}`)}
                  />
                ))}
              </div>
            </div>
          </section>
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
          gap: 1.25rem;
        }
        .section { }

        /* Section header */
        .hist-section-header { }
        .hist-title { font-size: 1.15rem; margin-bottom: 0.3rem; }
        .hist-sub {
          font-size: 0.82rem;
          color: var(--text-muted);
          line-height: 1.5;
        }

        /* Loading */
        .hist-loading {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 1rem 1.25rem;
          font-size: 0.85rem;
          color: var(--text-muted);
        }
        .hist-loading__spinner {
          display: inline-block;
          width: 14px;
          height: 14px;
          border: 2px solid var(--border-dim);
          border-top-color: var(--gold);
          border-radius: 50%;
          animation: histSpin 0.7s linear infinite;
          flex-shrink: 0;
        }
        @keyframes histSpin { to { transform: rotate(360deg); } }

        /* Error */
        .hist-error {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          padding: 1rem 1.25rem;
        }
        .hist-error__icon {
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
        .hist-error__title {
          font-weight: 600;
          color: #fca5a5;
          font-size: 0.9rem;
          margin-bottom: 0.2rem;
        }
        .hist-error__msg {
          font-size: 0.8rem;
          color: var(--text-muted);
          word-break: break-word;
        }

        /* Empty */
        .hist-empty {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          padding: 1.25rem 1.5rem;
        }
        .hist-empty__icon {
          font-size: 1.5rem;
          flex-shrink: 0;
        }
        .hist-empty__title {
          font-weight: 600;
          color: var(--gold);
          margin-bottom: 0.3rem;
        }
        .hist-empty__sub {
          font-size: 0.85rem;
          color: var(--text-secondary);
        }
        .hist-empty__sub code {
          color: var(--gold-light);
          font-family: monospace;
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

        /* List panel */
        .hist-list {
          overflow: hidden;
        }
        .hist-list__head {
          display: grid;
          grid-template-columns: 1fr auto auto;
          gap: 1rem;
          padding: 0.5rem 1rem;
          background: var(--bg-void);
          border-bottom: 1px solid var(--border-gold);
          font-size: 0.65rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--text-muted);
        }
        .hist-list__body {
          display: flex;
          flex-direction: column;
        }

        /* Row */
        .hist-row {
          display: grid;
          grid-template-columns: 1fr auto auto;
          gap: 1rem;
          align-items: center;
          padding: 0.75rem 1rem;
          border: none;
          border-bottom: 1px solid var(--border-dim);
          background: transparent;
          cursor: pointer;
          text-align: left;
          transition: background 0.1s;
          width: 100%;
          color: inherit;
        }
        .hist-row:last-child { border-bottom: none; }
        .hist-row:hover { background: var(--bg-raised); }

        .hist-row__main {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          min-width: 0;
        }
        .hist-matchup {
          font-size: 1.1rem;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .hist-map {
          font-size: 0.82rem;
          color: var(--text-secondary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .hist-row__meta {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-shrink: 0;
        }
        .hist-result {
          font-size: 0.7rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          padding: 2px 7px;
          border-radius: 2px;
        }
        .hist-result--win     { background: rgba(34,197,94,0.15);  color: #22c55e; border: 1px solid rgba(34,197,94,0.3); }
        .hist-result--loss    { background: rgba(220,38,38,0.12);  color: #ef4444; border: 1px solid rgba(220,38,38,0.3); }
        .hist-result--unknown { background: var(--bg-raised);      color: var(--text-muted); border: 1px solid var(--border-dim); }
        .hist-duration {
          font-family: monospace;
          font-size: 0.82rem;
          color: var(--gold-dim);
          white-space: nowrap;
        }

        .hist-row__stats {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          flex-shrink: 0;
        }
        .hist-tips {
          font-size: 0.72rem;
          color: var(--text-muted);
          white-space: nowrap;
        }
        .hist-flags {
          font-size: 0.72rem;
          color: var(--text-muted);
          white-space: nowrap;
        }
        .hist-flags--has {
          color: var(--gold-light);
        }
        .hist-date {
          font-size: 0.68rem;
          color: var(--text-muted);
          white-space: nowrap;
        }
      `}</style>
    </main>
  );
}
