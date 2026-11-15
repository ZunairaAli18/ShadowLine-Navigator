"""API endpoints.

Errors are mapped in main.py: SiteNotFoundError -> 404, SiteInputError -> 422,
EphemerisError -> 400, EphemerisNotLoadedError -> 503.
"""

from datetime import datetime, timedelta
from functools import lru_cache
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from app.core import ephemeris, metrics, sites, terrain, terrain_patch, visibility
from app.models import (
    MAX_BEST_RANGE_DAYS,
    MAX_WINDOW_DAYS,
    BestWindow,
    BestWindowsResponse,
    BodyPosition,
    CompareRequest,
    CompareResponse,
    Countdown,
    Countdowns,
    EarthSeries,
    GlobeGeometryResponse,
    HealthResponse,
    HorizonResponse,
    Region,
    ScenarioResult,
    Site,
    SitesResponse,
    SnapshotResponse,
    SunSeries,
    TerrainMode,
    TerrainPatchResponse,
    VisibilityResponse,
)

router = APIRouter()

SNAPSHOT_LOOKAHEAD_DAYS = 30
SNAPSHOT_LOOKAHEAD_STEP_MINUTES = 30
BEST_WINDOWS_STEP_MINUTES = 60
VERDICT_RANK = {"good": 0, "risky": 1, "not_viable": 2}

# Shared query parameters
SITE_ID = Query(None, description="Curated site id (or give lat + lon)")
LAT = Query(None, ge=-90, le=90, description="Latitude, degrees (-90 south pole .. 90)")
LON = Query(None, ge=-180, le=360, description="East-positive longitude; -180..180 or 0..360")
TERRAIN_MODE = Query("auto", description="'auto' = LOLA horizon if available; 'flat' = force 0 deg horizon")
EARTH_MARGIN = Query(0.0, ge=0, le=30, description="Extra degrees Earth must clear the horizon by")


def _r(values, ndigits: int) -> list[float]:
    return [round(float(v), ndigits) for v in values]


# ---------------------------------------------------------------- basics


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(ephemeris_loaded=ephemeris.is_loaded())


@router.get("/sites", response_model=SitesResponse)
def list_sites(region: Optional[Region] = None) -> SitesResponse:
    return SitesResponse(sites=sites.list_sites(region))


@router.get("/sites/{site_id}", response_model=Site)
def get_site(site_id: str) -> Site:
    return sites.get_site(site_id)


@router.get("/horizon", response_model=HorizonResponse)
def horizon(site_id: str) -> HorizonResponse:
    site = sites.get_site(site_id)
    h = terrain.get_horizon(site)
    return HorizonResponse(
        site_id=site.id,
        terrain=h.terrain,
        elevation=_r(h.elevation, 2),
        dem_source=h.meta.get("dem_source"),
        dem_resolution_m=h.meta.get("dem_resolution_m"),
        max_distance_km=h.meta.get("max_distance_km"),
        site_height_m=h.meta.get("site_height_m"),
    )


@router.get("/terrain-patch", response_model=TerrainPatchResponse)
def get_terrain_patch(site_id: str) -> TerrainPatchResponse:
    """3D terrain patch metadata (40 km LOLA height grid around the site) and the URL of its binary heights."""
    site = sites.get_site(site_id)
    if not terrain_patch.has_patch(site.id):
        raise HTTPException(
            status_code=404,
            detail=f"No 3D terrain patch for '{site.id}'. 3D terrain is available for Shackleton ridge and IM-2.",
        )
    return TerrainPatchResponse(**{k: v for k, v in terrain_patch.get_meta(site.id).items()
                                   if k in TerrainPatchResponse.model_fields})


# ---------------------------------------------------------------- visibility


@router.get("/visibility", response_model=VisibilityResponse)
def get_visibility(
    site_id: Optional[str] = SITE_ID,
    lat: Optional[float] = LAT,
    lon: Optional[float] = LON,
    start: datetime = Query(..., description="UTC ISO 8601, e.g. 2026-12-01T00:00:00Z"),
    days: float = Query(14, gt=0, le=MAX_WINDOW_DAYS),
    step_minutes: int = Query(60, ge=5, le=1440),
    terrain_mode: TerrainMode = TERRAIN_MODE,
    earth_margin_deg: float = EARTH_MARGIN,
) -> VisibilityResponse:
    site = sites.resolve_site(site_id, lat, lon)
    vis = visibility.cached_visibility(site, start, days, step_minutes, terrain_mode, earth_margin_deg)
    return VisibilityResponse(
        site=site,
        terrain=vis.terrain,
        start=vis.start,
        step_minutes=vis.step_minutes,
        times=list(vis.times),
        sun=SunSeries(
            az=_r(vis.sun_az, 2), el=_r(vis.sun_el, 3), horizon_el=_r(vis.sun_horizon_el, 2),
            visible_fraction=_r(vis.sun_visible_fraction, 3),
        ),
        earth=EarthSeries(
            az=_r(vis.earth_az, 2), el=_r(vis.earth_el, 3), horizon_el=_r(vis.earth_horizon_el, 2),
            visible=[bool(v) for v in vis.earth_visible],
        ),
        metrics=metrics.compute_metrics(vis),
    )


# ---------------------------------------------------------------- snapshot


@router.get("/snapshot", response_model=SnapshotResponse)
def get_snapshot(
    site_id: Optional[str] = SITE_ID,
    lat: Optional[float] = LAT,
    lon: Optional[float] = LON,
    time: datetime = Query(..., description="UTC ISO 8601"),
    terrain_mode: TerrainMode = TERRAIN_MODE,
    earth_margin_deg: float = EARTH_MARGIN,
) -> SnapshotResponse:
    site = sites.resolve_site(site_id, lat, lon)
    snap = visibility.snapshot_visibility(site, time, terrain_mode, earth_margin_deg)
    ahead = visibility.cached_visibility(site, time, SNAPSHOT_LOOKAHEAD_DAYS, SNAPSHOT_LOOKAHEAD_STEP_MINUTES,
                                         terrain_mode, earth_margin_deg)
    m = metrics.compute_metrics(ahead)
    return SnapshotResponse(
        site=site,
        terrain=snap.terrain,
        time=snap.time,
        sun=BodyPosition(
            az=round(snap.sun_az, 2), el=round(snap.sun_el, 3), horizon_el=round(snap.sun_horizon_el, 2),
            visible=snap.sun_up, visible_fraction=round(snap.sun_visible_fraction, 3),
        ),
        earth=BodyPosition(
            az=round(snap.earth_az, 2), el=round(snap.earth_el, 3), horizon_el=round(snap.earth_horizon_el, 2),
            visible=snap.earth_visible, visible_fraction=1.0 if snap.earth_visible else 0.0,
        ),
        countdowns=Countdowns(
            sunrise=Countdown(time=m.next_sunrise, hours=m.next_sunrise_hours),
            sunset=Countdown(time=m.next_sunset, hours=m.next_sunset_hours),
            earthrise=Countdown(time=m.next_earthrise, hours=m.next_earthrise_hours),
            earthset=Countdown(time=m.next_earthset, hours=m.next_earthset_hours),
        ),
    )


# ---------------------------------------------------------------- globe geometry


@lru_cache(maxsize=64)
def _globe_cached(start_iso: str, days: float, step_minutes: int) -> GlobeGeometryResponse:
    g = ephemeris.compute_globe_geometry(datetime.fromisoformat(start_iso), days, step_minutes)
    return GlobeGeometryResponse(
        start=g.times[0],
        step_minutes=step_minutes,
        times=list(g.times),
        subsolar_lat=_r(g.subsolar_lat, 4),
        subsolar_lon=_r(g.subsolar_lon, 4),
        subearth_lat=_r(g.subearth_lat, 4),
        subearth_lon=_r(g.subearth_lon, 4),
    )


@router.get("/globe-geometry", response_model=GlobeGeometryResponse)
def globe_geometry(
    start: datetime = Query(..., description="UTC ISO 8601, e.g. 2026-12-01T00:00:00Z"),
    days: float = Query(14, gt=0, le=MAX_WINDOW_DAYS),
    step_minutes: int = Query(60, ge=5, le=1440),
) -> GlobeGeometryResponse:
    """Sub-solar and sub-Earth points for the 3D Moon map (same window rules and time grid as /visibility)."""
    return _globe_cached(ephemeris._to_utc(start).isoformat(), float(days), int(step_minutes))


# ---------------------------------------------------------------- compare


@router.post("/compare", response_model=CompareResponse)
def compare(req: CompareRequest) -> CompareResponse:
    results = []
    for sc in req.scenarios:
        site = sites.resolve_site(sc.site_id, sc.lat, sc.lon)
        vis = visibility.cached_visibility(site, sc.start, sc.days, sc.step_minutes, sc.terrain_mode,
                                           sc.earth_margin_deg)
        results.append(ScenarioResult(
            label=sc.label, site=site, terrain=vis.terrain, start=vis.start, days=sc.days,
            step_minutes=sc.step_minutes, metrics=metrics.compute_metrics(vis),
        ))
    return CompareResponse(results=results)


# ---------------------------------------------------------------- best windows


@router.get("/best-windows", response_model=BestWindowsResponse)
def best_windows(
    site_id: Optional[str] = SITE_ID,
    lat: Optional[float] = LAT,
    lon: Optional[float] = LON,
    from_: datetime = Query(..., alias="from", description="Earliest mission start, UTC ISO 8601"),
    to: datetime = Query(..., description=f"Latest mission start, at most {MAX_BEST_RANGE_DAYS} days after 'from'"),
    mission_days: float = Query(14, gt=0, le=MAX_WINDOW_DAYS),
    candidate_step_hours: float = Query(12, ge=1, le=168),
    top: int = Query(5, ge=1, le=50),
    min_separation_hours: Optional[float] = Query(
        None, ge=0, le=MAX_BEST_RANGE_DAYS * 24,
        description="Picked starts must be at least this far apart. Default: mission length "
                    "(non-overlapping windows). 0 = no spreading.",
    ),
    terrain_mode: TerrainMode = TERRAIN_MODE,
    earth_margin_deg: float = EARTH_MARGIN,
) -> BestWindowsResponse:
    site = sites.resolve_site(site_id, lat, lon)
    range_start, range_end = ephemeris._to_utc(from_), ephemeris._to_utc(to)
    span_h = (range_end - range_start).total_seconds() / 3600.0
    if span_h < 0:
        raise HTTPException(422, "'to' must be on or after 'from'.")
    if span_h > MAX_BEST_RANGE_DAYS * 24:
        raise HTTPException(422, f"'to' must be at most {MAX_BEST_RANGE_DAYS} days after 'from' "
                                 f"(got {span_h / 24:.1f} days).")

    # One visibility run covering every candidate window, then slide over it.
    step = BEST_WINDOWS_STEP_MINUTES
    vis = visibility.cached_visibility(site, range_start, span_h / 24.0 + mission_days, step,
                                       terrain_mode, earth_margin_deg)
    n = max(1, round(mission_days * 1440 / step))
    candidates = []
    k = 0
    while k * candidate_step_hours <= span_h + 1e-9:
        i = round(k * candidate_step_hours * 60 / step)
        if i + n > len(vis.times):
            break
        m = metrics.compute_metrics(visibility.slice_visibility(vis, i, n))
        start = vis.times[i]
        candidates.append(BestWindow(
            start=start, end=start + timedelta(days=mission_days), verdict=m.verdict,
            verdict_reasons=m.verdict_reasons, sun_pct=m.sun_pct, earth_pct=m.earth_pct,
            both_pct=m.both_pct, longest_dark_hours=m.longest_dark_hours,
        ))
        k += 1

    candidates.sort(key=lambda w: (VERDICT_RANK[w.verdict], -w.both_pct, w.longest_dark_hours, w.start))

    # Greedy spread: take the best remaining candidate that is far enough from every one already picked,
    # so the list shows distinct options instead of 12-hour neighbours of the same window.
    sep_h = mission_days * 24 if min_separation_hours is None else min_separation_hours
    picked: list[BestWindow] = []
    for w in candidates:
        if len(picked) == top:
            break
        if all(abs((w.start - p.start).total_seconds()) / 3600 >= sep_h for p in picked):
            picked.append(w)

    return BestWindowsResponse(
        site=site, terrain=vis.terrain, range_start=range_start, range_end=range_end,
        mission_days=mission_days, candidate_step_hours=candidate_step_hours,
        min_separation_hours=sep_h, candidates_evaluated=len(candidates), windows=picked,
    )
