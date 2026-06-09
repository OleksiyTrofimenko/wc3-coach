/**
 * T1.2 — Event normalization: raw w3gjs ParserOutput → canonical ReplayTimeline.
 *
 * PRINCIPLE #1 COMPLIANCE: operates ONLY on already-parsed .w3g data.
 * No live-game memory reading, no packet sniffing.
 *
 * ## entityRef convention (PROVISIONAL — pending T2.2 ontology)
 * All entityRef strings use the namespaced raw-FourCC scheme:
 *   "<kind>:<fourcc>"  e.g. "unit:opeo", "building:obar", "upgrade:Roen"
 *
 * These are NOT yet canonical ontology IDs.  T2.2 will rewrite entityRef to the
 * real ontology ID (e.g. "unit:orc_peon") once the ontology tables are populated.
 * Every event payload also carries:
 *   payload.fourcc   — the raw 4-char FourCC exactly as w3gjs delivers it
 *   payload.resolved — always `false` here; set to `true` by the ontology resolver
 *
 * ## replayId
 * Set to the file sha256 (`fileHash`) at parse time.  The ingest layer (T1.3)
 * will overwrite this with the real UUID once the row is inserted into Postgres.
 * The sha256 remains available in `fileHash` for dedup.
 *
 * ## playedAt
 * w3gjs does NOT expose a reliable wall-clock timestamp for when the game was
 * played.  We set `playedAt` to `""` (empty string) here.  T1.3 / the ingest
 * layer should enrich this from the file mtime or a W3Champions API lookup.
 *
 * ## winnerSlot
 * Derived from `result.winningTeamId`.  A value of `-1` means no winner was
 * recorded (common for FLO-saved replays where both players were still alive when
 * the replay was cut).  We map `-1` → `null` per the GameEvent contract.
 * FLO replays require external enrichment (e.g. W3Champions match API) to resolve
 * the true winner.
 *
 * ## expand vs build
 * When a player issues a build command for an expansion hall (oexp/hexp/uexp/eexp),
 * we emit ONLY an `expand` event — NOT an additional `build` event — to avoid
 * double-counting the same command.  Consumers that need all build commands
 * regardless of building type should check payload.fourcc, not just type.
 * This choice keeps the event stream semantically clean for benchmark queries
 * (e.g. "expand_time") without extra filtering.
 *
 * ## KNOWN LIMITATIONS (design doc §6)
 * - `move`, `attack`: NOT in the w3gjs high-level API; require low-level ActionParser
 *   pass over 0x11/0x12 opcodes (high-volume — deferred to T1.4 or a dedicated task).
 * - `unit_spawn`: train command time + build_time from ontology; deferred to T2.2.
 * - `unit_death`: NOT recorded in .w3g at all; requires Observer API (Path B) or
 *   simulation (Path A) — deferred to T1.4.
 * - `hero_level` per-level timestamps: inferrable via abilityOrder, implemented below
 *   as a best-effort approximation (see inferHeroLevelEvents comments).
 */

import type W3GReplay from "w3gjs";
import type { ParserOutput } from "w3gjs";
import type { GameEvent, GameEventType, ReplayPlayer, ReplayTimeline } from "@wc3-coach/shared-types";

// ---------------------------------------------------------------------------
// Expansion hall FourCCs per race (T1.1 spike finding + wc3 ontology)
// These FourCCs identify the "expand" command in building orders.
// ---------------------------------------------------------------------------

/**
 * Set of building FourCCs that represent expansion main halls.
 * Building one of these counts as an expand, not a plain build.
 *
 * Source: WC3 game data / w3gjs mappings.
 * oexp = Orc Expansion Great Hall  (level 1 orc main at expo)
 * hexp = Human Expansion Town Hall
 * uexp = Undead Expansion Necropolis
 * eexp = Night Elf Expansion Tree of Life
 */
const EXPANSION_HALL_FOURCCS = new Set<string>(["oexp", "hexp", "uexp", "eexp"]);

// ---------------------------------------------------------------------------
// Provisional entityRef builder
// ---------------------------------------------------------------------------

/**
 * Builds a PROVISIONAL entityRef string of the form "<kind>:<fourcc>".
 * T2.2 will replace this with the canonical ontology ID.
 */
function provisionalRef(kind: string, fourcc: string): string {
  return `${kind}:${fourcc}`;
}

/**
 * Base payload attached to every event (provisional — pending T2.2 ontology).
 */
function basePayload(fourcc: string): Record<string, unknown> {
  return { fourcc, resolved: false };
}

// ---------------------------------------------------------------------------
// Player result derivation
// ---------------------------------------------------------------------------

/**
 * Derive a player's win/loss/unknown result from the replay's winningTeamId.
 * When winningTeamId is -1 (no winner recorded, e.g. FLO replays), all
 * players get 'unknown'.
 */
function derivePlayerResult(
  playerTeamId: number,
  winningTeamId: number
): ReplayPlayer["result"] {
  if (winningTeamId === -1) return "unknown";
  return playerTeamId === winningTeamId ? "win" : "loss";
}

// ---------------------------------------------------------------------------
// Per-event generators
// ---------------------------------------------------------------------------

/**
 * Emit build events from player.buildings.order.
 * Expansion halls are emitted as `expand` instead of `build` (see file-level comment).
 */
function* buildEvents(
  player: ParserOutput["players"][number],
  slot: number,
  replayId: string
): Generator<GameEvent> {
  for (const entry of player.buildings.order) {
    const isExpand = EXPANSION_HALL_FOURCCS.has(entry.id);
    const type: GameEventType = isExpand ? "expand" : "build";
    // Both build and expand are buildings, so the entityRef kind is always "building".
    yield {
      replayId,
      slot,
      tMs: entry.ms,
      type,
      entityRef: provisionalRef("building", entry.id),
      payload: { ...basePayload(entry.id) },
    };
  }
}

/**
 * Emit train events from player.units.order.
 * These are TRAIN COMMANDS — the moment a player queued the unit.
 * The unit may not have been completed if the building was destroyed mid-queue.
 * actual unit spawn time = tMs + build_time (requires ontology — T2.2).
 *
 * TODO(T2.2): add payload.spawnTMs once ontology build times are available.
 */
function* trainEvents(
  player: ParserOutput["players"][number],
  slot: number,
  replayId: string
): Generator<GameEvent> {
  for (const entry of player.units.order) {
    yield {
      replayId,
      slot,
      tMs: entry.ms,
      type: "train",
      entityRef: provisionalRef("unit", entry.id),
      payload: { ...basePayload(entry.id) },
    };
  }
}

/**
 * Emit upgrade events from player.upgrades.order.
 */
function* upgradeEvents(
  player: ParserOutput["players"][number],
  slot: number,
  replayId: string
): Generator<GameEvent> {
  for (const entry of player.upgrades.order) {
    yield {
      replayId,
      slot,
      tMs: entry.ms,
      type: "upgrade",
      entityRef: provisionalRef("upgrade", entry.id),
      payload: { ...basePayload(entry.id) },
    };
  }
}

/**
 * Emit item events from player.items.order.
 */
function* itemEvents(
  player: ParserOutput["players"][number],
  slot: number,
  replayId: string
): Generator<GameEvent> {
  for (const entry of player.items.order) {
    yield {
      replayId,
      slot,
      tMs: entry.ms,
      type: "item",
      entityRef: provisionalRef("item", entry.id),
      payload: { ...basePayload(entry.id) },
    };
  }
}

/**
 * Emit learn_skill events from hero ability orders.
 * Only entries where type === 'ability' are skill learns; 'retraining' entries
 * are skill resets and are not surfaced here (they have no entityRef).
 *
 * The payload includes heroFourcc so analytics can associate the skill with
 * the specific hero.
 *
 * TODO(T2.2): resolve heroFourcc → canonical hero ontology ID.
 */
function* learnSkillEvents(
  player: ParserOutput["players"][number],
  slot: number,
  replayId: string
): Generator<GameEvent> {
  for (const hero of player.heroes) {
    for (const entry of hero.abilityOrder) {
      if (entry.type !== "ability") continue;
      yield {
        replayId,
        slot,
        tMs: entry.time,
        type: "learn_skill",
        entityRef: provisionalRef("ability", entry.value),
        payload: {
          ...basePayload(entry.value),
          heroFourcc: hero.id,
        },
      };
    }
  }
}

/**
 * Emit hero_level events inferred from ability learn timestamps.
 *
 * Rationale: every `ability` entry in abilityOrder represents a skill point spent,
 * which happens at the SAME tick as levelling up (the player is prompted to spend
 * the skill point upon levelling).  So for level N, the level-up tMs is the
 * timestamp of the N-th `ability` entry in chronological order.
 *
 * Caveat: retraining resets the level; we skip over `retraining` entries and
 * restart the level counter.  After a retrain, skill points restart from 1.
 * This is a best-effort approximation: if a hero levels without ever spending
 * a skill point (possible via cheats in custom games, not in ladder), the event
 * would be missed.  For ladder replays this is a reliable inference.
 *
 * TODO(T1.4): cross-validate against Observer API hero level samples to measure
 * the approximation error, if any.
 */
function* heroLevelEvents(
  player: ParserOutput["players"][number],
  slot: number,
  replayId: string
): Generator<GameEvent> {
  for (const hero of player.heroes) {
    let level = 0;
    for (const entry of hero.abilityOrder) {
      if (entry.type === "retraining") {
        // Retraining resets levels; skill point counter restarts.
        level = 0;
        continue;
      }
      level += 1;
      yield {
        replayId,
        slot,
        tMs: entry.time,
        type: "hero_level",
        entityRef: provisionalRef("hero", hero.id),
        payload: {
          fourcc: hero.id,
          resolved: false,
          level,
          abilityFourcc: entry.value,
        },
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Player-level normalizer
// ---------------------------------------------------------------------------

/**
 * Collect all events for a single player and return them unsorted.
 * Sorting across all players happens in normalizeReplay().
 */
function eventsForPlayer(
  player: ParserOutput["players"][number],
  slot: number,
  replayId: string
): GameEvent[] {
  const events: GameEvent[] = [];

  for (const ev of buildEvents(player, slot, replayId)) events.push(ev);
  for (const ev of trainEvents(player, slot, replayId)) events.push(ev);
  for (const ev of upgradeEvents(player, slot, replayId)) events.push(ev);
  for (const ev of itemEvents(player, slot, replayId)) events.push(ev);
  for (const ev of learnSkillEvents(player, slot, replayId)) events.push(ev);
  for (const ev of heroLevelEvents(player, slot, replayId)) events.push(ev);

  // TODO(T1.4): emit move/attack events (requires low-level ActionParser pass
  //   over 0x11/0x12 opcodes — high volume, deferred).
  // TODO(T2.2): emit unit_spawn events (requires build_time from ontology).
  // TODO(T1.4): emit unit_death events via Observer API (NOT in .w3g — design doc §6).

  return events;
}

// ---------------------------------------------------------------------------
// Main normalizer
// ---------------------------------------------------------------------------

/**
 * Map raw w3gjs output into a canonical ReplayTimeline.
 *
 * @param result   - The ParserOutput from W3GReplay.parse().
 * @param instance - The W3GReplay instance (needed for leaveEvents / w3mmd,
 *                   which live on the instance rather than the ParserOutput).
 * @param fileHash - SHA-256 hex digest of the source .w3g file (computed by caller).
 *
 * This function is PURE with respect to side-effects: it does no file I/O.
 * All I/O (file reading, hashing, w3gjs parsing) is the caller's responsibility.
 */
export function normalizeReplay(
  result: ParserOutput,
  instance: W3GReplay,
  fileHash: string
): ReplayTimeline {
  const replayId = fileHash; // ingest (T1.3) will overwrite with a real UUID

  // ------------------------------------------------------------------
  // Map: winningTeamId → winnerSlot
  // -1 means no winner recorded (common for FLO replays).
  // FLO replays need external enrichment (W3Champions match API) to
  // resolve the true winner.  See gotcha in spike-dump.ts.
  // ------------------------------------------------------------------
  const winningTeamId = result.winningTeamId;
  let winnerSlot: number | null = null;

  if (winningTeamId !== -1) {
    // Find the slot of the first non-observer player on the winning team.
    for (const player of result.players) {
      if (instance.isObserver(player)) continue;
      if (player.teamid === winningTeamId) {
        winnerSlot = player.id; // w3gjs player.id is the slot number (1-based)
        break;
      }
    }
  }

  // ------------------------------------------------------------------
  // Map players, filtering out observers
  // ------------------------------------------------------------------
  const players: ReplayPlayer[] = [];
  for (const player of result.players) {
    if (instance.isObserver(player)) continue;
    players.push({
      slot: player.id,
      playerName: player.name,
      // Provisional race ref: "race:<raceDetected>" using the inferred race.
      // raceDetected is preferred over race when the player picked Random,
      // since race may be "R" but raceDetected reflects the actual race played.
      // TODO(T2.2): resolve to canonical ontology race ID (e.g. "race:orc").
      raceId: provisionalRef("race", player.raceDetected !== "" ? player.raceDetected : player.race),
      apm: player.apm,
      result: derivePlayerResult(player.teamid, winningTeamId),
    });
  }

  // ------------------------------------------------------------------
  // Collect and sort all events across all non-observer players
  // ------------------------------------------------------------------
  const allEvents: GameEvent[] = [];
  for (const player of result.players) {
    if (instance.isObserver(player)) continue;
    const evts = eventsForPlayer(player, player.id, replayId);
    for (const ev of evts) allEvents.push(ev);
  }

  // Stable sort ascending by tMs (events at the same tMs retain their
  // insertion order: within a tick, build comes before train which comes
  // before upgrade etc., matching the generator call order above).
  allEvents.sort((a, b) => a.tMs - b.tMs);

  // ------------------------------------------------------------------
  // Map metadata
  // ------------------------------------------------------------------

  // mapId: provisional raw file name; T2.2 will canonicalize.
  const mapId = provisionalRef("map", result.map.file);

  // patchId: provisional version+buildNumber string.
  // T2.3 will tie this to a proper patch_versions table entry.
  const patchId = `patch:${result.version}+${result.buildNumber}`;

  // playedAt: w3gjs does NOT provide a wall-clock play time.
  // Setting to "" here; the ingest layer (T1.3) should enrich this from:
  //   1. file mtime (approximate)
  //   2. W3Champions match API (authoritative, if available)
  const playedAt = "";

  return {
    replayId,
    fileHash,
    mapId,
    playedAt,
    durationMs: result.duration,
    patchId,
    winnerSlot,
    players,
    events: allEvents,
  };
}
