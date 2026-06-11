"use client";

/**
 * /trainer — APM Trainer page (T4.1 / T4.2)
 *
 * Keyboard capture notes:
 *  - We attach a global keydown listener to the window (via useEffect) with
 *    { capture: true } so the engine sees all keys before React synthetic events.
 *  - We call e.preventDefault() only when the engine returns true (consumed),
 *    which covers Ctrl+1..9 (normally switches browser tabs) and other collisions.
 *  - We do NOT capture Tab, Escape, or F5/F12 (browser/DevTools) — those pass through.
 *    If a drill step requires Tab, the player may see the browser focus move; that
 *    is a documented UX limitation. Escape is deliberately reserved for "stop drill".
 *  - The page is fullscreen-focusable; we render a visible focus trap div so the
 *    user doesn't accidentally lose keyboard focus to the browser chrome.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import type { EngineState, DrillScenario } from "@/trainer/engine";
import {
  DrillEngine,
  HOTKEY_SCENARIOS,
  keyComboLabel,
  TOTAL_COUNTDOWN_MS,
  COUNTDOWN_STEP_MS,
} from "@/trainer/engine";

// ---------------------------------------------------------------------------
// Persistence stub (T4.6)
// ---------------------------------------------------------------------------

/**
 * TODO T4.6: POST result to /api/apm-sessions when the backend endpoint is
 * wired. For now, we log to console and store in localStorage as a stopgap so
 * users don't lose data across sessions.
 */
function persistResult(result: import("@wc3-coach/shared-types").DrillResult): void {
  try {
    const key = "wc3coach:drillResults";
    const existing = JSON.parse(localStorage.getItem(key) ?? "[]") as unknown[];
    existing.push(result);
    // Keep last 100 results locally
    if (existing.length > 100) existing.splice(0, existing.length - 100);
    localStorage.setItem(key, JSON.stringify(existing));
  } catch {
    // localStorage may be blocked in some environments — non-fatal.
  }
  console.info("[T4.6 stub] DrillResult persisted to localStorage:", result);
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function TrainerPage() {
  // The engine instance lives in a ref — stable across renders.
  const engineRef = useRef<DrillEngine | null>(null);
  if (engineRef.current === null) {
    engineRef.current = new DrillEngine(() => performance.now());
  }

  const [engineState, setEngineState] = useState<EngineState>({
    phase: "idle",
    scenario: null,
    currentStepIndex: 0,
    currentStep: null,
    elapsedMs: 0,
    stepRemainingMs: 0,
    correctCount: 0,
    totalCount: 0,
    results: [],
    drillResult: null,
  });

  const [selectedScenario, setSelectedScenario] = useState<DrillScenario | null>(null);
  const [countdownValue, setCountdownValue] = useState(3);
  const tickRef = useRef<number | null>(null);

  // Subscribe to engine state changes
  useEffect(() => {
    const engine = engineRef.current!;
    const unsub = engine.subscribe((s) => {
      setEngineState(s);
      // Persist when finished
      if (s.phase === "finished" && s.drillResult) {
        persistResult(s.drillResult);
      }
    });
    return unsub;
  }, []);

  // Animation-frame ticker — drives countdown expiry and step window expiry.
  const startTicker = useCallback(() => {
    if (tickRef.current !== null) return;
    const tick = () => {
      engineRef.current!.tick();
      // Update countdown value for display
      setCountdownValue(engineRef.current!.getCountdownValue());
      tickRef.current = requestAnimationFrame(tick);
    };
    tickRef.current = requestAnimationFrame(tick);
  }, []);

  const stopTicker = useCallback(() => {
    if (tickRef.current !== null) {
      cancelAnimationFrame(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  // Stop ticker when drill finishes.
  useEffect(() => {
    if (engineState.phase === "finished" || engineState.phase === "idle") {
      stopTicker();
    }
  }, [engineState.phase, stopTicker]);

  // Global keydown handler.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const engine = engineRef.current!;

      // Escape: stop/reset drill
      if (e.key === "Escape") {
        engine.reset();
        stopTicker();
        return;
      }

      // Don't intercept F5, F12, browser meta keys
      if (e.key === "F5" || e.key === "F12") return;
      if (e.metaKey) return;

      const consumed = engine.handleKey(e.key, e.ctrlKey, e.shiftKey, e.altKey);
      if (consumed) {
        // Prevent browser from acting on the key (e.g. Ctrl+1 = switch tab).
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, [stopTicker]);

  // Scenario selection
  const handleSelectScenario = (scenario: DrillScenario) => {
    const engine = engineRef.current!;
    engine.reset();
    stopTicker();
    setSelectedScenario(scenario);
    engine.load(scenario);
  };

  // Start drill
  const handleStart = () => {
    engineRef.current!.start();
    setCountdownValue(3);
    startTicker();
  };

  // Reset
  const handleReset = () => {
    engineRef.current!.reset();
    stopTicker();
  };

  const { phase, currentStep, elapsedMs, stepRemainingMs, correctCount, totalCount, drillResult } =
    engineState;

  const progressPct = selectedScenario
    ? Math.min(100, (elapsedMs / selectedScenario.totalDurationMs) * 100)
    : 0;

  const stepWindowPct = currentStep
    ? Math.max(
        0,
        (stepRemainingMs /
          (currentStep.windowMs ?? selectedScenario?.defaultWindowMs ?? 2000)) *
          100
      )
    : 0;

  const accuracy = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;

  return (
    <main className="trainer-page">
      {/* ---- Header ---- */}
      <header className="page-header">
        <div className="header-inner">
          <a href="/" className="site-title wc3-heading" style={{ textDecoration: "none" }}>
            WC3 Coach
          </a>
          <nav className="site-nav">
            <a href="/" className="nav-link">
              Analyzer
            </a>
            <span className="nav-sep">|</span>
            <a href="/trainer" className="nav-link nav-link--active">
              APM Trainer
            </a>
          </nav>
        </div>
      </header>

      <div className="trainer-body">
        {/* ---- Left: scenario picker ---- */}
        <aside className="scenario-panel wc3-panel">
          <h2 className="wc3-heading panel-heading">Drills</h2>
          <ul className="scenario-list" role="list">
            {HOTKEY_SCENARIOS.map((s) => (
              <li key={s.id}>
                <button
                  className={`scenario-item ${selectedScenario?.id === s.id ? "scenario-item--active" : ""}`}
                  onClick={() => handleSelectScenario(s)}
                  disabled={phase === "countdown" || phase === "running"}
                >
                  <span className="scenario-title">{s.title}</span>
                  <span className="scenario-desc">{s.description}</span>
                  <span className="scenario-meta">
                    {s.totalDurationMs / 1000}s &middot; {s.defaultWindowMs / 1000}s window
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* ---- Center: drill arena ---- */}
        <div className="drill-arena">
          {/* Idle / no scenario selected */}
          {phase === "idle" && !selectedScenario && (
            <div className="arena-placeholder">
              <p className="arena-hint">Select a drill from the list to begin.</p>
              <p className="arena-hint-sub">
                Drills train the exact in-game key bindings (WC3 Classic layout).
              </p>
            </div>
          )}

          {/* Idle with scenario loaded — ready to start */}
          {phase === "idle" && selectedScenario && (
            <div className="arena-ready wc3-panel-elevated">
              <h2 className="wc3-heading drill-title">{selectedScenario.title}</h2>
              <p className="drill-desc">{selectedScenario.description}</p>
              <div className="drill-meta-row">
                <span className="drill-meta-item">
                  Duration: <strong>{selectedScenario.totalDurationMs / 1000}s</strong>
                </span>
                <span className="drill-meta-item">
                  Window: <strong>{selectedScenario.defaultWindowMs / 1000}s / step</strong>
                </span>
                <span className="drill-meta-item">
                  Mode: <strong>{selectedScenario.repeat ? "Repeat" : "Once"}</strong>
                </span>
              </div>
              <button className="btn-start" onClick={handleStart}>
                Start Drill
              </button>
              <p className="arena-hint-sub" style={{ marginTop: "0.75rem" }}>
                Press <kbd>Esc</kbd> at any time to stop.
              </p>
            </div>
          )}

          {/* Countdown */}
          {phase === "countdown" && (
            <div className="arena-countdown">
              <span className="countdown-number">{countdownValue}</span>
              <p className="countdown-label">Get ready&hellip;</p>
            </div>
          )}

          {/* Running */}
          {phase === "running" && currentStep && (
            <div className="arena-running">
              {/* Progress bar — total drill time */}
              {selectedScenario && selectedScenario.totalDurationMs > 0 && (
                <div className="progress-bar-wrap" aria-label="Drill progress">
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              )}

              {/* Step prompt */}
              <div className="prompt-card wc3-panel-elevated">
                <p className="prompt-text">{currentStep.prompt}</p>
                {currentStep.subPrompt && (
                  <p className="prompt-sub">{currentStep.subPrompt}</p>
                )}

                {/* Key target display */}
                <div className="key-target">
                  <kbd className="key-badge">
                    {keyComboLabel(currentStep.target)}
                  </kbd>
                </div>

                {/* Step reaction-window bar */}
                <div
                  className="step-timer-bar"
                  aria-label="Step reaction window"
                >
                  <div
                    className="step-timer-fill"
                    style={{ width: `${stepWindowPct}%` }}
                  />
                </div>
              </div>

              {/* Live score strip */}
              <div className="live-score">
                <div className="score-item">
                  <span className="score-label">Correct</span>
                  <span className="score-value score-value--green">{correctCount}</span>
                </div>
                <div className="score-item">
                  <span className="score-label">Total</span>
                  <span className="score-value">{totalCount}</span>
                </div>
                <div className="score-item">
                  <span className="score-label">Accuracy</span>
                  <span className="score-value">{accuracy}%</span>
                </div>
                <div className="score-item">
                  <span className="score-label">Elapsed</span>
                  <span className="score-value">{Math.floor(elapsedMs / 1000)}s</span>
                </div>
              </div>
            </div>
          )}

          {/* Finished — results summary */}
          {phase === "finished" && drillResult && (
            <div className="arena-results wc3-panel-elevated">
              <h2 className="wc3-heading results-title">Session Complete</h2>

              <div className="results-grid">
                <ResultCard
                  label="Score"
                  value={drillResult.score.toString()}
                  unit="/ 1000"
                  highlight
                />
                <ResultCard
                  label="Accuracy"
                  value={Math.round(drillResult.accuracy * 100).toString()}
                  unit="%"
                />
                <ResultCard
                  label="EPM"
                  value={Math.round(drillResult.epm).toString()}
                  unit="eff/min"
                />
                <ResultCard
                  label="APM"
                  value={Math.round(drillResult.apm).toString()}
                  unit="actions/min"
                />
                <ResultCard
                  label="Avg Reaction"
                  value={Math.round(drillResult.reactionMs).toString()}
                  unit="ms"
                />
                <ResultCard
                  label="Duration"
                  value={Math.round(drillResult.durationMs / 1000).toString()}
                  unit="s"
                />
              </div>

              {/* Checkpoint strip */}
              {drillResult.checkpoints && drillResult.checkpoints.length > 0 && (
                <div className="checkpoint-strip" aria-label="Step-by-step results">
                  {drillResult.checkpoints.map((cp, i) => (
                    <span
                      key={i}
                      className={`checkpoint-dot ${cp.ok ? "checkpoint-dot--ok" : "checkpoint-dot--miss"}`}
                      title={`Step ${i + 1}: ${cp.ok ? "correct" : "miss"} @ ${(cp.tMs / 1000).toFixed(1)}s`}
                    />
                  ))}
                </div>
              )}

              <div className="results-actions">
                <button className="btn-start" onClick={handleStart}>
                  Drill Again
                </button>
                <button className="btn-secondary" onClick={handleReset}>
                  Change Drill
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        /* ---- Layout ---- */
        .trainer-page {
          min-height: 100vh;
          background:
            radial-gradient(ellipse 80% 50% at 50% -10%, rgba(200,151,42,0.06) 0%, transparent 70%),
            var(--bg-base);
          display: flex;
          flex-direction: column;
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
          gap: 1.5rem;
        }
        .site-title { font-size: 1.15rem; }

        .site-nav {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-left: auto;
        }
        .nav-link {
          font-size: 0.8rem;
          color: var(--text-muted);
          text-decoration: none;
          letter-spacing: 0.04em;
          transition: color 0.12s;
        }
        .nav-link:hover { color: var(--text-secondary); }
        .nav-link--active { color: var(--gold); }
        .nav-sep { color: var(--border-gold-bright); font-size: 0.7rem; }

        .trainer-body {
          max-width: 1100px;
          margin: 0 auto;
          padding: 1.5rem;
          display: grid;
          grid-template-columns: 260px 1fr;
          gap: 1.25rem;
          align-items: start;
          flex: 1;
        }

        /* ---- Scenario panel ---- */
        .scenario-panel {
          padding: 1rem;
        }
        .panel-heading {
          font-size: 0.85rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          margin-bottom: 0.75rem;
        }
        .scenario-list {
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }
        .scenario-item {
          width: 100%;
          text-align: left;
          background: transparent;
          border: 1px solid var(--border-dim);
          border-radius: 3px;
          padding: 0.6rem 0.75rem;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
          transition: border-color 0.12s, background 0.12s;
        }
        .scenario-item:hover:not(:disabled) {
          border-color: var(--border-gold-bright);
          background: rgba(200,151,42,0.04);
        }
        .scenario-item--active {
          border-color: var(--gold);
          background: rgba(200,151,42,0.08);
        }
        .scenario-item:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .scenario-title {
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--text-primary);
        }
        .scenario-desc {
          font-size: 0.72rem;
          color: var(--text-muted);
          line-height: 1.4;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .scenario-meta {
          font-size: 0.68rem;
          color: var(--gold-dim);
          margin-top: 0.15rem;
        }

        /* ---- Drill arena ---- */
        .drill-arena {
          min-height: 480px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .arena-placeholder {
          text-align: center;
        }
        .arena-hint {
          font-size: 1.05rem;
          color: var(--text-secondary);
          margin-bottom: 0.5rem;
        }
        .arena-hint-sub {
          font-size: 0.8rem;
          color: var(--text-muted);
        }

        /* ---- Ready state ---- */
        .arena-ready {
          padding: 2rem 2.5rem;
          text-align: center;
          max-width: 520px;
          width: 100%;
        }
        .drill-title {
          font-size: 1.4rem;
          margin-bottom: 0.6rem;
        }
        .drill-desc {
          font-size: 0.88rem;
          color: var(--text-secondary);
          line-height: 1.6;
          margin-bottom: 1.25rem;
        }
        .drill-meta-row {
          display: flex;
          justify-content: center;
          gap: 1.25rem;
          margin-bottom: 1.5rem;
        }
        .drill-meta-item {
          font-size: 0.78rem;
          color: var(--text-muted);
        }
        .drill-meta-item strong {
          color: var(--text-secondary);
        }

        /* ---- Countdown ---- */
        .arena-countdown {
          text-align: center;
        }
        .countdown-number {
          display: block;
          font-size: 6rem;
          font-weight: 700;
          color: var(--gold);
          text-shadow: 0 0 40px rgba(200,151,42,0.6);
          line-height: 1;
          animation: countdownPop 0.4s ease-out;
        }
        @keyframes countdownPop {
          from { transform: scale(1.3); opacity: 0; }
          to   { transform: scale(1);   opacity: 1; }
        }
        .countdown-label {
          font-size: 1rem;
          color: var(--text-muted);
          margin-top: 0.5rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        /* ---- Running ---- */
        .arena-running {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }

        .progress-bar-wrap {
          width: 100%;
          height: 4px;
          background: var(--bg-elevated);
          border-radius: 2px;
          overflow: hidden;
        }
        .progress-bar-fill {
          height: 100%;
          background: var(--gold-dim);
          transition: width 0.1s linear;
        }

        .prompt-card {
          padding: 2rem 2.5rem;
          text-align: center;
        }
        .prompt-text {
          font-size: 1.3rem;
          font-weight: 600;
          color: var(--text-primary);
          margin-bottom: 0.4rem;
        }
        .prompt-sub {
          font-size: 0.85rem;
          color: var(--text-muted);
          margin-bottom: 1.25rem;
        }

        .key-target {
          margin: 0.75rem 0 1.25rem;
        }
        .key-badge {
          display: inline-block;
          background: var(--bg-raised);
          border: 2px solid var(--gold);
          border-radius: 6px;
          padding: 0.5rem 1.1rem;
          font-size: 1.6rem;
          font-family: 'Segoe UI', monospace, sans-serif;
          font-weight: 700;
          color: var(--gold);
          letter-spacing: 0.04em;
          box-shadow:
            0 0 0 1px var(--border-gold),
            0 4px 16px rgba(200,151,42,0.2);
        }

        .step-timer-bar {
          width: 100%;
          height: 3px;
          background: var(--bg-elevated);
          border-radius: 2px;
          overflow: hidden;
          margin-top: 1rem;
        }
        .step-timer-fill {
          height: 100%;
          background: var(--gold);
          transition: width 0.05s linear;
        }

        .live-score {
          display: flex;
          justify-content: center;
          gap: 2rem;
        }
        .score-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.2rem;
        }
        .score-label {
          font-size: 0.68rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--text-muted);
        }
        .score-value {
          font-size: 1.1rem;
          font-weight: 700;
          color: var(--text-secondary);
        }
        .score-value--green { color: #4ade80; }

        /* ---- Results ---- */
        .arena-results {
          padding: 2rem 2.5rem;
          width: 100%;
          max-width: 600px;
        }
        .results-title {
          font-size: 1.3rem;
          text-align: center;
          margin-bottom: 1.5rem;
        }

        .results-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 0.75rem;
          margin-bottom: 1.5rem;
        }

        .checkpoint-strip {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          justify-content: center;
          margin-bottom: 1.5rem;
        }
        .checkpoint-dot {
          display: inline-block;
          width: 10px;
          height: 10px;
          border-radius: 50%;
        }
        .checkpoint-dot--ok   { background: #4ade80; }
        .checkpoint-dot--miss { background: var(--sev-critical); }

        .results-actions {
          display: flex;
          justify-content: center;
          gap: 0.75rem;
        }

        /* ---- Buttons ---- */
        .btn-start {
          padding: 0.6rem 1.75rem;
          background: var(--gold-dim);
          border: 1px solid var(--gold);
          border-radius: 3px;
          color: #0a0a0c;
          font-size: 0.9rem;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          cursor: pointer;
          transition: background 0.12s, border-color 0.12s;
        }
        .btn-start:hover {
          background: var(--gold);
        }
        .btn-secondary {
          padding: 0.6rem 1.25rem;
          background: transparent;
          border: 1px solid var(--border-gold-bright);
          border-radius: 3px;
          color: var(--gold);
          font-size: 0.85rem;
          font-weight: 600;
          letter-spacing: 0.04em;
          cursor: pointer;
          transition: background 0.12s;
        }
        .btn-secondary:hover {
          background: rgba(200,151,42,0.1);
        }

        /* ---- Kbd ---- */
        kbd {
          font-family: inherit;
        }

        @media (max-width: 700px) {
          .trainer-body {
            grid-template-columns: 1fr;
          }
          .results-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
      `}</style>
    </main>
  );
}

// ---------------------------------------------------------------------------
// ResultCard sub-component (inline, no need for separate file)
// ---------------------------------------------------------------------------

function ResultCard({
  label,
  value,
  unit,
  highlight = false,
}: {
  label: string;
  value: string;
  unit: string;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        background: "var(--bg-elevated)",
        border: `1px solid ${highlight ? "var(--gold)" : "var(--border-dim)"}`,
        borderRadius: "4px",
        padding: "0.75rem 0.5rem",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: "0.65rem",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--text-muted)",
          marginBottom: "0.3rem",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: highlight ? "1.6rem" : "1.2rem",
          fontWeight: 700,
          color: highlight ? "var(--gold)" : "var(--text-primary)",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
        {unit}
      </div>
    </div>
  );
}
