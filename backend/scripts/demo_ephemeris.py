"""Print Sun/Earth az/el every 6 h for 3 days at a few sites, and time a 30-day hourly run.

Run from backend/:  python scripts/demo_ephemeris.py
"""

import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core import ephemeris  # noqa: E402
from app.core.sites import resolve_site  # noqa: E402

START = datetime(2026, 12, 1, tzinfo=timezone.utc)
SITES = ["apollo-11", "change-4", "shackleton-ridge"]


def main():
    t0 = time.perf_counter()
    ephemeris.load_ephemeris()
    print(f"Kernels loaded in {time.perf_counter() - t0:.2f} s\n")

    for site_id in SITES:
        s = resolve_site(site_id=site_id)
        p = ephemeris.compute_positions(s.lat, s.lon, START, days=3, step_minutes=6 * 60)
        print(f"{s.name}  (lat {s.lat:.3f}, lon {s.lon:.3f})")
        print(f"  {'time (UTC)':<17} {'sun az':>7} {'sun el':>7} {'earth az':>9} {'earth el':>9}")
        for i, t in enumerate(p.times):
            print(f"  {t:%Y-%m-%d %H:%M} {p.sun_az[i]:7.2f} {p.sun_el[i]:7.2f} "
                  f"{p.earth_az[i]:9.2f} {p.earth_el[i]:9.2f}")
        print()

    s = resolve_site(site_id="shackleton-ridge")
    t0 = time.perf_counter()
    p = ephemeris.compute_positions(s.lat, s.lon, START, days=30, step_minutes=60)
    dt = time.perf_counter() - t0
    print(f"30-day hourly computation ({len(p.times)} points, {s.name}): {dt * 1000:.0f} ms")


if __name__ == "__main__":
    main()
