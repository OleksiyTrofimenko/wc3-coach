"""
Admin CRUD endpoints for benchmark reference data.

These power the admin panel that lets the user curate reference timings live
(no redeploy) — the root-cause fix for bad coaching from stale hardcoded values.
A re-run of POST /benchmarks/{id}/run picks up edited references immediately.

Endpoints (all under /admin):
    GET    /admin/references            list (optional ?matchup= &race= &metric=)
    POST   /admin/references            create (409 on duplicate key)
    PUT    /admin/references/{id}        update editable fields
    DELETE /admin/references/{id}        delete

Principle #1: this is post-game reference DATA only — no live-game anything.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy.exc import IntegrityError

from app.admin.models import (
    BenchmarkReference,
    ReferenceCreate,
    ReferenceUpdate,
)
from app.benchmarks.references_db import (
    create_reference,
    delete_reference,
    get_engine,
    list_references,
    resolve_current_patch_id,
    update_reference,
)

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get(
    "/references",
    response_model=list[BenchmarkReference],
    summary="List benchmark reference rows",
    description=(
        "Returns all curatable benchmark reference rows, ordered by "
        "matchup → race → metric. Optional query filters narrow the list."
    ),
)
async def get_references(
    matchup: str | None = Query(default=None),
    race: str | None = Query(default=None),
    metric: str | None = Query(default=None),
) -> list[BenchmarkReference]:
    engine = get_engine()
    async with engine.connect() as conn:
        rows = await list_references(
            conn, matchup=matchup, race_id=race, metric=metric
        )
    return [BenchmarkReference.model_validate(r) for r in rows]


@router.post(
    "/references",
    response_model=BenchmarkReference,
    status_code=201,
    summary="Create a benchmark reference row",
    description=(
        "Creates a new reference for a (matchup, race, metric, patch) key. "
        "Returns 409 if a row with that key already exists (edit it instead). "
        "patchId null = patch-agnostic baseline matched by every replay."
    ),
)
async def post_reference(body: ReferenceCreate) -> BenchmarkReference:
    engine = get_engine()
    try:
        async with engine.begin() as conn:
            # Default a new row to the current patch (like the seeds) so it
            # actually takes effect for current replays and collides (409) with
            # an existing key, instead of creating a shadowed NULL-baseline row.
            patch_id = body.patch_id
            if patch_id is None:
                patch_id = await resolve_current_patch_id(conn)
            row = await create_reference(
                conn,
                matchup=body.matchup,
                race_id=body.race_id,
                metric=body.metric,
                expected=body.expected,
                window_ms=body.window_ms,
                notes=body.notes,
                provenance=body.provenance,
                confidence=body.confidence,
                patch_id=patch_id,
            )
    except IntegrityError as exc:
        raise HTTPException(
            status_code=409,
            detail=(
                f"A reference for ({body.matchup}, {body.race_id}, "
                f"{body.metric}) at this patch already exists. Edit it instead."
            ),
        ) from exc
    return BenchmarkReference.model_validate(row)


@router.put(
    "/references/{ref_id}",
    response_model=BenchmarkReference,
    summary="Update a benchmark reference row",
    description=(
        "Updates the editable fields (expected, windowMs, notes, provenance, "
        "confidence) and bumps updatedAt. Identity fields (matchup/race/metric/"
        "patch) are immutable — delete + recreate to change them. 404 if absent."
    ),
)
async def put_reference(ref_id: str, body: ReferenceUpdate) -> BenchmarkReference:
    engine = get_engine()
    async with engine.begin() as conn:
        row = await update_reference(
            conn,
            ref_id,
            expected=body.expected,
            window_ms=body.window_ms,
            notes=body.notes,
            provenance=body.provenance,
            confidence=body.confidence,
        )
    if row is None:
        raise HTTPException(status_code=404, detail=f"reference {ref_id!r} not found")
    return BenchmarkReference.model_validate(row)


@router.delete(
    "/references/{ref_id}",
    status_code=204,
    summary="Delete a benchmark reference row",
    description="Deletes the reference row. 404 if it does not exist.",
)
async def remove_reference(ref_id: str) -> None:
    engine = get_engine()
    async with engine.begin() as conn:
        deleted = await delete_reference(conn, ref_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"reference {ref_id!r} not found")
