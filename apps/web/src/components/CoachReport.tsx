"use client";

import type { CoachReport, CoachTip } from "@wc3-coach/shared-types";
import { formatMs, humanizeRef } from "@/lib/utils";

// -----------------------------------------------------------------------
// Sub-component: a single tip card
// -----------------------------------------------------------------------

interface TipCardProps {
  tip: CoachTip;
  index: number;
}

function TipCard({ tip, index }: TipCardProps) {
  return (
    <div className="tip-card">
      {/* Priority badge + title row */}
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

      {/* Written coaching prose */}
      <p className="tip-detail">{tip.detail}</p>

      {/* Related benchmark metric chips */}
      {tip.relatedBenchmarks && tip.relatedBenchmarks.length > 0 && (
        <div className="tip-chips">
          {tip.relatedBenchmarks.map((ref) => (
            <span key={ref} className="tip-chip">
              {humanizeRef(`x:${ref}`)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------
// Main component
// -----------------------------------------------------------------------

interface CoachReportProps {
  report: CoachReport;
}

export function CoachReport({ report }: CoachReportProps) {
  return (
    <div className="coach-report wc3-panel-elevated">
      {/* Panel header */}
      <div className="cr-header">
        <div className="cr-header__left">
          <h2 className="wc3-heading cr-title">Mentor Review</h2>
          <span className="cr-sub">
            Written coaching — {report.matchup} on {report.mapName}
          </span>
        </div>
        <div className="cr-header__right">
          <span className={`cr-result cr-result--${report.result}`}>
            {report.result.toUpperCase()}
          </span>
          <span className="cr-duration">{formatMs(report.durationMs)}</span>
        </div>
      </div>

      <hr className="wc3-divider" style={{ margin: "0.875rem 0 1rem" }} />

      {/* Tip cards */}
      <div className="cr-tips">
        {report.tips.map((tip, i) => (
          <TipCard key={tip.priority} tip={tip} index={i} />
        ))}
      </div>

      {/* Footer attribution */}
      <p className="cr-footer">
        Synthesized by the local LLM from deterministic benchmark deviations and
        strategy knowledge. Treat as a starting point, not gospel.
      </p>

      <style>{`
        /* ---- panel shell ---- */
        .coach-report {
          padding: 1.25rem 1.5rem;
          position: relative;
          overflow: hidden;
        }

        /* Subtle gold radial glow behind the panel */
        .coach-report::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse 60% 40% at 50% 0%, rgba(200,151,42,0.07) 0%, transparent 70%);
          pointer-events: none;
        }

        /* ---- header ---- */
        .cr-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          flex-wrap: wrap;
        }
        .cr-header__left {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .cr-title {
          font-size: 1.05rem;
        }
        .cr-sub {
          font-size: 0.75rem;
          color: var(--text-muted);
          letter-spacing: 0.03em;
        }

        .cr-header__right {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          flex-shrink: 0;
        }
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
        .cr-duration {
          font-family: monospace;
          font-size: 0.85rem;
          color: var(--gold-dim);
        }

        /* ---- tip list ---- */
        .cr-tips {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        /* ---- individual tip card ---- */
        .tip-card {
          background: var(--bg-raised);
          border: 1px solid var(--border-dim);
          border-left: 3px solid var(--gold-dim);
          border-radius: 0 4px 4px 0;
          padding: 0.875rem 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
          transition: border-left-color 0.15s, transform 0.1s;
        }
        .tip-card:hover {
          border-left-color: var(--gold);
          transform: translateX(2px);
        }

        .tip-card__header {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          flex-wrap: wrap;
        }

        /* Gold ring priority badge */
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

        /* Small inline timestamp chip */
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

        /* Prose detail */
        .tip-detail {
          font-size: 0.875rem;
          color: var(--text-secondary);
          line-height: 1.55;
          padding-left: 1.75rem; /* align under title, past the badge */
        }

        /* Related benchmark chips */
        .tip-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem;
          padding-left: 1.75rem;
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

        /* ---- footer ---- */
        .cr-footer {
          margin-top: 1rem;
          font-size: 0.7rem;
          color: var(--text-muted);
          font-style: italic;
          text-align: right;
          line-height: 1.4;
        }
      `}</style>
    </div>
  );
}
