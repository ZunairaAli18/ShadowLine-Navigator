import { describe, expect, it } from "vitest";

import {
  angularDistance,
  bodyToLatLon,
  equirectToLatLon,
  hitToLatLon,
  interpLatLon,
  latLonToBody,
  latLonToEquirect,
  latLonToPolar,
  latLonToSceneVec,
  polarToLatLon,
  sceneToLatLon,
} from "./globeMath";

const close = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 9));

describe("lat/lon <-> vectors", () => {
  it("maps the cardinal points of the body frame", () => {
    close(latLonToBody(0, 0), [1, 0, 0]); // faces Earth
    close(latLonToBody(0, 90), [0, 1, 0]); // 90°E
    close(latLonToBody(90, 0), [0, 0, 1]); // north pole
  });

  it("round-trips through body and scene axes", () => {
    for (const [lat, lon] of [[0.674, 23.473], [-45.457, 177.589], [-84.79, 29.2], [-89.45, -137.3], [10, -170]]) {
      const b = bodyToLatLon(latLonToBody(lat, lon));
      expect(b.lat).toBeCloseTo(lat, 9);
      expect(b.lon).toBeCloseTo(lon, 9);
      const s = sceneToLatLon(latLonToSceneVec(lat, lon));
      expect(s.lat).toBeCloseTo(lat, 9);
      expect(s.lon).toBeCloseTo(lon, 9);
    }
  });

  it("uses scene axes Y-up = north, lon 0 = +X, lon 90E = -Z", () => {
    close(latLonToSceneVec(90, 0), [0, 1, 0]);
    close(latLonToSceneVec(0, 0), [1, 0, 0]);
    close(latLonToSceneVec(0, 90), [0, 0, -1]);
  });
});

describe("raycast hit -> lat/lon", () => {
  it("ignores the radius (displaced surface)", () => {
    const v = latLonToSceneVec(-84.79, 29.2);
    const hit = hitToLatLon([v[0] * 1.004, v[1] * 1.004, v[2] * 1.004]);
    expect(hit.lat).toBeCloseTo(-84.79, 6);
    expect(hit.lon).toBeCloseTo(29.2, 6);
  });
});

describe("interpLatLon", () => {
  it("interpolates across the 0/360 seam the short way", () => {
    const p = interpLatLon([0, 0], [179, -179], 0.5);
    expect(Math.abs(p.lon)).toBeCloseTo(180, 6);
    const q = interpLatLon([0, 0], [-1, 1], 0.25);
    expect(q.lon).toBeCloseTo(-0.5, 2);
  });

  it("clamps and handles exact samples", () => {
    expect(interpLatLon([1, 2], [10, 20], 5).lat).toBeCloseTo(2);
    expect(interpLatLon([1, 2], [10, 20], 0).lon).toBeCloseTo(10);
  });

  it("measures angular distance", () => {
    expect(angularDistance({ lat: 0, lon: 0 }, { lat: 0, lon: 90 })).toBeCloseTo(90);
    expect(angularDistance({ lat: 90, lon: 0 }, { lat: -90, lon: 0 })).toBeCloseTo(180);
  });
});

describe("2D projections", () => {
  it("equirectangular matches the texture layout and round-trips", () => {
    expect(latLonToEquirect(0, 0)).toEqual({ u: 0.5, v: 0.5 });
    expect(latLonToEquirect(90, -180)).toEqual({ u: 0, v: 0 });
    const ll = equirectToLatLon(0.75, 0.25);
    expect(ll.lon).toBeCloseTo(90);
    expect(ll.lat).toBeCloseTo(45);
  });

  it("south polar inset: pole at the centre, 0° up, east right, round-trips", () => {
    const pole = latLonToPolar(-90, 0);
    expect(Math.hypot(pole.x, pole.y)).toBeCloseTo(0);
    const up = latLonToPolar(-80, 0);
    expect(up.x).toBeCloseTo(0);
    expect(up.y).toBeCloseTo(-1);
    expect(latLonToPolar(-85, 90).x).toBeCloseTo(0.5);
    const back = polarToLatLon(latLonToPolar(-84.79, 29.2).x, latLonToPolar(-84.79, 29.2).y);
    expect(back.lat).toBeCloseTo(-84.79, 9);
    expect(back.lon).toBeCloseTo(29.2, 9);
  });
});
