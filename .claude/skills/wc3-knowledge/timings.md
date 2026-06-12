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
- Orc-specific rule: expansion absent in ANY Orc game → **info** (no score contribution)
  unless game duration > 18 min → minor.
  Rationale: 1-base aggressive Orc is the dominant meta across all four Orc matchups.
  No expansion is frequently the CORRECT decision (BM harass → T2 spike → win/lose
  before 12–14 min). Penalising absent expansion for Orc produces false coach tips
  (user-confirmed W3Champions correction, 2026-06-12).
- For non-Orc races (Human, NE, UD): retain original rule
  (expansion absent in game > 8 min → critical; ≤ 8 min → major).

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
7:00–10:00 Expansion window (only if 1-base push did not close the game; Fast Expo variant ~5:00–6:00 on safe maps)
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
| expansion_timing | 480 000 ms (8:00) | ±120 000 ms | Informational anchor only — 1-base Orc is standard meta; FE variant goes ~5:00–6:00; absent expansion → info, not a penalty (2026-06-12 calibration) |
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

**Provenance:** High-ladder community knowledge, Grubby/ToD/Th000-era references,
W3Champions match analyses. `verified: community`. Patch: 2.0 (Reforged 2.00, build 6117).
Updated by Strategist in T3.2 (was bare table from T3.1; full build order added).

### Standard Orc build order (OvH) — Blademaster opener

```
0:00   5 peons start mining
0:15   peon → build Altar of Storms
0:30   peon → build Barracks
1:00   Barracks complete → Blademaster
1:00   peon → build Orc Burrow (food)
1:30   Blademaster out → harass Human base or creep small camp
2:00–2:15  Stronghold upgrade begins
3:15   Stronghold complete → Shaman / Raider / T2 upgrades
3:30–4:00  2nd hero (Far Seer or Shadow Hunter)
9:00+  Expansion (only if 1-base BM harass + T2 spike did not close the game; OvH is 1-base meta — absent expansion is NOT a mistake)
```

### Standard Human build order (HvO) — Archmage FE opener

```
0:00   5 peasants mining; 1 peasant → Altar of Kings
0:10   militia out (defend BM harass window)
0:30   2nd peasant → Barracks
0:45   3rd peasant → Blacksmith (required for Keep)
1:10   Altar complete → Archmage
1:30   Archmage out → creep with militia or defend
2:45–3:00  Keep upgrade begins (requires Barracks + Blacksmith)
4:00–4:30  Expansion (AM Brilliance Aura FE is HvO power pattern)
5:30–6:00  Sorceresses / Spellbreakers online
```

### Key reference timings — Orc (OvH, patch 2.0)

| Metric | Reference | Window | Notes |
|--------|-----------|--------|-------|
| first_hero_timing | 62 000 ms (1:02) | ±15 000 ms | Altar 60 s; BM standard opener |
| tier2_timing (stronghold) | 135 000 ms (2:15) | ±20 000 ms | Slightly later vs Human; BM first hits then T2 |
| tier3_timing (fortress) | 450 000 ms (7:30) | ±60 000 ms | Fortress in drawn-out OvH games only |
| expansion_timing | 540 000 ms (9:00) | ±120 000 ms | Informational anchor — OvH is 1-base BM harass → T2 spike close-out; expansion only if Human survives past ~9 min; absent expansion is NOT a mistake (2026-06-12 calibration) |
| hero_level3_timing | 270 000 ms (4:30) | ±30 000 ms | BM creep constrained by HU harassment |
| hero_level5_timing | 480 000 ms (8:00) | ±60 000 ms | Mid-T2 fight hero level |
| worker_count_10min | 14 workers | ±2 | Standard mid-game peon saturation |

### Key reference timings — Human (HvO, patch 2.0)

| Metric | Reference | Window | Notes |
|--------|-----------|--------|-------|
| first_hero_timing | 70 000 ms (1:10) | ±15 000 ms | Altar 60 s + militia opener costs extra seconds |
| tier2_timing (keep) | 210 000 ms (3:30) | ±30 000 ms | Keep requires Barracks + Blacksmith; starts 3:00–3:30 |
| tier3_timing (castle) | 510 000 ms (8:30) | ±60 000 ms | Castle only in long games; very late |
| expansion_timing | 270 000 ms (4:30) | ±60 000 ms | AM FE at 4:30 standard; top play goes 4:00 |
| hero_level3_timing | 240 000 ms (4:00) | ±30 000 ms | AM/MK creep route with militia |
| hero_level5_timing | 540 000 ms (9:00) | ±60 000 ms | Human heroes level slower in HvO |
| worker_count_10min | 14 workers | ±2 | AM Brilliance Aura sustains peasant production |

---

## Matchup: OvUD (Orc vs Undead) — patch 2.0

**Provenance:** High-ladder community knowledge, Grubby/Lyn/Soin-era references,
W3Champions match analyses. `verified: community`. Patch: 2.0 (Reforged 2.00, build 6117).
Updated by Strategist in T3.2 (was bare table from T3.1; full build order added).

### Standard Orc build order (OvUD) — Blademaster opener

```
0:00   5 peons start mining
0:15   peon → build Altar of Storms
0:30   peon → build Barracks
1:00   Barracks complete → Blademaster (or Far Seer)
1:00   peon → build Orc Burrow (food)
1:30   Blademaster out → creep small camp (avoid early UD base aggression)
2:00–2:15  Stronghold upgrade begins
3:15   Stronghold complete → Shaman / Raider / Kodo production
3:30–4:00  2nd hero (Far Seer wolves or Shadow Hunter)
7:00–10:00 Expansion (only if 1-base push did not close the game; fast variant ~5:00–6:00 when DK route is confirmed distant)
```

### Standard Undead build order (UDvO) — Death Knight opener

```
0:00   3 acolytes haunt gold mines; 1 acolyte → Altar of Darkness
0:30   acolyte → build Crypt
1:00   Altar complete → Death Knight
1:10   Crypt complete → Ghoul production (1–2 Ghouls)
1:30–2:00  Death Knight out → creep or harass Orc workers
2:00   acolyte → build Graveyard (required for Halls of the Dead upgrade)
2:30   Necropolis → Halls of the Dead (T2) begins [65 s build; 100 gold, 180 lumber]
3:00   Halls of the Dead complete → Crypt Fiend / Necromancer / Lich available
3:30   2nd hero: Lich (standard) or Dread Lord
7:00+  Expansion via Haunted Gold Mine
```

### Key reference timings — Orc (OvUD, patch 2.0)

| Metric | Reference | Window | Notes |
|--------|-----------|--------|-------|
| first_hero_timing | 62 000 ms (1:02) | ±15 000 ms | Standard Altar 60 s; BM or FS opener |
| tier2_timing (stronghold) | 135 000 ms (2:15) | ±20 000 ms | Stronghold ~2:15; FE variant delays to ~3:00 |
| tier3_timing (fortress) | 420 000 ms (7:00) | ±60 000 ms | Fortress at ~7:00 if game is even; earlier if snowballing |
| expansion_timing | 480 000 ms (8:00) | ±120 000 ms | Informational anchor — standard OvUD is 1-base BM/FS → T2 spike; safe FE variant ~5:00–6:00 only when DK camps are contested; absent expansion is NOT a mistake (2026-06-12 calibration) |
| hero_level3_timing | 240 000 ms (4:00) | ±30 000 ms | BM reaches 3 while contesting UD creep route |
| hero_level5_timing | 480 000 ms (8:00) | ±60 000 ms | Level 5 in sustained T2 fights |
| worker_count_10min | 14 workers | ±2 | Standard mid-game peon saturation |

### Key reference timings — Undead (UDvO, patch 2.0)

| Metric | Reference | Window | Notes |
|--------|-----------|--------|-------|
| first_hero_timing | 62 000 ms (1:02) | ±15 000 ms | Altar 60 s; Death Knight standard opener |
| tier2_timing (halls_of_the_dead) | 160 000 ms (2:40) | ±20 000 ms | Halls of the Dead upgrade starts ~2:30–2:40 |
| tier3_timing (black_citadel) | 540 000 ms (9:00) | ±60 000 ms | Black Citadel (T3) very late; only in extended games |
| expansion_timing | 420 000 ms (7:00) | ±60 000 ms | UD expands late via Haunted Mine; DK focus delays expo |
| hero_level3_timing | 270 000 ms (4:30) | ±30 000 ms | DK/Lich creep route to level 3 by 4:30 |
| hero_level5_timing | 540 000 ms (9:00) | ±60 000 ms | UD heroes level more slowly; sustained army fights |
| worker_count_10min | 12 workers | ±2 | UD Acolytes; fewer needed due to Haunted Mine mechanics |

---

## Matchup: OvO (Orc vs Orc mirror) — patch 2.0

**Provenance:** High-ladder community knowledge, W3Champions mirror-game analyses.
`verified: community`. Patch: 2.0 (Reforged 2.00, build 6117). Added by Strategist in T3.2.

Both sides are Orc; the same reference row applies to both slots. The matchup code
for the analysed player is 'OvO'; for the opponent it is also 'OvO' (mirror pair —
only one code needed, unlike asymmetric matchups).

### Standard Orc build order (OvO) — Blademaster opener

```
0:00   5 peons start mining
0:15   peon → build Altar of Storms
0:30   peon → build Barracks
~0:45  resume 6th peon
1:00   Barracks complete → Blademaster
1:00   peon → build Orc Burrow (food)
1:30   Blademaster out → scout / contest enemy BM / harass peons
2:10   Stronghold upgrade begins [100 gold, 200 lumber, 60 s build]
2:30   2nd Orc Burrow
3:15   Stronghold complete → Raider / Shaman available; queue Raiders immediately
3:30   2nd hero (Far Seer or Shadow Hunter)
7:00–10:00 Expansion (only if game continues past T2 spike; FS-first variant can fast expo ~4:30–5:00 on safe maps)
```

### Key reference timings — Orc (OvO, patch 2.0)

Both players use the same row; the mirror has symmetric benchmarks.

| Metric | Reference | Window | Notes |
|--------|-----------|--------|-------|
| first_hero_timing | 62 000 ms (1:02) | ±15 000 ms | Standard Altar 60 s; BM or FS opener |
| tier2_timing (stronghold) | 130 000 ms (2:10) | ±20 000 ms | Same as OvNE standard opener |
| tier3_timing (fortress) | 420 000 ms (7:00) | ±60 000 ms | Late-game only; `verified: community, low-confidence` |
| expansion_timing | 480 000 ms (8:00) | ±120 000 ms | Informational anchor — BM opener: expo after T2 spike if game continues; FS opener fast expo ~4:30–5:00; absent expansion is NOT a mistake (2026-06-12 calibration) |
| hero_level3_timing | 240 000 ms (4:00) | ±30 000 ms | BM or FS reaches level 3 by 4:00 with 2–3 camps |
| hero_level5_timing | 480 000 ms (8:00) | ±60 000 ms | Level 5 in T2 engagement; `verified: community, low-confidence` |
| worker_count_10min | 14 workers | ±2 | Standard mid-game peon saturation; same for both sides |

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
