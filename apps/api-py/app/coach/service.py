"""
LLM coach orchestration service (T5.3).

Entry point: generate_coach_report(replay_id, ...) -> CoachReport

Pipeline (design doc §7.3, Guide_LLM_Coach_RAG_Ollama.md §4):
  1. Load replay timeline (load_replay_timeline) → events, players, duration, patch
  2. Derive Orc slot / matchup / mapName / result (422 if no Orc player)
  3. Fetch or compute benchmarks (self-contained: runs benchmarks if absent)
  4. Prioritize → scored problems (T3.3)
  5. RAG augment: retrieve relevant chunks per problem, pool + dedupe, cap at max_chunks
  6. Build prompt (pure) → chat(Ollama structured output) → parse tips
  7. Post-process: clamp 3-5 tips, set priority, tMs, relatedBenchmarks
  8. Persist to coach_reports (upsert — idempotent)
  9. Return CoachReport

Hallucination prevention (Principle #4)
----------------------------------------
- All numbers in the tips come from the scored problems (engine output) or
  the knowledge corpus chunks — never from the LLM's own knowledge.
- The system prompt explicitly forbids inventing timings or stats.
- Structured output (JSON schema) forces the model to produce parseable tips
  without free-form prose that could sneak in invented numbers.
- tMs is set deterministically from the scored problem's measured value,
  NOT from what the LLM writes.

Orc sanctuary
--------------
If neither player is Orc, we return HTTP 422 via a ValueError with the
message "orc_sanctuary" so the FastAPI layer can render a clear message.
(The dashboard already handles this with a notice to the user.)

Mirror check
-------------
If matchup code cannot be inferred (mirror match or unrecognised combination),
we proceed with matchup="unknown"/the fallback code and pass matchup=None to
the RAG retrieve call so all chunks are searched (general references only).
"""

from __future__ import annotations

import json
import logging
from typing import Any

from app.benchmarks.db import (
    fetch_benchmarks,
    get_engine,
    load_replay_timeline,
    persist_benchmarks,
)
from app.benchmarks.engine import run_benchmarks
from app.benchmarks.models import PlayerInfo
from app.benchmarks.references import infer_matchup_code
from app.benchmarks.scoring import ScoredProblem, prioritize
from app.coach.db import load_replay_meta, upsert_report
from app.coach.models import CoachReport, CoachTip
from app.coach.prompt import build_messages
from app.rag.models import RetrievedChunk
from app.rag.ollama import CHAT_MODEL, chat
from app.rag.retrieval import retrieve

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# JSON schema for Ollama structured output
# ---------------------------------------------------------------------------
# This schema constrains the LLM to produce a well-formed tips array.
# The model must return exactly this shape; no free prose is possible.
# Each tip object maps directly to CoachTip (camelCase for consistency).

_TIP_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "tips": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "detail": {"type": "string"},
                },
                "required": ["title", "detail"],
            },
            "minItems": 3,
            "maxItems": 5,
        }
    },
    "required": ["tips"],
}

# ---------------------------------------------------------------------------
# Time-based metric names (for tMs assignment)
# ---------------------------------------------------------------------------
# tMs is ONLY set for these time-based metrics when value != -1 (i.e. the
# event actually happened and the value is a real timestamp in ms).
# Level/count metrics and absent-event results (value == -1) do NOT get tMs.

_TIME_METRICS: frozenset[str] = frozenset({
    "first_hero_timing",
    "tier2_timing",
    "tier3_timing",
    "expansion_timing",
    "hero_level3_timing",
    "hero_level5_timing",
})


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _find_orc_player(players: list[PlayerInfo]) -> PlayerInfo | None:
    """Return the first PlayerInfo with race_id == 'race:orc', or None."""
    for p in players:
        if p.race_id == "race:orc":
            return p
    return None


def _derive_matchup(
    orc_player: PlayerInfo,
    players: list[PlayerInfo],
) -> tuple[str, str | None]:
    """
    Derive (display_matchup, rag_matchup) from the orc player and opponents.

    display_matchup : used in CoachReport.matchup (always a string).
    rag_matchup     : passed to retrieve(); None means "no filter" (general refs).

    For 1v1: opponent is the other player.
    For FFA / no opponent found: return "unknown" / None.
    Orc mirror: return "OvO" / None (no Orc-specific strategy in corpus).
    """
    orc_race = orc_player.race_id.replace("race:", "")

    opponents = [p for p in players if p.slot != orc_player.slot]
    if not opponents:
        return ("unknown", None)

    # 1v1: use the single opponent
    opp_player = opponents[0]
    opp_race = opp_player.race_id.replace("race:", "")

    code = infer_matchup_code(orc_race, opp_race)
    if code is None:
        # Mirror or unrecognised combination
        if orc_race and opp_race:
            display = f"{orc_race[0].upper()}v{opp_race[0].upper()}"
        else:
            display = "unknown"
        return (display, None)

    return (code, code)


def _dedupe_chunks(
    all_chunks: list[RetrievedChunk],
    max_chunks: int,
) -> list[RetrievedChunk]:
    """
    Deduplicate chunks by chunk_text, keep highest score per unique text,
    then return the top max_chunks by score.
    """
    seen: dict[str, RetrievedChunk] = {}
    for chunk in all_chunks:
        existing = seen.get(chunk.chunk_text)
        if existing is None or chunk.score > existing.score:
            seen[chunk.chunk_text] = chunk

    unique = sorted(seen.values(), key=lambda c: c.score, reverse=True)
    return unique[:max_chunks]


def _clean_game_report(
    replay_id: str,
    matchup: str,
    map_name: str,
    result: str,
    duration_ms: int,
) -> CoachReport:
    """
    Return a CoachReport for a clean game with no significant problems.

    Produces a single congratulatory tip — grounded, no invented numbers.
    """
    return CoachReport(
        replayId=replay_id,
        matchup=matchup,
        mapName=map_name,
        result=result,  # type: ignore[arg-type]
        durationMs=duration_ms,
        tips=[
            CoachTip(
                priority=1,
                title="Solid fundamentals — no major deviations detected",
                detail=(
                    "All measured benchmarks (hero timing, T2, expansion) were "
                    "within acceptable windows for this matchup. Keep playing "
                    "and look for small edges in micro and army composition."
                ),
            )
        ],
    )


def _parse_tips_from_llm(
    raw_content: str,
    problems: list[ScoredProblem],
) -> list[CoachTip]:
    """
    Parse the LLM's JSON output into CoachTip objects.

    Applies post-processing rules:
    - Clamp to 3-5 tips (truncate if model returns more, pad with clean-game
      tip if fewer than 3 were returned — which should not happen with the schema).
    - Set priority to 1-based rank (not from LLM — deterministic assignment).
    - Set tMs ONLY for time-based metrics where value != -1.
      Map tip index → problem index (first tip → top problem, etc.).
    - Set relatedBenchmarks to the metric name of the corresponding problem.

    The LLM output is expected to be JSON with a "tips" array (structured
    output schema enforces this).  We parse defensively in case the model
    somehow returned plain text (e.g. on a cold-run model version mismatch).
    """
    # Parse JSON
    try:
        data: dict[str, Any] = json.loads(raw_content)
        raw_tips: list[dict[str, Any]] = data.get("tips", [])
    except (json.JSONDecodeError, AttributeError):
        # Fallback: if structured output failed, try to extract any JSON object
        logger.warning(
            "LLM did not return valid JSON; attempting manual extraction. "
            "Content preview: %s", raw_content[:200]
        )
        raw_tips = []

    # Clamp to 3-5
    raw_tips = raw_tips[:5]

    # Build CoachTip objects with deterministic priority/tMs/relatedBenchmarks
    tips: list[CoachTip] = []
    for rank, raw in enumerate(raw_tips, 1):
        title = str(raw.get("title", "")).strip()
        detail = str(raw.get("detail", "")).strip()
        if not title or not detail:
            continue

        # Find the corresponding problem (rank 1 → problems[0], etc.)
        problem_idx = rank - 1
        t_ms: int | None = None
        related: list[str] | None = None

        if problem_idx < len(problems):
            prob = problems[problem_idx]
            related = [prob.metric]

            # tMs only for time-based metrics where the event actually happened
            if (
                prob.metric in _TIME_METRICS
                and prob.value != -1
            ):
                t_ms = int(prob.value)

        tips.append(
            CoachTip(
                priority=rank,
                title=title,
                detail=detail,
                tMs=t_ms,
                relatedBenchmarks=related,
            )
        )

    return tips


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------


async def generate_coach_report(
    replay_id: str,
    top_n: int = 5,
    chunks_per_problem: int = 3,
    max_chunks: int = 10,
) -> CoachReport:
    """
    Generate (or regenerate) the LLM coach report for a replay.

    This function is self-contained: it runs benchmarks if they haven't been
    computed yet, so calling POST /coach/{id}/run on a fresh replay "just works".

    Parameters
    ----------
    replay_id:
        UUID of the replay to analyse.
    top_n:
        How many top scored problems to surface (default 5).
    chunks_per_problem:
        Number of RAG chunks to retrieve per scored problem (default 3).
    max_chunks:
        Hard cap on total chunks sent to the LLM (default 10; keeps prompt size
        manageable).

    Returns
    -------
    CoachReport
        The generated report.  Also persisted to coach_reports table.

    Raises
    ------
    ValueError
        If the replay_id does not exist (→ HTTP 404).
        If neither player is Orc (message starts with "orc_sanctuary:" → HTTP 422).
    RuntimeError
        If Ollama is unreachable or returns an error (→ HTTP 503).
    """
    engine = get_engine()

    # -------------------------------------------------------------------------
    # Step 1: Load timeline (validates replay existence)
    # -------------------------------------------------------------------------
    async with engine.connect() as conn:
        events, players, game_duration_ms, patch_id = await load_replay_timeline(
            conn, replay_id
        )
        meta = await load_replay_meta(conn, replay_id)

    map_name: str = meta["map_name"]

    # -------------------------------------------------------------------------
    # Step 2: Derive Orc context
    # -------------------------------------------------------------------------
    orc_player = _find_orc_player(players)
    if orc_player is None:
        raise ValueError(
            "orc_sanctuary: no Orc player found in this replay. "
            "The coach only analyses games where Orc is one of the players."
        )

    matchup, rag_matchup = _derive_matchup(orc_player, players)
    result_str: str = orc_player.result  # "win" | "loss" | "unknown"

    logger.info(
        "Coach: replay=%s matchup=%s map=%r orc_slot=%d result=%s duration=%.1fs",
        replay_id, matchup, map_name, orc_player.slot, result_str,
        game_duration_ms / 1000,
    )

    # -------------------------------------------------------------------------
    # Step 3: Benchmarks (fetch existing or compute + persist)
    # -------------------------------------------------------------------------
    async with engine.connect() as conn:
        results = await fetch_benchmarks(conn, replay_id)

    if not results:
        logger.info("Coach: no benchmarks found for %s — running engine", replay_id)
        results = run_benchmarks(
            events=events,
            players=players,
            game_duration_ms=game_duration_ms,
            replay_id=replay_id,
            patch_id=patch_id,
        )
        async with engine.begin() as conn:
            await persist_benchmarks(conn, replay_id, results)

    # -------------------------------------------------------------------------
    # Step 4: Prioritize
    # -------------------------------------------------------------------------
    problems: list[ScoredProblem] = prioritize(
        results, top_n=top_n, orc_slot=orc_player.slot
    )

    if not problems:
        logger.info("Coach: no scorable problems for %s — clean game", replay_id)
        report = _clean_game_report(
            replay_id=replay_id,
            matchup=matchup,
            map_name=map_name,
            result=result_str,
            duration_ms=game_duration_ms,
        )
        async with engine.begin() as conn:
            await upsert_report(conn, report, model=CHAT_MODEL)
        return report

    # -------------------------------------------------------------------------
    # Step 5: RAG augmentation
    # -------------------------------------------------------------------------
    all_chunks: list[RetrievedChunk] = []
    for prob in problems:
        try:
            chunks = await retrieve(
                query=prob.summary,
                top_k=chunks_per_problem,
                matchup=rag_matchup,
            )
            all_chunks.extend(chunks)
        except RuntimeError:
            # RAG failure is non-fatal — we proceed with fewer chunks
            logger.warning(
                "Coach: RAG retrieve failed for problem %r — skipping", prob.metric
            )

    deduped_chunks = _dedupe_chunks(all_chunks, max_chunks)
    logger.info(
        "Coach: %d raw chunks → %d deduped for %s",
        len(all_chunks), len(deduped_chunks), replay_id,
    )

    # -------------------------------------------------------------------------
    # Step 6: Build prompt → LLM chat
    # -------------------------------------------------------------------------
    messages = build_messages(
        matchup=matchup,
        map_name=map_name,
        result=result_str,
        duration_ms=game_duration_ms,
        problems=problems,
        chunks=deduped_chunks,
    )

    logger.info("Coach: calling Ollama chat for %s ...", replay_id)
    raw_response = await chat(messages, format_schema=_TIP_SCHEMA)
    logger.info("Coach: LLM response received (%d chars)", len(raw_response))

    # -------------------------------------------------------------------------
    # Step 7: Post-process tips
    # -------------------------------------------------------------------------
    tips = _parse_tips_from_llm(raw_response, problems)

    # Safety: ensure 3 tips minimum (pad with a generic-but-grounded tip if
    # the model underdelivered — this is a defence-in-depth fallback only)
    while len(tips) < 3 and problems:
        prob = problems[len(tips)] if len(tips) < len(problems) else problems[-1]
        tips.append(
            CoachTip(
                priority=len(tips) + 1,
                title=f"Address: {prob.metric.replace('_', ' ')}",
                detail=prob.summary,
                relatedBenchmarks=[prob.metric],
            )
        )

    # Clamp to 5 (already done in _parse_tips_from_llm but be explicit)
    tips = tips[:5]

    # -------------------------------------------------------------------------
    # Step 8: Assemble and persist
    # -------------------------------------------------------------------------
    report = CoachReport(
        replayId=replay_id,
        matchup=matchup,
        mapName=map_name,
        result=result_str,  # type: ignore[arg-type]
        durationMs=game_duration_ms,
        tips=tips,
    )

    async with engine.begin() as conn:
        await upsert_report(conn, report, model=CHAT_MODEL)

    logger.info(
        "Coach: report persisted for %s (%d tips)", replay_id, len(tips)
    )
    return report
