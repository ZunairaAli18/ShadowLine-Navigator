import { describe, expect, it } from "vitest";

import { createFpsWatch } from "./fpsWatch";

/** Feed frames every `dt` ms from t0 until t1; return the first window result that reported an average. */
function run(dt: number | ((i: number) => number), t1 = 6000, t0 = 0) {
  const w = createFpsWatch();
  w.start(t0);
  const results: { avg: number; tooSlow: boolean }[] = [];
  let t = t0;
  for (let i = 0; t < t1; i++) {
    t += typeof dt === "number" ? dt : dt(i);
    const r = w.frame(t);
    if (r.avg !== null) results.push({ avg: r.avg, tooSlow: r.tooSlow });
  }
  return results;
}

describe("fps watchdog", () => {
  it("trips on steadily slow frames (75 ms ≈ 13 fps)", () => {
    const r = run(75);
    expect(r[0].avg).toBeGreaterThan(12);
    expect(r[0].avg).toBeLessThan(14);
    expect(r[0].tooSlow).toBe(true);
  });

  it("does not trip at a healthy frame rate", () => {
    expect(run(16.7).every((x) => !x.tooSlow)).toBe(true);
    expect(run(16.7)[0].avg).toBeCloseTo(60, 0);
  });

  it("ignores windows with throttling gaps (400 ms)", () => {
    const r = run(400, 12000);
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((x) => !x.tooSlow)).toBe(true);
  });

  it("ignores the warm-up (a long first frame doesn't poison the window)", () => {
    // 900 ms shader-compile stall, then 60 fps
    const r = run((i) => (i === 0 ? 900 : 16.7));
    expect(r.every((x) => !x.tooSlow)).toBe(true);
  });

  it("stop() discards the partial window", () => {
    const w = createFpsWatch();
    w.start(0);
    let t = 1000;
    for (let i = 0; i < 20; i++) w.frame((t += 75)); // 1.5 s of slow frames
    w.stop();
    t += 5000; // paused (on-demand rendering)
    const first = w.frame(t);
    expect(first.avg).toBeNull(); // a new window opens; nothing reported from the old one
  });

  it("only reports at the threshold boundary when below minFps", () => {
    expect(run(1000 / 21)[0].tooSlow).toBe(false); // 21 fps
    expect(run(1000 / 19)[0].tooSlow).toBe(true); // 19 fps
  });
});
