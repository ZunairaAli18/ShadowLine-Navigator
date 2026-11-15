"use client";

import { useSyncExternalStore } from "react";

/**
 * Device capability for the cinematic layer (DESIGN.md):
 *  - reducedMotion: user prefers reduced motion -> simple fades only, no 3D/parallax/scroll scenes
 *  - capable: wide screen, fine pointer-ish desktop class device, WebGL available, not data-saver,
 *    and not reduced motion -> 3D Moon + scroll scenes. Otherwise the 2D fallbacks render.
 * Server render and the first client render both report "not capable", so the 2D fallback is the
 * placeholder until hydration decides.
 */

// 900px with a fine pointer = desktop class (full 3D, drag to rotate, scroll scenes, full 3D terrain).
// Narrower or touch screens get the lite tiers below.
export const DESKTOP_MIN_WIDTH = 900;
const QUERIES = ["(prefers-reduced-motion: reduce)", `(min-width: ${DESKTOP_MIN_WIDTH}px)`, "(pointer: fine)"];

let webglCache: boolean | null = null;
function hasWebGL(): boolean {
  if (webglCache !== null) return webglCache;
  try {
    const c = document.createElement("canvas");
    webglCache = !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    webglCache = false;
  }
  return webglCache;
}

function subscribe(cb: () => void) {
  const mqls = QUERIES.map((q) => window.matchMedia(q));
  mqls.forEach((m) => m.addEventListener("change", cb));
  return () => mqls.forEach((m) => m.removeEventListener("change", cb));
}

type Nav = Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };

function capableSnapshot(): boolean {
  if (window.matchMedia(QUERIES[0]).matches) return false;
  if (!window.matchMedia(QUERIES[1]).matches) return false;
  if (!window.matchMedia(QUERIES[2]).matches) return false; // touch tablets: 2D (dragging a globe fights scrolling)
  const nav = navigator as Nav;
  if (nav.connection?.saveData) return false;
  if ((nav.hardwareConcurrency ?? 4) < 4) return false;
  if (nav.deviceMemory !== undefined && nav.deviceMemory < 4) return false;
  return hasWebGL();
}

/** Weak devices and data savers get the 2D scenes even when WebGL works. */
function lowPower(): boolean {
  const nav = navigator as Nav;
  if (nav.connection?.saveData) return true;
  if ((nav.hardwareConcurrency ?? 4) < 4) return true;
  return nav.deviceMemory !== undefined && nav.deviceMemory < 4;
}

export type GlobeTier = "full" | "lite" | "none";

/**
 * full: desktop-class (see capableSnapshot). lite: phones/tablets/touch with WebGL, not reduced motion,
 * not low-power or save-data: a lighter 3D Moon (lower DPR, fewer segments, no drag in the hero).
 * none: the 2D fallbacks.
 */
function tierSnapshot(): GlobeTier {
  if (capableSnapshot()) return "full";
  if (window.matchMedia(QUERIES[0]).matches || lowPower()) return "none";
  return hasWebGL() ? "lite" : "none";
}

const serverNone = (): GlobeTier => "none";

/** Which 3D Moon this device should get ("none" during SSR and the first client render). */
export function useGlobeTier(): GlobeTier {
  return useSyncExternalStore(subscribe, tierSnapshot, serverNone);
}

/**
 * 3D terrain tier: full (desktop class), lite (touch / narrow screens with WebGL: downsampled patch, cheaper
 * shadows), or the reason it can't run (shown in the toggle's tooltip).
 */
export type TerrainTier = "full" | "lite" | "no-webgl" | "low-power" | "reduced-motion";

function terrainSnapshot(): TerrainTier {
  if (window.matchMedia(QUERIES[0]).matches) return "reduced-motion";
  if (lowPower()) return "low-power";
  if (!hasWebGL()) return "no-webgl";
  return capableSnapshot() ? "full" : "lite";
}

const serverNoWebgl = (): TerrainTier => "no-webgl";

/** Which 3D terrain this device can run ("no-webgl" during SSR and the first client render). */
export function useTerrainTier(): TerrainTier {
  return useSyncExternalStore(subscribe, terrainSnapshot, serverNoWebgl);
}

function reducedSnapshot(): boolean {
  return window.matchMedia(QUERIES[0]).matches;
}

const serverFalse = () => false;

/** True when the full 3D + scroll-scene experience should render. */
export function useCapable(): boolean {
  return useSyncExternalStore(subscribe, capableSnapshot, serverFalse);
}

/** True when the user prefers reduced motion (false during SSR). */
export function useReducedMotionPref(): boolean {
  return useSyncExternalStore(subscribe, reducedSnapshot, serverFalse);
}
