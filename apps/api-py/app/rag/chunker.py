"""
Markdown document chunker for the WC3 knowledge corpus.

Pure, deterministic, DB-free, Ollama-free — safe to unit-test in isolation.

Strategy
--------
1.  Split a markdown document on level-2 and level-3 headings (``##`` / ``###``).
2.  Prepend a breadcrumb to every chunk so a retrieved chunk carries its context:

        "<doc_title> — ## Section — ### Subsection — <body>"

3.  If a section body exceeds MAX_CHUNK_CHARS, further split it on blank-line
    paragraph boundaries (double-newline).  Breadcrumb is repeated on each
    sub-chunk.
4.  Drop chunks whose body (after stripping) is empty or whitespace-only.
5.  Output is always deterministic — same input, same list, same order.

The chunker never touches the DB, Ollama, or the filesystem.  Callers (ingest.py)
are responsible for discovering files and passing text + metadata here.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# Sections longer than this threshold are split further on blank lines.
MAX_CHUNK_CHARS: int = 1200

# Regex that matches a heading line: ## ... or ### ...
# Capture group 1 = the full heading text (without the leading #s and space).
_HEADING_RE = re.compile(r"^(#{2,3})\s+(.+)$", re.MULTILINE)


@dataclass(frozen=True)
class Chunk:
    """One embeddable unit of text derived from a knowledge document."""

    text: str
    """The full text to embed, including the breadcrumb prefix."""

    doc_title: str
    """Title of the source document (mirrors knowledge_docs.title)."""

    heading: str
    """Immediate heading of this chunk (e.g. '## Build Order (Orc)')."""


def chunk_document(doc_title: str, markdown_text: str) -> list[Chunk]:
    """
    Split *markdown_text* into embeddable ``Chunk`` objects.

    Parameters
    ----------
    doc_title:
        The human-readable title of the document (e.g. "OvH Matchup Guide").
        Prepended to every chunk's text as the outermost breadcrumb element.
    markdown_text:
        Raw markdown string for the document.

    Returns
    -------
    list[Chunk]
        Ordered list of non-empty chunks.  Deterministic.
    """
    sections = _split_into_sections(markdown_text)
    chunks: list[Chunk] = []

    for heading, body in sections:
        breadcrumb = _make_breadcrumb(doc_title, heading)
        body_stripped = body.strip()
        if not body_stripped:
            continue

        if len(body_stripped) <= MAX_CHUNK_CHARS:
            chunks.append(
                Chunk(
                    text=f"{breadcrumb}\n\n{body_stripped}",
                    doc_title=doc_title,
                    heading=heading,
                )
            )
        else:
            # Split long body on blank lines (paragraph boundaries)
            paragraphs = _split_on_blank_lines(body_stripped)
            current_parts: list[str] = []
            current_len = 0

            for para in paragraphs:
                para_len = len(para)
                # If adding this paragraph would exceed the limit AND we already have
                # content, flush the current accumulator first.
                if current_parts and current_len + para_len + 2 > MAX_CHUNK_CHARS:
                    sub_body = "\n\n".join(current_parts).strip()
                    if sub_body:
                        chunks.append(Chunk(
                            text=f"{breadcrumb}\n\n{sub_body}",
                            doc_title=doc_title,
                            heading=heading,
                        ))
                    current_parts = [para]
                    current_len = para_len
                else:
                    current_parts.append(para)
                    current_len += para_len + 2  # +2 for the joining "\n\n"

            # Flush remainder
            if current_parts:
                sub_body = "\n\n".join(current_parts).strip()
                if sub_body:
                    chunks.append(Chunk(
                        text=f"{breadcrumb}\n\n{sub_body}",
                        doc_title=doc_title,
                        heading=heading,
                    ))

    return chunks


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _split_into_sections(markdown_text: str) -> list[tuple[str, str]]:
    """
    Split markdown into (heading, body) pairs.

    The text *before* the first heading (if any) is treated as a preamble
    section with heading "## (intro)".

    Returns
    -------
    list of (heading_str, body_str) tuples.
    """
    matches = list(_HEADING_RE.finditer(markdown_text))

    if not matches:
        # No headings at all — treat the whole document as one section
        return [("## (intro)", markdown_text)]

    sections: list[tuple[str, str]] = []

    # Text before the first heading
    preamble = markdown_text[: matches[0].start()].strip()
    if preamble:
        sections.append(("## (intro)", preamble))

    for i, match in enumerate(matches):
        heading_text = f"{match.group(1)} {match.group(2)}"
        body_start = match.end()
        body_end = (
            matches[i + 1].start() if i + 1 < len(matches) else len(markdown_text)
        )
        body = markdown_text[body_start:body_end]
        sections.append((heading_text, body))

    return sections


def _make_breadcrumb(doc_title: str, heading: str) -> str:
    """
    Build the context prefix for a chunk.

    Example:
        doc_title = "OvH Matchup Guide"
        heading   = "## Build Order (Orc)"
        →  "OvH Matchup Guide — ## Build Order (Orc)"
    """
    return f"{doc_title} — {heading}"


def _split_on_blank_lines(text: str) -> list[str]:
    """
    Split text on blank lines (double newline), returning non-empty paragraphs.
    """
    raw = re.split(r"\n\s*\n", text)
    return [p.strip() for p in raw if p.strip()]
