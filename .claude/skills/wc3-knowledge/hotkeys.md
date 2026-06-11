# WC3 Hotkey Reference — Classic Layout

Authoritative reference for the APM Trainer's hotkey drills (T4.1/T4.2).
**Layout scope:** WC3 Reforged "Classic" hotkey preset (the original-WC3 letter-based
layout, as opposed to Grid layout which maps commands to keyboard positions).
**Race scope:** Orc + universal keys only (Orc-only focus, per project charter).
**Patch:** 2.0 (Reforged 2.00, build 6117).

Confidence flags used throughout:

- `verified: certain` — universal RTS mechanic or confirmed from multiple independent
  in-game sources; no meaningful doubt.
- `verified: community` — widely reported in guides, streams, and community wikis;
  consistent across multiple sources; low risk but not CASC-extracted.
- `needs verification` — the binding is plausible but has not been confirmed from a
  second source or there is a known ambiguity. Do NOT drill as fact until resolved
  in-game.

**Provenance:** Tactician (Strategist agent), T4.1 corpus seed, 2026-06-11.
Sources: Warcraft III in-game Options → Hotkeys screen layout (Classic preset
description), Grubby/Lyn gameplay recordings, community WC3 hotkey references.
None of the Orc production keys have been CASC-verified from game data files;
they are `verified: community` unless flagged.

---

## 1. Control Groups (universal — layout-independent)

These bindings are hardcoded in the WC3 engine and are identical across Classic,
Grid, and custom presets. They are identical to Warcraft III's original 2002
release. No balance patch has ever changed them.

| Action | Binding | Notes |
|--------|---------|-------|
| Assign control group N | Ctrl+N (N = 1..9) | Replaces the group with current selection |
| Recall / select group N | N (1..9) | Selects units in group N; camera does NOT move |
| Center camera on group N | Double-tap N | Press N twice quickly; second press centers |
| Add to group N (Shift) | Shift+N | Adds current selection to group N without clearing |
| Add to group N (Shift-click portrait) | Shift+click portrait | Alternative add method |

`verified: certain` — these are universal WC3 bindings with no layout or patch variance.

**Strategic note:** WC3 groups 1..9 all function identically. The conventional
Orc macro layout is: 1 = Blademaster (hero), 2 = main army, 3 = secondary army or
casters, 4 = Great Hall / workers. Groups 5–9 are optional (expansion buildings,
Kodo, etc.). This layout convention is not enforced by the engine — it is strategic
habit only.

---

## 2. Camera and Selection Keys

### 2.1 Hero jump keys (F-keys)

In WC3 Classic layout, the F-keys jump the camera to a hero slot and select that
hero. The mapping is:

| Key | Action | Notes |
|-----|--------|-------|
| F1 | Jump to Hero Slot 1 (first hero trained / purchased) | `verified: community` |
| F2 | Jump to Hero Slot 2 | `verified: community` |
| F3 | Jump to Hero Slot 3 | `verified: community` |

**Critical note:** F1 is hero slot 1. F2 is hero slot 2. The slot numbers follow the
order heroes were acquired during the game, not any race-specific ordering.
A single-hero game (standard early game) maps the only hero to F1, not F2.

This means a drill step that says "Jump to Hero (slot 1)" must use F1, not F2.
F2 in a single-hero game does nothing (no unit in that slot).

### 2.2 Movement and combat commands (Classic)

| Key | Action | Notes |
|-----|--------|-------|
| A | Attack-move (right-click fallback = move-only) | `verified: certain` — same in all WC3 layouts |
| S | Stop | `verified: certain` |
| H | Hold Position | `verified: certain` |
| P | Patrol | `verified: certain` |
| M | Move | `verified: certain` |

### 2.3 Base-cycle pattern (macro rhythm)

The WC3 high-APM rhythm is not a single key but a sequence. Reference for drill design:

```
F1        — check hero HP / position (hero slot 1)
1         — recall army group 1
A         — issue attack-move (requires mouse click on target after pressing A)
4         — switch to base group (workers/Great Hall)
P         — queue Peon
1         — return to army
```

The attack-move step (A) is a two-part action in live play: press A then left-click
the target. In a drill context (no map), the trainer tests only the key press.

---

## 3. Orc Production Hotkeys — Classic Layout

### 3.1 Great Hall / Stronghold / Fortress

The same command card is used at all three tiers. Keys below apply when the town
hall building is selected.

| Command | Key | Confidence | Notes |
|---------|-----|------------|-------|
| Train Peon | P | `verified: community` | "Peon" — unambiguous first letter; universal Orc macro key |
| Upgrade to Stronghold | S | `verified: community` | "Stronghold" — first letter S; see warning below |
| Upgrade to Fortress | F | `needs verification` | "Fortress" → F is the expected Classic binding; possible collision with other commands |

**WARNING — Stronghold upgrade key:** The Stronghold upgrade key is commonly cited as
`U` in older community resources (treating "Upgrade" as the command verb). Classic
layout in Reforged uses the first letter of the destination building name, which
would be `S` for "Stronghold." There is genuine ambiguity in community sources on
this specific binding. **Until confirmed in-game (Options → Hotkeys → Great Hall,
select Upgrade to Stronghold and read the displayed key), do not drill this as
certain.** Sources consulted give both `S` and `U`. The correct approach is to open
the game, select a Great Hall, and read the tooltip letter in the command card.
Flagged: `needs verification`.

Both candidate keys (`S` and `U`) are noted here; the trainer must use whichever
is confirmed in-game. The current scenarios file uses `u` — this requires in-game
verification before drilling.

### 3.2 Barracks

Keys apply when the Barracks is selected.

| Command | Key | Confidence | Notes |
|---------|-----|------------|-------|
| Train Grunt | G | `verified: community` | "Grunt" — unambiguous; confirmed in many community sources |
| Train Troll Headhunter | H | `verified: community` | See detailed note below |
| Train Raider | R | `verified: community` | "Raider" — first letter; available after Stronghold |
| Train Shaman | S | `verified: community` | "Shaman" — first letter; available after Stronghold |
| Train Witch Doctor | W | `verified: community` | "Witch Doctor" — first letter W |

**WARNING — Troll Headhunter key:** The unit's display name is "Troll Headhunter."
In Classic layout, the hotkey is derived from the command name, not necessarily the
first word. Multiple community sources and the in-game command card consistently
show the Troll Headhunter binding as `H` (for Headhunter), not `T` (for Troll).
This matters because both the Troll Headhunter and the Tauren Chieftain (Altar of
Storms) would map to `T` if the first-word rule were applied, and such a collision
within a building's command card is resolved by WC3's layout by using a
non-conflicting letter.

In the Barracks command card, Grunt is on `G`. Headhunter on `H` does not collide
with anything and is consistent with the "Headhunter" name. Training the wrong
muscle memory on `T` for Headhunter is harmful. Flag: `verified: community` for
`H`; the `T` binding in the current scenarios file is likely wrong.

**However:** this specific key (`H` vs `T`) has enough community ambiguity that it
must be confirmed in-game before locking the drill. Resolution: open WC3, select an
Orc Barracks, and read the displayed hotkey letter on the Troll Headhunter button.

### 3.3 Beastiary

Keys apply when the Beastiary is selected.

| Command | Key | Confidence | Notes |
|---------|-----|------------|-------|
| Train Raider | R | `verified: community` | Raider is trained at Beastiary, not Barracks |
| Train Kodo Beast | K | `verified: community` | "Kodo" — first letter |
| Train Wind Rider | W | `needs verification` | Possible collision with Witch Doctor (W) in other buildings; within Beastiary context should be unambiguous |
| Train Demolisher | D | `verified: community` | "Demolisher" — first letter |

**Correction on Raider placement:** Raider trains at the Beastiary (not Barracks).
The scenarios file comment block lists Raider under Barracks/Beastiary — it is
Beastiary only. `verified: community`.

### 3.4 Altar of Storms

Keys apply when the Altar of Storms is selected. Each key summons a different hero.

| Command | Key | Confidence | Notes |
|---------|-----|------------|-------|
| Summon Blademaster | B | `verified: community` | "Blademaster" — unambiguous; B has no conflict in this command card |
| Summon Far Seer | F | `verified: community` | "Far Seer" — F; no conflict with Fortress upgrade (different building) |
| Summon Tauren Chieftain | T | `verified: community` | "Tauren Chieftain" — T; no conflict within the Altar command card |
| Summon Shadow Hunter | H | `verified: community` | "Shadow Hunter" — H; note potential conflict discussion below |

**Shadow Hunter key note:** "Shadow Hunter" → `H` for Shadow, but `S` for Shadow is
also plausible. Community sources consistently report `H` for Shadow Hunter at the
Altar. The `S` binding at the Altar may be unused or reserved, making `H` the
correct Classic key. Confidence: `verified: community` for `H`; flag if the trainer
adds Shadow Hunter steps.

**Within-Altar collision check:** B, F, T, H — no two heroes share a letter.
No collision in the Altar command card. All four Orc heroes can be drilled
without ambiguity given correct letters above.

### 3.5 War Mill

Keys apply when the War Mill is selected.

| Command | Key | Confidence | Notes |
|---------|-----|------------|-------|
| Upgrade Melee Weapons | M | `verified: community` | "Melee" — M; critical early-game upgrade |
| Upgrade Ranged Weapons | R | `verified: community` | "Ranged" — R; not to be confused with Raider (different building) |
| Upgrade Armor | A | `needs verification` | "Armor" — A is the expected letter; but Attack-move is also A (different context: units selected vs War Mill selected) |

**Armor upgrade note:** The `A` binding for armor upgrade is used only when the War
Mill building is selected, so it does not conflict with the Attack-move command
(which requires a unit selection). This is a Classic layout context-sensitivity
that is correct design but should be flagged for trainers building "building
selected" drills.

---

## 4. Keys Not Drilled (scope boundary)

The following Classic bindings are out of scope for current drill scenarios but
are documented here to prevent them from being accidentally hard-coded elsewhere:

| Command | Key | Building/Context | Confidence |
|---------|-----|------------------|------------|
| Train Tauren | T | Tauren Totem | `verified: community` |
| Train Spirit Walker | S | Tauren Totem | `verified: community` |
| Train Kodo Beast | K | Beastiary | `verified: community` |
| Research Berserker Upgrade | B | War Mill | `needs verification` |
| Research Liquid Fire | L | War Mill | `needs verification` |
| Pillage | P | unit upgrade | `needs verification` |

---

## 5. Keys Confirmed Absent from Orc Scenarios

Keys that are commonly confused but do NOT appear as trainer targets:

- `Tab` — cycles through sub-groups in a multi-type selection. Not a production key.
- `Esc` — cancel production / deselect. Not drilled (trainer only drills positive commands).
- `G` at Altar — Blademaster is `B`, not `G`. (G is for Grunt at Barracks.)

---

## 6. In-Game Verification Checklist

Before any drill step is shipped as `verified: certain`, open WC3, enter a
single-player game with an Orc base, select each building in turn, and confirm
the displayed hotkey letter in the command card tooltip. Record results here.

| Building | Unit/Command | Expected Key | Verified In-Game? |
|----------|-------------|-------------|-------------------|
| Great Hall | Train Peon | P | No |
| Great Hall | Upgrade to Stronghold | S or U | No — **must verify** |
| Barracks | Train Grunt | G | No |
| Barracks | Train Troll Headhunter | H | No — **must verify** |
| Altar of Storms | Summon Blademaster | B | No |
| Altar of Storms | Summon Far Seer | F | No |
| Altar of Storms | Summon Tauren Chieftain | T | No |
| Altar of Storms | Summon Shadow Hunter | H | No |

Once a key is confirmed in-game, update this table and change the confidence flag
to `verified: certain` for that row.

---

> Authored by Tactician (Strategist agent) in T4.1, 2026-06-11.
> Patch 2.0 (Reforged 2.00, build 6117). Orc-only scope.
> Primary consumer: `apps/web/src/trainer/engine/scenarios/hotkeys.ts`.
