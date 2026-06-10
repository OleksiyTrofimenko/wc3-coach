# Guide: The LLM Coach, RAG, and Ollama

> A plain-language explainer for the three pieces that make up **EPIC 5** of WC3
> Coach. It assumes you've seen the rest of the project (the parser, the
> benchmark engine, the scored problems) but have **not** built an LLM system
> before. Read top to bottom; each section builds on the last.

---

## 0. The 30-second version

By the end of EPIC 3 we can already say, in cold numbers, *what* an Orc player
did wrong in a replay:

> `expansion_timing` — no expansion taken, score 30.0, **critical**.

That's a **fact**, computed deterministically (T3.3). But it's not *coaching*. A
coach doesn't just say "you expanded late" — they say **why it lost you the
game, what you should have done, and when**:

> *"You never took your natural expansion. Against Human you're already behind
> on economy by default, so a one-base Orc at 8:00 simply can't match a
> Brilliance-Aura fast-expand. Take your expo around 5:30 right after Stronghold
> finishes, while your Blademaster keeps the Footmen busy."*

Turning the first into the second is the job of the **LLM coach**. It uses:

- **RAG** — to fetch the *right* strategy knowledge for this exact situation, so
  the explanation is grounded in real WC3 theory instead of made up.
- **Ollama** — the program that actually runs the language model on *your* PC,
  so none of your replays leave the machine.

The rest of this guide explains each one.

---

## 1. What is an "LLM" and what is the "LLM coach"?

### 1.1 LLM = Large Language Model

A **Large Language Model** (LLM) is a program that, given some text, predicts
what text should come next. That's literally all it does at the core: "given
these words, what's the most plausible continuation?" Models like Qwen2.5 or
Llama 3.1 have read an enormous amount of text, so their "plausible
continuation" is often a coherent, useful answer.

The crucial thing to internalise for this project:

> **An LLM is a language engine, not a fact database.**

It is *fluent*, but it is not *reliable about specifics*. Ask a raw LLM "when
does Orc take Stronghold vs Night Elf?" and it will happily produce a
confident-sounding number — which may be **wrong**, because it's predicting
plausible-sounding text, not looking up a verified value. In the LLM world this
failure is called a **hallucination**: fluent, confident, and false.

This is exactly why our project's **Principle #4** exists:

> *"Data is the source of truth, the LLM is the interpreter."*

We never ask the LLM for game facts. We *compute* the facts (benchmarks), we
*retrieve* the strategy text (RAG), and we only ask the LLM to do the one thing
it's genuinely good at: **explain and prioritise, in natural language, the facts
we already handed it.**

### 1.2 The "LLM coach" in this project

The **LLM coach** (EPIC 5, the *Mentor* agent's domain) is the final layer of
the pipeline. Its input is everything the deterministic layers produced; its
output is the `CoachReport` you already see defined in
`packages/shared-types/src/index.ts`:

```ts
type CoachTip = {
  priority: number;          // 1 = most important
  title: string;             // "Expand too late"
  detail: string;            // the 1–3 sentence explanation
  tMs?: number;              // timestamp to deep-link the UI to that moment
  relatedBenchmarks?: string[]; // which metrics this tip came from
};

type CoachReport = {
  replayId: string;
  matchup: string;           // "OvH"
  result: "win" | "loss" | "unknown";
  durationMs: number;
  tips: CoachTip[];          // 3–5 tips, ordered by priority
};
```

So the coach's job is precisely: **`ScoredProblem[]` (from T3.3) + retrieved
strategy knowledge → 3–5 `CoachTip`s in plain English.** Nothing more. It does
not invent timings; it dresses our computed problems in explanation and turns
them into advice a human can act on.

---

## 2. What is RAG?

**RAG = Retrieval-Augmented Generation.** It's a long name for a simple, very
practical idea. Let's build it up.

### 2.1 The problem RAG solves

We established that an LLM hallucinates facts. There are two ways to fix that:

1. **Retrain / fine-tune the model** on WC3 knowledge so the facts live "inside"
   it. Expensive, slow, and the facts are baked in — update a build order and
   you'd have to retrain. (We *might* do a light version of this much later;
   it's the QLoRA note in the design doc. Not now.)
2. **Give the model the facts at question time**, pasted right into its input,
   and tell it: *"answer using only this."* Cheap, instant to update, and the
   facts stay in files you control.

Option 2 is RAG. The "augmented" part means we **augment** the model's input
with retrieved reference text before it generates its answer.

> **Analogy:** A raw LLM is a smart student answering from memory — fluent but
> sometimes confidently wrong. RAG is the same student writing an
> **open-book exam**: before answering, they look up the relevant page and
> answer *from that page*. Same brain, far more reliable answers.

### 2.2 The "retrieval" half — how do we find the right page?

Our WC3 knowledge lives as text in `.claude/skills/wc3-knowledge/`
(`timings.md`, `matchups/OvH.md`, `scoring.md`, …) and eventually a larger guide
corpus. When a replay shows "expansion taken too late in OvH", we want to pull
*the paragraphs about Orc expansion timing vs Human* — and not the paragraphs
about Night Elf micro.

The naive approach — keyword search ("expansion") — is brittle. A guide might
say "take your natural" or "fast-expand" or "FE" and never use the word
"expansion". We need search by **meaning**, not by exact word. That's where
**embeddings** and **vectors** come in.

#### Embeddings and the vector database

An **embedding** is a list of numbers (a *vector*, e.g. 1024 numbers) that
represents the *meaning* of a piece of text. A model called an **embedding
model** (we use `bge-m3`) reads text and outputs this vector. The key property:

> Texts with **similar meaning** get **similar vectors** (they sit close
> together in this 1024-dimensional space), even if they share no words.

So "take your natural expansion" and "when to FE vs Human" land near each other.

The workflow has two phases:

**Phase A — Ingestion (done once, ahead of time):**

```
each guide chunk ──▶ embedding model (bge-m3) ──▶ vector ──▶ stored in Postgres
```

We chop the guides into chunks, embed each chunk, and store the chunks + their
vectors. This is what the `knowledge_docs` / `knowledge_chunks` tables and the
`vector(1024)` column in our schema (T2.1) are for — Postgres + the **pgvector**
extension can store vectors and find "nearest" ones quickly (an **HNSW index**
makes that search fast). This phase is project task **T5.1**.

**Phase B — Retrieval (every time we coach a replay):**

```
"Orc expanded late vs Human" ──▶ embedding model ──▶ query vector
       ──▶ pgvector finds the N closest chunk-vectors ──▶ those chunks' text
```

We embed the *problem*, ask pgvector for the closest stored chunks, and get back
the most semantically relevant strategy paragraphs. This is task **T5.2**.

### 2.3 The "generation" half — assembling the prompt

Now we have (a) the computed problems and (b) the retrieved strategy text. We
build a single block of text — the **prompt** — roughly shaped like:

```
SYSTEM: You are a Warcraft III coach for an Orc player. Use ONLY the facts and
        reference material provided. Do not invent timings. Output 3–5 tips.

FACTS (computed from the replay):
  - expansion_timing: no expansion taken (expected ~5:30) — critical
  - tier2_timing: Stronghold at 4:10, 120s late — critical
  - matchup: OvH, result: loss, duration: 11:20

REFERENCE MATERIAL (retrieved):
  «...paragraphs from matchups/OvH.md about Orc expansion timing and the
     Human fast-expand economic advantage...»

TASK: Write the 3–5 most important, prioritised, timed tips.
```

We hand that to the LLM and it **generates** the natural-language tips. Because
every fact and every piece of strategy is *in the prompt*, the model isn't
recalling from memory — it's synthesising from material we control and trust.
That's RAG end to end: **Retrieve** the right knowledge, **Augment** the prompt
with it, let the model **Generate** the explanation. This synthesis step is task
**T5.3**.

### 2.4 Why this is the right design for us

- **No hallucinated timings.** The numbers come from our benchmark engine and
  our verified corpus, never from the model's guesses (Principle #4).
- **Update knowledge by editing Markdown**, not retraining a model. Add a
  matchup file, re-embed, done.
- **Explainable.** Each tip can point back (`relatedBenchmarks`) to the exact
  metric and chunk it came from — no black box.

---

## 3. What is Ollama?

So far "the LLM" and "the embedding model" have been abstract. **Ollama is the
actual program that runs them on your computer.**

### 3.1 What it is

[Ollama](https://ollama.com) is a local **model runner**. Think of it as a tiny
server that:

1. **Downloads** open-weight models (`ollama pull qwen2.5:14b-instruct-q4_K_M`),
2. **Loads** them onto your GPU,
3. Exposes a simple **HTTP API** on `http://localhost:11434` so your code can
   say "here's a prompt, give me the completion" or "here's some text, give me
   its embedding."

It's the difference between *"a language model exists as a concept"* and *"there
is a thing listening on a port that I can POST a prompt to."* Our Python API
(`apps/api-py`) will just make HTTP calls to Ollama — it never deals with the
raw model files.

### 3.2 Why local (and not OpenAI / Claude / a cloud API)?

This is **Principle #2: Everything local.** Reasons, in order of importance for
this project:

- **Privacy & ownership.** Your replays and your play habits never leave your
  PC. No account, no upload, no terms-of-service.
- **Cost.** Cloud LLM APIs charge per token. You analyse many replays; locally
  it's free after the one-time download.
- **No dependency.** It works on a plane, offline, forever — it won't break
  because an API changed or a key expired.
- **You have the hardware for it.** The target machine (RTX 5070 Ti, 16 GB
  VRAM) comfortably runs an 8–14B model *plus* the embedding model in parallel.

The trade-off is quality: a local 14B model is not as sharp as the largest cloud
models. But remember the division of labour — the **hard reasoning (what went
wrong, how much it mattered) is already done deterministically** by our engine.
The LLM only has to *phrase* it well, and a local model is more than good enough
for that.

### 3.3 The two models we run

Ollama hosts **both** models the pipeline needs:

| Role | Model (default) | Size | Job |
|------|-----------------|------|-----|
| **LLM** | `qwen2.5:14b-instruct-q4_K_M` (or `llama3.1:8b`) | ~9 GB / ~5 GB | Write the coach tips |
| **Embeddings** | `bge-m3` | ~570 MB | Turn text into vectors for RAG |

> **"q4_K_M" / quantization.** Models are originally stored as very precise
> numbers (16 bits each). **Quantization** squashes them to ~4 bits each — the
> model gets ~4× smaller and faster, for a small quality loss. `q4_K_M` is a
> well-balanced quantization level. It's why a 14-billion-parameter model fits
> in 16 GB of VRAM at all. The `instruct` part means the model was tuned to
> *follow instructions* (good for "write 3–5 tips") rather than just autocomplete.

### 3.4 How it's wired in our repo

This is already scaffolded (EPIC 0, T0.2). Ollama runs as a Docker container,
GPU-accelerated, in the `gpu` compose profile:

```bash
# Start Postgres + Redis + Ollama (GPU)
docker compose --profile gpu up -d

# One-time: pull the models (they persist in the ollama-data volume)
docker compose exec ollama ollama pull qwen2.5:14b-instruct-q4_K_M
docker compose exec ollama ollama pull bge-m3

# Verify it's listening
curl http://localhost:11434/api/tags
```

The connection string `OLLAMA_HOST=http://localhost:11434` is already in
`.env.example`. When we build EPIC 5, the Python API reads that and makes its
HTTP calls there. (See CLAUDE.md → "Starting Ollama with GPU" for the full
setup, including the NVIDIA Container Toolkit / WSL2 GPU note.)

---

## 4. Putting it all together — the full coach pipeline

Here is every layer, from a saved replay to a coaching report, showing where the
three concepts from this guide fit (the **bold** stages are EPIC 5):

```
 .w3g replay file
      │  (EPIC 1) w3gjs parse → normalize
      ▼
 GameEvent[] timeline  ───────────────────►  stored in Postgres
      │  (EPIC 3, T3.1) benchmark engine
      ▼
 BenchmarkResult[]  (facts + severity)
      │  (EPIC 3, T3.3) scoring
      ▼
 ScoredProblem[]  (top 3–5 Orc problems)            ◄── deterministic. No LLM yet.
      │
      │  ════════════ EPIC 5 starts here ════════════
      │
      ▼
 ① RETRIEVE (RAG)                                   T5.2
      embed each problem ──► pgvector nearest-search
      ──► relevant strategy chunks from the corpus
      │
      ▼
 ② AUGMENT
      build one prompt = system instructions
                       + the computed facts
                       + the retrieved strategy text
      │
      ▼
 ③ GENERATE                                         T5.3
      POST the prompt to Ollama (qwen2.5 14B) ──► natural-language tips
      │
      ▼
 CoachReport { tips: CoachTip[] }  ──► stored ──► shown in the web dashboard (EPIC 6)
```

Notice the shape of the whole project in this one picture: **the deterministic
layers do the thinking; the LLM does the talking.** RAG is the bridge that keeps
the talking honest, and Ollama is the engine that runs it all on your own
machine.

---

## 5. Glossary (quick reference)

| Term | One-line meaning |
|------|------------------|
| **LLM** | A model that predicts/continues text; fluent but not a fact source. |
| **Hallucination** | When an LLM states something false but confident-sounding. |
| **Prompt** | The text we send the LLM (instructions + facts + retrieved knowledge). |
| **RAG** | Retrieval-Augmented Generation: look up relevant text first, then let the LLM answer from it. |
| **Embedding** | A vector of numbers representing the *meaning* of a piece of text. |
| **Vector / vector DB** | Storage + similarity search over embeddings; we use Postgres + **pgvector**. |
| **Chunk** | A small slice of a guide document that gets embedded and retrieved. |
| **HNSW** | The index type that makes nearest-vector search fast. |
| **Ollama** | Local program that downloads and runs LLMs + embedding models, exposing an HTTP API. |
| **Quantization (q4_K_M)** | Compressing a model to ~4-bit numbers so it's smaller/faster, with minor quality loss. |
| **`instruct` model** | A model tuned to follow instructions, ideal for structured tasks like "write 3–5 tips". |
| **CoachReport / CoachTip** | Our output contract (in `shared-types`): the 3–5 prioritised tips per replay. |

---

## 6. Where to go deeper (in this repo)

- `docs/WC3_Coach_Design_Doc.md` — §3 (Python API), §5 (data model incl. the
  knowledge/vector tables), §7.3 (the coach prompt contract).
- `packages/shared-types/src/index.ts` — the `CoachReport` / `CoachTip` types.
- `.claude/skills/wc3-knowledge/` — the corpus RAG will retrieve from.
- `.claude/agents/coach.md` — the *Mentor* agent that owns EPIC 5.
- `CLAUDE.md` → "Starting Ollama with GPU" — the concrete setup commands.

> **Project tasks that build this:** T5.1 (embed + store the corpus), T5.2 (RAG
> retrieval), T5.3 (LLM synthesis → `CoachReport`). All of EPIC 5.
