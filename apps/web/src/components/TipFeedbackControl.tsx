"use client";

/**
 * TipFeedbackControl — compact inline feedback widget for a single coach tip
 * (or whole-report feedback when tipPriority is null).
 *
 * States:
 *  idle       → shows verdict buttons
 *  expanded   → shows category dropdown + note textarea
 *  submitting → spinner
 *  done       → "Saved" confirmation
 *  error      → error text with retry
 *
 * Existing feedback for this tip (if any) is displayed in read-only
 * form below the control so users can see what they previously flagged.
 */

import { useState } from "react";
import type { TipFeedback, FeedbackVerdict, FeedbackCategory } from "@/types/analyzer";
import { submitFeedback } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TipFeedbackControlProps {
  replayId: string;
  /** The CoachTip.priority this control targets; null = whole-report. */
  tipPriority: number | null;
  /** Label shown in the header row ("Tip 1", "Report", etc.) */
  label: string;
  /** Existing feedback rows for this tip (passed in by parent after fetch). */
  existing?: TipFeedback[];
  /** Called after a successful submit so the parent can refresh its list. */
  onSubmitted?: (row: TipFeedback) => void;
}

type ControlState =
  | { kind: "idle" }
  | { kind: "expanded"; verdict: FeedbackVerdict }
  | { kind: "submitting" }
  | { kind: "done"; row: TipFeedback }
  | { kind: "error"; message: string };

// ---------------------------------------------------------------------------
// Category labels
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  timing:   "Timing",
  advice:   "Advice",
  hero:     "Hero choice",
  priority: "Priority",
  tone:     "Tone",
  other:    "Other",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Existing feedback row (read-only display)
// ---------------------------------------------------------------------------

function FeedbackRow({ row }: { row: TipFeedback }) {
  const verdictClass =
    row.verdict === "good"
      ? "fbrow--good"
      : row.verdict === "wrong"
      ? "fbrow--wrong"
      : "fbrow--partly";
  const verdictLabel =
    row.verdict === "good" ? "Good" : row.verdict === "wrong" ? "Wrong" : "Partly right";

  return (
    <div className={`fbrow ${verdictClass}`}>
      <span className="fbrow__verdict">{verdictLabel}</span>
      {row.category && (
        <span className="fbrow__cat">{CATEGORY_LABELS[row.category]}</span>
      )}
      {row.note && <span className="fbrow__note">{row.note}</span>}
      <span className="fbrow__date">{formatDate(row.createdAt)}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function TipFeedbackControl({
  replayId,
  tipPriority,
  label,
  existing = [],
  onSubmitted,
}: TipFeedbackControlProps) {
  const [state, setState] = useState<ControlState>({ kind: "idle" });
  const [category, setCategory] = useState<FeedbackCategory | "">("");
  const [note, setNote] = useState("");

  const handleVerdictClick = (verdict: FeedbackVerdict) => {
    setState({ kind: "expanded", verdict });
  };

  const handleSubmit = async () => {
    if (state.kind !== "expanded") return;
    setState({ kind: "submitting" });
    try {
      const row = await submitFeedback(replayId, {
        tipPriority,
        verdict: state.verdict,
        category: category !== "" ? category : undefined,
        note: note.trim() || undefined,
      });
      setState({ kind: "done", row });
      onSubmitted?.(row);
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "Submit failed",
      });
    }
  };

  const handleCancel = () => {
    setState({ kind: "idle" });
    setCategory("");
    setNote("");
  };

  const handleRetry = () => {
    setState({ kind: "idle" });
  };

  return (
    <div className="tfc">
      {/* Header label */}
      <div className="tfc__label">{label}</div>

      {/* Existing feedback rows */}
      {existing.length > 0 && (
        <div className="tfc__existing">
          {existing.map((row) => (
            <FeedbackRow key={row.id} row={row} />
          ))}
        </div>
      )}

      {/* Interaction area */}
      {state.kind === "idle" && (
        <div className="tfc__verdicts">
          <button
            className="tfc__v-btn tfc__v-btn--good"
            onClick={() => handleVerdictClick("good")}
            title="This tip is accurate and helpful"
          >
            Good
          </button>
          <button
            className="tfc__v-btn tfc__v-btn--partly"
            onClick={() => handleVerdictClick("partly")}
            title="Partially right"
          >
            Partly
          </button>
          <button
            className="tfc__v-btn tfc__v-btn--wrong"
            onClick={() => handleVerdictClick("wrong")}
            title="This tip is wrong"
          >
            Wrong
          </button>
        </div>
      )}

      {state.kind === "expanded" && (
        <div className="tfc__form">
          <div className="tfc__form-row">
            <span className="tfc__selected-verdict" data-verdict={state.verdict}>
              {state.verdict === "good"
                ? "Good"
                : state.verdict === "wrong"
                ? "Wrong"
                : "Partly right"}
            </span>
            <button
              className="tfc__change-btn"
              onClick={() => setState({ kind: "idle" })}
            >
              change
            </button>
          </div>

          <div className="tfc__form-row">
            <label className="tfc__field-label" htmlFor={`cat-${tipPriority ?? "report"}`}>
              Category
            </label>
            <select
              id={`cat-${tipPriority ?? "report"}`}
              className="tfc__select"
              value={category}
              onChange={(e) => setCategory(e.target.value as FeedbackCategory | "")}
            >
              <option value="">— optional —</option>
              {(Object.keys(CATEGORY_LABELS) as FeedbackCategory[]).map((k) => (
                <option key={k} value={k}>
                  {CATEGORY_LABELS[k]}
                </option>
              ))}
            </select>
          </div>

          <div className="tfc__form-row tfc__form-row--col">
            <label className="tfc__field-label" htmlFor={`note-${tipPriority ?? "report"}`}>
              Note (optional)
            </label>
            <textarea
              id={`note-${tipPriority ?? "report"}`}
              className="tfc__textarea"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What's wrong with it? What would be better?"
              rows={2}
              maxLength={500}
            />
          </div>

          <div className="tfc__form-actions">
            <button className="tfc__submit-btn" onClick={handleSubmit}>
              Submit
            </button>
            <button className="tfc__cancel-btn" onClick={handleCancel}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {state.kind === "submitting" && (
        <div className="tfc__status">
          <span className="tfc__spinner" aria-hidden="true" />
          <span className="tfc__status-text">Saving...</span>
        </div>
      )}

      {state.kind === "done" && (
        <div className="tfc__status tfc__status--done">
          <span className="tfc__done-icon">&#10003;</span>
          <span className="tfc__status-text">Feedback saved</span>
        </div>
      )}

      {state.kind === "error" && (
        <div className="tfc__status tfc__status--error">
          <span className="tfc__status-text">{state.message}</span>
          <button className="tfc__cancel-btn" onClick={handleRetry}>
            Retry
          </button>
        </div>
      )}

      <style>{`
        .tfc {
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
          padding: 0.6rem 0.75rem;
          background: var(--bg-void);
          border-top: 1px solid var(--border-dim);
          border-radius: 0 0 4px 4px;
        }

        .tfc__label {
          font-size: 0.65rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--text-muted);
        }

        /* Existing feedback rows */
        .tfc__existing {
          display: flex;
          flex-direction: column;
          gap: 0.3rem;
        }
        .fbrow {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-wrap: wrap;
          font-size: 0.72rem;
          padding: 3px 6px;
          border-radius: 2px;
          border-left: 2px solid var(--border-dim);
        }
        .fbrow--good   { border-left-color: #22c55e; background: rgba(34,197,94,0.06); }
        .fbrow--wrong  { border-left-color: #ef4444; background: rgba(220,38,38,0.06); }
        .fbrow--partly { border-left-color: var(--gold-dim); background: rgba(200,151,42,0.06); }
        .fbrow__verdict {
          font-weight: 700;
          color: var(--text-primary);
        }
        .fbrow--good   .fbrow__verdict { color: #22c55e; }
        .fbrow--wrong  .fbrow__verdict { color: #ef4444; }
        .fbrow--partly .fbrow__verdict { color: var(--gold-light); }
        .fbrow__cat {
          color: var(--text-muted);
          background: var(--bg-elevated);
          border: 1px solid var(--border-dim);
          border-radius: 2px;
          padding: 0 5px;
        }
        .fbrow__note {
          color: var(--text-secondary);
          font-style: italic;
          flex: 1;
        }
        .fbrow__date {
          color: var(--text-muted);
          margin-left: auto;
          white-space: nowrap;
        }

        /* Verdict pill buttons */
        .tfc__verdicts {
          display: flex;
          gap: 0.4rem;
          flex-wrap: wrap;
        }
        .tfc__v-btn {
          padding: 3px 10px;
          border-radius: 2px;
          border: 1px solid var(--border-dim);
          background: var(--bg-raised);
          font-size: 0.72rem;
          font-weight: 600;
          letter-spacing: 0.04em;
          cursor: pointer;
          transition: background 0.1s, border-color 0.1s, color 0.1s;
          color: var(--text-secondary);
        }
        .tfc__v-btn:hover { background: var(--bg-elevated); }
        .tfc__v-btn--good:hover  { border-color: #22c55e; color: #22c55e; }
        .tfc__v-btn--wrong:hover { border-color: #ef4444; color: #ef4444; }
        .tfc__v-btn--partly:hover { border-color: var(--gold-dim); color: var(--gold-light); }

        /* Expanded form */
        .tfc__form {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }
        .tfc__form-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
        .tfc__form-row--col {
          flex-direction: column;
          align-items: flex-start;
        }
        .tfc__field-label {
          font-size: 0.68rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          white-space: nowrap;
        }
        .tfc__selected-verdict {
          font-size: 0.8rem;
          font-weight: 700;
          padding: 2px 8px;
          border-radius: 2px;
        }
        .tfc__selected-verdict[data-verdict="good"]   { color: #22c55e; background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.3); }
        .tfc__selected-verdict[data-verdict="wrong"]  { color: #ef4444; background: rgba(220,38,38,0.1); border: 1px solid rgba(220,38,38,0.3); }
        .tfc__selected-verdict[data-verdict="partly"] { color: var(--gold-light); background: rgba(200,151,42,0.1); border: 1px solid var(--border-gold); }
        .tfc__change-btn {
          font-size: 0.65rem;
          color: var(--text-muted);
          background: none;
          border: none;
          cursor: pointer;
          text-decoration: underline;
          padding: 0;
        }
        .tfc__change-btn:hover { color: var(--text-secondary); }
        .tfc__select {
          flex: 1;
          background: var(--bg-raised);
          border: 1px solid var(--border-dim);
          border-radius: 2px;
          color: var(--text-primary);
          font-size: 0.78rem;
          padding: 3px 6px;
          cursor: pointer;
          min-width: 0;
        }
        .tfc__select:focus { outline: 1px solid var(--border-gold-bright); }
        .tfc__textarea {
          width: 100%;
          background: var(--bg-raised);
          border: 1px solid var(--border-dim);
          border-radius: 2px;
          color: var(--text-primary);
          font-size: 0.8rem;
          padding: 6px 8px;
          font-family: inherit;
          resize: vertical;
          line-height: 1.5;
        }
        .tfc__textarea::placeholder { color: var(--text-muted); }
        .tfc__textarea:focus { outline: 1px solid var(--border-gold-bright); }
        .tfc__form-actions {
          display: flex;
          gap: 0.4rem;
        }
        .tfc__submit-btn {
          padding: 4px 12px;
          background: var(--gold-dim);
          border: 1px solid var(--border-gold-bright);
          border-radius: 2px;
          color: #fff;
          font-size: 0.75rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          cursor: pointer;
          transition: background 0.1s;
        }
        .tfc__submit-btn:hover { background: var(--gold); }
        .tfc__cancel-btn {
          padding: 4px 10px;
          background: transparent;
          border: 1px solid var(--border-dim);
          border-radius: 2px;
          color: var(--text-muted);
          font-size: 0.72rem;
          cursor: pointer;
          transition: border-color 0.1s, color 0.1s;
        }
        .tfc__cancel-btn:hover { border-color: var(--border-gold); color: var(--text-secondary); }

        /* Status rows */
        .tfc__status {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.75rem;
          color: var(--text-muted);
        }
        .tfc__status--done  { color: #22c55e; }
        .tfc__status--error { color: #fca5a5; }
        .tfc__done-icon {
          font-size: 0.9rem;
        }
        .tfc__status-text { }
        .tfc__spinner {
          display: inline-block;
          width: 12px;
          height: 12px;
          border: 2px solid var(--border-dim);
          border-top-color: var(--gold);
          border-radius: 50%;
          animation: tfcSpin 0.7s linear infinite;
        }
        @keyframes tfcSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
