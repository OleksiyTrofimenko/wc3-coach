# Ontology (reference)

Short human-readable cross-reference. The authoritative numbers live in Postgres
(owned by data-keeper / Archivist). All entries are patch-tagged.

**Patch baseline:** 2.0 (Reforged patch 2.00, build 6117).
**Provenance:** `community/liquipedia seed`, `verified: false`.
**DB location:** `packages/db/src/seed/ontology.<race>.json`

---

## Races

| Key      | Name      | Race letter (parser) |
|----------|-----------|----------------------|
| human    | Human     | H                    |
| orc      | Orc       | O                    |
| nightelf | Night Elf | N                    |
| undead   | Undead    | U                    |
| random   | Random    | R                    |
| neutral  | Neutral   | (none — Tavern heroes have no race letter in parser) |

The parser emits provisional refs like `race:O`; the resolver maps these using
`RACE_LETTER_MAP` in `packages/ontology/src/index.ts`.

**Neutral race:** covers Tavern heroes available to any race. The WC3 FourCC
naming convention uses `N` as the first character for neutral units/heroes
(e.g., `Nfir` = Firelord). This `N` prefix is a game-data convention, not a
race letter emitted by the parser. Neutral heroes are seeded in
`ontology.neutral.json`.

---

## Per entity, track

- **Units:** hp, mana, armor type+value, attack type, dps, gold, lumber, food, build time, tech req, fourcc
- **Buildings:** hp, armor, gold, lumber, build time, provides, fourcc
- **Heroes:** primary attr, base stats (str/agi/int + per-level), abilities (per level), fourcc
- **Upgrades:** per-level cost + research time + effect, fourcc
- **Creep camps:** position, difficulty, units, drops (per map) — NOT YET SEEDED

---

## Seeded entities (T2.2)

### Orc (`orc`) — fully seeded for NvO fixture

**Units (11):**

| Key              | FourCC | HP   | Armor | ArmorType  | AttackType | DPS | Gold | Lbr | Food | BuildTime |
|------------------|--------|------|-------|------------|------------|-----|------|-----|------|-----------|
| peon             | opeo   | 250  | 0     | unarmored  | normal     | 11  | 75   | 0   | 1    | 15        |
| grunt            | ogru   | 700  | 1     | heavy      | normal     | 27  | 200  | 0   | 3    | 22        |
| raider           | orai   | 650  | 1     | medium     | normal     | 22  | 180  | 40  | 3    | 27        |
| troll_headhunter | null   | 340  | 0     | medium     | pierce     | 17  | 135  | 10  | 2    | 22        |
| shaman           | null   | 290  | 0     | unarmored  | magic      | 13  | 135  | 20  | 2    | 22        |
| witch_doctor     | null   | 290  | 0     | unarmored  | magic      | 13  | 135  | 20  | 2    | 22        |
| tauren           | null   | 1200 | 3     | heavy      | siege      | 36  | 280  | 70  | 5    | 38        |
| spirit_walker    | null   | 500  | 1     | unarmored  | normal     | 18  | 195  | 35  | 3    | 30        |
| kodo_beast       | null   | 825  | 2     | heavy      | normal     | 23  | 255  | 60  | 4    | 37        |
| wind_rider       | null   | 500  | 1     | medium     | pierce     | 24  | 255  | 60  | 4    | 32        |
| demolisher       | null   | 525  | 5     | heavy      | siege      | 30  | 220  | 50  | 4    | 35        |

FourCCs `opeo`, `ogru`, `orai` confirmed from fixture `w3c-20260426112948.json`.

**Buildings (12):**

| Key               | FourCC | HP   | Gold | Lbr | BuildTime |
|-------------------|--------|------|------|-----|-----------|
| great_hall        | null   | 1500 | 385  | 185 | 100       |
| stronghold        | ostr   | 1800 | 215  | 135 | 60        |
| fortress          | null   | 2500 | 215  | 200 | 75        |
| altar_of_storms   | oalt   | 900  | 180  | 50  | 60        |
| orc_burrow        | otrb   | 500  | 160  | 40  | 35        |
| barracks          | obar   | 1100 | 180  | 0   | 60        |
| war_mill          | null   | 800  | 145  | 0   | 40        |
| voodoo_lounge     | ovln   | 750  | 145  | 0   | 40        |
| spirit_lodge      | null   | 1100 | 150  | 100 | 60        |
| beastiary         | obea   | 1100 | 140  | 140 | 60        |
| orc_watch_tower   | otto   | 500  | 60   | 0   | 20        |
| tauren_totem      | null   | 1100 | 150  | 125 | 60        |

FourCCs `oalt`, `otrb`, `obar`, `ovln`, `ostr`, `obea`, `otto` confirmed from fixture.

**Heroes (2 — only fixture-confirmed heroes seeded):**

| Key               | FourCC | Primary Attr | Str | Agi | Int | StrLvl | AgiLvl | IntLvl |
|-------------------|--------|--------------|-----|-----|-----|--------|--------|--------|
| blademaster       | Obla   | agi          | 17  | 21  | 13  | 1.5    | 2.75   | 1.5    |
| shadow_hunter     | Oshd   | agi          | 16  | 17  | 19  | 1.75   | 1.5    | 2.25   |

Far Seer (`Ofar`) and Tauren Chieftain (`Otch`) FourCCs are believed correct
but their base stats were not CASC-verified; they are omitted per Principle #4
until a fixture confirms them or CASC extraction is done.

**Hero abilities (fully seeded for Blademaster + Shadow Hunter):**

| Hero          | Ability Key             | FourCC | Notes                            |
|---------------|-------------------------|--------|----------------------------------|
| blademaster   | mirror_image            | AOmi   | fixture-confirmed                |
| blademaster   | wind_walk               | AOww   | NOT in fixture; FourCC inferred  |
| blademaster   | critical_strike         | AOcr   | fixture-confirmed                |
| blademaster   | bladestorm (ult)        | AObz   | NOT in fixture; FourCC inferred  |
| shadow_hunter | hex                     | AOhx   | fixture-confirmed                |
| shadow_hunter | serpent_ward            | null   | FourCC not yet confirmed         |
| shadow_hunter | healing_wave            | null   | FourCC not yet confirmed         |
| shadow_hunter | big_bad_voodoo (ult)    | null   | FourCC not yet confirmed         |

**Upgrades (7):**

| Key                          | FourCC | Levels | Notes                    |
|------------------------------|--------|--------|--------------------------|
| orc_melee_weapon_upgrade     | null   | 3      |                          |
| orc_armor_upgrade            | null   | 3      |                          |
| ensnare                      | Roen   | 1      | fixture-confirmed        |
| witch_doctor_adept_training  | Rowt   | 2      | fixture-confirmed        |
| troll_berserker_upgrade      | null   | 2      |                          |
| shaman_adept_training        | null   | 2      |                          |
| liquid_fire                  | null   | 1      |                          |

---

### Night Elf (`nightelf`) — fully seeded for NvO fixture

**Units (11):**

| Key                | FourCC | HP   | Armor | ArmorType  | AttackType | DPS | Gold | Lbr | Food | BuildTime |
|--------------------|--------|------|-------|------------|------------|-----|------|-----|------|-----------|
| wisp               | ewsp   | 120  | 0     | unarmored  | normal     | 6   | 60   | 0   | 1    | 5         |
| archer             | earc   | 255  | 0     | medium     | pierce     | 15  | 130  | 10  | 2    | 22        |
| huntress           | esen   | 525  | 1     | medium     | pierce     | 28  | 195  | 20  | 3    | 30        |
| dryad              | null   | 370  | 0     | medium     | magic      | 19  | 145  | 30  | 2    | 22        |
| druid_of_the_claw  | null   | 525  | 2     | heavy      | normal     | 22  | 175  | 40  | 3    | 30        |
| druid_of_the_talon | null   | 290  | 0     | unarmored  | magic      | 15  | 155  | 20  | 2    | 22        |
| mountain_giant     | null   | 2100 | 10    | heavy      | siege      | 40  | 300  | 80  | 7    | 48        |
| faerie_dragon      | null   | 350  | 0     | unarmored  | magic      | 20  | 155  | 25  | 2    | 22        |
| hippogryph         | null   | 500  | 0     | medium     | pierce     | 26  | 250  | 60  | 4    | 32        |
| chimaera           | null   | 950  | 3     | heavy      | siege      | 43  | 340  | 155 | 6    | 48        |
| glaive_thrower     | null   | 475  | 5     | heavy      | siege      | 35  | 215  | 50  | 4    | 35        |

FourCCs `ewsp`, `earc`, `esen` confirmed from fixture.

**Buildings (12):**

| Key                  | FourCC | HP   | Gold | Lbr | BuildTime |
|----------------------|--------|------|------|-----|-----------|
| tree_of_life         | null   | 2400 | 350  | 185 | 100       |
| tree_of_ages         | null   | 2800 | 200  | 125 | 60        |
| tree_of_eternity     | null   | 3600 | 200  | 175 | 75        |
| altar_of_elders      | eaom   | 900  | 180  | 50  | 60        |
| moon_well            | emow   | 400  | 180  | 40  | 35        |
| ancient_of_war       | eate   | 1400 | 150  | 0   | 60        |
| ancient_of_lore      | edob   | 1400 | 150  | 65  | 60        |
| ancient_of_claw      | null   | 1400 | 145  | 65  | 60        |
| ancient_of_wind      | null   | 1400 | 150  | 65  | 60        |
| ancient_of_wonders   | null   | 1200 | 175  | 150 | 75        |
| ancient_protector    | etrp   | 700  | 75   | 50  | 25        |
| hunters_hall         | null   | 1100 | 145  | 0   | 40        |

FourCCs `eaom`, `emow`, `eate`, `edob`, `etrp` confirmed from fixture.

**Heroes (0 — race heroes not seeded for this fixture):**

No Night Elf race heroes are seeded. The FourCCs for Night Elf race heroes
(Keeper of the Grove, Priestess of the Moon, Demon Hunter, Warden) are not
confirmed from this fixture and their stats were not CASC-verified. They will
be seeded when a fixture containing them is available.

**CORRECTION NOTE (T2.2 audit):** The fixture hero `Nfir` was previously
mis-labeled as "Keeper of the Grove". This is WRONG. `Nfir` is the **Firelord**,
a neutral Intelligence Tavern hero. The `N` prefix in `Nfir` means Neutral in
WC3's internal naming convention, not Night Elf. The Firelord was purchased
from a Tavern by the Night Elf player in this fixture. The Firelord and its
abilities are now correctly seeded under the `neutral` race — see below.

**Upgrades (6):**

| Key                    | FourCC | Levels |
|------------------------|--------|--------|
| ne_melee_weapon_upgrade| null   | 3      |
| ne_ranged_weapon_upgrade| null  | 3      |
| ne_armor_upgrade       | null   | 3      |
| moon_armor             | null   | 2      |
| improved_bows          | null   | 1      |
| archer_adept_training  | null   | 2      |

---

### Neutral (`neutral`) — Tavern heroes

**Heroes (1):**

| Key       | FourCC | Primary Attr | Str | Agi | Int | StrLvl | AgiLvl | IntLvl | Notes |
|-----------|--------|--------------|-----|-----|-----|--------|--------|--------|-------|
| firelord  | Nfir   | int          | 18  | 12  | 24  | 1.5    | 1.0    | 3.0    | fixture-confirmed; stats from community reference |

**Firelord abilities (fixture-confirmed):**

| Hero      | Ability Key       | FourCC | Notes                                                      |
|-----------|-------------------|--------|------------------------------------------------------------|
| firelord  | summon_lava_spawn | ANlm   | Fixture-confirmed; Summons Lava Spawn (splits on death)    |
| firelord  | incinerate        | ANia   | Fixture-confirmed; Passive burn on attacks                 |

The `N` in `Nfir` is WC3's internal neutral prefix. The `N` race letter the
parser emits (e.g., `race:N`) maps to `nightelf`, not to neutral — these are
different namespaces. Neutral Tavern heroes have no parser race-letter; they
are referenced directly by FourCC (e.g., `hero:Nfir`).

---

### Human (`human`) — TODO

Stub only. Human FourCCs are not required for the NvO fixture tests.
Seed when a Human-race fixture is available.

### Undead (`undead`) — TODO

Stub only. Undead FourCCs not required for NvO fixture tests.
Seed when an Undead-race fixture is available.

---

## Known-unresolved FourCCs (intentionally omitted from seed)

| FourCC | Entity type | Reason                                                     |
|--------|-------------|------------------------------------------------------------|
| hslv   | item        | Scroll of Speed — items table not yet in schema (TODO T2.x)|
| plcl   | item        | Potion of Clarity — same as above                          |

---

## FourCC resolver

**Pure resolver:** `packages/ontology/src/index.ts` — `resolveEntityRef(ref, lookup)`
**DB-backed resolver:** `packages/db/src/resolve.ts` — `loadFourccMaps(db)`, `resolveReplayRefs(db, replayId, lookup)`
**Race letter map:** `RACE_LETTER_MAP` in `packages/ontology/src/index.ts`

---

## Armor type × Attack type interaction matrix (patch 2.0)

| Attack Type \ Armor | unarmored | light | medium | heavy | fort  | hero  | divine | none  |
|---------------------|-----------|-------|--------|-------|-------|-------|--------|-------|
| normal              | 1.00      | 1.00  | 1.50   | 0.70  | 0.70  | 1.00  | 1.00   | 1.00  |
| pierce              | 1.50      | 1.00  | 0.75   | 0.50  | 0.35  | 0.50  | 0.50   | 1.00  |
| siege               | 0.70      | 1.00  | 0.50   | 1.00  | 1.50  | 0.50  | 0.50   | 1.00  |
| magic               | 1.00      | 1.25  | 0.75   | 0.50  | 1.00  | 0.50  | 0.33   | 1.00  |
| chaos               | 1.00      | 1.00  | 1.00   | 1.00  | 1.00  | 1.00  | 0.33   | 1.00  |
| hero                | 1.00      | 1.00  | 1.00   | 0.50  | 0.50  | 1.00  | 0.50   | 1.00  |
| spells              | 1.00      | 1.00  | 1.00   | 1.00  | 1.00  | 1.00  | 0.33   | 1.00  |

Multipliers approximate — exact values should be verified via CASC extraction (TODO T2.3).

---

> Seeded by Archivist in T2.2. DB is authoritative for numbers. This file is a human cross-reference only.
