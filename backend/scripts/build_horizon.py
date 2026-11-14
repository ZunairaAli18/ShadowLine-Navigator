"""LOLA DEM -> terrain horizon profile (offline).

For a site, walk outward along each whole-degree azimuth (0 = north, clockwise) on a sphere,
sample the DEM, and record the maximum terrain elevation angle seen in that direction.
Writes app/data/horizons/<site_id>.json.

DEMs (in backend/data_raw/, gitignored):
  - LDEM_80S_80MPP_ADJ.TIF : south polar stereographic, 80 m/px, 80S-90S
  - the LOLA global 64 ppd GeoTIFF (simple cylindrical); found automatically, or pass --global-dem
The polar map is used when the whole circle around the site lies inside it; otherwise the global map.

Usage (from backend/):
  python scripts/build_horizon.py                    # all curated sites
  python scripts/build_horizon.py --site im-2        # one site
  python scripts/build_horizon.py --lat -85 --lon 30 # test point (printed, not saved)
"""

import argparse
import json
import math
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

R_MOON = 1_737_400.0  # m
OBSERVER_HEIGHT_M = 2.0
MAX_DISTANCE_M = 150_000.0
DATA_RAW = BACKEND / "data_raw"
POLAR_DEM_NAME = "LDEM_80S_80MPP_ADJ.TIF"
HORIZONS_DIR = BACKEND / "app" / "data" / "horizons"


class DemMissingError(SystemExit):
    """A required DEM file is not on disk."""


# ---------------------------------------------------------------- lunar body frames
#
# Our sites and ephemeris use the mean-Earth frame (MOON_ME_DE421). Some LOLA products (filename "_PA_")
# use the principal-axis frame (MOON_PA_DE421). The two differ by a fixed ~104 arcsec rotation
# (up to ~875 m on the surface), defined in moon_080317.tf. We convert ME lat/lon -> PA before sampling.

_me_to_pa = None


def me_to_pa_matrix() -> np.ndarray:
    """3x3 rotation taking ME body-fixed vectors to PA body-fixed vectors (constant in time)."""
    global _me_to_pa
    if _me_to_pa is None:
        from app.core import ephemeris

        eph = ephemeris.load_ephemeris()
        pa = eph.pc.build_frame_named("MOON_PA_DE421")
        t = eph.ts.utc(2000, 1, 1)  # any epoch: the ME<->PA offset is a fixed TK rotation
        _me_to_pa = pa.rotation_at(t) @ eph.frame.rotation_at(t).T
    return _me_to_pa


def me_to_pa(lat, lon):
    """Convert ME lat/lon (deg) to PA lat/lon (deg)."""
    p, l = np.radians(np.asarray(lat, float)), np.radians(np.asarray(lon, float))
    v = np.stack([np.cos(p) * np.cos(l), np.cos(p) * np.sin(l), np.sin(p)])
    x, y, z = np.tensordot(me_to_pa_matrix(), v, axes=1)
    return np.degrees(np.arcsin(np.clip(z, -1, 1))), np.degrees(np.arctan2(y, x))


def detect_body_frame(path: Path) -> str:
    """'PA' if the filename marks a principal-axis product (e.g. LDEM64_PA_pixel_202405.tif), else 'ME'."""
    return "PA" if "PA" in Path(path).stem.upper().replace("-", "_").split("_") else "ME"


# ---------------------------------------------------------------- DEM access


class Dem:
    """A GeoTIFF DEM; samples heights (m) at lunar lat/lon using the file's own CRS and transform."""

    def __init__(self, path: Path, label: str, body_frame: str = None):
        import rasterio
        from pyproj import CRS, Transformer

        self.path = Path(path)
        self.label = label
        # The CRS doesn't record ME vs PA, so take it from the filename unless given.
        self.body_frame = body_frame or detect_body_frame(self.path)
        self.ds = rasterio.open(self.path)
        if self.ds.crs is None:
            raise SystemExit(f"{self.path.name}: file has no CRS; can't georeference it.")
        self.crs = CRS.from_user_input(self.ds.crs.to_wkt())
        geodetic = self.crs.geodetic_crs
        if geodetic is None:
            raise SystemExit(f"{self.path.name}: can't find a geographic (lat/lon) CRS for {self.crs.name}.")
        self.to_dem = Transformer.from_crs(geodetic, self.crs, always_xy=True)
        self.inv = ~self.ds.transform
        self.width, self.height = self.ds.width, self.ds.height
        self.scale = (self.ds.scales or (1.0,))[0] or 1.0
        self.offset = (self.ds.offsets or (0.0,))[0] or 0.0
        self.nodata = self.ds.nodata

        if self.crs.is_geographic:
            deg_x, deg_y = abs(self.ds.transform.a), abs(self.ds.transform.e)
            self.resolution_m = math.radians(deg_y) * R_MOON
            # Full-globe cylindrical map: wrap columns across the antimeridian.
            self.wraps = abs(deg_x * self.width - 360.0) < 1e-6 * 360
        else:
            self.resolution_m = abs(self.ds.transform.e) * self.crs.axis_info[0].unit_conversion_factor
            self.wraps = False

    def describe(self) -> str:
        import warnings

        b = self.ds.bounds
        units = "deg" if self.crs.is_geographic else "m"
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            proj4 = self.crs.to_proj4() or "no proj4"
        ell = self.crs.ellipsoid
        radius = f"{ell.semi_major_metre:.0f} m" if ell else "unknown"
        return (
            f"[{self.label}] {self.path.name}\n"
            f"  CRS:        {self.crs.name}  ({proj4})\n"
            f"  body radius: {radius}  (expect 1737400 for the Moon)\n"
            f"  body frame: {self.body_frame}"
            f"{'  (site lat/lon converted ME -> PA before sampling)' if self.body_frame == 'PA' else ''}\n"
            f"  size:       {self.width} x {self.height} px\n"
            f"  bounds:     left={b.left:.4f} bottom={b.bottom:.4f} right={b.right:.4f} top={b.top:.4f} ({units})\n"
            f"  resolution: {abs(self.ds.transform.a):.6g} x {abs(self.ds.transform.e):.6g} {units}/px "
            f"(~{self.resolution_m:.1f} m)\n"
            f"  scale/offset: {self.scale} / {self.offset}   nodata: {self.nodata}"
        )

    def pixel_coords(self, lat: np.ndarray, lon: np.ndarray):
        """Fractional (col, row) of pixel centers for ME lat/lon arrays (degrees)."""
        lat, lon = np.asarray(lat, float), np.asarray(lon, float)
        if self.body_frame == "PA":
            lat, lon = me_to_pa(lat, lon)
        x, y = self.to_dem.transform(lon, lat)
        col, row = self.inv * (np.asarray(x), np.asarray(y))
        col, row = np.asarray(col) - 0.5, np.asarray(row) - 0.5
        if self.wraps:
            col = np.mod(col, self.width)
        return col, row

    def covers(self, lat: np.ndarray, lon: np.ndarray) -> bool:
        """True if every point lies inside the raster (with room for bilinear neighbors) and has data."""
        col, row = self.pixel_coords(lat, lon)
        if not np.all(np.isfinite(col) & np.isfinite(row)):
            return False
        inside_cols = True if self.wraps else (col.min() >= 0 and col.max() <= self.width - 1)
        if not (inside_cols and row.min() >= 0 and row.max() <= self.height - 1):
            return False
        return bool(np.all(np.isfinite(self.sample(lat, lon))))

    def _read_window(self, c0: int, r0: int, c1: int, r1: int) -> np.ndarray:
        from rasterio.windows import Window

        raw = self.ds.read(1, window=Window(c0, r0, c1 - c0 + 1, r1 - r0 + 1))
        data = raw.astype(np.float32) * np.float32(self.scale) + np.float32(self.offset)
        if self.nodata is not None:
            data[raw == self.nodata] = np.nan  # compare in the file's own dtype
        return data

    def sample(self, lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
        """Bilinear heights (m); NaN outside the raster or on nodata."""
        lat, lon = np.asarray(lat, float), np.asarray(lon, float)
        col, row = self.pixel_coords(lat, lon)
        out = np.full(col.shape, np.nan)
        ok = np.isfinite(col) & np.isfinite(row) & (row >= 0) & (row <= self.height - 1)
        if not self.wraps:
            ok &= (col >= 0) & (col <= self.width - 1)
        if not ok.any():
            return out
        c, r = col[ok], row[ok]
        r0i = np.clip(np.floor(r).astype(int), 0, self.height - 2)
        rmin, rmax = int(r0i.min()), int(r0i.max()) + 1
        if self.wraps:  # read full-width rows so columns can wrap
            cmin, cmax = 0, self.width - 1
        else:
            c0i = np.clip(np.floor(c).astype(int), 0, self.width - 2)
            cmin, cmax = int(c0i.min()), int(c0i.max()) + 1
        win = self._read_window(cmin, rmin, cmax, rmax)

        fr = r - r0i
        if self.wraps:
            c0i = np.floor(c).astype(int) % self.width
            c1i = (c0i + 1) % self.width
            fc = c - np.floor(c)
        else:
            c1i = c0i + 1
            fc = c - c0i
        rr0, rr1 = r0i - rmin, r0i + 1 - rmin
        cc0, cc1 = c0i - cmin, c1i - cmin
        top = win[rr0, cc0] * (1 - fc) + win[rr0, cc1] * fc
        bot = win[rr1, cc0] * (1 - fc) + win[rr1, cc1] * fc
        out[ok] = top * (1 - fr) + bot * fr
        return out

    def sample_one(self, lat: float, lon: float) -> float:
        return float(self.sample(np.array([lat]), np.array([lon]))[0])


# ---------------------------------------------------------------- geometry


def ray_points(lat: float, lon: float, step_m: float, max_m: float = MAX_DISTANCE_M):
    """Great-circle destinations for azimuths 0..359 and distances step..max. Returns (lat, lon, d_rad), deg."""
    az = np.radians(np.arange(360.0))[:, None]                    # (360, 1)
    dist = np.arange(step_m, max_m + step_m / 2, step_m)          # (n,)
    d = (dist / R_MOON)[None, :]                                  # angular distance, rad
    p1, l1 = math.radians(lat), math.radians(lon)
    sin_p2 = np.sin(p1) * np.cos(d) + np.cos(p1) * np.sin(d) * np.cos(az)
    p2 = np.arcsin(np.clip(sin_p2, -1, 1))
    l2 = l1 + np.arctan2(np.sin(az) * np.sin(d) * np.cos(p1), np.cos(d) - np.sin(p1) * sin_p2)
    lon2 = (np.degrees(l2) + 180.0) % 360.0 - 180.0
    return np.degrees(p2), lon2, np.broadcast_to(d, p2.shape)


def elevation_angles(h: np.ndarray, d: np.ndarray, h0: float) -> np.ndarray:
    """Elevation angle (deg) of terrain at height h, angular distance d, seen from height h0 (exact sphere)."""
    rh = R_MOON + h
    return np.degrees(np.arctan2(rh * np.cos(d) - (R_MOON + h0), rh * np.sin(d)))


def circle(lat: float, lon: float, radius_m: float = MAX_DISTANCE_M, n: int = 720):
    """n points on the circle of given radius around the site (for DEM coverage checks)."""
    az = np.radians(np.arange(n) * 360.0 / n)
    d, p1, l1 = radius_m / R_MOON, math.radians(lat), math.radians(lon)
    s = np.sin(p1) * np.cos(d) + np.cos(p1) * np.sin(d) * np.cos(az)
    la = np.degrees(np.arcsin(np.clip(s, -1, 1)))
    lo = np.degrees(l1 + np.arctan2(np.sin(az) * np.sin(d) * np.cos(p1), np.cos(d) - np.sin(p1) * s))
    return la, (lo + 180.0) % 360.0 - 180.0


# ---------------------------------------------------------------- horizon


@dataclass
class HorizonResult:
    lat: float
    lon: float
    site_height_m: float
    dem: Dem
    elevation_deg: np.ndarray
    seconds: float
    warnings: list = field(default_factory=list)

    def to_json(self, site_id: str) -> dict:
        return {
            "site_id": site_id,
            "lat": self.lat,
            "lon": self.lon,
            "site_height_m": round(self.site_height_m, 1),
            "observer_height_m": OBSERVER_HEIGHT_M,
            "max_distance_km": MAX_DISTANCE_M / 1000,
            "dem_source": self.dem.path.name,
            "dem_resolution_m": round(self.dem.resolution_m, 1),
            "dem_body_frame": self.dem.body_frame,
            "azimuth_step_deg": 1,
            "elevation_deg": [round(float(v), 2) for v in self.elevation_deg],
        }


def choose_dem(lat: float, lon: float, polar: Dem, global_: Dem) -> Dem:
    """Polar map if the whole circle (and the site) fits inside it with valid data, else the global map."""
    if polar is not None:
        clat, clon = circle(lat, lon)
        if polar.covers(np.append(clat, lat), np.append(clon, lon)):
            return polar
    return global_


def compute_horizon(lat: float, lon: float, dem: Dem) -> HorizonResult:
    t0 = time.perf_counter()
    warnings = []
    h_site = dem.sample_one(lat, lon)
    if not math.isfinite(h_site):
        raise ValueError(f"No DEM height at the site ({lat}, {lon}) in {dem.path.name}.")
    h0 = h_site + OBSERVER_HEIGHT_M

    plat, plon, d = ray_points(lat, lon, step_m=dem.resolution_m)
    heights = dem.sample(plat.ravel(), plon.ravel()).reshape(plat.shape)
    missing = np.isnan(heights)
    if missing.any():
        warnings.append(f"{100 * missing.mean():.2f}% of samples had no DEM data (ignored)")
    angles = elevation_angles(heights, d, h0)
    with np.errstate(all="ignore"):
        horizon = np.nanmax(np.where(missing, np.nan, angles), axis=1)
    empty = np.isnan(horizon)
    if empty.any():
        warnings.append(f"{int(empty.sum())} azimuths had no data at all; set to 0 deg")
        horizon[empty] = 0.0
    return HorizonResult(lat, lon, h_site, dem, horizon, time.perf_counter() - t0, warnings)


# ---------------------------------------------------------------- CLI


def find_dems(polar_path=None, global_path=None) -> tuple[Path, Path]:
    """Locate both DEM files or exit with a clear message."""
    if polar_path:
        polar = Path(polar_path)
    else:  # accept .tif / .tiff in any case
        stem = Path(POLAR_DEM_NAME).stem.upper()
        matches = [p for p in DATA_RAW.glob("*") if p.stem.upper() == stem
                   and p.suffix.lower() in (".tif", ".tiff")] if DATA_RAW.is_dir() else []
        polar = matches[0] if matches else DATA_RAW / POLAR_DEM_NAME
    problems = []
    if not polar.is_file():
        problems.append(f"  - South polar DEM not found: {polar}")
    if global_path:
        glob_ = Path(global_path)
        if not glob_.is_file():
            problems.append(f"  - Global DEM not found: {glob_}")
    else:
        candidates = sorted(
            p for p in DATA_RAW.glob("*") if p.suffix.lower() in (".tif", ".tiff") and p.name != polar.name
        ) if DATA_RAW.is_dir() else []
        if len(candidates) == 1:
            glob_ = candidates[0]
        else:
            glob_ = None
            found = ", ".join(p.name for p in candidates) or "none"
            problems.append(
                f"  - Global 64 ppd DEM: expected exactly one other .tif in {DATA_RAW} (found: {found}). "
                "Pass --global-dem <path>."
            )
    if problems:
        raise DemMissingError(
            "Missing DEM file(s); can't build horizons:\n" + "\n".join(problems) +
            f"\nPut both LOLA GeoTIFFs in {DATA_RAW} (gitignored) and rerun."
        )
    return polar, glob_


def summary(name: str, res: HorizonResult) -> str:
    e = res.elevation_deg
    line = (f"{name:<18} {res.dem.label:<6} {res.dem.resolution_m:6.0f} m  h={res.site_height_m:8.1f} m  "
            f"min {e.min():6.2f}  max {e.max():6.2f} (az {int(np.argmax(e)):3d})  mean {e.mean():6.2f}  "
            f"{res.seconds:5.1f} s")
    for w in res.warnings:
        line += f"\n{'':<18} WARNING: {w}"
    return line


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--site", help="build one curated site by id")
    ap.add_argument("--lat", type=float)
    ap.add_argument("--lon", type=float)
    ap.add_argument("--polar-dem", help=f"default: data_raw/{POLAR_DEM_NAME}")
    ap.add_argument("--global-dem", help="default: the other .tif in data_raw/")
    ap.add_argument("--out", default=str(HORIZONS_DIR), help="output folder for <site_id>.json")
    args = ap.parse_args(argv)
    if (args.lat is None) != (args.lon is None):
        ap.error("--lat and --lon go together")

    polar_path, global_path = find_dems(args.polar_dem, args.global_dem)
    polar, global_ = Dem(polar_path, "polar"), Dem(global_path, "global")

    from app.core.sites import list_sites, resolve_site

    print(polar.describe())
    print(global_.describe())
    print("\nSanity check: DEM height at known sites")
    for sid in ("shackleton-ridge", "im-2", "apollo-11"):
        s = resolve_site(site_id=sid)
        hp, hg = polar.sample_one(s.lat, s.lon), global_.sample_one(s.lat, s.lon)
        print(f"  {sid:<18} polar: {hp:9.1f} m   global: {hg:9.1f} m")
    print()

    if args.lat is not None:
        dem = choose_dem(args.lat, args.lon, polar, global_)
        print(summary(f"({args.lat}, {args.lon})", compute_horizon(args.lat, args.lon, dem)))
        return

    targets = [resolve_site(site_id=args.site)] if args.site else list_sites()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    for s in targets:
        dem = choose_dem(s.lat, s.lon, polar, global_)
        res = compute_horizon(s.lat, s.lon, dem)
        (out / f"{s.id}.json").write_text(json.dumps(res.to_json(s.id), indent=1))
        print(summary(s.id, res))
    print(f"\nWrote {len(targets)} horizon file(s) to {out}")


if __name__ == "__main__":
    main()
