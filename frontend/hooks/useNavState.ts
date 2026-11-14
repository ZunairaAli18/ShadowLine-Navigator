"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import { parseNavState, serializeNavState, type NavState } from "@/lib/navState";

/**
 * Navigator state from the URL. Writes use the native History API, which Next syncs with
 * useSearchParams without a router navigation (cheap enough for sliders).
 *  - update(patch): pushState (controls; back button works)
 *  - update(patch, { replace: true }): replaceState (slider scrubbing)
 */
export function useNavState() {
  const params = useSearchParams();
  const key = params.toString();
  // Re-parse only when the query string changes ("now" defaults are floored to the hour, so stable).
  const state = useMemo(() => parseNavState(new URLSearchParams(key)), [key]);

  const update = useCallback(
    (patch: Partial<NavState>, opts: { replace?: boolean } = {}) => {
      const next = { ...state, ...patch };
      // If the window moved and t fell outside it, snap t back to the start.
      const end = next.start.getTime() + next.days * 86_400_000;
      if (next.t.getTime() < next.start.getTime() || next.t.getTime() >= end) next.t = next.start;
      const url = `${window.location.pathname}?${serializeNavState(next).toString()}`;
      if (opts.replace) window.history.replaceState(null, "", url);
      else window.history.pushState(null, "", url);
    },
    [state],
  );

  const shareUrl = useCallback(
    () => `${window.location.origin}${window.location.pathname}?${serializeNavState(state).toString()}`,
    [state],
  );

  return { state, update, shareUrl };
}
