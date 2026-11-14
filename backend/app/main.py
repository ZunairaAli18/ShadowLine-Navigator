"""FastAPI app: CORS, startup (ephemeris loaded once), routes."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.core import sites


@asynccontextmanager
async def lifespan(app: FastAPI):
    sites.load_catalog()
    # Chunk 2: load DE421 + Moon frame kernels once here (app.core.ephemeris).
    app.state.ephemeris = None
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
