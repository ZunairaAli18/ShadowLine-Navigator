/**
 * 3D terrain patch helpers (pure, unit-tested).
 *
 * Patch frame (backend/scripts/build_terrain_patch.py): East-North-Up, metres, origin = the site's surface point,
 * z includes the Moon's curvature. Heights: uint16 little-endian, row-major from the north-west corner,
 * height = value * z_scale + z_offset.
 *
 * three.js is Y-up, so ENU (x, y, z) maps to three (x, z, -y): east = +X, up = +Y, north = -Z.
 */

export type Vec3 = [number, number, number];

/** Decode the .bin into metres (Float32Array, row-major from the north-west corner). */
export function decodeHeights(buffer: ArrayBuffer, gridSize: number, zScale: number, zOffset: number): Float32Array {
  const n = gridSize * gridSize;
  if (buffer.byteLength !== n * 2) throw new Error(`Terrain patch has ${buffer.byteLength} bytes, expected ${n * 2}`);
  const view = new DataView(buffer);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = view.getUint16(i * 2, true) * zScale + zOffset;
  return out;
}

const D2R = Math.PI / 180;

/** Unit vector in ENU for an azimuth (0 = north, clockwise) and elevation, degrees. */
export function azElToEnu(azDeg: number, elDeg: number): Vec3 {
  const az = azDeg * D2R;
  const el = elDeg * D2R;
  return [Math.sin(az) * Math.cos(el), Math.cos(az) * Math.cos(el), Math.sin(el)];
}

/** ENU -> three.js world coordinates. */
export function enuToThree([x, y, z]: Vec3): Vec3 {
  return [x, z, -y];
}

/** three.js direction -> azimuth/elevation (degrees). Inverse of enuToThree(azElToEnu()). */
export function threeToAzEl([x, y, z]: Vec3): { az: number; el: number } {
  const e = x;
  const n = -z;
  const h = Math.hypot(e, n);
  return { az: ((Math.atan2(e, n) / D2R) % 360 + 360) % 360, el: Math.atan2(y, h) / D2R };
}

/** Grid index -> ENU metres (row 0 = north edge, col 0 = west edge). */
export function indexToXY(row: number, col: number, gridSize: number, spacing: number): [number, number] {
  const half = (gridSize - 1) / 2;
  return [(col - half) * spacing, (half - row) * spacing];
}

/** ENU metres -> fractional (row, col). */
export function xyToIndex(x: number, y: number, gridSize: number, spacing: number): [number, number] {
  const half = (gridSize - 1) / 2;
  return [half - y / spacing, half + x / spacing];
}

/** Bilinear terrain height (m) at ENU (x, y); NaN outside the patch. */
export function heightAt(heights: ArrayLike<number>, gridSize: number, spacing: number, x: number, y: number): number {
  const [r, c] = xyToIndex(x, y, gridSize, spacing);
  if (!(r >= 0 && c >= 0 && r <= gridSize - 1 && c <= gridSize - 1)) return NaN;
  const r0 = Math.min(gridSize - 2, Math.floor(r));
  const c0 = Math.min(gridSize - 2, Math.floor(c));
  const fr = r - r0;
  const fc = c - c0;
  const h = (rr: number, cc: number) => heights[rr * gridSize + cc];
  const top = h(r0, c0) * (1 - fc) + h(r0, c0 + 1) * fc;
  const bot = h(r0 + 1, c0) * (1 - fc) + h(r0 + 1, c0 + 1) * fc;
  return top * (1 - fr) + bot * fr;
}

/** Shortest signed angle from a to b, degrees in (-180, 180]. */
export function angleDelta(a: number, b: number): number {
  let d = (((b - a) % 360) + 360) % 360;
  if (d > 180) d -= 360;
  return d;
}

/**
 * Resample an n x n height grid to m x m covering the same extent (corners stay on the corners), bilinear.
 * Used by the lite terrain mode (512 -> 256) so phones draw a quarter of the triangles.
 */
export function downsampleHeights(heights: ArrayLike<number>, n: number, m: number): Float32Array {
  const out = new Float32Array(m * m);
  const k = (n - 1) / (m - 1);
  for (let r = 0; r < m; r++) {
    const fr = r * k;
    const r0 = Math.min(n - 2, Math.floor(fr));
    const tr = fr - r0;
    for (let c = 0; c < m; c++) {
      const fc = c * k;
      const c0 = Math.min(n - 2, Math.floor(fc));
      const tc = fc - c0;
      const a = heights[r0 * n + c0];
      const b = heights[r0 * n + c0 + 1];
      const d = heights[(r0 + 1) * n + c0];
      const e = heights[(r0 + 1) * n + c0 + 1];
      out[r * m + c] = (a * (1 - tc) + b * tc) * (1 - tr) + (d * (1 - tc) + e * tc) * tr;
    }
  }
  return out;
}
