import json

import pytest
from fastapi.testclient import TestClient

from app.core import sites
from app.main import app
from app.models import Site

EXPECTED_IDS = {
    "apollo-11", "apollo-15", "apollo-17", "blue-ghost-m1", "slim", "reiner-gamma",
    "change-4", "chandrayaan-3", "im-1", "im-2", "shackleton-ridge",
}


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


# ---------------------------------------------------------------- catalog


def test_catalog_loads_and_validates():
    catalog = sites.load_catalog()
    assert set(catalog) == EXPECTED_IDS
    for site in catalog.values():
        Site.model_validate(site.model_dump())  # round-trips through the contract
        assert site.description and site.why_interesting and site.mission
        assert -180 <= site.lon <= 180


def test_all_catalog_coords_verified():
    # Every catalog site was checked in Quickmap; only ad-hoc custom sites are unverified.
    assert all(s.coords_verified for s in sites.list_sites())


def test_has_terrain_not_hardcoded_in_json():
    raw = json.loads(sites.CATALOG_PATH.read_text(encoding="utf-8"))
    assert all("has_terrain" not in entry for entry in raw)


def test_has_terrain_true_when_horizon_file_exists(tmp_path):
    assert all(not s.has_terrain for s in sites.read_catalog(horizons_dir=tmp_path).values())
    (tmp_path / "im-2.json").write_text("[]")
    catalog = sites.read_catalog(horizons_dir=tmp_path)
    assert catalog["im-2"].has_terrain is True
    assert catalog["apollo-11"].has_terrain is False


# ---------------------------------------------------------------- list / get


def test_list_sites_all_and_filtered():
    assert len(sites.list_sites()) == 11
    south_pole = sites.list_sites("south_pole")
    assert {s.id for s in south_pole} == {"im-1", "im-2", "shackleton-ridge"}
    assert [s.id for s in sites.list_sites("far_side")] == ["change-4"]
    assert sites.list_sites("north_pole") == []


def test_get_site():
    s = sites.get_site("im-2")
    assert s.lat == pytest.approx(-84.7906)
    assert s.region == "south_pole"
    with pytest.raises(sites.SiteNotFoundError):
        sites.get_site("atlantis")


# ---------------------------------------------------------------- resolve_site


def test_resolve_site_by_id():
    assert sites.resolve_site(site_id="change-4").name.startswith("Chang'e 4")


def test_resolve_site_custom():
    s = sites.resolve_site(lat=-85.2, lon=40.5)
    assert s.id == "custom"
    assert s.name == "Custom (85.20°S, 40.50°E)"
    assert s.region == "south_pole"
    assert s.has_terrain is False and s.coords_verified is False


def test_resolve_site_0_360_longitude():
    s = sites.resolve_site(lat=10, lon=320)
    assert s.lon == -40
    assert s.name == "Custom (10.00°N, 40.00°W)"


@pytest.mark.parametrize(
    "lat, region",
    [(0, "equatorial"), (-59.9, "equatorial"), (-60, "south_polar"), (-79.9, "south_polar"),
     (-80, "south_pole"), (-90, "south_pole"), (60, "north_polar"), (79.9, "north_polar"), (80, "north_pole")],
)
def test_region_inferred_from_latitude(lat, region):
    assert sites.resolve_site(lat=lat, lon=0).region == region


@pytest.mark.parametrize(
    "kwargs",
    [
        {},                                         # nothing
        {"lat": -85.0},                             # lat without lon
        {"lon": 10.0},                              # lon without lat
        {"site_id": "im-2", "lat": 1.0, "lon": 2.0},  # both
        {"lat": -91.0, "lon": 0.0},                 # lat out of range
        {"lat": float("nan"), "lon": 0.0},
    ],
)
def test_resolve_site_errors(kwargs):
    with pytest.raises(sites.SiteInputError):
        sites.resolve_site(**kwargs)


def test_resolve_site_unknown_id():
    with pytest.raises(sites.SiteNotFoundError):
        sites.resolve_site(site_id="atlantis")


# ---------------------------------------------------------------- endpoints


def test_get_sites_endpoint(client):
    r = client.get("/sites")
    assert r.status_code == 200
    assert {s["id"] for s in r.json()["sites"]} == EXPECTED_IDS


def test_get_sites_region_filter_endpoint(client):
    r = client.get("/sites", params={"region": "south_polar"})
    assert [s["id"] for s in r.json()["sites"]] == ["chandrayaan-3"]
    assert client.get("/sites", params={"region": "mars"}).status_code == 422


def test_get_one_site_endpoint(client):
    r = client.get("/sites/im-2")
    assert r.status_code == 200
    assert r.json()["name"] == "IM-2 Athena (Mons Mouton)"


def test_unknown_site_gives_404(client):
    r = client.get("/sites/atlantis")
    assert r.status_code == 404
    assert "atlantis" in r.json()["detail"]
