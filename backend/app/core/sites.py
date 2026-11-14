"""Landing site catalog: load sites.json once, look up sites, build custom lat/lon sites."""

import json
import math
from pathlib import Path
from typing import Optional

from app.models import Region, Site, normalize_lon

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
CATALOG_PATH = DATA_DIR / "sites.json"
HORIZONS_DIR = DATA_DIR / "horizons"


class SiteNotFoundError(LookupError):
    """No site with this id in the catalog."""


class SiteInputError(ValueError):
    """Bad site_id / lat / lon combination or values."""


_catalog: Optional[dict[str, Site]] = None


def read_catalog(catalog_path: Path = CATALOG_PATH, horizons_dir: Path = HORIZONS_DIR) -> dict[str, Site]:
    """Read sites.json; has_terrain = a horizons/<id>.json file exists."""
    raw = json.loads(Path(catalog_path).read_text(encoding="utf-8"))
    sites = {}
    for entry in raw:
        if "has_terrain" in entry:
            raise ValueError(f"{entry['id']}: has_terrain is computed, don't put it in sites.json")
        site = Site(**entry, has_terrain=(Path(horizons_dir) / f"{entry['id']}.json").exists())
        if site.id in sites:
            raise ValueError(f"duplicate site id in catalog: {site.id}")
        sites[site.id] = site
    return sites


def load_catalog() -> dict[str, Site]:
    """Load (or reload) the catalog into memory. Called once at startup."""
    global _catalog
    _catalog = read_catalog()
    return _catalog


def _sites() -> dict[str, Site]:
    return _catalog if _catalog is not None else load_catalog()


def list_sites(region: Optional[Region] = None) -> list[Site]:
    return [s for s in _sites().values() if region is None or s.region == region]


def get_site(site_id: str) -> Site:
    try:
        return _sites()[site_id]
    except KeyError:
        raise SiteNotFoundError(f"Unknown site_id '{site_id}'. See GET /sites for valid ids.") from None


def region_for_lat(lat: float) -> Region:
    if lat <= -80:
        return "south_pole"
    if lat <= -60:
        return "south_polar"
    if lat >= 80:
        return "north_pole"
    if lat >= 60:
        return "north_polar"
    return "equatorial"


def custom_name(lat: float, lon: float) -> str:
    ns = "S" if lat < 0 else "N"
    ew = "W" if lon < 0 else "E"
    return f"Custom ({abs(lat):.2f}°{ns}, {abs(lon):.2f}°{ew})"


def resolve_site(site_id: Optional[str] = None, lat: Optional[float] = None, lon: Optional[float] = None) -> Site:
    """Catalog site by id, or a 'custom' site from lat/lon. Exactly one of the two must be given."""
    has_coords = lat is not None or lon is not None
    if site_id is not None and has_coords:
        raise SiteInputError("Give either site_id or lat+lon, not both.")
    if site_id is not None:
        return get_site(site_id)
    if lat is None or lon is None:
        raise SiteInputError("Give either site_id, or both lat and lon.")
    if not (math.isfinite(lat) and math.isfinite(lon)):
        raise SiteInputError("lat and lon must be finite numbers.")
    if not -90 <= lat <= 90:
        raise SiteInputError(f"lat must be between -90 and 90, got {lat}.")
    lon = normalize_lon(lon)
    return Site(
        id="custom",
        name=custom_name(lat, lon),
        lat=lat,
        lon=lon,
        region=region_for_lat(lat),
        has_terrain=False,
        coords_verified=False,
    )
