"""Sun & Earth azimuth/elevation from a point on the lunar surface (Skyfield + DE421).

Kernels are cached in app/data/kernels/ and loaded once at startup via load_ephemeris().
Azimuth: 0 = north, 90 = east, clockwise, 0-360. Elevation: degrees above the flat local horizon.
"""

import math
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import numpy as np
from skyfield.api import Loader
from skyfield.planetarylib import PlanetaryConstants

from app.models import normalize_lon

KERNELS_DIR = Path(__file__).resolve().parents[1] / "data" / "kernels"
FRAME_NAME = "MOON_ME_DE421"

NAIF = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels"
KERNEL_URLS = {
    # de421 and pck00008 have moved to NAIF's a_old_versions/ folders.
    "de421.bsp": f"{NAIF}/spk/planets/a_old_versions/de421.bsp",
    "moon_080317.tf": f"{NAIF}/fk/satellites/moon_080317.tf",
    "pck00008.tpc": f"{NAIF}/pck/a_old_versions/pck00008.tpc",
    "moon_pa_de421_1900-2050.bpc": f"{NAIF}/pck/moon_pa_de421_1900-2050.bpc",
}

# The Moon orientation file covers 1900-2050; stay inside it.
VALID_START = datetime(1900, 1, 1, tzinfo=timezone.utc)
VALID_END = datetime(2050, 1, 1, tzinfo=timezone.utc)

MAX_DAYS = 60
MIN_STEP_MINUTES = 5
MAX_STEP_MINUTES = 1440
MAX_POINTS = 20_000


class EphemerisError(ValueError):
    """Bad request for the ephemeris: out-of-range dates, days, step or coordinates."""


class EphemerisNotLoadedError(RuntimeError):
    """Kernels are not loaded (download failed or load_ephemeris() not called)."""


@dataclass
class _Ephemeris:
    ts: object
    sun: object
    earth: object
    moon: object
    pc: PlanetaryConstants
    frame: object


@dataclass
class Positions:
    """Time series; all arrays have the same length."""

    times: np.ndarray  # UTC datetimes (dtype=object)
    sun_az: np.ndarray
    sun_el: np.ndarray
    sun_dist_km: np.ndarray
    earth_az: np.ndarray
    earth_el: np.ndarray
    earth_dist_km: np.ndarray


@dataclass
class Position:
    """A single moment."""

    time: datetime
    sun_az: float
    sun_el: float
    sun_dist_km: float
    earth_az: float
    earth_el: float
    earth_dist_km: float


_eph: Optional[_Ephemeris] = None


# ---------------------------------------------------------------- loading


def _fetch(load: Loader, name: str):
    """Open a kernel from the cache dir, downloading it from NAIF if missing."""
    try:
        if (KERNELS_DIR / name).exists():
            return load(name)
        return load(KERNEL_URLS[name])
    except Exception as e:
        raise EphemerisNotLoadedError(
            f"Could not load kernel '{name}' ({e}).\n"
            f"  Download it manually from: {KERNEL_URLS[name]}\n"
            f"  and save it as: {KERNELS_DIR / name}"
        ) from e


def load_ephemeris() -> _Ephemeris:
    """Load DE421 + Moon frame kernels once. Safe to call repeatedly."""
    global _eph
    if _eph is not None:
        return _eph
    KERNELS_DIR.mkdir(parents=True, exist_ok=True)
    load = Loader(str(KERNELS_DIR), verbose=False)

    planets = _fetch(load, "de421.bsp")
    pc = PlanetaryConstants()
    pc.read_text(_fetch(load, "moon_080317.tf"))
    pc.read_text(_fetch(load, "pck00008.tpc"))
    pc.read_binary(_fetch(load, "moon_pa_de421_1900-2050.bpc"))

    _eph = _Ephemeris(
        ts=load.timescale(builtin=True),
        sun=planets["sun"],
        earth=planets["earth"],
        moon=planets["moon"],
        pc=pc,
        frame=pc.build_frame_named(FRAME_NAME),
    )
    return _eph


def is_loaded() -> bool:
    return _eph is not None


def _require() -> _Ephemeris:
    if _eph is None:
        raise EphemerisNotLoadedError("Ephemeris not loaded; see server startup log for download instructions.")
    return _eph


# ---------------------------------------------------------------- validation


def _to_utc(t: datetime) -> datetime:
    """Naive datetimes are treated as UTC."""
    return t.replace(tzinfo=timezone.utc) if t.tzinfo is None else t.astimezone(timezone.utc)


def _check_coords(lat: float, lon: float) -> float:
    if not (math.isfinite(lat) and math.isfinite(lon)):
        raise EphemerisError("lat and lon must be finite numbers.")
    if not -90 <= lat <= 90:
        raise EphemerisError(f"lat must be between -90 and 90, got {lat}.")
    return normalize_lon(lon)


def _check_range(first: datetime, last: datetime) -> None:
    if first < VALID_START or last >= VALID_END:
        raise EphemerisError(
            f"Dates must be between {VALID_START:%Y-%m-%d} and {VALID_END:%Y-%m-%d} "
            f"(ephemeris coverage); got {first:%Y-%m-%d %H:%M} to {last:%Y-%m-%d %H:%M} UTC."
        )


# ---------------------------------------------------------------- computation


def _observe(lat: float, lon: float, t):
    """az/el/distance for Sun and Earth at Skyfield Time t (scalar or array)."""
    e = _require()
    observer = e.moon + e.pc.build_latlon_degrees(e.frame, lat, lon)
    at = observer.at(t)
    sun_alt, sun_az, sun_d = at.observe(e.sun).apparent().altaz()
    earth_alt, earth_az, earth_d = at.observe(e.earth).apparent().altaz()
    return (
        sun_az.degrees % 360.0, sun_alt.degrees, sun_d.km,
        earth_az.degrees % 360.0, earth_alt.degrees, earth_d.km,
    )


def compute_positions(lat: float, lon: float, start: datetime, days: float, step_minutes: int) -> Positions:
    """Sun & Earth positions every step_minutes from start, covering `days` (end excluded)."""
    lon = _check_coords(lat, lon)
    if not 0 < days <= MAX_DAYS:
        raise EphemerisError(f"days must be > 0 and <= {MAX_DAYS}, got {days}.")
    if not MIN_STEP_MINUTES <= step_minutes <= MAX_STEP_MINUTES:
        raise EphemerisError(
            f"step_minutes must be between {MIN_STEP_MINUTES} and {MAX_STEP_MINUTES}, got {step_minutes}."
        )
    n = max(1, math.ceil(days * 1440 / step_minutes))
    if n > MAX_POINTS:
        raise EphemerisError(f"Too many points ({n}); max is {MAX_POINTS}. Use fewer days or a larger step.")

    start = _to_utc(start)
    _check_range(start, start + timedelta(minutes=step_minutes * (n - 1)))

    e = _require()
    minutes = np.arange(n) * step_minutes
    t = e.ts.utc(start.year, start.month, start.day, start.hour,
                 start.minute + minutes, start.second + start.microsecond / 1e6)
    sun_az, sun_el, sun_d, earth_az, earth_el, earth_d = _observe(lat, lon, t)
    times = np.array([start + timedelta(minutes=int(m)) for m in minutes], dtype=object)
    return Positions(times, sun_az, sun_el, sun_d, earth_az, earth_el, earth_d)


def positions_at(lat: float, lon: float, time: datetime) -> Position:
    """Sun & Earth positions at one moment."""
    lon = _check_coords(lat, lon)
    time = _to_utc(time)
    _check_range(time, time)
    t = _require().ts.from_datetime(time)
    values = _observe(lat, lon, t)
    return Position(time, *(float(v) for v in values))
