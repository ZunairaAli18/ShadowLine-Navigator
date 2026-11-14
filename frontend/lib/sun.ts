/**
 * Geometry helpers for lighting the 3D Moon with the real Sun.
 *
 * Moon body-fixed frame (MOON_ME): X -> (lat 0, lon 0) the sub-Earth point, Y -> (lat 0, lon 90E), Z -> north pole.
 * The backend's /snapshot at (lat 0, lon 0) gives the Sun's local az/el there; at that point
 * up = +X, east = +Y, north = +Z, so the Sun direction follows directly (the Sun is far enough
 * away that the site offset doesn't matter).
 */

export type Vec3 = [number, number, number];

const rad = (d: number) => (d * Math.PI) / 180;

/** Unit Sun direction in the Moon body frame from az/el measured at (lat 0, lon 0). */
export function sunDirFromAzEl(azDeg: number, elDeg: number): Vec3 {
  const az = rad(azDeg);
  const el = rad(elDeg);
  return [Math.sin(el), Math.cos(el) * Math.sin(az), Math.cos(el) * Math.cos(az)];
}

/** Body-frame vector -> three.js scene axes used by MoonGlobe (Y up = north, lon 0 = +X, lon 90E = -Z). */
export function bodyToScene([x, y, z]: Vec3): Vec3 {
  return [x, z, -y];
}

/** Point on the unit sphere (scene axes) for a lat/lon in degrees. */
export function latLonToScene(latDeg: number, lonDeg: number, r = 1): Vec3 {
  const lat = rad(latDeg);
  const lon = rad(lonDeg);
  return bodyToScene([r * Math.cos(lat) * Math.cos(lon), r * Math.cos(lat) * Math.sin(lon), r * Math.sin(lat)]);
}
