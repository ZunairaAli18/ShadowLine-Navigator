"""Print visibility metrics for a few sites (14 days hourly from 2026-12-01), plus terrain vs flat at Shackleton.

Run from backend/:  python scripts/demo_metrics.py
"""

import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core import ephemeris, metrics, visibility  # noqa: E402
from app.core.sites import get_site  # noqa: E402

START = datetime(2026, 12, 1, tzinfo=timezone.utc)
DAYS, STEP = 14, 60
SITES = ["apollo-11", "apollo-15", "change-4", "im-2", "shackleton-ridge"]

HEADER = (f"{'site':<18} {'terrain':<7} {'sun%':>6} {'earth%':>7} {'both%':>6} {'dark h':>8} {'noEarth h':>10} "
          f"{'sunset h':>9} {'earthset h':>11} {'power':>6}  verdict")


def hrs(x, truncated=False):
    if x is None:
        return "-"
    return f"{'>=' if truncated else ''}{x:.1f}"


def row(label, vis):
    m = metrics.compute_metrics(vis)
    line = (f"{label:<18} {vis.terrain:<7} {m.sun_pct:6.1f} {m.earth_pct:7.1f} {m.both_pct:6.1f} "
            f"{hrs(m.longest_dark_hours, m.longest_dark_truncated):>8} "
            f"{hrs(m.longest_no_earth_hours, m.longest_no_earth_truncated):>10} "
            f"{hrs(m.next_sunset_hours):>9} {hrs(m.next_earthset_hours):>11} {m.power_index:6.3f}  {m.verdict}")
    return line + "".join(f"\n{'':<20}- {r}" for r in m.verdict_reasons)


def main():
    ephemeris.load_ephemeris()
    print(f"{DAYS} days, every {STEP} min, from {START:%Y-%m-%d %H:%M} UTC  ('>=' = run touches the window edge)\n")
    print(HEADER)
    for sid in SITES:
        print(row(sid, visibility.compute_visibility(get_site(sid), START, DAYS, STEP)))

    print("\nShackleton ridge: real LOLA terrain vs a flat 0 deg horizon")
    print(HEADER)
    site = get_site("shackleton-ridge")
    for mode in ("auto", "flat"):
        print(row(f"shackleton ({mode})", visibility.compute_visibility(site, START, DAYS, STEP, terrain_mode=mode)))


if __name__ == "__main__":
    main()
