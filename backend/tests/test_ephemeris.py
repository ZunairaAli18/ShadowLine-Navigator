"""Physical sanity checks for Sun/Earth positions. Skipped if the kernels can't be loaded."""

from datetime import datetime, timezone

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.core import ephemeris
from app.core.sites import resolve_site

START = datetime(2026, 12, 1, tzinfo=timezone.utc)


@pytest.fixture(scope="module", autouse=True)
def loaded():
    try:
        ephemeris.load_ephemeris()
    except ephemeris.EphemerisNotLoadedError as e:
        pytest.skip(f"Ephemeris kernels unavailable (no network?), skipping ephemeris tests:\n{e}")


def month(site_id, days=30, step=60):
    s = resolve_site(site_id=site_id)
    return ephemeris.compute_positions(s.lat, s.lon, START, days, step)


def test_apollo11_earth_always_up():
    p = month("apollo-11")
    assert p.earth_el.min() > 45  # near side, near the sub-Earth point


def test_change4_earth_always_down():
    p = month("change-4")
    assert p.earth_el.max() < 0  # far side: no direct line to Earth


def test_apollo11_has_day_and_night():
    p = month("apollo-11")
    assert p.sun_el.max() > 45
    assert p.sun_el.min() < -45


def test_shackleton_sun_skims_horizon():
    p = month("shackleton-ridge")
    assert np.abs(p.sun_el).max() < 2.2


def test_arrays_consistent():
    p = month("im-2", days=2, step=30)
    arrays = [p.times, p.sun_az, p.sun_el, p.sun_dist_km, p.earth_az, p.earth_el, p.earth_dist_km]
    assert {len(a) for a in arrays} == {96}
    for az in (p.sun_az, p.earth_az):
        assert ((az >= 0) & (az < 360)).all()
    assert p.times[0] == START
    assert (p.times[1] - p.times[0]).total_seconds() == 30 * 60
    assert 1.4e8 < p.sun_dist_km.mean() < 1.6e8
    assert 3.5e5 < p.earth_dist_km.mean() < 4.1e5


def test_positions_at_matches_series():
    s = resolve_site(site_id="apollo-17")
    series = ephemeris.compute_positions(s.lat, s.lon, START, 1, 60)
    one = ephemeris.positions_at(s.lat, s.lon, series.times[5])
    assert one.sun_el == pytest.approx(series.sun_el[5], abs=1e-6)
    assert one.earth_az == pytest.approx(series.earth_az[5], abs=1e-6)


def test_lon_0_360_same_as_negative():
    a = ephemeris.positions_at(-10, 320, START)
    b = ephemeris.positions_at(-10, -40, START)
    assert a.sun_el == pytest.approx(b.sun_el)


def test_naive_datetime_treated_as_utc():
    a = ephemeris.positions_at(0, 0, START)
    b = ephemeris.positions_at(0, 0, START.replace(tzinfo=None))
    assert a.sun_el == pytest.approx(b.sun_el)


@pytest.mark.parametrize(
    "kwargs",
    [
        {"days": 0},
        {"days": -1},
        {"days": 61},
        {"step_minutes": 4},
        {"step_minutes": 1441},
        {"start": datetime(1899, 12, 31, tzinfo=timezone.utc)},
        {"start": datetime(2049, 12, 20, tzinfo=timezone.utc), "days": 30},  # runs past 2050
        {"lat": -91},
    ],
)
def test_errors(kwargs):
    args = {"lat": 0, "lon": 0, "start": START, "days": 1, "step_minutes": 60} | kwargs
    with pytest.raises(ephemeris.EphemerisError):
        ephemeris.compute_positions(**args)


def test_positions_at_out_of_range():
    with pytest.raises(ephemeris.EphemerisError):
        ephemeris.positions_at(0, 0, datetime(2051, 1, 1, tzinfo=timezone.utc))


def test_health_reports_loaded():
    from app.main import app

    with TestClient(app) as c:
        assert c.get("/health").json()["ephemeris_loaded"] is True
