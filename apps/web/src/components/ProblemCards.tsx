"use client";

import type { ScoredProblem } from "@/types/analyzer";
import { humanizeRef, formatMs } from "@/lib/utils";

interface ProblemCardsProps {
  problems: ScoredProblem[];
  playerName: string;
}

const SEV_BORDER: Record<string, string> = {
  info: "var(--sev-info)",
  minor: "var(--sev-minor)",
  major: "var(--sev-major)",
  critical: "var(--sev-critical)",
};

const SEV_GLOW: Record<string, string> = {
  info: "transparent",
  minor: "rgba(202, 138, 4, 0.1)",
  major: "rgba(234, 88, 12, 0.12)",
  critical: "rgba(220, 38, 38, 0.15)",
};

function formatValue(metric: string, value: number): string {
  // Timing metrics — value is in ms
  if (
    metric.includes("timing") ||
    metric.includes("time") ||
    metric.includes("_ms")
  ) {
    if (value < 0) return "Never";
    return formatMs(value);
  }
  return String(Math.round(value * 10) / 10);
}

function formatExpected(metric: string, expected: number | null): string {
  if (expected === null) return "—";
  return formatValue(metric, expected);
}

export function ProblemCards({ problems, playerName }: ProblemCardsProps) {
  if (problems.length === 0) {
    return (
      <div className="no-problems">
        <span>No coaching problems found — flawless game!</span>
        <style>{`.no-problems { color: var(--text-muted); font-style: italic; padding: 1rem 0; }`}</style>
      </div>
    );
  }

  return (
    <div className="problems">
      <div className="problems__header">
        <h2 className="wc3-heading" style={{ fontSize: "1rem" }}>
          Coaching Report
        </h2>
        <span className="problems__player">{playerName}</span>
      </div>

      <div className="problems__list">
        {problems.map((p, i) => {
          const borderColor = SEV_BORDER[p.severity] ?? SEV_BORDER.info;
          const glowColor = SEV_GLOW[p.severity] ?? "transparent";

          return (
            <div
              key={p.metric}
              className="problem-card"
              style={{
                borderLeftColor: borderColor,
                boxShadow: `inset 0 0 32px ${glowColor}, 0 2px 12px rgba(0,0,0,0.4)`,
              }}
            >
              {/* Rank + badge row */}
              <div className="problem-card__top">
                <span className="problem-card__rank">#{i + 1}</span>
                <span
                  className={`sev-badge sev-${p.severity}`}
                >
                  {p.severity}
                </span>
                <span className="problem-card__score" title="Priority score">
                  {p.score.toFixed(1)}
                </span>
              </div>

              {/* Summary */}
              <p className="problem-card__summary">{p.summary}</p>

              {/* Footer: metric + actual vs expected */}
              <div className="problem-card__footer">
                <span className="problem-card__metric">
                  {humanizeRef(`x:${p.metric}`)}
                </span>
                <div className="problem-card__values">
                  <span className="pv-label">Actual</span>
                  <span className="pv-val">
                    {formatValue(p.metric, p.value)}
                  </span>
                  <span className="pv-sep" />
                  <span className="pv-label">Expected</span>
                  <span className="pv-val pv-val--expected">
                    {formatExpected(p.metric, p.expected)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        .problems { display: flex; flex-direction: column; gap: 0.75rem; }
        .problems__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 0.25rem;
        }
        .problems__player {
          font-size: 0.8rem;
          color: var(--text-muted);
        }
        .problems__list { display: flex; flex-direction: column; gap: 0.5rem; }

        .problem-card {
          background: var(--bg-panel);
          border: 1px solid var(--border-dim);
          border-left: 4px solid var(--sev-info);
          border-radius: 0 4px 4px 0;
          padding: 0.875rem 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          transition: transform 0.1s;
        }
        .problem-card:hover {
          transform: translateX(2px);
        }

        .problem-card__top {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .problem-card__rank {
          font-size: 0.75rem;
          font-weight: 700;
          color: var(--text-muted);
          width: 20px;
          flex-shrink: 0;
        }
        .problem-card__score {
          margin-left: auto;
          font-size: 0.7rem;
          color: var(--text-muted);
          font-family: monospace;
        }

        .problem-card__summary {
          font-size: 0.9rem;
          color: var(--text-primary);
          line-height: 1.45;
        }

        .problem-card__footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 0.5rem;
          margin-top: 0.2rem;
        }
        .problem-card__metric {
          font-size: 0.72rem;
          color: var(--text-muted);
          font-family: monospace;
          letter-spacing: 0.04em;
        }
        .problem-card__values {
          display: flex;
          align-items: center;
          gap: 0.4rem;
        }
        .pv-label {
          font-size: 0.65rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .pv-val {
          font-size: 0.8rem;
          font-family: monospace;
          color: var(--text-secondary);
          font-weight: 600;
        }
        .pv-val--expected {
          color: var(--gold-dim);
        }
        .pv-sep {
          width: 1px;
          height: 12px;
          background: var(--border-dim);
        }
      `}</style>
    </div>
  );
}
