"""LOLA polar DEM -> 3D terrain patch around a site (offline, dev-only).

For the 3D terrain view: a 40 km x 40 km height grid centred on the site, in the site's local
East-North-Up frame (x = east, y = north, z = up, metres; origin = the site's surface point).

Each grid point (x, y) is a vertical line in that frame. We find where it meets the terrain:
    S = (R + h_site + z) U + x E + y N,   |S| = R + h(lat, lon of S)
so z = sqrt((R + h)^2 - x^2 - y^2) - (R + h_site), iterated a few times because lat/lon depend on z.
z therefore includes the Moon's curvature (about -115 m at 20 km from the site).

Writes app/data/terrain_patches/<site_id>.bin (uint16 little-endian, row-major from the north-west corner,
height = value * z_scale + z_offset) and <site_id>.json (metadata). Both are small and committed.

Usage (from backend/, dev venv):
  python scripts/build_terrain_patch.py                       # shackleton-ridge and im-2
  python scripts/build_terrain_patch.py --site im-2           # one site
"""

import argparse
import json
import math
import sys
import time
from pathlib import Path

import numpy as np

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from build_horizon import DATA_RAW, POLAR_DEM_NAME, R_MOON, Dem  # noqa: E402

PATCHES_DIR = BACKEND / "app" / "data" / "terrain_patches"
DEFAULT_SITES = ("shackleton-ridge", "im-2")
GRID_SIZE = 512
EXTENT_M = 40_000.0
ITERATIONS = 4
CREDIT = "NASA LRO LOLA, NASA GSFC Planetary Geodesy Data Archive (PGDA)"


# ---------------------------------------------------------------- geometry (pure numpy, unit-tested)


def enu_basis(lat: float, lon: float) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """East, North, Up unit vectors (Moon body-fixed) at a lat/lon in degrees."""
    p, l = math.radians(lat), math.radians(lon)
    e = np.array([-math.sin(l), math.cos(l), 0.0])
    n = np.array([-math.sin(p) * math.cos(l), -math.sin(p) * math.sin(l), math.cos(p)])
    u = np.array([math.cos(p) * math.cos(l), math.cos(p) * math.sin(l), math.sin(p)])
    return e, n, u


def grid_axes(grid_size: int = GRID_SIZE, extent_m: float = EXTENT_M) -> tuple[np.ndarray, np.ndarray, float]:
    """x (west -> east, by column) and y (north -> south, by row) coordinates of the grid, and the spacing."""
    spacing = extent_m / (grid_size - 1)
    k = np.arange(grid_size) - (grid_size - 1) / 2
    return k * spacing, -k * spacing, spacing


def index_to_xy(row: int, col: int, grid_size: int, spacing: float) -> tuple[float, float]:
    """Grid index -> ENU metres (row 0 = north edge, col 0 = west edge)."""
    half = (grid_size - 1) / 2
    return (col - half) * spacing, (half - row) * spacing


def xy_to_index(x: float, y: float, grid_size: int, spacing: float) -> tuple[float, float]:
    """ENU metres -> fractional (row, col)."""
    half = (grid_size - 1) / 2
    return half - y / spacing, half + x / spacing


def column_latlon(x, y, z, lat0: float, lon0: float, h_site: float):
    """lat/lon (deg) of the points (x, y, z) given in the site's ENU frame."""
    e, n, u = enu_basis(lat0, lon0)
    s = (R_MOON + h_site + np.asarray(z))[..., None] * u + np.asarray(x)[..., None] * e + np.asarray(y)[..., None] * n
    r = np.linalg.norm(s, axis=-1)
    lat = np.degrees(np.arcsin(np.clip(s[..., 2] / r, -1, 1)))
    lon = np.degrees(np.arctan2(s[..., 1], s[..., 0]))
    return lat, lon


def surface_z(x, y, lat0: float, lon0: float, h_site: float, heights, iterations: int = ITERATIONS):
    """ENU z of the terrain under each (x, y): solve |S| = R + h(lat, lon) along the vertical line."""
    x, y = np.asarray(x, float), np.asarray(y, float)
    rho2 = x * x + y * y
    z = -rho2 / (2 * R_MOON)  # start on the reference sphere through the site
    for _ in range(iterations):
        lat, lon = column_latlon(x, y, z, lat0, lon0, h_site)
        h = heights(lat, lon)
        z = np.sqrt((R_MOON + h) ** 2 - rho2) - (R_MOON + h_site)
    return z


def encode_heights(z: np.ndarray) -> tuple[bytes, float, float]:
    """uint16 little-endian bytes, scale, offset (height = value * scale + offset)."""
    z_min, z_max = float(np.min(z)), float(np.max(z))
    scale = (z_max - z_min) / 65535 if z_max > z_min else 1.0
    q = np.clip(np.round((z - z_min) / scale), 0, 65535).astype("<u2")
    return q.tobytes(order="C"), scale, z_min


def decode_heights(data: bytes, grid_size: int, scale: float, offset: float) -> np.ndarray:
    return np.frombuffer(data, dtype="<u2").reshape(grid_size, grid_size).astype(np.float64) * scale + offset


# ---------------------------------------------------------------- build


def build_patch(site_id: str, lat: float, lon: float, dem: Dem, grid_size: int = GRID_SIZE,
                extent_m: float = EXTENT_M) -> tuple[dict, bytes, np.ndarray]:
    """Returns (metadata, uint16 bytes, z grid in metres)."""
    h_site = dem.sample_one(lat, lon)
    if not math.isfinite(h_site):
        raise ValueError(f"{site_id}: no DEM height at the site in {dem.path.name}")
    xs, ys, spacing = grid_axes(grid_size, extent_m)
    X, Y = np.meshgrid(xs, ys)  # row-major from the north-west corner

    # The whole patch (corners included) must be inside the DEM with data.
    half = extent_m / 2
    clat, clon = column_latlon(np.array([-half, half, half, -half]), np.array([half, half, -half, -half]),
                               np.zeros(4), lat, lon, h_site)
    if not dem.covers(clat, clon):
        raise ValueError(f"{site_id}: the {extent_m / 1000:.0f} km patch isn't fully inside {dem.path.name}")

    z = surface_z(X, Y, lat, lon, h_site, dem.sample)
    if not np.all(np.isfinite(z)):
        raise ValueError(f"{site_id}: {int((~np.isfinite(z)).sum())} grid points have no DEM data")
    data, scale, offset = encode_heights(z)
    meta = {
        "site_id": site_id,
        "lat": lat,
        "lon": lon,
        "grid_size": grid_size,
        "spacing_m": round(spacing, 4),
        "extent_m": extent_m,
        "z_scale": scale,
        "z_offset": offset,
        "z_min": round(float(z.min()), 2),
        "z_max": round(float(z.max()), 2),
        "site_height_m": round(h_site, 1),
        "frame": "ENU",
        "axes": "x = east, y = north, z = up (metres), origin = site surface point; z includes curvature",
        "row_order": "row-major from the north-west corner (row 0 = north edge, col 0 = west edge)",
        "encoding": "uint16 little-endian; height_m = value * z_scale + z_offset",
        "dem_source": dem.path.name,
        "dem_resolution_m": round(dem.resolution_m, 1),
        "credit": CREDIT,
    }
    return meta, data, z


def write_patch(meta: dict, data: bytes, out_dir: Path = PATCHES_DIR) -> tuple[Path, Path]:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    bin_path, json_path = out_dir / f"{meta['site_id']}.bin", out_dir / f"{meta['site_id']}.json"
    bin_path.write_bytes(data)
    json_path.write_text(json.dumps(meta, indent=1))
    return bin_path, json_path


def find_polar_dem(path=None) -> Path:
    if path:
        p = Path(path)
    else:
        stem = Path(POLAR_DEM_NAME).stem.upper()
        matches = [q for q in DATA_RAW.glob("*") if q.stem.upper() == stem
                   and q.suffix.lower() in (".tif", ".tiff")] if DATA_RAW.is_dir() else []
        p = matches[0] if matches else DATA_RAW / POLAR_DEM_NAME
    if not p.is_file():
        raise SystemExit(f"South polar DEM not found: {p}\nPut {POLAR_DEM_NAME} in {DATA_RAW} (gitignored) and rerun.")
    return p


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--site", help="build one curated site by id (default: shackleton-ridge and im-2)")
    ap.add_argument("--polar-dem", help=f"default: data_raw/{POLAR_DEM_NAME}")
    ap.add_argument("--out", default=str(PATCHES_DIR))
    ap.add_argument("--grid-size", type=int, default=GRID_SIZE)
    ap.add_argument("--extent-km", type=float, default=EXTENT_M / 1000)
    args = ap.parse_args(argv)

    from app.core.sites import resolve_site

    dem = Dem(find_polar_dem(args.polar_dem), "polar")
    print(dem.describe())
    for sid in [args.site] if args.site else DEFAULT_SITES:
        s = resolve_site(site_id=sid)
        t0 = time.perf_counter()
        meta, data, z = build_patch(s.id, s.lat, s.lon, dem, args.grid_size, args.extent_km * 1000)
        bin_path, _ = write_patch(meta, data, Path(args.out))
        n = meta["grid_size"]
        edge = z[n // 2, -1]
        print(f"{sid:<18} h_site={meta['site_height_m']:8.1f} m  z {meta['z_min']:8.1f} .. {meta['z_max']:8.1f} m  "
              f"east edge z={edge:7.1f} m  {bin_path.stat().st_size / 1024:6.0f} KB  {time.perf_counter() - t0:4.1f} s")
    print(f"Wrote to {args.out}")


if __name__ == "__main__":
    main()
