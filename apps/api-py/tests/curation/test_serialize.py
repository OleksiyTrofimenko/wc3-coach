"""Unit tests for training-record serialization (pure, no DB)."""

from __future__ import annotations

import json

from app.curation.serialize import to_training_record


def _messages() -> list[dict[str, str]]:
    return [
        {"role": "system", "content": "You are a coach."},
        {"role": "user", "content": "CONTEXT: OvNE\nFACTS: ..."},
    ]


def test_record_appends_assistant_with_gold_tips() -> None:
    rec = to_training_record(
        _messages(),
        [
            {"priority": 1, "title": "Expand", "detail": "Take a base.",
             "relatedBenchmarks": ["expansion_timing"]},
            {"priority": 2, "title": "Hero", "detail": "Level faster."},
        ],
    )
    roles = [m["role"] for m in rec["messages"]]
    assert roles == ["system", "user", "assistant"]

    gold = json.loads(rec["messages"][-1]["content"])
    assert "tips" in gold
    assert len(gold["tips"]) == 2
    # Only title + detail in the emitted output (matches _TIP_SCHEMA)
    assert gold["tips"][0] == {"title": "Expand", "detail": "Take a base."}
    assert set(gold["tips"][1].keys()) == {"title", "detail"}


def test_record_preserves_input_messages() -> None:
    msgs = _messages()
    rec = to_training_record(msgs, [{"title": "T", "detail": "D"}])
    assert rec["messages"][0] == msgs[0]
    assert rec["messages"][1] == msgs[1]


def test_empty_tips_yields_empty_tip_array() -> None:
    rec = to_training_record(_messages(), [])
    gold = json.loads(rec["messages"][-1]["content"])
    assert gold == {"tips": []}
