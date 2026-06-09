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
 * TODO(T1.1): Spike — parse one replay with w3gjs; dump all events to JSON.
 *   Add w3gjs as a dependency: "w3gjs": "^2.x"  (do NOT install until T1.1)
 *
 * TODO(T1.2): Map raw w3gjs commands → canonical GameEvent:
 *   - build / train / upgrade / learn_skill / item / move / attack /
 *     hero_level / expand
 *   - Each event carries: t_ms, entity_ref (→ ontology), player_id, payload
 *
 * TODO(T1.3): Wire into ingest queue (BullMQ) via apps/api-node.
 *
 * See docs/WC3_Coach_Design_Doc.md §3 (parser) and §6 (.w3g limitations).
 */

// Placeholder export so the package builds cleanly.
// Replace in T1.1/T1.2 with the real parse() function.
export const PARSER_VERSION = "0.0.1" as const;

/**
 * Temporary stub — will be replaced by ReplayTimeline from @wc3-coach/shared-types in T1.2.
 * Import ReplayTimeline directly once T1.2 lands.
 */
export type ParseResult = {
  // TODO(T1.2): replace with ReplayTimeline from @wc3-coach/shared-types
  _parseResult: true;
};

/**
 * Placeholder parse function.
 * TODO(T1.1): implement with w3gjs.
 */
export async function parseReplay(_filePath: string): Promise<ParseResult> {
  throw new Error(
    "parseReplay is not implemented yet. See TODO(T1.1) in this file."
  );
}
