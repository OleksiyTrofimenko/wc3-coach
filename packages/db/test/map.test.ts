/**
 * T1.3 / T2.1 — Unit tests for @wc3-coach/db pure mapping functions.
 *
 * These tests cover map.ts (timelineToReplayRow, timelineToPlayerRows,
 * timelineToEventRows, parsePatchId). No live database is required.
 *
 * PRINCIPLE #1: All fixtures represent post-game .w3g data only.
 */

import { describe, it, expect } from "vitest";
import type { ReplayTimeline } from "@wc3-coach/shared-types";
import {
  timelineToReplayRow,
  timelineToPlayerRows,
  timelineToEventRows,
  parsePatchId,
} from "../src/map.js";

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

/** Minimal hand-built ReplayTimeline that exercises all mapping paths. */
const FIXTURE: ReplayTimeline = {
  replayId: "fixture-replay-id",
  fileHash: "abc123def456abc123def456abc123def456abc123def456abc123def456abc1",
  mapId: "map:echo_isles",
  playedAt: "",
  durationMs: 435_395,
  patchId: "patch:2.00+6117",
  winnerSlot: null,
  players: [
    {
      slot: 1,
      playerName: "Tayfa#2198",
      raceId: "race:O",
      apm: 87,
      result: "unknown",
    },
    {
      slot: 2,
      playerName: "xiaomozhate#3187",
      raceId: "race:N",
      apm: 112,
      result: "unknown",
    },
  ],
  events: [
    {
      replayId: "fixture-replay-id",
      slot: 1,
      tMs: 1182,
      type: "train",
      entityRef: "unit:opeo",
      payload: { fourcc: "opeo", resolved: false },
    },
    {
      replayId: "fixture-replay-id",
      slot: 1,
      tMs: 3975,
      type: "build",
      entityRef: "building:oalt",
      payload: { fourcc: "oalt", resolved: false },
    },
    {
      replayId: "fixture-replay-id",
      slot: 2,
      tMs: 5000,
      type: "train",
      entityRef: "unit:ewsp",
      payload: { fourcc: "ewsp", resolved: false },
    },
  ],
};

const REPLAY_UUID = "11111111-2222-3333-4444-555555555555";

// ---------------------------------------------------------------------------
// parsePatchId
// ---------------------------------------------------------------------------

describe("parsePatchId", () => {
  it("parses a valid patchId string", () => {
    const result = parsePatchId("patch:2.00+6117");
    expect(result).not.toBeNull();
    expect(result!.version).toBe("2.00");
    expect(result!.buildNumber).toBe(6117);
  });

  it("parses a semver-style version", () => {
    const result = parsePatchId("patch:1.36.1+5765");
    expect(result).not.toBeNull();
    expect(result!.version).toBe("1.36.1");
    expect(result!.buildNumber).toBe(5765);
  });

  it("returns null for a malformed string", () => {
    expect(parsePatchId("invalid")).toBeNull();
    expect(parsePatchId("patch:2.00")).toBeNull();
    expect(parsePatchId("2.00+6117")).toBeNull();
    expect(parsePatchId("")).toBeNull();
  });

  it("returns null when build number is not an integer", () => {
    expect(parsePatchId("patch:2.00+abc")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// timelineToReplayRow
// ---------------------------------------------------------------------------

describe("timelineToReplayRow", () => {
  const row = timelineToReplayRow(FIXTURE);

  it("maps fileHash correctly", () => {
    expect(row.fileHash).toBe(FIXTURE.fileHash);
  });

  it("maps mapId correctly", () => {
    expect(row.mapId).toBe("map:echo_isles");
  });

  it("maps durationMs correctly", () => {
    expect(row.durationMs).toBe(435_395);
  });

  it("maps winnerSlot to null when null in timeline", () => {
    expect(row.winnerSlot).toBeNull();
  });

  it("sets status to 'done'", () => {
    expect(row.status).toBe("done");
  });

  it("sets error to null", () => {
    expect(row.error).toBeNull();
  });

  it("sets playedAt to null (w3gjs provides no wall-clock time)", () => {
    expect(row.playedAt).toBeNull();
  });

  it("rawMeta includes patchId, playerCount, eventCount", () => {
    const meta = row.rawMeta as Record<string, unknown>;
    expect(meta["patchId"]).toBe("patch:2.00+6117");
    expect(meta["playerCount"]).toBe(2);
    expect(meta["eventCount"]).toBe(3);
  });

  it("maps empty mapId to null", () => {
    const emptyMapTimeline: ReplayTimeline = { ...FIXTURE, mapId: "" };
    const emptyRow = timelineToReplayRow(emptyMapTimeline);
    expect(emptyRow.mapId).toBeNull();
  });

  it("maps zero durationMs to null", () => {
    const zeroDur: ReplayTimeline = { ...FIXTURE, durationMs: 0 };
    const zeroRow = timelineToReplayRow(zeroDur);
    expect(zeroRow.durationMs).toBeNull();
  });

  it("maps non-null winnerSlot correctly", () => {
    const winnerTimeline: ReplayTimeline = { ...FIXTURE, winnerSlot: 1 };
    const winnerRow = timelineToReplayRow(winnerTimeline);
    expect(winnerRow.winnerSlot).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// timelineToPlayerRows
// ---------------------------------------------------------------------------

describe("timelineToPlayerRows", () => {
  const rows = timelineToPlayerRows(FIXTURE, REPLAY_UUID);

  it("returns one row per player", () => {
    expect(rows).toHaveLength(2);
  });

  it("injects replayId into every row", () => {
    for (const r of rows) {
      expect(r.replayId).toBe(REPLAY_UUID);
    }
  });

  it("maps slot correctly", () => {
    const p1 = rows.find((r) => r.slot === 1);
    expect(p1).toBeDefined();
    expect(p1!.playerName).toBe("Tayfa#2198");
  });

  it("maps raceId correctly", () => {
    const p1 = rows.find((r) => r.slot === 1);
    expect(p1!.raceId).toBe("race:O");
    const p2 = rows.find((r) => r.slot === 2);
    expect(p2!.raceId).toBe("race:N");
  });

  it("maps apm correctly", () => {
    const p1 = rows.find((r) => r.slot === 1);
    expect(p1!.apm).toBe(87);
  });

  it("maps result correctly", () => {
    for (const r of rows) {
      expect(r.result).toBe("unknown");
    }
  });

  it("maps empty raceId to null", () => {
    const emptyRaceTimeline: ReplayTimeline = {
      ...FIXTURE,
      players: [{ ...FIXTURE.players[0]!, raceId: "" }],
    };
    const emptyRows = timelineToPlayerRows(emptyRaceTimeline, REPLAY_UUID);
    expect(emptyRows[0]!.raceId).toBeNull();
  });

  it("maps zero apm to null", () => {
    const zeroApmTimeline: ReplayTimeline = {
      ...FIXTURE,
      players: [{ ...FIXTURE.players[0]!, apm: 0 }],
    };
    const zeroRows = timelineToPlayerRows(zeroApmTimeline, REPLAY_UUID);
    expect(zeroRows[0]!.apm).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// timelineToEventRows
// ---------------------------------------------------------------------------

describe("timelineToEventRows", () => {
  const rows = timelineToEventRows(FIXTURE, REPLAY_UUID);

  it("returns one row per event", () => {
    expect(rows).toHaveLength(3);
  });

  it("injects replayId into every row", () => {
    for (const r of rows) {
      expect(r.replayId).toBe(REPLAY_UUID);
    }
  });

  it("maps first event correctly", () => {
    const first = rows[0];
    expect(first).toBeDefined();
    expect(first!.slot).toBe(1);
    expect(first!.tMs).toBe(1182);
    expect(first!.type).toBe("train");
    expect(first!.entityRef).toBe("unit:opeo");
  });

  it("maps payload through as-is", () => {
    const first = rows[0];
    const payload = first!.payload as Record<string, unknown>;
    expect(payload["fourcc"]).toBe("opeo");
    expect(payload["resolved"]).toBe(false);
  });

  it("preserves event ordering (ascending tMs)", () => {
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i]!.tMs).toBeGreaterThanOrEqual(rows[i - 1]!.tMs);
    }
  });

  it("maps all event types correctly", () => {
    const types = rows.map((r) => r.type);
    expect(types).toContain("train");
    expect(types).toContain("build");
  });

  it("no id field in event rows (bigint identity — DB assigns it)", () => {
    for (const r of rows) {
      expect("id" in r).toBe(false);
    }
  });

  it("handles empty events array", () => {
    const emptyTimeline: ReplayTimeline = { ...FIXTURE, events: [] };
    const emptyRows = timelineToEventRows(emptyTimeline, REPLAY_UUID);
    expect(emptyRows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Round-trip sanity: counts
// ---------------------------------------------------------------------------

describe("mapping counts are consistent", () => {
  it("player count matches timeline.players.length", () => {
    const rows = timelineToPlayerRows(FIXTURE, REPLAY_UUID);
    expect(rows.length).toBe(FIXTURE.players.length);
  });

  it("event count matches timeline.events.length", () => {
    const rows = timelineToEventRows(FIXTURE, REPLAY_UUID);
    expect(rows.length).toBe(FIXTURE.events.length);
  });
});
