"""Sun/Earth visibility against the terrain horizon at each time step.

Sun "up" = visible fraction >= 0.5 (center of the disk above the skyline), i.e. sun_margin >= 0.
Earth visible = earth_margin > 0 (Earth's center above the skyline, minus an optional safety margin).
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Literal

import numpy as np

from app.core import ephemeris, terrain
from app.models import Site, Terrain

SUN_RADIUS_KM = 696_000.0
TerrainMode = Literal["auto", "flat"]


def sun_visible_fraction(sun_margin_deg, sun_dist_km) -> np.ndarray:
    """Fraction (0-1) of the solar disk above a straight skyline, sun_margin_deg = center el - skyline el."""
    r = np.degrees(np.arcsin(SUN_RADIUS_KM / np.asarray(sun_dist_km, dtype=float)))  # ~0.27 deg
    d = np.clip(np.asarray(sun_margin_deg, dtype=float) / r, -1.0, 1.0)
    return 1.0 - (np.arccos(d) - d * np.sqrt(1.0 - d * d)) / np.pi


def evaluate(horizon_elev: np.ndarray, sun_az, sun_el, sun_dist_km, earth_az, earth_el,
             earth_margin_deg: float = 0.0) -> dict:
    """Core visibility math on plain arrays (or scalars). horizon_elev: 360 values, index = azimuth."""
    sun_h = terrain.horizon_at(horizon_elev, sun_az)
    earth_h = terrain.horizon_at(horizon_elev, earth_az)
    sun_margin = np.asarray(sun_el, dtype=float) - sun_h
    earth_margin = np.asarray(earth_el, dtype=float) - earth_h - earth_margin_deg
    return {
        "sun_horizon_el": sun_h,
        "sun_margin": sun_margin,
        "sun_visible_fraction": sun_visible_fraction(sun_margin, sun_dist_km),
        "earth_horizon_el": earth_h,
        "earth_margin": earth_margin,
        "earth_visible": earth_margin > 0,
    }


def _horizon(site: Site, terrain_mode: TerrainMode) -> terrain.Horizon:
    if terrain_mode == "auto":
        return terrain.get_horizon(site)
    if terrain_mode == "flat":
        return terrain.flat_horizon(site.id)
    raise ValueError(f"terrain_mode must be 'auto' or 'flat', got {terrain_mode!r}")


@dataclass
class Visibility:
    # inputs
    site: Site
    terrain: Terrain
    start: datetime
    days: float
    step_minutes: int
    earth_margin_deg: float
    # time series (same length)
    times: np.ndarray
    sun_az: np.ndarray
    sun_el: np.ndarray
    sun_dist_km: np.ndarray
    sun_horizon_el: np.ndarray
    sun_margin: np.ndarray
    sun_visible_fraction: np.ndarray
    earth_az: np.ndarray
    earth_el: np.ndarray
    earth_horizon_el: np.ndarray
    earth_margin: np.ndarray
    earth_visible: np.ndarray

    @property
    def sun_up(self) -> np.ndarray:
        return self.sun_visible_fraction >= 0.5


@dataclass
class VisibilitySnapshot:
    site: Site
    terrain: Terrain
    time: datetime
    earth_margin_deg: float
    sun_az: float
    sun_el: float
    sun_dist_km: float
    sun_horizon_el: float
    sun_margin: float
    sun_visible_fraction: float
    earth_az: float
    earth_el: float
    earth_horizon_el: float
    earth_margin: float
    earth_visible: bool

    @property
    def sun_up(self) -> bool:
        return self.sun_visible_fraction >= 0.5


def compute_visibility(site: Site, start: datetime, days: float, step_minutes: int,
                       terrain_mode: TerrainMode = "auto", earth_margin_deg: float = 0.0) -> Visibility:
    horizon = _horizon(site, terrain_mode)
    p = ephemeris.compute_positions(site.lat, site.lon, start, days, step_minutes)
    v = evaluate(horizon.elevation, p.sun_az, p.sun_el, p.sun_dist_km, p.earth_az, p.earth_el, earth_margin_deg)
    return Visibility(
        site=site, terrain=horizon.terrain, start=p.times[0], days=days, step_minutes=step_minutes,
        earth_margin_deg=earth_margin_deg, times=p.times,
        sun_az=p.sun_az, sun_el=p.sun_el, sun_dist_km=p.sun_dist_km,
        earth_az=p.earth_az, earth_el=p.earth_el, **v,
    )


def snapshot_visibility(site: Site, time: datetime, terrain_mode: TerrainMode = "auto",
                        earth_margin_deg: float = 0.0) -> VisibilitySnapshot:
    horizon = _horizon(site, terrain_mode)
    p = ephemeris.positions_at(site.lat, site.lon, time)
    v = evaluate(horizon.elevation, p.sun_az, p.sun_el, p.sun_dist_km, p.earth_az, p.earth_el, earth_margin_deg)
    return VisibilitySnapshot(
        site=site, terrain=horizon.terrain, time=p.time, earth_margin_deg=earth_margin_deg,
        sun_az=p.sun_az, sun_el=p.sun_el, sun_dist_km=p.sun_dist_km,
        earth_az=p.earth_az, earth_el=p.earth_el,
        **{k: (bool(x) if k == "earth_visible" else float(x)) for k, x in v.items()},
    )
