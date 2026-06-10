"use client";

import { formatMs, raceName, raceColor, matchupLabel, humanizeMap } from "@/lib/utils";
import type { ReplayResponse } from "@/types/analyzer";

interface GameSummaryProps {
  replay: ReplayResponse;
  orcSlot: number | null;
}

export function GameSummary({ replay, orcSlot }: GameSummaryProps) {
  const matchup = matchupLabel(replay.players.map((p) => p.raceId));
  const mapName = humanizeMap(replay.mapId);

  return (
    <div className="game-summary wc3-panel" style={{ padding: "1.25rem 1.5rem" }}>
      {/* Header row */}
      <div className="gs-header">
        <span className="gs-matchup wc3-heading">{matchup}</span>
        <span className="gs-map">{mapName}</span>
        {replay.durationMs && (
          <span className="gs-duration">
            {formatMs(replay.durationMs)}
          </span>
        )}
      </div>

      <hr className="wc3-divider" style={{ margin: "0.75rem 0" }} />

      {/* Players */}
      <div className="gs-players">
        {replay.players.map((p) => {
          const isOrc = p.slot === orcSlot;
          const color = raceColor(p.raceId);
          return (
            <div
              key={p.slot}
              className={`gs-player ${isOrc ? "gs-player--coached" : ""}`}
              style={{ borderLeftColor: color }}
            >
              <div className="gs-player__name">
                {p.playerName}
                {isOrc && (
                  <span className="coached-tag">COACHING TARGET</span>
                )}
              </div>
              <div className="gs-player__meta">
                <span className="gs-player__race" style={{ color }}>
                  {raceName(p.raceId)}
                </span>
                <span className="gs-player__apm">
                  <span className="meta-label">APM</span>
                  <span className="meta-value">{p.apm}</span>
                </span>
                {p.result !== "unknown" && (
                  <span
                    className={`gs-player__result result--${p.result}`}
                  >
                    {p.result.toUpperCase()}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        .game-summary { }
        .gs-header {
          display: flex;
          align-items: center;
          gap: 1rem;
          flex-wrap: wrap;
        }
        .gs-matchup {
          font-size: 1.6rem;
        }
        .gs-map {
          color: var(--text-secondary);
          font-size: 0.9rem;
          flex: 1;
        }
        .gs-duration {
          font-family: monospace;
          color: var(--gold-dim);
          font-size: 0.95rem;
        }
        .gs-players {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .gs-player {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.5rem 0.75rem;
          border-left: 3px solid transparent;
          border-radius: 0 3px 3px 0;
          background: var(--bg-raised);
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        .gs-player--coached {
          background: rgba(184, 32, 32, 0.07);
          border-left-width: 4px;
        }
        .gs-player__name {
          font-weight: 600;
          color: var(--text-primary);
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .coached-tag {
          font-size: 0.6rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          background: var(--orc-red);
          color: #fff;
          padding: 2px 6px;
          border-radius: 2px;
        }
        .gs-player__meta {
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        .gs-player__race {
          font-size: 0.85rem;
          font-weight: 600;
        }
        .gs-player__apm {
          display: flex;
          align-items: center;
          gap: 0.3rem;
        }
        .meta-label {
          font-size: 0.7rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .meta-value {
          font-size: 0.95rem;
          font-weight: 700;
          color: var(--gold-light);
          font-family: monospace;
        }
        .result--win  { color: #22c55e; font-size: 0.8rem; font-weight: 700; }
        .result--loss { color: #ef4444; font-size: 0.8rem; font-weight: 700; }
      `}</style>
    </div>
  );
}
