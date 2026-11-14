"""/visibility, /snapshot, /compare, /best-windows via TestClient (needs the ephemeris kernels)."""

import pytest
from fastapi.testclient import TestClient

from app.core import ephemeris, visibility
from app.main import app
from app.models import BestWindowsResponse, CompareResponse, SnapshotResponse, VisibilityResponse

START = "2026-12-01T00:00:00Z"


@pytest.fixture(scope="module")
def client():
    try:
        ephemeris.load_ephemeris()
    except ephemeris.EphemerisNotLoadedError as e:
        pytest.skip(f"Ephemeris kernels unavailable, skipping endpoint tests:\n{e}")
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def fresh_cache():
    visibility.clear_cache()
    yield


# ---------------------------------------------------------------- /visibility


def test_visibility_curated_site(client):
    r = client.get("/visibility", params={"site_id": "apollo-11", "start": START, "days": 3})
    assert r.status_code == 200, r.text
    body = VisibilityResponse.model_validate(r.json())
    n = len(body.times)
    assert n == 72
    for arr in (body.sun.az, body.sun.el, body.sun.horizon_el, body.sun.visible_fraction,
                body.earth.az, body.earth.el, body.earth.horizon_el, body.earth.visible):
        assert len(arr) == n
    assert body.terrain == "lola" and body.site.id == "apollo-11"
    assert all(body.earth.visible)  # near side
    assert body.metrics.earth_pct == 100.0


def test_visibility_custom_latlon(client):
    r = client.get("/visibility", params={"lat": -85.2, "lon": 320, "start": START, "days": 1, "step_minutes": 30})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["site"]["id"] == "custom" and body["site"]["lon"] == -40
    assert body["terrain"] == "flat" and len(body["times"]) == 48
    assert set(body["sun"]["horizon_el"]) == {0.0}


def test_visibility_flat_mode_and_defaults(client):
    r = client.get("/visibility", params={"site_id": "shackleton-ridge", "start": START, "terrain_mode": "flat"})
    body = r.json()
    assert body["terrain"] == "flat"
    assert len(body["times"]) == 14 * 24 and body["step_minutes"] == 60  # defaults: 14 days, 60 min


def test_visibility_floats_rounded(client):
    body = client.get("/visibility", params={"site_id": "im-2", "start": START, "days": 1}).json()
    assert all(round(v, 3) == v for v in body["sun"]["el"])
    assert all(round(v, 2) == v for v in body["earth"]["az"])


def test_second_identical_call_hits_cache(client):
    params = {"site_id": "apollo-15", "start": START, "days": 5}
    r1 = client.get("/visibility", params=params)
    assert visibility.cache_info()["misses"] == 1 and visibility.cache_info()["hits"] == 0
    r2 = client.get("/visibility", params=params)
    assert visibility.cache_info()["hits"] == 1 and visibility.cache_info()["misses"] == 1
    assert r1.json() == r2.json()
    client.get("/visibility", params=params | {"days": 6})  # different key -> miss
    assert visibility.cache_info()["misses"] == 2


def test_cache_is_bounded(client, monkeypatch):
    monkeypatch.setattr(visibility, "CACHE_SIZE", 3)
    for d in range(1, 6):
        client.get("/visibility", params={"site_id": "slim", "start": START, "days": d})
    assert visibility.cache_info()["size"] == 3


# ---------------------------------------------------------------- /snapshot


def test_snapshot_curated(client):
    r = client.get("/snapshot", params={"site_id": "shackleton-ridge", "time": "2026-12-05T12:00:00Z"})
    assert r.status_code == 200, r.text
    body = SnapshotResponse.model_validate(r.json())
    assert body.terrain == "lola"
    assert body.sun.visible and body.sun.visible_fraction > 0.5
    assert body.sun.el > body.sun.horizon_el  # visible means the center clears the skyline
    cd = body.countdowns
    assert cd.earthrise.time is not None and cd.earthrise.hours > 0


def test_snapshot_custom_and_null_countdowns(client):
    # Far side: Earth never rises or sets within the 30-day look-ahead.
    body = client.get("/snapshot", params={"lat": -45.457, "lon": 177.589, "time": START}).json()
    assert body["site"]["id"] == "custom" and body["terrain"] == "flat"
    assert body["earth"]["visible"] is False and body["earth"]["visible_fraction"] == 0.0
    assert body["countdowns"]["earthrise"] == {"time": None, "hours": None}
    assert body["countdowns"]["earthset"] == {"time": None, "hours": None}
    assert body["countdowns"]["sunrise"]["hours"] is not None  # Sun does rise and set there


def test_snapshot_countdown_hours_match_time(client):
    body = client.get("/snapshot", params={"site_id": "apollo-11", "time": START}).json()
    sr = body["countdowns"]["sunrise"]
    assert sr["time"] is not None and 0 < sr["hours"] < 30 * 24


# ---------------------------------------------------------------- /compare


def test_compare_three_scenarios_in_order(client):
    req = {"scenarios": [
        {"label": "B: far side", "site_id": "change-4", "start": START, "days": 7},
        {"label": "A: Apollo 11", "site_id": "apollo-11", "start": START, "days": 7},
        {"label": "C: custom pole", "lat": -89.9, "lon": 0, "start": START, "days": 7, "terrain_mode": "flat"},
    ]}
    r = client.post("/compare", json=req)
    assert r.status_code == 200, r.text
    body = CompareResponse.model_validate(r.json())
    assert [x.label for x in body.results] == ["B: far side", "A: Apollo 11", "C: custom pole"]
    assert [x.site.id for x in body.results] == ["change-4", "apollo-11", "custom"]
    assert body.results[0].metrics.earth_pct == 0 and body.results[0].metrics.verdict == "not_viable"
    assert body.results[2].terrain == "flat"
    assert "times" not in r.json()["results"][0]  # metrics only, no time series


def test_compare_rejects_bad_bodies(client):
    assert client.post("/compare", json={"scenarios": []}).status_code == 422
    four = [{"site_id": "slim", "start": START}] * 4
    assert client.post("/compare", json={"scenarios": four}).status_code == 422
    both = {"scenarios": [{"site_id": "slim", "lat": 1, "lon": 2, "start": START}]}
    r = client.post("/compare", json=both)
    assert r.status_code == 422 and "not both" in r.text
    assert client.post("/compare", json={"scenarios": [{"site_id": "atlantis", "start": START}]}).status_code == 404


# ---------------------------------------------------------------- /best-windows


BW = {"site_id": "apollo-11", "from": START, "to": "2027-01-31T00:00:00Z", "mission_days": 10}


def test_best_windows_ranked(client):
    r = client.get("/best-windows", params=BW)
    assert r.status_code == 200, r.text
    body = BestWindowsResponse.model_validate(r.json())
    assert len(body.windows) == 5
    assert body.candidates_evaluated == 61 * 2 + 1  # every 12 h from Dec 1 to Jan 31 inclusive
    rank = {"good": 0, "risky": 1, "not_viable": 2}
    keys = [(rank[w.verdict], -w.both_pct, w.longest_dark_hours) for w in body.windows]
    assert keys == sorted(keys)
    assert body.windows[0].verdict in ("good", "risky")  # a sunrise-aligned start beats starting at night
    for w in body.windows:
        assert (w.end - w.start).days == 10
        assert body.range_start <= w.start <= body.range_end


def test_best_windows_top_and_custom(client):
    body = client.get("/best-windows", params=BW | {"top": 2}).json()
    assert len(body["windows"]) == 2
    custom = {"lat": 10, "lon": 20, "from": START, "to": "2026-12-10T00:00:00Z", "mission_days": 3, "top": 50,
              "min_separation_hours": 0}
    body = client.get("/best-windows", params=custom).json()
    assert body["site"]["id"] == "custom" and body["terrain"] == "flat"
    assert len(body["windows"]) == body["candidates_evaluated"] == 19  # no spreading: every candidate


def test_best_windows_spread_apart(client):
    body = client.get("/best-windows", params=BW).json()
    assert body["min_separation_hours"] == 240  # default = mission length (10 days)
    starts = sorted(BestWindowsResponse.model_validate(body).windows, key=lambda w: w.start)
    gaps_h = [(b.start - a.start).total_seconds() / 3600 for a, b in zip(starts, starts[1:])]
    assert all(g >= 240 for g in gaps_h)

    custom_gap = client.get("/best-windows", params=BW | {"min_separation_hours": 72, "top": 10}).json()
    starts = sorted(w["start"] for w in custom_gap["windows"])
    assert custom_gap["min_separation_hours"] == 72 and len(starts) > len(body["windows"])

    packed = client.get("/best-windows", params=BW | {"min_separation_hours": 0}).json()
    hours = sorted(w["start"] for w in packed["windows"])
    assert hours[1] < "2026-12-16"  # without spreading the top picks are 12-hour neighbours


def test_best_windows_one_visibility_run(client):
    client.get("/best-windows", params=BW)
    assert visibility.cache_info()["misses"] == 1


def test_best_windows_range_limits(client):
    r = client.get("/best-windows", params=BW | {"to": "2027-06-01T00:00:00Z"})  # 182 days
    assert r.status_code == 422 and "180 days" in r.json()["detail"]
    r = client.get("/best-windows", params=BW | {"to": "2026-11-01T00:00:00Z"})
    assert r.status_code == 422 and "on or after" in r.json()["detail"]


# ---------------------------------------------------------------- errors


def test_error_unknown_site_404(client):
    for path, extra in (("/visibility", {"start": START}), ("/snapshot", {"time": START}),
                        ("/best-windows", {"from": START, "to": START})):
        r = client.get(path, params={"site_id": "atlantis", **extra})
        assert r.status_code == 404, path
        assert "atlantis" in r.json()["detail"]


@pytest.mark.parametrize(
    "params",
    [
        {"start": START},                                           # no location
        {"site_id": "im-2", "lat": 1, "lon": 2, "start": START},    # both
        {"lat": -85, "start": START},                               # lat without lon
        {"site_id": "im-2"},                                        # missing start
        {"site_id": "im-2", "start": "yesterday"},                  # bad date
        {"site_id": "im-2", "start": START, "days": 61},            # too long
        {"site_id": "im-2", "start": START, "step_minutes": 1},
        {"site_id": "im-2", "start": START, "terrain_mode": "lumpy"},
        {"lat": -95, "lon": 0, "start": START},
    ],
)
def test_error_bad_input_422(client, params):
    r = client.get("/visibility", params=params)
    assert r.status_code == 422, r.text
    assert r.json()["detail"]


def test_error_out_of_ephemeris_range_400(client):
    r = client.get("/visibility", params={"site_id": "im-2", "start": "2060-01-01T00:00:00Z"})
    assert r.status_code == 400
    assert "2050" in r.json()["detail"]
    r = client.get("/snapshot", params={"site_id": "im-2", "time": "1850-01-01T00:00:00Z"})
    assert r.status_code == 400


def test_error_ephemeris_not_loaded_503(client, monkeypatch):
    monkeypatch.setattr(ephemeris, "_eph", None)
    r = client.get("/visibility", params={"site_id": "im-2", "start": START, "days": 1})
    assert r.status_code == 503
    assert client.get("/health").json()["ephemeris_loaded"] is False
