"use client";

/* eslint-disable @next/next/no-img-element -- a plain <img> keeps the map's pixel grid exact for click -> lat/lon */

import { useEffect, useRef, type MouseEvent } from "react";

import type { MapSite } from "@/components/moon/MoonMap";
import { equirectToLatLon, latLonToEquirect, latLonToPolar, polarToLatLon, type LatLon } from "@/lib/globeMath";

/**
 * 2D Moon map for phones, tablets, low-power devices and reduced motion: an equirectangular map (same NASA
 * texture) with clickable site dots, the sub-solar (☀) and sub-Earth (🌍) points, and a south polar inset.
 */

type Props = {
  sites: MapSite[];
  currentSiteId: string | null;
  current: LatLon;
  subsolar: LatLon;
  subearth: LatLon;
  onSelectSite: (id: string) => void;
  onPick: (lat: number, lon: number) => void;
};

const TEXTURE = "/textures/moon-color-2k.jpg";
const INSET_SPAN = 10; // 80°S-90°S
const INSET_PX = 260;

const pct = (v: number) => `${(v * 100).toFixed(3)}%`;

function Dot({ label, x, y, current, onClick }: { label: string; x: string; y: string; current: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={`${label}${current ? " (selected)" : ""}`}
      aria-pressed={current}
      title={label}
      className="absolute grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full"
      style={{ left: x, top: y }}
    >
      <span className={`block rounded-full ${current ? "h-3 w-3 bg-sun ring-2 ring-sun/50" : "h-2 w-2 bg-accent ring-1 ring-bg"}`} />
    </button>
  );
}

function Mark({ x, y, icon, label }: { x: string; y: string; icon: string; label: string }) {
  return (
    <span className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 text-sm drop-shadow" style={{ left: x, top: y }} aria-hidden title={label}>
      {icon}
    </span>
  );
}

/** Reproject the polar cap of the equirectangular texture onto a canvas (pole at the centre, 0° up, east right). */
function usePolarCanvas(ref: React.RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    const img = new Image();
    img.src = TEXTURE;
    let cancelled = false;
    img.onload = () => {
      const canvas = ref.current;
      if (!canvas || cancelled) return;
      const src = document.createElement("canvas");
      src.width = img.width;
      src.height = img.height;
      const sctx = src.getContext("2d", { willReadFrequently: true });
      const ctx = canvas.getContext("2d");
      if (!sctx || !ctx) return;
      sctx.drawImage(img, 0, 0);
      // Only the bottom rows (80°S-90°S) are needed.
      const y0 = Math.floor(((90 + 80) / 180) * img.height);
      const band = sctx.getImageData(0, y0, img.width, img.height - y0);
      const out = ctx.createImageData(INSET_PX, INSET_PX);
      for (let py = 0; py < INSET_PX; py++) {
        for (let px = 0; px < INSET_PX; px++) {
          const x = (px / (INSET_PX - 1)) * 2 - 1;
          const y = (py / (INSET_PX - 1)) * 2 - 1;
          if (x * x + y * y > 1) continue;
          const ll = polarToLatLon(x, y, INSET_SPAN);
          const { u, v } = latLonToEquirect(ll.lat, ll.lon);
          const sx = Math.min(img.width - 1, Math.floor(u * img.width));
          const sy = Math.min(band.height - 1, Math.max(0, Math.floor(v * img.height) - y0));
          const si = (sy * img.width + sx) * 4;
          const di = (py * INSET_PX + px) * 4;
          out.data[di] = band.data[si];
          out.data[di + 1] = band.data[si + 1];
          out.data[di + 2] = band.data[si + 2];
          out.data[di + 3] = 255;
        }
      }
      ctx.putImageData(out, 0, 0);
    };
    return () => {
      cancelled = true;
    };
  }, [ref]);
}

export function MoonMap2D({ sites, currentSiteId, current, subsolar, subearth, onSelectSite, onPick }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  usePolarCanvas(canvas);

  const clickMap = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const ll = equirectToLatLon((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
    onPick(ll.lat, ll.lon);
  };
  const clickInset = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 2 - 1;
    const y = ((e.clientY - r.top) / r.height) * 2 - 1;
    if (x * x + y * y > 1) return;
    const ll = polarToLatLon(x, y, INSET_SPAN);
    onPick(ll.lat, ll.lon);
  };

  const eq = (ll: LatLon) => latLonToEquirect(ll.lat, ll.lon);
  const po = (ll: LatLon) => {
    const p = latLonToPolar(ll.lat, ll.lon, INSET_SPAN);
    return { x: (p.x + 1) / 2, y: (p.y + 1) / 2, inside: p.x * p.x + p.y * p.y <= 1 };
  };
  const polarSites = sites.filter((s) => s.lat <= -80);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
      <figure className="min-w-0">
        <div
          className="relative aspect-[2/1] w-full cursor-crosshair overflow-hidden rounded-xl border border-border"
          onClick={clickMap}
          role="group"
          aria-label="Map of the whole Moon. Tap a dot to select a site, or anywhere else to set custom coordinates."
        >
          <img src={TEXTURE} alt="NASA LRO colour map of the Moon, near side in the centre" className="absolute inset-0 h-full w-full select-none object-fill" draggable={false} />
          {/* graticule: equator and the 0° meridian (faces Earth) */}
          <span aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-lunar-300/25" />
          <span aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-lunar-300/25" />
          <Mark x={pct(eq(subsolar).u)} y={pct(eq(subsolar).v)} icon="☀" label="Sun overhead here" />
          <Mark x={pct(eq(subearth).u)} y={pct(eq(subearth).v)} icon="🌍" label="Earth overhead here" />
          {sites.map((s) => (
            <Dot key={s.id} label={s.name} x={pct(eq(s).u)} y={pct(eq(s).v)} current={s.id === currentSiteId} onClick={() => onSelectSite(s.id)} />
          ))}
          {currentSiteId === null && <Mark x={pct(eq(current).u)} y={pct(eq(current).v)} icon="◎" label="Custom site" />}
        </div>
        <figcaption className="mt-2 flex flex-wrap justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.15em] text-lunar-500">
          <span>180°W</span>
          <span>0° · faces Earth</span>
          <span>180°E</span>
        </figcaption>
      </figure>

      <figure className="mx-auto w-full max-w-[280px]">
        <div
          className="relative aspect-square w-full cursor-crosshair overflow-hidden rounded-full border border-border bg-bg"
          onClick={clickInset}
          role="group"
          aria-label="South polar view, 80°S to 90°S, seen from below. Tap a dot to select a site or anywhere to set custom coordinates."
        >
          <canvas ref={canvas} width={INSET_PX} height={INSET_PX} className="absolute inset-0 h-full w-full" aria-hidden />
          <span aria-hidden className="pointer-events-none absolute inset-[25%] rounded-full border border-lunar-300/20" />
          {[subsolar, subearth].map((ll, k) => {
            const p = po(ll);
            return p.inside ? <Mark key={k} x={pct(p.x)} y={pct(p.y)} icon={k ? "🌍" : "☀"} label={k ? "Earth overhead" : "Sun overhead"} /> : null;
          })}
          {polarSites.map((s) => {
            const p = po(s);
            return <Dot key={s.id} label={s.name} x={pct(p.x)} y={pct(p.y)} current={s.id === currentSiteId} onClick={() => onSelectSite(s.id)} />;
          })}
          {currentSiteId === null && po(current).inside && <Mark x={pct(po(current).x)} y={pct(po(current).y)} icon="◎" label="Custom site" />}
        </div>
        <figcaption className="mt-2 text-center font-mono text-[10px] uppercase tracking-[0.15em] text-lunar-500">
          South pole · 80–90°S · 0° up · ring = 85°S
        </figcaption>
      </figure>
    </div>
  );
}
