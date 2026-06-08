# WC3 Coach — Project Plan (epics and subtasks)

> This document is the main backlog for work via **Claude Code**. Each subtask uses the format:
> **What** (is done) · **Why** (goal) · **Why this choice** (rationale) · **Role** (owner, see
> `WC3_Coach_Team_Roles.md`).
> Epics are ordered so each delivers value on its own. The sequence ≈ the design-doc roadmap.

**Role legend:** 🧠 Strategist · ⚙️ Mechanic · 🎞️ Replay Analyst · 🗄️ Data Keeper · 🤖 Coach · 🎨 Showrunner · 🔧 Foreman

---

## EPIC 0 — Foundation and environment
*Epic goal: any later task can start without friction — one repo, one environment, shared conventions.*

### T0.1 — Monorepo (pnpm workspaces + Turborepo)
- **What:** One repository with packages `apps/web`, `apps/api-node`, `apps/api-py`,
  `packages/parser`, `packages/shared-types`, `packages/ontology`.
- **Why:** Shared types between parser and frontend, a single CI, atomic commits across the stack.
- **Why this choice:** pnpm workspaces give fast symlinks and disk savings; Turborepo caches
  builds and tasks — critical when part is TS and part is Python. The alternative (separate repos)
  complicates keeping event types in sync between parser and UI.
- **Role:** 🔧 Foreman

### T0.2 — Docker Compose environment
- **What:** `docker-compose.yml` with Postgres 16 + pgvector, Redis, Ollama.
- **Why:** One `docker compose up` brings the whole local infra; reproducibility.
- **Why this choice:** pgvector in the same Postgres = relational data and RAG vectors without a
  separate vector DB (fewer moving parts). Redis is needed for the batch-parsing queue. Ollama in a
  container with GPU passthrough keeps the LLM isolated.
- **Role:** 🔧 Foreman

### T0.3 — Claude Code subagent scaffold
- **What:** `.claude/agents/*.md` for each role + a root `CLAUDE.md` with project conventions.
- **Why:** So each task is led by a "specialist" agent with its own WC3 knowledge, not a generic assistant.
- **Why this choice:** Claude Code subagents isolate context and knowledge — this is the technical
  realization of the "team of ex-players". Details in `WC3_Coach_Team_Roles.md`.
- **Role:** 🔧 Foreman + all

### T0.4 — Shared types contract (`packages/shared-types`)
- **What:** TS types `GameEvent`, `ReplayTimeline`, `BenchmarkResult`, `CoachReport`, `DrillResult`.
- **Why:** The parser (Node), analytics (Python via a generated schema), and frontend speak one language.
- **Why this choice:** A single source of truth for events removes drift; from the TS types we generate
  JSON Schema for the Python side (pydantic).
- **Role:** 🔧 Foreman + 🎞️ Replay Analyst

---

## EPIC 1 — Replay parsing
*Goal: turn raw `.w3g` into a clean, normalized timeline. This is the foundation of all analytics.*

### T1.1 — Spike: parse one replay
- **What:** A `w3gjs` script: `.w3g` → dump all events to JSON; manual check on 3–5 of your replays.
- **Why:** Understand the **real** data quality and completeness before building the rest. Avoid
  designing blind.
- **Why this choice:** `w3gjs` is the de-facto standard with the best Reforged support. A spike first =
  a cheap risk check (vs. a parser from scratch).
- **Role:** 🎞️ Replay Analyst

### T1.2 — Event normalization model
- **What:** Map raw `w3gjs` commands to canonical `GameEvent`
  (build/train/upgrade/learn_skill/item/move/attack/hero_level/expand) with a single `t_ms` and an
  ontology reference.
- **Why:** Analytics must work on meaningful events ("Barracks built at 2:14"), not on opcodes.
- **Why this choice:** A canonical model isolates the rest of the system from format quirks; the
  Classic↔Reforged difference hides here.
- **Role:** 🎞️ Replay Analyst + 🗄️ Data Keeper

### T1.3 — Ingest API + queue
- **What:** A Node endpoint to accept `.w3g`, dedup by `file_hash`, enqueue into BullMQ, a parsing
  worker, write to DB.
- **Why:** Drop 5 replays after a session and have them processed without blocking the UI.
- **Why this choice:** A queue gives parallelism on the Ryzen's 16 threads and resilience (retries).
  Dedup by hash — so one replay isn't analyzed twice.
- **Role:** 🎞️ Replay Analyst + 🔧 Foreman

### T1.4 — (Later) Precise deaths/positions via Observer API
- **What:** Play the replay back in-game as an observer + sample `War3StatsObserverSharedMemory`;
  deaths = frame diff.
- **Why:** Add data missing from raw `.w3g` (unit deaths, positions, creep-route heatmaps).
- **Why this choice:** The engine computes combat itself — more accurate and cheaper than own
  simulation. An official, legal mechanism. Do it **after** benchmarks show this data is missing
  (not prematurely).
- **Role:** 🎞️ Replay Analyst

---

## EPIC 2 — Data and ontology
*Goal: the static game "facts" the analytics and coach reason over.*

### T2.1 — DB schema + migrations
- **What:** SQL schema (ontology + replay events + apm sessions + knowledge vectors), migrations
  (Drizzle/Prisma or Alembic).
- **Why:** A stable storage foundation; versioned schema evolution.
- **Why this choice:** The relational model is ideal for relations "unit→race→upgrades"; pgvector
  keeps RAG nearby. Migrations = safe changes without data loss.
- **Role:** 🗄️ Data Keeper

### T2.2 — Ontology import (unit/building/hero/creep stats)
- **What:** A population pipeline: HP, armor (type+value), DPS, cost, food, build time, tech tree,
  camps and drops per map.
- **Why:** Without stats it's impossible to compute resource-trade efficiency, army strength, timings.
- **Why this choice:** Extraction from game files (CASC/MPQ) gives exact values per version; as a quick
  start — import from Liquipedia. Keep both paths.
- **Role:** 🗄️ Data Keeper + 🧠 Strategist

### T2.3 — Patch versioning
- **What:** Tie stats and timings to `patch_versions`; a replay knows its patch.
- **Why:** Balance changes stats and the "correct" timings; analysis must compare against the current patch.
- **Why this choice:** Without versioning, advice goes stale and misleads. Cheap to lay in now, expensive
  to bolt on later.
- **Role:** 🗄️ Data Keeper

---

## EPIC 3 — Benchmarks and strategic analysis
*Goal: objective, deterministic feedback without the LLM. Win-rate already grows here.*

### T3.1 — Benchmark engine
- **What:** A module that computes over the timeline: worker curve, expansion timing, supply blocks,
  T2/T3 time, hero level by game time, idle production, floating gold/lumber.
- **Why:** Specific, measurable deviations are the most useful and honest feedback.
- **Why this choice:** Deterministic code = zero hallucination, instant, clear. This is the project's
  "unfair advantage" over "just asking the LLM".
- **Role:** 🧠 Strategist

### T3.2 — Strategic corpus seed (2–3 matchups)
- **What:** Canonical build orders, key timings, common mistakes, win conditions for the start
  (e.g. OvH, OvNE, OvUD).
- **Why:** References against which deviations are computed; the basis of the future RAG.
- **Why this choice:** Starting narrow (one race) delivers value fast; expansion is incremental. This is
  the biggest "human" work — lay it in early.
- **Role:** 🧠 Strategist

### T3.3 — Deviation scoring and prioritization
- **What:** Weight deviations by impact on the result → severity; the top problems of the game.
- **Why:** Don't bury the player in 30 nitpicks — show the 3–5 biggest levers.
- **Why this choice:** Can start with simple rules/weights; later — XGBoost on a game corpus for
  win-prediction and automatic weights. Stepwise, without premature ML.
- **Role:** 🧠 Strategist + 🤖 Coach

---

## EPIC 4 — APM Trainer (with game-feel)
*Goal: train real WC3 mechanics in the form of a **juicy game**, not "circles to click".*

### T4.1 — Drill engine core
- **What:** A scenario engine: drill goal, step sequence, timers, scoring, session recording.
- **Why:** A shared foundation for all drill types; easy to add new ones.
- **Why this choice:** React + Canvas (or PixiJS) — Canvas/Pixi deliver 60fps, particles, and effects
  that the DOM can't. One engine, many scenarios.
- **Role:** ⚙️ Mechanic + 🎨 Showrunner

### T4.2 — Hotkey drills
- **What:** Control groups (`Ctrl+1..9`, `Shift`), per-race building/unit hotkeys, the cycle
  "base→army→base→map".
- **Why:** Hotkeys are the main real driver of APM in WC3; muscle memory.
- **Why this choice:** We train the **exact in-game bindings**, not abstract keys — so the skill transfers
  straight into the game.
- **Role:** ⚙️ Mechanic

### T4.3 — Micro drills
- **What:** Box-select, focus fire, switch target, kiting (move→stop→attack), hero combos
  (Blink-strike, Stomp timing, TP escape).
- **Why:** Micro wins fights when macro is equal.
- **Why this choice:** Scenarios with moving "enemies" and reaction windows train exactly the patterns
  that decide fights.
- **Role:** ⚙️ Mechanic

### T4.4 — Build-order trainer
- **What:** Replay a specific build with timing checkpoints; highlight being late/early.
- **Why:** Move the reference builds (from EPIC 3) into muscle memory.
- **Why this choice:** A direct bridge between analytics (what's needed) and training (how to ingrain it).
  Closes the "review → drill" loop.
- **Role:** ⚙️ Mechanic + 🧠 Strategist

### T4.5 — Game-feel / "juice" layer ⭐
- **What:** Juicy feedback on every action: particles on hit, slight screen-shake, hit-stop, a combo
  counter that escalates, audio samples, dynamic highlighting, streak effects, "perfect/early/late"
  popups, WC3-themed assets (gold, lumber, race icons).
- **Why:** Good feedback = dopamine = more repetitions = faster progress. This is the difference between
  a "boring trainer" and "one more round".
- **Why this choice:** PixiJS/Canvas + a simple particle system + Web Audio API. Juice principles
  (Vlambeer-style: hit-stop, screen-shake, target shake, escalating combos). The theme is WC3-styled so it
  feels like part of the game.
- **Role:** 🎨 Showrunner + ⚙️ Mechanic

### T4.6 — Progress tracking
- **What:** Record `apm_sessions` (EPM/APM, accuracy, reaction, % checkpoints, score) + trend charts.
- **Why:** See growth; motivation; spot weak drills.
- **Why this choice:** Objective progress closes the motivation loop and shows what to push next.
- **Role:** ⚙️ Mechanic + 🎨 Showrunner

---

## EPIC 5 — AI coach (RAG + LLM)
*Goal: turn game data into a human review at the basic→advanced→pro level.*

### T5.1 — Knowledge corpus + embeddings
- **What:** Load guides/timings/tips into `knowledge_docs`, chunk, embed (bge-m3/nomic) into
  `knowledge_chunks`.
- **Why:** The RAG base is the main source of "understanding the game" for the LLM.
- **Why this choice:** Advice quality = corpus quality. Local embedding on the GPU = free and private.
- **Role:** 🤖 Coach + 🧠 Strategist

### T5.2 — RAG pipeline
- **What:** Retrieve top-k relevant chunks for the specific matchup/game situation (pgvector).
- **Why:** Feed the LLM exactly the needed knowledge, instead of hoping for its memory.
- **Why this choice:** pgvector + filters (matchup, tier, patch) — precise context without a separate
  vector DB.
- **Role:** 🤖 Coach

### T5.3 — LLM coach (Ollama)
- **What:** A prompt contract: timeline + benchmark deviations + RAG knowledge → 3–5 prioritized tips
  with timings.
- **Why:** A human, actionable review of each game.
- **Why this choice:** Qwen2.5 14B / Llama 3.1 8B (Q4) fit in 16 GB VRAM. "Rely ONLY on provided facts"
  sharply reduces hallucination.
- **Role:** 🤖 Coach

### T5.4 — (Optional, later) QLoRA fine-tune
- **What:** Fine-tune a 7–8B model on your own review corpus for a "coaching" style and patch knowledge.
- **Why:** A more stable tone and WC3 terminology.
- **Why this choice:** QLoRA 7–8B is realistic on 16 GB. Do it only when RAG is stable and hundreds of
  examples are collected — otherwise premature.
- **Role:** 🤖 Coach

---

## EPIC 6 — Web UI and visual style
*Goal: a good, "esports" interface — so everything looks like it was made by ex-players.*

### T6.1 — Design system / WC3 theme
- **What:** Color/typography tokens in WC3 style (faction palettes, "forged" panels, race icons),
  components, dark theme by default.
- **Why:** A single premium look; a recognizable game vibe.
- **Why this choice:** A design system saves time and keeps consistency between trainer and analyzer.
  The dark esports aesthetic is the genre standard.
- **Role:** 🎨 Showrunner

### T6.2 — Replay Analyzer UI
- **What:** An interactive event timeline, worker/resource curves, supply chart, map heatmap, benchmark cards.
- **Why:** Quickly "read" a game with your eyes.
- **Why this choice:** Recharts/D3 for charts; a timeline with scrubbing gives the feel of "rewinding the
  game". Visualization speeds up insight better than text.
- **Role:** 🎨 Showrunner + 🎞️ Replay Analyst

### T6.3 — Coach Report view
- **What:** A review card: top problems, tips with timings, links to the timeline moment, a "create a drill
  for this mistake" button.
- **Why:** Close the loop "review → concrete action → training".
- **Why this choice:** A direct bridge into the APM trainer makes advice actionable, not just text.
- **Role:** 🎨 Showrunner + 🤖 Coach

### T6.4 — APM Dashboard
- **What:** Progress charts, personal records, streaks, drill selection.
- **Why:** Motivation and training navigation.
- **Why this choice:** Gamification (records, streaks) increases regularity.
- **Role:** 🎨 Showrunner + ⚙️ Mechanic

---

## EPIC 7 — Workflow integration (Twitch session)
*Goal: everything works as a single loop during a stream.*

### T7.1 — Session flow
- **What:** The scenario "5 games → batch analysis → top session problems → 5–10 min of targeted drills →
  next session".
- **Why:** Turn the tools into a habit of growth.
- **Why this choice:** Batch analysis fits into the natural pauses of a stream; targeted drills hit the
  identified weaknesses right now.
- **Role:** 🔧 Foreman + all

### T7.2 — Cleanliness principle (guardrail)
- **What:** A hard rule in `CLAUDE.md` and in UX: no live tools during ladder/W3C; analysis is post-game only.
- **Why:** Preserve honesty and account safety.
- **Why this choice:** Baked into the project principles from day one, so the temptation of a "live" overlay
  never appears.
- **Role:** all

---

## Recommended execution order
1. EPIC 0 → 1 → 2 (foundation and data).
2. EPIC 3 (benchmarks) — **the first real win-rate gain, still without the LLM**.
3. EPIC 4 (APM trainer) — in parallel, since it's independent of the parser.
4. EPIC 5 (AI coach) — once data + corpus exist.
5. EPIC 6 (UI) — grows across all phases; the theme (T6.1) early.
6. EPIC 7 — the final loop integration.

> A small but important principle across the whole backlog: **each epic delivers value on its own.**
> Don't postpone playing for the "perfect" next phase.
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                