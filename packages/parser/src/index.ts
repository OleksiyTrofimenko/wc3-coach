/**
 * @wc3-coach/parser — .w3g replay parser wrapping w3gjs
 *
 * This package is the Node-side entry point for replay parsing. It wraps
 * w3gjs (https://github.com/PBug90/w3gjs) and normalizes raw opcodes into
 * canonical GameEvent shapes from @wc3-coach/shared-types.
 *
 * IMPORTANT — Principle #1 (CLAUDE.md):
 *   This parser operates ONLY on saved .w3g files after the game ends.
 *   No live-game memory reading, packet sniffing, or process introspection.
 *   Observer API usage (War3StatsObserverSharedMemory) is allowed ONLY during
 *   replay playback in observer mode, never during a live ladder/W3C game.
 *
 * ## Public API
 *
 *   parseReplayFile(path)  — reads a .w3g file and returns a ReplayTimeline
 *   normalizeReplay(...)   — pure mapper; useful for testing with pre-parsed data
 *   PARSER_VERSION         — semver string for the parser implementation
 *
 * ## TODO backlog
 *
 * TODO(T1.3): Wire parseReplayFile into the BullMQ ingest queue in apps/api-node.
 * TODO(T1.4): Add move/attack events via low-level ActionParser (0x11/0x12 opcodes).
 * TODO(T1.4): Add unit_death events via Observer API (design doc §6 Path B).
 * TODO(T2.2): Resolve provisional entityRef strings to canonical ontology IDs.
 * TODO(T2.3): Resolve provisional patchId to a patch_versions table entry.
 *
 * See docs/WC3_Coach_Design_Doc.md §3 (parser) and §6 (.w3g limitations).
 */

export { parseReplayFile } from "./parse.js";
export { normalizeReplay } from "./normalize.js";

/**
 * Semver of the parser implementation.
 * Bump on any breaking change to the output shape.
 */
export const PARSER_VERSION = "0.1.0" as const;
