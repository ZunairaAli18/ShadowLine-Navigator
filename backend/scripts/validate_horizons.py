"""Validate our Sun/Earth az/el against NASA JPL Horizons (offline check; never called by the app or normal tests).

Horizons setup (confirmed from its response header):
  CENTER='coord@301', COORD_TYPE='GEODETIC', SITE_COORD='<E-lon deg>,<lat deg>,<alt km>'
  -> Horizons places the site in the Moon's MEAN_ME frame on a 1737.4 km sphere (same as our MOON_ME_DE421).
  QUANTITIES='4' = airless apparent azimuth/elevation (light-time, light bending, aberration), az from north, clockwise.
  TLIST + TLIST_TYPE='JD' + TIME_TYPE='UT' asks for exact UTC instants (one call per site/body).

Run from backend/:  python scripts/validate_horizons.py
Writes validation/horizons_comparison.csv and validation/README.md.
"""

import csv
import math
import statistics
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.core import ephemeris  # noqa: E402
from app.core.sites import get_site  # noqa: E402

API_URL = "https://ssd.jpl.nasa.gov/api/horizons.api"
OUT_DIR = BACKEND / "validation"
DELAY_S = 1.0  # be polite between calls
BODIES = {"sun": "10", "earth": "399"}
SITES = ["apollo-11", "change-4", "im-2", "shackleton-ridge"]
TIMES = [
    datetime(2026, 12, 10, 6, 0, tzinfo=timezone.utc),
    datetime(2027, 1, 7, 18, 0, tzinfo=timezone.utc),
    datetime(2027, 2, 14, 3, 30, tzinfo=timezone.utc),
    datetime(2027, 3, 22, 12, 0, tzinfo=timezone.utc),
]
J2000 = datetime(2000, 1, 1, 12, tzinfo=timezone.utc)


class HorizonsError(RuntimeError):
    pass


def jd_utc(t: datetime) -> float:
    return 2451545.0 + (t - J2000).total_seconds() / 86400.0


def query_horizons(body_id: str, lat: float, lon: float, times: list[datetime], client: httpx.Client) -> list[tuple]:
    """[(az, el), ...] from Horizons for one body, site and list of UTC times."""
    params = {
        "format": "json",
        "COMMAND": f"'{body_id}'",
        "OBJ_DATA": "'NO'",
        "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'OBSERVER'",
        "CENTER": "'coord@301'",
        "COORD_TYPE": "'GEODETIC'",
        "SITE_COORD": f"'{lon % 360:.6f},{lat:.6f},0'",
        "TLIST": " ".join(f"'{jd_utc(t):.9f}'" for t in times),
        "TLIST_TYPE": "'JD'",
        "TIME_TYPE": "'UT'",
        "QUANTITIES": "'4'",
        "ANG_FORMAT": "'DEG'",
        "CSV_FORMAT": "'YES'",
    }
    try:
        r = client.get(API_URL, params=params, timeout=60)
        r.raise_for_status()
        data = r.json()
    except (httpx.HTTPError, ValueError) as e:
        raise HorizonsError(f"Could not reach JPL Horizons ({API_URL}): {e}. Are you online?") from e
    if "error" in data:
        raise HorizonsError(f"Horizons returned an error: {data['error']}")
    result = data["result"]
    if "MEAN_ME" not in result:
        raise HorizonsError("Unexpected Horizons frame for the Moon (expected MEAN_ME); check the response header.")
    block = result.split("$$SOE")[1].split("$$EOE")[0]
    rows = []
    for line in block.strip().splitlines():
        fields = [f.strip() for f in line.split(",")]
        nums = [f for f in fields[1:] if f]
        rows.append((float(nums[-2]), float(nums[-1])))
    if len(rows) != len(times):
        raise HorizonsError(f"Expected {len(times)} rows from Horizons, got {len(rows)}")
    return rows


def az_diff(a: float, b: float) -> float:
    """Signed smallest difference a - b in degrees (handles 359 vs 1 = 2)."""
    return (a - b + 180.0) % 360.0 - 180.0


def sky_separation(az1, el1, az2, el2) -> float:
    """Great-circle angle (deg) between two az/el directions."""
    a1, e1, a2, e2 = map(math.radians, (az1, el1, az2, el2))
    c = math.sin(e1) * math.sin(e2) + math.cos(e1) * math.cos(e2) * math.cos(a1 - a2)
    return math.degrees(math.acos(max(-1.0, min(1.0, c))))


def compare_site(site_id: str, times: list[datetime], client: httpx.Client, bodies=("sun", "earth"),
                 delay_s: float = DELAY_S) -> list[dict]:
    site = get_site(site_id)
    rows = []
    for body in bodies:
        horizons = query_horizons(BODIES[body], site.lat, site.lon, times, client)
        for t, (h_az, h_el) in zip(times, horizons):
            p = ephemeris.positions_at(site.lat, site.lon, t)
            o_az, o_el = (p.sun_az, p.sun_el) if body == "sun" else (p.earth_az, p.earth_el)
            rows.append({
                "site": site_id, "lat": site.lat, "lon": site.lon, "time_utc": t.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "body": body, "ours_az": o_az, "ours_el": o_el, "horizons_az": h_az, "horizons_el": h_el,
                "d_az": az_diff(o_az, h_az), "d_el": o_el - h_el,
                "sep_deg": sky_separation(o_az, o_el, h_az, h_el),
            })
        time.sleep(delay_s)
    return rows


def summarize(rows: list[dict]) -> dict:
    out = {}
    for body in ("sun", "earth"):
        r = [x for x in rows if x["body"] == body]
        if not r:
            continue
        out[body] = {
            "n": len(r),
            "max_abs_d_az": max(abs(x["d_az"]) for x in r),
            "max_abs_d_el": max(abs(x["d_el"]) for x in r),
            "max_sep": max(x["sep_deg"] for x in r),
            "mean_sep": statistics.fmean(x["sep_deg"] for x in r),
        }
    return out


def write_outputs(rows: list[dict], summary: dict) -> None:
    OUT_DIR.mkdir(exist_ok=True)
    with open(OUT_DIR / "horizons_comparison.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        for r in rows:
            w.writerow({k: (f"{v:.6f}" if isinstance(v, float) else v) for k, v in r.items()})

    def arcsec(deg):
        return f"{deg * 3600:.2f}\""

    lines = [
        "# Ephemeris validation against NASA JPL Horizons",
        "",
        f"Generated {datetime.now(timezone.utc):%Y-%m-%d %H:%M} UTC by `scripts/validate_horizons.py`.",
        "",
        "We compared the Sun and Earth azimuth/elevation computed by Shadowline (Skyfield + JPL DE421, Moon frame",
        "MOON_ME_DE421) with JPL Horizons (DE441, Moon frame MEAN_ME) for "
        f"{len({r['site'] for r in rows})} lunar sites at {len({r['time_utc'] for r in rows})} times "
        "between December 2026 and March 2027 "
        f"({len(rows)} comparisons). Both are airless apparent positions (light-time, aberration, light bending).",
        "",
        "| Body | Comparisons | Max \\|Δaz\\| | Max \\|Δel\\| | Max sky separation | Mean sky separation |",
        "|---|---|---|---|---|---|",
    ]
    for body, s in summary.items():
        lines.append(f"| {body.title()} | {s['n']} | {s['max_abs_d_az']:.5f}° | {s['max_abs_d_el']:.5f}° | "
                     f"{s['max_sep']:.5f}° ({arcsec(s['max_sep'])}) | {s['mean_sep']:.5f}° ({arcsec(s['mean_sep'])}) |")
    worst = max(s["max_sep"] for s in summary.values())
    lines += [
        "",
        f"**Worst case: {worst:.6f}° ({arcsec(worst)}).** That is about 1/{0.53 / worst:,.0f} of the Sun's",
        "apparent diameter (~0.53°), far below anything that matters for sunlight and Earth-visibility windows",
        "(terrain horizons are sampled at 1° azimuth steps). The tiny residual is consistent with DE421 (ours)",
        "vs DE441 (Horizons) and with Horizons' extra Earth light-bending term.",
        "",
        "Sites: " + ", ".join(sorted({r["site"] for r in rows})) + ".",
        "Times (UTC): " + ", ".join(sorted({r["time_utc"] for r in rows})) + ".",
        "",
        "Δaz is taken the short way round (359° vs 1° = 2°). Sky separation is the great-circle angle between the",
        "two directions, the fairest single number (azimuth differences grow near the zenith).",
        "",
        "Full table: [`horizons_comparison.csv`](horizons_comparison.csv).",
        "Horizons query: `CENTER='coord@301'`, `COORD_TYPE='GEODETIC'`, `SITE_COORD='<E-lon>,<lat>,0'`,",
        "`QUANTITIES='4'` (airless apparent az/el), `TLIST` of UTC Julian dates.",
    ]
    (OUT_DIR / "README.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main():
    ephemeris.load_ephemeris()
    rows = []
    try:
        with httpx.Client(headers={"User-Agent": "shadowline-validation/1.0"}) as client:
            for i, sid in enumerate(SITES):
                print(f"querying Horizons for {sid} ({i + 1}/{len(SITES)})...", flush=True)
                rows += compare_site(sid, TIMES, client)
    except HorizonsError as e:
        raise SystemExit(f"ERROR: {e}")

    print(f"\n{'site':<17} {'time (UTC)':<17} {'body':<5} {'ours az':>11} {'ours el':>10} "
          f"{'Horizons az':>11} {'Horizons el':>11} {'d_az':>9} {'d_el':>9} {'sep':>9}")
    for r in rows:
        print(f"{r['site']:<17} {r['time_utc'][:16].replace('T', ' '):<17} {r['body']:<5} "
              f"{r['ours_az']:11.5f} {r['ours_el']:10.5f} {r['horizons_az']:11.5f} {r['horizons_el']:11.5f} "
              f"{r['d_az']:9.5f} {r['d_el']:9.5f} {r['sep_deg']:9.5f}")
    summary = summarize(rows)
    print()
    for body, s in summary.items():
        print(f"{body:<6} n={s['n']:<3} max |d_az| {s['max_abs_d_az']:.5f}  max |d_el| {s['max_abs_d_el']:.5f}  "
              f"max sep {s['max_sep']:.5f} deg ({s['max_sep'] * 3600:.2f}\")  "
              f"mean sep {s['mean_sep']:.5f} deg ({s['mean_sep'] * 3600:.2f}\")")
    write_outputs(rows, summary)
    print(f"\nWrote {OUT_DIR / 'horizons_comparison.csv'} and {OUT_DIR / 'README.md'}")


if __name__ == "__main__":
    main()
