/**
 * Navigator state <-> URL query string (shareable links). Pure functions, unit-tested.
 *
 * /app?site=<id> | lat=&lon=, start=<ISO>, days=, step=, terrain=auto|flat, t=<ISO selected time>, tab=,
 *      mode=simple|expert, emargin=<deg>
 * Defaults: site=shackleton-ridge, start=now floored to the hour, days=14, step=60, terrain=auto, t=start,
 * mode=null (caller falls back to the remembered choice, then "simple"), emargin=0.
 */

export type TerrainChoice = "auto" | "flat";
export type NavMode = "simple" | "expert";
export type NavTab = "compare" | "best" | "map" | "learn";
export type Location = { kind: "site"; siteId: string } | { kind: "custom"; lat: number; lon: number };

export type NavState = {
  location: Location;
  start: Date;
  days: number;
  step: number; // minutes
  terrain: TerrainChoice;
  t: Date; // selected time
  tab: NavTab | null;
  /** null when the URL has no mode (the navigator then uses the remembered choice, else "simple"). */
  mode: NavMode | null;
  /** Expert: extra clearance Earth must have above the skyline (deg), sent as earth_margin_deg. */
  earthMargin: number;
  /** Tab settings kept in the URL as-is (cmp = compare scenarios; b* = best-dates inputs). */
  extras: Partial<Record<ExtraKey, string>>;
};

export const EXTRA_KEYS = ["cmp", "bsite", "bfrom", "bto", "bdays", "bterrain", "bgap"] as const;
export type ExtraKey = (typeof EXTRA_KEYS)[number];

export const DEFAULT_SITE = "shackleton-ridge";
export const DEFAULT_DAYS = 14;
export const DEFAULT_STEP = 60;
export const STEPS = [30, 60, 180] as const; // presets; expert mode allows any 5-1440
export const MIN_STEP = 5;
export const MAX_STEP = 1440;
export const MAX_EARTH_MARGIN = 10;
export const MIN_DAYS = 1;
export const MAX_DAYS = 60;
const TABS: NavTab[] = ["compare", "best", "map", "learn"];

export function floorToHour(d: Date): Date {
  const out = new Date(d);
  out.setUTCMinutes(0, 0, 0);
  return out;
}

function parseDate(v: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseNum(v: string | null): number | null {
  if (v === null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Accepts -180..180 or 0..360; returns -180..180 (null if out of range). */
export function normalizeLon(lon: number): number | null {
  if (!Number.isFinite(lon) || lon < -180 || lon > 360) return null;
  const n = ((lon + 180) % 360 + 360) % 360 - 180;
  return n === -180 && lon > 0 ? 180 : n;
}

export function validLat(lat: number): boolean {
  return Number.isFinite(lat) && lat >= -90 && lat <= 90;
}

export function parseNavState(params: URLSearchParams, now: Date = new Date()): NavState {
  const lat = parseNum(params.get("lat"));
  const lonRaw = parseNum(params.get("lon"));
  const lon = lonRaw === null ? null : normalizeLon(lonRaw);
  const siteId = params.get("site");

  let location: Location;
  if (siteId) location = { kind: "site", siteId };
  else if (lat !== null && lon !== null && validLat(lat)) location = { kind: "custom", lat, lon };
  else location = { kind: "site", siteId: DEFAULT_SITE };

  const start = parseDate(params.get("start")) ?? floorToHour(now);
  const daysRaw = parseNum(params.get("days"));
  const days = daysRaw === null ? DEFAULT_DAYS : Math.min(MAX_DAYS, Math.max(MIN_DAYS, Math.round(daysRaw)));
  const stepRaw = parseNum(params.get("step"));
  const step =
    stepRaw !== null && Number.isInteger(stepRaw) && stepRaw >= MIN_STEP && stepRaw <= MAX_STEP ? stepRaw : DEFAULT_STEP;
  const terrain: TerrainChoice = params.get("terrain") === "flat" ? "flat" : "auto";
  const end = new Date(start.getTime() + days * 86_400_000);
  let t = parseDate(params.get("t")) ?? start;
  if (t < start || t >= end) t = start;
  const tabRaw = params.get("tab");
  const tab = TABS.includes(tabRaw as NavTab) ? (tabRaw as NavTab) : null;
  const extras: NavState["extras"] = {};
  for (const k of EXTRA_KEYS) {
    const v = params.get(k);
    if (v) extras[k] = v;
  }

  const modeRaw = params.get("mode");
  const mode: NavMode | null = modeRaw === "expert" || modeRaw === "simple" ? modeRaw : null;
  const em = parseNum(params.get("emargin"));
  const earthMargin = em === null ? 0 : Math.min(MAX_EARTH_MARGIN, Math.max(0, Math.round(em * 10) / 10));

  return { location, start, days, step, terrain, t, tab, mode, earthMargin, extras };
}

/** ISO without milliseconds, e.g. 2026-12-01T00:00:00Z. */
export function isoUtc(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function serializeNavState(s: NavState): URLSearchParams {
  const q = new URLSearchParams();
  if (s.location.kind === "site") q.set("site", s.location.siteId);
  else {
    q.set("lat", String(round(s.location.lat, 4)));
    q.set("lon", String(round(s.location.lon, 4)));
  }
  q.set("start", isoUtc(s.start));
  q.set("days", String(s.days));
  q.set("step", String(s.step));
  q.set("terrain", s.terrain);
  if (s.t.getTime() !== s.start.getTime()) q.set("t", isoUtc(s.t));
  if (s.tab) q.set("tab", s.tab);
  if (s.mode) q.set("mode", s.mode);
  if (s.earthMargin > 0) q.set("emargin", String(s.earthMargin));
  for (const k of EXTRA_KEYS) {
    const v = s.extras[k];
    if (v) q.set(k, v);
  }
  return q;
}

/** Nearest array index for time t, given the series start and step (clamped to 0..n-1). */
export function indexForTime(t: Date, start: Date, stepMinutes: number, n: number): number {
  if (n <= 0) return 0;
  const i = Math.round((t.getTime() - start.getTime()) / (stepMinutes * 60_000));
  return Math.min(n - 1, Math.max(0, i));
}

function round(v: number, d: number): number {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}
