# Creeping Reference

Neutral camp mechanics, experience tables, and item drops. The LLM coach reads
this to explain why hero level deviations happen and when creeping stops being
efficient.

**Patch baseline:** 2.0 (Reforged patch 2.00, build 6117). Values carry forward
from The Frozen Throne; original Reign of Chaos values are not separately documented
here unless they differ.
**Provenance:** Liquipedia, classic.battle.net official docs. `verified: community`
unless marked otherwise.
**Research method:** deep-research pass with 3-vote adversarial verification (2026-06-12).
**Scope:** Orc-POV coaching. All "why it matters" notes are written for an Orc player.

Sources used throughout:
- https://liquipedia.net/warcraft/Creeps
- https://liquipedia.net/warcraft/Experience
- http://classic.battle.net/war3/basics/creeping.shtml
- http://classic.battle.net/war3/neutral/creepbasics.shtml

**Database note:** The `creep_camps` table in Postgres is map-specific and is NOT
YET SEEDED. Camp compositions, exact positions, and per-camp item tables vary by
map. The mechanics in this file are universal rules; the per-camp data requires a
map-specific seed (future work).

---

## Camp Difficulty Tiers

Camp difficulty is the sum of the individual unit levels of all creeps in the camp.
Minimap dot color indicates approximate difficulty tier.

| Tier | Total camp level | Minimap color | Alternative name in sources |
|---|---|---|---|
| Easy | 1 – 9 | Green | Green |
| Medium | 10 – 19 | Orange | Yellow (Liquipedia) / Orange (Battle.net) — cosmetic naming difference only |
| Hard | 20 + | Red | Red |

`verified: community` (community heuristic; Liquipedia + Battle.net docs; 3-0 vote)

**Minimap accuracy caveat:** Blizzard's own documentation states the minimap dot
color is "not always accurate." The tier formula (sum of creep levels) is the
reliable measure; the dot is a quick visual proxy only.

**Why it matters (Orc POV):** Camp difficulty directly determines item drop power
and XP yield. An Orc player who routes exclusively through green camps in the early
game is maximizing safety but leaving medium-tier XP (and better items) on the
table. The Blademaster at level 1 can solo green camps; medium camps generally
require at least one supporting unit or a level-2 hero. The coach should identify
whether the hero level deviation correlates with a conservative camp choice pattern
(all greens) versus an inefficient route (backtracking, skipping accessible camps).

---

## Creep Experience

### Base XP by creep level

| Creep level | XP granted | Notes |
|---|---|---|
| 1 | 25 | |
| 2 | 40 | |
| 3 | 60 | |
| 4 | 85 | |
| 5 | 115 | |
| 6 | 150 | |

`verified: community` (Liquipedia, Battle.net; 3-0 vote)

Pattern: each level step adds 5 × (level + 1). This is internally consistent and
gives a quick mental check: a 3-unit green camp of level-3 creeps yields 3 × 60 = 180 XP.

**Summoned unit XP:** Summoned (not player-trained) units grant 50 % of the base XP
for their level.

`verified: community` (Liquipedia; 3-0 vote)

### Hero XP reduction by hero level (TFT / patch 2.0)

Heroes receive a diminishing fraction of creep XP as they level up.

| Hero level | Fraction of base creep XP received |
|---|---|
| 1 | 80 % |
| 2 | 70 % |
| 3 | 60 % |
| 4 | 50 % |
| 5 + | 0 % — hero gains ZERO XP from neutral creeps |

`verified: community` (Liquipedia, Battle.net; 3-0 vote)

**Critical distinction:** The level-5 creep-XP cutoff applies ONLY to neutral
creeps. A hero at level 5 or above continues to receive full XP from killing units
controlled by other players (enemy heroes, enemy army units). Only creep farming
becomes XP-neutral past level 5.

---

## Item Drops

Item drop power scales with camp difficulty. Generally:

- Easy (green) camps may drop level-1 or level-2 items.
- Medium (orange) camps drop higher-tier items.
- Hard (red) camps may drop level-5 or level-6 items.

Only the highest-level creep in a camp typically drops an item (the "boss" or
strongest unit in the group). Exact per-camp drop tables are MAP-SPECIFIC and
depend on the map version.

`verified: community` (Battle.net neutral creep basics; 3-0 vote for the general
principle; specific drop tables are not verified here and are map-dependent)

**Why it matters (Orc POV):** Item drops from medium and hard camps are a meaningful
power multiplier for the Blademaster. A Ring of Protection or Claws of Attack from
a medium camp can be the difference in whether the BM survives a mirror-camp fight
or a base harass. The coach should note when the Orc hero reached a timing checkpoint
late AND the hero has no items — this is evidence the player either skipped medium
camps or lost the item to a failed creep.

---

## Creeping and the Hero Level-5 Cutoff

The level-5 cutoff is the most strategically important mechanic in this file.

**Rule:** A hero at level 5 or above receives 0 % XP from killing neutral creeps.
Creeping past level 5 returns only gold bounty from camps, not XP.

### What this means for Orc strategy

At level 5, the Blademaster has access to all three non-ultimate abilities plus the
Bladestorm ultimate if already learned. The BM is combat-ready for major engagements.
Continuing to creep instead of fighting or defending is:

1. Leaving the bounty gold on the table for both players — the enemy hero can claim
   those camps instead, gaining XP the Orc's hero cannot.
2. Delaying the timing window when the BM's level-5 kit (Wind Walk + Critical Strike
   + Mirror Image) can be applied in a real fight.

**The denial angle:** Camps that the Orc's level-5 BM cannot efficiently use for XP
CAN still be crept for bounty gold AND to deny the enemy hero those XP-granting kills.
Camp denial is a legitimate reason to clear camps past level 5, but it should be
framed as map control / denial, not hero development.

**Benchmark implication:** The `hero_level5_timing` benchmark (reference: 8:00 in
most OvX matchups) is tracking when the Orc hero reaches a state of maximum creep-XP
efficiency. Arriving at level 5 after 8:00 means the player was creeping slowly
(or fighting and losing XP to deaths) during the most XP-efficient window (levels 1–4).
Arriving at level 5 before ~6:00 is possible but rare; if it occurs, the coach should
check whether the player then wasted time creeping camps that yield no XP.

`verified: community` (Liquipedia, Battle.net; level-5 cutoff 3-0 vote)

**Why it matters (Orc POV):** Over-creeping a Blademaster past level 5 is a
documented high-ladder mistake. The coach should flag a level-5-or-above BM that
is still creeping in the 9:00–11:00 window while the opponent is taking an expansion
or building army. Every camp crept in that window gives the Orc player only ~50–150
gold bounty but costs 30–60 seconds of army production time and denies the BM's
combat presence from a fight that may have decided map control.

---

## XP to Level (hero level thresholds)

The verified cumulative XP-to-level table now lives in
`hero-progression.md` — see the **Hero Experience Curve** section there.

Single-source-of-truth note: the table and closed-form formula
(`XP_to_reach(L) = 50 * (L^2 + L - 2)`) are maintained only in
`hero-progression.md`; do not duplicate them here.

**Shape summary:** Early levels are cheap (L1→L2 costs 200 XP; a single medium
camp can push a fresh hero to level 2). The L4→L5 gap is 500 XP — the largest
single jump in the early game and the reason the `hero_level5_timing` benchmark
reference is ~8:00 in most OvX matchups. The benchmark timings in `timings.md`
encode the net effect of the XP curve implicitly; `hero-progression.md` provides
the raw table for cases where exact XP accounting is needed.

`verified: community` (Warcraft Wiki + Liquipedia; 3-0 adversarial vote, 2026-06-12
batch-2 research pass — previously flagged `verified: false` in an earlier draft)
