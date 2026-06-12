# Hero Progression Reference

Hero experience curve, derived-stat model, per-level attribute growth, and Altar
revive costs. The LLM coach reads this to explain hero-power trajectories, the
cost of feeding a hero to the enemy, and why level-5 and level-10 are hard
strategic inflection points.

**Patch baseline:** 2.0 (Reforged patch 2.00, build 6117). TFT values carry
forward unless a specific balance change is noted.
**Provenance:** Warcraft Wiki, Liquipedia, classic.battle.net official docs.
`verified: community` for all figures unless marked otherwise.
**Research method:** deep-research pass with 3-vote adversarial verification
(2026-06-12, batch-2). Batch-1 of the same session incorrectly refuted the
formula `XP_to_reach(L) = 50*(L^2 + L - 2)`. Batch-2 corrected this: the
formula is algebraically identical to the recurrence `XP(L) = XP(L-1) + 100*L`
at every level and matches Liquipedia's published table exactly. Both the table
and the formula are used below; they are one and the same thing.
**Scope:** Orc-POV coaching. All "why it matters" notes are written for an Orc player.

Sources used throughout:
- https://warcraft.wiki.gg/wiki/Hero_(Warcraft_III)
- https://liquipedia.net/warcraft/Experience
- https://liquipedia.net/warcraft/Hero
- http://classic.battle.net/war3/basics/heroes.shtml
- http://classic.battle.net/war3/orc/units/taurenchieftain.shtml
- https://warcraft.wiki.gg/wiki/Tauren_Chieftain_(Warcraft_III)
- https://liquipedia.net/warcraft/Altar

---

## Hero Experience Curve

Cumulative XP required to REACH each level. Level 1 begins at 0 XP; the hero
starts the game at level 1 and levels up when cumulative XP crosses the threshold
for the next level. Max hero level in standard melee is 10.

| Level | Cumulative XP to reach | XP increment from previous level |
|-------|------------------------|-----------------------------------|
| 1     | 0                      | —                                 |
| 2     | 200                    | 200                               |
| 3     | 500                    | 300                               |
| 4     | 900                    | 400                               |
| 5     | 1 400                  | 500                               |
| 6     | 2 000                  | 600                               |
| 7     | 2 700                  | 700                               |
| 8     | 3 500                  | 800                               |
| 9     | 4 400                  | 900                               |
| 10    | 5 400                  | 1 000                             |

**Closed-form formula:** `XP_to_reach(L) = 50 * (L^2 + L - 2)`

This is identical to the recurrence `XP(L) = XP(L-1) + 100*L` (each level costs
exactly 100 × that level number in XP). Both forms are verified correct and produce
the table above exactly.

`verified: community` (Warcraft Wiki + Liquipedia; 3-0 adversarial vote, batch-2)

**Shape note:** The increment grows by 100 XP per level. The largest early-game
jump is L4 → L5 (500 XP), which is 25 % more than the L3 → L4 jump. L9 → L10
requires 1 000 XP — five times the cost of L1 → L2.

**Why it matters (Orc POV):** The L4 → L5 threshold (500 XP increment) is the
hardest jump in the early game and the reason the `hero_level5_timing` benchmark
uses ~8:00 as its reference. To cross that threshold the hero needs roughly 2–3
medium creep camps worth of XP after level 4 (accounting for the level-based XP
reduction; see `creeping.md`). A player who stalls creeping between levels 4 and 5
— perhaps base-defending instead of routing efficiently — will hit this wall. Every
100 XP short of 1 400 is a measurable gap the coach can attribute to specific camp
skips or routing inefficiency.

---

## Derived Stats (per attribute point)

Each attribute point grants a fixed bonus. The hero's PRIMARY attribute (Strength,
Agility, or Intelligence — hero-specific) also adds +1 base attack damage per point
on top of its normal effect. Non-primary attributes give no damage bonus.

| Attribute     | Bonus per point        | Additional notes                                                                                      |
|---------------|------------------------|-------------------------------------------------------------------------------------------------------|
| Strength      | +25 max HP             | Also: +0.05 HP regen/sec per point                                                                    |
| Intelligence  | +15 max mana           | Also: +0.05 mana regen/sec per point                                                                  |
| Agility       | +0.30 armor            | Also: +2 % faster attack speed per point. The in-game display rounds to "3 Agi = 1 armor" — the engine uses 0.30/point, not 0.33. The "+2 % attack speed" means 2 % FASTER attacks (shorter cooldown), NOT a flat −0.02 s reduction. |
| Primary attr  | +1 base attack damage  | On top of the stat's normal bonus (above). Applies only to the hero's designated primary attribute.   |

`verified: community` (Battle.net official hero docs + Warcraft Wiki + Liquipedia; 3-0 adversarial vote)

**Rounding caveat:** The "+0.30 armor per Agility" value is what the engine
computes. The tooltip or in-game display commonly shows "3 Agility grants 1 armor"
because the UI rounds. Do not use the rounded value in calculations — use 0.30.

**Why it matters (Orc POV):** The Tauren Chieftain and Blademaster are the two
most common Orc main heroes. The TC is a Strength hero — every Strength point from
items or level-ups adds +25 HP AND +1 damage. The BM is an Agility hero — every
Agility point adds +0.30 armor AND +1 damage AND 2 % attack speed. This is why a
BM who finds an Agility item (e.g., Claws of Attack, Gloves of Haste) or levels up
quickly gains attack speed AND damage AND survivability simultaneously. The coach
should distinguish between "hero power spike from level-up" (primary attribute
grows) and "hero power spike from items" — both feed through this model.

---

## Per-Level Attribute Growth

Each hero has its own fixed growth rates for all three attributes, applied on every
level-up. The HP and mana gains per level follow directly from the per-attribute
bonuses above.

**Verified example — Tauren Chieftain (Orc, Strength primary):**

| Attribute   | Growth per level | Derived effect per level                              |
|-------------|------------------|-------------------------------------------------------|
| Strength    | +3.2             | +80 max HP (+3.2 × 25) + +0.16 HP regen/s + +3.2 dmg |
| Agility     | +1.5             | +0.45 armor + 3 % attack speed                        |
| Intelligence| +1.3             | +19.5 max mana + +0.065 mana regen/s                  |

Sources: http://classic.battle.net/war3/orc/units/taurenchieftain.shtml ,
https://warcraft.wiki.gg/wiki/Tauren_Chieftain_(Warcraft_III)
`verified: community` (3-0 adversarial vote)

**Growth rates for all other heroes (Blademaster, Far Seer, Shadow Hunter, and
all non-Orc heroes) were NOT pulled in this research pass.** Do not use the TC
numbers as a proxy. `verified: false (not yet seeded — add per-hero rows from
Warcraft Wiki or CASC in a future pass)`

**Why it matters (Orc POV):** The TC's +80 HP per level means that a level-5 TC
has roughly 400 HP more than a level-1 TC from Strength growth alone (before base
HP or items). Feeding a level-5 TC to the enemy means the Orc player is paying
340 gold (L5 revive cost) to bring back a hero who cannot be replaced by a fresh
summon at the Altar. The cumulative attribute gap between a living level-5 and a
fresh level-1 is enormous — the coach should quantify this when flagging "hero death
at level 5+" as a critical deviation.

---

## Hero Revive (Altar)

When a hero dies it must be revived at the race's Altar building. Revive cost and
time scale with hero level.

### Revive gold cost by level

| Level | Gold cost | Lumber cost |
|-------|-----------|-------------|
| 1     | 170       | 0           |
| 2     | 210       | 0           |
| 3     | 255       | 0           |
| 4     | 295       | 0           |
| 5     | 340       | 0           |
| 6     | 380       | 0           |
| 7     | 425       | 0           |
| 8     | 465       | 0           |
| 9     | 510       | 0           |
| 10    | 550       | 0           |

Lumber cost is 0 for standard heroes whose base gold cost is the 425-gold
benchmark. The gold cap at patch-2.0 baseline is 550 (level 10).

**PATCH FLAG:** A later balance patch (post-2.0 baseline) reportedly raised the
gold cap to 700. The specific patch version is not confirmed in this research pass.
`verified: community (medium confidence — single Liquipedia source + formula
reconciliation; patch cap raise not independently confirmed)`

### Revive time by level

| Level  | Revive time |
|--------|-------------|
| 1      | 36 s        |
| 2      | 72 s        |
| 3      | 107 s       |
| 4 – 10 | 110 s (hard cap) |

Formula: `55 * level * 0.65`, capped at 110 s.

`verified: community (medium confidence — single Liquipedia source + formula
reconciliation)`

**Why it matters (Orc POV):** Three compound penalties hit when a high-level hero
dies: (1) gold cost climbs steeply — a level-7 revive costs 425 gold, 2.5 × the
level-1 cost; (2) the revive timer is 110 s from level 3 onward, nearly two minutes
of absent hero; (3) the enemy carries momentum from the kill. Together these make
feeding a level-6+ hero to the opponent potentially game-deciding. The coach should
flag hero death at level 5 or above as a HIGH-weight deviation: the enemy gains XP
toward their own next level, the Orc loses 380–550 gold, and the Altar is locked for
up to 110 s. "Do not feed the hero" is not just a cultural norm — the numbers justify it.

---

## Tier Upgrades (cross-reference)

Town Hall tier upgrades (Great Hall → Stronghold → Fortress for Orc) are not
independently verified in this research pass. The Liquipedia Town Hall page omits
exact upgrade costs and times.

**Orc tier-upgrade costs (community seed, unverified):** The current values in
`ontology.md` are:
- Great Hall → Stronghold: 215 gold / 135 lumber / 60 s build time
- Stronghold → Fortress: 215 gold / 200 lumber / 75 s build time

These come from the ontology community seed (`verified: false` in that file).
Full per-race tier-upgrade costs for Human, Night Elf, and Undead have NOT been
seeded and should not be invented. In-game or CASC confirmation of all four races'
tier costs is an open follow-up.

`verified: false (community seed — needs in-game or CASC confirmation for Orc;
Human/NE/UD costs not seeded at all)`

**Why it matters (Orc POV):** Stronghold at 215 gold / 135 lumber is the Orc T2
gate. If the lumber figure is off by even 20, the T2-timing benchmark could
misidentify a lumber-stall as a decision error. CASC confirmation is therefore
a prerequisite before the benchmark engine uses these numbers to compute deviations
in a live analysis.
