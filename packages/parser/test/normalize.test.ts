/**
 * T1.2 — Normalization golden-file test
 *
 * Asserts that parseReplayFile() produces the correct ReplayTimeline shape
 * and known specific values from the T1.1 spike for this fixture.
 *
 * Fixture: w3c-20260426112948.w3g
 *   - 1v1 Orc (Tayfa#2198, slot 1) vs Night Elf (xiaomozhate#3187, slot 2)
 *   - Saved by FLO — winningTeamId = -1 (no winner recorded)
 *   - Game duration: 435 395 ms (≈7:15)
 *   - Replay version: 2.00, build 6117
 *
 * PRINCIPLE #1: post-game .w3g replay only. No live data.
 */

import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseReplayFile } from "../src/index.js";
import type { GameEventType, ReplayTimeline } from "@wc3-coach/shared-types";

// Resolve the fixture path relative to this test file.
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const FIXTURE_PATH = resolve(__dirname, "fixtures", "w3c-20260426112948.w3g");

// Known sha256 of the fixture file (from T1.1 spike dump).
const FIXTURE_SHA256 = "1d6117f6844460270d02fdfd09362a4468bd051a2a512933a4fe74cc1bda42aa";

describe("parseReplayFile — w3c-20260426112948 golden fixture", () => {
  let timeline: ReplayTimeline;

  // Parse once; all tests share the result.
  it("parses without throwing", async () => {
    timeline = await parseReplayFile(FIXTURE_PATH);
    expect(timeline).toBeDefined();
  });

  // ------------------------------------------------------------------
  // Top-level metadata
  // ------------------------------------------------------------------

  it("fileHash matches known sha256", () => {
    expect(timeline.fileHash).toBe(FIXTURE_SHA256);
  });

  it("replayId is set to fileHash (ingest will overwrite with UUID)", () => {
    expect(timeline.replayId).toBe(timeline.fileHash);
  });

  it("durationMs is 435395", () => {
    expect(timeline.durationMs).toBe(435395);
  });

  it("winnerSlot is null (FLO replay, winningTeamId = -1)", () => {
    expect(timeline.winnerSlot).toBeNull();
  });

  it("mapId is a provisional map: ref from the w3x filename", () => {
    expect(timeline.mapId).toMatch(/^map:/);
    expect(timeline.mapId).toContain("ShallowGrave");
  });

  it("patchId encodes version and buildNumber", () => {
    expect(timeline.patchId).toBe("patch:2.00+6117");
  });

  it("playedAt is empty string (w3gjs provides no wall-clock time)", () => {
    expect(timeline.playedAt).toBe("");
  });

  // ------------------------------------------------------------------
  // Players
  // ------------------------------------------------------------------

  it("has exactly 2 players (observers filtered out)", () => {
    // FLO observer should be excluded.
    expect(timeline.players).toHaveLength(2);
  });

  it("player names match the replay", () => {
    const names = timeline.players.map((p) => p.playerName);
    expect(names).toContain("Tayfa#2198");
    expect(names).toContain("xiaomozhate#3187");
  });

  it("Tayfa is Orc (slot 1)", () => {
    const tayfa = timeline.players.find((p) => p.playerName === "Tayfa#2198");
    expect(tayfa).toBeDefined();
    expect(tayfa!.slot).toBe(1);
    expect(tayfa!.raceId).toBe("race:O");
  });

  it("xiaomozhate is Night Elf (slot 2)", () => {
    const xiao = timeline.players.find((p) => p.playerName === "xiaomozhate#3187");
    expect(xiao).toBeDefined();
    expect(xiao!.slot).toBe(2);
    expect(xiao!.raceId).toBe("race:N");
  });

  it("both players have result=unknown (FLO no-winner)", () => {
    for (const p of timeline.players) {
      expect(p.result).toBe("unknown");
    }
  });

  it("both players have positive APM", () => {
    for (const p of timeline.players) {
      expect(p.apm).toBeGreaterThan(0);
    }
  });

  // ------------------------------------------------------------------
  // Events — ordering
  // ------------------------------------------------------------------

  it("events array is non-empty", () => {
    expect(timeline.events.length).toBeGreaterThan(0);
  });

  it("events are sorted ascending by tMs (stable)", () => {
    for (let i = 1; i < timeline.events.length; i++) {
      const prev = timeline.events[i - 1];
      const curr = timeline.events[i];
      expect(curr!.tMs).toBeGreaterThanOrEqual(prev!.tMs);
    }
  });

  // ------------------------------------------------------------------
  // Events — known specific values from T1.1 spike dump
  // ------------------------------------------------------------------

  it("first event is Tayfa train:opeo at tMs 1182", () => {
    // opeo = Orc Peon; first queued unit in the replay
    const first = timeline.events[0];
    expect(first).toBeDefined();
    expect(first!.tMs).toBe(1182);
    expect(first!.type).toBe("train");
    expect(first!.entityRef).toBe("unit:opeo");
    expect(first!.slot).toBe(1);
  });

  it("Tayfa has a build event for oalt (Altar of Storms) near tMs 3975", () => {
    const buildAlt = timeline.events.find(
      (e) =>
        e.slot === 1 &&
        e.type === "build" &&
        e.entityRef === "building:oalt"
    );
    expect(buildAlt).toBeDefined();
    expect(buildAlt!.tMs).toBe(3975);
  });

  it("Tayfa has learn_skill events for Blade Master abilities", () => {
    const skills = timeline.events.filter(
      (e) => e.slot === 1 && e.type === "learn_skill"
    );
    // AOmi = Mirror Image, AOcr = Critical Strike — both on Blade Master
    const abilityFourccs = skills.map((e) => e.entityRef.split(":")[1]);
    expect(abilityFourccs).toContain("AOmi");
    expect(abilityFourccs).toContain("AOcr");
  });

  it("all events have valid GameEventType values", () => {
    const VALID_TYPES = new Set<GameEventType>([
      "build", "train", "upgrade", "learn_skill", "item",
      "move", "attack", "hero_level", "unit_spawn", "unit_death", "expand",
    ]);
    for (const ev of timeline.events) {
      expect(VALID_TYPES.has(ev.type)).toBe(true);
    }
  });

  it("every event has payload.resolved === false (ontology not yet resolved)", () => {
    for (const ev of timeline.events) {
      expect(ev.payload["resolved"]).toBe(false);
    }
  });

  it("every event has payload.fourcc (raw FourCC string)", () => {
    for (const ev of timeline.events) {
      expect(typeof ev.payload["fourcc"]).toBe("string");
      expect((ev.payload["fourcc"] as string).length).toBeGreaterThan(0);
    }
  });

  it("every event's replayId matches the fileHash", () => {
    for (const ev of timeline.events) {
      expect(ev.replayId).toBe(timeline.fileHash);
    }
  });

  it("every event's entityRef is namespaced (contains a colon)", () => {
    for (const ev of timeline.events) {
      expect(ev.entityRef).toMatch(/^[a-z]+:[A-Za-z0-9]+$/);
    }
  });

  // ------------------------------------------------------------------
  // Events — Tayfa upgrade events exist (Roen, Rowt from spike dump)
  // ------------------------------------------------------------------

  it("Tayfa has upgrade events (Roen and Rowt)", () => {
    const upgrades = timeline.events.filter(
      (e) => e.slot === 1 && e.type === "upgrade"
    );
    const fourccs = upgrades.map((e) => e.entityRef.split(":")[1]);
    expect(fourccs).toContain("Roen");
    expect(fourccs).toContain("Rowt");
  });

  // ------------------------------------------------------------------
  // Events — event-type counts per player (regression snapshot)
  // ------------------------------------------------------------------

  it("event-type count snapshot per player", () => {
    const counts: Record<number, Record<string, number>> = {};
    for (const ev of timeline.events) {
      const slotCounts = (counts[ev.slot] ??= {});
      slotCounts[ev.type] = (slotCounts[ev.type] ?? 0) + 1;
    }

    // Tayfa (slot 1) — Orc, from the dump:
    //   buildings: 10 orders (but oalt emitted as build — no oexp in list)
    //   units: 18 orders
    //   upgrades: 2
    //   items: 4
    //   learn_skill: 3 (AOmi, AOcr, AOhx)
    //   hero_level: 3 (one per ability learn)
    const tayfaCounts = counts[1] ?? {};
    expect(tayfaCounts["build"]).toBe(10);    // all 10 building orders are plain builds (no expansion hall)
    expect(tayfaCounts["train"]).toBe(18);
    expect(tayfaCounts["upgrade"]).toBe(2);
    expect(tayfaCounts["item"]).toBe(4);
    expect(tayfaCounts["learn_skill"]).toBe(3);
    expect(tayfaCounts["hero_level"]).toBe(3);

    // xiaomozhate (slot 2) — Night Elf, from the dump:
    //   buildings: 15 orders (eaom x2, emow x5, eate x1, edob x1, etrp x6 — no eexp)
    //   units: 25 orders
    //   upgrades: 0
    //   items: 0
    //   learn_skill: 3 (ANlm, ANia, ANlm — Keeper of the Grove)
    //   hero_level: 3
    const xiaoCounts = counts[2] ?? {};
    expect(xiaoCounts["build"]).toBe(15);
    expect(xiaoCounts["train"]).toBe(25);
    expect(xiaoCounts["upgrade"]).toBeUndefined(); // 0 upgrades
    expect(xiaoCounts["item"]).toBeUndefined();     // 0 items
    expect(xiaoCounts["learn_skill"]).toBe(3);
    expect(xiaoCounts["hero_level"]).toBe(3);
  });

  // ------------------------------------------------------------------
  // Events — no unit_death or unit_spawn (not implemented yet)
  // ------------------------------------------------------------------

  it("no unit_death events (not in .w3g — requires Observer API)", () => {
    const deaths = timeline.events.filter((e) => e.type === "unit_death");
    expect(deaths).toHaveLength(0);
  });

  it("no unit_spawn events (requires ontology build times — T2.2)", () => {
    const spawns = timeline.events.filter((e) => e.type === "unit_spawn");
    expect(spawns).toHaveLength(0);
  });

  // ------------------------------------------------------------------
  // Events — no move or attack events (deferred — T1.4)
  // ------------------------------------------------------------------

  it("no move events (deferred to T1.4 low-level ActionParser pass)", () => {
    const moves = timeline.events.filter((e) => e.type === "move");
    expect(moves).toHaveLength(0);
  });
});
