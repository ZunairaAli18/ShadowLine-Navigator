/**
 * CSV builders for Expert-mode downloads (pure, unit-tested). RFC 4180 quoting, UTC ISO times, "\n" line ends.
 */

import type { BestWindowsResponse, ScenarioResult, VisibilityResponse } from "./api";
import type { TimelineEvent } from "./countdowns";

export type Cell = string | number | boolean | null | undefined;

export function csvCell(v: Cell): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "number" ? (Number.isFinite(v) ? String(v) : "") : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Cell[][], comments: string[] = []): string {
  const head = comments.map((c) => `# ${c.replace(/[\r\n]+/g, " ")}`);
  return [...head, ...rows.map((r) => r.map(csvCell).join(","))].join("\n") + "\n";
}

export const isoUtc = (d: Date | string | number) => new Date(d).toISOString().replace(/\.\d{3}Z$/, "Z");

export const SERIES_COLUMNS = [
  "time_utc",
  "sun_az_deg",
  "sun_el_deg",
  "sun_horizon_el_deg",
  "sun_visible_fraction",
  "earth_az_deg",
  "earth_el_deg",
  "earth_horizon_el_deg",
  "earth_visible",
] as const;

/** Time series CSV: metadata as comment lines, then one row per time step. */
export function seriesCsv(v: VisibilityResponse, meta: { terrainMode: string; earthMarginDeg: number }): string {
  const rows: Cell[][] = [[...SERIES_COLUMNS]];
  for (let i = 0; i < v.times.length; i++) {
    rows.push([
      isoUtc(v.times[i]),
      v.sun.az[i],
      v.sun.el[i],
      v.sun.horizon_el[i],
      v.sun.visible_fraction[i],
      v.earth.az[i],
      v.earth.el[i],
      v.earth.horizon_el[i],
      v.earth.visible[i],
    ]);
  }
  return toCsv(rows, [
    `Shadowline time series`,
    `site=${v.site.id} (${v.site.name}) lat=${v.site.lat} lon=${v.site.lon}`,
    `terrain=${v.terrain} terrain_mode=${meta.terrainMode} earth_margin_deg=${meta.earthMarginDeg}`,
    `start=${isoUtc(v.start)} step_minutes=${v.step_minutes} steps=${v.times.length}`,
  ]);
}

export function eventsCsv(events: TimelineEvent[], startMs: number): string {
  return toCsv([
    ["event", "time_utc", "hours_from_start"],
    ...events.map((e) => [e.kind, isoUtc(Math.round(e.time / 1000) * 1000), Math.round(((e.time - startMs) / 3_600_000) * 100) / 100]),
  ]);
}

export function compareCsv(results: ScenarioResult[], labels: (string | undefined)[]): string {
  return toCsv([
    ["label", "site", "lat", "lon", "terrain", "start_utc", "days", "verdict", "sun_pct", "earth_pct", "both_pct", "longest_dark_h", "longest_no_earth_h", "power_index", "next_sunset_utc", "next_earthset_utc"],
    ...results.map((r, i) => [
      labels[i] ?? r.label ?? "",
      r.site.id,
      r.site.lat,
      r.site.lon,
      r.terrain,
      isoUtc(r.start),
      r.days,
      r.metrics.verdict,
      r.metrics.sun_pct,
      r.metrics.earth_pct,
      r.metrics.both_pct,
      r.metrics.longest_dark_hours,
      r.metrics.longest_no_earth_hours,
      r.metrics.power_index,
      r.metrics.next_sunset ? isoUtc(r.metrics.next_sunset) : "",
      r.metrics.next_earthset ? isoUtc(r.metrics.next_earthset) : "",
    ]),
  ]);
}

export function bestWindowsCsv(b: BestWindowsResponse): string {
  return toCsv(
    [
      ["rank", "start_utc", "end_utc", "verdict", "sun_pct", "earth_pct", "both_pct", "longest_dark_h", "reasons"],
      ...b.windows.map((w, i) => [i + 1, isoUtc(w.start), isoUtc(w.end), w.verdict, w.sun_pct, w.earth_pct, w.both_pct, w.longest_dark_hours, w.verdict_reasons.join("; ")]),
    ],
    [`site=${b.site.id} mission_days=${b.mission_days} range=${isoUtc(b.range_start)}..${isoUtc(b.range_end)} candidates=${b.candidates_evaluated}`],
  );
}

/** shadowline_<site>_<YYYYMMDD>_<days>d<suffix>.<ext> */
export function downloadName(site: string, start: Date | string, days: number, ext: string, suffix = ""): string {
  const d = isoUtc(start).slice(0, 10).replace(/-/g, "");
  const safe = site.replace(/[^a-z0-9-]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "site";
  return `shadowline_${safe}_${d}_${days}d${suffix}.${ext}`;
}

/** Browser download of a text file. */
export function downloadText(name: string, text: string, mime = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
