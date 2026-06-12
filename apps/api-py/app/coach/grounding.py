"""
Post-generation grounding validator for LLM coach tips (T5.4).

PURE module — no DB, no Ollama, no side effects.
All functions are deterministic and fully unit-testable with stdlib only.

Problem
-------
qwen2.5:14b sometimes fabricates numbers in tip prose even though the correct
values are already in the prompt.  The two live failure modes observed were:

  1. Fabricated clock time: tip said "expansion at 7:15" when the FACT was
     "No expansion taken (expected by 5:30)".  The time "7:15" appears nowhere
     in any source text.

  2. Restated magnitude: tip said "~6 minutes late" when the FACT was "73s late"
     and the real delta was ~1:45.

This module detects those fabrications deterministically — no LLM needed — so
the service layer can replace a bad tip with its grounded fallback (the
scored-problem summary) before persisting the report.

Validator design
----------------
We check four high-signal numeric-expression categories.  The rule is:

  For each numeric expression found in tip_text, the *numeric core* of that
  expression must appear in normalize_for_match(allowed_text).

Categories and their numeric cores:
  (a) Clock times  M:SS  pattern r"\\b\\d{1,2}:\\d{2}\\b"
        Core = the full "M:SS" string (e.g. "7:15").
        Rationale: the only way the model can know a specific game time is if
        we told it.  The full token prevents "7" from matching "7 workers".
        This is the PRIMARY failure mode and the most reliable check.

  (b) Duration phrases  r"\\b\\d+\\s*(?:minutes?|mins?|seconds?|secs?|s)\\b"
        Core = the digit string only (e.g. "73" from "73s", "6" from "6 minutes").
        Tradeoff: a bare digit core allows false NEGATIVES when the allowed text
        happens to contain the same digit in a different context (e.g. "6 food",
        "6 workers").  We accept this to keep false POSITIVES near zero — it is
        better to let a slightly wrong duration slip through than to block a
        correct tip because "6" appeared as a level or count number.
        In practice the strong guarantee comes from category (a): time-based
        problems always include a M:SS value in the summary, so if the model
        invents a *time* it will be caught by (a); duration phrases in isolation
        are rare in tips.

  (c) Percentages  r"\\b\\d+\\s*%"
        Core = digit string (e.g. "60" from "60%").
        Same tradeoff as (b): digit-presence rule to minimise false positives.

  (d) Resource figures  r"\\b\\d[\\d,]*\\s*(?:gold(?:\\/s| per second)?|lumber|food)\\b"
        Core = digit string with commas stripped (e.g. "1800" from "1,800 gold").
        Covers the most common WC3 economy numbers.

Bare standalone integers (e.g. "level 3", "tier 2", "3 abilities") are NOT
checked — far too many false positives because every summary contains small
integers in different semantic contexts.

Usage
-----
    from app.coach.grounding import is_grounded, find_ungrounded_numbers

    # allowed_text = joined summaries + chunk texts (built by the service)
    if not is_grounded(tip.detail, allowed_text):
        # replace tip.detail with grounded fallback
        ...
"""

from __future__ import annotations

import re

# ---------------------------------------------------------------------------
# Normalisation
# ---------------------------------------------------------------------------

# Collapse "70 %" (space before percent) → "70%"
_SPACE_PERCENT_RE = re.compile(r"(\d)\s+%")
# Strip thousands separators inside numbers "1,800" → "1800"
_THOUSANDS_SEP_RE = re.compile(r"(\d),(\d{3})")
# A number joined to a word by a hyphen: "30-second" → "30 second". Only when a
# LETTER follows the hyphen, so numeric ranges ("4:30-5:00", "10-20") are kept.
_NUM_HYPHEN_WORD_RE = re.compile(r"(\d)\s*-\s*(?=[a-z])")


def normalize_for_match(text: str) -> str:
    """
    Return a canonical form of *text* for substring matching.

    Transformations applied (order matters):
    - lowercase
    - strip thousands separators: "1,800" → "1800"
    - collapse space-before-percent: "70 %" → "70%"
    - normalize a hyphen between a number and a word to a space:
      "30-second" → "30 second" so the duration regex sees the digits (the LLM
      writes "30-second block"; without this it bypassed grounding entirely).

    The result is used only for substring containment tests in
    find_ungrounded_numbers; it is NOT fed back to the LLM.
    """
    t = text.lower()
    # Repeat the thousands-sep strip because "1,234,567" needs two passes
    prev = None
    while t != prev:
        prev = t
        t = _THOUSANDS_SEP_RE.sub(r"\1\2", t)
    t = _SPACE_PERCENT_RE.sub(r"\1%", t)
    # "30-second"/"60-food" → "30 second"/"60 food" (hyphen only before a letter,
    # so number ranges like "4:30-5:00" and "10-20" are untouched).
    t = _NUM_HYPHEN_WORD_RE.sub(r"\1 ", t)
    return t


# ---------------------------------------------------------------------------
# Category regexes
# ---------------------------------------------------------------------------

# (a) Clock times: "7:15", "11:20", "5:30"
_CLOCK_TIME_RE = re.compile(r"\b(\d{1,2}:\d{2})\b")

# (b) Duration phrases: "73s", "6 minutes", "30 seconds", "2 mins"
_DURATION_RE = re.compile(
    r"\b(\d+)\s*(?:minutes?|mins?|seconds?|secs?|s)\b",
    re.IGNORECASE,
)

# (c) Percentages: "60%", "70 %"  (space variant normalised before matching)
# We match in the normalised form, so always "N%"
_PERCENT_RE = re.compile(r"\b(\d+)%")

# (d) Resource figures: "1,800 gold", "20 gold/s", "50 lumber", "80 food"
_RESOURCE_RE = re.compile(
    r"\b(\d[\d,]*)\s*(?:gold(?:\/s| per second)?|lumber|food)\b",
    re.IGNORECASE,
)


def _clock_token_grounded(token: str, norm_allowed: str) -> bool:
    """
    True if *token* (an "M:SS" clock time) appears in *norm_allowed* as a
    standalone time, i.e. NOT immediately preceded or followed by a digit or
    colon. This prevents a fabricated "2:00" from matching inside "12:00", or
    "1:02" from matching inside "11:02" — the substring false-negative that let
    hallucinated times slip past the guard.
    """
    pattern = r"(?<![\d:])" + re.escape(token) + r"(?![\d:])"
    return re.search(pattern, norm_allowed) is not None


def find_ungrounded_numbers(tip_text: str, allowed_text: str) -> list[str]:
    """
    Return the list of numeric expressions in *tip_text* that do NOT appear
    in *allowed_text* under the category rules.

    Each returned string is the matched surface form from *tip_text* (before
    normalisation), e.g. "7:15" or "6 minutes".

    Parameters
    ----------
    tip_text:
        The LLM-generated tip title or detail to validate.
    allowed_text:
        The concatenation of all grounded source text the model was given:
        scored-problem summaries + retrieved knowledge chunk texts.

    Returns
    -------
    List of offending expressions (empty → tip is grounded).
    """
    norm_allowed = normalize_for_match(allowed_text)
    norm_tip = normalize_for_match(tip_text)

    offenders: list[str] = []

    # ---- (a) Clock times ----
    # Core = the full "M:SS" token; must appear as a STANDALONE time in allowed
    # text — not as a substring of a longer time (so a fabricated "2:00" is NOT
    # considered grounded just because "12:00" appears in the allowed text).
    for m in _CLOCK_TIME_RE.finditer(norm_tip):
        token = m.group(1)  # e.g. "7:15" already lowercased / normalised
        if not _clock_token_grounded(token, norm_allowed):
            offenders.append(token)

    # ---- (b) Duration phrases ----
    # Core = digit string only.
    for m in _DURATION_RE.finditer(norm_tip):
        digits = m.group(1)
        if digits not in norm_allowed:
            offenders.append(m.group(0))  # surface form, e.g. "6 minutes"

    # ---- (c) Percentages ----
    # Core = digit string.
    for m in _PERCENT_RE.finditer(norm_tip):
        digits = m.group(1)
        if digits not in norm_allowed:
            offenders.append(m.group(0))  # surface form already includes "%"

    # ---- (d) Resource figures ----
    # Core = digits with commas stripped.
    for m in _RESOURCE_RE.finditer(norm_tip):
        digits = m.group(1).replace(",", "")
        if digits not in norm_allowed:
            offenders.append(m.group(0))

    return offenders


def is_grounded(tip_text: str, allowed_text: str) -> bool:
    """
    Return True if every numeric expression in *tip_text* is supported by
    *allowed_text*.

    This is the primary entry point for the grounding check.  Pass
    tip.detail (and optionally tip.title) for each CoachTip; the service
    layer should replace the tip if False is returned.

    See module docstring for the full category definitions and tradeoffs.
    """
    return not find_ungrounded_numbers(tip_text, allowed_text)
