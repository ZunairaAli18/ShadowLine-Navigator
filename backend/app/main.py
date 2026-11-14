"""FastAPI app: CORS, startup (catalog + ephemeris loaded once), error mapping, request timing, routes."""

import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import router
from app.core import ephemeris, sites

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
    yield


app = FastAPI(
    title="Shadowline API",
    description="Lunar landing site navigator: Sun/Earth visibility, power and comms windows.",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
