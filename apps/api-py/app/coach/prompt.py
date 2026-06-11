"""
Prompt builder for the LLM coach (T5.3).

PURE module — no DB, no Ollama, no side effects.
All functions are deterministic and fully unit-testable.

Design doc §7.3 prompt contract
--------------------------------
The messages list follows the Ollama /api/chat format:
    [{"role": "system", "content": "..."}, {"role": "user", "content": "..."}]

Anti-hallucination measures (Principle #4)
------------------------------------------
1. System message explicitly forbids inventing timings, numbers, build orders,
   or any facts not present in the material.
2. User message separates FACTS (computed by the benchmark engine — ground
   truth) from REFERENCE MATERIAL (retrieved knowledge chunks) so the LLM
   cannot confuse "stuff it was told" with "stuff it recalls from training".
3. TASK section instructs the model to ground every tip in the facts/material
   and to omit any point the material does not support.
4. JSON structured output (passed via "format" in the Ollama request) prevents
   free-form prose that could smuggle invented numbers through the tip text.

Usage
-----
    from app.coach.prompt import build_messages
    from app.benchmarks.scoring import ScoredProblem
    from app.rag.models import RetrievedChunk

    messages = build_messages(
        matchup="OvNE",
        map_name="Shallow Grave",
        result="loss",
        duration_ms=680_000,
        problems=[...],   # list[ScoredProblem]
        chunks=[...],     # list[RetrievedChunk]
    )
"""

from __future__ import annotations

from app.benchmarks.scoring import ScoredProblem
from app.rag.models import RetrievedChunk

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT = """\
You are a pro-level Warcraft III coach for the Orc player in a 1v1 game.

STRICT RULES — you MUST follow them or your output is invalid:
1. Use ONLY the FACTS and REFERENCE MATERIAL provided in this message.
2. Do NOT invent timings, numbers, build orders, hero names, unit stats, \
or any facts not present in the material.
3. If the material does not support a point, do not make it.
4. Every tip MUST reference at least one specific FACT from the list below \
(metric name, measured value, or timing).
5. Do NOT add generic WC3 advice that is not grounded in the provided data.
6. The opponent's race is stated in CONTEXT. Coach ONLY for that matchup. The \
REFERENCE MATERIAL may include timings or notes for OTHER opponent races \
(Human, Night Elf, Undead, Orc) — use only what applies to THIS opponent and \
never name a different opponent race than the one in CONTEXT.
7. Express every game time as M:SS (for example 5:30), exactly as written in \
the FACTS. NEVER write times in milliseconds or raw seconds, and never restate \
a timing value differently from how it appears in the FACTS.

Your task is to output 3-5 prioritised, specific, actionable coaching tips, \
most important first.

Each tip must have:
- "title": a short (5-10 word) description of the problem
- "detail": 1-3 sentences explaining WHY this cost the game, WHAT to do \
instead, and WHEN to do it — all grounded in the FACTS and REFERENCE MATERIAL
"""

_TASK_SECTION = """\
TASK:
Write 3-5 coaching tips based ONLY on the FACTS and REFERENCE MATERIAL above. \
Most important first (priority 1 = worst problem). \
Each tip must be specific, timed where the data supports it, and grounded in \
the provided material — no invented numbers or generic advice."""


# Maps the analysed-race-first matchup code to the opponent's full race name.
# The LLM does not reliably know that "OvNE" means the opponent is Night Elf,
# so we spell it out in CONTEXT to stop it guessing the wrong opponent race.
_OPPONENT_RACE: dict[str, str] = {
    "OvH": "Human",
    "OvNE": "Night Elf",
    "OvUD": "Undead",
    "OvO": "Orc",
}


def _opponent_race(matchup: str) -> str:
    """Return the opponent's full race name for a matchup code, or 'Unknown'."""
    return _OPPONENT_RACE.get(matchup, "Unknown")


def _fmt_duration(duration_ms: int) -> str:
    """Format milliseconds as M:SS string."""
    total_s = duration_ms // 1000
    return f"{total_s // 60}:{total_s % 60:02d}"


def _fmt_facts(problems: list[ScoredProblem]) -> str:
    """
    Format scored problems as numbered fact lines for the prompt.

    Each line includes: rank, summary (template-generated, not LLM), severity,
    and impact score. The summary contains the key timing/count data the LLM
    needs to write a grounded tip.
    """
    if not problems:
        return "  (no significant deviations detected — this was a clean game)"

    lines: list[str] = []
    for i, p in enumerate(problems, 1):
        lines.append(
            f"  {i}. [{p.severity.upper()}] {p.summary}  "
            f"(metric: {p.metric}, impact_score: {p.score:.1f})"
        )
    return "\n".join(lines)


def _fmt_chunks(chunks: list[RetrievedChunk]) -> str:
    """
    Format retrieved knowledge chunks as numbered reference paragraphs.

    Each chunk is attributed to its source document so the LLM (and human
    reviewer) can trace every claim back to the corpus.
    """
    if not chunks:
        return "  (no reference material retrieved)"

    lines: list[str] = []
    for i, c in enumerate(chunks, 1):
        source = f"[Source: {c.doc_title}]"
        lines.append(f"  {i}. {source}\n     {c.chunk_text}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def build_messages(
    matchup: str,
    map_name: str,
    result: str,
    duration_ms: int,
    problems: list[ScoredProblem],
    chunks: list[RetrievedChunk],
) -> list[dict[str, str]]:
    """
    Build the system + user messages for the LLM coach.

    This function is PURE (no I/O). Call it before the Ollama chat request.

    Parameters
    ----------
    matchup:
        Canonical matchup code, e.g. "OvNE", "OvH", "OvUD", or "unknown".
    map_name:
        Human-readable map name, e.g. "Shallow Grave".
    result:
        Orc player's game result: "win", "loss", or "unknown".
    duration_ms:
        Total game duration in milliseconds.
    problems:
        Prioritised scored problems from scoring.prioritize().  These are the
        FACTS the LLM must ground every tip in.
    chunks:
        Retrieved knowledge chunks from rag.retrieve().  These are the
        REFERENCE MATERIAL the LLM may use for explanation and context.

    Returns
    -------
    list[dict[str, str]]
        [{"role": "system", "content": ...}, {"role": "user", "content": ...}]
        Ready to pass as the "messages" field in an Ollama /api/chat request.
    """
    duration_str = _fmt_duration(duration_ms)

    user_content = f"""\
CONTEXT:
  Matchup : {matchup} (you are Orc, opponent is {_opponent_race(matchup)})
  Map     : {map_name}
  Result  : {result}
  Duration: {duration_str}

FACTS (computed deterministically from the replay — treat these as ground truth):
{_fmt_facts(problems)}

REFERENCE MATERIAL (from WC3 strategy corpus — context and explanation):
{_fmt_chunks(chunks)}

{_TASK_SECTION}"""

    return [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]
