---
name: wc3-knowledge
description: >
  Shared Warcraft III knowledge base for all WC3 Coach agents — the single source of
  truth for ontology, timings, matchups, and terminology. Agents READ from here and
  GROW it; they never invent timings/stats elsewhere.
---

# WC3 Knowledge Base

Curated, versioned-with-code reference that every role relies on. If a fact is missing,
add it HERE rather than hard-coding a magic number in application code.

## Files
- `ontology.md` — races, units, buildings, heroes, creeps; short cross-reference to the DB.
- `timings.md` — reference timings per matchup and patch (expand, T2/T3, hero levels).
- `matchups/` — one file per matchup (OvH, OvNE, OvUD, …): build orders, win-conditions,
  common mistakes.
- `glossary.md` — WC3 terms so the coach speaks the language of the game.

## Rules
- Every timing/stat is tagged with the patch it applies to.
- Start narrow: one race, 2-3 matchups; expand incrementally.
- Strategist owns correctness; all agents may read.
