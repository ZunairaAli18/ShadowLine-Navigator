/**
 * Fractional-index interpolation for smooth playback and scrubbing (pure, unit-tested).
 * A "position" is a fractional index into the time series: 3.25 = a quarter of the way from step 3 to 4.
 */

export function clampPos(pos: number, n: number): number {
  if (n <= 1) return 0;
  return Math.min(n - 1, Math.max(0, pos));
}

/** Linear interpolation of a numeric series at a fractional index. */
export function interpAt(arr: ArrayLike<number>, pos: number): number {
  const n = arr.length;
  if (n === 0) return NaN;
  const p = clampPos(pos, n);
  const i0 = Math.floor(p);
  const i1 = Math.min(n - 1, i0 + 1);
  const f = p - i0;
  return arr[i0] * (1 - f) + arr[i1] * f;
}

/** Interpolate between two azimuths the short way round, result in 0..360. */
export function lerpAngle(a: number, b: number, f: number): number {
  let d = ((b - a) % 360 + 540) % 360 - 180; // signed shortest difference
  if (d === -180) d = 180;
  return (((a + d * f) % 360) + 360) % 360;
}

/** Azimuth series at a fractional index (handles 359 -> 0 between steps). */
export function interpAz(arr: ArrayLike<number>, pos: number): number {
  const n = arr.length;
  if (n === 0) return NaN;
  const p = clampPos(pos, n);
  const i0 = Math.floor(p);
  const i1 = Math.min(n - 1, i0 + 1);
  return lerpAngle(arr[i0], arr[i1], p - i0);
}

/** Time (ms) at a fractional index. */
export function timeAt(timesMs: ArrayLike<number>, pos: number): number {
  return interpAt(timesMs, pos);
}

/** Fractional index for a time (ms), clamped to the series. */
export function posForTime(tMs: number, startMs: number, stepMinutes: number, n: number): number {
  return clampPos((tMs - startMs) / (stepMinutes * 60_000), n);
}

export type BodyAt = { az: number; el: number; horizonEl: number; margin: number };

export function bodyAt(
  s: { az: ArrayLike<number>; el: ArrayLike<number>; horizon_el: ArrayLike<number> },
  pos: number,
): BodyAt {
  const el = interpAt(s.el, pos);
  const horizonEl = interpAt(s.horizon_el, pos);
  return { az: interpAz(s.az, pos), el, horizonEl, margin: el - horizonEl };
}
