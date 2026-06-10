/** Format milliseconds to M:SS */
export function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Race raceId → short code for matchup label */
const RACE_CODES: Record<string, string> = {
  "race:orc": "O",
  "race:human": "H",
  "race:nightelf": "NE",
  "race:undead": "UD",
  "race:random": "R",
};

export function raceCode(raceId: string): string {
  return RACE_CODES[raceId] ?? raceId.replace("race:", "").toUpperCase();
}

/** Race raceId → display name */
const RACE_NAMES: Record<string, string> = {
  "race:orc": "Orc",
  "race:human": "Human",
  "race:nightelf": "Night Elf",
  "race:undead": "Undead",
  "race:random": "Random",
};

export function raceName(raceId: string): string {
  return RACE_NAMES[raceId] ?? raceId.replace("race:", "");
}

/** Race raceId → CSS custom property color */
const RACE_COLORS: Record<string, string> = {
  "race:orc": "#b82020",
  "race:human": "#3a6abf",
  "race:nightelf": "#7a3dbf",
  "race:undead": "#6baa2a",
};

export function raceColor(raceId: string): string {
  return RACE_COLORS[raceId] ?? "#c8972a";
}

/** Derive matchup label from two raceIds, Orc-first convention */
export function matchupLabel(raceIds: string[]): string {
  // Sort so Orc is first if present
  const sorted = [...raceIds].sort((a, b) => {
    if (a === "race:orc") return -1;
    if (b === "race:orc") return 1;
    return 0;
  });
  return sorted.map(raceCode).join("v");
}

/** Strip the namespace prefix from an entityRef, humanize underscores */
export function humanizeRef(ref: string): string {
  const parts = ref.split(":");
  const name = parts[parts.length - 1] ?? ref;
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Strip map: prefix and clean up map name */
export function humanizeMap(mapId: string | null): string {
  if (!mapId) return "Unknown Map";
  // e.g. "map:61_w3c_251104_0950_ShallowGrave_v1.5.w3x" → "ShallowGrave v1.5"
  const name = mapId.replace(/^map:/, "").replace(/\.w3x$/, "");
  // Drop leading numeric/date tokens
  const parts = name.split("_");
  // Find the first part that looks like a real name (starts with capital or non-digit)
  const startIdx = parts.findIndex((p) => /^[A-Za-z]/.test(p));
  const meaningful = startIdx >= 0 ? parts.slice(startIdx) : parts;
  return meaningful.join(" ");
}
