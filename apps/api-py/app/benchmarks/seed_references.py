"""
CLI seed for the DB-backed benchmark references (T-step #1).

Run with:
    python -m app.benchmarks.seed_references

Requires:
    DATABASE_URL  — e.g. postgresql://wc3coach:wc3coach@localhost:5433/wc3coach

Loads every entry of the in-code seed table (references._SEED_REFERENCE_TABLE)
into the benchmark_references table, tagged provenance='community' and pinned to
the confirmed patch 2.00/6117 (NULL baseline if that patch row is absent).

Idempotent: re-running upserts on the (matchup, race, metric, patch) unique key.
DO UPDATE only refreshes rows that are still provenance='community', so manual
admin edits (provenance 'user') and pro-aggregated rows (provenance 'pro') are
preserved across a re-seed.
"""

from __future__ import annotations

import asyncio
import logging
import sys

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.benchmarks.references import _SEED_REFERENCE_TABLE
from app.benchmarks.references_db import (
    _BENCHMARK_REFERENCES,
    CURRENT_PATCH_BUILD,
    CURRENT_PATCH_VERSION,
    get_engine,
    resolve_current_patch_id,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)


async def seed_references() -> int:
    """Upsert the seed reference table into the DB. Returns the row count."""
    engine = get_engine()
    async with engine.begin() as conn:
        patch_id = await resolve_current_patch_id(conn)
        if patch_id is None:
            logger.warning(
                "patch_versions row for %s/%s not found — seeding references with "
                "NULL patch_id (baseline). Run the ontology/patch seed first to pin "
                "them to patch 2.0.",
                CURRENT_PATCH_VERSION,
                CURRENT_PATCH_BUILD,
            )

        for (matchup, race_id, metric), entry in _SEED_REFERENCE_TABLE.items():
            stmt = pg_insert(_BENCHMARK_REFERENCES).values(
                matchup=matchup,
                race_id=race_id,
                metric=metric,
                expected=entry.expected,
                window_ms=entry.window_ms,
                notes=entry.notes,
                provenance="community",
                confidence=None,
                patch_id=patch_id,
            )
            stmt = stmt.on_conflict_do_update(
                constraint="benchmark_references_key_patch_uq",
                set_={
                    "expected": stmt.excluded.expected,
                    "window_ms": stmt.excluded.window_ms,
                    "notes": stmt.excluded.notes,
                    "updated_at": sa.func.now(),
                },
                # Only refresh community rows; preserve user/pro overrides.
                where=_BENCHMARK_REFERENCES.c.provenance == "community",
            )
            await conn.execute(stmt)

    return len(_SEED_REFERENCE_TABLE)


def main() -> None:
    print("WC3 Coach — benchmark references seed")
    print("=" * 40)
    try:
        count = asyncio.run(seed_references())
    except Exception as exc:  # noqa: BLE001 — CLI: surface any failure cleanly
        print(f"\nERROR: {exc}", file=sys.stderr)
        sys.exit(1)

    print(f"\nDone.  seeded/refreshed {count} reference rows (provenance=community)")


if __name__ == "__main__":
    main()
