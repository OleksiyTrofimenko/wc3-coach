"""
Pure aggregation helpers for reference observations.

No DB, no I/O — given a list of observed values, return median/p25/p75/n.
Uses linear-interpolation percentiles (the numpy 'linear' method) so results
match the usual statistical convention without a numpy dependency.
"""

from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass(frozen=True)
class Summary:
    """Aggregate of a set of observed values for one (matchup, race, metric)."""

    median: float
    p25: float
    p75: float
    n: int


def percentile(sorted_values: list[float], q: float) -> float:
    """
    Linear-interpolated percentile of an already-sorted list.

    q is in [0, 1]. Matches numpy.percentile(..., method='linear').
    Caller must pass a non-empty, ascending list.
    """
    if not sorted_values:
        raise ValueError("percentile of empty list")
    if len(sorted_values) == 1:
        return sorted_values[0]
    idx = q * (len(sorted_values) - 1)
    lo = math.floor(idx)
    hi = math.ceil(idx)
    if lo == hi:
        return sorted_values[lo]
    frac = idx - lo
    return sorted_values[lo] * (1 - frac) + sorted_values[hi] * frac


def summarize(values: list[float]) -> Summary | None:
    """
    Summarise observed values into median/p25/p75/n.

    Returns None for an empty list (nothing to aggregate → no reference).
    """
    if not values:
        return None
    s = sorted(values)
    return Summary(
        median=percentile(s, 0.5),
        p25=percentile(s, 0.25),
        p75=percentile(s, 0.75),
        n=len(s),
    )
