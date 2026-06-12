# Matchup: Orc vs Orc (OvO) — patch 2.0

**Provenance:** High-ladder community knowledge, W3Champions match analyses,
Grubby/Lyn/ToD mirror-game VODs. `verified: community`. Patch: 2.0 (Reforged 2.00,
build 6117). Added by Strategist in T3.2.

---

## Overview

OvO is the Orc mirror. Both sides have identical unit pools, tech trees, and build
costs, so the winner is determined by:

1. **Hero-first-kill advantage** — the player who kills the enemy hero first gets an
   XP lead that snowballs through the mid-game.
2. **Tech-race decision** — whether to match a Fast Expo or punish it aggressively.
3. **Raider / Ensnare timing** — Ensnare is more decisive in the mirror than in any
   other matchup because both sides' key hero (Blademaster) can Wind Walk to escape;
   Ensnare denies Wind Walk entirely.
4. **Creep-route tempo** — who controls the mid-tier camps by minute 4 dictates hero
   levels and the first major fight.

The mirror has two dominant opening philosophies: **Blademaster-first** (harassment
and XP denial) and **Far Seer-first** (economy and map control). The choice shapes
the entire mid-game.

---

## Opening A — Blademaster first (standard OvO harassment)

```
0:00   5 peons start mining
0:15   peon → build Altar of Storms
0:30   peon → build Barracks
~0:45  resume 6th peon
1:00   Barracks complete → Blademaster (queued)
1:00   peon → build Orc Burrow (food)
1:30   Blademaster out → scout enemy base; contest their Altar timing
1:45   peon → begin Stronghold upgrade (requires Barracks + Great Hall)
         [Stronghold costs 100 gold, 200 lumber, 60 s build]
2:00–2:15  Stronghold upgrade in progress
2:30   2nd Orc Burrow if approaching 20 food
3:15   Stronghold complete → Shaman / Raider available
3:30   2nd hero (Far Seer wolves or Shadow Hunter Hex/Wards)
4:00   Voodoo Lounge for item access (optional but common)
7:00–10:00 Expansion (only if game continues past T2 spike without a decisive fight; FS opener can fast expo ~4:30–5:00 if opponent is not punishing)
```

**Strategic intent:** BM into the enemy base at 1:30 aims to deny the opponent's
Altar scouting and force their BM to defend or chase. If you land a kill on an enemy
peon or the enemy BM dies early, the XP swing can be +200–400 XP (one full level at
low levels). Mirror Wind Walk duels at 1:30–3:00 define map control.

---

## Opening B — Far Seer first (macro / fast expo variant)

```
0:00   5 peons start mining
0:15   peon → build Altar of Storms
0:30   peon → build Barracks
~0:45  resume 6th peon
1:00   Barracks complete → Far Seer (queued instead of BM)
1:00   peon → build Orc Burrow (food)
1:30   Far Seer out → Feral Spirit wolves on mid-tier creep camp
2:00–2:15  Stronghold upgrade begins
3:00   2nd hero (Shadow Hunter for Hex / Serpent Wards, or BM for mirror-kill threat)
3:15   Stronghold complete → Raider / Shaman / Kodo
4:00–4:30  Fast Expansion (FS wolves provide army presence while expo builds)
```

**Strategic intent:** Far Seer's Feral Spirit wolves provide map control and XP
efficiently without risking the hero to BM Wind Walk duels. The FS opener is safer
against an aggressive BM opener because wolves can intercept BM and the FS itself
stays at range. The trade-off: no early harassment threat, so opponent can tech and
expand unmolested if they choose not to harass either.

Variant — **FS + Serpent Wards rush:** FS first then Shadow Hunter second; place
Serpent Wards in the enemy mineral line at 4:00–5:00. Very map-dependent (requires
access) but can be devastating if undetected.

---

## Key timings — Orc (your side, OvO, patch 2.0)

| Metric | Reference | Window | Notes |
|--------|-----------|--------|-------|
| first_hero_timing | 62 000 ms (1:02) | ±15 000 ms | Standard Altar 60 s; BM or FS opener |
| tier2_timing (stronghold) | 130 000 ms (2:10) | ±20 000 ms | Stronghold starts ~2:10 in standard BM opener; FS opener same |
| tier3_timing (fortress) | 420 000 ms (7:00) | ±60 000 ms | Fortress only in drawn-out games; `verified: community, low-confidence` |
| expansion_timing | 480 000 ms (8:00) | ±120 000 ms | Informational anchor — BM opener: expo after T2 spike only if game continues; FS opener fast expo ~4:30–5:00; absent expansion is NOT a mistake (2026-06-12 calibration) |
| hero_level3_timing | 240 000 ms (4:00) | ±30 000 ms | BM or FS reaches level 3 by 4:00 with 2–3 camps |
| hero_level5_timing | 480 000 ms (8:00) | ±60 000 ms | Level 5 in sustained T2 engagement; `verified: community, low-confidence` |
| worker_count_10min | 14 workers | ±2 | Standard mid-game peon saturation; same for both sides |

---

## Key timings — Orc (opponent side, OvO, patch 2.0)

Opponent timings are identical to your own (mirror matchup). Use the same reference
row for both slots when computing benchmarks. If one player's T2 is 30+ seconds later
than the other's, the later player is exposed to a Raider timing push before their
own Raiders are online.

---

## Strategic decision trees

### 1. BM mirror Wind Walk duels (1:30–4:00)

Both BMs exit at ~1:30. The early game is a cat-and-mouse:

- **Engage enemy BM directly:** High-risk/high-reward. A dead enemy BM at level 1
  is worth ~1.5 hero levels of XP advantage. But if your BM dies instead, you are
  critically behind.
- **Avoid and creep:** Safer; reach level 2 quickly from a creep camp. Enemy BM
  cannot both harass your base AND deny your creep if you stay mobile.
- **Shadow step onto enemy Altar/peons:** Wind Walk into base, kill 1–2 peons, Wind
  Walk out before Burrows engage. Net gain: ~40–80 gold + disruption time. Do not
  stay in base after first hits — Burrow ranged fire will chunk BM HP.

Key rule: **a BM dead at level 1–2 before 4:00 is almost always game-losing in the
mirror.** Wind Walk out when below 40% HP. Potions from the Goblin Merchant are
mandatory in close fights.

### 2. First hero kill — the XP pivot

In the mirror the first hero kill pivots the entire game:

- Kill at level 1 → attacker gains ~full level; dead hero respawns at level 1 with
  a meaningful gold bounty penalty.
- Kill at level 3 → attacker gains ~1–1.5 levels; victim respawns at level 2.
- Level 5 BM kill → massive; attacker's hero finishes fights faster while the victim
  rebuilds from level 3.

Consequence: **both players creep carefully and avoid hero fights until army
support arrives.** Solo hero fights before 5 units are present are almost always
losing for the aggressor.

### 3. Ensnare — the BM counter

Raider Ensnare (available at Stronghold, ~3:15–3:30) is the single most important
skill in OvO. An Ensnared BM cannot Wind Walk. Execution:

- Queue Raiders immediately when Stronghold completes (3:15).
- First Ensnare attempt: ~4:30–5:00 when 2–3 Raiders are available.
- Ensnare + melee army at a level-3 BM = kill if focus-fired.
- If opponent has Raiders too, counter-micro: keep your BM near your own Raiders
  so they can Ensnare the enemy Ensnare attempt (counterplay chain).

### 4. Tech-race fork — match or punish

When you detect the opponent going Fast Expo (FS opener or delayed Stronghold):

- **Match the expo (parallel eco):** Both players expand ~4:30–5:30; game goes to
  sustained T2/T3 army fights. The player with better Bloodlust efficiency and hero
  levels wins.
- **Punish the expo (timing attack):** Stronghold + Bloodlust + 5–6 Raiders + BM
  attack at 4:30–5:00, targeting the expo before it is fortified. An undefended
  expansion dies in ~20 s to Bloodlust Raiders. This is the canonical OvO punish
  window.

Detecting the fork: scout the enemy Altar timing (BM walk-by at 1:30–2:00). If you
see FS exiting instead of BM and no Stronghold structure queued, the opponent is
going FS-expo. You have a ~90 s window to commit to punishment before their economy
outpaces yours.

### 5. Shadow Hunter Serpent Ward control

Shadow Hunter (2nd hero) Serpent Wards placed in or near the enemy base at 4:00–5:00
deal sustained damage and force the opponent off their mineral line. In OvO this is
particularly strong because Orc has no cheap AoE dispel at that timing — Shaman
Purge costs mana and is single-target. Counter: deny wards with BM Wind Walk scouting
+ Purge immediately on placement.

### 6. Late-game — Tauren and Kodo pivot (7:00+)

If the game reaches Fortress tier (~7:00+; `low-confidence timing`), the Orc mirror
pivots to:

- **Tauren Chieftain** (T3 hero, 3rd hero slot) — Stomp AoE stun + Reincarnation
  is decisive in mirror fights. The player who gets TC online first has a major
  advantage.
- **Kodo Beast War Stomp:** Kodo is more impactful in OvO than other matchups
  because both sides are melee-heavy (Grunts + Raiders); AoE stun chain-locks the
  enemy army while your Bloodlust army attacks.
- **Raider control of map:** Bloodlust Raiders can chase wounded units across the
  whole map; the player with more Raiders + Bloodlust levels wins sustained field
  fights.

---

## Win conditions — your Orc

- **First hero kill:** Win the BM duel (or catch enemy BM with Ensnare at level 1–2)
  before 4:00. The XP lead cascades through every subsequent fight.
- **Ensnare timing spike:** Stronghold at 2:10, Raiders at 3:15, first Ensnare use
  at 4:30–5:00. Catching the enemy BM in Ensnare once with army support often ends
  the game immediately.
- **Punish greedy expo:** If opponent goes FS-opener or delayed Stronghold, attack
  their expo at 4:30–5:00 with Bloodlust Raiders. Kills the expo and the eco lead.
- **Serpent Wards harassment:** SH 2nd hero Serpent Wards in the mineral line at
  4:30–5:00 drain peons and floating gold if the opponent does not counter-respond.
- **Bloodlust + Kodo War Stomp combo:** In sustained T2 army fights, War Stomp into
  Bloodlust Raiders shreds even a defended position. Two Kodo beats one Kodo in equal
  engagement; build one Kodo early.

---

## Common Orc mistakes (OvO)

- **BM solo-engaging without army support before Raiders arrive:** Trying to kill
  the enemy BM alone in the field at 2:00–3:00. If both BMs are at full HP and no
  units are present, the aggressor usually trades poorly because the defender's peons
  and Burrows assist. Engage hero-vs-hero only when you have army presence.
- **Forgetting Ensnare as the BM counter:** Building Raiders for DPS without casting
  Ensnare on the enemy BM during fights. An un-Ensnared BM Wind Walks out of every
  kill window; Ensnare is the mandatory BM removal tool in OvO.
- **Letting both BMs creep freely:** If you do not contest the opponent's creep
  camps by 3:00, they will reach level 3 unimpeded. Probe creep routes with BM at
  1:30–2:00 and deny the closest mid-tier camp if safe.
- **Floating gold after Stronghold:** Not immediately spending on Shaman adept
  training + Bloodlust + Raiders when Stronghold completes at 3:15. This is the
  mirror power spike; opponent who spends faster has Bloodlust Raiders first and wins
  the first major engagement.
- **Not scouting FS vs BM opener:** Walking your BM into the enemy base at 1:30 and
  finding a Far Seer instead of BM means the enemy is going eco/expo. Immediately
  adjust to punish: accelerate Stronghold, queue Raiders, prepare the 4:30 expo
  pressure attack.
- **Neglecting Burrows as defense:** In OvO the enemy BM Wind Walks into your base
  frequently. Two active Burrows (ranged mode) at the mineral line prevent free peon
  kills. Build 2nd Burrow no later than 2:30.

---

## Common opponent Orc mistakes (mirror — what to exploit)

- **Delayed Stronghold past 3:00:** If you scout that the enemy Altar is up but no
  Stronghold structure visible at 2:30, attack at 4:00–4:30 before they have Raiders
  or Bloodlust. Pure Grunts without Bloodlust lose badly to Bloodlust Grunts.
- **Single-hero mid-game:** Opponent who does not pick up a 2nd hero by 4:30–5:00
  loses XP and spell coverage. Exploit: press fights when your 2nd hero is available
  and theirs is not.
- **Expanding without Raider escort:** Orc expansion under construction is vulnerable
  for ~90 s. If you see the expo go up undefended, send Bloodlust Raiders immediately;
  they can destroy a Great Hall before peons can finish repairing it.
- **Over-investing in Grunts vs Raiders:** Grunts are cost-efficient but slow;
  Raiders have Ensnare and Pillage. An opponent who skips Raiders entirely has no
  BM counter and cannot pillage. Target their BM in every fight — it cannot escape.
