"""
Benchmark engine — deterministic, zero-LLM analysis of replay timelines.

Computes deviations from reference values for command-derivable metrics only.
Metrics that require game state (floating gold, supply blocks, exact army size)
are explicitly deferred — see models.DEFERRED_METRICS.

T3.1 implementation. Reference corpus grows in T3.2.
"""

from app.benchmarks.engine import run_benchmarks
from app.benchmarks.models import (
    BenchmarkResult,
    DeferredMetricInfo,
    PlayerInfo,
    TimelineEvent,
)

__all__ = [
    "run_benchmarks",
    "BenchmarkResult",
    "DeferredMetricInfo",
    "PlayerInfo",
    "TimelineEvent",
]
