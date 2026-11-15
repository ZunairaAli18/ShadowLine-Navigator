"""Download the 4 JPL/NAIF kernels the app needs into app/data/kernels/.

Runs in the Render build command, so the files are baked into the deploy (never downloaded at startup).
Skips files that already exist with the right size; verifies every download's size; exits 1 on failure.

    python scripts/fetch_kernels.py
"""

import sys
import time
import urllib.request
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
KERNELS_DIR = BACKEND / "app" / "data" / "kernels"

NAIF = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels"
# name -> (url, exact size in bytes). Same URLs as app/core/ephemeris.py (de421 and pck00008 are in
# NAIF's a_old_versions/ folders now).
KERNELS = {
    "de421.bsp": (f"{NAIF}/spk/planets/a_old_versions/de421.bsp", 16_790_528),
    "moon_080317.tf": (f"{NAIF}/fk/satellites/moon_080317.tf", 21_437),
    "pck00008.tpc": (f"{NAIF}/pck/a_old_versions/pck00008.tpc", 111_586),
    "moon_pa_de421_1900-2050.bpc": (f"{NAIF}/pck/moon_pa_de421_1900-2050.bpc", 1_770_496),
}
# Text kernels can differ by a few bytes in line endings (e.g. after a git/Windows round trip).
TOLERANCE = {"moon_080317.tf": 0.02, "pck00008.tpc": 0.02}
RETRIES = 3


def size_ok(name: str, size: int) -> bool:
    expected = KERNELS[name][1]
    return abs(size - expected) <= expected * TOLERANCE.get(name, 0.0)


def download(name: str, url: str) -> None:
    dest = KERNELS_DIR / name
    tmp = dest.with_suffix(dest.suffix + ".part")
    for attempt in range(1, RETRIES + 1):
        try:
            t0 = time.perf_counter()
            req = urllib.request.Request(url, headers={"User-Agent": "shadowline-fetch-kernels/1.0"})
            with urllib.request.urlopen(req, timeout=120) as r, open(tmp, "wb") as f:
                while chunk := r.read(1 << 16):
                    f.write(chunk)
            size = tmp.stat().st_size
            if not size_ok(name, size):
                raise IOError(f"size {size:,} bytes, expected {KERNELS[name][1]:,}")
            tmp.replace(dest)
            print(f"  downloaded {name} ({size:,} bytes, {time.perf_counter() - t0:.1f} s)")
            return
        except Exception as e:  # noqa: BLE001
            tmp.unlink(missing_ok=True)
            print(f"  {name}: attempt {attempt}/{RETRIES} failed: {e}")
            if attempt < RETRIES:
                time.sleep(2 * attempt)
    raise SystemExit(f"Could not download {name} from {url}")


def main() -> int:
    KERNELS_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Kernels -> {KERNELS_DIR}")
    for name, (url, _) in KERNELS.items():
        path = KERNELS_DIR / name
        if path.exists() and size_ok(name, path.stat().st_size):
            print(f"  ok         {name} ({path.stat().st_size:,} bytes, already present)")
            continue
        if path.exists():
            print(f"  {name} has the wrong size ({path.stat().st_size:,} bytes); downloading again")
        download(name, url)
    bad = [n for n in KERNELS if not (KERNELS_DIR / n).exists() or not size_ok(n, (KERNELS_DIR / n).stat().st_size)]
    if bad:
        print(f"FAILED: {', '.join(bad)}")
        return 1
    print("All 4 kernels present.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
