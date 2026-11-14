"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ApiError, getHorizon, getVisibility, type VisibilityResponse } from "@/lib/api";
import { isoUtc, type NavState } from "@/lib/navState";

const DEBOUNCE_MS = 300;
const FLAT = Array.from({ length: 360 }, () => 0);

export type HorizonData = { elevation: number[]; terrain: "lola" | "flat" };
export type BodyState = { az: number; el: number; horizonEl: number; visible: boolean; fraction: number };

type Status =
  | { kind: "loading" }
  | { kind: "ok" }
  | { kind: "error"; title: string; message: string };

/**
 * Loads /visibility (+ /horizon for curated sites) for the navigator inputs.
 * Debounced (300 ms), cancels stale requests, keeps the previous data on screen while loading.
 * The selected time is NOT an input here: scrubbing only changes the index, never refetches.
 */
export function useNavigatorData(state: NavState) {
  const [data, setData] = useState<VisibilityResponse | null>(null);
  const [horizon, setHorizon] = useState<HorizonData | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const horizonCache = useRef(new Map<string, HorizonData>());

  const loc = state.location;
  const key = JSON.stringify({
    loc,
    start: isoUtc(state.start),
    days: state.days,
    step: state.step,
    terrain: state.terrain,
    attempt,
  });

  useEffect(() => {
    const ctrl = new AbortController();
    const timer = window.setTimeout(async () => {
      setStatus({ kind: "loading" });
      try {
        const where = loc.kind === "site" ? { site_id: loc.siteId } : { lat: loc.lat, lon: loc.lon };
        const visP = getVisibility(
          { ...where, start: state.start, days: state.days, step_minutes: state.step, terrain_mode: state.terrain },
          { signal: ctrl.signal },
        );
        let horizonP: Promise<HorizonData>;
        if (loc.kind === "custom" || state.terrain === "flat") {
          horizonP = Promise.resolve({ elevation: FLAT, terrain: "flat" });
        } else {
          const cached = horizonCache.current.get(loc.siteId);
          horizonP = cached
            ? Promise.resolve(cached)
            : getHorizon(loc.siteId, { signal: ctrl.signal }).then((h) => {
                const hd: HorizonData = { elevation: h.elevation, terrain: h.terrain };
                horizonCache.current.set(loc.siteId, hd);
                return hd;
              });
        }
        const [vis, hor] = await Promise.all([visP, horizonP]);
        setData(vis);
        setHorizon(hor);
        setStatus({ kind: "ok" });
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
        if (e instanceof ApiError && e.status === 0) {
          setStatus({ kind: "error", title: "Model is waking up…", message: e.message });
        } else {
          setStatus({ kind: "error", title: "Couldn't compute this window", message: (e as Error).message });
        }
      }
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
    // key captures every input (and retries)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  const n = data?.times.length ?? 0;
  const times = useMemo(() => (data ? data.times.map((t) => new Date(t)) : []), [data]);

  const sunAt = useCallback(
    (i: number): BodyState | null =>
      data && n
        ? {
            az: data.sun.az[i],
            el: data.sun.el[i],
            horizonEl: data.sun.horizon_el[i],
            fraction: data.sun.visible_fraction[i],
            visible: data.sun.visible_fraction[i] >= 0.5,
          }
        : null,
    [data, n],
  );

  const earthAt = useCallback(
    (i: number): BodyState | null =>
      data && n
        ? {
            az: data.earth.az[i],
            el: data.earth.el[i],
            horizonEl: data.earth.horizon_el[i],
            fraction: data.earth.visible[i] ? 1 : 0,
            visible: data.earth.visible[i],
          }
        : null,
    [data, n],
  );

  return { data, horizon, times, n, status, retry, sunAt, earthAt, metrics: data?.metrics ?? null };
}
