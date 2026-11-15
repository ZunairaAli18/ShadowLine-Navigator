import type { Region } from "@/lib/api";

const REGION_LABELS: Record<Region, string> = {
  equatorial: "Equatorial",
  far_side: "Far side",
  south_polar: "South polar",
  south_pole: "South pole",
  north_polar: "North polar",
  north_pole: "North pole",
};

export function regionLabel(region: Region): string {
  return REGION_LABELS[region] ?? region;
}

/** Current UTC time floored to the hour (stable across renders, friendly to the backend cache). */
export function nowHourUtc(): Date {
  const d = new Date();
  d.setUTCMinutes(0, 0, 0);
  return d;
}

/** Navigator deep links. F2 reads these query parameters. */
export function navigatorUrl(params: {
  site?: string;
  start?: string | Date;
  days?: number;
  tab?: "best" | "compare";
}): string {
  const q = new URLSearchParams();
  if (params.site) q.set("site", params.site);
  if (params.start) q.set("start", params.start instanceof Date ? params.start.toISOString() : params.start);
  if (params.days) q.set("days", String(params.days));
  if (params.tab) q.set("tab", params.tab);
  const s = q.toString();
  return s ? `/app?${s}` : "/app";
}

/**
 * Site coordinates, the same way everywhere: "0.67°N 23.47°E" (2 decimals; Expert mode may use 4).
 * Longitude is normalized to -180..180; a value that rounds to 0 is shown as N / E (never "0.00°S").
 */
export function formatLatLon(lat: number, lon: number, decimals = 2): string {
  const f = 10 ** decimals;
  const la = Math.round(lat * f) / f;
  let lo = ((((lon + 180) % 360) + 360) % 360) - 180;
  if (lo === -180 && lon > 0) lo = 180;
  lo = Math.round(lo * f) / f;
  const ns = la < 0 ? "S" : "N";
  const ew = lo < 0 ? "W" : "E";
  return `${Math.abs(la).toFixed(decimals)}°${ns} ${Math.abs(lo).toFixed(decimals)}°${ew}`;
}

/** Plain "lat, lon" (east-positive decimals) for copying into other tools. */
export function latLonPlain(lat: number, lon: number, decimals = 4): string {
  return `${lat.toFixed(decimals)}, ${lon.toFixed(decimals)}`;
}
