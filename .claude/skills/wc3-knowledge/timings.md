# Reference Timings

Benchmarks the Strategist's engine compares against. Always tag matchup + patch.

| Metric | Meaning |
|---|---|
| expansion_time | when a strong player takes expo |
| t2_time / t3_time | tech timings |
| hero_lvl_by_time | expected hero level at game minute X |
| worker_curve | worker count over time |
| supply_block_total | seconds spent supply-blocked |
| floating_resources | avg un-spent gold/lumber |

---

## Severity thresholds (T3.1, patch 2.0)

Deviations are measured in milliseconds for time-based metrics or counts for
level/count metrics. Severity brackets were calibrated from ladder-game norms
at the 1600–2000 MMR range (mid-high ladder). They are conservative — designed
to surface only meaningful mistakes.

| Severity | Time deviation | Level deviation |
|----------|---------------|-----------------|
| info     | 0 – 29 999 ms (< 30 s) | ≤ 0 |
| minor    | 30 000 – 59 999 ms (30 – 60 s) | 1 level |
| major    | 60 000 – 119 999 ms (60 – 120 s) | 2 levels |
| critical | ≥ 120 000 ms (≥ 2 min) | ≥ 3 levels |

For "missing" events (e.g. no expansion taken):
- expansion absent in a game > 8 min → critical
- expansion absent in a game ≤ 8 min → major (could be a fast-win aggressive build)

---

## Matchup: OvNE (Orc vs Night Elf) — patch 2.0

**Provenance:** High-ladder community knowledge, Grubby/Tw2k/Lyn-era references,
W3Champions match analyses. `verified: community`. Patch: 2.0 (Reforged 2.00, build 6117).
Added by Strategist in T3.1.

### Standard Orc build order (OvNE) — Blademaster fast-harass opener

```
0:00   5 peons start mining
0:15   peon → build Altar of Storms
0:30   peon → build Barracks
~0:45  train 1st peon on queue resume
1:00   Barracks complete → Blademaster
1:00   peon → build Burrow (food)
1:30   Blademaster out → creep small camp or harass
2:00   Stronghold upgrade begins (requires Barracks)
2:30   2nd hero timing depends on game state
3:30   Stronghold completes → access to Raiders, Shaman, T2 upgrades
4:00–5:30  Expansion window (map-dependent; Fast Expo builds go earlier ~3:00)
```

Stronghold (T2) timing depends on whether the build is:
- **Standard opener:** Stronghold starts ~2:00–2:20 (120 000–140 000 ms)
- **Fast Expo Orc:** Stronghold starts ~2:40–3:00 after expo secured
- **Aggressive blade:** Stronghold delayed to ~3:00–3:30 while blade harasses

### Key reference timings — Orc (OvNE, patch 2.0)

| Metric | Reference | Window | Notes |
|--------|-----------|--------|-------|
| first_hero_timing | 62 000 ms (1:02) | ±15 000 ms | Altar 60 s build + few seconds queue |
| tier2_timing (stronghold) | 130 000 ms (2:10) | ±20 000 ms | Standard opener benchmark |
| tier3_timing (fortress) | 420 000 ms (7:00) | ±60 000 ms | Game-state dependent; late-game only |
| expansion_timing | 330 000 ms (5:30) | ±60 000 ms | Standard mid-ladder; FE builds earlier |
| hero_level3_timing | 240 000 ms (4:00) | ±30 000 ms | Creeping 2–3 camps by 4 min |
| hero_level5_timing | 480 000 ms (8:00) | ±60 000 ms | Full T2 fight hero |
| worker_count_10min | 14 workers | ±2 | Typical mid-game saturation |

### Key reference timings — Night Elf (NEvO, patch 2.0)

| Metric | Reference | Window | Notes |
|--------|-----------|--------|-------|
| first_hero_timing | 62 000 ms (1:02) | ±15 000 ms | Altar 60 s build + queue |
| tier2_timing (tree_of_ages) | 150 000 ms (2:30) | ±20 000 ms | Standard NE opener |
| tier3_timing (tree_of_eternity) | 450 000 ms (7:30) | ±60 000 ms | Late-game only |
| expansion_timing | 360 000 ms (6:00) | ±60 000 ms | NE typically expands later vs Orc |
| hero_level3_timing | 270 000 ms (4:30) | ±30 000 ms | Firelord/DH creep route |
| hero_level5_timing | 540 000 ms (9:00) | ±60 000 ms | T2 power spike |
| worker_count_10min | 12 workers | ±2 | Wisp-based; fewer needed than peons |

---

## Matchup: OvH (Orc vs Human) — patch 2.0

**Provenance:** Community knowledge. `verified: community`. Patch 2.0.
Added by Strategist in T3.1.

### Key reference timings — Orc (OvH, patch 2.0)

| Metric | Reference | Window | Notes |
|--------|-----------|--------|-------|
| first_hero_timing | 62 000 ms (1:02) | ±15 000 ms | Altar 60 s |
| tier2_timing (stronghold) | 135 000 ms (2:15) | ±20 000 ms | Slightly later vs Human (defensive awareness) |
| expansion_timing | 360 000 ms (6:00) | ±60 000 ms | HU pressure often delays expo |
| hero_level3_timing | 270 000 ms (4:30) | ±30 000 ms | Creep route vs HU harassment |

### Key reference timings — Human (HvO, patch 2.0)

| Metric | Reference | Window | Notes |
|--------|-----------|--------|-------|
| first_hero_timing | 70 000 ms (1:10) | ±15 000 ms | Altar 60 s + militia opener |
| tier2_timing (keep) | 210 000 ms (3:30) | ±30 000 ms | Keep requires Castle path or Blacksmith |
| expansion_timing | 270 000 ms (4:30) | ±60 000 ms | HU often FEs earlier |
| hero_level3_timing | 240 000 ms (4:00) | ±30 000 ms | Archmage/Mountain King creep |

---

## Matchup: OvUD (Orc vs Undead) — patch 2.0

**Provenance:** Community knowledge. `verified: community`. Patch 2.0.
Added by Strategist in T3.1.

### Key reference timings — Undead (UDvO, patch 2.0)

| Metric | Reference | Window | Notes |
|--------|-----------|--------|-------|
| first_hero_timing | 62 000 ms (1:02) | ±15 000 ms | Altar 60 s |
| tier2_timing (slaughterhouse/halls) | 160 000 ms (2:40) | ±20 000 ms | UD T2 tech path |
| expansion_timing | 420 000 ms (7:00) | ±60 000 ms | UD expands late typically |
| hero_level3_timing | 270 000 ms (4:30) | ±30 000 ms | DK/Lich creep |

---

## Worker production continuity — proxy metric

Worker idle gaps are measured as the time between consecutive worker train
completion events (approximated from train command times + build time offset).
A gap > 15 000 ms (15 s) suggests idle production.

| Severity | Idle gap |
|----------|----------|
| info     | < 15 000 ms |
| minor    | 15 000 – 29 999 ms |
| major    | 30 000 – 59 999 ms |
| critical | ≥ 60 000 ms |

This is an APPROXIMATION because worker deaths are unknown from commands alone.
The engine labels it explicitly as `worker_production_gap_approx`.

---

## Deferred metrics (require Observer API / T1.4)

| Metric | Why deferred |
|--------|-------------|
| floating_gold | Resource values not in command stream; need live game state |
| floating_lumber | Same as floating_gold |
| supply_block_duration | True food usage requires knowing unit deaths (supply freed on death) |
| army_supply_value | Unit deaths unknown from commands; cumulative train count is only a lower bound |
| idle_production_exact | Exact idle time requires knowing when production buildings became free after each unit completed |
| creep_route_efficiency | Unit positions not in command stream |
