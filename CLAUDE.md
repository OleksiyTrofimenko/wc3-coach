# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# WC3 Coach

A personal, locally-run platform for deliberate Warcraft III improvement:
**APM Trainer + Replay Analyzer + AI Coach**.

> **Current state:** pre-code. The repo today contains only this file, `docs/`,
> and `.claude/` (agents + shared WC3 knowledge skill). The stack, monorepo
> layout, and commands described below are the **target design** — see
> `docs/WC3_Coach_Design_Doc.md` and `docs/WC3_Coach_Project_Plan.md`.
> EPIC 0 (T0.1–T0.4) is the foundation work that will scaffold them.

---

## 🛑 Principles (IMMUTABLE — read first)

1. **NO CHEATING. Analysis is POST-GAME ONLY.**
   During ladder games and W3Champions games, **all** live tools are forbidden:
   overlays, process-memory readers, packet sniffers, input automation. The system
   works **only** on a saved `.w3g` replay after the game ends.
   *Allowed and legal:* the official Observer API (`War3StatsObserverSharedMemory`)
   on **replay playback** in observer mode — this does not affect a live game.
2. **Everything local.** Parsing, DB, LLM run on the user's PC. No cloud dependency
   for the core flow.
3. **Incremental value.** Each epic delivers measurable value on its own. Benchmarks
   (EPIC 3) are useful before any LLM. Never block playing for a "perfect" next phase.
4. **Data is the source of truth, the LLM is the interpreter.** The LLM is not a source
   of game facts; it reasons over provided data (timeline + benchmarks + RAG).
   Inventing timings/stats is forbidden.

Any code or decision that violates principle #1 is rejected unconditionally.

---

## Where context lives

- `docs/WC3_Coach_Design_Doc.md` — full architecture, data model, ML approach,
  the `.w3g` "deaths are not recorded" limitation and the two paths around it (§6).
- `docs/WC3_Coach_Project_Plan.md` — backlog of EPICs and T-tasks (T0.1, T1.2, …).
  Commits and PRs reference the `T-id`.
- `docs/WC3_Coach_Team_Roles.md` — origin of the subagent personas.
- `.claude/agents/<role>.md` — the seven specialist subagents; each declares its
  own scope and boundaries.
- `.claude/skills/wc3-knowledge/` — the **single source of truth** for WC3 facts
  (`ontology.md`, `timings.md`, `matchups/`, `glossary.md`). All roles read from
  here; never invent timings or stats inline in app code.

---

## Architecture in one picture

Node owns `.w3g` parsing (because `w3gjs` is the de-facto JS/TS parser); Python
owns ML/RAG (because that ecosystem lives there); they meet at Postgres + Redis.

```
 Next.js web (APM trainer + analyzer dashboard)
        │ REST/WS                    │ REST
 Node API (TS): w3g parse, ingest    Python API (FastAPI): benchmarks, RAG, LLM coach
        │                            │
        └──── Redis (BullMQ queue) ──┘
                     │
              PostgreSQL 16 + pgvector
                     │
              Ollama (local LLM + embeddings)
```

**Data flow:** `.w3g` → `w3gjs` parse → normalize into canonical `GameEvent`
(with `t_ms` + `entity_ref` to ontology) → store → deterministic **benchmarks** compute
deviations vs. matchup/patch reference → **RAG** retrieves relevant guide chunks →
**LLM** synthesizes 3–5 prioritized, timed tips. Each layer is independently
useful; the LLM is the last layer, not the foundation.

---

## Target hardware
AMD Ryzen 7 9700X (8C/16T) · 32 GB DDR5 · RTX 5070 Ti (16 GB VRAM).
Implications: batch parsing across 16 threads; a local LLM 8–14B (Q4) plus an
embedding model fit in VRAM; QLoRA 7–8B is feasible later.

---

## Stack (planned)

| Layer | Technology |
|---|---|
| Frontend | Next.js + React, PixiJS/Canvas (APM trainer), Recharts/D3 |
| Node API | Node.js + TypeScript, `w3gjs`, BullMQ |
| Python API | FastAPI, embeddings, RAG, ML (optional XGBoost) |
| Queue | Redis + BullMQ |
| DB | PostgreSQL 16 + pgvector |
| LLM | Ollama (Qwen2.5 14B / Llama 3.1 8B, Q4_K_M) |
| Embeddings | bge-m3 / nomic-embed-text |
| Infra | Docker Compose, pnpm + Turborepo |

---

## Repository structure (target — to be scaffolded in EPIC 0)

```
wc3-coach/
├─ CLAUDE.md
├─ docker-compose.yml          # Postgres+pgvector, Redis, Ollama
├─ pnpm-workspace.yaml
├─ turbo.json
├─ apps/
│  ├─ web/                     # Next.js: APM trainer + analyzer dashboard
│  ├─ api-node/                # ingest + w3g parsing (BullMQ workers)
│  └─ api-py/                  # FastAPI: benchmarks, RAG, LLM coach
├─ packages/
│  ├─ parser/                  # w3gjs wrapper → GameEvent
│  ├─ shared-types/            # GameEvent, ReplayTimeline, CoachReport, DrillResult
│  └─ ontology/                # ontology types/helpers
├─ db/
│  ├─ migrations/
│  └─ schema.sql
├─ docs/                       # design doc, plan, roles
└─ .claude/
   ├─ agents/                  # role subagents (see below)
   └─ skills/wc3-knowledge/    # shared WC3 knowledge base
```

Only `docs/` and `.claude/` exist today. Do **not** assume `apps/`, `packages/`,
or `docker-compose.yml` are present — check first before referencing them.

---

## Build / lint / test commands

The monorepo (T0.1) and Docker infra (T0.2) have not been scaffolded yet, so
there are no `pnpm`, `turbo`, `docker compose`, `pytest`, or migration commands
to run. Once T0.1/T0.2 land, this section should list how to install,
build, lint, run each app, run the full test suite, and run a single test
(e.g. `pnpm --filter parser test -- <name>`, `pytest -k <name>`).

---

## Agent team (a studio of ex-players)

Each role is a subagent in `.claude/agents/`. `dev` is the **default hands-on
implementer** that writes and wires code across the stack; it pulls in the
specialist personas below for domain decisions. Invoke a specialist directly
when a task is squarely in their lane (e.g. "do T4.5 as **Showrunner**"). Each
agent file declares its own boundaries — respect them.

| Agent | Callsign | Owns | Invoke for |
|---|---|---|---|
| `dev` | Builder | implementation across the stack | default for any coding task; scaffolding the repo from pre-code |
| `strategist` | Tactician | EPIC 3 | build orders, timings, benchmarks, matchups |
| `mechanic` | Twitch | EPIC 4 | APM drills, hotkeys, micro, input metrics |
| `replay-analyst` | Caster | EPIC 1 | `.w3g` parsing, event normalization, ingest |
| `data-keeper` | Archivist | EPIC 2 | DB schema, ontology, stats, patches |
| `coach` | Mentor | EPIC 5 | RAG + LLM coach, prompts, reports |
| `showrunner` | Director | EPIC 6, T4.5 | UI/UX, design system, game-feel |
| `foreman` | Chief | EPIC 0, 7 | monorepo, docker, types, integration |

---

## Development conventions

- **Code language:** TypeScript (strict) in Node/web; Python 3.12 + pydantic in api-py.
- **Shared types:** changed only in `packages/shared-types`; Python schemas are generated
  from them (JSON Schema → pydantic). Do not duplicate event definitions.
- **Events:** everything extracted from a replay passes through the canonical `GameEvent`
  with `t_ms` and an `entity_ref` into the ontology.
- **Migrations:** any schema change goes through `db/migrations`, never by hand on a live DB.
- **Patch versioning:** stats and timings are always tied to `patch_versions` — balance
  changes shift the "correct" reference, so analysis must compare against the right patch.
- **Determinism before LLM:** if a metric can be computed in code, compute it in code
  (benchmarks); the LLM only synthesizes the explanation.
- **Tests:** parser and benchmarks are covered by unit tests on fixed replay fixtures
  (golden files).
- **Commits:** conventional commits tied to a `T-id` from the plan (e.g. `feat(parser): T1.2 ...`).

---

## Working loop (Twitch session)
5 ladder games (clean, no tools) → batch-analyze replays → top 3–5 session problems →
5–10 min of targeted APM drills → next session.

---

## Definition of Done (for any T-task)
- Complies with the principles (especially #1).
- Types live in `shared-types` if they concern events/reports.
- Has tests or a manual check on a real replay/drill.
- Relevant `docs/` updated as needed.
