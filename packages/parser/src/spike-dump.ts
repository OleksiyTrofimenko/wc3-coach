/**
 * T1.1 Spike — parse one replay and dump the full w3gjs output to JSON.
 *
 * PURPOSE: exploratory analysis of real data quality before designing T1.2
 * normalization. Read docs/WC3_Coach_Design_Doc.md §3.2 and §6.
 *
 * PRINCIPLE #1 COMPLIANCE: operates only on a saved .w3g file.
 *   No live-game memory reading, no packet sniffing.
 *
 * Usage:
 *   corepack pnpm --filter @wc3-coach/parser exec tsx src/spike-dump.ts [path/to/replay.w3g]
 *   (defaults to C:\Work\wc3\game-data\replays\w3c-20260426112948.w3g)
 *
 * Output: game-data/dumps/<replayname>.json
 *
 * NOTE(T1.2): The JSON dump is the raw w3gjs output — NOT the canonical
 *   GameEvent model yet. That mapping happens in T1.2.
 *
 * KNOWN LIMITATION (design doc §6):
 *   .w3g stores player COMMANDS, not game state. Unit deaths, unit positions,
 *   and HP values are NOT present anywhere in this output. See the
 *   "deaths_limitation" section in the JSON dump for a full explanation.
 */

import W3GReplay from "w3gjs";
import { readFileSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const DEFAULT_REPLAY = "C:\\Work\\wc3\\game-data\\replays\\w3c-20260426112948.w3g";
const replayPath = resolve(process.argv[2] ?? DEFAULT_REPLAY);

const repoRoot = resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
const dumpsDir = resolve(repoRoot, "game-data", "dumps");

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

console.log(`[spike-dump] Parsing: ${replayPath}`);

let fileBuf: Buffer;
try {
  fileBuf = readFileSync(replayPath);
} catch (err) {
  console.error(`[spike-dump] Cannot read replay file: ${replayPath}`);
  console.error(err);
  process.exit(1);
}

const fileHash = createHash("sha256").update(fileBuf).digest("hex");
const fileStat = statSync(replayPath);

const parser = new W3GReplay();

// Collect all raw gamedatablocks via the low-level event before calling
// parse(), so we can count block types for the analysis section.
const rawBlocks: unknown[] = [];
parser.on("gamedatablock", (block) => {
  rawBlocks.push(block);
});

let result: Awaited<ReturnType<W3GReplay["parse"]>>;
try {
  result = await parser.parse(replayPath);
} catch (err) {
  console.error("[spike-dump] w3gjs failed to parse the replay:");
  console.error(err);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Analyse block-type distribution (informs event coverage section)
// ---------------------------------------------------------------------------

const blockTypeCounts: Record<string, number> = {};
for (const block of rawBlocks) {
  const b = block as { id?: unknown };
  const key = b.id !== undefined ? String(b.id) : "unknown";
  blockTypeCounts[key] = (blockTypeCounts[key] ?? 0) + 1;
}

// Summarise action-opcode distribution across all players
const actionOpcodeCounts: Record<string, number> = {};
for (const player of result.players) {
  // actions.timed is an array of APM samples; the named keys are aggregates
  const a = player.actions as Record<string, number | number[]>;
  for (const [k, v] of Object.entries(a)) {
    if (k === "timed") continue; // skip per-interval array
    const n = typeof v === "number" ? v : 0;
    actionOpcodeCounts[k] = (actionOpcodeCounts[k] ?? 0) + n;
  }
}

// ---------------------------------------------------------------------------
// Build the analysis sections for the dump
// ---------------------------------------------------------------------------

// Deduplicate heroes across players for inspection
const heroSamples: Record<string, unknown>[] = [];
for (const player of result.players) {
  for (const hero of player.heroes) {
    heroSamples.push({ playerName: player.name, ...hero });
  }
}

// Build order (buildings + units) with timestamps, limited to first 30 per
// player to keep the dump scannable.
const buildOrderSamples: unknown[] = [];
for (const player of result.players) {
  buildOrderSamples.push({
    playerName: player.name,
    race: player.race,
    raceDetected: player.raceDetected,
    buildings_first30: player.buildings.order.slice(0, 30),
    units_first30: player.units.order.slice(0, 30),
    upgrades_first30: player.upgrades.order.slice(0, 30),
    items_first30: player.items.order.slice(0, 30),
    buildings_summary: player.buildings.summary,
    units_summary: player.units.summary,
    upgrades_summary: player.upgrades.summary,
    items_summary: player.items.summary,
  });
}

// APM per player
const apmSamples: unknown[] = [];
for (const player of result.players) {
  apmSamples.push({
    playerName: player.name,
    apm: player.apm,
    actionCounts: {
      assigngroup: player.actions.assigngroup,
      rightclick: player.actions.rightclick,
      basic: player.actions.basic,
      buildtrain: player.actions.buildtrain,
      ability: player.actions.ability,
      item: player.actions.item,
      select: player.actions.select,
      removeunit: player.actions.removeunit,
      subgroup: player.actions.subgroup,
      selecthotkey: player.actions.selecthotkey,
      esc: player.actions.esc,
    },
    // timed APM interval samples (truncated — first 10 intervals)
    timedApmSampleFirst10: player.actions.timed.slice(0, 10),
    timedApmIntervalMs: result.apm.trackingInterval,
    groupHotkeys: player.groupHotkeys,
  });
}

// ---------------------------------------------------------------------------
// Deaths / positions analysis section
// ---------------------------------------------------------------------------

const deathsAnalysis = {
  // FINDING: no unit_death events exist in .w3g files. The format only stores
  // player-issued commands. The engine simulates combat server-side; the
  // result (unit deaths, HP changes, positions) is never written to the
  // replay file itself.
  unitDeathsRecorded: false,
  unitPositionsRecorded: false,
  evidence: [
    "w3gjs Action type union (ActionParser.d.ts) contains: 0x10 (ability no-params), " +
      "0x11 (ability target position), 0x12 (ability target+object), 0x13 (give item), " +
      "0x14 (two targets), 0x15 (complex), 0x16 (change selection), 0x17 (assign hotkey), " +
      "0x18 (select hotkey), 0x19 (subgroup), 0x1a-0x1f (select/deselect/cancel), " +
      "0x51 (resource transfer), 0x61 (ESC), 0x64-0x79 (misc UI). " +
      "No death or damage event opcode exists in this list.",
    "The gamedatablock stream (GameDataParser) contains TimeslotBlock, " +
      "PlayerChatMessageBlock, and LeaveGameBlock. No 'unit died' message block type exists.",
    "player.units.order contains TRAIN commands only (when the player queued a unit). " +
      "There is no corresponding 'unit removed from army' event.",
  ],
  recommendation:
    "Use Observer API (War3StatsObserverSharedMemory) during replay playback " +
    "for deaths + positions — design doc §6 Path B. Do not attempt to infer deaths " +
    "from command data alone without full simulation (Path A).",
};

// ---------------------------------------------------------------------------
// Time base analysis
// ---------------------------------------------------------------------------

const timeBaseAnalysis = {
  // All w3gjs timestamps are in milliseconds elapsed since game start.
  // buildings.order[n].ms, units.order[n].ms, etc. are all t_ms values.
  // TimeslotBlock increments totalTimeTracker in the W3GReplay class.
  // result.duration is total game duration in MILLISECONDS.
  unit: "milliseconds",
  fieldNames: ["ms (on build/unit/upgrade/item order entries)", "timeMS (on ChatMessage)", "duration (ParserOutput, total game ms)"],
  suitableForTMs: true,
  notes:
    "Directly usable as t_ms in GameEvent. No conversion needed. " +
    "result.duration = " + result.duration + " ms = " +
    (result.duration / 60000).toFixed(2) + " min.",
};

// ---------------------------------------------------------------------------
// Classic vs Reforged quirks
// ---------------------------------------------------------------------------

const reforgedQuirks = {
  buildNumber: result.buildNumber,
  version: result.version,
  expansion: result.expansion,
  observerMode: result.settings.observerMode,
  // Reforged replays (version >= 1.32) use a different header format.
  // w3gjs detects this automatically via buildNumber and subheader magic.
  // The 'expansion' flag distinguishes TFT (Frozen Throne) from RoC.
  // For Reforged: version will be "1.3x" range.
  // The high-level API normalises most differences, so caller code is
  // largely format-agnostic. One exception: very old replays (<= 1.14)
  // are explicitly not fully supported per w3gjs README.
  quirksNoted: [
    "version field present and populated by w3gjs header parsing",
    "expansion:true expected for all modern Reforged/TFT replays",
    "settings.observerMode can indicate replay was recorded in observer slot",
    "raceDetected (on Player) is inferred from actions, may differ from race enum when Random is picked",
  ],
};

// ---------------------------------------------------------------------------
// GameEvent coverage analysis
// ---------------------------------------------------------------------------

const eventCoverage = {
  build: {
    derivable: true,
    source: "player.buildings.order — array of {id: string, ms: number}",
    example: buildOrderSamples[0]
      ? (buildOrderSamples[0] as { buildings_first30: unknown[] }).buildings_first30.slice(0, 3)
      : "no buildings found",
    notes:
      "id is a 4-char FourCC string (e.g. 'hbar' = Human Barracks, 'ogre' = Orc Great Hall). " +
      "ms = t_ms. Covers all player-issued build commands including expansions.",
  },
  train: {
    derivable: true,
    source: "player.units.order — array of {id: string, ms: number}",
    example: buildOrderSamples[0]
      ? (buildOrderSamples[0] as { units_first30: unknown[] }).units_first30.slice(0, 3)
      : "no units found",
    notes:
      "id is a 4-char FourCC (e.g. 'hfoo' = Human Footman, 'opeo' = Orc Peon). " +
      "This is the TRAIN command — the unit entering the production queue. " +
      "The unit may die before it's ever used; there is no 'training cancelled' event separate " +
      "from RemoveUnitFromBuildingQueue (0x1e/0x1f action).",
  },
  upgrade: {
    derivable: true,
    source: "player.upgrades.order — array of {id: string, ms: number}",
    example: buildOrderSamples[0]
      ? (buildOrderSamples[0] as { upgrades_first30: unknown[] }).upgrades_first30.slice(0, 3)
      : "no upgrades found",
    notes: "id is 4-char FourCC (e.g. 'Rhme' = Human Melee Weapon Upgrade). ms = t_ms.",
  },
  learn_skill: {
    derivable: true,
    source: "player.heroes[n].abilityOrder — filtered to type=='ability' entries",
    example: heroSamples[0] ?? "no heroes found",
    notes:
      "hero.abilityOrder is an array of {type:'ability'|'retraining', time: number, value: string}. " +
      "type=='ability' entries are skill-learns. value is the ability FourCC. " +
      "hero.abilities is a summary {abilityId: level} map. " +
      "hero.level is the final hero level. Retraining is tracked in retrainingHistory.",
  },
  item: {
    derivable: true,
    source: "player.items.order — array of {id: string, ms: number}",
    example: buildOrderSamples[0]
      ? (buildOrderSamples[0] as { items_first30: unknown[] }).items_first30.slice(0, 3)
      : "no items found",
    notes:
      "id is 4-char FourCC (e.g. 'stwp' = Scroll of Town Portal). ms = t_ms. " +
      "Covers item purchases; item-drops and item-gives are also low-level actions (0x13).",
  },
  move: {
    derivable: "partial",
    source: "raw Action 0x11/0x12 (target position / target+object) with right-click orderId",
    notes:
      "Move orders are captured in the raw action stream but w3gjs high-level API does NOT " +
      "aggregate them into a named list (no player.moves array). To extract move events you " +
      "must use the low-level ReplayParser + ActionParser and filter for 0x11/0x12 blocks " +
      "with orderId matching move/attack-move. player.actions.rightclick counts these. " +
      "Volume is very high (~thousands per game) — filtering to meaningful events requires " +
      "heuristics (e.g. only non-combat moves, or movement during specific game phases).",
  },
  attack: {
    derivable: "partial",
    source: "Same as move — 0x11/0x12 with attack orderId; player.actions.basic counts attack commands",
    notes: "Same caveat as move: not aggregated in high-level API, requires low-level parsing.",
  },
  hero_level: {
    derivable: true,
    source: "player.heroes[n].level (final level) + abilityOrder timestamps",
    notes:
      "Final level is direct. Per-level timestamps must be inferred: each 'ability' entry in " +
      "abilityOrder represents a skill point spent (= a level up happened shortly before or at " +
      "that time). The inferHeroAbilityLevelsFromAbilityOrder utility in w3gjs handles this.",
  },
  unit_spawn: {
    derivable: "partial",
    notes:
      "No direct spawn event. Approximated by player.units.order (train command). " +
      "Actual spawn time = train command time + unit build_time (from ontology). " +
      "Requires ontology lookup to compute exact spawn time.",
  },
  unit_death: {
    derivable: false,
    notes:
      "NOT RECORDED in .w3g. See deathsAnalysis section. " +
      "Must use Observer API (Path B) or simulation (Path A).",
  },
  expand: {
    derivable: true,
    source: "player.buildings.order — filter for expansion hall FourCC codes",
    notes:
      "Expansion halls have known FourCC IDs per race: " +
      "oexp='Orc Expansion', hexp='Human Expansion', uexp='Undead Expansion', eexp='NE Expansion'. " +
      "Filter player.buildings.order for these IDs to get expand timing.",
  },
};

// ---------------------------------------------------------------------------
// Data quality gotchas
// ---------------------------------------------------------------------------

const gotchas = [
  {
    issue: "Selection spam inflates action counts",
    detail:
      "Action 0x16 (ChangeSelection) is issued on every unit click, tab, box-select. " +
      "player.actions.select counts these. For APM, w3gjs marks some selections as non-APM " +
      "(isAPM param in handle0x16). The timed APM array uses the tracking interval " +
      "(playerActionTrackInterval, default 60s). Raw action.select numbers include all " +
      "selection clicks regardless of APM flag.",
  },
  {
    issue: "FourCC IDs are not human-readable without the mappings table",
    detail:
      "All entity IDs (units, buildings, upgrades, items, abilities) are 4-byte FourCC strings. " +
      "w3gjs ships a mappings.js (items, units, buildings, upgrades, heroAbilities, abilityToHero) " +
      "for lookup. Not all custom-map or newer-patch IDs may be present — unmapped IDs will " +
      "need to be added to the ontology.",
  },
  {
    issue: "raceDetected vs race field",
    detail:
      "player.race is from the slot metadata (declared race, may be Race.Random). " +
      "player.raceDetected is inferred from actions (e.g. building FourCCs). " +
      "For Random players, raceDetected is the authoritative actual race.",
  },
  {
    issue: "Observer slots appear in players array",
    detail:
      "Observers can occupy player slots and appear in result.players. " +
      "Use W3GReplay.isObserver() or check result.observers array to filter them out. " +
      "Observers have no meaningful build order data.",
  },
  {
    issue: "winningTeamId may be -1 (no winner recorded)",
    detail:
      "result.winningTeamId is derived from LeaveGameBlock reasons. " +
      "If the replay was saved from a disconnect or non-standard ending, " +
      "the winner may not be determinable. Check for -1.",
  },
  {
    issue: "Leaver order matters for winner inference",
    detail:
      "W3GReplay.leaveEvents contains leave records with reason codes. " +
      "The winner is the last team standing. In FFA or team games with leavers, " +
      "the logic is more complex. result.winningTeamId encodes this.",
  },
  {
    issue: "Timestamps are wall-clock game time, not human time",
    detail:
      "All ms values are elapsed game time from the replay start. " +
      "They do NOT correspond to the real-world clock. " +
      "result.duration is total game time in ms.",
  },
  {
    issue: "RemoveUnitFromBuildingQueue (0x1e/0x1f) not in high-level aggregates",
    detail:
      "When a player cancels a unit or building from the queue, action 0x1e/0x1f fires. " +
      "The high-level API does not subtract these from buildings/units counts. " +
      "Summary and order arrays reflect issued commands, not completed productions.",
  },
];

// ---------------------------------------------------------------------------
// T1.2 readiness assessment
// ---------------------------------------------------------------------------

const readinessAssessment = {
  cleanToday: [
    "build (player.buildings.order) — FourCC id + ms",
    "train (player.units.order) — FourCC id + ms",
    "upgrade (player.upgrades.order) — FourCC id + ms",
    "item (player.items.order) — FourCC id + ms",
    "learn_skill (player.heroes[].abilityOrder) — FourCC id + time",
    "hero_level (final from player.heroes[].level; per-level via abilityOrder timestamps)",
    "expand (filter buildings.order for expansion hall FourCCs)",
    "apm (player.apm scalar + timed intervals)",
    "metadata: map, players, race, duration, matchup, version, winningTeamId",
  ],
  needsLowLevelParsing: [
    "move / attack — raw 0x11/0x12 actions not aggregated in high-level API; high volume",
    "cancel_queue — 0x1e/0x1f actions not reflected in high-level aggregates",
  ],
  requiresOntologyLookup: [
    "unit_spawn timing — train command time + build_time from ontology",
    "entity_ref population — map FourCC → ontology ID (e.g. 'hbar' → buildings.id=42)",
  ],
  requiresObserverAPI: [
    "unit_death — not in .w3g at all; must use Path B (Observer API) or Path A (simulation)",
    "unit_position snapshots — not in .w3g; Observer API or simulation only",
    "creep camp clearing — not in .w3g; inferred from item drops + unit death events",
  ],
  blockers: [
    "none — sufficient data for build-order, economy, hero, and upgrade analytics in T1.2",
  ],
};

// ---------------------------------------------------------------------------
// Compose final dump
// ---------------------------------------------------------------------------

const dump = {
  _meta: {
    spikeTask: "T1.1",
    generatedAt: new Date().toISOString(),
    replayFile: replayPath,
    fileSizeBytes: fileStat.size,
    fileSha256: fileHash,
    w3gjsVersion: "4.1.0",
    parseTimeMs: result.parseTime,
    principleCompliance:
      "Principle #1 compliant — post-game .w3g only, no live-game data access",
  },
  metadata: {
    id: result.id,
    gamename: result.gamename,
    map: result.map,
    version: result.version,
    buildNumber: result.buildNumber,
    expansion: result.expansion,
    duration_ms: result.duration,
    duration_human: `${Math.floor(result.duration / 60000)}:${String(Math.floor((result.duration % 60000) / 1000)).padStart(2, "0")}`,
    type: result.type,
    matchup: result.matchup,
    creator: result.creator,
    randomseed: result.randomseed,
    startSpots: result.startSpots,
    winningTeamId: result.winningTeamId,
    observers: result.observers,
    settings: result.settings,
    apmTrackingIntervalMs: result.apm.trackingInterval,
  },
  players: result.players.map((p) => ({
    id: p.id,
    name: p.name,
    teamid: p.teamid,
    color: p.color,
    race: p.race,
    raceDetected: p.raceDetected,
    apm: p.apm,
    heroCount: p.heroCount,
    heroes: p.heroes,
    heroCollector: p.heroCollector,
    buildings: {
      summary: p.buildings.summary,
      order: p.buildings.order,
    },
    units: {
      summary: p.units.summary,
      order: p.units.order,
    },
    upgrades: {
      summary: p.upgrades.summary,
      order: p.upgrades.order,
    },
    items: {
      summary: p.items.summary,
      order: p.items.order,
    },
    actions: p.actions,
    groupHotkeys: p.groupHotkeys,
    resourceTransfers: p.resourceTransfers,
  })),
  chat: result.chat,
  // leaveEvents and w3mmd live on the W3GReplay instance, not on ParserOutput.
  leaveEvents: parser.leaveEvents,
  w3mmd: parser.w3mmd,
  analysis: {
    rawBlockTypeCounts: blockTypeCounts,
    totalRawBlocks: rawBlocks.length,
    actionOpcodeCounts,
    apmPerPlayer: apmSamples,
    buildOrderSamples,
    heroSamples,
    timeBase: timeBaseAnalysis,
    deathsLimitation: deathsAnalysis,
    reforgedQuirks,
    eventCoverage,
    gotchas,
    t12ReadinessAssessment: readinessAssessment,
  },
};

// ---------------------------------------------------------------------------
// Write output
// ---------------------------------------------------------------------------

mkdirSync(dumpsDir, { recursive: true });

const replayName = basename(replayPath, ".w3g");
const outputPath = resolve(dumpsDir, `${replayName}.json`);

writeFileSync(outputPath, JSON.stringify(dump, null, 2), "utf8");

console.log(`[spike-dump] Written: ${outputPath}`);
console.log(`[spike-dump] Replay duration: ${dump.metadata.duration_human}`);
console.log(`[spike-dump] Players: ${result.players.map((p) => `${p.name} (${p.race}/${p.raceDetected})`).join(", ")}`);
console.log(`[spike-dump] winningTeamId: ${result.winningTeamId}`);
console.log(`[spike-dump] Version: ${result.version} build ${result.buildNumber}`);
console.log(`[spike-dump] Map: ${result.map.file}`);
console.log(`[spike-dump] Matchup: ${result.matchup}`);
