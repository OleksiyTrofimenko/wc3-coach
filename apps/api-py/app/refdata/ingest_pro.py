"""
CLI: ingest pro .w3g replays from a folder into the DB as reference data.

Run with:
    python -m app.refdata.ingest_pro [folder]      # default: game-data/replays/pro

Requires:
    DATABASE_URL   — Postgres (DB :5433)
    API_NODE_URL   — api-node base URL (default http://localhost:8787)
    api-node server + BullMQ worker running (they own .w3g parsing).

For each .w3g in the folder: upload via api-node POST /replays (sha256 dedup makes
re-runs safe), poll GET /replays/:id until parsed, then flag the replay
is_reference=true so it drives aggregation and is hidden from the personal coach
history. Run `python -m app.refdata.aggregate_pro` afterwards to build the
provenance='pro' references.
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys
from pathlib import Path

import httpx

from app.benchmarks.db import get_engine
from app.refdata.db import mark_reference

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)

_DEFAULT_FOLDER = "game-data/replays/pro"
_API_NODE = os.environ.get("API_NODE_URL", "http://localhost:8787")
_POLL_INTERVAL_S = 1.5
_POLL_MAX_S = 120


async def _upload_and_wait(client: httpx.AsyncClient, path: Path) -> str | None:
    """Upload one .w3g, poll until parsed. Returns replay_id, or None on failure."""
    data = path.read_bytes()
    resp = await client.post(
        f"{_API_NODE}/replays",
        files={"file": (path.name, data, "application/octet-stream")},
    )
    if resp.status_code not in (200, 202):
        logger.error("upload %s failed: %s %s", path.name, resp.status_code, resp.text)
        return None
    replay_id: str = str(resp.json()["replayId"])

    waited = 0.0
    while waited < _POLL_MAX_S:
        r = await client.get(f"{_API_NODE}/replays/{replay_id}")
        status = r.json().get("status")
        if status == "done":
            return replay_id
        if status == "error":
            logger.error("%s parse error for %s", path.name, replay_id)
            return None
        await asyncio.sleep(_POLL_INTERVAL_S)
        waited += _POLL_INTERVAL_S

    logger.error("%s timed out waiting for parse (%ss)", path.name, _POLL_MAX_S)
    return None


async def ingest_folder(folder: str) -> tuple[int, int]:
    """Upload + flag every .w3g in `folder`. Returns (found, flagged)."""
    base = Path(folder)
    if not base.is_dir():
        raise RuntimeError(f"folder not found: {folder}")

    files = sorted(base.glob("*.w3g"))
    if not files:
        logger.warning("no .w3g files in %s", folder)
        return 0, 0

    engine = get_engine()
    flagged = 0
    async with httpx.AsyncClient(timeout=60.0) as client:
        for path in files:
            replay_id = await _upload_and_wait(client, path)
            if replay_id is None:
                continue
            async with engine.begin() as conn:
                await mark_reference(conn, replay_id)
            flagged += 1
            logger.info("flagged %s as reference (%s)", path.name, replay_id[:8])

    return len(files), flagged


def main() -> None:
    folder = sys.argv[1] if len(sys.argv) > 1 else _DEFAULT_FOLDER
    print("WC3 Coach — pro-replay ingest")
    print("=" * 44)
    print(f"folder={folder}  api-node={_API_NODE}")
    try:
        found, flagged = asyncio.run(ingest_folder(folder))
    except Exception as exc:  # noqa: BLE001 — CLI: surface failures cleanly
        print(f"\nERROR: {exc}", file=sys.stderr)
        sys.exit(1)

    print(f"\nDone.  found={found}  flagged={flagged}")
    if flagged:
        print("Next: python -m app.refdata.aggregate_pro")


if __name__ == "__main__":
    main()
