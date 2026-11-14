"use client";

import { useCallback, useEffect, useState } from "react";

import { CornerTickLink } from "@/components/fx/CornerTickLink";
import { MagneticButton } from "@/components/fx/MagneticButton";
import { MaskReveal } from "@/components/fx/MaskReveal";
import { OutlineText } from "@/components/fx/OutlineText";
import { TickRuler } from "@/components/fx/TickRuler";
import { HeroSky } from "@/components/landing/HeroSky";
import { HudReadout } from "@/components/landing/HudReadout";
import { MoonGlobeLazy, type GlobeSite } from "@/components/moon/MoonGlobeLazy";
import { getSites, getSnapshot } from "@/lib/api";
import { sunDirFromAzEl, type Vec3 } from "@/lib/sun";
import { useCapable } from "@/lib/useCapable";

/**
 * Hero. Capable devices: a real-Sun-lit 3D Moon half-cropped on the right (HeroSky shows until it's ready).
 * Mobile / low-power / reduced motion: the 2D HeroSky scene only.
 */
export function Hero() {
  const capable = useCapable();
  const [globeReady, setGlobeReady] = useState(false);
  const [sunDir, setSunDir] = useState<Vec3>();
  const [sites, setSites] = useState<GlobeSite[]>([]);
  const onReady = useCallback(() => setGlobeReady(true), []);

  useEffect(() => {
    if (!capable) return;
    const ctrl = new AbortController();
    // Real Sun direction: Sun az/el at the sub-Earth point (lat 0, lon 0), see lib/sun.ts.
    getSnapshot({ lat: 0, lon: 0, time: new Date() }, { signal: ctrl.signal })
      .then((s) => setSunDir(sunDirFromAzEl(s.sun.az, s.sun.el)))
      .catch(() => {});
    getSites(undefined, { signal: ctrl.signal })
      .then((r) => setSites(r.sites.map((s) => ({ id: s.id, lat: s.lat, lon: s.lon }))))
      .catch(() => {});
    return () => ctrl.abort();
  }, [capable]);

  const show3d = capable && globeReady;

  return (
    // Below lg the 2D band sits under the text: pad by ~70% of its height (its top is empty sky).
    <section aria-labelledby="hero-title" className="relative overflow-hidden pb-[32vw] lg:min-h-[100svh] lg:pb-0">
      <OutlineText
        text="SHADOWLINE"
        className="absolute -left-[2vw] top-[22%] text-[21vw] opacity-70 lg:top-[14%]"
      />

      {capable && (
        <>
          <div
            className={`absolute -right-[22vw] top-[4%] h-[92%] w-[72vw] transition-opacity duration-[1400ms] ${
              show3d ? "opacity-100" : "opacity-0"
            }`}
          >
            <MoonGlobeLazy sunDir={sunDir} sites={sites} mode="hero" onReady={onReady} className="h-full w-full" />
          </div>
          <TickRuler className="absolute left-3 top-1/2 hidden -translate-y-1/2 lg:flex" />
          <p aria-hidden className="hud absolute bottom-10 right-6 hidden [writing-mode:vertical-rl] lg:block">
            Live Sun · drag to rotate
          </p>
        </>
      )}

      <div className="relative z-10 mx-auto max-w-6xl px-4 pt-20 sm:px-6 sm:pt-28 lg:px-12">
        <p className="eyebrow mb-6">NASA Space Apps 2026 · Lunar landing sites</p>
        <MaskReveal id="hero-title" lines={["Find where", "the light is."]} className="display max-w-4xl" />
        <p className="mt-7 max-w-md text-lg text-muted">
          Compare lunar landing sites by sunlight and Earth contact, using real terrain.
        </p>
        <div className="mt-9 flex flex-wrap items-center gap-4">
          <MagneticButton href="/app">Open the navigator</MagneticButton>
          <CornerTickLink href="/learn">Why it&apos;s hard</CornerTickLink>
        </div>
        <HudReadout className="mt-10" />
      </div>

      {/* 2D scene: placeholder while 3D loads, and the fallback everywhere 3D doesn't run. */}
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 h-[min(40svh,46.67vw)] transition-opacity duration-[1400ms] ${
          show3d ? "opacity-0" : "opacity-100"
        }`}
      >
        <HeroSky className="!h-full" fit="slice" />
      </div>
    </section>
  );
}
