/**
 * Compare scenarios <-> the `cmp` URL parameter (pure, unit-tested).
 *
 *   cmp=<loc>~<start ISO>~<days>~<terrain>[~<label>],<next scenario>,...   (max 3)
 *   <loc> = site id, or "lat:lon" for custom coordinates (":" because "," separates scenarios)
 *   <label> is URI-encoded (with "~" escaped too).
 */

import { isoUtc, MAX_DAYS, MIN_DAYS, normalizeLon, validLat, type Location, type TerrainChoice } from "./navState";

export const MAX_SCENARIOS = 3;
export const LUNAR_DAY_DAYS = 29.53; // synodic month: one sunrise-to-sunrise cycle

export type CmpScenario = {
  location: Location;
  start: Date;
  days: number;
  terrain: TerrainChoice;
  label?: string;
};

const encLabel = (s: string) => encodeURIComponent(s).replace(/~/g, "%7E");

export function encodeScenarios(list: CmpScenario[]): string {
  return list
    .slice(0, MAX_SCENARIOS)
    .map((s) => {
      const loc = s.location.kind === "site" ? s.location.siteId : `${round4(s.location.lat)}:${round4(s.location.lon)}`;
      const parts = [loc, isoUtc(s.start), String(s.days), s.terrain];
      if (s.label) parts.push(encLabel(s.label));
      return parts.join("~");
    })
    .join(",");
}

export function decodeScenarios(raw: string | null | undefined): CmpScenario[] {
  if (!raw) return [];
  const out: CmpScenario[] = [];
  for (const chunk of raw.split(",")) {
    const [loc, startS, daysS, terrainS, labelS] = chunk.split("~");
    if (!loc || !startS) continue;
    let location: Location | null = null;
    if (loc.includes(":")) {
      const [latS, lonS] = loc.split(":");
      const lat = Number(latS);
      const lon = normalizeLon(Number(lonS));
      if (validLat(lat) && lon !== null && latS !== "" && lonS !== "") location = { kind: "custom", lat, lon };
    } else if (/^[a-z0-9-]+$/i.test(loc)) {
      location = { kind: "site", siteId: loc };
    }
    const start = new Date(startS);
    const days = Math.round(Number(daysS));
    if (!location || Number.isNaN(start.getTime())) continue;
    let label: string | undefined;
    try {
      label = labelS ? decodeURIComponent(labelS) : undefined;
    } catch {
      label = undefined;
    }
    out.push({
      location,
      start,
      days: Number.isFinite(days) ? Math.min(MAX_DAYS, Math.max(MIN_DAYS, days)) : 14,
      terrain: terrainS === "flat" ? "flat" : "auto",
      label,
    });
    if (out.length === MAX_SCENARIOS) break;
  }
  return out;
}

// ---------------------------------------------------------------- presets

type Base = { location: Location; start: Date; days: number };

export function presetFlatVsReal(b: Base): CmpScenario[] {
  return [
    { ...b, terrain: "auto", label: "Real terrain" },
    { ...b, terrain: "flat", label: "Flat horizon" },
  ];
}

export function presetLaunchSlips(b: Base): CmpScenario[] {
  return [0, 1, 2].map((k) => ({
    ...b,
    start: new Date(b.start.getTime() + Math.round(k * LUNAR_DAY_DAYS * 24) * 3_600_000),
    terrain: "auto" as const,
    label: k === 0 ? "On time" : `Slips ${k} lunar day${k > 1 ? "s" : ""}`,
  }));
}

export function presetEquatorVsPole(b: Omit<Base, "location">): CmpScenario[] {
  return [
    { location: { kind: "site", siteId: "apollo-11" }, start: b.start, days: b.days, terrain: "auto", label: "Equator" },
    { location: { kind: "site", siteId: "im-2" }, start: b.start, days: b.days, terrain: "auto", label: "Mons Mouton" },
    { location: { kind: "site", siteId: "shackleton-ridge" }, start: b.start, days: b.days, terrain: "auto", label: "Pole ridge" },
  ];
}

/** Index of the best value (ties: first). higherIsBetter=false for durations of darkness etc. */
export function bestIndex(values: (number | null | undefined)[], higherIsBetter: boolean): number | null {
  let best: number | null = null;
  values.forEach((v, i) => {
    if (v === null || v === undefined || !Number.isFinite(v)) return;
    if (best === null) best = i;
    else if (higherIsBetter ? v > (values[best] as number) : v < (values[best] as number)) best = i;
  });
  // A "best" among identical values isn't informative.
  const finite = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (finite.length < 2 || finite.every((v) => v === finite[0])) return null;
  return best;
}

function round4(v: number) {
  return Math.round(v * 1e4) / 1e4;
}
