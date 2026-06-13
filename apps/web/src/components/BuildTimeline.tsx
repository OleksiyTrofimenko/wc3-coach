"use client";

/**
 * BuildTimeline — the player's key build-order events, with icons.
 *
 * Surfaces the parsed game_events (build/train/upgrade/research/learn_skill) that
 * were previously fetched but never shown. Each row: entity icon + name + the
 * game time it happened + an action tag. Filtered to one player slot (the coached
 * Orc player) and ordered by time.
 */

import { EntityIcon } from "@/components/EntityIcon";
import { entityDisplayName, parseEntityRef } from "@/lib/entities";
import { formatMs } from "@/lib/utils";

/** Minimal event shape (matches ReplayResponse.events). */
export interface TimelineEvent {
  slot: number;
  tMs: number;
  type: string;
  entityRef: string;
}

/** Event types that make up a readable build order, with a short action label. */
const ACTION_LABELS: Record<string, string> = {
  build: "build",
  train: "train",
  upgrade: "upgrade",
  research: "research",
  learn_skill: "learn",
};

interface BuildTimelineProps {
  events: TimelineEvent[];
  /** The slot to show (the coached Orc player). */
  slot: number;
  playerName?: string;
}

export function BuildTimeline({ events, slot, playerName }: BuildTimelineProps) {
  const rows = events
    .filter((e) => e.slot === slot && e.type in ACTION_LABELS && e.entityRef)
    .sort((a, b) => a.tMs - b.tMs);

  return (
    <div className="bt wc3-panel">
      <div className="bt-header">
        <h2 className="wc3-heading bt-title">Build Order</h2>
        <span className="bt-sub">
          {playerName ? `${playerName} — ` : ""}
          {rows.length} key action{rows.length === 1 ? "" : "s"}
        </span>
      </div>

      <hr className="wc3-divider" style={{ margin: "0.75rem 0 0.5rem" }} />

      {rows.length === 0 ? (
        <p className="bt-empty">No build-order events recorded for this player.</p>
      ) : (
        <ol className="bt-list">
          {rows.map((e, i) => {
            const { key } = parseEntityRef(e.entityRef);
            return (
              <li className="bt-row" key={`${e.tMs}-${e.entityRef}-${i}`}>
                <span className="bt-time">{formatMs(e.tMs)}</span>
                <EntityIcon entityRef={e.entityRef} size={26} />
                <span className="bt-name">{entityDisplayName(key)}</span>
                <span className={`bt-action bt-action--${e.type}`}>
                  {ACTION_LABELS[e.type]}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <style>{`
        .bt { padding: 1.25rem 1.5rem; }
        .bt-header { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
        .bt-title { font-size: 1.05rem; }
        .bt-sub { font-size: 0.75rem; color: var(--text-muted); letter-spacing: 0.03em; }
        .bt-empty { font-size: 0.85rem; color: var(--text-muted); padding: 0.5rem 0; }

        .bt-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0.3rem;
          max-height: 460px;
          overflow-y: auto;
        }
        .bt-row {
          display: grid;
          grid-template-columns: 52px 26px 1fr auto;
          gap: 0.65rem;
          align-items: center;
          padding: 0.3rem 0.4rem;
          border-bottom: 1px solid var(--border-dim);
        }
        .bt-row:last-child { border-bottom: none; }
        .bt-row:hover { background: var(--bg-raised); }

        .bt-time {
          font-family: monospace;
          font-size: 0.78rem;
          color: var(--gold-dim);
          text-align: right;
        }
        .bt-name {
          font-size: 0.85rem;
          color: var(--text-secondary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .bt-action {
          font-size: 0.6rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          padding: 1px 6px;
          border-radius: 2px;
          border: 1px solid var(--border-dim);
          color: var(--text-muted);
          background: var(--bg-elevated);
          white-space: nowrap;
        }
        .bt-action--build    { color: #d8a23a; border-color: var(--border-gold); }
        .bt-action--train    { color: #6f9bdb; border-color: rgba(58,106,191,0.4); }
        .bt-action--upgrade,
        .bt-action--research { color: #84c14a; border-color: rgba(107,170,42,0.4); }
        .bt-action--learn_skill { color: #b58bdb; border-color: rgba(122,61,191,0.4); }
      `}</style>
    </div>
  );
}
