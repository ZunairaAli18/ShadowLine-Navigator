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
