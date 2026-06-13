"""
Pure serialization of a training example into a chat-format training record.

Kept separate from the route so it's unit-testable without a DB. The output
matches the coach's structured-output schema (_TIP_SCHEMA = {"tips":[{title,
detail}]}), so the fine-tuned model learns to emit exactly what production parses.
"""

from __future__ import annotations

from typing import Any


def to_training_record(
    input_messages: list[dict[str, Any]],
    output_tips: list[dict[str, Any]],
) -> dict[str, Any]:
    """
    Build one chat training record: {"messages": [system, user, assistant]}.

    The assistant message is the gold tips serialized to the coach output schema
    (only title + detail — priority is positional; tMs/relatedBenchmarks are
    post-processing, not part of what the model emits).
    """
    gold = {
        "tips": [
            {"title": t["title"], "detail": t["detail"]} for t in output_tips
        ]
    }
    import json

    return {
        "messages": [
            *input_messages,
            {"role": "assistant", "content": json.dumps(gold, ensure_ascii=False)},
        ]
    }
