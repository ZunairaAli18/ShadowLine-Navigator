"""Pydantic request/response models: the API contract with the frontend.

Don't rename fields without telling the frontend team.

Conventions (see CLAUDE.md):
- Angles in degrees.
- Azimuth: 0 = north, 90 = east, clockwise.
- Elevation: degrees above the local flat horizon.
- Longitude east-positive, normalized to -180..180. Latitude -90..90.
- Times are UTC datetimes, serialized as ISO 8601 with "Z" (e.g. "2026-12-01T00:00:00Z").
- Percentages are 0-100. Fractions are 0-1.
"""

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, model_validator

Terrain = Literal["lola", "flat"]
"""'lola' = real LOLA terrain horizon; 'flat' = 0 deg horizon fallback (UI should say so)."""

Verdict = Literal["good", "risky", "not_viable"]

TerrainMode = Literal["auto", "flat"]
"""'auto' = LOLA horizon if available, else flat. 'flat' = force a 0 deg horizon (for comparisons)."""

MAX_WINDOW_DAYS = 60       # longest /visibility or /compare window
MAX_BEST_RANGE_DAYS = 180  # longest /best-windows search range (from..to)

Region = Literal["equatorial", "far_side", "south_polar", "south_pole", "north_polar", "north_pole"]
"""equatorial = |lat| < 60; *_polar = 60..80; *_pole = 80..90. far_side is set by hand in the catalog."""


def normalize_lon(lon: float) -> float:
    """Map any longitude (e.g. 0..360) to -180..180."""
    lon = ((lon + 180.0) % 360.0) - 180.0
    return 180.0 if lon == -180.0 else lon


# ---------------------------------------------------------------- sites


class Site(BaseModel):
    id: str = Field(description="Stable id, e.g. 'im-2'. 'custom' for ad-hoc lat/lon.")
    name: str
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    region: Region
    mission: Optional[str] = Field(None, description="Associated mission, e.g. 'Intuitive Machines IM-2 (2025)'")
    description: Optional[str] = None
    why_interesting: Optional[str] = Field(None, description="1-2 sentences on why this site matters for planning")
    coords_verified: bool = Field(False, description="True if lat/lon were checked against an authoritative source")
    has_terrain: bool = Field(description="True if a LOLA horizon profile exists for this site (computed, not stored)")
    has_terrain_patch: bool = Field(
        description="True if a 3D terrain patch (40 km LOLA height grid) exists for this site (computed, not stored)"
    )


class SitesResponse(BaseModel):
    sites: list[Site]


# ---------------------------------------------------------------- visibility


class SunSeries(BaseModel):
    """Parallel arrays, one entry per entry in VisibilityResponse.times."""

    az: list[float]
    el: list[float]
    horizon_el: list[float] = Field(description="Terrain horizon elevation at the Sun's azimuth (0 for flat)")
    visible_fraction: list[float] = Field(description="Fraction of the solar disk above the terrain horizon, 0-1")


class EarthSeries(BaseModel):
    """Parallel arrays, one entry per entry in VisibilityResponse.times."""

    az: list[float]
    el: list[float]
    horizon_el: list[float] = Field(description="Terrain horizon elevation at Earth's azimuth (0 for flat)")
    visible: list[bool] = Field(description="Earth center above the terrain horizon (minus earth_margin_deg)")


EventType = Literal["sunrise", "sunset", "earthrise", "earthset"]


class Event(BaseModel):
    type: EventType
    time: datetime = Field(description="UTC, interpolated between time steps")
    hours_from_start: float


class Metrics(BaseModel):
    """Metrics for the requested window. "Sun up" = center of the solar disk above the terrain skyline."""

    sun_pct: float = Field(description="% of time steps with the Sun up")
    earth_pct: float = Field(description="% of time steps with Earth visible (direct-to-Earth comms possible)")
    both_pct: float = Field(description="% of time steps with the Sun up and Earth visible")
    longest_dark_hours: float = Field(description="Longest continuous stretch with the Sun down")
    longest_dark_truncated: bool = Field(
        description="True if that stretch touches the window start or end, so it is 'at least' this long"
    )
    longest_no_earth_hours: float = Field(description="Longest continuous stretch without Earth in view")
    longest_no_earth_truncated: bool
    sun_up_at_start: bool
    earth_visible_at_start: bool
    next_sunrise: Optional[datetime] = Field(None, description="First sunrise after the window start; null if none")
    next_sunrise_hours: Optional[float] = Field(None, description="Hours from the window start")
    next_sunset: Optional[datetime] = Field(
        None, description="First sunset after the start (after the next sunrise if the Sun starts down)"
    )
    next_sunset_hours: Optional[float] = None
    next_earthrise: Optional[datetime] = None
    next_earthrise_hours: Optional[float] = None
    next_earthset: Optional[datetime] = None
    next_earthset_hours: Optional[float] = None
    max_sun_el: float
    mean_sun_el: float
    power_index: float = Field(
        description="Mean visible fraction of the solar disk over the window, 0-1. "
        "Assumes Sun-facing panels (vertical or tracking, as used at the poles)."
    )
    events: list[Event] = Field(description="Sun/Earth rise and set events in the window, in order (max 50)")
    verdict: Verdict
    verdict_reasons: list[str] = Field(description="Short plain-English reasons for the verdict")


class VisibilityResponse(BaseModel):
    site: Site
    terrain: Terrain
    start: datetime
    step_minutes: int
    times: list[datetime]
    sun: SunSeries
    earth: EarthSeries
    metrics: Metrics


# ---------------------------------------------------------------- snapshot


class BodyPosition(BaseModel):
    az: float
    el: float
    horizon_el: float = Field(description="Terrain horizon elevation at this azimuth (0 for flat)")
    visible: bool
    visible_fraction: float = Field(description="Sun: fraction of disk visible, 0-1. Earth: 0 or 1.")


class Countdown(BaseModel):
    time: Optional[datetime] = Field(None, description="When the event happens; null if not found in search window")
    hours: Optional[float] = Field(None, description="Hours from the snapshot time until the event")


class Countdowns(BaseModel):
    sunrise: Countdown
    sunset: Countdown
    earthrise: Countdown
    earthset: Countdown


class SnapshotResponse(BaseModel):
    site: Site
    terrain: Terrain
    time: datetime
    sun: BodyPosition
    earth: BodyPosition
    countdowns: Countdowns


# ---------------------------------------------------------------- horizon


class HorizonResponse(BaseModel):
    site_id: str
    terrain: Terrain
    elevation: list[float] = Field(
        description="360 values; elevation[i] = terrain horizon elevation (deg) at azimuth i deg"
    )
    # Metadata from the LOLA horizon file; all null when terrain == "flat".
    dem_source: Optional[str] = Field(None, description="DEM file used, e.g. 'LDEM_80S_80MPP_ADJ.TIF'")
    dem_resolution_m: Optional[float] = None
    max_distance_km: Optional[float] = Field(None, description="How far out terrain was searched")
    site_height_m: Optional[float] = Field(None, description="Site height above the 1737.4 km reference sphere")


class TerrainPatchResponse(BaseModel):
    """Metadata of a 3D terrain patch; the heights are a separate binary file at bin_url."""

    site_id: str
    lat: float
    lon: float
    grid_size: int = Field(description="Samples per side (square grid)")
    spacing_m: float = Field(description="Distance between neighbouring samples, metres")
    extent_m: float = Field(description="Side length of the patch, metres (centred on the site)")
    z_scale: float = Field(description="height_m = uint16 value * z_scale + z_offset")
    z_offset: float
    z_min: float
    z_max: float
    site_height_m: float = Field(description="Site height above the 1737.4 km reference sphere")
    frame: Literal["ENU"] = Field(description="x = east, y = north, z = up (m), origin = site surface; z includes curvature")
    row_order: str
    dem_source: str
    dem_resolution_m: Optional[float] = None
    credit: str
    bin_url: str = Field(description="Path of the uint16 little-endian height grid, row-major from the north-west")


# ---------------------------------------------------------------- compare


class Scenario(BaseModel):
    """One site/date scenario. Give either site_id, or lat + lon."""

    label: Optional[str] = Field(None, description="Display name, e.g. 'Shackleton, Dec 2026'")
    site_id: Optional[str] = None
    lat: Optional[float] = Field(None, ge=-90, le=90)
    lon: Optional[float] = Field(None, ge=-180, le=360)
    start: datetime
    days: float = Field(14, gt=0, le=MAX_WINDOW_DAYS)
    step_minutes: int = Field(60, ge=5, le=1440)
    terrain_mode: TerrainMode = "auto"
    earth_margin_deg: float = Field(0.0, ge=0, le=30)

    @model_validator(mode="after")
    def _check_location(self):
        has_coords = self.lat is not None or self.lon is not None
        if self.site_id is not None and has_coords:
            raise ValueError("give either site_id or lat+lon, not both")
        if self.site_id is None and (self.lat is None or self.lon is None):
            raise ValueError("give either site_id, or both lat and lon")
        if self.lon is not None:
            self.lon = normalize_lon(self.lon)
        return self


class CompareRequest(BaseModel):
    scenarios: list[Scenario] = Field(min_length=1, max_length=3)


class ScenarioResult(BaseModel):
    label: Optional[str]
    site: Site
    terrain: Terrain
    start: datetime
    days: float
    step_minutes: int
    metrics: Metrics


class CompareResponse(BaseModel):
    results: list[ScenarioResult] = Field(description="Same order as the request's scenarios")


# ---------------------------------------------------------------- globe geometry


class GlobeGeometryResponse(BaseModel):
    """Where the Sun and Earth are directly overhead on the Moon (MOON_ME frame), aligned with /visibility times."""

    start: datetime
    step_minutes: int
    times: list[datetime]
    subsolar_lat: list[float] = Field(description="Latitude with the Sun at the zenith (deg)")
    subsolar_lon: list[float] = Field(description="East longitude with the Sun at the zenith (deg, -180..180)")
    subearth_lat: list[float] = Field(description="Latitude with Earth at the zenith (deg); wobbles ~±7° (libration)")
    subearth_lon: list[float] = Field(description="East longitude with Earth at the zenith (deg, -180..180)")


# ---------------------------------------------------------------- best windows


class BestWindow(BaseModel):
    start: datetime
    end: datetime
    verdict: Verdict
    verdict_reasons: list[str]
    sun_pct: float
    earth_pct: float
    both_pct: float
    longest_dark_hours: float


class BestWindowsResponse(BaseModel):
    site: Site
    terrain: Terrain
    range_start: datetime = Field(description="Earliest mission start considered (the 'from' parameter)")
    range_end: datetime = Field(description="Latest mission start considered (the 'to' parameter)")
    mission_days: float
    candidate_step_hours: float
    min_separation_hours: float = Field(description="Picked starts are at least this far apart (0 = no spreading)")
    candidates_evaluated: int
    windows: list[BestWindow] = Field(
        description="Best first: verdict (good > risky > not_viable), then both_pct, then shortest darkness. "
        "May hold fewer than `top` if the range can't fit that many well-separated starts."
    )


# ---------------------------------------------------------------- misc


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    ephemeris_loaded: bool
