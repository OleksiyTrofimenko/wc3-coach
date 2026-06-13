"""
CLI: aggregate observations from reference replays into pro benchmark references.

Run with:
    python -m app.refdata.aggregate_pro

Requires:
    DATABASE_URL  — Postgres (DB :5433)

For every replay flagged is_reference (status=done): load its timeline, extract
metric observations, and persist them (idempotent). Then aggregate all
observations for the current patch into provenance='pro' reference rows
(median/p25/p75/n), preserving any 'user' overrides.

Assumes the pro replays are already ingested + flagged (see ingest_pro.py).
"""

from __future__ import annotations

import asyncio
import logging
import sys

from app.benchmarks.db import get_engine, load_replay_timeline
from app.benchmarks.references_db import resolve_current_patch_id
from app.refdata.db import (
    list_reference_replay_ids,
    recompute_pro_references,
    upsert_observations,
)
from app.refdata.extract import observations_for

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)


async def aggregate_pro() -> tuple[int, int, int]:
    """
    Returns (replays_processed, observations_written, references_written).
    """
    engine = get_engine()
    async with engine.begin() as conn:
        patch_id = await resolve_current_patch_id(conn)
        if patch_id is None:
            raise RuntimeError(
                "Current patch (2.00/6117) not found in patch_versions — "
                "run the patch/ontology seed first."
            )

        replay_ids = await list_reference_replay_ids(conn)
        if not replay_ids:
            logger.warning(
                "No replays flagged is_reference. Ingest pro replays first: "
                "python -m app.refdata.ingest_pro <folder>"
            )

        total_obs = 0
        for rid in replay_ids:
            events, players, dur, rpatch = await load_replay_timeline(conn, rid)
            obs = observations_for(events, players, dur)
            n = await upsert_observations(conn, rid, rpatch, obs)
            total_obs += n
            logger.info("replay %s -> %d observations", rid[:8], n)

        written = await recompute_pro_references(conn, patch_id)

    for matchup, race, metric, n in written:
        logger.info("pro ref  %-6s %-9s %-22s n=%d", matchup, race, metric, n)

    return len(replay_ids), total_obs, len(written)


def main() -> None:
    print("WC3 Coach — pro-replay reference aggregation")
    print("=" * 44)
    try:
        replays, obs, refs = asyncio.run(aggregate_pro())
    except Exception as exc:  # noqa: BLE001 — CLI: surface failures cleanly
        print(f"\nERROR: {exc}", file=sys.stderr)
        sys.exit(1)

    print(
        f"\nDone.  replays={replays}  observations={obs}  pro references={refs}"
    )


if __name__ == "__main__":
    main()
