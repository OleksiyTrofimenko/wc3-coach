/**
 * parseReplayFile — file I/O + hashing + w3gjs parse → ReplayTimeline
 *
 * This module owns all side-effects (fs reads, sha256, w3gjs instantiation).
 * The normalization logic itself is pure and lives in normalize.ts.
 *
 * PRINCIPLE #1 COMPLIANCE: operates ONLY on saved .w3g files after the game ends.
 */

import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import W3GReplay from "w3gjs";
import type { ReplayTimeline } from "@wc3-coach/shared-types";
import { normalizeReplay } from "./normalize.js";

/**
 * Parse a .w3g replay file and return a canonical ReplayTimeline.
 *
 * Steps:
 *  1. Read the file into a Buffer (throws if the file does not exist).
 *  2. Compute the SHA-256 file hash (used for dedup in T1.3).
 *  3. Parse with w3gjs (throws on corrupt/unsupported replay).
 *  4. Normalize raw output → ReplayTimeline via normalizeReplay().
 *
 * @param filePath - Absolute path to the .w3g file.
 * @returns The canonical ReplayTimeline.
 */
export async function parseReplayFile(filePath: string): Promise<ReplayTimeline> {
  const buf = await readFile(filePath);

  const fileHash = createHash("sha256").update(buf).digest("hex");

  const instance = new W3GReplay();
  const result = await instance.parse(buf);

  return normalizeReplay(result, instance, fileHash);
}
