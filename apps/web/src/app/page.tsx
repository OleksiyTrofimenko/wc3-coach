"use client";

import { useState, useCallback, useRef } from "react";
import type { BenchmarkResult, CoachReport } from "@wc3-coach/shared-types";
import type { ReplayResponse, ScoredProblem } from "@/types/analyzer";
import { uploadReplay, getReplay, runBenchmarks, getTopProblems, runCoachReport } from "@/lib/api";
import { UploadZone } from "@/components/UploadZone";
import { StatusBar } from "@/components/StatusBar";
import { GameSummary } from "@/components/GameSummary";
import { ProblemCards } from "@/components/ProblemCards";
import { BenchmarkTable } from "@/components/BenchmarkTable";
import { CoachReport as CoachReportView } from "@/components/CoachReport";
import { BuildTimeline } from "@/components/BuildTimeline";
import { heroRefsForSlot } from "@/lib/entities";

type Phase =
  | { kind: "idle" }
  | { kind: "uploading" }
  | { kind: "polling"; replayId: string; status: "pending" | "parsing" }
  | { kind: "benchmarking"; replayId: string; replay: ReplayResponse }
  | { kind: "done"; replay: ReplayResponse; problems: ScoredProblem[]; benchmarks: BenchmarkResult[] }
  | { kind: "no-orc"; replay: ReplayResponse }
  | { kind: "error"; message: string };

const POLL_INTERVAL_MS = 1500;

/** Three-state discriminated union for the async LLM coach report. */
type CoachState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "loaded"; report: CoachReport }
  | { kind: "error"; message: string };

export default function AnalyzerPage() {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [coachState, setCoachState] = useState<CoachState>({ kind: "idle" });
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guard flag: set to true when reset() fires so in-flight LLM calls don't
  // update state after the user has already reset the page.
  const coachCancelledRef = useRef(false);

  const stopPoll = () => {
    if (pollRef.current !== null) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
  };

  const startPolling = useCallback((replayId: string) => {
    const poll = async () => {
      try {
        const replay = await getReplay(replayId);

        if (replay.status === "error") {
          stopPoll();
          setPhase({ kind: "error", message: `Parsing failed for replay ${replayId}` });
          return;
        }

        if (replay.status === "done") {
          stopPoll();
          // Find orc player
          const orcPlayer = replay.players.find((p) => p.raceId === "race:orc");
          if (!orcPlayer) {
            setPhase({ kind: "no-orc", replay });
            return;
          }

          setPhase({ kind: "benchmarking", replayId, replay });

          try {
            const [benchmarks, problems] = await Promise.all([
              runBenchmarks(replayId),
              getTopProblems(replayId, orcPlayer.slot, 5),
            ]);
            setPhase({ kind: "done", replay, problems, benchmarks });

            // Kick off the slow LLM coach report asynchronously — do NOT
            // block the benchmarks/problems display above.
            coachCancelledRef.current = false;
            setCoachState({ kind: "loading" });
            runCoachReport(replayId).then(
              (report) => {
                if (!coachCancelledRef.current) {
                  setCoachState({ kind: "loaded", report });
                }
              },
              (err: unknown) => {
                if (!coachCancelledRef.current) {
                  const msg = err instanceof Error ? err.message : "Unknown error";
                  // Surface a user-friendly hint for the common 503 case.
                  const friendly = msg.includes("503")
                    ? "Coaching review unavailable — is the local LLM (Ollama) running?"
                    : `Coaching review unavailable: ${msg}`;
                  setCoachState({ kind: "error", message: friendly });
                }
              }
            );
          } catch (err) {
            setPhase({
              kind: "error",
              message: err instanceof Error ? err.message : "Benchmark error",
            });
          }
          return;
        }

        // Still pending/parsing — keep polling
        setPhase({ kind: "polling", replayId, status: replay.status as "pending" | "parsing" });
        pollRef.current = setTimeout(poll, POLL_INTERVAL_MS);
      } catch (err) {
        stopPoll();
        setPhase({
          kind: "error",
          message: err instanceof Error ? err.message : "Unknown error",
        });
      }
    };

    poll();
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      stopPoll();
      setPhase({ kind: "uploading" });
      try {
        const { replayId } = await uploadReplay(file);
        setPhase({ kind: "polling", replayId, status: "pending" });
        startPolling(replayId);
      } catch (err) {
        setPhase({
          kind: "error",
          message: err instanceof Error ? err.message : "Upload failed",
        });
      }
    },
    [startPolling]
  );

  const reset = () => {
    stopPoll();
    coachCancelledRef.current = true;
    setPhase({ kind: "idle" });
    setCoachState({ kind: "idle" });
  };

  const isBusy =
    phase.kind === "uploading" ||
    phase.kind === "polling" ||
    phase.kind === "benchmarking";

  // Extract orc slot for use across render
  const orcPlayer =
    phase.kind === "done" || phase.kind === "no-orc" || phase.kind === "benchmarking"
      ? phase.replay.players.find((p) => p.raceId === "race:orc") ?? null
      : null;

  return (
    <main className="page">
      {/* Header */}
      <header className="page-header">
        <div className="header-inner">
          <h1 className="site-title wc3-heading">WC3 Coach</h1>
          <span className="site-sub">Replay Analyzer — Orc Sanctuary</span>
          <nav className="site-nav">
            <a href="/" className="nav-link nav-link--active">Analyzer</a>
            <span className="nav-sep">|</span>
            <a href="/history" className="nav-link">History</a>
            <span className="nav-sep">|</span>
            <a href="/replays" className="nav-link">Replays</a>
            <span className="nav-sep">|</span>
            <a href="/trainer" className="nav-link">APM Trainer</a>
            <span className="nav-sep">|</span>
            <a href="/admin/references" className="nav-link">Admin</a>
          </nav>
        </div>
      </header>

      <div className="page-body">
        {/* Upload zone — always visible, disabled when busy */}
        <section className="section">
          <UploadZone onFile={handleFile} disabled={isBusy} />
        </section>

        {/* Status feedback */}
        {(phase.kind === "uploading" ||
          phase.kind === "polling" ||
          phase.kind === "benchmarking") && (
          <section className="section">
            <StatusBar
              status={
                phase.kind === "uploading"
                  ? "pending"
                  : phase.kind === "benchmarking"
                  ? "done"
                  : phase.status
              }
              replayId={
                phase.kind === "uploading"
                  ? "..."
                  : phase.replayId
              }
            />
            {phase.kind === "benchmarking" && (
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.4rem", paddingLeft: "0.25rem" }}>
                Running benchmark analysis...
              </p>
            )}
          </section>
        )}

        {/* Error */}
        {phase.kind === "error" && (
          <section className="section">
            <div className="error-box">
              <span className="error-icon">!</span>
              <div>
                <p className="error-title">Analysis failed</p>
                <p className="error-msg">{phase.message}</p>
              </div>
              <button className="btn-reset" onClick={reset}>
                Try again
              </button>
            </div>
          </section>
        )}

        {/* No-orc case */}
        {phase.kind === "no-orc" && (
          <section className="section">
            <div className="no-orc-box wc3-panel">
              <span style={{ fontSize: "1.5rem" }}>⚔</span>
              <div>
                <p className="no-orc-title">No Orc player found</p>
                <p className="no-orc-sub">
                  This is an Orc-only coaching tool. The uploaded replay contains no Orc
                  player — upload an Orc game to get coaching feedback.
                </p>
              </div>
              <button className="btn-reset" onClick={reset}>
                Upload another replay
              </button>
            </div>
          </section>
        )}

        {/* Done — full results */}
        {phase.kind === "done" && orcPlayer && (
          <>
            <section className="section">
              <GameSummary replay={phase.replay} orcSlot={orcPlayer.slot} />
            </section>

            {/* --- Coach report (LLM, async — ABOVE ProblemCards as the headline) --- */}
            {coachState.kind === "loading" && (
              <section className="section">
                <div className="coach-loading wc3-panel-elevated">
                  <span className="coach-loading__pulse" aria-hidden="true" />
                  <div>
                    <p className="coach-loading__title">The Mentor is writing your coaching review&hellip;</p>
                    <p className="coach-loading__sub">
                      The local LLM is analyzing your game — this takes a few seconds.
                    </p>
                  </div>
                </div>
              </section>
            )}

            {coachState.kind === "loaded" && (
              <section className="section">
                <CoachReportView
                  report={coachState.report}
                  heroes={heroRefsForSlot(phase.replay.events, orcPlayer.slot)}
                />
              </section>
            )}

            {coachState.kind === "error" && (
              <section className="section">
                <div className="coach-error-notice">
                  <span className="coach-error-notice__icon">!</span>
                  <p className="coach-error-notice__msg">{coachState.message}</p>
                </div>
              </section>
            )}
            {/* --- End coach report --- */}

            <section className="section">
              <ProblemCards
                problems={phase.problems}
                playerName={orcPlayer.playerName}
              />
            </section>

            <section className="section">
              <BuildTimeline
                events={phase.replay.events}
                slot={orcPlayer.slot}
                playerName={orcPlayer.playerName}
              />
            </section>

            <section className="section wc3-panel" style={{ padding: "1.25rem 1.5rem" }}>
              <BenchmarkTable
                benchmarks={phase.benchmarks}
                orcSlot={orcPlayer.slot}
              />
            </section>

            <section className="section" style={{ textAlign: "center" }}>
              <button className="btn-reset" onClick={reset}>
                Analyze another replay
              </button>
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
          max-width: 760px;
          margin: 0 auto;
          padding: 0.75rem 0;
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        .site-title { font-size: 1.25rem; }
        .site-sub {
          font-size: 0.75rem;
          color: var(--text-muted);
          letter-spacing: 0.04em;
        }
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

        .page-body {
          max-width: 760px;
          margin: 0 auto;
          padding: 1.5rem 1.5rem 4rem;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }

        .section { }

        .error-box {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          background: rgba(220, 38, 38, 0.08);
          border: 1px solid rgba(220, 38, 38, 0.4);
          border-radius: 4px;
          padding: 0.875rem 1rem;
        }
        .error-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: var(--sev-critical);
          color: #fff;
          font-weight: 700;
          font-size: 0.75rem;
          flex-shrink: 0;
          margin-top: 1px;
        }
        .error-title {
          font-weight: 600;
          color: #fca5a5;
          font-size: 0.9rem;
          margin-bottom: 0.2rem;
        }
        .error-msg {
          font-size: 0.8rem;
          color: var(--text-muted);
          word-break: break-word;
        }

        .no-orc-box {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          padding: 1rem 1.25rem;
        }
        .no-orc-title {
          font-weight: 600;
          color: var(--gold);
          margin-bottom: 0.3rem;
        }
        .no-orc-sub {
          font-size: 0.85rem;
          color: var(--text-secondary);
          max-width: 480px;
        }

        .btn-reset {
          display: inline-block;
          padding: 0.45rem 1.1rem;
          background: transparent;
          border: 1px solid var(--border-gold-bright);
          border-radius: 3px;
          color: var(--gold);
          font-size: 0.8rem;
          font-weight: 600;
          letter-spacing: 0.04em;
          cursor: pointer;
          transition: background 0.12s, border-color 0.12s;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .btn-reset:hover {
          background: rgba(200,151,42,0.1);
          border-color: var(--gold);
        }

        /* ---- Coach report loading panel ---- */
        .coach-loading {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1rem 1.25rem;
        }
        .coach-loading__pulse {
          display: block;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: var(--gold);
          flex-shrink: 0;
          animation: coachPulse 1.4s ease-in-out infinite;
        }
        @keyframes coachPulse {
          0%, 100% { opacity: 1;   transform: scale(1);    box-shadow: 0 0 0 0 rgba(200,151,42,0.5); }
          50%       { opacity: 0.6; transform: scale(0.85); box-shadow: 0 0 0 6px rgba(200,151,42,0); }
        }
        .coach-loading__title {
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--gold);
          margin-bottom: 0.2rem;
        }
        .coach-loading__sub {
          font-size: 0.78rem;
          color: var(--text-muted);
        }

        /* ---- Coach report non-fatal error notice ---- */
        .coach-error-notice {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          padding: 0.6rem 0.9rem;
          background: rgba(220,38,38,0.06);
          border: 1px solid rgba(220,38,38,0.25);
          border-radius: 4px;
        }
        .coach-error-notice__icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: rgba(220,38,38,0.5);
          color: #fff;
          font-weight: 700;
          font-size: 0.65rem;
          flex-shrink: 0;
        }
        .coach-error-notice__msg {
          font-size: 0.8rem;
          color: #fca5a5;
          line-height: 1.4;
        }
      `}</style>
    </main>
  );
}
