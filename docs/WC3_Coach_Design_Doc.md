# WC3 Coach — Design Document

**Project:** A personal platform for improving at Warcraft III (Reforged / Classic)
**Components:** APM Trainer + Replay Analyzer + knowledge base + ML/LLM coach
**Author:** Oleksii
**Date:** 2026-06-08
**Version:** 0.1 (draft)

---

## 1. Goal and principles

### 1.1 Goal
Build a personal tool that supports **deliberate** improvement at WC3 through two things:

1. **Mechanics training** — an APM trainer for mouse and keyboard (hotkeys, micro,
   build-order drills).
2. **Reviewing played games** — analysis of `.w3g` replays with "what could be done
   better" advice at the basic → advanced → pro level.

### 1.2 Principles (immutable)
- **No cheating.** Analysis runs **only after the game**, over a saved replay. During
  ladder games and W3Champions games, **no frameworks, overlays, memory readers, or
  packet sniffers are used**.
- **Everything local.** Parsing, DB, ML — all on the user's own PC. No cloud dependency.
- **Incremental value.** Each phase delivers measurable improvement before the next is
  ready. The LLM is the cherry on top, not the foundation.

### 1.3 Target hardware
| Component | Spec | Design implication |
|---|---|---|
| CPU | AMD Ryzen 7 9700X (8C/16T) | Parallel batch parsing of replays |
| RAM | 32 GB DDR5 | Comfortable for Postgres + Ollama at once |
| GPU | RTX 5070 Ti (16 GB VRAM) | Local LLM 7–14B (Q4/Q5) + embedding model; QLoRA 7–8B feasible |

---

## 2. Architecture overview

```
┌──────────────────────────────────────────────────────────────┐
│                        WEB APP (Next.js)                        │
│   ┌──────────────────┐        ┌──────────────────────────┐     │
│   │   APM Trainer     │        │     Replay Analyzer UI    │     │
│   │ (Canvas / React)  │        │  (timeline, charts, coach)│     │
│   └────────┬─────────┘        └────────────┬─────────────┘     │
└────────────┼──────────────────────────────┼───────────────────┘
             │ REST/WS                        │ REST
   ┌─────────▼─────────┐          ┌──────────▼───────────────┐
   │  Node API (TS)     │          │   Python API (FastAPI)    │
   │  • w3g parsing     │          │   • analytics / benchmarks│
   │  • replay ingest    │  ──────► │   • RAG + LLM coach       │
   │  • APM metrics      │  queue   │   • ML models (optional)  │
   └─────────┬─────────┘          └──────────┬───────────────┘
             │                                │
             └───────────────┬────────────────┘
                             ▼
             ┌───────────────────────────────┐
             │   PostgreSQL + pgvector         │
             │   • game ontology (static)      │
             │   • replay events (timelines)   │
             │   • apm sessions (progress)     │
             │   • knowledge vectors (RAG)     │
             └───────────────────────────────┘
                             ▲
             ┌───────────────┴───────────────┐
             │   Ollama (local LLM + embed)   │
             └───────────────────────────────┘
```

The Node/Python split is intentional: `.w3g` parsers live in the JS/TS ecosystem
(`w3gjs`), while ML/RAG lives in Python. They communicate via a queue (e.g. Redis/BullMQ)
or simple REST + status polling.

---

## 3. Components in detail

### 3.1 APM Trainer (mouse + keyboard)
**Key thesis:** in WC3, "APM" is not clicking for the sake of a number — it is **muscle
memory of mechanics**. Therefore drills are tied to real in-game actions, not abstract
clicking.

**Drill types:**
- **Hotkey drills** — control groups (`Ctrl+1..9`, `Shift+`), per-race building/unit
  hotkeys, the base cycle "base → army → base → map".
- **Micro drills** — box-select, focus fire, switch target, kiting (move→stop→attack),
  hero-specific combos (Blink-strike, Stomp timing, TP escape).
- **Macro drills** — keeping production uninterrupted, food-cap control, timely upgrades.
- **Build-order trainer** — replay a specific build with timing checkpoints; the system
  highlights being late/early relative to the reference.

**Metrics written to the DB:**
- EPM / APM (effective vs raw actions), click accuracy, reaction time, % of completed
  build-order checkpoints, progress over time (charts).

**Technically:** React + Canvas; capture `keydown`/`keyup`/`mousedown`/`mousemove`; a local
drill-scenario engine; store sessions in Postgres for progress tracking.

### 3.2 Replay Pipeline
```
.w3g  ──►  parse (w3gjs)  ──►  normalize  ──►  enrich (ontology)  ──►  store
```
- **Parse:** `w3gjs` yields a stream of player commands: build order, train, upgrades,
  ability learns, item pickups, moves/attacks, APM.
- **Normalize:** convert raw commands into canonical `GameEvent` entries with a single
  timecode.
- **Enrich:** map unit/building IDs to the ontology (HP, cost, food, build time).
- **Limitation:** unit deaths are **not directly recorded** in raw `.w3g`. Two strategies
  (see §6).

### 3.3 Knowledge base (Game Ontology)
Static reference data — the "facts" the analytics reason over:
- Heroes (abilities, stats per level), races, units, buildings, maps, neutral creep camps,
  camp drops.
- Stats: HP, mana, armor (type and value), DPS, attack type, cost (gold/lumber), food,
  build/train time, requirements (tech tree).
- **Data sources:** extraction from game files (CASC for Reforged / MPQ for Classic) or
  import from Liquipedia / community wiki. Stored with versioning (balance patches change
  stats).

### 3.4 Analysis layer
Three levels working together (not only the LLM):

**(a) Benchmarks/rules (deterministic code).** The cheapest, most accurate feedback:
- worker-count curve over time, expansion timing, supply blocks, T2/T3 timing, hero level
  vs game time, idle production time, floating gold/lumber.

**(b) RAG knowledge (vector search).** A corpus of basic/advanced/pro guides, build orders,
tips & tricks per matchup. The LLM retrieves the relevant fragments for the specific game
situation.

**(c) LLM coach (Ollama, local).** Takes (i) the player's timeline + (ii) benchmark
deviations + (iii) retrieved RAG knowledge → produces a human-language review: where tempo
was lost, what to do differently, which timings to tighten.

---

## 4. Technology stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | Next.js + React + Canvas | SSR dashboard + interactive APM trainer in one |
| Charts | Recharts / D3 | timelines, worker curves, map heatmaps |
| Node API | Node.js + TypeScript | native `w3gjs`/`wc3v` ecosystem |
| Parser | `w3gjs` (+ `wc3v` for BO simulation) | de-facto standard, Reforged support |
| Python API | FastAPI | ML/RAG ecosystem |
| Queue | Redis + BullMQ | async batch processing of replays |
| DB | PostgreSQL 16 + pgvector | relational + vectors in one DB |
| LLM runtime | Ollama | local execution on the 5070 Ti |
| LLM | Qwen2.5 14B / Llama 3.1 8B (Q4_K_M) | fits in 16 GB VRAM with context |
| Embeddings | nomic-embed-text / bge-m3 | for RAG |
| ML (optional) | scikit-learn / XGBoost | win-prediction, deviation scoring |
| Infra | Docker Compose | Postgres+pgvector+Redis+Ollama in one file |

---

## 5. Data model (high-level)

### 5.1 Ontology (static)
```
races(id, name)
heroes(id, race_id, name, primary_attr, base_stats_json)
hero_abilities(id, hero_id, name, levels_json)
units(id, race_id, name, hp, armor, armor_type, attack_type, dps,
      gold, lumber, food, build_time, tech_req_json)
buildings(id, race_id, name, hp, armor, gold, lumber, build_time, provides_json)
maps(id, name, tileset, player_count, layout_meta_json)
creep_camps(id, map_id, position, difficulty, units_json, drops_json)
upgrades(id, race_id, name, levels_json)
patch_versions(id, version, released_at)   -- stats are versioned
```

### 5.2 Replays (dynamic)
```
replays(id, file_hash, map_id, played_at, duration, patch_id, winner_slot, raw_meta_json)
replay_players(id, replay_id, slot, player_name, race_id, apm, result)
game_events(id, replay_id, slot, t_ms, type, entity_ref, payload_json)
   -- type ∈ {build, train, upgrade, learn_skill, item, move, attack,
   --         hero_level, unit_spawn, unit_death(inferred), expand, ...}
benchmarks(id, replay_id, slot, metric, value, expected, delta, severity)
```

### 5.3 APM training
```
apm_sessions(id, drill_type, started_at, duration, epm, apm, accuracy,
             reaction_ms, checkpoints_json, score)
```

### 5.4 Knowledge base (RAG)
```
knowledge_docs(id, title, source, matchup, tier, patch_id, text)
knowledge_chunks(id, doc_id, chunk_text, embedding vector(1024))
```

---

## 6. Getting the "full picture" (including deaths)

Raw `.w3g` stores **commands**, not state. Unit deaths must be obtained separately. Two paths:

**Path A — own simulation (hard).** Reimplement game logic over the command stream (like
`wc3v`). Yields deaths as inference, but requires a lot of work and precision.

**Path B — Observer API on playback (recommended for accuracy).** Play the replay back in
observer mode and sample `War3StatsObserverSharedMemory` frame by frame. The engine computes
combat itself → deaths are derived by frame diff (a unit present in frame N, gone in N+1).
This is the **legal**, official Blizzard mechanism. Downside: the game must run to play it back.

> Recommendation: at the start — **build order, units, upgrades, heroes, items** via `w3gjs`
> (enough for 80% of insights). Precise deaths/positions/creep-route heatmaps can be added
> later via Path B if the benchmarks show the data is missing.

---

## 7. ML / LLM approach

### 7.1 What we do NOT do
- We do not train an LLM "to play WC3" from scratch (unrealistic and unnecessary).
- We do not rely on the LLM as a source of game facts — it **interprets** them, it does not
  **know** them.

### 7.2 What we do
1. **RAG** — the main mechanism for "understanding the game". Advice quality = corpus quality.
2. **Benchmarks** — a deterministic layer that gives objective deviations without hallucination.
3. **LLM** — synthesis: takes timeline + benchmarks + RAG → a human review.
4. **(Optional, later) QLoRA fine-tune** of a 7–8B model on your own review corpus — only to
   set a "coaching" style and patch knowledge. Needs hundreds of labeled examples; do it after
   the RAG pipeline is stable.

### 7.3 Coach prompt contract (example structure)
```
SYSTEM: You are a pro-level WC3 coach. Rely ONLY on the provided facts and knowledge.
CONTEXT:
  matchup: OvH, map: Echo Isles, result: loss, duration: 14:20
  player_timeline: <normalized events>
  benchmark_deviations: [expand +90s, T2 +40s, hero_lvl3 +60s, floating_gold 800]
  retrieved_knowledge: <top-k guide fragments for OvH>
TASK: Give 3–5 specific, prioritized "do better" tips with timings.
```

---

## 8. Knowledge corpus — the biggest job

> The inconvenient truth: **the parser plugs in within a week, but the knowledge corpus is
> built over months.** The ML "understands the pro level" exactly as much as the base is filled.

**Build-up plan (incremental):**
1. Start with **one of your races + 2–3 matchups** (e.g. OvH, OvNE, OvUD).
2. For each: canonical build orders, key timings, common mistakes, win conditions.
3. Sources: text guides, Liquipedia strategy pages, pro-VOD/cast transcripts, your own notes
   after reviews.
4. Version per patch (balance changes timings).
5. Gradually expand to other matchups as needed.

---

## 9. Roadmap by phase

| Phase | Output | Value |
|---|---|---|
| **0. Spike** | Parse 1 replay → JSON timeline | Validate `w3gjs` data quality on your replays |
| **1. Storage** | DB schema + ontology import (heroes/units/stats) | Facts in place for analysis |
| **2. Benchmarks** | Deterministic analysis (timings, workers, supply, levels) | **Real feedback and win-rate gain without LLM** |
| **3. APM Trainer** | MVP of hotkey + micro drills with progress tracking | Mechanics improvement in parallel |
| **4. RAG + LLM** | Coach reviews in natural language | Basic→pro advice |
| **5. Web UI** | Unified dashboard + Twitch flow | 5 games → analyze → 5–10 min drill |

**Tip:** phases 1–3 already give value. Don't postpone playing for the "perfect" ML.

---

## 10. Twitch flow (target scenario)
1. Play 5 ladder games (no overlays/tools — clean).
2. After the session, drop the 5 replays into the Replay Analyzer.
3. Get a benchmark report + coach review per game.
4. 5–10 min of APM drills on the identified weak spots.
5. Next session.

---

## 11. Risks and limitations
- **Parsing quality:** Reforged vs Classic differ in format; unit deaths = inference/simulation
  (see §6).
- **Knowledge corpus is the bottleneck:** without curation the LLM gives shallow advice. Budget time.
- **Patch drift:** stats and timings go stale; versioning per patch is required.
- **VRAM budget:** 16 GB limits model size/context; start with 8B, scale to 14B Q4 if needed.
- **Discipline of the "post-analysis only" principle:** no live tools in ladder/W3C.

---

## 12. Next artifacts (on request)
- Monorepo scaffold (Next.js + FastAPI + parser, docker-compose).
- Full SQL schema with migrations.
- A working `w3gjs` parser prototype (.w3g → JSON timeline).
- A starter set of benchmarks (phase 2).
- An APM-trainer MVP (phase 3).

---

## Sources
- w3gjs — TypeScript replay parser: https://github.com/PBug90/w3gjs
- wc3v — state simulation / build order: https://github.com/jblanchette/wc3v
- scopatz/w3g — Python parser: https://github.com/scopatz/w3g
- w3rs — Rust parser (Reforged): https://github.com/aesteve/w3rs
- war3observer — Observer API reader for overlays: https://github.com/sides/war3observer
- WC3StreamerOverlay — example of working with the Observer API: https://github.com/dethredic/WC3StreamerOverlay
- Observer API (War3StatsObserverSharedMemory) — discussion: https://us.forums.blizzard.com/en/warcraft3/t/request-expand-the-observer-api-aka-war3statsobserversharedmemory/3425
- wc3stats API docs: https://wc3stats.com/docs/api
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      