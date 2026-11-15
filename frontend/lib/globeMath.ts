/**
 * Moon-map geometry (pure, unit-tested). Builds on lib/sun.ts conventions:
 *   body frame (MOON_ME): X -> (0°, 0°) facing Earth, Y -> (0°, 90°E), Z -> north pole
 *   scene axes (three.js): body (x, y, z) -> scene (x, z, -y)   (Y up = north)
 */

import { bodyToScene, type Vec3 } from "./sun";

export type LatLon = { lat: number; lon: number };

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
export const wrapLon = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180;

export function latLonToBody(lat: number, lon: number): Vec3 {
  const la = rad(lat);
  const lo = rad(lon);
  return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
}

export function bodyToLatLon([x, y, z]: Vec3): LatLon {
  const r = Math.hypot(x, y, z) || 1;
  return { lat: deg(Math.asin(Math.max(-1, Math.min(1, z / r)))), lon: wrapLon(deg(Math.atan2(y, x))) };
}

export function latLonToSceneVec(lat: number, lon: number): Vec3 {
  return bodyToScene(latLonToBody(lat, lon));
}

/** Inverse of bodyToScene: scene (x, y, z) -> body (x, -z, y). */
export function sceneToLatLon([sx, sy, sz]: Vec3): LatLon {
  return bodyToLatLon([sx, -sz, sy]);
}

/**
 * Raycast hit -> lat/lon. `hitLocal` is the hit point in the Moon group's local space (object.worldToLocal),
 * so the answer is right however the globe is rotated. Any radius works (displacement included).
 */
export function hitToLatLon(hitLocal: Vec3): LatLon {
  return sceneToLatLon(hitLocal);
}

/** Interpolate a lat/lon series at a fractional index via unit vectors (safe across the 0/360 seam and poles). */
export function interpLatLon(lats: ArrayLike<number>, lons: ArrayLike<number>, pos: number): LatLon {
  const n = lats.length;
  if (n === 0) return { lat: NaN, lon: NaN };
  const p = Math.min(n - 1, Math.max(0, pos));
  const i0 = Math.floor(p);
  const i1 = Math.min(n - 1, i0 + 1);
  const f = p - i0;
  const a = latLonToBody(lats[i0], lons[i0]);
  const b = latLonToBody(lats[i1], lons[i1]);
  return bodyToLatLon([a[0] * (1 - f) + b[0] * f, a[1] * (1 - f) + b[1] * f, a[2] * (1 - f) + b[2] * f]);
}

/** Angle (deg) between two surface points. */
export function angularDistance(a: LatLon, b: LatLon): number {
  const u = latLonToBody(a.lat, a.lon);
  const v = latLonToBody(b.lat, b.lon);
  return deg(Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2]))));
}

// ---------------------------------------------------------------- 2D maps

/** Equirectangular: lon -180..180 left->right, lat 90..-90 top->bottom (matches the NASA colour map). */
export function latLonToEquirect(lat: number, lon: number): { u: number; v: number } {
  return { u: (wrapLon(lon) + 180) / 360, v: (90 - lat) / 180 };
}

export function equirectToLatLon(u: number, v: number): LatLon {
  return { lat: 90 - Math.min(1, Math.max(0, v)) * 180, lon: wrapLon(Math.min(1, Math.max(0, u)) * 360 - 180) };
}

/**
 * South polar inset (view from below, as the 3D "South pole" preset): pole at the centre, the edge at
 * -90 + spanDeg latitude, 0° longitude at the top, east to the right. x, y in -1..1 (y down).
 */
export function latLonToPolar(lat: number, lon: number, spanDeg = 10): { x: number; y: number } {
  const r = (lat + 90) / spanDeg;
  const a = rad(lon);
  return { x: r * Math.sin(a), y: -r * Math.cos(a) };
}

export function polarToLatLon(x: number, y: number, spanDeg = 10): LatLon {
  const r = Math.hypot(x, y);
  return { lat: -90 + r * spanDeg, lon: wrapLon(deg(Math.atan2(x, -y))) };
}
