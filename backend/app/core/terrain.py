"""Terrain horizon profiles: load horizons/<site_id>.json, or fall back to a flat 0 deg horizon.

A profile is 360 values; elevation[i] = terrain horizon elevation (deg) at azimuth i (0 = north, clockwise).
"""

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional, Union

import numpy as np

from app.models import Site, Terrain

HORIZONS_DIR = Path(__file__).resolve().parents[1] / "data" / "horizons"


@dataclass
class Horizon:
    site_id: str
    terrain: Terrain  # "lola" if loaded from a file, "flat" for the 0 deg fallback
    elevation: np.ndarray  # shape (360,)
    meta: dict = field(default_factory=dict)  # everything else from the JSON file (dem_source, ...)


_cache: dict[Path, Horizon] = {}


def clear_cache() -> None:
    _cache.clear()


def flat_horizon(site_id: str) -> Horizon:
    return Horizon(site_id=site_id, terrain="flat", elevation=np.zeros(360))


def load_horizon_file(path: Path) -> Horizon:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    elevation = np.asarray(data.pop("elevation_deg"), dtype=float)
    if elevation.shape != (360,) or not np.all(np.isfinite(elevation)):
        raise ValueError(f"{path}: elevation_deg must be 360 finite numbers")
    return Horizon(site_id=data["site_id"], terrain="lola", elevation=elevation, meta=data)


def get_horizon(site: Site, horizons_dir: Optional[Path] = None) -> Horizon:
    """The site's LOLA horizon if a file exists, else flat. Files are cached after the first load."""
    path = Path(horizons_dir or HORIZONS_DIR) / f"{site.id}.json"
    if site.id == "custom" or not path.is_file():
        return flat_horizon(site.id)
    if path not in _cache:
        _cache[path] = load_horizon_file(path)
    return _cache[path]


def horizon_at(horizon: Union[Horizon, np.ndarray], azimuth) -> np.ndarray:
    """Horizon elevation (deg) at any azimuth(s), linear between whole degrees, wrapping 359 -> 0."""
    elev = horizon.elevation if isinstance(horizon, Horizon) else np.asarray(horizon, dtype=float)
    az = np.mod(np.asarray(azimuth, dtype=float), 360.0)
    i0 = np.floor(az).astype(int) % 360
    frac = az - np.floor(az)
    return elev[i0] * (1 - frac) + elev[(i0 + 1) % 360] * frac
