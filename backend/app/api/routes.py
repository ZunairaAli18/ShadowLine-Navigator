"""API endpoints. Calculations arrive in later chunks; those endpoints return 501 for now."""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request

from app.core import sites
from app.models import (
    CompareRequest,
    CompareResponse,
    HealthResponse,
    HorizonResponse,
    Region,
    Site,
    SitesResponse,
    SnapshotResponse,
    VisibilityResponse,
)

router = APIRouter()


def _not_implemented():
    raise HTTPException(status_code=501, detail="Not implemented yet")


@router.get("/health", response_model=HealthResponse)
def health(request: Request) -> HealthResponse:
    return HealthResponse(ephemeris_loaded=getattr(request.app.state, "ephemeris", None) is not None)


@router.get("/sites", response_model=SitesResponse)
def list_sites(region: Optional[Region] = None) -> SitesResponse:
    return SitesResponse(sites=sites.list_sites(region))


@router.get("/sites/{site_id}", response_model=Site)
def get_site(site_id: str) -> Site:
    try:
        return sites.get_site(site_id)
    except sites.SiteNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/visibility", response_model=VisibilityResponse)
def visibility(
    site_id: Optional[str] = None,
    lat: Optional[float] = Query(None, ge=-90, le=90),
    lon: Optional[float] = Query(None, ge=-180, le=360),
    start: datetime = Query(..., description="UTC ISO 8601, e.g. 2026-12-01T00:00:00Z"),
    days: float = Query(30, gt=0, le=366),
    step_minutes: int = Query(60, ge=5, le=1440),
):
    _not_implemented()


@router.get("/snapshot", response_model=SnapshotResponse)
def snapshot(
    site_id: Optional[str] = None,
    lat: Optional[float] = Query(None, ge=-90, le=90),
    lon: Optional[float] = Query(None, ge=-180, le=360),
    time: datetime = Query(..., description="UTC ISO 8601"),
):
    _not_implemented()


@router.get("/horizon", response_model=HorizonResponse)
def horizon(site_id: str):
    _not_implemented()


@router.post("/compare", response_model=CompareResponse)
def compare(req: CompareRequest):
    _not_implemented()
