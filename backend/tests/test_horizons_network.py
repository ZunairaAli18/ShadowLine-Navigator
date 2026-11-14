"""One live comparison against JPL Horizons. Skipped by default; run with:  pytest -m network"""

from datetime import datetime, timezone

import httpx
import pytest

from app.core import ephemeris

pytestmark = pytest.mark.network

TOLERANCE_DEG = 0.01  # observed agreement is ~0.00001 deg; this only catches real regressions


def test_shackleton_matches_horizons():
    vh = pytest.importorskip("validate_horizons")
    try:
        ephemeris.load_ephemeris()
    except ephemeris.EphemerisNotLoadedError as e:
        pytest.skip(f"Ephemeris kernels unavailable:\n{e}")
    t = [datetime(2027, 1, 7, 18, 0, tzinfo=timezone.utc)]
    try:
        with httpx.Client(headers={"User-Agent": "shadowline-validation/1.0"}) as client:
            rows = vh.compare_site("shackleton-ridge", t, client, delay_s=0.5)
    except vh.HorizonsError as e:
        pytest.skip(f"JPL Horizons unreachable: {e}")
    assert {r["body"] for r in rows} == {"sun", "earth"}
    for r in rows:
        assert r["sep_deg"] < TOLERANCE_DEG, r
