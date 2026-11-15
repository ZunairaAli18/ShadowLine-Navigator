"use client";

import { useSyncExternalStore } from "react";

import type { NavMode } from "./navState";

/** The last Simple/Expert choice, remembered in localStorage (null during SSR or if storage is unavailable). */
const KEY = "shadowline.mode";
const EVENT = "shadowline-mode";

function read(): NavMode | null {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "expert" || v === "simple" ? v : null;
  } catch {
    return null;
  }
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}

export function useStoredMode(): NavMode | null {
  return useSyncExternalStore(subscribe, read, () => null);
}

export function storeMode(mode: NavMode) {
  try {
    window.localStorage.setItem(KEY, mode);
  } catch {
    /* private mode / blocked storage: the URL still carries the mode */
  }
  window.dispatchEvent(new Event(EVENT));
}
