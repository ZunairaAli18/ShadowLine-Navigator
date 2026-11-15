"""Sub-solar / sub-Earth geometry for the 3D Moon map."""

from datetime import datetime, timezone

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.core import ephemeris

START = datetime(2026, 12, 1, tzinfo=timezone.utc)


@pytest.fixture(scope="module")
def geo():
    try:
        ephemeris.load_ephemeris()
    except ephemeris.EphemerisNotLoadedError as e:
        pytest.skip(f"Ephemeris kernels unavailable:\n{e}")
    return ephemeris.compute_globe_geometry(START, 30, 60)


def test_subearth_stays_near_lon0_lat0(geo):
    # Libration: the sub-Earth point wanders but stays within ~8° of (0, 0).
    assert np.abs(geo.subearth_lat).max() < 8
    assert np.abs(geo.subearth_lon).max() < 8.5


def test_subsolar_lat_small(geo):
    assert np.abs(geo.subsolar_lat).max() < 1.6


def test_subsolar_lon_goes_all_the_way_round(geo):
    # Unwrap and measure: ~360° in one synodic month (29.53 d), moving westward.
    lon = np.unwrap(np.radians(geo.subsolar_lon))
    turn_deg = abs(np.degrees(lon[-1] - lon[0]))
    days = (geo.times[-1] - geo.times[0]).total_seconds() / 86400
    assert turn_deg / days * 29.53 == pytest.approx(360, abs=10)


def test_sun_and_earth_overhead_at_their_points(geo):
    for i in (0, 200, 600):
        p = ephemeris.positions_at(geo.subsolar_lat[i], geo.subsolar_lon[i], geo.times[i])
        assert p.sun_el == pytest.approx(90, abs=0.05)
        q = ephemeris.positions_at(geo.subearth_lat[i], geo.subearth_lon[i], geo.times[i])
        assert q.earth_el == pytest.approx(90, abs=0.05)


def test_endpoint_aligned_with_visibility():
    from app.main import app

    try:
        ephemeris.load_ephemeris()
    except ephemeris.EphemerisNotLoadedError:
        pytest.skip("Ephemeris kernels unavailable")
    with TestClient(app) as c:
        params = {"start": "2026-12-01T00:00:00Z", "days": 3, "step_minutes": 30}
        g = c.get("/globe-geometry", params=params)
        assert g.status_code == 200, g.text
        v = c.get("/visibility", params={"site_id": "apollo-11", **params}).json()
        body = g.json()
        assert body["times"] == v["times"]
        for k in ("subsolar_lat", "subsolar_lon", "subearth_lat", "subearth_lon"):
            assert len(body[k]) == len(v["times"])
        assert c.get("/globe-geometry", params={**params, "days": 61}).status_code == 422
        assert c.get("/globe-geometry", params={"start": "2060-01-01T00:00:00Z"}).status_code == 400
