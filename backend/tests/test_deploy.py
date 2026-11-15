"""Deployment settings: CORS env vars, kernel fetch script, graceful start without kernels, warm-up."""

import re
from datetime import datetime, timezone

from fastapi.testclient import TestClient

import fetch_kernels
from app import config
from app.core import ephemeris, sites, visibility, warmup


def test_allowed_origins_default_and_env():
    assert config.allowed_origins({}) == ["http://localhost:3000", "http://127.0.0.1:3000"]
    env = {"ALLOWED_ORIGINS": " https://shadowline.vercel.app/ , http://localhost:3000 ,"}
    assert config.allowed_origins(env) == ["https://shadowline.vercel.app", "http://localhost:3000"]


def test_allowed_origin_regex():
    assert config.allowed_origin_regex({}) is None
    rx = config.allowed_origin_regex({"ALLOWED_ORIGIN_REGEX": r"https://.*\.vercel\.app"})
    assert re.fullmatch(rx, "https://shadowline-git-main-team.vercel.app")
    assert not re.fullmatch(rx, "https://vercel.app.evil.com")


def test_cors_regex_middleware():
    from fastapi import FastAPI
    from fastapi.middleware.cors import CORSMiddleware

    app = FastAPI()
    app.add_middleware(CORSMiddleware, allow_origins=config.allowed_origins({}),
                       allow_origin_regex=r"https://.*\.vercel\.app", allow_methods=["*"])
    app.get("/x")(lambda: {"ok": True})
    c = TestClient(app)
    origin = "https://shadowline-abc123.vercel.app"
    assert c.get("/x", headers={"Origin": origin}).headers["access-control-allow-origin"] == origin


def test_warmup_flag():
    assert config.warmup_enabled({})
    assert not config.warmup_enabled({"SHADOWLINE_WARMUP": "0"})


def test_fetch_kernels_matches_ephemeris_urls():
    assert {n: u for n, (u, _) in fetch_kernels.KERNELS.items()} == ephemeris.KERNEL_URLS


def test_local_kernels_have_expected_sizes():
    for name in fetch_kernels.KERNELS:
        path = fetch_kernels.KERNELS_DIR / name
        assert path.exists() and fetch_kernels.size_ok(name, path.stat().st_size), name


def test_missing_kernels_give_503_and_health_false(tmp_path, monkeypatch):
    from app.main import app

    monkeypatch.setattr(ephemeris, "KERNELS_DIR", tmp_path)
    monkeypatch.setattr(ephemeris, "_eph", None)
    with TestClient(app) as c:
        assert c.get("/health").json() == {"status": "ok", "ephemeris_loaded": False}
        assert c.get("/sites").status_code == 200
        r = c.get("/visibility", params={"site_id": "apollo-11", "start": "2026-12-01T00:00:00Z"})
        assert r.status_code == 503 and "fetch_kernels" in r.json()["detail"]
    monkeypatch.undo()
    ephemeris.load_ephemeris()


def test_warm_once_fills_cache():
    ephemeris.load_ephemeris()
    sites.load_catalog()
    visibility.clear_cache()
    start = warmup.current_hour(datetime(2026, 12, 1, 7, 42, 13, tzinfo=timezone.utc))
    assert start == datetime(2026, 12, 1, 7, tzinfo=timezone.utc)
    assert warmup.warm_once(start) == len(sites.list_sites())
    info = visibility.cache_info()
    assert info["misses"] == len(sites.list_sites())
    visibility.cached_visibility(sites.get_site("apollo-11"), start, 14, 60, "auto", 0.0)
    assert visibility.cache_info()["hits"] == 1
    visibility.clear_cache()
