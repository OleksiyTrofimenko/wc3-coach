"""Unit tests for pure aggregation helpers (no DB)."""

from __future__ import annotations

import pytest

from app.refdata.aggregate import percentile, summarize


def test_summarize_empty_returns_none() -> None:
    assert summarize([]) is None


def test_summarize_single_value() -> None:
    s = summarize([62_000.0])
    assert s is not None
    assert s.median == 62_000.0
    assert s.p25 == 62_000.0
    assert s.p75 == 62_000.0
    assert s.n == 1


def test_summarize_odd_count_median_is_middle() -> None:
    s = summarize([10.0, 30.0, 20.0])  # sorted: 10,20,30
    assert s is not None
    assert s.median == 20.0
    assert s.n == 3


def test_summarize_even_count_median_interpolates() -> None:
    s = summarize([10.0, 20.0, 30.0, 40.0])
    assert s is not None
    assert s.median == 25.0  # midpoint of 20 and 30


def test_percentile_linear_interpolation() -> None:
    vals = [100.0, 200.0, 300.0, 400.0, 500.0]
    assert percentile(vals, 0.0) == 100.0
    assert percentile(vals, 1.0) == 500.0
    assert percentile(vals, 0.5) == 300.0
    # p25 of 5 evenly-spaced values: idx = 0.25*4 = 1.0 -> exactly 200
    assert percentile(vals, 0.25) == 200.0
    # p75: idx = 0.75*4 = 3.0 -> exactly 400
    assert percentile(vals, 0.75) == 400.0


def test_percentile_interpolates_between_points() -> None:
    vals = [0.0, 100.0]
    # idx = 0.25*1 = 0.25 -> 0*0.75 + 100*0.25 = 25
    assert percentile(vals, 0.25) == 25.0


def test_percentile_empty_raises() -> None:
    with pytest.raises(ValueError):
        percentile([], 0.5)
