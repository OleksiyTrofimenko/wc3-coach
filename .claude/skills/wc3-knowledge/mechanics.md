# Game Mechanics Reference

Core economy and income mechanics. The LLM coach reads this to explain WHY a
deviation matters in economic terms, not just WHAT the number is.

**Patch baseline:** 2.0 (Reforged patch 2.00, build 6117). Original Reign of Chaos
values are noted where they differ.
**Provenance:** Liquipedia, Warcraft Wiki, classic.battle.net official docs.
`verified: community` for all figures unless marked otherwise.
**Research method:** deep-research pass with 3-vote adversarial verification (2026-06-12).
**Scope:** Orc-POV coaching. All "why it matters" notes are written for an Orc player.

Sources used throughout:
- https://liquipedia.net/warcraft/Upkeep
- https://liquipedia.net/warcraft/Economy
- http://classic.battle.net/war3/basics/upkeep.shtml
- https://warcraft.wiki.gg/wiki/Upkeep
- https://liquipedia.net/warcraft/Food
- https://liquipedia.net/warcraft/Moon_Well
- https://warcraft.wiki.gg/wiki/Farm_(Warcraft_III)
- https://liquipedia.net/warcraft/Gold_Mine
- https://warcraft.wiki.gg/wiki/Gold_Mine_(Warcraft_III)
- https://warcraft.wiki.gg/wiki/Peasant_(Warcraft_III)
- https://warcraft.wiki.gg/wiki/Ghoul_(Warcraft_III)
- http://classic.battle.net/war3/neutral/creepbasics.shtml
- https://liquipedia.net/warcraft/Gold

---

## Upkeep

Upkeep is a gold-only income tax applied when food (supply) exceeds a threshold.
**Lumber income is never taxed.** The tax reduces the fraction of gold you actually
receive from mining; it does not change how much workers mine or how fast.

| Food bracket | Gold income fraction | Effective tax |
|-------------|---------------------|---------------|
| 0 – 50      | 100 %               | 0 %           |
| 51 – 80     | 70 %                | 30 %          |
| 81 – 100    | 40 %                | 60 %          |

`verified: community` (Liquipedia, Warcraft Wiki, Battle.net official docs; 3-0 vote)

**Reign of Chaos historical note:** RoC thresholds were 10 food lower: No Upkeep
0–40, Low Upkeep 41–70, High Upkeep 71–90. The TFT / patch 2.0 thresholds (above)
apply to all current play.

**Why it matters (Orc POV):** Crossing 51 food drops gold income by 30%. An Orc
player who masses up to a large army but has not expanded is simultaneously paying
the highest production cost AND receiving 30–60 % less gold per mining cycle. The
coach should flag any state where the Orc is at high upkeep with low army value —
that combination means the player is spending more than they can earn and cannot
sustain reinforcements. The correct response is either to push immediately (spend
the army before the deficit compounds) or to have taken an expansion earlier to
support the supply.

---

## Food and Supply

Each race's food building provides a different amount. All races share the same
hard food cap of 100 in standard melee.

| Building | Race | Food provided |
|---|---|---|
| Farm | Human | 6 |
| Orc Burrow | Orc | 10 |
| Moon Well | Night Elf | 10 |
| Ziggurat | Undead | 10 |

`verified: community` (Liquipedia/Warcraft Wiki; 3-0 vote)

The main base building (Great Hall, Town Hall, Tree of Life, Necropolis) also
contributes to the food cap; the exact amount is not separately verified here —
`verified: false (strategist knowledge, needs CASC check)`.

**Maximum food cap:** 100 in standard melee. This is a hard ceiling; units cannot be
trained when supply would exceed 100. Custom maps may modify this.

**Why it matters (Orc POV):** Orc Burrows provide 10 food each — the best ratio among
food buildings — but each Burrow costs 160 gold and 40 lumber and takes 35 seconds to
build. The coach should flag supply blocks that occur because a second or third Burrow
was not queued ahead of the next production wave. A supply block at the Stronghold
power spike (when Raiders + Shaman are being queued simultaneously) is a common,
correctable error. Human is the only race that needs more food buildings to reach the
same supply cap (17 Farms for 102 food vs 10 Burrows for 100 food), so the Orc
player's food efficiency is structurally good — failures are execution errors, not
design problems.

---

## Gold Mining

### Mine capacity

| Metric | Value | Notes |
|---|---|---|
| Default starting gold per mine | 12,500 | `verified: community` (3-0 vote); competitive maps may override per-mine amounts; expansion mines vary by map |
| Workers for maximum efficiency | 5 | `verified: community` (3-0 vote); Blizzard patch 1.13: "in almost all cases, 5 peons are required for an Orc or Human to mine a gold mine at maximum efficiency" |

### Per-worker income

| Metric | Value | Notes |
|---|---|---|
| Gold per round trip (Human/Orc) | 10 gold | `verified: community` (3-0 vote) |
| Round-trip time at saturation (Human/Orc) | ~5 s | NOMINAL; idealized saturated round-trip; actual time scales with mine-to-hall distance. `verified: community` (2-1 vote — label as nominal) |
| Nominal income per worker at saturation | ~2 gold/s | Derived: 10 gold / 5 s; this is BEFORE upkeep reduction |
| Undead / Night Elf mining model | Passive | Workers stay inside the mine; 10 gold per 5 s (same nominal rate) but the model is different — hard cap of 5 workers inside simultaneously |

**Hard cap vs soft cap:**
- Undead Acolytes and Night Elf Wisps are HARD-capped at 5 workers inside a mine simultaneously.
- Human Peasants and Orc Peons have NO hard cap enforced by the game engine, but sending more than 5 gains no additional income at optimal hall distance — extra workers only waste food.

`verified: community` (3-0 vote; Blizzard patch 1.13 statement for Human/Orc)

**Why it matters (Orc POV):** 5 peons at a main mine is the saturation point. A
player who has only 10 workers at 10 minutes (4 below the 14-worker benchmark) has
been running at ~71 % of their potential gold rate from the main mine, AND likely
has zero expansion income. With upkeep at 60 %, a player at 80+ food earning only
71 % of nominal income is receiving roughly 28 % of their maximum possible gold/s.
The coach should connect low worker count directly to the income numbers — the
deviation compounds with upkeep and with the absence of an expansion mine.

### Two-mine income model

A fully saturated expansion provides the same 5-peon × 10 gold cycle as the main.
Total maximum nominal income from two mines is roughly 20 gold/s before upkeep.
This is why expansion timing is the single highest-weight benchmark metric: a 90-
second delayed expansion is ~1,800 gold of foregone nominal income across the mid-
game window.

---

## Lumber Harvesting

Lumber income varies significantly by race due to different worker mechanics.

| Race | Worker | Carry capacity | Per-trip yield | Return trips | Notes |
|---|---|---|---|---|---|
| Human | Peasant | 10 (base) / 20 / 30 (upgraded) | 10 lumber | Yes | Lumber Mill upgrades raise capacity to 20 then 30 |
| Orc | Peon | 10 | 10 lumber | Yes | No capacity upgrade available |
| Undead | Ghoul | 20 | 2 lumber per harvest, up to 20 | Yes | Faster/higher yield per trip than Peasant/Peon |
| Night Elf | Wisp | 5 | Passive; stands at tree | No return trips | `verified: false (strategist knowledge — exact per-tick rate for Wisp not independently confirmed; needs CASC check)` |

`verified: community` for Human, Orc, Undead figures (Warcraft Wiki; 3-0 vote).
Night Elf Wisp passive rate beyond carry capacity is `verified: false (strategist knowledge, needs web/CASC check)`.

**Why it matters (Orc POV):** Orc has no lumber capacity upgrade, meaning peons
always haul 10 lumber per trip. Orc mid-game lumber costs are high (Stronghold costs
135 lumber, Fortress costs 200 lumber, Raiders cost 40 lumber each). A player who
assigned too few peons to lumber in the opening will hit a lumber bottleneck exactly
when Stronghold is ready to queue and Raiders need to be trained. The coach should
flag cases where Stronghold or T2 units were delayed AND lumber is the likely cause
(inferable if the player had idle gold but no units queued — though exact resource
state is deferred to T1.4). As a proxy: insufficient burrow count or delayed Barracks
suggests the lumber assignment was too conservative early.

---

## Unit Bounty

Killing neutral creep camps grants both gold bounty (displayed as a floating golden
number) and experience to the hero that lands the killing blow (or contributed to the
kill). This is the primary resource source during the creep phase.

`verified: community` (Battle.net, Liquipedia; 3-0 vote)

**Player-unit bounty in standard melee:** Killing units controlled by other players
is not known to grant gold bounty in standard melee. This is a widely held
assumption but was not independently verified in this research pass.
`verified: false (assumption — needs in-game or CASC confirmation)`

**Why it matters (Orc POV):** Because neutral creep kills grant gold AND XP, the
Blademaster's creep route is a dual-income stream: it converts combat time into both
economic acceleration (bounty gold) and hero power (XP toward levels 3 and 5). An
Orc coach tip about over-creeping or under-creeping should acknowledge that each camp
skipped is lost bounty gold that cannot be recovered, AND lost XP toward the hero
power spike. Conversely, a hero that has reached level 5 gains zero creep XP (see
`creeping.md`) — any camp time spent past that point returns only bounty gold, which
may not justify the risk and opportunity cost.
