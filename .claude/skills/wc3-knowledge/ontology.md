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

### Human (`human`) — fully seeded (opponent data for OvH)

**Provenance:** `community/liquipedia seed`, `verified: false`, patch 2.0. FourCCs
are `null` (no Human fixture run through the resolver yet — fill after CASC or a
Human replay). Mirrors `packages/db/src/seed/ontology.human.json` exactly. Note
the barracks key is `human_barracks` (renamed to avoid a global-key collision
with Orc's `barracks`).

**Units (12):**

| Key              | FourCC | HP   | Armor | ArmorType | AttackType | DPS | Gold | Lbr | Food | BuildTime |
|------------------|--------|------|-------|-----------|------------|-----|------|-----|------|-----------|
| peasant          | null   | 250  | 0     | unarmored | normal     | 11  | 75   | 0   | 1    | 15        |
| footman          | null   | 420  | 2     | heavy     | normal     | 16  | 135  | 0   | 2    | 20        |
| rifleman         | null   | 505  | 0     | medium    | pierce     | 21  | 205  | 30  | 3    | 28        |
| knight           | null   | 825  | 5     | heavy     | normal     | 37  | 245  | 60  | 4    | 36        |
| priest           | null   | 305  | 0     | unarmored | magic      | 13  | 135  | 10  | 2    | 22        |
| sorceress        | null   | 275  | 0     | unarmored | magic      | 12  | 155  | 20  | 2    | 22        |
| spell_breaker    | null   | 625  | 3     | heavy     | normal     | 25  | 215  | 30  | 3    | 30        |
| mortar_team      | null   | 360  | 0     | unarmored | siege      | 28  | 180  | 70  | 3    | 30        |
| flying_machine   | null   | 280  | 2     | medium    | pierce     | 17  | 135  | 20  | 2    | 22        |
| gryphon_rider    | null   | 800  | 3     | heavy     | normal     | 44  | 280  | 70  | 5    | 40        |
| dragonhawk_rider | null   | 575  | 1     | medium    | pierce     | 26  | 255  | 45  | 4    | 35        |
| siege_engine     | null   | 525  | 5     | heavy     | siege      | 32  | 195  | 60  | 4    | 35        |

**Buildings (16):**

| Key             | FourCC | HP   | Gold | Lbr | BuildTime |
|-----------------|--------|------|------|-----|-----------|
| town_hall       | null   | 1800 | 385  | 185 | 100       |
| keep            | null   | 2400 | 215  | 135 | 60        |
| castle          | null   | 3000 | 215  | 200 | 75        |
| altar_of_kings  | null   | 900  | 180  | 50  | 60        |
| farm            | null   | 500  | 80   | 20  | 30        |
| human_barracks  | null   | 1100 | 160  | 0   | 60        |
| lumber_mill     | null   | 800  | 120  | 0   | 40        |
| blacksmith      | null   | 1100 | 140  | 0   | 60        |
| workshop        | null   | 1100 | 200  | 80  | 60        |
| arcane_sanctum  | null   | 1100 | 150  | 100 | 60        |
| gryphon_aviary  | null   | 1100 | 150  | 100 | 60        |
| arcane_vault    | null   | 800  | 150  | 30  | 40        |
| scout_tower     | null   | 200  | 30   | 20  | 15        |
| guard_tower     | null   | 500  | 60   | 20  | 20        |
| cannon_tower    | null   | 500  | 90   | 60  | 25        |
| arcane_tower    | null   | 500  | 60   | 20  | 20        |

Town Hall → Keep → Castle are the T1/T2/T3 tiers (the upgrade costs equal the
Keep/Castle gold/lumber/time rows above). Scout Tower upgrades in place into
Guard/Cannon/Arcane Tower.

**Heroes (4):**

| Key           | FourCC | Primary Attr | Str | Agi | Int | StrLvl | AgiLvl | IntLvl |
|---------------|--------|--------------|-----|-----|-----|--------|--------|--------|
| paladin       | null   | str          | 22  | 12  | 18  | 3.0    | 1.25   | 1.75   |
| archmage      | null   | int          | 14  | 14  | 27  | 1.5    | 1.5    | 3.0    |
| mountain_king | null   | str          | 25  | 14  | 16  | 3.0    | 1.5    | 1.5    |
| blood_mage    | null   | int          | 16  | 13  | 21  | 1.5    | 1.5    | 3.0    |

**Hero abilities (key effects, level 1 unless ultimate):**

| Hero          | Ability Key            | Name                  | Key effect (L1)                                        |
|---------------|------------------------|-----------------------|--------------------------------------------------------|
| paladin       | holy_light             | Holy Light            | Heal 200 HP / 100 dmg to undead                        |
| paladin       | divine_shield          | Divine Shield         | Invulnerable 5s                                        |
| paladin       | devotion_aura          | Devotion Aura         | Passive +1 armor to nearby ground units               |
| paladin       | resurrection (ult)     | Resurrection          | Revive up to 6 dead friendly units                    |
| archmage      | blizzard               | Blizzard              | AoE 60 DPS + slow                                      |
| archmage      | summon_water_elemental | Summon Water Elemental| Summons 500 HP elemental, 60s                          |
| archmage      | brilliance_aura        | Brilliance Aura       | Passive +0.75 mana regen/s nearby                     |
| archmage      | mass_teleport (ult)    | Mass Teleport         | Teleport up to 5 units to an ally                     |
| mountain_king | storm_bolt             | Storm Bolt            | 175 dmg + 3s stun                                      |
| mountain_king | thunder_clap           | Thunder Clap          | 60 dmg AoE + 50% slow                                 |
| mountain_king | bash                   | Bash                  | Passive 15% chance: +25 dmg + 1s stun                 |
| mountain_king | avatar (ult)           | Avatar                | +500 HP, +10 dmg, +3 armor, spell immune 20s          |
| blood_mage    | flame_strike           | Flame Strike          | 90 DPS AoE ground, 3s                                 |
| blood_mage    | banish                 | Banish                | Ethereal 7s: +66% magic dmg taken, can't attack       |
| blood_mage    | siphon_mana            | Siphon Mana           | Drains 50 mana/s for 8s                               |
| blood_mage    | phoenix (ult)          | Phoenix               | Summons Phoenix, 75 DPS splash                        |

**Upgrades (10):**

| Key                       | FourCC | Levels | Notes (L1 effect)                                        |
|---------------------------|--------|--------|----------------------------------------------------------|
| iron_forged_swords        | null   | 3      | +melee attack damage (Footmen, Knights)                  |
| studded_leather_armor     | null   | 3      | +armor for ground melee units                            |
| black_gunpowder           | null   | 3      | +ranged attack damage (Riflemen)                         |
| defend                    | null   | 1      | Footman Defend: −50% pierce damage taken                 |
| masonry                   | null   | 3      | +HP and +armor for Human buildings                       |
| improved_masonry          | null   | 1      | Allows Farms → Improved Farms                            |
| priest_adept_training     | null   | 2      | Adept/Master Priest (Dispel Magic / Inner Fire)          |
| sorceress_adept_training  | null   | 2      | Adept/Master Sorceress (Slow / Invisibility)             |
| magic_sentry              | null   | 1      | Priests reveal nearby invisible units                    |
| animal_war_training       | null   | 1      | +100 Gryphon HP + chain-lightning attack                 |

---

### Undead (`undead`) — fully seeded (opponent data for OvUD)

**Provenance:** `community/liquipedia seed`, `verified: false`, patch 2.0. FourCCs
`null` pending CASC/fixture. Mirrors `packages/db/src/seed/ontology.undead.json`
exactly. DPS are approximate averages (rounded). Skeleton Warrior, Destroyer
(morph of Obsidian Statue), and Shade have gold/food/buildTime 0 because they are
summoned/morphed (no distinct training cost). Shade DPS 0 (detector, no attack).

**Units (13):**

| Key             | FourCC | HP   | Armor | ArmorType | AttackType | DPS | Gold | Lbr | Food | BuildTime |
|-----------------|--------|------|-------|-----------|------------|-----|------|-----|------|-----------|
| acolyte         | null   | 250  | 0     | unarmored | normal     | 11  | 75   | 0   | 1    | 15        |
| ghoul           | null   | 340  | 1     | medium    | normal     | 19  | 120  | 0   | 2    | 20        |
| crypt_fiend     | null   | 500  | 1     | medium    | pierce     | 23  | 215  | 40  | 3    | 28        |
| gargoyle        | null   | 400  | 1     | medium    | pierce     | 20  | 165  | 30  | 3    | 27        |
| necromancer     | null   | 290  | 0     | unarmored | magic      | 13  | 145  | 20  | 2    | 22        |
| banshee         | null   | 240  | 0     | unarmored | magic      | 11  | 155  | 25  | 2    | 22        |
| meat_wagon      | null   | 345  | 5     | heavy     | siege      | 28  | 230  | 65  | 4    | 35        |
| abomination     | null   | 1200 | 3     | heavy     | normal     | 38  | 250  | 60  | 5    | 38        |
| obsidian_statue | null   | 700  | 5     | heavy     | magic      | 22  | 230  | 50  | 3    | 30        |
| frost_wyrm      | null   | 1500 | 3     | heavy     | siege      | 61  | 385  | 185 | 7    | 65        |
| destroyer       | null   | 900  | 5     | heavy     | magic      | 52  | 0    | 0   | 0    | 0         |
| shade           | null   | 300  | 0     | unarmored | normal     | 0   | 150  | 0   | 2    | 20        |
| skeleton_warrior| null   | 225  | 1     | light     | normal     | 15  | 0    | 0   | 0    | 0         |

**Buildings (14):**

| Key                  | FourCC | HP   | Gold | Lbr | BuildTime |
|----------------------|--------|------|------|-----|-----------|
| necropolis           | null   | 1500 | 385  | 185 | 100       |
| halls_of_the_dead    | null   | 1800 | 215  | 135 | 60        |
| black_citadel        | null   | 2500 | 215  | 200 | 75        |
| altar_of_darkness    | null   | 900  | 180  | 50  | 60        |
| crypt                | null   | 1100 | 150  | 0   | 60        |
| graveyard            | null   | 800  | 145  | 0   | 40        |
| tomb_of_relics       | null   | 750  | 145  | 0   | 40        |
| slaughterhouse       | null   | 1100 | 150  | 100 | 60        |
| temple_of_the_damned | null   | 1100 | 150  | 100 | 60        |
| boneyard             | null   | 1100 | 150  | 125 | 60        |
| sacrificial_pit      | null   | 750  | 100  | 50  | 40        |
| ziggurat             | null   | 550  | 160  | 40  | 35        |
| spirit_tower         | null   | 550  | 60   | 20  | 20        |
| nerubian_tower       | null   | 550  | 40   | 80  | 20        |

Necropolis → Halls of the Dead → Black Citadel are the T1/T2/T3 tiers. Spirit
Tower and Nerubian Tower are in-place morphs of the Ziggurat.

**Heroes (4):**

| Key         | FourCC | Primary Attr | Str | Agi | Int | StrLvl | AgiLvl | IntLvl |
|-------------|--------|--------------|-----|-----|-----|--------|--------|--------|
| death_knight| null   | str          | 21  | 15  | 16  | 3.0    | 1.5    | 1.75   |
| lich        | null   | int          | 14  | 13  | 21  | 1.75   | 1.5    | 3.0    |
| dreadlord   | null   | str          | 19  | 15  | 18  | 2.75   | 1.5    | 2.0    |
| crypt_lord  | null   | str          | 22  | 13  | 15  | 3.0    | 1.25   | 1.75   |

**Hero abilities (key effects, level 1 unless ultimate):**

| Hero        | Ability Key          | Name             | Key effect (L1)                                          |
|-------------|----------------------|------------------|----------------------------------------------------------|
| death_knight| death_coil           | Death Coil       | 100 dmg to enemy / heal 200 friendly undead              |
| death_knight| death_pact           | Death Pact       | Sacrifice friendly undead → 50% of its HP to DK          |
| death_knight| unholy_aura          | Unholy Aura      | Passive move speed + HP regen to nearby units            |
| death_knight| animate_dead (ult)   | Animate Dead     | Raise 6 corpses as invulnerable skeletons, 40s           |
| lich        | frost_nova           | Frost Nova       | 100 dmg target + 75 AoE + slow                           |
| lich        | frost_armor          | Frost Armor      | +3 armor + slows melee attackers                         |
| lich        | dark_ritual          | Dark Ritual      | Sacrifice undead → 33% of its HP to Lich mana            |
| lich        | death_and_decay (ult)| Death and Decay  | AoE 4% max HP/s for 35s                                  |
| dreadlord   | carrion_swarm        | Carrion Swarm    | 75 dmg to all enemies in a line                          |
| dreadlord   | sleep                | Sleep            | Puts a target enemy unit to sleep                        |
| dreadlord   | vampiric_aura        | Vampiric Aura    | Passive 15% lifesteal for nearby friendly melee          |
| dreadlord   | inferno (ult)        | Inferno          | Summon Infernal: 100 AoE dmg + 3s stun on landing        |
| crypt_lord  | impale               | Impale           | 75 dmg + stun, throws units up in a line                 |
| crypt_lord  | spiked_carapace      | Spiked Carapace  | Passive +3 armor + 10% melee damage return               |
| crypt_lord  | carrion_beetles      | Carrion Beetles  | Summons Scarab Beetle from a corpse (up to 2)            |
| crypt_lord  | locust_swarm (ult)   | Locust Swarm     | Swarm: 290 total dmg + lifesteal to Crypt Lord           |

**Upgrades (12):**

| Key                        | FourCC | Levels | Notes (L1 effect)                                    |
|----------------------------|--------|--------|------------------------------------------------------|
| unholy_strength            | null   | 3      | +melee attack damage (Ghouls, Abominations)          |
| creature_carapace          | null   | 3      | +armor for all Undead units                          |
| creature_attack            | null   | 3      | +ranged attack damage (Crypt Fiends, Gargoyles)      |
| web                        | null   | 1      | Crypt Fiend Web: bind & ground air units             |
| burrow                     | null   | 1      | Ghouls/Acolytes burrow underground (invisible)       |
| cannibalize                | null   | 1      | Ghouls consume a corpse to restore HP                |
| ghoul_frenzy               | null   | 1      | +20% Ghoul attack speed + HP regen                   |
| necromancer_adept_training | null   | 2      | Adept/Master Necromancer (unlocks Cripple)           |
| banshee_adept_training     | null   | 2      | Adept/Master Banshee (unlocks Curse)                 |
| skeletal_mastery           | null   | 1      | Necromancers raise up to 3 skeletons per cast        |
| stone_form                 | null   | 1      | Gargoyle Stone Form (invulnerable statue)            |
| freezing_breath            | null   | 1      | Frost Wyrms permanently slow buildings they attack   |

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
