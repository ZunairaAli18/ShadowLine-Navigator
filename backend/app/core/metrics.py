"""Window metrics, rise/set events and a verdict, computed only from visibility arrays.

Works on any object with: times, step_minutes, sun_el, sun_margin, sun_visible_fraction,
earth_margin, earth_visible (e.g. visibility.Visibility). No ephemeris calls, so it is easy to unit test.

Durations count whole time steps (a step that is "down" contributes step_minutes of darkness).
Event times are refined by linear interpolation of the margin between the two bracketing steps.
"""

from datetime import timedelta
from typing import Optional

import numpy as np

from app.models import Event, Metrics

# ---------------------------------------------------------------- verdict thresholds (tune here)
NOT_VIABLE_MIN_SUN_PCT = 20.0        # below this: not viable
NOT_VIABLE_MAX_DARK_HOURS = 120.0    # longer darkness: not viable (battery can't bridge it)
GOOD_MIN_SUN_PCT = 70.0
GOOD_MIN_EARTH_PCT = 70.0
GOOD_MAX_DARK_HOURS = 48.0

MAX_EVENTS = 50


# ---------------------------------------------------------------- helpers


def longest_run(flags: np.ndarray) -> tuple[int, bool]:
    """Length of the longest run of True, and whether that run touches either end of the array."""
    flags = np.asarray(flags, dtype=bool)
    if not flags.any():
        return 0, False
    padded = np.concatenate([[False], flags, [False]]).astype(np.int8)
    edges = np.flatnonzero(np.diff(padded))
    starts, ends = edges[0::2], edges[1::2]  # run = flags[start:end]
    i = int(np.argmax(ends - starts))
    return int(ends[i] - starts[i]), bool(starts[i] == 0 or ends[i] == len(flags))


def find_events(times, margin: np.ndarray, state: np.ndarray, step_minutes: int,
                rise: str, set_: str) -> list[tuple[str, object]]:
    """(type, time) for every flip of `state`, with the time where `margin` crosses zero."""
    state = np.asarray(state, dtype=bool)
    margin = np.asarray(margin, dtype=float)
    events = []
    for i in np.flatnonzero(state[1:] != state[:-1]) + 1:
        m0, m1 = margin[i - 1], margin[i]
        frac = m0 / (m0 - m1) if m0 != m1 else 0.5
        frac = min(max(frac, 0.0), 1.0)
        t = times[i - 1] + timedelta(seconds=round(frac * step_minutes * 60))
        events.append((rise if state[i] else set_, t))
    return events


def _fmt_duration(hours: float, truncated: bool = False) -> str:
    text = f"{hours / 24:.1f} days" if hours >= 48 else f"{hours:.1f} hours"
    return f"at least {text}" if truncated else text


def verdict_for(sun_pct, earth_pct, longest_dark_hours, dark_truncated=False) -> tuple[str, list[str]]:
    dark = _fmt_duration(longest_dark_hours, dark_truncated)
    blockers = []
    if earth_pct == 0:
        blockers.append("Earth never visible: needs a relay satellite")
    if sun_pct < NOT_VIABLE_MIN_SUN_PCT:
        blockers.append(f"Sun up only {sun_pct:.0f}% of the time")
    if longest_dark_hours > NOT_VIABLE_MAX_DARK_HOURS:
        blockers.append(f"Longest darkness {dark}: too long to survive on batteries")
    if blockers:
        return "not_viable", blockers

    concerns = []
    if sun_pct < GOOD_MIN_SUN_PCT:
        concerns.append(f"Sun up only {sun_pct:.0f}% of the time")
    if earth_pct < GOOD_MIN_EARTH_PCT:
        concerns.append(f"Earth visible only {earth_pct:.0f}% of the time: gaps in direct-to-Earth comms")
    if longest_dark_hours > GOOD_MAX_DARK_HOURS:
        concerns.append(f"Longest darkness {dark}")
    if concerns:
        return "risky", concerns

    reasons = [f"Sun up {sun_pct:.0f}% of the time", f"Earth visible {earth_pct:.0f}% of the time"]
    reasons.append("No darkness in the window" if longest_dark_hours == 0 else f"Longest darkness {dark}")
    return "good", reasons


# ---------------------------------------------------------------- main


def compute_metrics(vis) -> Metrics:
    times = vis.times
    step_h = vis.step_minutes / 60.0
    fraction = np.asarray(vis.sun_visible_fraction, dtype=float)
    sun_up = fraction >= 0.5
    earth = np.asarray(vis.earth_visible, dtype=bool)
    sun_el = np.asarray(vis.sun_el, dtype=float)

    sun_pct = round(100.0 * sun_up.mean(), 1)
    earth_pct = round(100.0 * earth.mean(), 1)
    both_pct = round(100.0 * (sun_up & earth).mean(), 1)
    dark_steps, dark_trunc = longest_run(~sun_up)
    no_earth_steps, no_earth_trunc = longest_run(~earth)
    dark_h, no_earth_h = round(dark_steps * step_h, 2), round(no_earth_steps * step_h, 2)

    events = find_events(times, vis.sun_margin, sun_up, vis.step_minutes, "sunrise", "sunset")
    events += find_events(times, vis.earth_margin, earth, vis.step_minutes, "earthrise", "earthset")
    events.sort(key=lambda e: e[1])

    def hours(t) -> float:
        return round((t - times[0]).total_seconds() / 3600.0, 2)

    def first(kind) -> tuple[Optional[object], Optional[float]]:
        t = next((t for k, t in events if k == kind), None)
        return (t, hours(t)) if t is not None else (None, None)

    nsr, nsr_h = first("sunrise")
    nss, nss_h = first("sunset")
    ner, ner_h = first("earthrise")
    nes, nes_h = first("earthset")
    verdict, reasons = verdict_for(sun_pct, earth_pct, dark_h, dark_trunc)

    return Metrics(
        sun_pct=sun_pct,
        earth_pct=earth_pct,
        both_pct=both_pct,
        longest_dark_hours=dark_h,
        longest_dark_truncated=dark_trunc,
        longest_no_earth_hours=no_earth_h,
        longest_no_earth_truncated=no_earth_trunc,
        sun_up_at_start=bool(sun_up[0]),
        earth_visible_at_start=bool(earth[0]),
        next_sunrise=nsr, next_sunrise_hours=nsr_h,
        next_sunset=nss, next_sunset_hours=nss_h,
        next_earthrise=ner, next_earthrise_hours=ner_h,
        next_earthset=nes, next_earthset_hours=nes_h,
        max_sun_el=round(float(sun_el.max()), 3),
        mean_sun_el=round(float(sun_el.mean()), 3),
        power_index=round(float(fraction.mean()), 3),
        events=[Event(type=k, time=t, hours_from_start=hours(t)) for k, t in events[:MAX_EVENTS]],
        verdict=verdict,
        verdict_reasons=reasons,
    )
