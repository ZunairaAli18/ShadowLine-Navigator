"""Metrics from small hand-made visibility arrays (no ephemeris)."""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import numpy as np
import pytest

from app.core import metrics as M
from app.core.visibility import sun_visible_fraction

T0 = datetime(2026, 12, 1, tzinfo=timezone.utc)
AU_KM = 149_597_870.7


@dataclass
class FakeVis:
    times: np.ndarray
    step_minutes: int
    sun_el: np.ndarray
    sun_margin: np.ndarray
    sun_visible_fraction: np.ndarray
    earth_margin: np.ndarray
    earth_visible: np.ndarray


def make(sun_margin, earth_margin=None, step_minutes=60):
    sun_margin = np.asarray(sun_margin, dtype=float)
    earth_margin = np.ones_like(sun_margin) if earth_margin is None else np.asarray(earth_margin, dtype=float)
    times = np.array([T0 + timedelta(minutes=step_minutes * i) for i in range(len(sun_margin))], dtype=object)
    return FakeVis(times, step_minutes, sun_el=sun_margin.copy(), sun_margin=sun_margin,
                   sun_visible_fraction=sun_visible_fraction(sun_margin, AU_KM),
                   earth_margin=earth_margin, earth_visible=earth_margin > 0)


# ---------------------------------------------------------------- runs and percentages


@pytest.mark.parametrize(
    "flags, expected",
    [
        ([], (0, False)),
        ([0, 0, 0], (0, False)),
        ([1, 1, 1], (3, True)),
        ([0, 1, 1, 0, 1, 0], (2, False)),
        ([1, 1, 0, 1, 1, 1, 0], (3, False)),
        ([1, 1, 1, 0, 1, 0], (3, True)),       # touches start
        ([0, 1, 0, 1, 1, 1], (3, True)),       # touches end
        ([1, 0, 1, 1, 1, 1, 0, 1], (4, False)),  # edge runs shorter than the middle one
    ],
)
def test_longest_run(flags, expected):
    assert M.longest_run(np.array(flags, dtype=bool)) == expected


def test_percentages_and_runs():
    #          up  up  dn  dn  dn  up  up  up  up  dn
    sun = [1, 1, -1, -1, -1, 1, 1, 1, 1, -1]
    earth = [1, -1, -1, 1, 1, 1, 1, -1, -1, -1]
    m = M.compute_metrics(make(sun, earth))
    assert m.sun_pct == 60.0
    assert m.earth_pct == 50.0
    assert m.both_pct == 30.0  # steps 0, 5, 6
    assert m.longest_dark_hours == 3.0 and m.longest_dark_truncated is False
    assert m.longest_no_earth_hours == 3.0 and m.longest_no_earth_truncated is True  # touches the end
    assert m.sun_up_at_start and m.earth_visible_at_start
    assert m.max_sun_el == 1.0 and m.mean_sun_el == pytest.approx(0.2)


def test_dark_run_at_window_start_is_truncated():
    m = M.compute_metrics(make([-1, -1, -1, -1, 1, 1], step_minutes=30))
    assert m.longest_dark_hours == 2.0 and m.longest_dark_truncated is True
    assert m.sun_up_at_start is False


def test_power_index_is_mean_fraction():
    m = M.compute_metrics(make([5, 0, -5, 5]))  # fractions 1, 0.5, 0, 1
    assert m.power_index == pytest.approx(0.625)


# ---------------------------------------------------------------- events


def test_event_time_interpolation_exact_for_straight_line():
    # margin = 1.0 - 0.4 * hour -> crosses zero at 2.5 h; then rises again at 7.5 h with slope +0.4
    hours = np.arange(12)
    margin = np.where(hours <= 5, 1.0 - 0.4 * hours, -1.0 + 0.4 * (hours - 5))
    m = M.compute_metrics(make(margin))
    assert m.next_sunset == T0 + timedelta(hours=2.5)
    assert m.next_sunset_hours == 2.5
    assert m.next_sunrise == T0 + timedelta(hours=7.5)
    assert m.next_sunrise_hours == 7.5
    assert [(e.type, e.hours_from_start) for e in m.events] == [("sunset", 2.5), ("sunrise", 7.5)]


def test_earth_events_interpolated():
    earth = 3.0 - np.arange(10.0)  # crosses 0 at 3 h; visible = margin > 0
    m = M.compute_metrics(make(np.ones(10), earth, step_minutes=60))
    assert m.next_earthset_hours == 3.0
    assert m.next_earthrise is None and m.next_earthrise_hours is None


def test_no_events_when_nothing_flips():
    m = M.compute_metrics(make(np.ones(24), -np.ones(24)))  # Sun always up, Earth never visible
    assert m.events == []
    for name in ("next_sunrise", "next_sunset", "next_earthrise", "next_earthset"):
        assert getattr(m, name) is None and getattr(m, name + "_hours") is None


def test_sun_down_at_start_next_sunset_after_next_sunrise():
    sun = [-1, -1, 1, 1, 1, -1, -1, 1]  # rises ~1.5 h, sets ~4.5 h, rises ~6.5 h
    m = M.compute_metrics(make(sun))
    assert not m.sun_up_at_start
    assert m.next_sunrise_hours == 1.5
    assert m.next_sunset_hours == 4.5
    assert m.next_sunset > m.next_sunrise
    assert [e.type for e in m.events] == ["sunrise", "sunset", "sunrise"]


def test_events_sorted_and_capped():
    n = 200
    sun = np.where(np.arange(n) % 2 == 0, 1.0, -1.0)  # flips every step
    earth = np.where(np.arange(n) % 4 < 2, 1.0, -1.0)
    m = M.compute_metrics(make(sun, earth))
    assert len(m.events) == M.MAX_EVENTS
    times = [e.time for e in m.events]
    assert times == sorted(times)


# ---------------------------------------------------------------- verdict


def test_verdict_good():
    v, reasons = M.verdict_for(sun_pct=90, earth_pct=100, longest_dark_hours=10)
    assert v == "good"
    assert reasons == ["Sun up 90% of the time", "Earth visible 100% of the time", "Longest darkness 10.0 hours"]
    assert M.verdict_for(100, 100, 0)[1][-1] == "No darkness in the window"


def test_verdict_risky():
    v, reasons = M.verdict_for(sun_pct=50, earth_pct=60, longest_dark_hours=72)
    assert v == "risky"
    assert reasons == [
        "Sun up only 50% of the time",
        "Earth visible only 60% of the time: gaps in direct-to-Earth comms",
        "Longest darkness 3.0 days",
    ]


@pytest.mark.parametrize(
    "args, reason",
    [
        ((90, 0, 0), "Earth never visible: needs a relay satellite"),
        ((15, 100, 10), "Sun up only 15% of the time"),
        ((60, 100, 228, True), "Longest darkness at least 9.5 days: too long to survive on batteries"),
    ],
)
def test_verdict_not_viable(args, reason):
    v, reasons = M.verdict_for(*args)
    assert v == "not_viable" and reason in reasons


def test_compute_metrics_verdict_end_to_end():
    m = M.compute_metrics(make(np.ones(48), -np.ones(48)))
    assert m.verdict == "not_viable"
    assert m.verdict_reasons == ["Earth never visible: needs a relay satellite"]
