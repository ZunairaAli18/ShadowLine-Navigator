import { describe, expect, it } from "vitest";

import {
  bestIndex,
  decodeScenarios,
  encodeScenarios,
  LUNAR_DAY_DAYS,
  presetEquatorVsPole,
  presetFlatVsReal,
  presetLaunchSlips,
  type CmpScenario,
} from "./compareUrl";

const start = new Date("2026-12-01T00:00:00Z");
const base = { location: { kind: "site" as const, siteId: "shackleton-ridge" }, start, days: 14 };

describe("encode/decode", () => {
  it("round-trips sites, custom coordinates and labels (with separators in them)", () => {
    const list: CmpScenario[] = [
      { location: { kind: "site", siteId: "im-2" }, start, days: 14, terrain: "auto", label: "A, b~c" },
      { location: { kind: "custom", lat: -85.25, lon: -40 }, start, days: 7, terrain: "flat" },
    ];
    const enc = encodeScenarios(list);
    expect(enc).toBe("im-2~2026-12-01T00:00:00Z~14~auto~A%2C%20b%7Ec,-85.25:-40~2026-12-01T00:00:00Z~7~flat");
    expect(decodeScenarios(enc)).toEqual(list);
  });

  it("skips invalid chunks, clamps days and caps at 3", () => {
    const raw = [
      "bad id!~2026-12-01T00:00:00Z~14~auto",
      "-95:10~2026-12-01T00:00:00Z~14~auto",
      "im-2~not-a-date~14~auto",
      "apollo-11~2026-12-01T00:00:00Z~999~weird",
      "im-2~2026-12-01T00:00:00Z~5~flat",
      "slim~2026-12-01T00:00:00Z~5~flat",
      "change-4~2026-12-01T00:00:00Z~5~flat",
    ].join(",");
    const out = decodeScenarios(raw);
    expect(out.map((s) => (s.location.kind === "site" ? s.location.siteId : "custom"))).toEqual(["apollo-11", "im-2", "slim"]);
    expect(out[0].days).toBe(60);
    expect(out[0].terrain).toBe("auto");
    expect(decodeScenarios("")).toEqual([]);
    expect(decodeScenarios(null)).toEqual([]);
  });
});

describe("presets", () => {
  it("flat vs real terrain", () => {
    expect(presetFlatVsReal(base).map((s) => s.terrain)).toEqual(["auto", "flat"]);
  });

  it("launch slips are one and two lunar days apart", () => {
    const p = presetLaunchSlips(base);
    expect(p).toHaveLength(3);
    const gapDays = (p[1].start.getTime() - p[0].start.getTime()) / 86_400_000;
    expect(gapDays).toBeCloseTo(LUNAR_DAY_DAYS, 1);
    expect((p[2].start.getTime() - p[0].start.getTime()) / 86_400_000).toBeCloseTo(2 * LUNAR_DAY_DAYS, 1);
  });

  it("equator vs pole uses three curated sites on the same dates", () => {
    const p = presetEquatorVsPole({ start, days: 14 });
    expect(p.map((s) => (s.location.kind === "site" ? s.location.siteId : ""))).toEqual(["apollo-11", "im-2", "shackleton-ridge"]);
    expect(new Set(p.map((s) => s.start.getTime())).size).toBe(1);
  });
});

describe("bestIndex", () => {
  it("picks the highest or lowest, ignores missing, and returns null for ties", () => {
    expect(bestIndex([10, 80, 40], true)).toBe(1);
    expect(bestIndex([10, 80, 40], false)).toBe(0);
    expect(bestIndex([null, 5, 3], false)).toBe(2);
    expect(bestIndex([100, 100], true)).toBeNull();
    expect(bestIndex([7], true)).toBeNull();
  });
});
