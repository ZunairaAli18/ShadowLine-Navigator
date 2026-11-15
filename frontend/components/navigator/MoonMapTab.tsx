"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

import { LiveError } from "@/components/learn/LiveState";
import { MoonMap2D } from "@/components/moon/MoonMap2D";
import type { CameraPreset, MapSite } from "@/components/moon/MoonMap";
import { Card } from "@/components/ui";
import { ApiError, getGlobeGeometry, getSites, type GlobeGeometry } from "@/lib/api";
import type { SelectedState } from "@/lib/countdowns";
import { interpLatLon, latLonToBody } from "@/lib/globeMath";
import type { Location } from "@/lib/navState";
import { useGlobeTier, useReducedMotionPref } from "@/lib/useCapable";

/** three.js is only loaded when the Moon map tab opens on a capable device (no SSR). */
const MoonMap3D = dynamic(() => import("@/components/moon/MoonMap"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-muted">Loading the 3D Moon…</div>,
});

type Props = {
  location: Location;
  /** Window of the loaded /visibility data (geometry is fetched once per window, on the same time grid). */
  window: { start: Date; days: number; step: number } | null;
  pos: number;
  selected: SelectedState | null;
  onSelectSite: (id: string) => void;
  onPick: (lat: number, lon: number) => void;
};

const fmtLL = (lat: number, lon: number) =>
  `${Math.abs(lat).toFixed(2)}°${lat < 0 ? "S" : "N"}, ${Math.abs(lon).toFixed(2)}°${lon < 0 ? "W" : "E"}`;

export function MoonMapTab({ location, window: win, pos, selected, onSelectSite, onPick }: Props) {
  // 3D on desktops (full) and on touch devices with WebGL (lite); 2D for the rest, on failure, or by choice.
  const tier = useGlobeTier();
  const reduced = useReducedMotionPref();
  const [glFailed, setGlFailed] = useState(false);
  const [want2d, setWant2d] = useState(false);
  const can3d = tier !== "none" && !glFailed;
  const capable = can3d && !want2d;
  const lite = tier === "lite";
  const [sites, setSites] = useState<MapSite[]>([]);
  const [geo, setGeo] = useState<GlobeGeometry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [preset, setPreset] = useState<{ kind: CameraPreset; nonce: number }>({ kind: "site", nonce: 0 });
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    getSites(undefined, { signal: ctrl.signal })
      .then((r) => setSites(r.sites.map((s) => ({ id: s.id, name: s.name, region: s.region, lat: s.lat, lon: s.lon }))))
      .catch(() => {});
    return () => ctrl.abort();
  }, []);

  // One geometry request per window; scrubbing/playing only interpolates (no network).
  const winKey = win ? `${win.start.toISOString()}|${win.days}|${win.step}` : "";
  useEffect(() => {
    if (!winKey) return;
    const [start, days, step] = winKey.split("|");
    const ctrl = new AbortController();
    getGlobeGeometry({ start, days: Number(days), step_minutes: Number(step) }, { signal: ctrl.signal })
      .then((g) => {
        setGeo(g);
        setError(null);
      })
      .catch((e: unknown) => {
        if ((e as Error)?.name === "AbortError") return;
        setError(e instanceof ApiError ? e.message : "Unexpected error.");
      });
    return () => ctrl.abort();
  }, [winKey, attempt]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const sub = useMemo(() => {
    if (!geo) return null;
    const s = interpLatLon(geo.subsolar_lat, geo.subsolar_lon, pos);
    const e = interpLatLon(geo.subearth_lat, geo.subearth_lon, pos);
    return { s, e, sunBody: latLonToBody(s.lat, s.lon), earthBody: latLonToBody(e.lat, e.lon) };
  }, [geo, pos]);

  const currentSiteId = location.kind === "site" ? location.siteId : null;
  const currentSite = sites.find((s) => s.id === currentSiteId);
  const current = location.kind === "custom" ? { lat: location.lat, lon: location.lon } : currentSite ? { lat: currentSite.lat, lon: currentSite.lon } : { lat: 0, lon: 0 };

  const pick = (lat: number, lon: number) => {
    onPick(lat, lon);
    setToast(`Custom site set: ${fmtLL(lat, lon)}`);
  };
  const select = (id: string) => {
    onSelectSite(id);
    setPreset((p) => ({ kind: "site", nonce: p.nonce + 1 }));
  };

  const status = selected
    ? `${selected.sunUp ? "☀ Daylight" : "☾ Night"} · ${selected.earthVisible ? "◉ Earth in view" : "◌ Earth out of view"}`
    : "…";

  return (
    <section aria-labelledby="map-h" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-1">Moon map</p>
          <h2 id="map-h" className="text-2xl">
            Light and Earth across the Moon
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {can3d && (
            <div className="flex rounded-full border border-border p-0.5" role="radiogroup" aria-label="Map view">
              {([false, true] as const).map((flat) => (
                <button
                  key={String(flat)}
                  type="button"
                  role="radio"
                  aria-checked={want2d === flat}
                  onClick={() => setWant2d(flat)}
                  className={`min-h-7 rounded-full px-3 text-xs font-semibold transition-colors ${want2d === flat ? "bg-accent text-bg" : "text-muted hover:text-text"}`}
                >
                  {flat ? "2D map" : "3D globe"}
                </button>
              ))}
            </div>
          )}
          <p className="font-mono text-xs text-lunar-300" aria-live="polite">
            {currentSite?.name ?? (location.kind === "custom" ? `Custom ${fmtLL(location.lat, location.lon)}` : "")} · {status}
          </p>
        </div>
      </div>
      {glFailed && (
        <p className="text-sm text-muted" role="status">
          The 3D globe couldn&rsquo;t start on this device, so here is the 2D map.
        </p>
      )}

      {error ? (
        <LiveError message={error} onRetry={() => setAttempt((a) => a + 1)} />
      ) : !sub ? (
        <div className="h-[420px] animate-pulse rounded-2xl bg-bg/40 motion-reduce:animate-none" role="status">
          <span className="sr-only">Loading the Moon map…</span>
        </div>
      ) : capable ? (
        <Card className="relative overflow-hidden p-0">
          <div className="absolute left-3 top-3 z-10 flex flex-wrap gap-1.5">
            {(
              [
                ["near", "Near side"],
                ["far", "Far side"],
                ["pole", "South pole"],
                ["site", "Current site"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setPreset((p) => ({ kind: k, nonce: p.nonce + 1 }))}
                aria-pressed={preset.kind === k}
                className={`glass min-h-8 rounded-full px-3 text-xs font-semibold transition-colors ${preset.kind === k ? "text-accent" : "text-muted hover:text-text"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <MoonMap3D
            className={lite ? "aspect-square max-h-[560px] w-full sm:aspect-auto sm:h-[480px]" : "h-[460px] w-full lg:h-[560px]"}
            lite={lite}
            onFail={() => setGlFailed(true)}
            sunDirBody={sub.sunBody}
            earthDirBody={sub.earthBody}
            sites={sites}
            currentSiteId={currentSiteId}
            current={current}
            preset={preset}
            reduced={reduced}
            onSelectSite={select}
            onPick={pick}
          />
          <p className={`hud absolute bottom-3 right-3 z-10 ${lite ? "left-3 text-right" : "hidden sm:block"}`}>
            {lite ? "One finger to rotate · pinch to zoom · tap to choose" : "Drag to rotate · scroll to zoom · click to choose"}
          </p>
        </Card>
      ) : (
        <Card>
          <MoonMap2D sites={sites} currentSiteId={currentSiteId} current={current} subsolar={sub.s} subearth={sub.e} onSelectSite={select} onPick={pick} />
        </Card>
      )}

      <ul className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted">
        {capable && (
          <>
        <li className="flex items-center gap-2">
          <span aria-hidden className="inline-block h-3 w-5 rounded-sm bg-lunar-200" /> Bright = daylight (power)
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden className="inline-block h-3 w-5 rounded-sm bg-earth/40 ring-1 ring-earth" /> Blue = Earth in view (direct contact)
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden className="inline-block h-3 w-5 rounded-sm bg-gradient-to-r from-lunar-200 to-earth/60" /> Bright + blue = both
        </li>
          </>
        )}
        {!capable && (
          <li className="flex items-center gap-2">
            <span aria-hidden>☀ 🌍</span> Sun / Earth directly overhead
          </li>
        )}
      </ul>
      <p className="text-xs text-lunar-500">Ignores local terrain; see the Sky panel for the real skyline.</p>

      {toast && (
        <div role="status" className="glass fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full px-4 py-2 font-mono text-xs text-text shadow-lg">
          ◎ {toast}
        </div>
      )}
    </section>
  );
}
