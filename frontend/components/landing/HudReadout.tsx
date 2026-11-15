"use client";

import { useEffect, useState } from "react";

import { getSnapshot, type SnapshotResponse } from "@/lib/api";

const SITE_ID = "shackleton-ridge";
const REFRESH_MS = 10_000;

const signed = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}°`;
const LOW_SUN_DEG = 3;

/**
 * One plain-English line from the snapshot's visibility flags (real terrain), not the raw elevations:
 * e.g. "Sun just above the horizon · Earth below the skyline, no direct radio contact right now."
 */
export function hudStatus(s: Pick<SnapshotResponse, "sun" | "earth">): string {
  const f = s.sun.visible_fraction;
  const sun =
    f <= 0
      ? "Sun hidden behind the ridge"
      : f < 1
        ? "Sun half hidden behind the ridge"
        : s.sun.el < LOW_SUN_DEG
          ? "Sun just above the horizon"
          : "Sun up";
  const earth = s.earth.visible ? "Earth in view, radio contact possible" : "Earth below the skyline, no direct radio contact";
  return `${sun} · ${earth} right now.`;
}

const utcTime = (iso: string) => new Date(iso).toISOString().slice(11, 19);

/** Live mono HUD: Sun and Earth az/el at Shackleton ridge right now, refreshed every ~10 s (paused when hidden). */
export function HudReadout({ className = "" }: { className?: string }) {
  const [snap, setSnap] = useState<SnapshotResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let ctrl: AbortController | null = null;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      ctrl?.abort();
      ctrl = new AbortController();
      getSnapshot({ site_id: SITE_ID, time: new Date() }, { signal: ctrl.signal })
        .then((s) => {
          setSnap(s);
          setFailed(false);
        })
        .catch((e: unknown) => {
          if ((e as Error)?.name !== "AbortError") setFailed(true);
        });
    };
    tick();
    const id = window.setInterval(tick, REFRESH_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
      ctrl?.abort();
    };
  }, []);

  return (
    <div
      className={`glass inline-flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.2em] ${className}`}
      aria-live="off"
    >
      <span className="flex items-center gap-2 whitespace-nowrap text-lunar-400">
        <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${snap ? "bg-good motion-safe:animate-pulse" : "bg-lunar-600"}`} />
        Shackleton ridge · {snap ? "live" : failed ? "offline" : "…"}
      </span>
      {snap && <span className="whitespace-nowrap tabular-nums text-lunar-500">· updated {utcTime(snap.time)} UTC</span>}
      {snap ? (
        <>
          <span>
            <span className="text-sun">Sun</span>{" "}
            <span className="text-lunar-300">
              az {snap.sun.az.toFixed(2)}° / el {signed(snap.sun.el)}
            </span>
          </span>
          <span>
            <span className="text-earth">Earth</span>{" "}
            <span className="text-lunar-300">
              az {snap.earth.az.toFixed(2)}° / el {signed(snap.earth.el)}
            </span>
          </span>
        </>
      ) : (
        <span className="text-lunar-500">Sun az / el · Earth az / el</span>
      )}
      {/* Plain-English status. Space for 2 lines is reserved on phones (1 from sm up) so changing text never shifts the page. */}
      <p className="min-h-[2lh] basis-full font-body text-xs normal-case leading-snug tracking-normal text-muted sm:min-h-[1lh]">
        {snap ? hudStatus(snap) : failed ? "Live conditions are unavailable right now." : " "}
      </p>
    </div>
  );
}
