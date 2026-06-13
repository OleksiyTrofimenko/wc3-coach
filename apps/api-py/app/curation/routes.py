"""
Curation API — capture and export (prompt → ideal tips) training examples.

    POST /curation/{replay_id}/draft   assemble the coach prompt for a replay and
                                       seed a draft example from the deterministic
                                       facts (no LLM output — the human writes the
                                       ideal tips). Idempotent: re-draft refreshes
                                       the captured prompt, never the gold tips.
    GET  /curation/{replay_id}          fetch the example for a replay
    PUT  /curation/{replay_id}          save edited gold tips + status (approve)
    GET  /curation                      list all examples (dataset overview)
    GET  /curation/export.jsonl         approved examples as chat JSONL (for QLoRA)

Per Principle #4 we teach style/grounding, not facts: the gold output is seeded
from the deterministic ScoredProblem summaries and human-edited, NEVER from the
LLM's own output.
"""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from app.coach.service import assemble_coach
from app.curation.db import (
    get_engine,
    get_example,
    list_approved,
    list_examples,
    update_example,
    upsert_draft,
)
from app.curation.models import (
    ExampleSummary,
    ExampleUpdate,
    TrainingExample,
)
from app.curation.serialize import to_training_record

router = APIRouter(prefix="/curation", tags=["curation"])


def _seed_tips_from_problems(problems: list[Any]) -> list[dict[str, Any]]:
    """Seed gold tips from the deterministic scored-problem summaries."""
    seeds: list[dict[str, Any]] = []
    for i, p in enumerate(problems[:5], 1):
        seeds.append(
            {
                "priority": i,
                "title": p.metric.replace("_", " ").title(),
                "detail": p.summary,
                "relatedBenchmarks": [p.metric],
            }
        )
    return seeds


@router.get("", response_model=list[ExampleSummary], summary="List training examples")
async def list_all() -> list[ExampleSummary]:
    engine = get_engine()
    async with engine.connect() as conn:
        rows = await list_examples(conn)
    return [ExampleSummary.model_validate(r) for r in rows]


@router.get(
    "/export.jsonl",
    summary="Export approved examples as chat JSONL (for QLoRA fine-tuning)",
    description=(
        "Streams one JSON object per line: {\"messages\": [system, user, "
        "assistant]} where assistant content is the gold tips serialized to the "
        "coach output schema ({\"tips\": [{title, detail}]}). Ready for "
        "Unsloth/Axolotl instruct fine-tuning of qwen2.5."
    ),
)
async def export_jsonl() -> Response:
    engine = get_engine()
    async with engine.connect() as conn:
        examples = await list_approved(conn)

    lines: list[str] = []
    for ex in examples:
        record = to_training_record(ex["inputMessages"], ex["outputTips"])
        lines.append(json.dumps(record, ensure_ascii=False))

    body = "\n".join(lines) + ("\n" if lines else "")
    return Response(
        content=body,
        media_type="application/x-ndjson",
        headers={
            "Content-Disposition": 'attachment; filename="wc3-coach-trainset.jsonl"'
        },
    )


@router.post(
    "/{replay_id}/draft",
    response_model=TrainingExample,
    summary="Draft a training example from a replay's facts",
)
async def draft(replay_id: str) -> TrainingExample:
    try:
        assembly = await assemble_coach(replay_id)
    except ValueError as exc:
        msg = str(exc)
        if msg.startswith("orc_sanctuary:"):
            raise HTTPException(status_code=422, detail=msg) from exc
        raise HTTPException(status_code=404, detail=msg) from exc
    except RuntimeError as exc:  # Ollama/RAG down
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    seed = _seed_tips_from_problems(assembly.problems)
    engine = get_engine()
    async with engine.begin() as conn:
        row = await upsert_draft(
            conn,
            replay_id=replay_id,
            matchup=assembly.matchup,
            map_name=assembly.map_name,
            result=assembly.result,
            input_messages=assembly.messages,
            output_tips=seed,
        )
    return TrainingExample.model_validate(row)


@router.get(
    "/{replay_id}",
    response_model=TrainingExample,
    summary="Fetch the training example for a replay",
)
async def get_one(replay_id: str) -> TrainingExample:
    engine = get_engine()
    async with engine.connect() as conn:
        row = await get_example(conn, replay_id)
    if row is None:
        raise HTTPException(
            status_code=404,
            detail="no example yet — POST /curation/{id}/draft to create one",
        )
    return TrainingExample.model_validate(row)


@router.put(
    "/{replay_id}",
    response_model=TrainingExample,
    summary="Save edited gold tips + status for a replay's example",
)
async def save(replay_id: str, body: ExampleUpdate) -> TrainingExample:
    tips = [
        t.model_dump(by_alias=True, exclude_none=True) for t in body.output_tips
    ]
    engine = get_engine()
    async with engine.begin() as conn:
        row = await update_example(
            conn,
            replay_id,
            output_tips=tips,
            status=body.status,
            notes=body.notes,
        )
    if row is None:
        raise HTTPException(
            status_code=404,
            detail="no example yet — draft one before saving",
        )
    return TrainingExample.model_validate(row)
