"""3D terrain patches: synthetic polar DEM (never the real TIFs), geometry helpers, encoding, API."""

import json
import math

import numpy as np
import pytest
import rasterio
from fastapi.testclient import TestClient
from pyproj import CRS, Transformer
from rasterio.transform import from_origin

import build_terrain_patch as btp
from app.core import sites, terrain_patch
from app.main import app

R = btp.R_MOON
POLAR_PROJ = "+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +R=1737400 +units=m +no_defs"
SITE = (-87.0, 30.0)
BASE_H = -1200.0  # flat ground height around the site
MOUNTAIN_EN = (8_000.0, 5_000.0)  # east, north offsets (m) of a 1.5 km Gaussian mountain
MOUNTAIN_H, MOUNTAIN_SIGMA = 1500.0, 900.0
GRID, EXTENT = 129, 40_000.0


def destination(lat, lon, az_deg, dist_m):
    p1, l1, az, d = math.radians(lat), math.radians(lon), math.radians(az_deg), dist_m / R
    p2 = math.asin(math.sin(p1) * math.cos(d) + math.cos(p1) * math.sin(d) * math.cos(az))
    l2 = l1 + math.atan2(math.sin(az) * math.sin(d) * math.cos(p1), math.cos(d) - math.sin(p1) * math.sin(p2))
    return math.degrees(p2), (math.degrees(l2) + 180) % 360 - 180


@pytest.fixture(scope="module")
def dem(tmp_path_factory):
    """A small polar-stereographic DEM (100 m/px) around SITE with one mountain."""
    to_xy = Transformer.from_crs(CRS(POLAR_PROJ).geodetic_crs, CRS(POLAR_PROJ), always_xy=True)
    sx, sy = to_xy.transform(SITE[1], SITE[0])
    res, half = 100.0, 40_000.0
    n = int(2 * half / res)
    x0, y0 = sx - half, sy + half
    xs = x0 + res * (np.arange(n) + 0.5)
    ys = y0 - res * (np.arange(n) + 0.5)
    X, Y = np.meshgrid(xs, ys)
    e, nn = MOUNTAIN_EN
    mlat, mlon = destination(*SITE, math.degrees(math.atan2(e, nn)), math.hypot(e, nn))
    mx, my = to_xy.transform(mlon, mlat)
    data = BASE_H + MOUNTAIN_H * np.exp(-((X - mx) ** 2 + (Y - my) ** 2) / (2 * MOUNTAIN_SIGMA ** 2))
    path = tmp_path_factory.mktemp("patch") / "LDEM_test_polar.tif"
    with rasterio.open(path, "w", driver="GTiff", height=n, width=n, count=1, dtype="float32",
                       crs=rasterio.crs.CRS.from_string(POLAR_PROJ), transform=from_origin(x0, y0, res, res),
                       nodata=-9999.0) as ds:
        ds.write(data.astype(np.float32), 1)
    return btp.Dem(path, "polar")


@pytest.fixture(scope="module")
def patch(dem):
    return btp.build_patch("test-site", *SITE, dem, grid_size=GRID, extent_m=EXTENT)


def test_enu_basis_orthonormal():
    e, n, u = btp.enu_basis(-87.0, 30.0)
    m = np.stack([e, n, u])
    assert np.allclose(m @ m.T, np.eye(3), atol=1e-12)
    assert np.allclose(np.cross(e, n), u)  # right-handed


def test_grid_index_metres_round_trip():
    xs, ys, spacing = btp.grid_axes(512, 40_000)
    assert spacing == pytest.approx(40_000 / 511)
    assert xs[0] == pytest.approx(-20_000) and xs[-1] == pytest.approx(20_000)
    assert ys[0] == pytest.approx(20_000)  # row 0 = north
    x, y = btp.index_to_xy(0, 0, 512, spacing)
    assert (x, y) == (pytest.approx(-20_000), pytest.approx(20_000))  # north-west corner
    assert btp.xy_to_index(x, y, 512, spacing) == (pytest.approx(0), pytest.approx(0))
    r, c = btp.xy_to_index(1234.5, -987.6, 512, spacing)
    assert btp.index_to_xy(r, c, 512, spacing) == (pytest.approx(1234.5), pytest.approx(-987.6))


def test_curvature_on_a_smooth_sphere():
    """No terrain: z = sqrt(R^2 - d^2) - R, i.e. about -d^2 / (2R) (-115 m at 20 km)."""
    z = btp.surface_z(np.array([20_000.0, 0.0, 14_142.0]), np.array([0.0, -20_000.0, 14_142.0]),
                      *SITE, 0.0, heights=lambda lat, lon: np.zeros_like(lat))
    assert z == pytest.approx(-(20_000.0 ** 2) / (2 * R), abs=0.5)
    assert z[0] == pytest.approx(-115.1, abs=0.2)


def test_mountain_lands_at_the_right_place_and_height(patch):
    meta, data, z = patch
    row, col = np.unravel_index(np.argmax(z), z.shape)
    x, y = btp.index_to_xy(row, col, GRID, meta["spacing_m"])
    assert math.hypot(x - MOUNTAIN_EN[0], y - MOUNTAIN_EN[1]) < 1.5 * meta["spacing_m"]
    d = math.hypot(*MOUNTAIN_EN)
    expected_peak = (BASE_H + MOUNTAIN_H) - BASE_H - d * d / (2 * R)  # relative to the site, minus curvature
    assert z.max() == pytest.approx(expected_peak, abs=40)  # grid misses the exact summit by < 1 cell


def test_edge_curvature_drop(patch):
    meta, _, z = patch
    mid = GRID // 2
    assert z[mid, mid] == pytest.approx(0.0, abs=0.5)  # the site is the origin
    for edge in (z[mid, 0], z[mid, -1], z[-1, mid]):  # west, east, south edges (flat ground there)
        assert edge == pytest.approx(-(20_000.0 ** 2) / (2 * R), abs=3)


def test_encoding_round_trip(patch):
    meta, data, z = patch
    assert len(data) == GRID * GRID * 2
    back = btp.decode_heights(data, GRID, meta["z_scale"], meta["z_offset"])
    assert np.max(np.abs(back - z)) <= meta["z_scale"] / 2 + 1e-6


def test_metadata_fields(patch):
    meta, _, _ = patch
    for key in ("site_id", "lat", "lon", "grid_size", "spacing_m", "extent_m", "z_scale", "z_offset", "z_min",
                "z_max", "site_height_m", "frame", "row_order", "dem_source", "credit"):
        assert key in meta, key
    assert meta["frame"] == "ENU" and meta["site_height_m"] == pytest.approx(BASE_H, abs=1)
    assert meta["dem_source"] == "LDEM_test_polar.tif"


def test_patch_outside_dem_is_rejected(dem):
    with pytest.raises(ValueError, match="isn't fully inside"):
        btp.build_patch("too-big", *SITE, dem, grid_size=33, extent_m=200_000)


def test_written_files_are_served(patch, tmp_path, monkeypatch):
    meta, data, _ = patch
    btp.write_patch(meta, data, tmp_path)
    monkeypatch.setattr(terrain_patch, "PATCHES_DIR", tmp_path)
    terrain_patch.clear_cache()
    assert terrain_patch.has_patch("test-site") and not terrain_patch.has_patch("apollo-11")
    assert terrain_patch.get_meta("test-site")["grid_size"] == GRID
    terrain_patch.clear_cache()


# ---------------------------------------------------------------- committed patches and API


@pytest.mark.parametrize("site_id", ["shackleton-ridge", "im-2"])
def test_committed_patches_are_valid(site_id):
    meta = json.loads((btp.PATCHES_DIR / f"{site_id}.json").read_text())
    data = (btp.PATCHES_DIR / f"{site_id}.bin").read_bytes()
    n = meta["grid_size"]
    assert n == 512 and len(data) == n * n * 2 and len(data) < 1_100_000
    z = btp.decode_heights(data, n, meta["z_scale"], meta["z_offset"])
    # 512 is even: the site sits between the 4 central samples (39 m away each).
    assert z[n // 2 - 1:n // 2 + 1, n // 2 - 1:n // 2 + 1].mean() == pytest.approx(0.0, abs=3)
    assert meta["z_min"] <= z.min() + 0.1 and z.max() - 0.1 <= meta["z_max"]


def test_site_flag_and_endpoints():
    catalog = sites.read_catalog()
    assert catalog["shackleton-ridge"].has_terrain_patch and catalog["im-2"].has_terrain_patch
    assert not catalog["apollo-11"].has_terrain_patch
    with TestClient(app) as c:
        r = c.get("/terrain-patch", params={"site_id": "im-2"})
        assert r.status_code == 200
        body = r.json()
        assert body["grid_size"] == 512 and body["frame"] == "ENU"
        assert body["bin_url"].startswith("/static/terrain/im-2.bin?v=")
        b = c.get(body["bin_url"], headers={"Origin": "http://localhost:3000"})
        assert b.status_code == 200 and len(b.content) == 512 * 512 * 2
        assert b.headers["content-type"] == "application/octet-stream"
        assert "max-age" in b.headers["cache-control"]
        assert b.headers["access-control-allow-origin"] == "http://localhost:3000"
        r = c.get("/terrain-patch", params={"site_id": "apollo-11"})
        assert r.status_code == 404 and "Shackleton" in r.json()["detail"]
        assert c.get("/terrain-patch", params={"site_id": "nope"}).status_code == 404
        assert c.get("/sites/im-2").json()["has_terrain_patch"] is True
