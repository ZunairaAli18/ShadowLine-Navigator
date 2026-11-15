"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const SPEEDS = [
  { hoursPerSec: 1, label: "1 h/s" },
  { hoursPerSec: 6, label: "6 h/s" },
  { hoursPerSec: 24, label: "1 d/s" },
] as const;

/**
 * Playback on requestAnimationFrame with a fractional index. Each frame calls seek(newPos), so the sky plot,
 * countdowns and timeline all move together in the same render. No network: it only moves through loaded data.
 */
export function usePlayback({ n, stepMinutes, pos, seek }: { n: number; stepMinutes: number; pos: number; seek: (p: number) => void }) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(6);
  const [loop, setLoop] = useState(false);
  const posRef = useRef(pos);
  const seekRef = useRef(seek);

  useEffect(() => {
    posRef.current = pos;
    seekRef.current = seek;
  });

  useEffect(() => {
    if (!playing || n < 2) return;
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000); // clamp long frames (tab switch)
      last = now;
      let next = posRef.current + (dt * speed * 60) / stepMinutes;
      if (next >= n - 1) {
        if (loop) next = 0;
        else {
          seekRef.current(n - 1);
          setPlaying(false);
          return;
        }
      }
      posRef.current = next;
      seekRef.current(next);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, loop, n, stepMinutes]);

  const toggle = useCallback(() => {
    setPlaying((p) => {
      // Pressing play at the end restarts from the beginning.
      if (!p && posRef.current >= n - 1.001) seekRef.current(0);
      return !p;
    });
  }, [n]);

  return { playing, setPlaying, toggle, speed, setSpeed, loop, setLoop };
}
