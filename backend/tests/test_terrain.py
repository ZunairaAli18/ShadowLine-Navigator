"""Terrain horizons: synthetic DEMs (never the real TIFs), terrain.py helpers, /horizon endpoint."""

import json
import math

import numpy as np
import pytest
import rasterio
from fastapi.testclient import TestClient
from pyproj import CRS, Transformer
from rasterio.transform import from_origin

import build_horizon as bh
from app.core import sites, terrain
from app.main import app

R = bh.R_MOON
POLAR_PROJ = "+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +R=1737400 +units=m +no_defs"
GEO_PROJ = "+proj=longlat +R=1737400 +no_defs"
NODATA = -9999.0


def destination(lat, lon, az_deg, dist_m):
    p1, l1, az, d = math.radians(lat), math.radians(lon), math.radians(az_deg), dist_m / R
    p2 = math.asin(math.sin(p1) * math.cos(d) + math.cos(p1) * math.sin(d) * math.cos(az))
    l2 = l1 + math.atan2(math.sin(az) * math.sin(d) * math.cos(p1), math.cos(d) - math.sin(p1) * math.sin(p2))
    return math.degrees(p2), (math.degrees(l2) + 180) % 360 - 180


def write_tif(path, data, crs, transform):
    with rasterio.open(path, "w", driver="GTiff", height=data.shape[0], width=data.shape[1], count=1,
                       dtype="float32", crs=rasterio.crs.CRS.from_string(crs), transform=transform,
                       nodata=NODATA) as ds:
        ds.write(data.astype(np.float32), 1)


# Polar DEM: site at 88S 0E, a 3 km Gaussian mountain 30 km due east of it. No data beyond 300 km from the pole.
POLAR_SITE = (-88.0, 0.0)
MOUNTAIN_AZ, MOUNTAIN_DIST, MOUNTAIN_H = 90.0, 30_000.0, 3000.0

# Global DEM: site on the equator at 179.5E, a mountain 40 km east, across the antimeridian.
GLOBAL_SITE = (0.0, 179.5)
GLOBAL_MOUNTAIN_DIST = 40_000.0


@pytest.fixture(scope="module")
def dems(tmp_path_factory):
    d = tmp_path_factory.mktemp("dems")

    # --- polar stereographic, 400 m/px, +-320 km
    res, half = 400.0, 320_000.0
    n = int(2 * half / res)
    xs = -half + res * (np.arange(n) + 0.5)
    X, Y = np.meshgrid(xs, xs[::-1])
    to_xy = Transformer.from_crs(CRS(POLAR_PROJ).geodetic_crs, CRS(POLAR_PROJ), always_xy=True)
    mlat, mlon = destination(*POLAR_SITE, MOUNTAIN_AZ, MOUNTAIN_DIST)
    mx, my = to_xy.transform(mlon, mlat)
    polar = MOUNTAIN_H * np.exp(-((X - mx) ** 2 + (Y - my) ** 2) / (2 * 3000.0 ** 2))
    polar[np.hypot(X, Y) > 300_000] = NODATA
    polar_path = d / "polar.tif"
    write_tif(polar_path, polar, POLAR_PROJ, from_origin(-half, half, res, res))

    # --- global simple cylindrical, 0.1 deg/px (~3 km), -180..180
    res_deg = 0.1
    lons = -180 + res_deg * (np.arange(3600) + 0.5)
    lats = 90 - res_deg * (np.arange(1800) + 0.5)
    LON, LAT = np.meshgrid(lons, lats)
    glat, glon = destination(*GLOBAL_SITE, 90.0, GLOBAL_MOUNTAIN_DIST)
    # distance on the sphere from the mountain center (haversine)
    p1, p2 = np.radians(LAT), math.radians(glat)
    dl = np.radians(LON - glon)
    hav = np.sin((p2 - p1) / 2) ** 2 + np.cos(p1) * math.cos(p2) * np.sin(dl / 2) ** 2
    dist = 2 * R * np.arcsin(np.sqrt(hav))
    glob = MOUNTAIN_H * np.exp(-(dist ** 2) / (2 * 8000.0 ** 2))
    global_path = d / "global.tif"
    write_tif(global_path, glob, GEO_PROJ, from_origin(-180, 90, res_deg, res_deg))

    return bh.Dem(polar_path, "polar"), bh.Dem(global_path, "global")


def expected_peak_angle(dist_m, h=MOUNTAIN_H):
    return float(bh.elevation_angles(np.array(h), np.array(dist_m / R), bh.OBSERVER_HEIGHT_M))


# ---------------------------------------------------------------- build_horizon: DEM reading


def test_dem_reads_crs_and_resolution(dems):
    polar, glob = dems
    assert not polar.crs.is_geographic and polar.resolution_m == pytest.approx(400)
    assert glob.crs.is_geographic and glob.wraps
    assert glob.resolution_m == pytest.approx(math.radians(0.1) * R)
    assert "polar.tif" in polar.describe()


def test_dem_sampling(dems):
    polar, _ = dems
    mlat, mlon = destination(*POLAR_SITE, MOUNTAIN_AZ, MOUNTAIN_DIST)
    assert polar.sample_one(mlat, mlon) == pytest.approx(MOUNTAIN_H, rel=0.02)
    assert polar.sample_one(*POLAR_SITE) == pytest.approx(0, abs=1)
    assert math.isnan(polar.sample_one(-70, 0))  # outside the raster


def test_ray_points_geometry():
    lat, lon, d = bh.ray_points(-45, 10, step_m=50_000, max_m=150_000)
    assert lat.shape == (360, 3)
    assert lat[0, 0] > -45 and lon[0, 0] == pytest.approx(10)   # az 0 = north
    assert lon[90, 0] > 10 and lat[180, 0] < -45               # az 90 = east, 180 = south
    assert d[0, -1] == pytest.approx(150_000 / R)


def test_elevation_angle_matches_small_angle_formula():
    # CLAUDE.md approximation: atan((h - h0 - d^2/2R) / d)
    dist, h, h0 = 20_000.0, 1500.0, 2.0
    exact = bh.elevation_angles(np.array(h), np.array(dist / R), h0)
    approx = math.degrees(math.atan((h - h0 - dist ** 2 / (2 * R)) / dist))
    assert exact == pytest.approx(approx, abs=0.02)


# ---------------------------------------------------------------- build_horizon: horizon shape


def test_polar_mountain_peaks_east(dems):
    polar, _ = dems
    res = bh.compute_horizon(*POLAR_SITE, polar)
    e = res.elevation_deg
    assert e.shape == (360,)
    assert abs(int(np.argmax(e)) - MOUNTAIN_AZ) <= 2
    assert e.max() == pytest.approx(expected_peak_angle(MOUNTAIN_DIST), abs=0.5)  # ~5.2 deg
    # Flat terrain elsewhere: just below 0 (observer is 2 m up on a curved surface)
    assert -1 < e[270] < 0 and -1 < e[0] < 0
    assert not res.warnings


def test_global_mountain_across_antimeridian(dems):
    _, glob = dems
    res = bh.compute_horizon(*GLOBAL_SITE, glob)
    e = res.elevation_deg
    assert abs(int(np.argmax(e)) - 90) <= 2
    assert e.max() == pytest.approx(expected_peak_angle(GLOBAL_MOUNTAIN_DIST), abs=0.6)
    assert e[270] < 0.5


def test_choose_dem(dems):
    polar, glob = dems
    assert bh.choose_dem(*POLAR_SITE, polar, glob) is polar
    assert bh.choose_dem(-86.0, 0.0, polar, glob) is polar      # circle reaches ~271 km from pole
    assert bh.choose_dem(-84.9, 45.0, polar, glob) is glob      # circle hits the no-data edge
    assert bh.choose_dem(-60.0, 0.0, polar, glob) is glob       # entirely outside


def test_missing_tifs_fail_clearly(tmp_path, monkeypatch):
    monkeypatch.setattr(bh, "DATA_RAW", tmp_path)
    with pytest.raises(bh.DemMissingError) as exc:
        bh.find_dems()
    msg = str(exc.value)
    assert "South polar DEM not found" in msg and "Global 64 ppd DEM" in msg
    (tmp_path / bh.POLAR_DEM_NAME).write_bytes(b"")
    with pytest.raises(bh.DemMissingError, match="Global 64 ppd DEM"):
        bh.find_dems()
    with pytest.raises(bh.DemMissingError, match="Global DEM not found"):
        bh.find_dems(global_path=tmp_path / "nope.tif")


def test_main_writes_horizon_json(dems, tmp_path):
    polar, glob = dems
    bh.main(["--site", "shackleton-ridge", "--polar-dem", str(polar.path),
             "--global-dem", str(glob.path), "--out", str(tmp_path)])
    data = json.loads((tmp_path / "shackleton-ridge.json").read_text())
    assert set(data) == {
        "site_id", "lat", "lon", "site_height_m", "observer_height_m", "max_distance_km",
        "dem_source", "dem_resolution_m", "dem_body_frame", "azimuth_step_deg", "elevation_deg",
    }
    assert data["site_id"] == "shackleton-ridge"
    assert data["dem_source"] == "polar.tif"
    assert data["dem_body_frame"] == "ME"
    assert data["observer_height_m"] == 2.0 and data["max_distance_km"] == 150.0
    assert len(data["elevation_deg"]) == 360
    assert all(round(v, 2) == v for v in data["elevation_deg"])

    # The written file is picked up by terrain.py and flips has_terrain.
    site = sites.get_site("shackleton-ridge")
    assert terrain.get_horizon(site, horizons_dir=tmp_path).terrain == "lola"
    assert sites.read_catalog(horizons_dir=tmp_path)["shackleton-ridge"].has_terrain is True
    assert sites.read_catalog(horizons_dir=tmp_path)["im-2"].has_terrain is False


# ---------------------------------------------------------------- ME -> PA frame conversion


def test_detect_body_frame():
    assert bh.detect_body_frame("LDEM64_PA_pixel_202405.tif") == "PA"
    assert bh.detect_body_frame("LDEM_80S_80MPP_ADJ.tiff") == "ME"
    assert bh.detect_body_frame("global.tif") == "ME"
    assert bh.detect_body_frame("PANORAMA.tif") == "ME"  # 'PA' must be its own token


@pytest.fixture
def kernels():
    from app.core import ephemeris

    try:
        ephemeris.load_ephemeris()
    except ephemeris.EphemerisNotLoadedError as e:
        pytest.skip(f"Moon frame kernels unavailable, skipping ME/PA tests:\n{e}")


def test_me_to_pa_offset_size(kernels):
    m = bh.me_to_pa_matrix()
    np.testing.assert_allclose(m @ m.T, np.eye(3), atol=1e-12)
    angle_arcsec = math.degrees(math.acos((np.trace(m) - 1) / 2)) * 3600
    assert angle_arcsec == pytest.approx(math.sqrt(67.92**2 + 78.56**2 + 0.30**2), abs=0.5)  # moon_080317.tf
    lat, lon = bh.me_to_pa(np.array([0.0, 26.13, -45.457]), np.array([0.0, 3.63, 177.589]))
    shift_m = np.hypot(lat - [0, 26.13, -45.457], (lon - [0, 3.63, 177.589]) * np.cos(np.radians(lat)))
    shift_m = np.radians(shift_m) * R
    assert ((shift_m > 100) & (shift_m < 900)).all()


def test_pa_dem_samples_converted_coords(dems, kernels):
    _, glob = dems
    glob_pa = bh.Dem(glob.path, "global", body_frame="PA")
    lat, lon = destination(*GLOBAL_SITE, 90.0, GLOBAL_MOUNTAIN_DIST - 8000)  # on the mountain's slope
    plat, plon = bh.me_to_pa(np.array([lat]), np.array([lon]))
    assert glob_pa.sample_one(lat, lon) == pytest.approx(float(glob.sample(plat, plon)[0]), abs=1e-3)
    assert glob_pa.sample_one(lat, lon) != pytest.approx(glob.sample_one(lat, lon), abs=0.5)


# ---------------------------------------------------------------- terrain.py


def write_horizon(dir_, site_id, elevation):
    data = {"site_id": site_id, "lat": 0, "lon": 0, "site_height_m": 12.3, "observer_height_m": 2.0,
            "max_distance_km": 150.0, "dem_source": "test.tif", "dem_resolution_m": 80.0,
            "azimuth_step_deg": 1, "elevation_deg": list(elevation)}
    (dir_ / f"{site_id}.json").write_text(json.dumps(data))


@pytest.fixture(autouse=True)
def fresh_cache():
    terrain.clear_cache()
    yield
    terrain.clear_cache()


def test_horizon_at_interpolates():
    elev = np.arange(360, dtype=float) / 10  # 0.0, 0.1, ... 35.9
    assert terrain.horizon_at(elev, 10) == pytest.approx(1.0)
    assert terrain.horizon_at(elev, 10.5) == pytest.approx(1.05)
    np.testing.assert_allclose(terrain.horizon_at(elev, np.array([0, 90.25, 180])), [0, 9.025, 18])


def test_horizon_at_wraps():
    elev = np.zeros(360)
    elev[359], elev[0] = 2.0, 4.0
    assert terrain.horizon_at(elev, 359.5) == pytest.approx(3.0)
    assert terrain.horizon_at(elev, 360) == pytest.approx(4.0)
    assert terrain.horizon_at(elev, -0.5) == pytest.approx(3.0)
    assert terrain.horizon_at(elev, 720.25) == pytest.approx(3.0 * 0 + 4.0 * 0.75)


def test_flat_fallback(tmp_path):
    h = terrain.get_horizon(sites.get_site("apollo-11"), horizons_dir=tmp_path)
    assert h.terrain == "flat" and h.elevation.shape == (360,) and not h.elevation.any()
    custom = sites.resolve_site(lat=-85, lon=10)
    assert terrain.get_horizon(custom, horizons_dir=tmp_path).terrain == "flat"


def test_horizon_file_loaded_and_cached(tmp_path):
    write_horizon(tmp_path, "im-2", np.linspace(0, 3, 360))
    site = sites.get_site("im-2")
    h = terrain.get_horizon(site, horizons_dir=tmp_path)
    assert h.terrain == "lola" and h.meta["dem_source"] == "test.tif"
    assert terrain.get_horizon(site, horizons_dir=tmp_path) is h  # cached


def test_bad_horizon_file_rejected(tmp_path):
    write_horizon(tmp_path, "im-2", [1.0] * 359)
    with pytest.raises(ValueError, match="360"):
        terrain.get_horizon(sites.get_site("im-2"), horizons_dir=tmp_path)


# ---------------------------------------------------------------- /horizon endpoint


def test_horizon_endpoint(tmp_path, monkeypatch):
    monkeypatch.setattr(terrain, "HORIZONS_DIR", tmp_path)
    write_horizon(tmp_path, "im-2", [1.234] * 360)
    with TestClient(app) as c:
        r = c.get("/horizon", params={"site_id": "im-2"})
        assert r.status_code == 200
        body = r.json()
        assert body["terrain"] == "lola" and body["dem_source"] == "test.tif"
        assert body["elevation"] == [1.23] * 360

        flat = c.get("/horizon", params={"site_id": "apollo-11"}).json()
        assert flat["terrain"] == "flat" and flat["elevation"] == [0.0] * 360 and flat["dem_source"] is None

        r = c.get("/horizon", params={"site_id": "atlantis"})
        assert r.status_code == 404
