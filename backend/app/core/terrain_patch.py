"""3D terrain patches (committed files built offline by scripts/build_terrain_patch.py).

Runtime only reads app/data/terrain_patches/<site_id>.json (metadata) and serves <site_id>.bin as a static
file; no rasterio/pyproj needed.
"""

import hashlib
import json
from functools import lru_cache
from pathlib import Path

PATCHES_DIR = Path(__file__).resolve().parents[1] / "data" / "terrain_patches"
STATIC_PREFIX = "/static/terrain"


def has_patch(site_id: str, patches_dir: Path | None = None) -> bool:
    d = Path(patches_dir or PATCHES_DIR)
    return (d / f"{site_id}.json").is_file() and (d / f"{site_id}.bin").is_file()


@lru_cache(maxsize=32)
def _meta(site_id: str, patches_dir: str) -> dict:
    d = Path(patches_dir)
    meta = json.loads((d / f"{site_id}.json").read_text(encoding="utf-8"))
    # Content hash in the URL so the long browser cache can never serve a stale patch after a rebuild.
    digest = hashlib.sha1((d / f"{site_id}.bin").read_bytes()).hexdigest()[:12]
    meta["bin_url"] = f"{STATIC_PREFIX}/{site_id}.bin?v={digest}"
    return meta


def get_meta(site_id: str) -> dict:
    """Metadata + bin_url. Caller checks has_patch first."""
    return dict(_meta(site_id, str(PATCHES_DIR)))


def clear_cache() -> None:
    _meta.cache_clear()
