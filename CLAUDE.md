# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# WC3 Coach

A personal, locally-run platform for deliberate Warcraft III improvement:
**APM Trainer + Replay Analyzer + AI Coach**.

> **Current state:** EPIC 0 complete; EPIC 1 done (T1.1–T1.3); EPIC 2 done
> (T2.1–T2.3); EPIC 3 done (T3.1–T3.3); EPIC 5 done (T5.1–T5.3, RAG + LLM coach).
> - T0.1: monorepo skeleton — `apps/`, `packages/`, `db/`, `turbo.json`,
>   `pnpm-workspace.yaml`. `corepack pnpm install && corepack pnpm turbo build`
>   works end-to-end.
> - T0.2: Docker infra — `docker-compose.yml` (Postgres 16 + pgvector, Redis 7,
>   Ollama), `.env.example`, `db/init/01-extensions.sql`. One `docker compose up -d`
>   brings up all backing services; Ollama GPU passthrough via the `gpu` profile.
> - T0.4: Shared types contract — `packages/shared-types/src/index.ts` defines the
>   canonical cross-service types (`GameEvent`, `ReplayTimeline`, `BenchmarkResult`,
>   `CoachReport`, `DrillResult`) mirroring the design-doc §5 data model. camelCase
>   fields, string-literal unions (clean JSON Schema → pydantic later).
> - T1.1: parse spike — `packages/parser` wraps `w3gjs`; `corepack pnpm --filter
>   @wc3-coach/parser dump <replay>` dumps a `.w3g` to JSON for inspection.
> - T1.2: event normalization — `parseReplayFile(path)` / `normalizeReplay(...)`
>   map `w3gjs` output → `ReplayTimeline` (`GameEvent[]`). Covered by a vitest
>   golden-file test on a committed fixture (`corepack pnpm turbo test`).
>   `entityRef` is a provisional `"<kind>:<fourcc>"` ref pending the ontology (T2.2).
> - T1.3: ingest pipeline — new `packages/db` (**Drizzle ORM**, the T2.1 schema
>   subset: `patch_versions`, `replays`, `replay_players`, `game_events`) + an
>   `apps/api-node` Fastify API (`POST /replays` upload+sha256 dedup, `GET
>   /replays/:id`, `GET /health`) and a BullMQ worker that parses → persists.
>   Lifecycle on `replays.status`: pending → parsing → done|error. Full
>   walkthrough in `docs/T1.3_Ingest_Pipeline.md`.
> - T2.1: full DB schema — `packages/db/src/schema.ts` now defines all design-doc
>   §5 tables (ontology: races/heroes/hero_abilities/units/buildings/upgrades/maps/
>   creep_camps; analytics: benchmarks, apm_sessions; RAG: knowledge_docs +
>   knowledge_chunks with a `vector(1024)` HNSW index). Stat tables are
>   patch-versioned (`patch_id` nullable, `UNIQUE(key,patch_id) NULLS NOT DISTINCT`).
>   Migration `db/migrations/0001_*.sql`.
> - T2.2: ontology import — curated seed (`packages/db/src/seed/*.json`, Orc + NE +
>   neutral; `db:seed`) + a `fourcc` column (migration 0002) + a FourCC resolver
>   (pure logic in `packages/ontology`, DB-backed `resolveReplayRefs` in
>   `packages/db`, wired NON-FATALLY into the worker). Seed is `verified:false`
>   (community values, pending CASC cross-check); Human/Undead are stubs.
> - T2.3: patch versioning — curated `patch_versions` registry seed
>   (`patches.json`, only the confirmed 2.00/6117) + patch-aware stat lookup
>   (`packages/db/src/lookup.ts`: `getUnit/.../getXForPatch`, patch-specific row →
>   `NULL` baseline fallback via the pure `pickForPatch`). Replay→patch was already
>   wired in `persistTimeline`.
> - T3.1: benchmark engine — `apps/api-py/app/benchmarks/` (Python/FastAPI; this
>   activates the Python side). Deterministic, command-derivable metrics
>   (hero/tier/expansion timings, hero-level-by-time, worker count/continuity
>   *approx*) → `BenchmarkResult` rows; `GET /benchmarks/{id}` + `POST
>   /benchmarks/{id}/run`. State-dependent metrics (floating gold/lumber, supply
>   blocks, army size, creep routes) are DEFERRED to T1.4, not faked. References
>   seeded in `wc3-knowledge/timings.md`. 56 pytest pass (pure core, no DB).
> - T3.2: strategic corpus seed — full matchup write-ups (build order both
>   sides + key timings + win conditions + common mistakes) for **OvNE, OvH,
>   OvUD** (`.claude/skills/wc3-knowledge/matchups/*.md`; OvH/OvUD new). Added
>   tier3/hero_level5/worker_count reference rows for all four Orc-matchup sides
>   to the engine table (`benchmarks/references.py`) kept numerically identical
>   to `timings.md`. All values `verified: community` (high-ladder/W3C analyses),
>   patch 2.0; a few late-game T3 timings flagged low-confidence. No engine-logic
>   change; 56 pytest still pass. **Scope: Orc-only ("Orc sanctuary") — corpus
>   only covers matchups where Orc fights.**
> - T3.3: deviation scoring & prioritization — `apps/api-py/app/benchmarks/
>   scoring.py` layers per-metric **impact weights** (economy > tech > hero
>   progression; documented with rationale in `wc3-knowledge/scoring.md`, kept
>   identical to code) over the engine's per-metric severity.
>   `score = impact_weight × severity_multiplier × magnitude_factor`; pure/
>   deterministic. `prioritize()` returns the Orc player's top-N `ScoredProblem`s
>   (default 5) feeding the future `CoachReport.tips`. New `GET /benchmarks/
>   {id}/top?top_n=&orc_slot=`. No ML (rules/weights only — XGBoost deferred).
>   104 pytest pass (+48). EPIC 3 (deterministic strategy layer) complete.
> - **First live end-to-end smoke test (2026-06-10):** brought up the full stack
>   (Postgres+pgvector, Redis, Ollama) and ran a real `.w3g` (OvNE) through
>   upload → parse/persist (api-node) → benchmarks+scoring → `GET /…/top`. Works;
>   86 events + benchmarks for both slots persisted; Orc top-3 problems returned.
> - **EPIC 5 — RAG + LLM coach (T5.1–T5.3), 2026-06-11:** the headline layer.
>   T5.0: pulled `bge-m3` (1024-dim embeddings) + `qwen2.5:14b-instruct-q4_K_M`
>   into Ollama. T5.1: `apps/api-py/app/rag/` — pure markdown chunker
>   (heading-split + breadcrumb + long-section sub-split), async Ollama bge-m3
>   embed client, and a SQLAlchemy/asyncpg DB layer storing the wc3-knowledge
>   corpus into `knowledge_docs`+`knowledge_chunks` (pgvector `Vector(1024)`);
>   idempotent upsert by `(title,source)`. `POST /knowledge/ingest` + `python -m
>   app.rag.seed` (live: 7 docs / 78 chunks). T5.2: `search_chunks` pgvector
>   cosine nearest-search (score = 1−distance) with a matchup filter that keeps
>   the requested matchup + matchup-agnostic refs and excludes other matchups;
>   `retrieve()` + `POST /rag/query`. T5.3: `apps/api-py/app/coach/` — scored
>   problems → per-problem RAG retrieve+dedupe → pure prompt builder (design-doc
>   §7.3) → Ollama qwen2.5 chat with **structured JSON output** → `CoachReport`
>   (3–5 `CoachTip`s). New `coach_reports` table (**migration 0004**, one row per
>   replay, branded to shared-types). `POST /coach/{id}/run` + `GET /coach/{id}`
>   (404/422-"Orc sanctuary"/503). **Principle #4 hardened after live testing:**
>   CONTEXT spells out the opponent race (model had said "Undead" in an OvNE
>   game) and the system prompt bans cross-matchup material + raw-ms/restated
>   timings. Live OvNE run returns clean, matchup-correct, M:SS-timed tips.
>   212 pytest (pure chunker/prompt/tip tests; embeddings/LLM/DB are live-only).
>   Caught + fixed 5 bugs the build/unit tests couldn't (4 commits): `db:migrate`
>   `--loader`→`--import` (Node 24); api-node crash when `pino-pretty` absent;
>   api-py queries used wrong column names (`duration`→`duration_ms`,
>   `payload_json`→`payload`) and `text` instead of `uuid` for id/FK columns;
>   `benchmarks.expected/delta` made nullable (migration 0003) + shared-types.
>   **Env quirk on this machine:** a native PostgreSQL 18 service owns host
>   :5432, so the container is remapped to **:5433** via a gitignored
>   `docker-compose.override.yml` + local `.env` (`DATABASE_URL=…localhost:5433`).
> Next up: EPIC 4 (APM trainer) is the main remaining greenfield epic. Near-term
> follow-up: render the `CoachReport.tips` in `apps/web` (in progress — Director).
> Deaths/positions (T1.4, Observer API) remain a tracked follow-up, as does
> promoting `ScoredProblem` into shared-types + the JSON-Schema→pydantic
> generator (TODO T0.4).
> See `docs/WC3_Coach_Design_Doc.md` and `docs/WC3_Coach_Project_Plan.md`
> for full architecture and backlog.

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

- `docs/WC3_Coach_Design_Doc.md` — full architecture, ML approach, the **data model /
  DB schema** (§5: `replays`, `replay_players`, `game_events`, `benchmarks`,
  `apm_sessions`, `knowledge_docs`/`knowledge_chunks`, ontology tables), and the
  `.w3g` "deaths are not recorded" limitation with the two paths around it (§6).
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

### Key external libraries & references
The replay pipeline leans on prior art (design doc §Sources) — consult before reinventing:
- **`w3gjs`** (https://github.com/PBug90/w3gjs) — the chosen `.w3g` parser; best Reforged support.
- **`wc3v`** (https://github.com/jblanchette/wc3v) — state/build-order simulation; reference for Path A (death inference).
- **`war3observer`** (https://github.com/sides/war3observer) — reads `War3StatsObserverSharedMemory`; the legal Observer-API path (§6, Path B) for deaths/positions on replay playback.

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

`apps/`, `packages/`, `db/`, and `docker-compose.yml` all exist (T0.1 + T0.2).

---

## Build / lint / test commands

> **pnpm is not installed globally** on the target machine (Windows, EPERM on
> `corepack enable`). All pnpm commands must be prefixed with `corepack`:
> ```
> corepack pnpm <args>
> ```
> `corepack` ships with Node and auto-downloads pnpm 9.15.9 (pinned in
> `package.json#packageManager`) on first use.
>
> **Turbo + corepack on Windows:** Turborepo's binary needs a `pnpm` executable
> in the system PATH. Create a wrapper once after cloning:
> ```bash
> # Run once after clone (Git Bash / WSL):
> mkdir -p ~/.local/bin
> PNPM_CJS=$(node -e "require('child_process').execSync('corepack pnpm root -g',{encoding:'utf8'}).trim()" 2>/dev/null || \
>   echo "$(node -e "process.stdout.write(process.execPath.replace(/node\.exe$/,''))")../corepack/v1/pnpm/9.15.9/bin/pnpm.cjs")
> # Simpler: create it in the npm global prefix (already in PATH):
> printf '#!/usr/bin/env bash\nexec node "%APPDATA%\\npm\\..\\..\\Local\\node\\corepack\\v1\\pnpm\\9.15.9\\bin\\pnpm.cjs" "$@"\n' \
>   > "$(npm config get prefix)/pnpm"
> chmod +x "$(npm config get prefix)/pnpm"
> ```
> On this machine the wrapper already lives at `%APPDATA%\npm\pnpm` (gitignored
> `.bin/` in repo root also works for local dev).

### Install all workspace dependencies
```bash
corepack pnpm install
```

### Build all packages (tsc, respects `^build` dependency order)
```bash
corepack pnpm turbo build
# or via the root package.json script:
corepack pnpm run build
```

### Type-check all TS packages
```bash
corepack pnpm turbo typecheck
# or:
corepack pnpm run typecheck
```

### Lint all packages
```bash
corepack pnpm turbo lint
# or:
corepack pnpm run lint
```

### Run all tests
```bash
corepack pnpm turbo test
# or:
corepack pnpm run test
```

### Run a single package's script
```bash
# Build / typecheck / test a specific workspace package
corepack pnpm --filter @wc3-coach/parser build
corepack pnpm --filter @wc3-coach/parser typecheck
corepack pnpm --filter @wc3-coach/parser test

# Filter by directory (alternative syntax)
corepack pnpm --filter ./packages/shared-types build
```

### Python API (apps/api-py) — managed separately, not a pnpm workspace member
```bash
cd apps/api-py

# Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate

# Install all dependencies (including dev extras)
pip install -e ".[dev]"

# Run the dev server
uvicorn app.main:app --reload --port 8001

# Run tests
pytest                           # all tests
pytest -k test_health            # single test by name
pytest tests/benchmarks/         # all tests in a directory
```

### Local infrastructure (Docker) — T0.2 complete

#### First-time setup
```bash
# 1. Copy the env template (only once after cloning)
cp .env.example .env          # Linux/macOS/Git Bash
copy .env.example .env        # Windows CMD
Copy-Item .env.example .env   # PowerShell

# 2. Start Postgres + Redis (always needed for dev)
docker compose up -d

# 3. Check service health (wait ~15 s on first pull)
docker compose ps
# You should see "healthy" next to postgres and redis.
```

#### Connection strings (defaults from .env.example)
```
DATABASE_URL=postgresql://wc3coach:wc3coach@localhost:5432/wc3coach
REDIS_URL=redis://localhost:6379
OLLAMA_HOST=http://localhost:11434
```

#### Starting Ollama with GPU (RTX 5070 Ti)
Ollama is in the `gpu` compose profile so it does NOT start on bare `up`.
Requires the NVIDIA Container Toolkit installed in WSL2 first (see GPU fallback
note below if you haven't done this yet).

```bash
# Start all three services (postgres + redis + ollama with GPU)
docker compose --profile gpu up -d

# Verify Ollama is reachable
curl http://localhost:11434/api/tags
```

#### Manual Ollama model pulls
Models are large (4–9 GB). Pull once; they persist in the `ollama-data` volume.
```bash
# LLM — choose one (or pull both for experimentation)
docker compose exec ollama ollama pull qwen2.5:14b-instruct-q4_K_M   # ~9 GB, best quality
docker compose exec ollama ollama pull llama3.1:8b                    # ~5 GB, faster

# Embedding model — choose one
docker compose exec ollama ollama pull bge-m3          # ~570 MB, best multilingual
docker compose exec ollama ollama pull nomic-embed-text # ~270 MB, lighter alternative
```
These pulls are GPU-accelerated once the model is running. Expect 10–30 min on
first pull depending on connection speed.

#### GPU fallback (CPU-only Ollama)
If the NVIDIA Container Toolkit is not yet set up in WSL2, comment out the
`deploy:` block in the `ollama` service in `docker-compose.yml` and change or
remove the `profiles:` line. Then run:
```bash
docker compose up -d ollama
```
CPU inference is much slower but functional for testing prompts/API integration.

To set up GPU passthrough in WSL2, follow:
https://docs.nvidia.com/cuda/wsl-user-guide/index.html

#### Stopping services
```bash
docker compose down           # stop containers, KEEP data volumes
docker compose --profile gpu down   # same but also stops ollama if running
docker compose down -v        # stop AND delete all volumes (full reset)
```

### DB migrations (Drizzle ORM — partially scaffolded in T1.3)
The schema lives in TypeScript at `packages/db/src/schema.ts` (single source of
truth). SQL migrations are generated into `db/migrations/` by `drizzle-kit` and
applied by a small runner. **Never hand-edit a live DB.** Requires `DATABASE_URL`
in the environment and Postgres running (`docker compose up -d`).
```bash
# 1. Edit packages/db/src/schema.ts, then generate a new migration SQL file:
corepack pnpm --filter @wc3-coach/db db:generate   # → db/migrations/NNNN_*.sql

# 2. Review the generated .sql, commit it, then apply pending migrations:
corepack pnpm --filter @wc3-coach/db db:migrate
```
> The full ingest pipeline (schema ↔ shared-types mapping, the
> pending→parsing→done lifecycle, and an end-to-end local run) is documented in
> `docs/T1.3_Ingest_Pipeline.md`. Remaining T2.1 work: ontology, benchmarks, and
> knowledge/pgvector tables.

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
