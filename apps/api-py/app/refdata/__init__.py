"""
Reference-data pipeline — pro-replay timing aggregation.

Turns pro .w3g replays into empirical benchmark references:
    ingest pro replays (api-node) -> extract per-metric observations ->
    aggregate (median/p25/p75/n) -> upsert provenance='pro' reference rows.

Principle: store observations, derive aggregates (see referenceObservations).
"""
