import { describe, it, expect } from "vitest";
import {
  parseEntityRef,
  entityDisplayName,
  entityIconSrc,
  entityInitials,
  kindColor,
} from "../src/lib/entities";

describe("parseEntityRef", () => {
  it("splits kind:key", () => {
    expect(parseEntityRef("hero:far_seer")).toEqual({
      kind: "hero",
      key: "far_seer",
    });
    expect(parseEntityRef("unit:peon")).toEqual({ kind: "unit", key: "peon" });
  });

  it("marks unknown kinds", () => {
    expect(parseEntityRef("widget:foo")).toEqual({
      kind: "unknown",
      key: "foo",
    });
  });

  it("handles a ref with no colon", () => {
    expect(parseEntityRef("plain")).toEqual({ kind: "unknown", key: "plain" });
  });

  it("keeps the full key when the value contains a colon-like slug", () => {
    // only the FIRST colon splits kind from key
    expect(parseEntityRef("building:altar_of_storms")).toEqual({
      kind: "building",
      key: "altar_of_storms",
    });
  });
});

describe("entityDisplayName", () => {
  it("title-cases underscore slugs", () => {
    expect(entityDisplayName("far_seer")).toBe("Far Seer");
    expect(entityDisplayName("tauren_chieftain")).toBe("Tauren Chieftain");
    expect(entityDisplayName("peon")).toBe("Peon");
  });
});

describe("entityIconSrc", () => {
  it("builds the convention path", () => {
    expect(entityIconSrc("hero", "far_seer")).toBe("/icons/hero/far_seer.png");
  });
});

describe("entityInitials", () => {
  it("uses first letters of two words", () => {
    expect(entityInitials("far_seer")).toBe("FS");
  });
  it("uses first two chars for single-word keys", () => {
    expect(entityInitials("peon")).toBe("PE");
  });
});

describe("kindColor", () => {
  it("returns distinct colors per kind and a default", () => {
    expect(kindColor("hero")).not.toBe(kindColor("unit"));
    expect(kindColor("anything-else")).toBe("#555");
  });
});
