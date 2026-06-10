"use client";

import type { ReplayStatus } from "@/types/analyzer";

interface StatusBarProps {
  status: ReplayStatus;
  replayId: string;
}

const STATUS_LABELS: Record<ReplayStatus, string> = {
  pending: "Queued — waiting for worker...",
  parsing: "Parsing replay...",
  done: "Analysis complete",
  error: "Parse error",
};

const STATUS_COLORS: Record<ReplayStatus, string> = {
  pending: "#ca8a04",
  parsing: "#3b82f6",
  done: "#22c55e",
  error: "#dc2626",
};

export function StatusBar({ status, replayId }: StatusBarProps) {
  const isProcessing = status === "pending" || status === "parsing";

  return (
    <div className="status-bar">
      <div className="status-bar__left">
        <span
          className={`status-dot ${isProcessing ? "status-dot--pulse" : ""}`}
          style={{ background: STATUS_COLORS[status] }}
        />
        <span className="status-label">{STATUS_LABELS[status]}</span>
      </div>
      <span className="status-id">ID: {replayId.slice(0, 8)}…</span>

      <style>{`
        .status-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.6rem 1rem;
          background: var(--bg-raised);
          border: 1px solid var(--border-dim);
          border-radius: 4px;
          gap: 0.75rem;
        }
        .status-bar__left {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .status-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          display: inline-block;
          flex-shrink: 0;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.8); }
        }
        .status-dot--pulse {
          animation: pulse 1.2s ease-in-out infinite;
        }
        .status-label {
          font-size: 0.875rem;
          color: var(--text-secondary);
        }
        .status-id {
          font-size: 0.75rem;
          color: var(--text-muted);
          font-family: monospace;
        }
      `}</style>
    </div>
  );
}
