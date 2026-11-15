import { describe, expect, it } from "vitest";

import { angleDelta, azElToEnu, decodeHeights, downsampleHeights, enuToThree, heightAt, indexToXY, threeToAzEl, xyToIndex } from "./terrain";

describe("decodeHeights", () => {
  it("applies scale and offset to little-endian uint16 values, row-major", () => {
    const buf = new ArrayBuffer(8);
    const v = new DataView(buf);
    [0, 1, 65535, 1000].forEach((x, i) => v.setUint16(i * 2, x, true));
    const h = decodeHeights(buf, 2, 0.5, -100);
    expect(Array.from(h)).toEqual([-100, -99.5, -100 + 65535 * 0.5, 400]);
  });

  it("rejects a file of the wrong size", () => {
    expect(() => decodeHeights(new ArrayBuffer(6), 2, 1, 0)).toThrow(/expected 8/);
  });
});

describe("az/el -> ENU direction", () => {
  const close = (a: number[], b: number[]) => a.forEach((x, i) => expect(x).toBeCloseTo(b[i], 12));
  it("matches the convention (0 = north, 90 = east, clockwise)", () => {
    close(azElToEnu(0, 0), [0, 1, 0]);
    close(azElToEnu(90, 0), [1, 0, 0]);
    close(azElToEnu(180, 0), [0, -1, 0]);
    close(azElToEnu(270, 0), [-1, 0, 0]);
    close(azElToEnu(123, 90), [0, 0, 1]);
    const [x, y, z] = azElToEnu(45, 30);
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 12);
    expect(z).toBeCloseTo(0.5, 12);
  });

  it("maps to three.js (east +X, up +Y, north -Z) and back", () => {
    close(enuToThree(azElToEnu(0, 0)), [0, 0, -1]);
    close(enuToThree(azElToEnu(90, 0)), [1, 0, 0]);
    for (const [az, el] of [[10, 5], [200, -1.5], [359, 40]]) {
      const back = threeToAzEl(enuToThree(azElToEnu(az, el)));
      expect(back.az).toBeCloseTo(az, 9);
      expect(back.el).toBeCloseTo(el, 9);
    }
  });

  it("shortest angle delta wraps", () => {
    expect(angleDelta(350, 10)).toBe(20);
    expect(angleDelta(10, 350)).toBe(-20);
    expect(angleDelta(0, 180)).toBe(180);
  });
});

describe("grid index <-> metres", () => {
  const n = 512;
  const sp = 40_000 / 511;
  it("puts row 0 at the north edge and col 0 at the west edge", () => {
    const [x, y] = indexToXY(0, 0, n, sp);
    expect(x).toBeCloseTo(-20_000, 6);
    expect(y).toBeCloseTo(20_000, 6);
    const [x2, y2] = indexToXY(511, 511, n, sp);
    expect(x2).toBeCloseTo(20_000, 6);
    expect(y2).toBeCloseTo(-20_000, 6);
  });

  it("round-trips", () => {
    const [r, c] = xyToIndex(1234.5, -987.6, n, sp);
    const [x, y] = indexToXY(r, c, n, sp);
    expect(x).toBeCloseTo(1234.5, 6);
    expect(y).toBeCloseTo(-987.6, 6);
  });

  it("interpolates heights bilinearly and returns NaN outside", () => {
    // 3x3 grid, spacing 10: heights = row * 10 + col (row 0 north)
    const h = Float32Array.from({ length: 9 }, (_, i) => Math.floor(i / 3) * 10 + (i % 3));
    expect(heightAt(h, 3, 10, 0, 0)).toBeCloseTo(11, 6); // centre = row 1, col 1
    expect(heightAt(h, 3, 10, 5, 5)).toBeCloseTo(6.5, 6); // between rows 0-1, cols 1-2
    expect(Number.isNaN(heightAt(h, 3, 10, 50, 0))).toBe(true);
  });
});

describe("downsampleHeights (lite mode)", () => {
  it("keeps corners and reproduces a linear ramp exactly", () => {
    const n = 512;
    const h = Float32Array.from({ length: n * n }, (_, i) => 3 * Math.floor(i / n) - 2 * (i % n)); // plane
    const m = 256;
    const d = downsampleHeights(h, n, m);
    expect(d.length).toBe(m * m);
    expect(d[0]).toBeCloseTo(h[0], 4);
    expect(d[m - 1]).toBeCloseTo(h[n - 1], 3);
    expect(d[m * m - 1]).toBeCloseTo(h[n * n - 1], 3);
    // sample (r, c) of the small grid sits at fractional index (r, c) * 511/255 of the big one
    const k = (n - 1) / (m - 1);
    expect(d[100 * m + 37]).toBeCloseTo(3 * 100 * k - 2 * 37 * k, 2);
  });

  it("matches heightAt at the same ENU point", () => {
    const n = 9;
    const sp = 10;
    const h = Float32Array.from({ length: n * n }, (_, i) => Math.sin(i) * 50);
    const m = 5;
    const d = downsampleHeights(h, n, m);
    const spM = (sp * (n - 1)) / (m - 1);
    const [x, y] = indexToXY(1, 3, m, spM);
    expect(d[1 * m + 3]).toBeCloseTo(heightAt(h, n, sp, x, y), 5);
  });
});
