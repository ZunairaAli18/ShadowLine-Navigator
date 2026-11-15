"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { useEffect, type ReactNode } from "react";

import { useReducedMotionPref } from "@/lib/useCapable";

gsap.registerPlugin(ScrollTrigger);

/** window event: detail true = lock page scrolling (stop Lenis), false = unlock. */
export const SCROLL_LOCK_EVENT = "shadowline:scroll-lock";

/** Lenis smooth scrolling, driven by GSAP's ticker so ScrollTrigger stays in sync. Off under reduced motion. */
export function SmoothScroll({ children }: { children: ReactNode }) {
  const reduced = useReducedMotionPref();

  useEffect(() => {
    if (reduced) return;
    const lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
    lenis.on("scroll", ScrollTrigger.update);
    // Full-screen panels (e.g. the expanded 3D terrain) lock page scrolling via this event.
    const onLock = (e: Event) => ((e as CustomEvent<boolean>).detail ? lenis.stop() : lenis.start());
    window.addEventListener(SCROLL_LOCK_EVENT, onLock);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    return () => {
      gsap.ticker.remove(tick);
      window.removeEventListener(SCROLL_LOCK_EVENT, onLock);
      lenis.destroy();
    };
  }, [reduced]);

  return <>{children}</>;
}
