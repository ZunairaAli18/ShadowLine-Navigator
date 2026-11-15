"use client";

import { useMemo } from "react";

import { useNavigatorData } from "@/hooks/useNavigatorData";
import type { NavState } from "@/lib/navState";

/** Visibility + horizon for one curated site and window (reuses the navigator's data hook). */
export function useSiteSky(siteId: string, start: Date, days: number) {
  const startMs = start.getTime();
  const state = useMemo<NavState>(
    () => ({
      location: { kind: "site", siteId },
      start: new Date(startMs),
      days,
      step: 60,
      terrain: "auto",
      t: new Date(startMs),
      tab: null,
      mode: null,
      earthMargin: 0,
      extras: {},
    }),
    [siteId, startMs, days],
  );
  const nav = useNavigatorData(state);
  const { data } = nav;
  const sun = useMemo(
    () => (data ? { az: data.sun.az, el: data.sun.el, fraction: data.sun.visible_fraction, horizonEl: data.sun.horizon_el } : null),
    [data],
  );
  const earth = useMemo(
    () => (data ? { az: data.earth.az, el: data.earth.el, visible: data.earth.visible, horizonEl: data.earth.horizon_el } : null),
    [data],
  );
  return { ...nav, sun, earth };
}
