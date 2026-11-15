"""FastAPI app: CORS (from env vars), startup (catalog + ephemeris loaded once, background warm-up),
error mapping, request timing, routes."""

import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api.routes import router
from app import config
from app.core import ephemeris, sites, terrain_patch, warmup

log = logging.getLogger("shadowline")
if not log.handlers:  # uvicorn doesn't configure our logger; give it a plain console handler
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter("%(asctime)s %(levelname)s shadowline: %(message)s", "%H:%M:%S"))
    log.addHandler(_h)
    log.setLevel(logging.INFO)
    log.propagate = False


@asynccontextmanager
async def lifespan(app: FastAPI):
    sites.load_catalog()  # cached in memory for the app's lifetime
    try:
        ephemeris.load_ephemeris()
    except ephemeris.EphemerisNotLoadedError as e:
        # Keep serving (/health, /sites, /horizon); /health reports ephemeris_loaded=false.
        log.warning("ephemeris not loaded.\n%s", e)
    if config.warmup_enabled():
        warmup.start_background()  # daemon thread; startup and /health don't wait for it
    yield


app = FastAPI(
    title="Shadowline API",
    description="Lunar landing site navigator: Sun/Earth visibility, power and comms windows.",
    version="0.2.0",
    lifespan=lifespan,
)

ALLOWED_ORIGINS = config.allowed_origins()
ALLOWED_ORIGIN_REGEX = config.allowed_origin_regex()
log.info("CORS origins: %s%s", ", ".join(ALLOWED_ORIGINS),
         f" + regex {ALLOWED_ORIGIN_REGEX}" if ALLOWED_ORIGIN_REGEX else "")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=ALLOWED_ORIGIN_REGEX,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Process-Time-Ms"],
)


@app.middleware("http")
async def timing(request: Request, call_next):
    t0 = time.perf_counter()
    response = await call_next(request)
    ms = (time.perf_counter() - t0) * 1000
    response.headers["X-Process-Time-Ms"] = f"{ms:.1f}"
    if request.url.path.startswith("/static/") and response.status_code == 200:
        # Static URLs carry a content hash (?v=...), so they can be cached for a year.
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    query = f"?{request.url.query}" if request.url.query else ""
    log.info("%s %s%s -> %d in %.1f ms", request.method, request.url.path, query, response.status_code, ms)
    return response


# ---------------------------------------------------------------- error mapping


def _error(status: int, exc: Exception) -> JSONResponse:
    return JSONResponse(status_code=status, content={"detail": str(exc)})


@app.exception_handler(sites.SiteNotFoundError)
async def _site_not_found(request: Request, exc: sites.SiteNotFoundError):
    return _error(404, exc)


@app.exception_handler(sites.SiteInputError)
async def _site_input(request: Request, exc: sites.SiteInputError):
    return _error(422, exc)


@app.exception_handler(ephemeris.EphemerisError)
async def _ephemeris_input(request: Request, exc: ephemeris.EphemerisError):
    return _error(400, exc)


@app.exception_handler(ephemeris.EphemerisNotLoadedError)
async def _ephemeris_missing(request: Request, exc: ephemeris.EphemerisNotLoadedError):
    return _error(503, exc)


app.include_router(router)

# 3D terrain patch heights (committed .bin files), e.g. /static/terrain/im-2.bin
terrain_patch.PATCHES_DIR.mkdir(parents=True, exist_ok=True)
app.mount(terrain_patch.STATIC_PREFIX, StaticFiles(directory=terrain_patch.PATCHES_DIR), name="terrain")
