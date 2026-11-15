"use client";

import { useSyncExternalStore } from "react";

/**
 * The current UTC hour as a Date, or null during server render / prerender.
 * (Reading the clock while prerendering would freeze the build time into the page, so live sections
 * wait for the client.) Stable within the hour, so it's safe as a React dependency.
 */
const noop = () => () => {};
let cached: { hour: number; date: Date } | null = null;

function snapshot(): Date {
  const hour = Math.floor(Date.now() / 3_600_000);
  if (!cached || cached.hour !== hour) cached = { hour, date: new Date(hour * 3_600_000) };
  return cached.date;
}

export function useNowHour(): Date | null {
  return useSyncExternalStore(noop, snapshot, () => null);
}
