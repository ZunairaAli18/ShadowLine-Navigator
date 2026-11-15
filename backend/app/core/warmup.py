"""Background warm-up: precompute the default views so the first demo clicks are instant.

The navigator opens every site on a 14-day window starting at the current UTC hour (60-minute steps,
real terrain, no Earth margin), and the Moon map asks /globe-geometry for the same window. This fills
those caches in a daemon thread, then refreshes them at the start of each new hour. It never blocks
startup or /health, and any failure is only logged.
"""

import logging
import threading
import time
from datetime import datetime, timedelta, timezone

from app.core import ephemeris, sites, visibility

log = logging.getLogger("shadowline")

DEFAULT_DAYS = 14
DEFAULT_STEP_MINUTES = 60

_thread: threading.Thread | None = None


def current_hour(now: datetime | None = None) -> datetime:
    now = now or datetime.now(timezone.utc)
    return now.replace(minute=0, second=0, microsecond=0)


def warm_once(start: datetime) -> int:
    """Fill the visibility and globe caches for every curated site at `start`. Returns how many were warmed."""
    from app.api.routes import _globe_cached  # local import: routes imports this package's siblings

    if not ephemeris.is_loaded():
        return 0
    t0 = time.perf_counter()
    done = 0
    try:
        _globe_cached(start.isoformat(), float(DEFAULT_DAYS), DEFAULT_STEP_MINUTES)
    except Exception:  # noqa: BLE001 - warm-up must never crash the app
        log.exception("warm-up: globe geometry failed")
    for site in sites.list_sites():
        try:
            visibility.cached_visibility(site, start, DEFAULT_DAYS, DEFAULT_STEP_MINUTES, "auto", 0.0)
            done += 1
        except Exception:  # noqa: BLE001
            log.exception("warm-up: %s failed", site.id)
    log.info("warm-up: %d sites + globe for %s in %.1f s", done, start.isoformat(), time.perf_counter() - t0)
    return done


def _loop() -> None:
    while True:
        hour = current_hour()
        warm_once(hour)
        # Sleep until just after the next hour starts, then warm the new default window.
        wake = hour + timedelta(hours=1, seconds=5)
        time.sleep(max(1.0, (wake - datetime.now(timezone.utc)).total_seconds()))


def start_background() -> None:
    """Start the warm-up thread once (no-op if the ephemeris is missing or it's already running)."""
    global _thread
    if _thread is not None or not ephemeris.is_loaded():
        return
    _thread = threading.Thread(target=_loop, name="shadowline-warmup", daemon=True)
    _thread.start()
