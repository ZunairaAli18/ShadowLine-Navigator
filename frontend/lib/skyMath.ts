/**
 * Sky plot coordinate maths (pure, unit-tested).
 * Azimuth: 0 = north, 90 = east, clockwise. Elevation: degrees above the flat horizon.
 */

export const SUN_RADIUS_DEG = 0.2666; // ~0.53° disk
export const EARTH_RADIUS_DEG = 0.95; // ~1.9° disk seen from the Moon

export type XY = { x: number; y: number };

export function wrapAz(az: number): number {
  return ((az % 360) + 360) % 360;
}

// ---------------------------------------------------------------- dome (looking up)

export type DomeGeom = { cx: number; cy: number; r0: number; minEl: number };

/** Radius for an elevation: zenith at the centre, 0° at r0, negative elevations outside r0 (down to minEl). */
export function domeRadius(el: number, g: DomeGeom): number {
  const e = Math.max(g.minEl, Math.min(90, el));
  return (g.r0 * (90 - e)) / 90;
}

/** N at the top, E to the right. */
export function domeXY(az: number, el: number, g: DomeGeom): XY {
  const a = (wrapAz(az) * Math.PI) / 180;
  const r = domeRadius(el, g);
  return { x: g.cx + r * Math.sin(a), y: g.cy - r * Math.cos(a) };
}

/** Pixels per degree of elevation in the dome (for disk sizes). */
export function domePxPerDeg(g: DomeGeom): number {
  return g.r0 / 90;
}

// ---------------------------------------------------------------- panorama (360° strip)

export type PanoGeom = { x0: number; width: number; y0: number; height: number; elMin: number; elMax: number };

export function panoX(az: number, g: PanoGeom): number {
  return g.x0 + (wrapAz(az) / 360) * g.width;
}

export function panoY(el: number, g: PanoGeom): number {
  return g.y0 + ((g.elMax - el) / (g.elMax - g.elMin)) * g.height;
}

export function panoXY(az: number, el: number, g: PanoGeom): XY {
  return { x: panoX(az, g), y: panoY(el, g) };
}

/** Pixels per degree of elevation in the panorama (vertical, exaggerated scale). */
export function panoPxPerDeg(g: PanoGeom): number {
  return g.height / (g.elMax - g.elMin);
}

// ---------------------------------------------------------------- paths

export type Run = { visible: boolean; idx: number[] };

/**
 * Split a time series into runs of constant visibility, also breaking where azimuth wraps across
 * 0/360 (for the panorama) so lines never streak across the whole plot. Adjacent visible/hidden runs
 * share their boundary sample so the line stays continuous.
 */
export function splitRuns(az: number[], visible: boolean[], breakOnWrap: boolean): Run[] {
  const runs: Run[] = [];
  let cur: Run | null = null;
  for (let i = 0; i < az.length; i++) {
    const wraps = breakOnWrap && i > 0 && Math.abs(wrapAz(az[i]) - wrapAz(az[i - 1])) > 180;
    if (!cur || wraps) {
      cur = { visible: visible[i], idx: [i] };
      runs.push(cur);
      continue;
    }
    if (visible[i] !== cur.visible) {
      const next: Run = { visible: visible[i], idx: [i - 1, i] };
      runs.push(next);
      cur = next;
      continue;
    }
    cur.idx.push(i);
  }
  return runs;
}

export function pointsToPath(pts: XY[]): string {
  return pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join("");
}

/** Linear interpolation of a 360-value horizon at any azimuth (wraps 359 -> 0). */
export function horizonAt(h: number[], az: number): number {
  if (h.length !== 360) return 0;
  const a = wrapAz(az);
  const i0 = Math.floor(a) % 360;
  const f = a - Math.floor(a);
  return h[i0] * (1 - f) + h[(i0 + 1) % 360] * f;
}
