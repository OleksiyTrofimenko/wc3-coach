"""
Unit tests for app.rag.chunker — pure chunking logic.

No DB, no Ollama, no filesystem access.  All tests are synchronous and run
in plain pytest (no asyncio required).

Coverage
--------
- Heading-based splitting (## and ###)
- Breadcrumb prefix on every chunk
- Long section sub-split on blank-line boundaries
- Empty / whitespace-only chunks are dropped
- Preamble (text before first heading) becomes an "(intro)" chunk
- Document with no headings yields a single chunk
- Deterministic: identical input → identical output list
- chunk_document returns Chunk dataclass with correct fields
"""

from __future__ import annotations

from pathlib import Path

import pytest  # noqa: I001

from app.rag.chunker import MAX_CHUNK_CHARS, chunk_document

# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------

_SIMPLE_DOC = """\
# Document Title

## Section One

Content of section one.

## Section Two

Content of section two.
"""

_MULTI_LEVEL_DOC = """\
## Top Level

Some intro text.

### Sub Level A

Sub A content here.

### Sub Level B

Sub B content here.
"""

_PREAMBLE_DOC = """\
This is preamble text before any heading.

More preamble.

## First Heading

Heading content.
"""

_NO_HEADING_DOC = "This document has no headings at all. Just plain text."

_EMPTY_SECTION_DOC = """\
## Non-Empty Section

Real content here.

## Empty Section


## Another Non-Empty

More content.
"""


def _make_long_doc(num_paragraphs: int = 5) -> str:
    """Build a doc with one section containing many paragraphs (> MAX_CHUNK_CHARS)."""
    para = "A " * 120  # ~240 chars per paragraph
    body = "\n\n".join(f"Paragraph {i}: {para}" for i in range(num_paragraphs))
    return f"## Long Section\n\n{body}\n"


# ---------------------------------------------------------------------------
# Tests: basic splitting
# ---------------------------------------------------------------------------

class TestBasicSplitting:
    def test_simple_two_sections(self) -> None:
        chunks = chunk_document("My Doc", _SIMPLE_DOC)
        # Preamble "# Document Title" comes before any ## heading — the h1 is
        # actually the preamble (not a ##/### heading).  So we get an intro +
        # two sections = 3 chunks (intro for preamble if non-empty, or 2 if empty).
        # The preamble here is just "#Document Title\n" which strips to a line
        # starting with #, so it IS non-empty.
        headings = [c.heading for c in chunks]
        assert "## Section One" in headings
        assert "## Section Two" in headings

    def test_multi_level_headings(self) -> None:
        chunks = chunk_document("Guide", _MULTI_LEVEL_DOC)
        headings = [c.heading for c in chunks]
        assert "## Top Level" in headings
        assert "### Sub Level A" in headings
        assert "### Sub Level B" in headings

    def test_no_headings_single_chunk(self) -> None:
        chunks = chunk_document("No Headings Doc", _NO_HEADING_DOC)
        assert len(chunks) == 1
        assert "## (intro)" in chunks[0].heading
        assert _NO_HEADING_DOC in chunks[0].text


# ---------------------------------------------------------------------------
# Tests: breadcrumb prefix
# ---------------------------------------------------------------------------

class TestBreadcrumb:
    def test_breadcrumb_format(self) -> None:
        chunks = chunk_document("OvH Guide", _SIMPLE_DOC)
        for chunk in chunks:
            # Every chunk must start with "OvH Guide — <heading>"
            assert chunk.text.startswith(f"OvH Guide — {chunk.heading}"), (
                f"Chunk does not start with expected breadcrumb: {chunk.text[:80]!r}"
            )

    def test_breadcrumb_contains_title_and_heading(self) -> None:
        doc = "## Build Order\n\nSome build order text here.\n"
        chunks = chunk_document("Test Title", doc)
        assert len(chunks) == 1
        assert "Test Title" in chunks[0].text
        assert "## Build Order" in chunks[0].text

    def test_doc_title_preserved_on_chunk(self) -> None:
        chunks = chunk_document("OvNE Guide", _SIMPLE_DOC)
        for chunk in chunks:
            assert chunk.doc_title == "OvNE Guide"

    def test_heading_field_matches_text_prefix(self) -> None:
        doc = "## Section Alpha\n\nContent.\n"
        chunks = chunk_document("Doc", doc)
        assert chunks[0].heading == "## Section Alpha"
        assert chunks[0].text.startswith("Doc — ## Section Alpha")


# ---------------------------------------------------------------------------
# Tests: empty chunk dropping
# ---------------------------------------------------------------------------

class TestEmptyChunkDropping:
    def test_whitespace_only_section_dropped(self) -> None:
        chunks = chunk_document("Doc", _EMPTY_SECTION_DOC)
        texts = [c.heading for c in chunks]
        # "## Empty Section" has only whitespace body — must be dropped
        assert "## Empty Section" not in texts

    def test_non_empty_sections_retained(self) -> None:
        chunks = chunk_document("Doc", _EMPTY_SECTION_DOC)
        texts = [c.heading for c in chunks]
        assert "## Non-Empty Section" in texts
        assert "## Another Non-Empty" in texts

    def test_entirely_empty_document(self) -> None:
        chunks = chunk_document("Doc", "")
        # Blank document → one "intro" section with empty body → dropped → 0 chunks
        assert chunks == []

    def test_whitespace_only_document(self) -> None:
        chunks = chunk_document("Doc", "   \n\n   \n")
        assert chunks == []


# ---------------------------------------------------------------------------
# Tests: preamble handling
# ---------------------------------------------------------------------------

class TestPreamble:
    def test_preamble_becomes_intro_chunk(self) -> None:
        chunks = chunk_document("Doc", _PREAMBLE_DOC)
        headings = [c.heading for c in chunks]
        assert "## (intro)" in headings

    def test_preamble_content_in_chunk_text(self) -> None:
        chunks = chunk_document("Doc", _PREAMBLE_DOC)
        intro = next(c for c in chunks if c.heading == "## (intro)")
        assert "preamble" in intro.text.lower()

    def test_no_preamble_no_intro_chunk(self) -> None:
        doc = "## First Section\n\nContent starts immediately.\n"
        chunks = chunk_document("Doc", doc)
        headings = [c.heading for c in chunks]
        assert "## (intro)" not in headings


# ---------------------------------------------------------------------------
# Tests: long-section sub-splitting
# ---------------------------------------------------------------------------

class TestLongSectionSplit:
    def test_long_section_produces_multiple_chunks(self) -> None:
        doc = _make_long_doc(num_paragraphs=8)
        chunks = chunk_document("Doc", doc)
        # A section this long must be split into at least 2 chunks
        long_chunks = [c for c in chunks if c.heading == "## Long Section"]
        assert len(long_chunks) >= 2

    def test_each_sub_chunk_has_breadcrumb(self) -> None:
        doc = _make_long_doc(num_paragraphs=8)
        chunks = chunk_document("LongDoc", doc)
        for chunk in chunks:
            assert chunk.text.startswith("LongDoc — ## Long Section"), (
                f"Sub-chunk missing breadcrumb: {chunk.text[:80]!r}"
            )

    def test_sub_chunks_not_exceed_limit_much(self) -> None:
        """Each sub-chunk body should not vastly exceed MAX_CHUNK_CHARS."""
        doc = _make_long_doc(num_paragraphs=10)
        chunks = chunk_document("Doc", doc)
        for chunk in chunks:
            # The breadcrumb + body can slightly exceed the limit when a single
            # paragraph is already close to the limit — allow 2× as ceiling.
            assert len(chunk.text) <= MAX_CHUNK_CHARS * 2, (
                f"Chunk is unexpectedly large: {len(chunk.text)} chars"
            )

    def test_short_section_not_split(self) -> None:
        doc = "## Short Section\n\nThis is a short section.\n"
        chunks = chunk_document("Doc", doc)
        assert len(chunks) == 1


# ---------------------------------------------------------------------------
# Tests: determinism
# ---------------------------------------------------------------------------

class TestDeterminism:
    def test_same_input_same_output(self) -> None:
        a = chunk_document("Guide", _MULTI_LEVEL_DOC)
        b = chunk_document("Guide", _MULTI_LEVEL_DOC)
        assert [c.text for c in a] == [c.text for c in b]

    def test_order_preserved(self) -> None:
        doc = "## Alpha\n\nAAA.\n\n## Beta\n\nBBB.\n\n## Gamma\n\nCCC.\n"
        chunks = chunk_document("Doc", doc)
        headings = [c.heading for c in chunks]
        assert headings == ["## Alpha", "## Beta", "## Gamma"]


# ---------------------------------------------------------------------------
# Tests: real corpus files (read-only, no DB/Ollama)
# ---------------------------------------------------------------------------

class TestRealCorpusFiles:
    """Smoke-test the chunker against the actual corpus files."""

    def _corpus_path(self) -> Path:
        from app.rag.ingest import default_corpus_path
        return default_corpus_path()

    def test_ovh_produces_chunks(self) -> None:
        corpus = self._corpus_path()
        path = corpus / "matchups" / "OvH.md"
        if not path.exists():
            pytest.skip("OvH.md not found — corpus not present")
        text = path.read_text(encoding="utf-8")
        chunks = chunk_document("OvH Matchup Guide", text)
        n = len(chunks)
        assert n >= 3, f"Expected at least 3 chunks from OvH.md, got {n}"

    def test_timings_produces_chunks(self) -> None:
        corpus = self._corpus_path()
        path = corpus / "timings.md"
        if not path.exists():
            pytest.skip("timings.md not found")
        text = path.read_text(encoding="utf-8")
        chunks = chunk_document("Reference Timings", text)
        assert len(chunks) >= 1

    def test_all_corpus_chunks_have_breadcrumb(self) -> None:
        from app.rag.ingest import _CORPUS_FILES
        corpus = self._corpus_path()
        for spec in _CORPUS_FILES:
            path = corpus / str(spec["rel_path"])
            if not path.exists():
                continue
            text = path.read_text(encoding="utf-8")
            title = str(spec["title"])
            chunks = chunk_document(title, text)
            for chunk in chunks:
                assert chunk.text.startswith(title), (
                    f"Chunk from {spec['rel_path']!r} missing title breadcrumb: "
                    f"{chunk.text[:80]!r}"
                )
