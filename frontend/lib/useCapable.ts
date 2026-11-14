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

// 1024px: below that the half-cropped globe would sit under the headline, so tablets get the 2D scene.
const QUERIES = ["(prefers-reduced-motion: reduce)", "(min-width: 1024px)", "(pointer: fine)"];

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
