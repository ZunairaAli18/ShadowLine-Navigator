import { describe, expect, it } from "vitest";

import { bodyAt, clampPos, interpAt, interpAz, lerpAngle, posForTime, timeAt } from "./interp";

describe("interpAt", () => {
  it("interpolates linearly and clamps", () => {
    const a = [0, 10, 20];
    expect(interpAt(a, 0.5)).toBe(5);
    expect(interpAt(a, 1.25)).toBe(12.5);
    expect(interpAt(a, -3)).toBe(0);
    expect(interpAt(a, 9)).toBe(20);
    expect(interpAt([], 1)).toBeNaN();
  });
});

describe("lerpAngle / interpAz", () => {
  it("goes the short way round across 0/360", () => {
    expect(lerpAngle(350, 10, 0.5)).toBeCloseTo(0);
    expect(lerpAngle(350, 10, 0.25)).toBeCloseTo(355);
    expect(lerpAngle(10, 350, 0.75)).toBeCloseTo(355);
    expect(lerpAngle(90, 100, 0.5)).toBeCloseTo(95);
  });

  it("interpolates an azimuth series", () => {
    expect(interpAz([358, 2, 6], 0.5)).toBeCloseTo(0);
    expect(interpAz([358, 2, 6], 1.5)).toBeCloseTo(4);
  });
});

describe("time helpers", () => {
  const t0 = Date.UTC(2026, 11, 1);
  const times = [t0, t0 + 3_600_000, t0 + 7_200_000];
  it("timeAt and posForTime are inverses (clamped)", () => {
    expect(timeAt(times, 1.5)).toBe(t0 + 5_400_000);
    expect(posForTime(t0 + 5_400_000, t0, 60, 3)).toBeCloseTo(1.5);
    expect(posForTime(t0 - 1e9, t0, 60, 3)).toBe(0);
    expect(posForTime(t0 + 1e10, t0, 60, 3)).toBe(2);
    expect(clampPos(5, 1)).toBe(0);
  });
});

describe("bodyAt", () => {
  it("interpolates az/el/horizon and the margin", () => {
    const b = bodyAt({ az: [359, 1], el: [1, 3], horizon_el: [0.5, 0.5] }, 0.5);
    expect(b.az).toBeCloseTo(0);
    expect(b.el).toBeCloseTo(2);
    expect(b.margin).toBeCloseTo(1.5);
  });
});
