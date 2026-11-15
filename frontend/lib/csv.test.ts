import { describe, expect, it } from "vitest";

import type { VisibilityResponse } from "./api";
import { csvCell, downloadName, eventsCsv, isoUtc, SERIES_COLUMNS, seriesCsv, toCsv } from "./csv";
import { verdictSentence } from "./verdictSentence";

describe("csvCell / toCsv", () => {
  it("escapes quotes, commas and newlines", () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(NaN)).toBe("");
    expect(csvCell(true)).toBe("true");
    expect(csvCell(-1.5)).toBe("-1.5");
  });

  it("writes comments then rows, newline-terminated", () => {
    expect(toCsv([["a", "b"], [1, "x,y"]], ["meta"])).toBe('# meta\na,b\n1,"x,y"\n');
  });

  it("formats UTC ISO times without milliseconds", () => {
    expect(isoUtc("2026-12-01T00:00:00.000Z")).toBe("2026-12-01T00:00:00Z");
  });
});

const vis = {
  site: { id: "im-2", name: 'IM-2 "Athena", Mons Mouton', lat: -84.79, lon: 29.2, region: "south_pole", has_terrain: true },
  terrain: "lola",
  start: "2026-12-01T00:00:00Z",
  step_minutes: 60,
  times: ["2026-12-01T00:00:00Z", "2026-12-01T01:00:00Z", "2026-12-01T02:00:00Z"],
  sun: { az: [10, 11, 12], el: [1.5, 1.6, 1.7], horizon_el: [1, 1, 1], visible_fraction: [1, 1, 0.5] },
  earth: { az: [300, 301, 302], el: [-1, 0.2, 0.4], horizon_el: [0.1, 0.1, 0.1], visible: [false, true, true] },
} as unknown as VisibilityResponse;

describe("seriesCsv", () => {
  it("has the metadata, the column order and one row per time step", () => {
    const csv = seriesCsv(vis, { terrainMode: "auto", earthMarginDeg: 2 });
    const lines = csv.trim().split("\n");
    const comments = lines.filter((l) => l.startsWith("#"));
    const data = lines.filter((l) => !l.startsWith("#"));
    expect(comments.join(" ")).toContain("site=im-2");
    expect(comments.join(" ")).toContain("earth_margin_deg=2");
    expect(data[0]).toBe(SERIES_COLUMNS.join(","));
    expect(data).toHaveLength(1 + vis.times.length);
    expect(data[1]).toBe("2026-12-01T00:00:00Z,10,1.5,1,1,300,-1,0.1,false");
    expect(data[3].split(",")[4]).toBe("0.5");
  });
});

describe("eventsCsv and file names", () => {
  it("lists events with UTC times and hours from start", () => {
    const t0 = Date.UTC(2026, 11, 1);
    const csv = eventsCsv([{ kind: "sunset", time: t0 + 2.5 * 3_600_000, pos: 2.5 }], t0);
    expect(csv).toBe("event,time_utc,hours_from_start\nsunset,2026-12-01T02:30:00Z,2.5\n");
  });

  it("builds shadowline_<site>_<start>_<days>d names", () => {
    expect(downloadName("shackleton-ridge", "2026-12-01T00:00:00Z", 14, "csv")).toBe("shadowline_shackleton-ridge_20261201_14d.csv");
    expect(downloadName("custom", new Date("2027-01-05T10:00:00Z"), 7, "json", "_raw")).toBe("shadowline_custom_20270105_7d_raw.json");
  });
});

describe("verdictSentence", () => {
  it("explains a far-side site in plain words", () => {
    const s = verdictSentence({ verdict: "not_viable", sun_pct: 92, earth_pct: 0, longest_dark_hours: 26, longest_dark_truncated: true });
    expect(s).toBe("Not viable because Earth never rises above the skyline here, so the lander would need a relay satellite to talk home.");
  });

  it("explains long darkness", () => {
    const s = verdictSentence({ verdict: "not_viable", sun_pct: 2.4, earth_pct: 100, longest_dark_hours: 328, longest_dark_truncated: false });
    expect(s).toBe("Not viable because the Sun is up only 2% of the time and the longest darkness is 14 days, too long for batteries.");
  });

  it("explains risky and good", () => {
    expect(verdictSentence({ verdict: "risky", sun_pct: 100, earth_pct: 42, longest_dark_hours: 0, longest_dark_truncated: false })).toBe(
      "Risky because Earth is in view only 42% of the time, so contact would be patchy.",
    );
    expect(verdictSentence({ verdict: "good", sun_pct: 99, earth_pct: 100, longest_dark_hours: 4, longest_dark_truncated: false })).toBe(
      "Good: the Sun is up 99% of the time, Earth is in view 100% of the time and the longest dark spell is only 4 hours.",
    );
  });
});
