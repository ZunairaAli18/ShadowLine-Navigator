"""FastAPI app: CORS, startup (ephemeris loaded once), routes."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.core import ephemeris, sites


@asynccontextmanager
async def lifespan(app: FastAPI):
    sites.load_catalog()
    try:
        ephemeris.load_ephemeris()
    except ephemeris.EphemerisNotLoadedError as e:
        # Keep serving (/health, /sites); /health reports ephemeris_loaded=false.
        print(f"WARNING: ephemeris not loaded.\n{e}")
    yield


app = FastAPI(
    title="Shadowline API",
    description="Lunar landing site navigator: Sun/Earth visibility, power and comms windows.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
