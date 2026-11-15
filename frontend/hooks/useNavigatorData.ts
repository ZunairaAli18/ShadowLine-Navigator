"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ApiError, getHorizon, getVisibility, type VisibilityResponse } from "@/lib/api";
import { allEvents, type CountdownSeries, type TimelineEvent } from "@/lib/countdowns";
import { isoUtc, type NavState } from "@/lib/navState";

const DEBOUNCE_MS = 300;
const FLAT = Array.from({ length: 360 }, () => 0);

export type HorizonData = {
  elevation: number[];
  terrain: "lola" | "flat";
  demSource?: string | null;
  demResolutionM?: number | null;
  siteHeightM?: number | null;
  maxDistanceKm?: number | null;
};
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
  const [dataMargin, setDataMargin] = useState(0); // earth margin the loaded data was computed with
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
    earthMargin: state.earthMargin,
    attempt,
  });

  useEffect(() => {
    const ctrl = new AbortController();
    const timer = window.setTimeout(async () => {
      setStatus({ kind: "loading" });
      try {
        const where = loc.kind === "site" ? { site_id: loc.siteId } : { lat: loc.lat, lon: loc.lon };
        const visP = getVisibility(
          {
            ...where,
            start: state.start,
            days: state.days,
            step_minutes: state.step,
            terrain_mode: state.terrain,
            earth_margin_deg: state.earthMargin,
          },
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
                const hd: HorizonData = {
                  elevation: h.elevation,
                  terrain: h.terrain,
                  demSource: h.dem_source,
                  demResolutionM: h.dem_resolution_m,
                  siteHeightM: h.site_height_m,
                  maxDistanceKm: h.max_distance_km,
                };
                horizonCache.current.set(loc.siteId, hd);
                return hd;
              });
        }
        const [vis, hor] = await Promise.all([visP, horizonP]);
        setData(vis);
        setDataMargin(state.earthMargin);
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

  // Derived series for client-side countdowns/timeline (recomputed only when the data changes).
  const series = useMemo<CountdownSeries | null>(() => {
    if (!data) return null;
    const sunMargin = data.sun.el.map((e, i) => e - data.sun.horizon_el[i]);
    // Same rule as the backend: Earth visible = el - horizon - earth_margin_deg > 0.
    const earthMargin = data.earth.el.map((e, i) => e - data.earth.horizon_el[i] - dataMargin);
    return {
      timesMs: times.map((t) => t.getTime()),
      sunMargin,
      sunFraction: data.sun.visible_fraction,
      sunUp: data.sun.visible_fraction.map((f) => f >= 0.5),
      earthMargin,
      earthVisible: data.earth.visible,
    };
  }, [data, times, dataMargin]);
  const events = useMemo<TimelineEvent[]>(() => (series ? allEvents(series) : []), [series]);

  return { data, horizon, times, n, status, retry, sunAt, earthAt, series, events, dataMargin, metrics: data?.metrics ?? null };
}
