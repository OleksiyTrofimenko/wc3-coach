/**
 * T2.2 — FourCC resolver unit tests
 *
 * Tests the pure resolveEntityRef() function against the FourCCs present in
 * the fixture replay w3c-20260426112948.json (NvO matchup, patch 2.00).
 *
 * No live DB required — all lookups are built in-memory from the seed data's
 * known FourCC↔key mappings.
 *
 * Fixture FourCCs covered:
 *   Orc units:     opeo, ogru, orai
 *   Orc buildings: oalt, otrb, obar, ovln, ostr, obea, otto
 *   Orc upgrades:  Roen, Rowt
 *   Orc heroes:    Obla, Oshd
 *   Orc abilities: AOmi, AOcr, AOhx
 *   NE units:      ewsp, earc, esen
 *   NE buildings:  eaom, emow, eate, edob, etrp
 *   NE heroes:     Nfir
 *   NE abilities:  ANlm, ANia
 *   Races:         O → orc, N → nightelf
 *
 * PRINCIPLE #1: fixture is a post-game .w3g replay dump only.
 */

import { describe, it, expect } from "vitest";
import {
  resolveEntityRef,
  resolveRaceRef,
  buildKindLookup,
  RACE_LETTER_MAP,
} from "../src/index.js";
import type { FourccLookup } from "../src/index.js";

// ---------------------------------------------------------------------------
// Build in-memory lookup from known seed FourCC↔key pairs
// ---------------------------------------------------------------------------

/**
 * Minimal {fourcc, key, id} rows constructed from the seed data.
 * These must match the fourcc values in ontology.orc.json and ontology.nightelf.json.
 */
const unitRows = [
  { fourcc: "opeo", key: "peon",     id: "uid-opeo" },
  { fourcc: "ogru", key: "grunt",    id: "uid-ogru" },
  { fourcc: "orai", key: "raider",   id: "uid-orai" },
  { fourcc: "ewsp", key: "wisp",     id: "uid-ewsp" },
  { fourcc: "earc", key: "archer",   id: "uid-earc" },
  { fourcc: "esen", key: "huntress", id: "uid-esen" },
];

const buildingRows = [
  { fourcc: "oalt", key: "altar_of_storms",  id: "bid-oalt" },
  { fourcc: "otrb", key: "orc_burrow",       id: "bid-otrb" },
  { fourcc: "obar", key: "barracks",         id: "bid-obar" },
  { fourcc: "ovln", key: "voodoo_lounge",    id: "bid-ovln" },
  { fourcc: "ostr", key: "stronghold",       id: "bid-ostr" },
  { fourcc: "obea", key: "beastiary",        id: "bid-obea" },
  { fourcc: "otto", key: "orc_watch_tower",  id: "bid-otto" },
  { fourcc: "eaom", key: "altar_of_elders",  id: "bid-eaom" },
  { fourcc: "emow", key: "moon_well",        id: "bid-emow" },
  { fourcc: "eate", key: "ancient_of_war",   id: "bid-eate" },
  { fourcc: "edob", key: "ancient_of_lore",  id: "bid-edob" },
  { fourcc: "etrp", key: "ancient_protector", id: "bid-etrp" },
];

const upgradeRows = [
  { fourcc: "Roen", key: "ensnare",                    id: "upg-Roen" },
  { fourcc: "Rowt", key: "witch_doctor_adept_training", id: "upg-Rowt" },
];

const heroRows = [
  { fourcc: "Obla", key: "blademaster",        id: "hero-Obla" },
  { fourcc: "Oshd", key: "shadow_hunter",      id: "hero-Oshd" },
  { fourcc: "Nfir", key: "firelord", id: "hero-Nfir" },
];

const abilityRows = [
  { fourcc: "AOmi", key: "mirror_image",    id: "abl-AOmi" },
  { fourcc: "AOcr", key: "critical_strike", id: "abl-AOcr" },
  { fourcc: "AOhx", key: "hex",             id: "abl-AOhx" },
  { fourcc: "ANlm", key: "summon_lava_spawn", id: "abl-ANlm" },
  { fourcc: "ANia", key: "incinerate",        id: "abl-ANia" },
];

const LOOKUP: FourccLookup = {
  unit:     buildKindLookup(unitRows,     "unit"),
  building: buildKindLookup(buildingRows, "building"),
  upgrade:  buildKindLookup(upgradeRows,  "upgrade"),
  hero:     buildKindLookup(heroRows,     "hero"),
  ability:  buildKindLookup(abilityRows,  "ability"),
};

// ---------------------------------------------------------------------------
// Race letter map
// ---------------------------------------------------------------------------

describe("RACE_LETTER_MAP", () => {
  it("maps O to orc", () => {
    expect(RACE_LETTER_MAP["O"]).toBe("orc");
  });

  it("maps N to nightelf", () => {
    expect(RACE_LETTER_MAP["N"]).toBe("nightelf");
  });

  it("maps H to human", () => {
    expect(RACE_LETTER_MAP["H"]).toBe("human");
  });

  it("maps U to undead", () => {
    expect(RACE_LETTER_MAP["U"]).toBe("undead");
  });

  it("maps R to random", () => {
    expect(RACE_LETTER_MAP["R"]).toBe("random");
  });
});

// ---------------------------------------------------------------------------
// Race refs
// ---------------------------------------------------------------------------

describe("resolveRaceRef", () => {
  it("resolves race:O → race:orc", () => {
    expect(resolveRaceRef("race:O")).toBe("race:orc");
  });

  it("resolves race:N → race:nightelf", () => {
    expect(resolveRaceRef("race:N")).toBe("race:nightelf");
  });

  it("resolves race:H → race:human", () => {
    expect(resolveRaceRef("race:H")).toBe("race:human");
  });

  it("resolves race:U → race:undead", () => {
    expect(resolveRaceRef("race:U")).toBe("race:undead");
  });

  it("resolves race:R → race:random", () => {
    expect(resolveRaceRef("race:R")).toBe("race:random");
  });

  it("returns null for unknown race letter", () => {
    expect(resolveRaceRef("race:X")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Orc unit FourCCs (fixture-confirmed)
// ---------------------------------------------------------------------------

describe("resolveEntityRef — Orc units", () => {
  it("unit:opeo → unit:peon", () => {
    expect(resolveEntityRef("unit:opeo", LOOKUP)).toBe("unit:peon");
  });

  it("unit:ogru → unit:grunt", () => {
    expect(resolveEntityRef("unit:ogru", LOOKUP)).toBe("unit:grunt");
  });

  it("unit:orai → unit:raider", () => {
    expect(resolveEntityRef("unit:orai", LOOKUP)).toBe("unit:raider");
  });
});

// ---------------------------------------------------------------------------
// Orc building FourCCs (fixture-confirmed)
// ---------------------------------------------------------------------------

describe("resolveEntityRef — Orc buildings", () => {
  it("building:oalt → building:altar_of_storms", () => {
    expect(resolveEntityRef("building:oalt", LOOKUP)).toBe("building:altar_of_storms");
  });

  it("building:otrb → building:orc_burrow", () => {
    expect(resolveEntityRef("building:otrb", LOOKUP)).toBe("building:orc_burrow");
  });

  it("building:obar → building:barracks", () => {
    expect(resolveEntityRef("building:obar", LOOKUP)).toBe("building:barracks");
  });

  it("building:ovln → building:voodoo_lounge", () => {
    expect(resolveEntityRef("building:ovln", LOOKUP)).toBe("building:voodoo_lounge");
  });

  it("building:ostr → building:stronghold", () => {
    expect(resolveEntityRef("building:ostr", LOOKUP)).toBe("building:stronghold");
  });

  it("building:obea → building:beastiary", () => {
    expect(resolveEntityRef("building:obea", LOOKUP)).toBe("building:beastiary");
  });

  it("building:otto → building:orc_watch_tower", () => {
    expect(resolveEntityRef("building:otto", LOOKUP)).toBe("building:orc_watch_tower");
  });
});

// ---------------------------------------------------------------------------
// Orc upgrade FourCCs (fixture-confirmed)
// ---------------------------------------------------------------------------

describe("resolveEntityRef — Orc upgrades", () => {
  it("upgrade:Roen → upgrade:ensnare", () => {
    expect(resolveEntityRef("upgrade:Roen", LOOKUP)).toBe("upgrade:ensnare");
  });

  it("upgrade:Rowt → upgrade:witch_doctor_adept_training", () => {
    expect(resolveEntityRef("upgrade:Rowt", LOOKUP)).toBe("upgrade:witch_doctor_adept_training");
  });
});

// ---------------------------------------------------------------------------
// Orc heroes (fixture-confirmed)
// ---------------------------------------------------------------------------

describe("resolveEntityRef — Orc heroes", () => {
  it("hero:Obla → hero:blademaster", () => {
    expect(resolveEntityRef("hero:Obla", LOOKUP)).toBe("hero:blademaster");
  });

  it("hero:Oshd → hero:shadow_hunter", () => {
    expect(resolveEntityRef("hero:Oshd", LOOKUP)).toBe("hero:shadow_hunter");
  });
});

// ---------------------------------------------------------------------------
// Orc hero abilities (fixture-confirmed)
// ---------------------------------------------------------------------------

describe("resolveEntityRef — Orc hero abilities", () => {
  it("ability:AOmi → ability:mirror_image", () => {
    expect(resolveEntityRef("ability:AOmi", LOOKUP)).toBe("ability:mirror_image");
  });

  it("ability:AOcr → ability:critical_strike", () => {
    expect(resolveEntityRef("ability:AOcr", LOOKUP)).toBe("ability:critical_strike");
  });

  it("ability:AOhx → ability:hex", () => {
    expect(resolveEntityRef("ability:AOhx", LOOKUP)).toBe("ability:hex");
  });
});

// ---------------------------------------------------------------------------
// Night Elf unit FourCCs (fixture-confirmed)
// ---------------------------------------------------------------------------

describe("resolveEntityRef — Night Elf units", () => {
  it("unit:ewsp → unit:wisp", () => {
    expect(resolveEntityRef("unit:ewsp", LOOKUP)).toBe("unit:wisp");
  });

  it("unit:earc → unit:archer", () => {
    expect(resolveEntityRef("unit:earc", LOOKUP)).toBe("unit:archer");
  });

  it("unit:esen → unit:huntress", () => {
    expect(resolveEntityRef("unit:esen", LOOKUP)).toBe("unit:huntress");
  });
});

// ---------------------------------------------------------------------------
// Night Elf building FourCCs (fixture-confirmed)
// ---------------------------------------------------------------------------

describe("resolveEntityRef — Night Elf buildings", () => {
  it("building:eaom → building:altar_of_elders", () => {
    expect(resolveEntityRef("building:eaom", LOOKUP)).toBe("building:altar_of_elders");
  });

  it("building:emow → building:moon_well", () => {
    expect(resolveEntityRef("building:emow", LOOKUP)).toBe("building:moon_well");
  });

  it("building:eate → building:ancient_of_war", () => {
    expect(resolveEntityRef("building:eate", LOOKUP)).toBe("building:ancient_of_war");
  });

  it("building:edob → building:ancient_of_lore", () => {
    expect(resolveEntityRef("building:edob", LOOKUP)).toBe("building:ancient_of_lore");
  });

  it("building:etrp → building:ancient_protector", () => {
    expect(resolveEntityRef("building:etrp", LOOKUP)).toBe("building:ancient_protector");
  });
});

// ---------------------------------------------------------------------------
// Night Elf heroes (fixture-confirmed)
// ---------------------------------------------------------------------------

describe("resolveEntityRef — Neutral (Tavern) heroes", () => {
  it("hero:Nfir → hero:firelord (Firelord is a neutral Tavern hero, not a Night Elf race hero)", () => {
    expect(resolveEntityRef("hero:Nfir", LOOKUP)).toBe("hero:firelord");
  });
});

// ---------------------------------------------------------------------------
// Firelord (neutral Tavern hero) abilities — fixture-confirmed FourCCs
// ---------------------------------------------------------------------------

describe("resolveEntityRef — Firelord abilities (neutral Tavern hero)", () => {
  it("ability:ANlm → ability:summon_lava_spawn (Firelord ability, fixture-confirmed)", () => {
    expect(resolveEntityRef("ability:ANlm", LOOKUP)).toBe("ability:summon_lava_spawn");
  });

  it("ability:ANia → ability:incinerate (Firelord ability, fixture-confirmed)", () => {
    expect(resolveEntityRef("ability:ANia", LOOKUP)).toBe("ability:incinerate");
  });
});

// ---------------------------------------------------------------------------
// Unknown / invalid refs → null
// ---------------------------------------------------------------------------

describe("resolveEntityRef — unknown/invalid refs", () => {
  it("returns null for unknown unit FourCC", () => {
    expect(resolveEntityRef("unit:xxxx", LOOKUP)).toBeNull();
  });

  it("returns null for unknown building FourCC", () => {
    expect(resolveEntityRef("building:zzzz", LOOKUP)).toBeNull();
  });

  it("returns null for unknown hero FourCC", () => {
    expect(resolveEntityRef("hero:Zzzz", LOOKUP)).toBeNull();
  });

  it("returns null for unknown upgrade FourCC", () => {
    expect(resolveEntityRef("upgrade:Zunk", LOOKUP)).toBeNull();
  });

  it("returns null for unknown ability FourCC", () => {
    expect(resolveEntityRef("ability:ZZzz", LOOKUP)).toBeNull();
  });

  it("returns null for ref without colon separator", () => {
    expect(resolveEntityRef("unitopeo", LOOKUP)).toBeNull();
  });

  it("returns null for ref with empty kind", () => {
    expect(resolveEntityRef(":opeo", LOOKUP)).toBeNull();
  });

  it("returns null for ref with empty code", () => {
    expect(resolveEntityRef("unit:", LOOKUP)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(resolveEntityRef("", LOOKUP)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildKindLookup — shape tests
// ---------------------------------------------------------------------------

describe("buildKindLookup", () => {
  it("skips rows with null fourcc", () => {
    const rows = [
      { fourcc: null, key: "some_unit", id: "uid-1" },
      { fourcc: "opeo", key: "peon", id: "uid-2" },
    ];
    const map = buildKindLookup(rows, "unit");
    expect(map.size).toBe(1);
    expect(map.has("opeo")).toBe(true);
    expect(map.has("null")).toBe(false);
  });

  it("stores the correct key and id", () => {
    const rows = [{ fourcc: "ogru", key: "grunt", id: "uid-ogru" }];
    const map = buildKindLookup(rows, "unit");
    const entry = map.get("ogru");
    expect(entry?.key).toBe("grunt");
    expect(entry?.id).toBe("uid-ogru");
  });

  it("returns empty map for empty input", () => {
    const map = buildKindLookup([], "unit");
    expect(map.size).toBe(0);
  });
});
