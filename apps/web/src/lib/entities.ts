/**
 * Entity-ref helpers for rendering game entities (heroes, units, buildings,
 * upgrades, abilities) with icons.
 *
 * Entity refs are the canonical resolved form "kind:key", e.g. "hero:far_seer",
 * "unit:peon", "building:altar_of_storms" (see packages/ontology).
 *
 * Icons follow a CONVENTION (no DB column): /icons/<kind>/<key>.png served from
 * apps/web/public/. Missing files fall back to a CSS placeholder tile, so the UI
 * works with zero art and improves as PNGs are dropped in by key.
 */

export type EntityKind =
  | "unit"
  | "building"
  | "hero"
  | "upgrade"
  | "ability"
  | "race"
  | "unknown";

const KNOWN_KINDS = new Set<string>([
  "unit",
  "building",
  "hero",
  "upgrade",
  "ability",
  "race",
]);

export interface ParsedEntity {
  kind: EntityKind;
  key: string;
}

/** Split "hero:far_seer" → { kind: "hero", key: "far_seer" }. */
export function parseEntityRef(ref: string): ParsedEntity {
  const idx = ref.indexOf(":");
  if (idx === -1) return { kind: "unknown", key: ref };
  const kind = ref.slice(0, idx);
  const key = ref.slice(idx + 1);
  return { kind: (KNOWN_KINDS.has(kind) ? kind : "unknown") as EntityKind, key };
}

/** "far_seer" → "Far Seer". Tolerates unresolved fourcc-ish keys (left as-is-ish). */
export function entityDisplayName(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Convention path for an entity's icon image. */
export function entityIconSrc(kind: string, key: string): string {
  return `/icons/${kind}/${key}.png`;
}

/** Up-to-2-letter initials for the placeholder tile ("far_seer" → "FS"). */
export function entityInitials(key: string): string {
  const words = key.split(/[_\s]+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0]!.charAt(0) + words[1]!.charAt(0)).toUpperCase();
  }
  return key.slice(0, 2).toUpperCase();
}

/**
 * Distinct hero refs ("hero:<key>") a player produced, in first-seen order.
 * Derived from the replay timeline so the UI can show the actual heroes played.
 */
export function heroRefsForSlot(
  events: { slot: number; entityRef: string }[],
  slot: number,
): string[] {
  const seen: string[] = [];
  for (const e of events) {
    if (e.slot !== slot) continue;
    if (!e.entityRef.startsWith("hero:")) continue;
    if (!seen.includes(e.entityRef)) seen.push(e.entityRef);
  }
  return seen;
}

/** Placeholder tile background color, by entity kind. */
export function kindColor(kind: string): string {
  switch (kind) {
    case "hero":
      return "#7a3dbf"; // arcane purple
    case "unit":
      return "#3a6abf"; // steel blue
    case "building":
      return "#8a6820"; // stone gold
    case "upgrade":
      return "#6baa2a"; // research green
    case "ability":
      return "#b8862a"; // spell amber
    default:
      return "#555";
  }
}
