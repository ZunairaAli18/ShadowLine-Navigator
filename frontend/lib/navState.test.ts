import { describe, expect, it } from "vitest";

import { indexForTime, normalizeLon, parseNavState, serializeNavState } from "./navState";

const NOW = new Date("2026-11-15T09:42:17Z");
const parse = (q: string) => parseNavState(new URLSearchParams(q), NOW);

describe("parseNavState defaults", () => {
  it("uses Shackleton, now floored to the hour, 14 days, 1 h, real terrain", () => {
    const s = parse("");
    expect(s.location).toEqual({ kind: "site", siteId: "shackleton-ridge" });
    expect(s.start.toISOString()).toBe("2026-11-15T09:00:00.000Z");
    expect(s.days).toBe(14);
    expect(s.step).toBe(60);
    expect(s.terrain).toBe("auto");
    expect(s.t.getTime()).toBe(s.start.getTime());
    expect(s.tab).toBeNull();
    expect(s.extras).toEqual({});
  });
});

describe("parseNavState values", () => {
  it("reads a site link", () => {
    const s = parse("site=apollo-11&start=2026-12-01T00:00:00Z&days=10&step=180&terrain=flat&t=2026-12-03T06:00:00Z&tab=best");
    expect(s.location).toEqual({ kind: "site", siteId: "apollo-11" });
    expect(s.days).toBe(10);
    expect(s.step).toBe(180);
    expect(s.terrain).toBe("flat");
    expect(s.t.toISOString()).toBe("2026-12-03T06:00:00.000Z");
    expect(s.tab).toBe("best");
  });

  it("reads custom coordinates and normalises 0..360 longitude", () => {
    const s = parse("lat=-85.2&lon=320");
    expect(s.location).toEqual({ kind: "custom", lat: -85.2, lon: -40 });
  });

  it("falls back on bad values", () => {
    const s = parse("lat=-95&lon=10&days=999&step=2&terrain=lumpy&start=yesterday&tab=nope&mode=wizard&emargin=99");
    expect(s.location).toEqual({ kind: "site", siteId: "shackleton-ridge" });
    expect(s.days).toBe(60);
    expect(s.step).toBe(60);
    expect(s.terrain).toBe("auto");
    expect(s.start.toISOString()).toBe("2026-11-15T09:00:00.000Z");
    expect(s.tab).toBeNull();
    expect(s.mode).toBeNull();
    expect(s.earthMargin).toBe(10);
  });

  it("reads mode, Earth margin and a custom step", () => {
    const s = parse("site=im-2&mode=expert&emargin=2.25&step=45");
    expect(s.mode).toBe("expert");
    expect(s.earthMargin).toBe(2.3);
    expect(s.step).toBe(45);
    expect(parse("mode=simple").mode).toBe("simple");
    expect(parse("").mode).toBeNull();
    const out = serializeNavState(s);
    expect(out.get("mode")).toBe("expert");
    expect(out.get("emargin")).toBe("2.3");
    expect(serializeNavState(parse("site=im-2")).get("emargin")).toBeNull();
  });

  it("clamps a selected time outside the window to the start", () => {
    const s = parse("start=2026-12-01T00:00:00Z&days=2&t=2027-01-01T00:00:00Z");
    expect(s.t.toISOString()).toBe("2026-12-01T00:00:00.000Z");
  });
});

describe("serializeNavState", () => {
  it("round-trips, including tab extras", () => {
    const q =
      "site=im-2&start=2026-12-01T00:00:00Z&days=7&step=30&terrain=auto&t=2026-12-02T12:30:00Z&tab=compare" +
      "&cmp=im-2~2026-12-01T00%3A00%3A00Z~14~auto&bfrom=2026-12-01";
    const s = parse(q);
    expect(serializeNavState(s).toString()).toBe(new URLSearchParams(q).toString());
    expect(parseNavState(serializeNavState(s), NOW)).toEqual(s);
  });

  it("omits t when it equals start and writes custom coordinates", () => {
    const s = parse("lat=10.123456&lon=-20&start=2026-12-01T00:00:00Z");
    const out = serializeNavState(s);
    expect(out.get("t")).toBeNull();
    expect(out.get("lat")).toBe("10.1235");
    expect(out.get("site")).toBeNull();
  });
});

describe("helpers", () => {
  it("normalizeLon", () => {
    expect(normalizeLon(190)).toBe(-170);
    expect(normalizeLon(360)).toBe(0);
    expect(normalizeLon(180)).toBe(180);
    expect(normalizeLon(-180)).toBe(-180);
    expect(normalizeLon(400)).toBeNull();
  });

  it("indexForTime picks the nearest step and clamps", () => {
    const start = new Date("2026-12-01T00:00:00Z");
    expect(indexForTime(new Date("2026-12-01T02:29:00Z"), start, 60, 100)).toBe(2);
    expect(indexForTime(new Date("2026-12-01T02:31:00Z"), start, 60, 100)).toBe(3);
    expect(indexForTime(new Date("2026-11-01T00:00:00Z"), start, 60, 100)).toBe(0);
    expect(indexForTime(new Date("2027-01-01T00:00:00Z"), start, 60, 100)).toBe(99);
  });
});
