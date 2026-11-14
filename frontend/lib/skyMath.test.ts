import { describe, expect, it } from "vitest";

import {
  domePxPerDeg,
  domeRadius,
  domeXY,
  horizonAt,
  panoPxPerDeg,
  panoX,
  panoXY,
  panoY,
  splitRuns,
  wrapAz,
  type DomeGeom,
  type PanoGeom,
} from "./skyMath";

const dome: DomeGeom = { cx: 100, cy: 100, r0: 90, minEl: -15 };
const pano: PanoGeom = { x0: 0, width: 360, y0: 0, height: 200, elMin: -8, elMax: 12 };

describe("wrapAz", () => {
  it("wraps into 0..360", () => {
    expect(wrapAz(370)).toBe(10);
    expect(wrapAz(-10)).toBe(350);
    expect(wrapAz(360)).toBe(0);
  });
});

describe("dome", () => {
  it("puts the zenith at the centre and 0° on the r0 ring", () => {
    expect(domeXY(123, 90, dome)).toEqual({ x: 100, y: 100 });
    expect(domeRadius(0, dome)).toBe(90);
    expect(domeRadius(30, dome)).toBe(60);
    expect(domeRadius(60, dome)).toBe(30);
  });

  it("has N at the top, E right, S bottom, W left", () => {
    const n = domeXY(0, 0, dome);
    const e = domeXY(90, 0, dome);
    const s = domeXY(180, 0, dome);
    const w = domeXY(270, 0, dome);
    expect(n.x).toBeCloseTo(100);
    expect(n.y).toBeCloseTo(10);
    expect(e.x).toBeCloseTo(190);
    expect(e.y).toBeCloseTo(100);
    expect(s.y).toBeCloseTo(190);
    expect(w.x).toBeCloseTo(10);
  });

  it("draws negative elevations outside the horizon ring, clamped at minEl", () => {
    expect(domeRadius(-9, dome)).toBeCloseTo(99);
    expect(domeRadius(-40, dome)).toBeCloseTo(domeRadius(-15, dome));
  });

  it("treats 360° like 0°", () => {
    const a = domeXY(360, 20, dome);
    const b = domeXY(0, 20, dome);
    expect(a.x).toBeCloseTo(b.x);
    expect(a.y).toBeCloseTo(b.y);
  });

  it("gives pixels per degree", () => {
    expect(domePxPerDeg(dome)).toBe(1);
  });
});

describe("panorama", () => {
  it("maps azimuth linearly across the width with wrap-around", () => {
    expect(panoX(0, pano)).toBe(0);
    expect(panoX(90, pano)).toBe(90);
    expect(panoX(359.5, pano)).toBeCloseTo(359.5);
    expect(panoX(360, pano)).toBe(0);
    expect(panoX(-90, pano)).toBe(270);
  });

  it("maps elevation to y with the top at elMax", () => {
    expect(panoY(12, pano)).toBe(0);
    expect(panoY(-8, pano)).toBe(200);
    expect(panoY(0, pano)).toBe(120);
    expect(panoXY(180, 2, pano)).toEqual({ x: 180, y: 100 });
  });

  it("exaggerates the vertical scale", () => {
    expect(panoPxPerDeg(pano)).toBe(10); // 10 px per degree vs 1 px per degree horizontally
  });
});

describe("splitRuns", () => {
  it("splits by visibility and shares boundary samples", () => {
    const runs = splitRuns([10, 11, 12, 13, 14], [true, true, false, false, true], false);
    expect(runs).toEqual([
      { visible: true, idx: [0, 1] },
      { visible: false, idx: [1, 2, 3] },
      { visible: true, idx: [3, 4] },
    ]);
  });

  it("breaks the line where azimuth wraps across 0/360 (panorama)", () => {
    const runs = splitRuns([355, 358, 1, 4], [true, true, true, true], true);
    expect(runs.map((r) => r.idx)).toEqual([[0, 1], [2, 3]]);
  });

  it("does not break on wrap for the dome", () => {
    const runs = splitRuns([355, 358, 1, 4], [true, true, true, true], false);
    expect(runs).toHaveLength(1);
  });
});

describe("horizonAt", () => {
  const h = Array.from({ length: 360 }, () => 0);
  h[359] = 2;
  h[0] = 4;
  h[10] = 1;
  it("interpolates and wraps 359 -> 0", () => {
    expect(horizonAt(h, 359.5)).toBeCloseTo(3);
    expect(horizonAt(h, 9.5)).toBeCloseTo(0.5);
    expect(horizonAt(h, 720)).toBeCloseTo(4);
  });
  it("returns 0 for a missing horizon", () => {
    expect(horizonAt([], 10)).toBe(0);
  });
});
