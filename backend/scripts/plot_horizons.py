"""Save a PNG per horizon profile (azimuth vs elevation) to backend/horizon_plots/ for eyeballing.

Run from backend/:  python scripts/plot_horizons.py
"""

import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.core.terrain import HORIZONS_DIR, load_horizon_file  # noqa: E402

OUT_DIR = BACKEND / "horizon_plots"


def plot(path: Path, out_dir: Path = OUT_DIR) -> Path:
    h = load_horizon_file(path)
    m = h.meta
    az = np.arange(361)
    el = np.append(h.elevation, h.elevation[0])  # close the loop at 360

    fig, ax = plt.subplots(figsize=(10, 3.5))
    ax.fill_between(az, min(0.0, el.min()) - 0.5, el, color="#8a7f72", alpha=0.85, label="terrain")
    ax.axhline(0, color="k", lw=0.6, ls="--", label="flat horizon")
    ax.set_xlim(0, 360)
    ax.set_xticks(range(0, 361, 45), ["N", "NE", "E", "SE", "S", "SW", "W", "NW", "N"])
    ax.set_xlabel("azimuth")
    ax.set_ylabel("horizon elevation (deg)")
    ax.set_title(
        f"{h.site_id}  ({m['lat']:.3f}, {m['lon']:.3f})   {m['dem_source']} @ {m['dem_resolution_m']:.0f} m   "
        f"max {h.elevation.max():.2f} deg at az {int(np.argmax(h.elevation))}",
        fontsize=9,
    )
    ax.legend(loc="upper right", fontsize=8)
    ax.grid(alpha=0.3)
    fig.tight_layout()
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f"{h.site_id}.png"
    fig.savefig(out, dpi=110)
    plt.close(fig)
    return out


def main():
    files = sorted(HORIZONS_DIR.glob("*.json"))
    if not files:
        raise SystemExit(f"No horizon files in {HORIZONS_DIR}. Run scripts/build_horizon.py first.")
    for f in files:
        print(f"wrote {plot(f)}")


if __name__ == "__main__":
    main()
