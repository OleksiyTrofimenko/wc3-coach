# Deviation Scoring and Prioritization

Strategic ground truth for T3.3 (patch 2.0, Orc-only coaching).

---

## Design philosophy

The engine emits one `BenchmarkResult` per metric per player. Most games produce
10–15 results per Orc player. The LLM coach (T5.3) can only use 3–5 actionable
tips. This scoring layer exists to answer one question: **which mistake actually
cost this Orc player the most?**

Scoring is *not* just severity. Two "critical" results may have very different
strategic weight: a missing expansion is game-deciding; a 2-minute-late T3 in a
game where the Orc was already winning is a minor optimization. The impact weight
encodes that judgment. Severity is then an ordinal multiplier, and the magnitude
of the deviation (|delta| relative to the threshold) scales within a severity tier.

The formula is: `score = impact_weight × severity_multiplier × magnitude_factor`

All weights are documented here. The code copy in `scoring.py` must be numerically
identical. Any tuning must update both files together.

---

## Impact weight table (patch 2.0, Orc)

Weights are on a 0–10 scale. A weight of 10 means "this mistake is essentially
always the primary reason you lose." A weight of 1 means "relevant but never the
deciding factor on its own."

| Metric | Weight | Strategic rationale |
|--------|--------|---------------------|
| `expansion_timing` | 10 | Missing or very late expansion is the single highest-leverage economic mistake. A 90-second late expo means ~6–9 fewer peon-mining-cycles per minute across the mid-game — this compounds into a unit deficit that never closes. In OvH and OvUD, the opponent's economy runs ahead while the Orc fights with a smaller army. The absent-expansion case is near game-deciding in any game over 8 minutes. |
| `worker_production_gap_approx` | 8 | Idle Great Hall is the silent macro killer. Every 15-second idle window is one peon lost from the economy permanently. A critical gap (>60s idle proxy) typically indicates the player stopped producing workers entirely for a phase of the game — often during a fight or creep. This stacks with expansion timing: late expo + idle hall = compounding deficit. |
| `tier2_timing` | 7 | Stronghold is the Orc power-spike gate. Late T2 means delayed access to Raiders (the primary map-control unit in OvNE), Shaman (the dispel + bloodlust combo in OvH), and key upgrades (Pillage, Berserker Upgrade). A 60–120 second late Stronghold means the opponent's T2 units are online and trading against Orc T1, which is a direct army-quality disadvantage. |
| `worker_count_approx_10min` | 6 | Low worker count at 10 minutes is the cumulative proof of earlier production decisions. A count 4+ below reference (critical) means the player lost or never built a significant fraction of their economic base. This is a lagging indicator but high-signal: if a player reached 10 minutes with 9 workers instead of 14, they were economically crippled. |
| `hero_level3_timing` | 5 | Level 3 is the first major hero power spike — Wind Walk for BM becomes meaningful at level 3, Feral Spirit for FS hits its first real combo, and level 3 is the gateway to most hero ultimates. Late level 3 directly delays the mid-game timing window and signals poor creep route efficiency. In OvNE especially, the BM creep race vs DH is decided before 5 minutes. |
| `first_hero_timing` | 4 | Hero out means creeping starts. A very late first hero (>2 min) is catastrophic, but small delays (30–60s) matter less than economy. The hero is important but its absence is already flagged critical by the metric itself; the weight reflects that this mistake tends to cascade (late hero = late level 3) rather than being the terminal mistake on its own. |
| `hero_level_at_5min` | 3 | The 5-minute checkpoint captures early creep efficiency. Being one level behind at 5 min is significant in the BM creep race, but this is often caused by the same root problem as hero_level3_timing. Scoring it lower prevents double-penalizing the same underlying mistake. |
| `hero_level_at_8min` | 3 | Mid-game checkpoint. By 8 minutes, hero level depends heavily on whether fights happened and who won them — it becomes more of a game-state indicator than a correctable decision. Weight matches 5-min checkpoint; neither should dominate over tier/expansion metrics. |
| `hero_level_at_10min` | 2 | Late checkpoint. At 10 minutes, hero level is heavily determined by game outcome, not correctable decisions within the game. A late-game level deficit is more symptom than cause. Lowest weight among hero-level metrics. |
| `tier3_timing` | 2 | T3 timing is highly game-state dependent. Orc often wins before T3 becomes relevant. In the games where T3 matters, its timing is constrained by economy (already captured by expansion + worker metrics). A 2-minute late Fortress is bad, but the underlying cause is almost always captured by an earlier metric. |

---

## Severity multipliers

Severity is an ordinal and maps to a multiplier applied to the impact weight:

| Severity | Multiplier |
|----------|------------|
| `info`   | 0.0 (excluded from scoring entirely) |
| `minor`  | 0.5 |
| `major`  | 1.0 |
| `critical` | 2.0 |

The critical multiplier is double major because a critical deviation is not just
"more of the same" — it represents a qualitative threshold where the mistake
changes the game state (e.g. missing expansion entirely vs. 90-second-late expo).

---

## Magnitude factor

Within a severity tier, the raw deviation magnitude captures that a 150-second-late
expansion is worse than a 70-second-late one (both are "major" but the actual harm
differs). The magnitude factor normalizes the deviation by the severity tier's
lower bound so it scales from 1.0 at the tier boundary:

```
For time-based metrics (delta in ms):
  minor tier (30 000 – 59 999):  magnitude = delta / 30 000
  major tier (60 000 – 119 999): magnitude = delta / 60 000
  critical tier (≥ 120 000):     magnitude = delta / 120 000, capped at 3.0

For level/count metrics (negative delta = behind):
  minor  (delta == -1):          magnitude = 1.0
  major  (delta == -2):          magnitude = 2.0
  critical (delta ≤ -3):         magnitude = abs(delta) / 3.0, capped at 3.0

For absent-event metrics (value == -1, no delta):
  severity is already set by the engine (major/critical from game duration);
  magnitude = 1.5 (absent is worse than late-but-present at severity boundary)
```

---

## Full scoring formula

```
score = impact_weight × severity_multiplier × magnitude_factor
```

- `score = 0.0` when `severity == "info"` (never surfaced).
- Maximum theoretical score: 10 × 2.0 × 3.0 = 60.0 (critical expansion miss with
  large delta). In practice, expansion absent in a long game scores 10 × 2.0 × 1.5 = 30.0.

---

## Prioritization rules

1. Filter to severity > "info" only (score > 0).
2. Sort by score descending.
3. Tie-break: (severity ordinal descending, metric name alphabetically ascending).
   Deterministic across all Python versions.
4. Return top N (default 5).

---

## ScoredProblem output fields

Each entry in the prioritized list carries:
- `metric`   : metric name (e.g. "expansion_timing")
- `severity` : "minor" | "major" | "critical"
- `score`    : float — the computed score (higher = more impactful)
- `delta`    : float | None — the raw deviation from the reference (ms or levels)
- `value`    : float — the actual measured value
- `expected` : float | None — the reference value
- `summary`  : short human-readable description of the deviation for the LLM coach
  (e.g. "No expansion taken in a 10:20 game (expected by 5:30)")

The `summary` is template-generated from the metric name + deviation values. It is
NOT LLM prose — it is a structured English description of the numbers, suitable as
context for the LLM coach to write a full tip.

---

## Provenance

Weights authored by Tactician (Strategist agent) in T3.3 based on:
- High-ladder ORC game patterns from W3Champions data, Grubby/Lyn stream analysis.
- Orc macro theory: expansion and production are the two highest-leverage decisions
  in WC3; tech follows; hero follows tech; late-game checkpoints are symptoms.
- Calibrated for the 1600–2200 MMR range (mid-to-high ladder) where these specific
  mistakes are the primary differentiators between game outcomes.

Patch: 2.0 (Reforged 2.00, build 6117). Weights are not validated against a game
corpus yet — XGBoost regression on win/loss outcomes is a FUTURE task.
