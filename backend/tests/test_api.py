import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models import CompareRequest, VisibilityResponse, normalize_lon


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_cors_allows_any_origin(client):
    r = client.get("/health", headers={"Origin": "http://localhost:3000"})
    assert r.headers["access-control-allow-origin"] == "*"


def test_timing_header(client):
    assert float(client.get("/health").headers["x-process-time-ms"]) >= 0


def test_example_response_matches_contract():
    path = Path(__file__).resolve().parents[1] / "example_response.json"
    resp = VisibilityResponse.model_validate(json.loads(path.read_text()))
    n = len(resp.times)
    assert n > 0
    for arr in (resp.sun.az, resp.sun.el, resp.sun.visible_fraction, resp.earth.az, resp.earth.el, resp.earth.visible):
        assert len(arr) == n


def test_normalize_lon():
    assert normalize_lon(190) == -170
    assert normalize_lon(360) == 0
    assert normalize_lon(-180) == 180
    assert normalize_lon(45) == 45


def test_scenario_needs_location():
    with pytest.raises(ValueError):
        CompareRequest.model_validate({"scenarios": [{"start": "2026-12-01T00:00:00Z"}]})
    req = CompareRequest.model_validate({"scenarios": [{"lat": -89.5, "lon": 270, "start": "2026-12-01T00:00:00Z"}]})
    assert req.scenarios[0].lon == -90
