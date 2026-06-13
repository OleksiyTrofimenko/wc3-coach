"use client";

/**
 * /replays/[replayId] — Replay detail
 *
 * Read-only build-order study view (Phase 1): pick a player and see their
 * build/train/upgrade timeline with icons. Phase 2 adds the curation panel.
 */

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { ReplayResponse } from "@/types/analyzer";
import { getReplay } from "@/lib/api";
import { BuildTimeline } from "@/components/BuildTimeline";
import { EntityIcon } from "@/components/EntityIcon";
import { formatMs, raceName } from "@/lib/utils";
import { entityDisplayName, heroRefsForSlot, parseEntityRef } from "@/lib/entities";

type LoadState =
  | { kind: "loading" }
  | { kind: "loaded"; replay: ReplayResponse }
  | { kind: "error"; message: string };

export default function ReplayDetailPage() {
  const params = useParams();
  const router = useRouter();
  const replayId = typeof params.replayId === "string" ? params.replayId : "";

  const [loadState, setLoadState] = useState<LoadState>({ kind: "loading" });
  const [slot, setSlot] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!replayId) return;
    setLoadState({ kind: "loading" });
    try {
      const replay = await getReplay(replayId);
      setLoadState({ kind: "loaded", replay });
      setSlot(replay.players[0]?.slot ?? null);
    } catch (err) {
      setLoadState({
        kind: "error",
        message: err instanceof Error ? err.message : "Failed to load replay",
      });
    }
  }, [replayId]);

  useEffect(() => {
    void load();
  }, [load]);

  const replay = loadState.kind === "loaded" ? loadState.replay : null;
  const activeSlot = slot ?? replay?.players[0]?.slot ?? null;
  const heroRefs =
    replay && activeSlot != null
      ? heroRefsForSlot(replay.events, activeSlot)
      : [];

  return (
    <main className="page">
      <header className="page-header">
        <div className="header-inner">
          <h1 className="site-title wc3-heading">WC3 Coach</h1>
          <span className="site-sub">Replay</span>
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
        <div className="rd-back">
          <button className="btn-ghost" onClick={() => router.push("/replays")}>
            &larr; All replays
          </button>
        </div>

        {loadState.kind === "loading" && (
          <div className="rd-banner">Loading replay…</div>
        )}
        {loadState.kind === "error" && (
          <div className="rd-banner rd-banner--error">
            {loadState.message}
            <button className="btn-ghost" onClick={() => void load()}>
              Retry
            </button>
          </div>
        )}

        {replay && (
          <>
            {/* Player selector */}
            <section className="section">
              <div className="rd-players wc3-panel">
                {replay.players.map((p) => (
                  <button
                    key={p.slot}
                    className={`rd-player ${activeSlot === p.slot ? "rd-player--active" : ""}`}
                    onClick={() => setSlot(p.slot)}
                  >
                    <span className="rd-player__name">{p.playerName}</span>
                    <span className="rd-player__race">{raceName(p.raceId)}</span>
                    <span className={`rd-player__result rd-player__result--${p.result}`}>
                      {p.result}
                    </span>
                  </button>
                ))}
                <span className="rd-meta">
                  {replay.durationMs ? formatMs(replay.durationMs) : "—"}
                </span>
              </div>
            </section>

            {/* Heroes for the active player */}
            {heroRefs.length > 0 && (
              <section className="section">
                <div className="rd-heroes wc3-panel">
                  <span className="rd-heroes__label">Heroes</span>
                  {heroRefs.map((ref) => (
                    <span className="rd-hero" key={ref}>
                      <EntityIcon entityRef={ref} size={24} />
                      <span className="rd-hero__name">
                        {entityDisplayName(parseEntityRef(ref).key)}
                      </span>
                    </span>
                  ))}
                </div>
              </section>
            )}

            {/* Build order */}
            {activeSlot != null && (
              <section className="section">
                <BuildTimeline
                  events={replay.events}
                  slot={activeSlot}
                  playerName={
                    replay.players.find((p) => p.slot === activeSlot)?.playerName
                  }
                />
              </section>
            )}
          </>
        )}
      </div>

      <style>{`
        .page { min-height: 100vh; background: radial-gradient(ellipse 80% 50% at 50% -10%, rgba(200,151,42,0.06) 0%, transparent 70%), var(--bg-base); }
        .page-header { border-bottom: 1px solid var(--border-gold); background: var(--bg-void); padding: 0 1.5rem; position: sticky; top: 0; z-index: 10; box-shadow: 0 2px 12px rgba(0,0,0,0.8); }
        .header-inner { max-width: 860px; margin: 0 auto; padding: 0.75rem 0; display: flex; align-items: center; gap: 0.75rem; }
        .site-title { font-size: 1.25rem; }
        .site-sub { font-size: 0.75rem; color: var(--text-muted); letter-spacing: 0.04em; }
        .site-nav { display: flex; align-items: center; gap: 0.5rem; margin-left: auto; }
        .nav-link { font-size: 0.8rem; color: var(--text-muted); text-decoration: none; letter-spacing: 0.04em; }
        .nav-link:hover { color: var(--text-secondary); }
        .nav-link--active { color: var(--gold); }
        .nav-sep { color: var(--border-gold-bright); font-size: 0.7rem; }

        .page-body { max-width: 860px; margin: 0 auto; padding: 1.5rem 1.5rem 4rem; display: flex; flex-direction: column; gap: 1rem; }
        .rd-back { }
        .btn-ghost { padding: 0.3rem 0.7rem; background: transparent; border: 1px solid var(--border-dim); border-radius: 3px; color: var(--text-secondary); font-size: 0.75rem; cursor: pointer; }
        .btn-ghost:hover { border-color: var(--border-gold-bright); color: var(--gold); }
        .rd-banner { padding: 0.7rem 1rem; background: var(--bg-raised); border: 1px solid var(--border-dim); border-radius: 3px; font-size: 0.82rem; color: var(--text-muted); display: flex; gap: 0.75rem; align-items: center; }
        .rd-banner--error { border-color: rgba(220,38,38,0.4); color: #fca5a5; }

        .rd-players { display: flex; align-items: center; gap: 0.5rem; padding: 0.6rem 0.8rem; flex-wrap: wrap; }
        .rd-player { display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0.8rem; background: var(--bg-void); border: 1px solid var(--border-dim); border-radius: 3px; cursor: pointer; color: inherit; }
        .rd-player--active { border-color: var(--border-gold-bright); background: rgba(200,151,42,0.08); }
        .rd-player__name { font-size: 0.85rem; color: var(--text-primary); font-weight: 600; }
        .rd-player__race { font-size: 0.72rem; color: var(--text-muted); }
        .rd-player__result { font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.06em; padding: 1px 5px; border-radius: 2px; }
        .rd-player__result--win { color: #22c55e; }
        .rd-player__result--loss { color: #ef4444; }
        .rd-player__result--unknown { color: var(--text-muted); }
        .rd-meta { margin-left: auto; font-family: monospace; font-size: 0.82rem; color: var(--gold-dim); }

        .rd-heroes { display: flex; align-items: center; gap: 0.75rem; padding: 0.6rem 0.9rem; flex-wrap: wrap; }
        .rd-heroes__label { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-muted); }
        .rd-hero { display: inline-flex; align-items: center; gap: 0.35rem; }
        .rd-hero__name { font-size: 0.8rem; color: var(--text-secondary); }
      `}</style>
    </main>
  );
}
