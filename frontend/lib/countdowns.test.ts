import { describe, expect, it } from "vitest";

import { allEvents, diskFraction, findEvents, formatDuration, nextEvent, stateAt, type CountdownSeries } from "./countdowns";

const H = 3_600_000;
const T0 = Date.UTC(2026, 11, 1);

/** Hourly series from a margin function; Sun up = margin >= 0, fraction 1/0.5/0. Earth margin optional. */
function series(sunMargin: number[], earthMargin?: number[]): CountdownSeries {
  const em = earthMargin ?? sunMargin.map(() => 1);
  return {
    timesMs: sunMargin.map((_, i) => T0 + i * H),
    sunMargin,
    sunUp: sunMargin.map((m) => m >= 0),
    sunFraction: sunMargin.map((m) => (m > 0.3 ? 1 : m < -0.3 ? 0 : 0.5 + m / 0.6)),
    earthMargin: em,
    earthVisible: em.map((m) => m > 0),
  };
}

describe("findEvents", () => {
  it("gives the exact crossing for a straight-line margin", () => {
    // margin = 1 - 0.4 h -> crosses 0 at 2.5 h
    const s = series([1, 0.6, 0.2, -0.2, -0.6]);
    const ev = findEvents(s.sunUp, s.sunMargin, s.timesMs, "sunrise", "sunset");
    expect(ev).toHaveLength(1);
    expect(ev[0].kind).toBe("sunset");
    expect(ev[0].time).toBeCloseTo(T0 + 2.5 * H);
    expect(ev[0].pos).toBeCloseTo(2.5);
  });
});

describe("nextEvent / stateAt", () => {
  const s = series([-1, -0.6, -0.2, 0.2, 0.6, 1, 0.6, 0.2, -0.2, -0.6], [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
  const events = allEvents(s);

  it("counts down from the selected time, not the window start", () => {
    const at0 = stateAt(s, events, 0);
    expect(at0.sunUp).toBe(false);
    expect(at0.countdowns.sunrise!.hoursFromSelected).toBeCloseTo(2.5);
    expect(at0.countdowns.sunset!.hoursFromSelected).toBeCloseTo(7.5);

    const at4 = stateAt(s, events, 4);
    expect(at4.sunUp).toBe(true);
    expect(at4.countdowns.sunrise).toBeNull(); // the only sunrise is behind us
    expect(at4.countdowns.sunset!.hoursFromSelected).toBeCloseTo(3.5);
  });

  it("handles a fractional index", () => {
    const st = stateAt(s, events, 1.25);
    expect(st.timeMs).toBeCloseTo(T0 + 1.25 * H);
    expect(st.countdowns.sunrise!.hoursFromSelected).toBeCloseTo(1.25);
  });

  it("returns null when nothing flips", () => {
    expect(stateAt(s, events, 0).countdowns.earthset).toBeNull();
    expect(stateAt(s, events, 0).countdowns.earthrise).toBeNull();
    expect(stateAt(s, events, 0).earthVisible).toBe(true);
  });

  it("returns null once the selected time is past the last event", () => {
    const st = stateAt(s, events, 9);
    expect(st.countdowns.sunset).toBeNull();
    expect(st.countdowns.sunrise).toBeNull();
    expect(nextEvent(events, "sunset", T0 + 7.6 * H)).toBeNull();
  });

  it("treats an event exactly at the selected time as passed", () => {
    expect(nextEvent(events, "sunrise", T0 + 2.5 * H)).toBeNull();
  });

  it("derives state between steps from the margin, consistent with the event time", () => {
    expect(stateAt(s, events, 2.5).sunFraction).toBeCloseTo(0.5); // margin 0 exactly at the crossing
    const justAfter = stateAt(s, events, 2.6);
    expect(justAfter.sunUp).toBe(true);
    expect(justAfter.sunFraction).toBeGreaterThan(0.5);
    expect(justAfter.countdowns.sunrise).toBeNull(); // the sunrise has just happened
    expect(stateAt(s, events, 2.4).sunUp).toBe(false);
  });
});

describe("diskFraction", () => {
  it("matches the backend formula", () => {
    expect(diskFraction(0)).toBeCloseTo(0.5);
    expect(diskFraction(1)).toBe(1);
    expect(diskFraction(-1)).toBe(0);
    expect(diskFraction(0.1) + diskFraction(-0.1)).toBeCloseTo(1);
  });
});

describe("formatDuration", () => {
  it("formats days, hours and minutes", () => {
    expect(formatDuration(52.5)).toBe("2 d 4 h 30 m");
    expect(formatDuration(4.0833)).toBe("4 h 05 m");
    expect(formatDuration(0.2)).toBe("12 m");
    expect(formatDuration(0.001)).toBe("now");
    expect(formatDuration(-3)).toBe("now");
  });
});
