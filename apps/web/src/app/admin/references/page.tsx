"use client";

/**
 * /admin/references — Benchmark reference data curation
 *
 * Edits the DB-backed benchmark_references table live (no redeploy). This is the
 * root-cause fix for bad coaching from stale hardcoded values: change a timing
 * here, re-run a replay's benchmarks, and the new value flows straight through.
 *
 * Identity (matchup/race/metric) is immutable per row — to change it, delete and
 * re-create. Editable fields: expected, window, provenance, confidence, notes.
 */

import { useCallback, useEffect, useState } from "react";
import type {
  BenchmarkReference,
  Confidence,
  Provenance,
  ReferenceCreate,
} from "@/types/admin";
import {
  createReference,
  deleteReference,
  listReferences,
  updateReference,
} from "@/lib/api";
import { formatMs } from "@/lib/utils";

const PROVENANCE: Provenance[] = ["community", "pro", "user"];
const CONFIDENCE: (Confidence | "")[] = ["", "low", "medium", "high"];

/** Timing metrics store ms; show a M:SS hint next to the raw value. */
function isTimingMetric(metric: string): boolean {
  return metric.endsWith("_timing") || metric.includes("level_at");
}

function expectedHint(metric: string, expected: number): string | null {
  if (isTimingMetric(metric) && expected >= 1000) return formatMs(expected);
  return null;
}

// ---------------------------------------------------------------------------
// Provenance tag
// ---------------------------------------------------------------------------

function ProvenanceTag({ value }: { value: Provenance }) {
  return <span className={`prov prov--${value}`}>{value}</span>;
}

// ---------------------------------------------------------------------------
// Editable row
// ---------------------------------------------------------------------------

type RowDraft = {
  expected: string;
  windowMs: string;
  provenance: Provenance;
  confidence: Confidence | "";
  notes: string;
};

function toDraft(r: BenchmarkReference): RowDraft {
  return {
    expected: String(r.expected),
    windowMs: String(r.windowMs),
    provenance: r.provenance,
    confidence: r.confidence ?? "",
    notes: r.notes ?? "",
  };
}

function ReferenceRow({
  row,
  editing,
  onEdit,
  onCancel,
  onSave,
  onDelete,
  busy,
}: {
  row: BenchmarkReference;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (draft: RowDraft) => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const [draft, setDraft] = useState<RowDraft>(toDraft(row));

  // Reset the draft whenever we (re-)enter edit mode for this row.
  useEffect(() => {
    if (editing) setDraft(toDraft(row));
  }, [editing, row]);

  const hint = expectedHint(row.metric, row.expected);

  if (!editing) {
    return (
      <div className="ref-row">
        <div className="ref-cell ref-key">
          <span className="ref-matchup">{row.matchup}</span>
          <span className="ref-race">{row.raceId}</span>
        </div>
        <div className="ref-cell ref-metric">{row.metric}</div>
        <div className="ref-cell ref-num">
          {row.expected}
          {hint && <span className="ref-hint">{hint}</span>}
        </div>
        <div className="ref-cell ref-num ref-dim">{row.windowMs}</div>
        <div className="ref-cell">
          <ProvenanceTag value={row.provenance} />
          {row.confidence && (
            <span className="ref-conf">{row.confidence}</span>
          )}
        </div>
        <div className="ref-cell ref-notes" title={row.notes ?? ""}>
          {row.notes}
        </div>
        <div className="ref-cell ref-actions">
          <button className="btn-ghost" onClick={onEdit} disabled={busy}>
            Edit
          </button>
          <button
            className="btn-ghost btn-danger"
            onClick={onDelete}
            disabled={busy}
          >
            Delete
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ref-row ref-row--editing">
      <div className="ref-cell ref-key">
        <span className="ref-matchup">{row.matchup}</span>
        <span className="ref-race">{row.raceId}</span>
      </div>
      <div className="ref-cell ref-metric">{row.metric}</div>
      <div className="ref-cell ref-num">
        <input
          className="ref-input"
          type="number"
          value={draft.expected}
          onChange={(e) => setDraft({ ...draft, expected: e.target.value })}
        />
      </div>
      <div className="ref-cell ref-num">
        <input
          className="ref-input"
          type="number"
          value={draft.windowMs}
          onChange={(e) => setDraft({ ...draft, windowMs: e.target.value })}
        />
      </div>
      <div className="ref-cell ref-edit-meta">
        <select
          className="ref-input"
          value={draft.provenance}
          onChange={(e) =>
            setDraft({ ...draft, provenance: e.target.value as Provenance })
          }
        >
          {PROVENANCE.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select
          className="ref-input"
          value={draft.confidence}
          onChange={(e) =>
            setDraft({
              ...draft,
              confidence: e.target.value as Confidence | "",
            })
          }
        >
          {CONFIDENCE.map((c) => (
            <option key={c || "none"} value={c}>
              {c || "—"}
            </option>
          ))}
        </select>
      </div>
      <div className="ref-cell ref-notes">
        <input
          className="ref-input"
          type="text"
          value={draft.notes}
          onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
        />
      </div>
      <div className="ref-cell ref-actions">
        <button
          className="btn-ghost btn-save"
          onClick={() => onSave(draft)}
          disabled={busy}
        >
          Save
        </button>
        <button className="btn-ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add-reference form
// ---------------------------------------------------------------------------

const EMPTY_ADD: ReferenceCreate = {
  matchup: "",
  raceId: "orc",
  metric: "",
  expected: 0,
  windowMs: 0,
  notes: "",
  provenance: "user",
  confidence: null,
};

function AddForm({
  onCreate,
  busy,
}: {
  onCreate: (body: ReferenceCreate) => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [m, setM] = useState("");
  const [race, setRace] = useState("orc");
  const [metric, setMetric] = useState("");
  const [expected, setExpected] = useState("");
  const [windowMs, setWindowMs] = useState("");
  const [notes, setNotes] = useState("");

  const valid =
    m.trim() && race.trim() && metric.trim() && expected !== "" && windowMs !== "";

  if (!open) {
    return (
      <button className="btn-action" onClick={() => setOpen(true)}>
        + Add reference
      </button>
    );
  }

  return (
    <div className="add-form wc3-panel">
      <div className="add-grid">
        <label>
          Matchup
          <input
            className="ref-input"
            value={m}
            placeholder="OvNE"
            onChange={(e) => setM(e.target.value)}
          />
        </label>
        <label>
          Race
          <input
            className="ref-input"
            value={race}
            placeholder="orc"
            onChange={(e) => setRace(e.target.value)}
          />
        </label>
        <label>
          Metric
          <input
            className="ref-input"
            value={metric}
            placeholder="first_hero_timing"
            onChange={(e) => setMetric(e.target.value)}
          />
        </label>
        <label>
          Expected
          <input
            className="ref-input"
            type="number"
            value={expected}
            onChange={(e) => setExpected(e.target.value)}
          />
        </label>
        <label>
          Window
          <input
            className="ref-input"
            type="number"
            value={windowMs}
            onChange={(e) => setWindowMs(e.target.value)}
          />
        </label>
        <label className="add-notes">
          Notes
          <input
            className="ref-input"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
      </div>
      <div className="add-actions">
        <button
          className="btn-action"
          disabled={!valid || busy}
          onClick={() =>
            onCreate({
              ...EMPTY_ADD,
              matchup: m.trim(),
              raceId: race.trim(),
              metric: metric.trim(),
              expected: Number(expected),
              windowMs: Number(windowMs),
              notes: notes.trim() || null,
            })
          }
        >
          Create
        </button>
        <button className="btn-ghost" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </button>
        <span className="add-hint">
          New rows are saved as <code>patchId: null</code> (baseline, matched by
          every replay) with provenance <code>user</code>.
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type LoadState =
  | { kind: "loading" }
  | { kind: "loaded"; rows: BenchmarkReference[] }
  | { kind: "error"; message: string };

export default function AdminReferencesPage() {
  const [loadState, setLoadState] = useState<LoadState>({ kind: "loading" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadState({ kind: "loading" });
    try {
      const rows = await listReferences();
      setLoadState({ kind: "loaded", rows });
    } catch (err) {
      setLoadState({
        kind: "error",
        message: err instanceof Error ? err.message : "Failed to load references",
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runAction = useCallback(
    async (fn: () => Promise<unknown>) => {
      setBusy(true);
      setActionError(null);
      try {
        await fn();
        await load();
        setEditingId(null);
      } catch (err) {
        setActionError(
          err instanceof Error ? err.message : "Action failed"
        );
      } finally {
        setBusy(false);
      }
    },
    [load]
  );

  return (
    <main className="page">
      <header className="page-header">
        <div className="header-inner">
          <h1 className="site-title wc3-heading">WC3 Coach</h1>
          <span className="site-sub">Reference Admin</span>
          <nav className="site-nav">
            <a href="/" className="nav-link">Analyzer</a>
            <span className="nav-sep">|</span>
            <a href="/history" className="nav-link">History</a>
            <span className="nav-sep">|</span>
            <a href="/trainer" className="nav-link">APM Trainer</a>
            <span className="nav-sep">|</span>
            <a href="/admin/references" className="nav-link nav-link--active">
              Admin
            </a>
          </nav>
        </div>
      </header>

      <div className="page-body">
        <section className="section">
          <h2 className="wc3-heading ref-title">Benchmark References</h2>
          <p className="ref-sub">
            The expected timings and counts the coach compares your games
            against. Edit a value and re-run a replay&apos;s benchmarks to apply
            it — no redeploy. <strong>Provenance</strong> records where a number
            came from: <em>community</em> (wiki/ladder knowledge),{" "}
            <em>pro</em> (aggregated from pro replays), <em>user</em> (your
            verified override).
          </p>
        </section>

        {actionError && (
          <section className="section">
            <div className="ref-banner ref-banner--error">{actionError}</div>
          </section>
        )}

        {loadState.kind === "loading" && (
          <section className="section">
            <div className="ref-banner">Loading references…</div>
          </section>
        )}

        {loadState.kind === "error" && (
          <section className="section">
            <div className="ref-banner ref-banner--error">
              {loadState.message}
              <button className="btn-ghost" onClick={() => void load()}>
                Retry
              </button>
            </div>
          </section>
        )}

        {loadState.kind === "loaded" && (
          <>
            <section className="section">
              <AddForm
                busy={busy}
                onCreate={(body) => void runAction(() => createReference(body))}
              />
            </section>

            <section className="section">
              <div className="ref-table wc3-panel">
                <div className="ref-row ref-head">
                  <span className="ref-cell">Matchup / Race</span>
                  <span className="ref-cell">Metric</span>
                  <span className="ref-cell ref-num">Expected</span>
                  <span className="ref-cell ref-num">Window</span>
                  <span className="ref-cell">Source</span>
                  <span className="ref-cell ref-notes">Notes</span>
                  <span className="ref-cell ref-actions" />
                </div>
                {loadState.rows.length === 0 && (
                  <div className="ref-empty">
                    No references yet. Run{" "}
                    <code>python -m app.benchmarks.seed_references</code> to
                    populate the baseline, or add one above.
                  </div>
                )}
                {loadState.rows.map((row) => (
                  <ReferenceRow
                    key={row.id}
                    row={row}
                    editing={editingId === row.id}
                    busy={busy}
                    onEdit={() => {
                      setActionError(null);
                      setEditingId(row.id);
                    }}
                    onCancel={() => setEditingId(null)}
                    onDelete={() => {
                      if (
                        confirm(
                          `Delete reference ${row.matchup} / ${row.metric}?`
                        )
                      ) {
                        void runAction(() => deleteReference(row.id));
                      }
                    }}
                    onSave={(draft) =>
                      void runAction(() =>
                        updateReference(row.id, {
                          expected: Number(draft.expected),
                          windowMs: Number(draft.windowMs),
                          notes: draft.notes.trim() || null,
                          provenance: draft.provenance,
                          confidence: draft.confidence || null,
                        })
                      )
                    }
                  />
                ))}
              </div>
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
          max-width: 1100px;
          margin: 0 auto;
          padding: 0.75rem 0;
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        .site-title { font-size: 1.25rem; }
        .site-sub { font-size: 0.75rem; color: var(--text-muted); letter-spacing: 0.04em; }
        .site-nav { display: flex; align-items: center; gap: 0.5rem; margin-left: auto; }
        .nav-link { font-size: 0.8rem; color: var(--text-muted); text-decoration: none; letter-spacing: 0.04em; transition: color 0.12s; }
        .nav-link:hover { color: var(--text-secondary); }
        .nav-link--active { color: var(--gold); }
        .nav-sep { color: var(--border-gold-bright); font-size: 0.7rem; }

        .page-body {
          max-width: 1100px;
          margin: 0 auto;
          padding: 1.5rem 1.5rem 4rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .ref-title { font-size: 1.15rem; margin-bottom: 0.3rem; }
        .ref-sub { font-size: 0.82rem; color: var(--text-muted); line-height: 1.55; max-width: 760px; }
        .ref-sub em { color: var(--gold-dim); font-style: normal; }
        .ref-sub strong { color: var(--text-secondary); }

        .ref-banner {
          padding: 0.7rem 1rem;
          background: var(--bg-raised);
          border: 1px solid var(--border-dim);
          border-radius: 3px;
          font-size: 0.82rem;
          color: var(--text-muted);
          display: flex; align-items: center; gap: 0.75rem;
        }
        .ref-banner--error { border-color: rgba(220,38,38,0.4); color: #fca5a5; }

        /* Action buttons (shared) */
        .btn-action {
          display: inline-block;
          padding: 0.45rem 1.1rem;
          background: transparent;
          border: 1px solid var(--border-gold-bright);
          border-radius: 3px;
          color: var(--gold);
          font-size: 0.8rem; font-weight: 600; letter-spacing: 0.04em;
          cursor: pointer; transition: background 0.12s, border-color 0.12s;
        }
        .btn-action:hover:not(:disabled) { background: rgba(200,151,42,0.1); border-color: var(--gold); }
        .btn-action:disabled { opacity: 0.4; cursor: not-allowed; }
        .btn-ghost {
          padding: 0.3rem 0.6rem;
          background: transparent;
          border: 1px solid var(--border-dim);
          border-radius: 3px;
          color: var(--text-secondary);
          font-size: 0.72rem; cursor: pointer; transition: all 0.12s;
        }
        .btn-ghost:hover:not(:disabled) { border-color: var(--border-gold-bright); color: var(--gold); }
        .btn-ghost:disabled { opacity: 0.4; cursor: not-allowed; }
        .btn-save { border-color: var(--border-gold-bright); color: var(--gold); }
        .btn-danger:hover:not(:disabled) { border-color: rgba(220,38,38,0.5); color: #ef4444; }

        /* Add form */
        .add-form { padding: 1rem 1.25rem; }
        .add-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 0.6rem;
          margin-bottom: 0.75rem;
        }
        .add-grid label, .add-notes {
          display: flex; flex-direction: column; gap: 0.25rem;
          font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted);
        }
        .add-notes { grid-column: 1 / -1; }
        .add-actions { display: flex; align-items: center; gap: 0.6rem; }
        .add-hint { font-size: 0.7rem; color: var(--text-muted); margin-left: auto; }
        .add-hint code { color: var(--gold-light); font-family: monospace; }

        .ref-input {
          width: 100%;
          padding: 0.35rem 0.5rem;
          background: var(--bg-void);
          border: 1px solid var(--border-dim);
          border-radius: 3px;
          color: var(--text-primary);
          font-size: 0.8rem; font-family: inherit;
        }
        .ref-input:focus { outline: none; border-color: var(--border-gold-bright); }

        /* Table */
        .ref-table { overflow: hidden; }
        .ref-row {
          display: grid;
          grid-template-columns: 130px 200px 120px 90px 130px 1fr 130px;
          gap: 0.75rem;
          align-items: center;
          padding: 0.55rem 1rem;
          border-bottom: 1px solid var(--border-dim);
          font-size: 0.8rem;
        }
        .ref-row:last-child { border-bottom: none; }
        .ref-head {
          background: var(--bg-void);
          border-bottom: 1px solid var(--border-gold);
          font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted);
        }
        .ref-row--editing { background: var(--bg-raised); }
        .ref-cell { min-width: 0; }
        .ref-key { display: flex; flex-direction: column; gap: 0.1rem; }
        .ref-matchup { color: var(--gold); font-weight: 600; }
        .ref-race { font-size: 0.68rem; color: var(--text-muted); }
        .ref-metric { font-family: monospace; font-size: 0.74rem; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ref-num { font-family: monospace; text-align: right; }
        .ref-num .ref-hint { display: block; font-size: 0.64rem; color: var(--gold-dim); }
        .ref-dim { color: var(--text-muted); }
        .ref-notes { font-size: 0.74rem; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ref-edit-meta { display: flex; flex-direction: column; gap: 0.3rem; }
        .ref-actions { display: flex; gap: 0.35rem; justify-content: flex-end; }
        .ref-conf { margin-left: 0.4rem; font-size: 0.64rem; color: var(--text-muted); }
        .ref-empty { padding: 1.25rem 1rem; font-size: 0.82rem; color: var(--text-muted); }
        .ref-empty code { color: var(--gold-light); font-family: monospace; }

        /* Provenance tags */
        .prov { font-size: 0.64rem; font-weight: 700; letter-spacing: 0.06em; padding: 2px 6px; border-radius: 2px; text-transform: uppercase; }
        .prov--community { background: var(--bg-raised); color: var(--text-muted); border: 1px solid var(--border-dim); }
        .prov--pro { background: rgba(34,197,94,0.14); color: #22c55e; border: 1px solid rgba(34,197,94,0.3); }
        .prov--user { background: rgba(200,151,42,0.14); color: var(--gold); border: 1px solid var(--border-gold-bright); }
      `}</style>
    </main>
  );
}
