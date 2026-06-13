# Teaching the local LLM — dataset → QLoRA → Ollama

This documents how the curation pipeline feeds a future fine-tune. **Only the
dataset side is built today** (the curation UI + JSONL export). The training step
below is intentionally NOT automated yet — run it once enough examples exist.

## What we teach (and what we don't)

Per CLAUDE.md Principle #4, **data is the source of truth, the LLM is the
interpreter.** We do **not** fine-tune the model to memorize WC3 facts — facts stay
in benchmarks + RAG. We teach **style and grounding discipline**: given the FACTS we
hand it, produce well-structured, on-tone, *non-fabricating* coaching tips.

## The dataset (built)

A training example = `(captured prompt messages) → (human-curated ideal tips)`:

- **input** = the exact system+user messages the coach builds for a replay
  (`app/coach/prompt.py::build_messages`, captured via `assemble_coach`). No
  train/serve skew — it's the same prompt production uses.
- **output** = the gold tips a human approved, seeded from the deterministic
  `ScoredProblem` summaries and edited in the curation UI. **Never** seeded from the
  LLM's own output (that would teach it to imitate its mistakes).

Curate at `/replays/<id>` → **Approve** → download from `/replays`:

```
GET /api/py/curation/export.jsonl
```

Each line is chat-format JSONL:

```json
{"messages":[{"role":"system","content":"..."},{"role":"user","content":"...FACTS..."},{"role":"assistant","content":"{\"tips\":[{\"title\":\"...\",\"detail\":\"...\"}]}"}]}
```

The assistant content matches the coach's structured-output schema
(`_TIP_SCHEMA` = `{"tips":[{title, detail}]}`), so the model learns to emit exactly
what production parses.

## The fine-tune (NOT built — do later)

Prerequisite: **a few hundred approved examples.** With fewer, skip — the model
won't generalize and you risk overfitting to a handful of games.

Ollama does **not** train; it serves. The path:

1. **Train a QLoRA adapter** with a single-GPU toolchain (RTX 5070 Ti, 16 GB).
   [Unsloth](https://github.com/unslothai/unsloth) is the easiest; Axolotl or HF PEFT
   also work. Base model = the same family we serve (qwen2.5; a **7–8B** base is the
   practical local fine-tune target — 14B QLoRA is tight at 16 GB). Feed the JSONL as
   an instruct/chat dataset.
2. **Convert to GGUF** (llama.cpp `convert` / export) — merged model or LoRA adapter.
3. **Import into Ollama** via a `Modelfile`:
   ```
   FROM qwen2.5:7b-instruct-q4_K_M
   ADAPTER ./wc3-coach-lora.gguf
   SYSTEM """<the coach system prompt>"""
   ```
   `ollama create wc3-coach -f Modelfile`.
4. **Point the coach at it**: set the chat model in `app/coach/service.py`
   (`CHAT_MODEL`) to `wc3-coach`. Keep the deterministic grounding validator (T5.4) —
   a fine-tune reduces but never eliminates fabrication risk.

## Evaluation

Before swapping the production model, A/B it: run both models over a held-out set of
curated examples and compare grounding-validator strip rate + how often the output
matches the approved gold. Only promote if the fine-tune is clearly better.
