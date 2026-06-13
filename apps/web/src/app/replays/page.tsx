"use client";

/**
 * /replays — Replays browser
 *
 * Lists every replay in the DB (personal + pro/reference) with its matchup,
 * players, duration, and progress flags. Doubles as the curation surface: each
 * row links to /replays/[id] where you study the build order and (Phase 2)
 * capture the ideal coaching for the training set.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReplaySummary } from "@/types/replays";
import type { ExampleSummary } from "@/types/curation";
import { listExamples, listReplays } from "@/lib/api";
import { formatMs } from "@/lib/utils";

type Filter = "all" | "reference" | "personal";

type LoadState =
  | { kind: "loading" }
  | { kind: "loaded"; rows: ReplaySummary[] }
  | { kind: "error"; message: string };

function ReplayRow({
  r,
  onClick,
}: {
  r: ReplaySummary;
  onClick: () => void;
}) {
  return (
    <button className="rb-row" onClick={onClick}>
      <div className="rb-row__main">
        <span className="rb-matchup wc3-heading">{r.matchup}</span>
        <span className="rb-players">
          {r.players.map((p) => p.playerName).join("  vs  ") || "—"}
        </span>
      </div>
      <div className="rb-row__meta">
        {r.isReference && <span className="rb-tag rb-tag--ref">PRO</span>}
        {r.status !== "done" && (
          <span className="rb-tag rb-tag--status">{r.status}</span>
        )}
        <span className="rb-duration">
          {r.durationMs ? formatMs(r.durationMs) : "—"}
        </span>
      </div>
      <div className="rb-row__flags">
        {r.hasExample && (
          <span
            className={`rb-flag rb-flag--${r.exampleStatus ?? "draft"}`}
            title={`Training example: ${r.exampleStatus}`}
          >
            {r.exampleStatus === "approved" ? "✓ example" : "example draft"}
          </span>
        )}
        {r.hasReport && <span className="rb-flag rb-flag--report">coached</span>}
      </div>
    </button>
  );
}

export default function ReplaysBrowserPage() {
  const router = useRouter();
  const [loadState, setLoadState] = useState<LoadState>({ kind: "loading" });
  const [filter, setFilter] = useState<Filter>("all");
  const [examples, setExamples] = useState<ExampleSummary[]>([]);

  const load = useCallback(async () => {
    setLoadState({ kind: "loading" });
    try {
      const rows = await listReplays();
      setLoadState({ kind: "loaded", rows });
    } catch (err) {
      setLoadState({
        kind: "error",
        message: err instanceof Error ? err.message : "Failed to load replays",
      });
    }
    try {
      setExamples(await listExamples());
    } catch {
      setExamples([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible =
    loadState.kind === "loaded"
      ? loadState.rows.filter((r) =>
          filter === "all"
            ? true
            : filter === "reference"
              ? r.isReference
              : !r.isReference
        )
      : [];

  return (
    <main className="page">
      <header className="page-header">
        <div className="header-inner">
          <h1 className="site-title wc3-heading">WC3 Coach</h1>
          <span className="site-sub">Replays</span>
          <nav className="site-nav">
            <a href="/" className="nav-link">Analyzer</a>
            <span className="nav-sep">|</span>
            <a href="/history" className="nav-link">History</a>
            <span className="nav-sep">|</span>
            <a href="/replays" className="nav-link nav-link--active">Replays</a>
            <span className="nav-sep">|</span>
            <a href="/trainer" className="nav-link">APM Trainer</a>
            <span className="nav-sep">|</span>
            <a href="/admin/references" className="nav-link">Admin</a>
          </nav>
        </div>
      </header>

      <div className="page-body">
        <section className="section">
          <h2 className="wc3-heading rb-title">Replays</h2>
          <p className="rb-sub">
            Every parsed replay — your games and the pro/reference replays that
            feed the benchmark references. Open one to study its build order and
            curate the ideal coaching for the training set.
          </p>
        </section>

        {/* Training-set / dataset bar */}
        <section className="section">
          <div className="rb-dataset wc3-panel">
            <div className="rb-dataset__stat">
              <span className="rb-dataset__big">
                {examples.filter((e) => e.status === "approved").length}
              </span>
              <span className="rb-dataset__label">approved examples</span>
            </div>
            <div className="rb-dataset__stat">
              <span className="rb-dataset__big">
                {examples.filter((e) => e.status === "draft").length}
              </span>
              <span className="rb-dataset__label">drafts</span>
            </div>
            <p className="rb-dataset__hint">
              Open a replay → curate the ideal coaching → Approve. Approved
              examples export as the LLM training set.
            </p>
            <a
              className="btn-action"
              href="/api/py/curation/export.jsonl"
              download
            >
              Download training set (JSONL)
            </a>
          </div>
        </section>

        <section className="section">
          <div className="rb-filters">
            {(["all", "reference", "personal"] as Filter[]).map((f) => (
              <button
                key={f}
                className={`rb-filter ${filter === f ? "rb-filter--active" : ""}`}
                onClick={() => setFilter(f)}
              >
                {f === "reference" ? "Pro / reference" : f}
              </button>
            ))}
          </div>
        </section>

        {loadState.kind === "loading" && (
          <section className="section">
            <div className="rb-banner">Loading replays…</div>
          </section>
        )}
        {loadState.kind === "error" && (
          <section className="section">
            <div className="rb-banner rb-banner--error">
              {loadState.message}
              <button className="btn-ghost" onClick={() => void load()}>
                Retry
              </button>
            </div>
          </section>
        )}

        {loadState.kind === "loaded" && (
          <section className="section">
            <div className="rb-list wc3-panel">
              {visible.length === 0 ? (
                <div className="rb-empty">No replays in this view.</div>
              ) : (
                visible.map((r) => (
                  <ReplayRow
                    key={r.replayId}
                    r={r}
                    onClick={() => router.push(`/replays/${r.replayId}`)}
                  />
                ))
              )}
            </div>
            <p className="rb-count">
              {visible.length} replay{visible.length === 1 ? "" : "s"}
              {filter === "all" &&
                ` · ${loadState.rows.filter((r) => r.isReference).length} reference`}
            </p>
          </section>
        )}
      </div>

      <style>{`
        .page { min-height: 100vh; background: radial-gradient(ellipse 80% 50% at 50% -10%, rgba(200,151,42,0.06) 0%, transparent 70%), var(--bg-base); }
        .page-header { border-bottom: 1px solid var(--border-gold); background: var(--bg-void); padding: 0 1.5rem; position: sticky; top: 0; z-index: 10; box-shadow: 0 2px 12px rgba(0,0,0,0.8); }
        .header-inner { max-width: 860px; margin: 0 auto; padding: 0.75rem 0; display: flex; align-items: center; gap: 0.75rem; }
        .site-title { font-size: 1.25rem; }
        .site-sub { font-size: 0.75rem; color: var(--text-muted); letter-spacing: 0.04em; }
        .site-nav { display: flex; align-items: center; gap: 0.5rem; margin-left: auto; }
        .nav-link { font-size: 0.8rem; color: var(--text-muted); text-decoration: none; letter-spacing: 0.04em; transition: color 0.12s; }
        .nav-link:hover { color: var(--text-secondary); }
        .nav-link--active { color: var(--gold); }
        .nav-sep { color: var(--border-gold-bright); font-size: 0.7rem; }

        .page-body { max-width: 860px; margin: 0 auto; padding: 1.5rem 1.5rem 4rem; display: flex; flex-direction: column; gap: 1rem; }
        .rb-title { font-size: 1.15rem; margin-bottom: 0.3rem; }
        .rb-sub { font-size: 0.82rem; color: var(--text-muted); line-height: 1.5; max-width: 640px; }

        .rb-filters { display: flex; gap: 0.4rem; }
        .rb-filter { padding: 0.3rem 0.8rem; background: transparent; border: 1px solid var(--border-dim); border-radius: 3px; color: var(--text-muted); font-size: 0.75rem; cursor: pointer; text-transform: capitalize; transition: all 0.12s; }
        .rb-filter:hover { color: var(--text-secondary); border-color: var(--border-gold-bright); }
        .rb-filter--active { color: var(--gold); border-color: var(--border-gold-bright); background: rgba(200,151,42,0.08); }

        .rb-banner { padding: 0.7rem 1rem; background: var(--bg-raised); border: 1px solid var(--border-dim); border-radius: 3px; font-size: 0.82rem; color: var(--text-muted); display: flex; align-items: center; gap: 0.75rem; }
        .rb-banner--error { border-color: rgba(220,38,38,0.4); color: #fca5a5; }

        .rb-list { overflow: hidden; }
        .rb-empty { padding: 1.25rem 1rem; font-size: 0.85rem; color: var(--text-muted); }
        .rb-row { display: grid; grid-template-columns: 1fr auto auto; gap: 1rem; align-items: center; padding: 0.7rem 1rem; border: none; border-bottom: 1px solid var(--border-dim); background: transparent; color: inherit; text-align: left; width: 100%; cursor: pointer; transition: background 0.1s; }
        .rb-row:last-child { border-bottom: none; }
        .rb-row:hover { background: var(--bg-raised); }
        .rb-row__main { display: flex; align-items: center; gap: 0.75rem; min-width: 0; }
        .rb-matchup { font-size: 1rem; white-space: nowrap; }
        .rb-players { font-size: 0.8rem; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .rb-row__meta { display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0; }
        .rb-duration { font-family: monospace; font-size: 0.8rem; color: var(--gold-dim); }
        .rb-tag { font-size: 0.6rem; font-weight: 700; letter-spacing: 0.08em; padding: 1px 6px; border-radius: 2px; }
        .rb-tag--ref { background: rgba(34,197,94,0.14); color: #22c55e; border: 1px solid rgba(34,197,94,0.3); }
        .rb-tag--status { background: var(--bg-raised); color: var(--text-muted); border: 1px solid var(--border-dim); text-transform: uppercase; }
        .rb-row__flags { display: flex; align-items: center; gap: 0.4rem; flex-shrink: 0; }
        .rb-flag { font-size: 0.65rem; padding: 1px 6px; border-radius: 2px; border: 1px solid var(--border-dim); color: var(--text-muted); white-space: nowrap; }
        .rb-flag--approved { color: var(--gold); border-color: var(--border-gold-bright); }
        .rb-flag--draft { color: var(--text-secondary); }
        .rb-flag--report { color: #6f9bdb; border-color: rgba(58,106,191,0.4); }
        .rb-count { font-size: 0.72rem; color: var(--text-muted); padding-left: 0.2rem; }
        .btn-ghost { padding: 0.3rem 0.6rem; background: transparent; border: 1px solid var(--border-dim); border-radius: 3px; color: var(--text-secondary); font-size: 0.72rem; cursor: pointer; }

        .rb-dataset { display: flex; align-items: center; gap: 1.25rem; padding: 0.8rem 1rem; flex-wrap: wrap; }
        .rb-dataset__stat { display: flex; flex-direction: column; align-items: center; }
        .rb-dataset__big { font-size: 1.4rem; font-weight: 700; color: var(--gold); font-family: monospace; }
        .rb-dataset__label { font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); }
        .rb-dataset__hint { flex: 1; min-width: 200px; font-size: 0.75rem; color: var(--text-muted); line-height: 1.45; }
        .btn-action { display: inline-block; padding: 0.45rem 1.1rem; background: transparent; border: 1px solid var(--border-gold-bright); border-radius: 3px; color: var(--gold); font-size: 0.78rem; font-weight: 600; letter-spacing: 0.04em; cursor: pointer; text-decoration: none; white-space: nowrap; }
        .btn-action:hover { background: rgba(200,151,42,0.1); }
      `}</style>
    </main>
  );
}
