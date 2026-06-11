/**
 * Hotkey drill scenarios — T4.2 domain, proved here as the first working scenario.
 *
 * All bindings match the WC3 **Classic** hotkey layout (the original letter-based
 * preset, NOT Grid).
 *
 * SOURCE OF TRUTH: `.claude/skills/wc3-knowledge/hotkeys.md`. Do not assert
 * hotkey facts inline here — read the keys (and their confidence flags) from the
 * knowledge base. Only keys at `verified: certain`/`verified: community` are
 * drilled below; keys still flagged `needs verification` (e.g. the Great Hall
 * "Upgrade to Stronghold" S-vs-U ambiguity) are intentionally omitted until
 * confirmed in-game under T4.2.
 *
 * Drill structure:
 *  Each scenario runs for 60 seconds (repeat: true) presenting prompts in sequence.
 *  The player has 2 seconds to respond to each prompt (defaultWindowMs).
 *  At 2s/step the theoretical maximum EPM ≈ 30 (one action every 2 seconds).
 *  A "good" ladder player will react in ~400–600ms → EPM in practice still ≈ 30
 *  but accuracy and reaction time differentiate skill.
 */

import type { DrillScenario } from "../types";

// ---------------------------------------------------------------------------
// Scenario: Control group assignment and recall (universal WC3 binding)
// ---------------------------------------------------------------------------

/**
 * Control group drill — 10-step sequence covering assign (Ctrl+1..5) and
 * recall (press 1..5 to select group, press again to center camera).
 *
 * Why these steps in this order:
 *  1. Assign group 1 (Ctrl+1) — most common; hero group.
 *  2. Select group 1 (1) — immediate recall.
 *  3. Assign group 2 (Ctrl+2) — army group.
 *  4. Select group 2 (2).
 *  5. Shift-add to group 1 (Shift+1) — add units without losing group.
 *  6. Assign group 3 (Ctrl+3) — second army or building hotkey.
 *  7. Select group 3 (3).
 *  8. Assign group 4 (Ctrl+4) — worker group or expansion.
 *  9. Select group 4 (4).
 * 10. Double-tap 1 to center camera on group 1 — modeled as a second "1" press.
 *
 * The drill trains the Ctrl+digit / digit muscle memory loop that is the most
 * fundamental APM driver in WC3.
 */
export const CONTROL_GROUP_DRILL: DrillScenario = {
  id: "hotkey:control_groups",
  title: "Control Groups",
  description:
    "Assign and recall control groups Ctrl+1..4 and Shift-add. " +
    "The core of WC3 macro — hero on 1, army on 2-3, base/workers on 4.",
  category: "hotkey",
  defaultWindowMs: 2000,
  totalDurationMs: 60_000,
  repeat: true,
  steps: [
    {
      id: "cg-assign-1",
      prompt: "Assign Control Group 1",
      subPrompt: "Hero group — set your hero here",
      target: { key: "1", ctrl: true },
    },
    {
      id: "cg-select-1",
      prompt: "Select Control Group 1",
      subPrompt: "Recall your hero",
      target: { key: "1" },
    },
    {
      id: "cg-assign-2",
      prompt: "Assign Control Group 2",
      subPrompt: "Army group — main fighting units",
      target: { key: "2", ctrl: true },
    },
    {
      id: "cg-select-2",
      prompt: "Select Control Group 2",
      subPrompt: "Select your army",
      target: { key: "2" },
    },
    {
      id: "cg-shift-add-1",
      prompt: "Shift-add to Group 1",
      subPrompt: "Add units to group without losing existing selection",
      target: { key: "1", shift: true },
    },
    {
      id: "cg-assign-3",
      prompt: "Assign Control Group 3",
      subPrompt: "Second army group or ranged units",
      target: { key: "3", ctrl: true },
    },
    {
      id: "cg-select-3",
      prompt: "Select Control Group 3",
      subPrompt: "Select second group",
      target: { key: "3" },
    },
    {
      id: "cg-assign-4",
      prompt: "Assign Control Group 4",
      subPrompt: "Workers or base buildings",
      target: { key: "4", ctrl: true },
    },
    {
      id: "cg-select-4",
      prompt: "Select Control Group 4",
      subPrompt: "Select workers/base",
      target: { key: "4" },
    },
    {
      id: "cg-assign-5",
      prompt: "Assign Control Group 5",
      subPrompt: "Expansion or auxiliary group",
      target: { key: "5", ctrl: true },
    },
  ],
};

// ---------------------------------------------------------------------------
// Scenario: Orc building hotkeys (Classic layout)
// ---------------------------------------------------------------------------

/**
 * Orc production hotkeys — Classic layout.
 *
 * These are the keys pressed after selecting the building. Bindings + confidence
 * flags are documented in `.claude/skills/wc3-knowledge/hotkeys.md` §3 — that is
 * the source of truth; the values below mirror it.
 *
 * Drilled here (verified: community): Peon (P), Grunt (G), Troll Headhunter (H),
 * Blademaster (B), Far Seer (F), Tauren Chieftain (T).
 * Deliberately NOT drilled (needs in-game verification, see KB §3.1/§6):
 *   "Upgrade to Stronghold" — sources split between S and U. Pending T4.2.
 */
export const ORC_PRODUCTION_HOTKEYS_DRILL: DrillScenario = {
  id: "hotkey:orc_production",
  title: "Orc Production Keys",
  description:
    "Train Orc production hotkeys: workers, Grunts, Headhunters, and hero altar. " +
    "Classic layout. Select the building first, then hit the unit/upgrade key.",
  category: "hotkey",
  defaultWindowMs: 1800,
  totalDurationMs: 60_000,
  repeat: true,
  steps: [
    {
      id: "orc-peon",
      prompt: "Great Hall selected — Train Peon",
      subPrompt: "P — keep workers flowing",
      target: { key: "p" },
    },
    {
      id: "orc-grunt",
      prompt: "Barracks selected — Train Grunt",
      subPrompt: "G — your core melee unit",
      target: { key: "g" },
    },
    {
      id: "orc-headhunter",
      prompt: "Barracks selected — Train Headhunter",
      subPrompt: "H — ranged harass / anti-air",
      target: { key: "h" },
    },
    {
      id: "orc-blademaster",
      prompt: "Altar of Storms — Summon Blademaster",
      subPrompt: "B — Orc's most popular hero",
      target: { key: "b" },
    },
    {
      id: "orc-farseer",
      prompt: "Altar of Storms — Summon Far Seer",
      subPrompt: "F — Chain Lightning / Feral Spirit",
      target: { key: "f" },
    },
    {
      id: "orc-tauren-chieftain",
      prompt: "Altar of Storms — Summon Tauren Chieftain",
      subPrompt: "T — War Stomp (AOE stun)",
      target: { key: "t" },
    },
    {
      id: "orc-peon-2",
      prompt: "Great Hall selected — Train Peon",
      subPrompt: "Worker continuity — never stop making workers early",
      target: { key: "p" },
    },
  ],
};

// ---------------------------------------------------------------------------
// Scenario: Camera and base cycle (classic WC3 macro rhythm)
// ---------------------------------------------------------------------------

/**
 * Camera / base cycle drill.
 *
 * The "WC3 rhythm" for a high-APM player:
 *   attack move army → check base (F2/group 4) → queue workers → back to army
 *
 * This drill trains the key presses of that cycle WITHOUT a live game:
 *   F1  — jump to hero slot 1 (your first/only hero early game)
 *   1   — select army group 1
 *   A   — issue Attack-move (Classic: A)
 *   4   — select base/workers
 *   P   — queue peon
 *   1   — back to army
 *
 * Note: F1/F2/F3 are WC3's default "jump to hero" keys for hero slots 1/2/3.
 * A standard single-hero opening maps the hero to F1, not F2 (see KB §2.1).
 */
export const CAMERA_BASE_CYCLE_DRILL: DrillScenario = {
  id: "hotkey:camera_base_cycle",
  title: "Base–Army Cycle",
  description:
    "The fundamental WC3 macro rhythm: army group → attack-move → check base → " +
    "queue workers → back to army. Trains the camera-switching habit.",
  category: "hotkey",
  defaultWindowMs: 1500,
  totalDurationMs: 60_000,
  repeat: true,
  steps: [
    {
      id: "cycle-hero",
      prompt: "Jump to Hero (slot 1)",
      subPrompt: "F1 — check hero position/HP",
      target: { key: "F1" },
    },
    {
      id: "cycle-army",
      prompt: "Select Army Group",
      subPrompt: "1 — select your main combat group",
      target: { key: "1" },
    },
    {
      id: "cycle-attack",
      prompt: "Attack-Move Command",
      subPrompt: "A — issue attack-move order to army",
      target: { key: "a" },
    },
    {
      id: "cycle-base",
      prompt: "Jump to Base / Workers",
      subPrompt: "4 — select your worker/base group",
      target: { key: "4" },
    },
    {
      id: "cycle-peon",
      prompt: "Queue Worker",
      subPrompt: "P — keep worker production going",
      target: { key: "p" },
    },
    {
      id: "cycle-back",
      prompt: "Back to Army",
      subPrompt: "1 — return attention to the fight",
      target: { key: "1" },
    },
  ],
};

// ---------------------------------------------------------------------------
// All scenarios exported in display order
// ---------------------------------------------------------------------------

export const HOTKEY_SCENARIOS: DrillScenario[] = [
  CONTROL_GROUP_DRILL,
  ORC_PRODUCTION_HOTKEYS_DRILL,
  CAMERA_BASE_CYCLE_DRILL,
];
