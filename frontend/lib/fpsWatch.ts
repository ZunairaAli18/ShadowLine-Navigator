/**
 * Frame-rate watchdog for the lite 3D terrain (pure, unit-tested).
 *
 * Feed it the timestamp of every frame rendered while the view is meant to animate continuously. It averages
 * over `windowMs` windows and reports `tooSlow` once a full window averages under `minFps`.
 * - The first `warmupMs` after start() are ignored (shader compiles, texture uploads).
 * - A window with any gap over `maxGapMs` is ignored: that's the browser throttling or pausing the page
 *   (backgrounded or occluded window), not a slow GPU, which shows up as steadily long frames instead.
 * - stop() (no continuous rendering) discards the partial window.
 */

export type FpsWatchOptions = { minFps?: number; windowMs?: number; maxGapMs?: number; warmupMs?: number };

export type FpsWatch = {
  start(now: number): void;
  stop(): void;
  /** Returns the window average when a window completes (else null) and whether it was too slow. */
  frame(now: number): { avg: number | null; tooSlow: boolean };
};

export function createFpsWatch({ minFps = 20, windowMs = 3000, maxGapMs = 300, warmupMs = 1000 }: FpsWatchOptions = {}): FpsWatch {
  let warmUntil = 0;
  let windowStart = 0; // 0 = no window open
  let frames = 0;
  let last = 0;
  let maxGap = 0;

  return {
    start(now) {
      warmUntil = now + warmupMs;
      windowStart = 0;
    },
    stop() {
      windowStart = 0;
    },
    frame(now) {
      if (now < warmUntil) return { avg: null, tooSlow: false };
      if (windowStart === 0) {
        windowStart = now;
        frames = 0;
        maxGap = 0;
        last = now;
        return { avg: null, tooSlow: false };
      }
      frames++;
      maxGap = Math.max(maxGap, now - last);
      last = now;
      if (now - windowStart < windowMs) return { avg: null, tooSlow: false };
      const avg = (frames * 1000) / (now - windowStart);
      const throttled = maxGap > maxGapMs;
      windowStart = now;
      frames = 0;
      maxGap = 0;
      return { avg, tooSlow: !throttled && avg < minFps };
    },
  };
}
