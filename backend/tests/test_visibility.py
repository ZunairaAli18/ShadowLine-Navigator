from datetime import datetime, timezone

import numpy as np
import pytest

from app.core import ephemeris, terrain, visibility
from app.core.sites import get_site

START = datetime(2026, 12, 1, tzinfo=timezone.utc)
AU_KM = 149_597_870.7
FLAT = np.zeros(360)


# ---------------------------------------------------------------- pure math (no ephemeris)


def test_sun_radius_about_027_deg():
    r = np.degrees(np.arcsin(visibility.SUN_RADIUS_KM / AU_KM))
    assert r == pytest.approx(0.2666, abs=0.001)


def test_visible_fraction_flat_horizon():
    f = visibility.sun_visible_fraction(np.array([5.0, 0.0, -5.0, 0.2666, -0.2666]), AU_KM)
    np.testing.assert_allclose(f, [1.0, 0.5, 0.0, 1.0, 0.0], atol=1e-3)


def test_visible_fraction_monotonic_and_symmetric():
    m = np.linspace(-0.3, 0.3, 61)
    f = visibility.sun_visible_fraction(m, AU_KM)
    assert np.all(np.diff(f) >= 0)
    np.testing.assert_allclose(f + f[::-1], 1.0, atol=1e-12)  # f(m) + f(-m) = 1


def test_wall_to_the_east_blocks_eastern_sun_only():
    wall = np.zeros(360)
    wall[45:136] = 5.0  # 5 deg wall from NE to SE
    v = visibility.evaluate(wall, sun_az=np.array([90.0, 270.0]), sun_el=np.array([2.0, 2.0]),
                            sun_dist_km=AU_KM, earth_az=np.array([90.0, 270.0]), earth_el=np.array([2.0, 2.0]))
    np.testing.assert_allclose(v["sun_horizon_el"], [5.0, 0.0])
    np.testing.assert_allclose(v["sun_margin"], [-3.0, 2.0])
    np.testing.assert_allclose(v["sun_visible_fraction"], [0.0, 1.0])
    assert v["earth_visible"].tolist() == [False, True]


def test_azimuth_wraparound():
    h = np.zeros(360)
    h[359], h[0] = 2.0, 4.0
    v = visibility.evaluate(h, 359.6, 10.0, AU_KM, 359.6, 10.0)
    assert float(v["sun_horizon_el"]) == pytest.approx(2.0 * 0.4 + 4.0 * 0.6)


def test_earth_margin_deg():
    v = visibility.evaluate(FLAT, 0.0, 0.0, AU_KM, np.array([0.0, 0.0]), np.array([1.5, 2.5]), earth_margin_deg=2.0)
    np.testing.assert_allclose(v["earth_margin"], [-0.5, 0.5])
    assert v["earth_visible"].tolist() == [False, True]


def test_bad_terrain_mode():
    with pytest.raises(ValueError):
        visibility._horizon(get_site("im-2"), "lumpy")


# ---------------------------------------------------------------- with the real ephemeris


@pytest.fixture(scope="module")
def kernels():
    try:
        ephemeris.load_ephemeris()
    except ephemeris.EphemerisNotLoadedError as e:
        pytest.skip(f"Ephemeris kernels unavailable, skipping:\n{e}")


def test_apollo11_earth_always_visible(kernels):
    v = visibility.compute_visibility(get_site("apollo-11"), START, 30, 60)
    assert v.earth_visible.all()


def test_change4_earth_never_visible(kernels):
    v = visibility.compute_visibility(get_site("change-4"), START, 30, 60)
    assert not v.earth_visible.any()


def test_arrays_same_length(kernels):
    v = visibility.compute_visibility(get_site("im-2"), START, 2, 30)
    names = ["times", "sun_az", "sun_el", "sun_dist_km", "sun_horizon_el", "sun_margin", "sun_visible_fraction",
             "earth_az", "earth_el", "earth_horizon_el", "earth_margin", "earth_visible"]
    assert {len(getattr(v, n)) for n in names} == {96}
    assert v.step_minutes == 30 and v.days == 2 and v.start == START
    np.testing.assert_allclose(v.sun_margin, v.sun_el - v.sun_horizon_el)


def test_terrain_mode_flat_ignores_file(kernels):
    site = get_site("shackleton-ridge")
    assert terrain.get_horizon(site).terrain == "lola"  # real file exists
    auto = visibility.compute_visibility(site, START, 1, 60)
    flat = visibility.compute_visibility(site, START, 1, 60, terrain_mode="flat")
    assert auto.terrain == "lola" and flat.terrain == "flat"
    assert not flat.sun_horizon_el.any() and not flat.earth_horizon_el.any()
    assert auto.sun_horizon_el.any()
    np.testing.assert_allclose(flat.sun_el, auto.sun_el)


def test_snapshot_matches_series(kernels):
    site = get_site("apollo-15")
    series = visibility.compute_visibility(site, START, 1, 60)
    snap = visibility.snapshot_visibility(site, series.times[7])
    assert snap.terrain == "lola"
    assert snap.sun_margin == pytest.approx(series.sun_margin[7], abs=1e-6)
    assert snap.earth_visible == bool(series.earth_visible[7])
    assert isinstance(snap.earth_visible, bool) and isinstance(snap.sun_visible_fraction, float)
