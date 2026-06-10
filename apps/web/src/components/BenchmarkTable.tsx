"use client";

import type { BenchmarkResult } from "@wc3-coach/shared-types";
import { humanizeRef, formatMs } from "@/lib/utils";

interface BenchmarkTableProps {
  benchmarks: BenchmarkResult[];
  orcSlot: number;
}

const SEV_COLORS: Record<string, string> = {
  info: "var(--sev-info)",
  minor: "var(--sev-minor)",
  major: "var(--sev-major)",
  critical: "var(--sev-critical)",
};

function formatCell(metric: string, value: number | null): string {
  if (value === null) return "—";
  if (
    metric.includes("timing") ||
    metric.includes("time") ||
    metric.includes("_ms")
  ) {
    return value < 0 ? "Never" : formatMs(value);
  }
  return String(Math.round((value ?? 0) * 10) / 10);
}

export function BenchmarkTable({ benchmarks, orcSlot }: BenchmarkTableProps) {
  const rows = benchmarks.filter((b) => b.slot === orcSlot);

  if (rows.length === 0) {
    return (
      <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
        No benchmark data for this slot.
      </p>
    );
  }

  return (
    <div className="bench-wrap">
      <h2
        className="wc3-heading"
        style={{ fontSize: "1rem", marginBottom: "0.75rem" }}
      >
        Raw Benchmarks
      </h2>
      <div className="bench-scroll">
        <table className="bench-table">
          <thead>
            <tr>
              <th>Metric</th>
              <th>Actual</th>
              <th>Expected</th>
              <th>Delta</th>
              <th>Severity</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.metric}>
                <td className="bench-metric">{humanizeRef(`x:${b.metric}`)}</td>
                <td className="bench-mono">{formatCell(b.metric, b.value)}</td>
                <td className="bench-mono bench-expected">
                  {formatCell(b.metric, b.expected)}
                </td>
                <td className="bench-mono bench-delta">
                  {b.delta === null
                    ? "—"
                    : `${b.delta > 0 ? "+" : ""}${formatCell(b.metric, b.delta)}`}
                </td>
                <td>
                  <span
                    className="sev-badge"
                    style={{
                      background: SEV_COLORS[b.severity],
                      color: b.severity === "minor" || b.severity === "major" ? "#0a0a0c" : "#fff",
                    }}
                  >
                    {b.severity}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <style>{`
        .bench-wrap {}
        .bench-scroll {
          overflow-x: auto;
        }
        .bench-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.8rem;
        }
        .bench-table th {
          text-align: left;
          padding: 0.4rem 0.75rem;
          color: var(--text-muted);
          font-size: 0.7rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          border-bottom: 1px solid var(--border-gold);
          white-space: nowrap;
        }
        .bench-table td {
          padding: 0.4rem 0.75rem;
          border-bottom: 1px solid var(--border-dim);
          vertical-align: middle;
        }
        .bench-table tr:last-child td {
          border-bottom: none;
        }
        .bench-table tr:hover td {
          background: rgba(200, 151, 42, 0.04);
        }
        .bench-metric {
          color: var(--text-secondary);
        }
        .bench-mono {
          font-family: monospace;
          color: var(--text-secondary);
        }
        .bench-expected {
          color: var(--gold-dim);
        }
        .bench-delta {
          color: var(--text-muted);
        }
      `}</style>
    </div>
  );
}
