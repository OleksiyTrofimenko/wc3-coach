"""
Unit tests for the pure (no DB / no Ollama) logic in the RAG retrieval layer.

Coverage
--------
- score = 1 - distance transform is arithmetically correct.
- RetrievedChunk pydantic model accepts both alias (camelCase) and field name.
- RetrievedChunk score and distance fields are preserved exactly.
- Matchup-agnostic chunk (matchup=None) is always included — verified via the
  SQL predicate logic as expressed in Python.
- Ordering invariant: a list sorted by distance ascending == sorted by score
  descending.

No DB or Ollama is touched.  All tests are synchronous.
"""

from __future__ import annotations

import pytest

from app.rag.models import RetrievedChunk


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _chunk(
    chunk_text: str = "Some chunk text.",
    doc_title: str = "Test Doc",
    matchup: str | None = None,
    distance: float = 0.1,
) -> RetrievedChunk:
    return RetrievedChunk(
        chunkText=chunk_text,
        docTitle=doc_title,
        matchup=matchup,
        distance=distance,
        score=1.0 - distance,
    )


# ---------------------------------------------------------------------------
# RetrievedChunk model
# ---------------------------------------------------------------------------


class TestRetrievedChunk:
    def test_score_equals_one_minus_distance(self) -> None:
        distance = 0.25
        chunk = _chunk(distance=distance)
        assert chunk.score == pytest.approx(1.0 - distance)

    def test_score_one_for_identical_vectors(self) -> None:
        # Perfect match: distance == 0 → score == 1.0
        chunk = _chunk(distance=0.0)
        assert chunk.score == pytest.approx(1.0)

    def test_score_zero_for_orthogonal_vectors(self) -> None:
        # Orthogonal vectors: cosine distance == 1 → score == 0.0
        chunk = _chunk(distance=1.0)
        assert chunk.score == pytest.approx(0.0)

    def test_matchup_none_preserved(self) -> None:
        chunk = _chunk(matchup=None)
        assert chunk.matchup is None

    def test_matchup_string_preserved(self) -> None:
        chunk = _chunk(matchup="OvH")
        assert chunk.matchup == "OvH"

    def test_camel_alias_serialisation(self) -> None:
        chunk = _chunk(chunk_text="hello", doc_title="My Guide", matchup="OvNE", distance=0.3)
        data = chunk.model_dump(by_alias=True)
        assert data["chunkText"] == "hello"
        assert data["docTitle"] == "My Guide"
        assert data["matchup"] == "OvNE"
        assert data["score"] == pytest.approx(0.7)
        assert data["distance"] == pytest.approx(0.3)

    def test_snake_case_field_names_accessible(self) -> None:
        chunk = _chunk(chunk_text="hi", doc_title="Guide", distance=0.4)
        assert chunk.chunk_text == "hi"
        assert chunk.doc_title == "Guide"
        assert chunk.distance == pytest.approx(0.4)


# ---------------------------------------------------------------------------
# Score / distance ordering invariant
# ---------------------------------------------------------------------------


class TestOrderingInvariant:
    def test_sort_by_distance_asc_equals_sort_by_score_desc(self) -> None:
        """
        pgvector returns rows ordered by distance ASC (smallest = most similar).
        Verify that sorting by distance ascending is equivalent to sorting by
        score descending — so a caller can rely on either ordering key.
        """
        distances = [0.05, 0.15, 0.40, 0.72, 0.99]
        chunks = [_chunk(distance=d) for d in distances]

        by_distance = sorted(chunks, key=lambda c: c.distance)
        by_score = sorted(chunks, key=lambda c: c.score, reverse=True)

        assert [c.distance for c in by_distance] == [c.distance for c in by_score]

    def test_higher_score_means_lower_distance(self) -> None:
        a = _chunk(distance=0.1)
        b = _chunk(distance=0.8)
        assert a.score > b.score
        assert a.distance < b.distance


# ---------------------------------------------------------------------------
# Matchup filter predicate (pure Python mirror of the SQL OR condition)
# ---------------------------------------------------------------------------


def _passes_matchup_filter(chunk_matchup: str | None, filter_matchup: str | None) -> bool:
    """
    Pure Python equivalent of the SQL WHERE clause in search_chunks:

        WHERE doc.matchup = :matchup OR doc.matchup IS NULL

    When filter_matchup is None the filter is disabled (all chunks pass).
    """
    if filter_matchup is None:
        return True  # no filter — everything passes
    return chunk_matchup == filter_matchup or chunk_matchup is None


class TestMatchupFilterPredicate:
    def test_no_filter_passes_all(self) -> None:
        assert _passes_matchup_filter("OvH", None) is True
        assert _passes_matchup_filter("OvNE", None) is True
        assert _passes_matchup_filter(None, None) is True

    def test_exact_matchup_passes(self) -> None:
        assert _passes_matchup_filter("OvH", "OvH") is True

    def test_null_matchup_always_passes_when_filter_set(self) -> None:
        # General reference docs (matchup IS NULL) always survive the filter
        assert _passes_matchup_filter(None, "OvH") is True
        assert _passes_matchup_filter(None, "OvNE") is True

    def test_wrong_matchup_rejected(self) -> None:
        assert _passes_matchup_filter("OvNE", "OvH") is False
        assert _passes_matchup_filter("OvUD", "OvH") is False
        assert _passes_matchup_filter("OvH", "OvUD") is False

    def test_ovh_filter_rejects_ovne_and_ovud(self) -> None:
        for excluded in ("OvNE", "OvUD"):
            assert _passes_matchup_filter(excluded, "OvH") is False

    def test_general_ref_docs_survive_any_matchup_filter(self) -> None:
        for matchup_filter in ("OvH", "OvNE", "OvUD"):
            assert _passes_matchup_filter(None, matchup_filter) is True
