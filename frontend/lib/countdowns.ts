/**
 * Countdowns relative to the SELECTED time, computed client-side from the loaded arrays so they update
 * instantly while scrubbing/playing (pure, unit-tested).
 *
 * Sun "up" = visible_fraction >= 0.5 (same rule as the backend). Earth visible = earth.visible.
 * Event times are refined by linear interpolation of the margin (el - horizon_el) between the bracketing steps.
 */

import { interpAt, timeAt } from "./interp";

export type Countdown = { time: number; hoursFromSelected: number } | null;
export type EventKind = "sunrise" | "sunset" | "earthrise" | "earthset";
export type TimelineEvent = { kind: EventKind; time: number; pos: number };

export type CountdownSeries = {
  timesMs: number[];
  sunUp: boolean[];
  sunMargin: number[];
  sunFraction: number[];
  earthVisible: boolean[];
  earthMargin: number[];
};

/** Fraction of the step (0..1) where the margin crosses zero between samples k-1 and k. */
function crossFrac(m0: number, m1: number): number {
  if (m0 === m1) return 0.5;
  return Math.min(1, Math.max(0, m0 / (m0 - m1)));
}

/** All flips of `state` as events, in time order. */
export function findEvents(
  state: boolean[],
  margin: number[],
  timesMs: number[],
  rise: EventKind,
  set: EventKind,
): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  for (let k = 1; k < state.length; k++) {
    if (state[k] === state[k - 1]) continue;
    const f = crossFrac(margin[k - 1], margin[k]);
    out.push({
      kind: state[k] ? rise : set,
      time: timesMs[k - 1] + f * (timesMs[k] - timesMs[k - 1]),
      pos: k - 1 + f,
    });
  }
  return out;
}

export function allEvents(s: CountdownSeries): TimelineEvent[] {
  return [
    ...findEvents(s.sunUp, s.sunMargin, s.timesMs, "sunrise", "sunset"),
    ...findEvents(s.earthVisible, s.earthMargin, s.timesMs, "earthrise", "earthset"),
  ].sort((a, b) => a.time - b.time);
}

/** Next event of a kind strictly after the selected fractional position, or null. */
export function nextEvent(events: TimelineEvent[], kind: EventKind, selectedMs: number): Countdown {
  const e = events.find((ev) => ev.kind === kind && ev.time > selectedMs + 1);
  return e ? { time: e.time, hoursFromSelected: (e.time - selectedMs) / 3_600_000 } : null;
}

const SUN_RADIUS_DEG = 0.2666;

/** Fraction (0-1) of the solar disk above a straight skyline, same formula as the backend. */
export function diskFraction(marginDeg: number, radiusDeg = SUN_RADIUS_DEG): number {
  const d = Math.min(1, Math.max(-1, marginDeg / radiusDeg));
  return 1 - (Math.acos(d) - d * Math.sqrt(1 - d * d)) / Math.PI;
}

export type SelectedState = {
  timeMs: number;
  sunUp: boolean;
  sunFraction: number;
  earthVisible: boolean;
  countdowns: Record<EventKind, Countdown>;
};

export function stateAt(s: CountdownSeries, events: TimelineEvent[], pos: number): SelectedState {
  const t = timeAt(s.timesMs, pos);
  // At sample points use the backend values; in between, derive everything from the interpolated margins,
  // the same quantity the event times are interpolated from, so state and countdowns always agree.
  const i = Math.round(pos);
  const atSample = Math.abs(pos - i) < 1e-6;
  const sunM = interpAt(s.sunMargin, pos);
  const earthM = interpAt(s.earthMargin, pos);
  return {
    timeMs: t,
    sunUp: atSample ? s.sunUp[i] : sunM >= 0,
    sunFraction: atSample ? s.sunFraction[i] : diskFraction(sunM),
    earthVisible: atSample ? s.earthVisible[i] : earthM > 0,
    countdowns: {
      sunrise: nextEvent(events, "sunrise", t),
      sunset: nextEvent(events, "sunset", t),
      earthrise: nextEvent(events, "earthrise", t),
      earthset: nextEvent(events, "earthset", t),
    },
  };
}

/** "2 d 4 h 30 m", "4 h 05 m", "12 m", "now". */
export function formatDuration(hours: number): string {
  const totalMin = Math.max(0, Math.round(hours * 60));
  if (totalMin === 0) return "now";
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${d} d ${h} h ${m} m`;
  if (h > 0) return `${h} h ${String(m).padStart(2, "0")} m`;
  return `${m} m`;
}
