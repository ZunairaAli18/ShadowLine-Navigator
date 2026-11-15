"use client";

import { AnimatePresence, motion } from "motion/react";
import { memo, useId, useMemo, useRef, useState, type PointerEvent } from "react";

import {
  domePxPerDeg,
  domeRadius,
  domeXY,
  EARTH_RADIUS_DEG,
  panoPxPerDeg,
  panoX,
  panoXY,
  panoY,
  pointsToPath,
  splitRuns,
  SUN_RADIUS_DEG,
  type DomeGeom,
  type PanoGeom,
  type XY,
} from "@/lib/skyMath";
import { diskFraction } from "@/lib/countdowns";
import { interpAt, interpAz, timeAt } from "@/lib/interp";
import { useReducedMotionPref } from "@/lib/useCapable";

/**
 * Sky plot: where the Sun and Earth are in the local sky, against the real terrain skyline.
 *  - "dome": looking up (N top, E right, elevation inward; negative elevations outside the 0° ring)
 *  - "panorama": 360° horizon strip with an exaggerated vertical scale (for polar sites)
 * Reusable: pass horizon + series + selected index. Paths are memoised; only markers move when the
 * index changes (smooth while scrubbing). Markers glide; instant under reduced motion.
 */

export type SkyView = "dome" | "panorama";
export type SkySeries = {
  times: Date[];
  /** horizonEl (optional): per-step skyline height behind the body, from the backend. Used between steps so
   *  the plot agrees exactly with the countdown logic; falls back to the 360° profile. */
  sun: { az: number[]; el: number[]; fraction: number[]; horizonEl?: number[] };
  earth: { az: number[]; el: number[]; visible: boolean[]; horizonEl?: number[] };
};

type Props = SkySeries & {
  horizon: number[];
  terrain: "lola" | "flat";
  /** Changes when the site changes (skyline crossfades). */
  siteKey: string;
  /** Selected position: a fractional index (3.5 = halfway between steps 3 and 4). */
  index: number;
  /** Follow the position frame by frame with no spring (during playback). */
  instant?: boolean;
  className?: string;
};

type Range = { min: number; max: number; label: string };
const RANGES: Range[] = [
  { min: -5, max: 5, label: "−5…+5°" },
  { min: -8, max: 12, label: "−8…+12°" },
  { min: -15, max: 30, label: "−15…+30°" },
  { min: -10, max: 90, label: "−10…+90°" },
];

const DOME_VB = 440;
const DOME: DomeGeom = { cx: 220, cy: 220, r0: 170, minEl: -15 };
const PANO_VB = { w: 1000, h: 330 };
const panoGeom = (r: Range): PanoGeom => ({ x0: 44, width: 936, y0: 14, height: 276, elMin: r.min, elMax: r.max });

const fmtAz = (v: number) => `${v.toFixed(1)}°`;
const fmtEl = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}°`;
const fmtTime = (d: Date) => `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;

// ---------------------------------------------------------------- geometry builders (pure)

type Built = {
  terrainPath: string;
  skyClip: string;
  skyline: string;
  zeroLine: string;
  sunPts: XY[];
  earthPts: XY[];
  sunRuns: { visible: boolean; d: string }[];
  earthRuns: { visible: boolean; d: string }[];
  pxPerDeg: number;
};

function build(view: SkyView, range: Range, horizon: number[], s: SkySeries): Built {
  const az360 = Array.from({ length: 361 }, (_, i) => i);
  const h = (a: number) => horizon[a % 360] ?? 0;
  const sunVis = s.sun.fraction.map((f) => f >= 0.5);

  if (view === "dome") {
    const g = DOME;
    const sky = az360.map((a) => domeXY(a, h(a), g));
    const outerR = domeRadius(g.minEl, g);
    const circle = (r: number) =>
      `M${g.cx - r},${g.cy}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0Z`;
    const toPts = (az: number[], el: number[]) => az.map((a, i) => domeXY(a, el[i], g));
    const sunPts = toPts(s.sun.az, s.sun.el);
    const earthPts = toPts(s.earth.az, s.earth.el);
    const runs = (pts: XY[], az: number[], vis: boolean[]) =>
      splitRuns(az, vis, false).map((r) => ({ visible: r.visible, d: pointsToPath(r.idx.map((i) => pts[i])) }));
    return {
      terrainPath: `${circle(outerR)}${pointsToPath(sky)}Z`,
      skyClip: `${pointsToPath(sky)}Z`,
      skyline: `${pointsToPath(sky)}Z`,
      zeroLine: circle(g.r0),
      sunPts,
      earthPts,
      sunRuns: runs(sunPts, s.sun.az, sunVis),
      earthRuns: runs(earthPts, s.earth.az, s.earth.visible),
      pxPerDeg: domePxPerDeg(g),
    };
  }

  const g = panoGeom(range);
  const clampEl = (e: number) => Math.max(g.elMin - 2, Math.min(g.elMax + 2, e));
  // Skyline x is linear 0..360 (no wrap), so the 360° sample lands on the right edge, not back at the left.
  const sky = az360.map((a) => ({ x: g.x0 + (a / 360) * g.width, y: panoY(clampEl(h(a)), g) }));
  const bottom = g.y0 + g.height;
  const right = g.x0 + g.width;
  const toPts = (az: number[], el: number[]) => az.map((a, i) => panoXY(a, el[i], g));
  const sunPts = toPts(s.sun.az, s.sun.el);
  const earthPts = toPts(s.earth.az, s.earth.el);
  const runs = (pts: XY[], az: number[], vis: boolean[]) =>
    splitRuns(az, vis, true).map((r) => ({ visible: r.visible, d: pointsToPath(r.idx.map((i) => pts[i])) }));
  return {
    terrainPath: `${pointsToPath(sky)}L${right},${bottom + 4}L${g.x0},${bottom + 4}Z`,
    skyClip: `M${g.x0},${g.y0 - 40}L${right},${g.y0 - 40}${pointsToPath(sky.slice().reverse()).replace(/^M/, "L")}Z`,
    skyline: pointsToPath(sky),
    zeroLine: `M${g.x0},${panoY(0, g)}L${right},${panoY(0, g)}`,
    sunPts,
    earthPts,
    sunRuns: runs(sunPts, s.sun.az, sunVis),
    earthRuns: runs(earthPts, s.earth.az, s.earth.visible),
    pxPerDeg: panoPxPerDeg(g),
  };
}

function autoRange(horizon: number[], s: SkySeries): Range {
  const hi = Math.max(...s.sun.el, ...horizon, ...s.earth.el.filter((e) => e > -20)) + 0.5;
  const lo = Math.min(...horizon, ...s.sun.el) - 0.5;
  return RANGES.find((r) => r.max >= hi && r.min <= lo) ?? RANGES[RANGES.length - 1];
}

// ---------------------------------------------------------------- static layer (memoised)

type StaticProps = { view: SkyView; range: Range; built: Built; siteKey: string; clipId: string; reduced: boolean };

const StaticLayer = memo(function StaticLayer({ view, range, built, siteKey, clipId, reduced }: StaticProps) {
  return (
    <>
      <defs>
        <clipPath id={clipId}>
          <path d={built.skyClip} />
        </clipPath>
      </defs>

      {/* grid */}
      {view === "dome" ? <DomeGrid /> : <PanoGrid range={range} />}

      {/* terrain silhouette, crossfades on site change */}
      <AnimatePresence initial={false}>
        <motion.g
          key={`${siteKey}-${view}-${range.label}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.6 }}
        >
          <path d={built.terrainPath} fill="url(#sky-terrain)" fillRule="evenodd" />
          <path d={built.skyline} fill="none" stroke="var(--color-accent)" strokeOpacity={0.7} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
        </motion.g>
      </AnimatePresence>

      {/* flat 0° reference */}
      <path d={built.zeroLine} fill="none" stroke="var(--color-lunar-400)" strokeOpacity={0.6} strokeDasharray="5 5" strokeWidth={1} vectorEffect="non-scaling-stroke" />

      {/* paths over the whole window: solid = visible, dotted = hidden */}
      {built.earthRuns.map((r, i) => (
        <path key={`e${i}`} d={r.d} fill="none" stroke="var(--color-earth)" strokeOpacity={r.visible ? 0.8 : 0.45} strokeWidth={r.visible ? 1.6 : 1.2} strokeDasharray={r.visible ? undefined : "2 4"} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      ))}
      {built.sunRuns.map((r, i) => (
        <path key={`s${i}`} d={r.d} fill="none" stroke="var(--color-sun)" strokeOpacity={r.visible ? 0.85 : 0.45} strokeWidth={r.visible ? 1.6 : 1.2} strokeDasharray={r.visible ? undefined : "2 4"} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      ))}
    </>
  );
});

function DomeGrid() {
  const g = DOME;
  const ticks = Array.from({ length: 12 }, (_, i) => i * 30);
  const card: Record<number, string> = { 0: "N", 90: "E", 180: "S", 270: "W" };
  const outerR = domeRadius(g.minEl, g);
  return (
    <g>
      <circle cx={g.cx} cy={g.cy} r={outerR} fill="none" stroke="var(--color-border)" />
      {[30, 60].map((el) => (
        <g key={el}>
          <circle cx={g.cx} cy={g.cy} r={domeRadius(el, g)} fill="none" stroke="var(--color-lunar-700)" strokeOpacity={0.6} strokeDasharray="2 4" />
          <text x={g.cx + 4} y={g.cy - domeRadius(el, g) - 3} fontSize={9} fill="var(--color-lunar-500)" className="font-mono">
            {el}°
          </text>
        </g>
      ))}
      <text x={g.cx + 4} y={g.cy - g.r0 - 3} fontSize={9} fill="var(--color-lunar-500)" className="font-mono">
        0°
      </text>
      <circle cx={g.cx} cy={g.cy} r={1.5} fill="var(--color-lunar-500)" />
      {ticks.map((a) => {
        const p1 = domeXY(a, g.minEl, g);
        const p2 = domeXY(a, g.minEl - 3, { ...g, minEl: g.minEl - 3 });
        const lp = domeXY(a, g.minEl - 9, { ...g, minEl: g.minEl - 9 });
        return (
          <g key={a}>
            <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="var(--color-lunar-500)" />
            <text
              x={lp.x}
              y={lp.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={card[a] ? 13 : 9}
              fontWeight={card[a] ? 700 : 400}
              fill={card[a] ? "var(--color-text)" : "var(--color-lunar-500)"}
              className={card[a] ? "font-heading" : "font-mono"}
            >
              {card[a] ?? a}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function PanoGrid({ range }: { range: Range }) {
  const g = panoGeom(range);
  const span = range.max - range.min;
  const stepEl = span <= 12 ? 2 : span <= 25 ? 4 : span <= 50 ? 10 : 20;
  const els: number[] = [];
  for (let e = Math.ceil(range.min / stepEl) * stepEl; e <= range.max; e += stepEl) els.push(e);
  const card: Record<number, string> = { 0: "N", 90: "E", 180: "S", 270: "W", 360: "N" };
  return (
    <g>
      <rect x={g.x0} y={g.y0} width={g.width} height={g.height} fill="none" stroke="var(--color-border)" />
      {els.map((e) => (
        <g key={e}>
          <line x1={g.x0} x2={g.x0 + g.width} y1={panoY(e, g)} y2={panoY(e, g)} stroke="var(--color-lunar-800)" strokeOpacity={e === 0 ? 0 : 0.7} />
          <text x={g.x0 - 6} y={panoY(e, g)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="var(--color-lunar-500)" className="font-mono">
            {e > 0 ? `+${e}` : e}°
          </text>
        </g>
      ))}
      {Array.from({ length: 13 }, (_, i) => i * 30).map((a) => (
        <g key={a}>
          <line x1={panoX(a, g) || g.x0 + (a === 360 ? g.width : 0)} x2={panoX(a, g) || g.x0 + (a === 360 ? g.width : 0)} y1={g.y0 + g.height} y2={g.y0 + g.height + 5} stroke="var(--color-lunar-500)" />
          <text
            x={a === 360 ? g.x0 + g.width : panoX(a, g)}
            y={g.y0 + g.height + 18}
            textAnchor="middle"
            fontSize={card[a] ? 13 : 10}
            fontWeight={card[a] ? 700 : 400}
            fill={card[a] ? "var(--color-text)" : "var(--color-lunar-500)"}
            className={card[a] ? "font-heading" : "font-mono"}
          >
            {card[a] ?? `${a}°`}
          </text>
        </g>
      ))}
    </g>
  );
}

// ---------------------------------------------------------------- markers

function useGlide(target: XY, wrapWidth: number | null, reduced: boolean) {
  // Snap (no animation) when crossing the 0/360 seam in the panorama, otherwise spring.
  // "Previous value in state" pattern (React docs): compare with the last target seen.
  const [prev, setPrev] = useState(target);
  const [jump, setJump] = useState(false);
  if (prev.x !== target.x || prev.y !== target.y) {
    setPrev(target);
    setJump(wrapWidth !== null && Math.abs(target.x - prev.x) > wrapWidth / 2);
  }
  return reduced || jump ? { duration: 0 } : { type: "spring" as const, stiffness: 320, damping: 34, mass: 0.6 };
}

type MarkerProps = { p: XY; r: number; visible: boolean; clipId: string; wrap: number | null; reduced: boolean; labelUp: boolean };

/**
 * The disk is clipped by the skyline, so it's drawn with animated cx/cy inside a static clipped group
 * (the clip stays in plot coordinates while the marker glides). Glow + label move as a translated group.
 */
function SunMarker({ p, r, visible, clipId, wrap, reduced, labelUp }: MarkerProps) {
  const transition = useGlide(p, wrap, reduced);
  const rr = Math.max(r, 2.5);
  return (
    <>
      <motion.g initial={false} animate={{ x: p.x, y: p.y }} transition={transition}>
        <circle r={rr * 5 + 10} fill="url(#sun-glow)" opacity={visible ? 1 : 0.35} />
        {!visible && <circle r={rr} fill="none" stroke="var(--color-sun)" strokeDasharray="1.5 2" strokeOpacity={0.8} />}
        <text y={labelUp ? -rr - 10 : rr + 18} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--color-sun)" className="font-mono">
          ☀ SUN
        </text>
      </motion.g>
      <g clipPath={`url(#${clipId})`}>
        <motion.circle initial={false} animate={{ cx: p.x, cy: p.y }} transition={transition} r={rr} fill="#fff1d0" stroke="var(--color-sun)" strokeWidth={0.8} />
      </g>
    </>
  );
}

function EarthMarker({ p, r, visible, clipId, wrap, reduced, labelUp }: MarkerProps) {
  const transition = useGlide(p, wrap, reduced);
  const rr = Math.max(r, 3.5);
  return (
    <>
      <motion.g initial={false} animate={{ x: p.x, y: p.y }} transition={transition}>
        {!visible && (
          <circle r={rr} fill="var(--color-earth)" fillOpacity={0.12} stroke="var(--color-earth)" strokeOpacity={0.6} strokeDasharray="2 3" />
        )}
        <text y={labelUp ? -rr - 10 : rr + 18} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--color-earth)" fillOpacity={visible ? 1 : 0.75} className="font-mono">
          {visible ? "◉ EARTH" : "◌ EARTH · out of view"}
        </text>
      </motion.g>
      {visible && (
        <g clipPath={`url(#${clipId})`}>
          <motion.circle initial={false} animate={{ cx: p.x, cy: p.y }} transition={transition} r={rr + 4} fill="var(--color-earth)" opacity={0.15} />
          <motion.circle initial={false} animate={{ cx: p.x, cy: p.y }} transition={transition} r={rr} fill="url(#earth-fill)" />
        </g>
      )}
    </>
  );
}

// ---------------------------------------------------------------- main

export function SkyPlot({ horizon, terrain, siteKey, times, sun, earth, index, instant = false, className = "" }: Props) {
  const clipId = useId().replace(/:/g, "") + "-sky";
  const reduced = useReducedMotionPref();
  const series = useMemo(() => ({ times, sun, earth }), [times, sun, earth]);
  const n = times.length;
  const timesMs = useMemo(() => times.map((t) => t.getTime()), [times]);
  const i = Math.round(Math.min(Math.max(0, index), Math.max(0, n - 1)));

  const maxSunEl = useMemo(() => (n ? Math.max(...sun.el) : 90), [sun.el, n]);
  const autoView: SkyView = maxSunEl < 10 ? "panorama" : "dome";
  const [userView, setUserView] = useState<{ key: string; view: SkyView } | null>(null);
  const view = userView && userView.key === siteKey ? userView.view : autoView;

  const autoR = useMemo(() => (n ? autoRange(horizon, series) : RANGES[1]), [horizon, series, n]);
  const [userRange, setUserRange] = useState<{ key: string; label: string } | null>(null);
  const range = (userRange && userRange.key === siteKey && RANGES.find((r) => r.label === userRange.label)) || autoR;

  const built = useMemo(() => (n ? build(view, range, horizon, series) : null), [view, range, horizon, series, n]);
  const [hover, setHover] = useState<{ body: "sun" | "earth"; i: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const vbW = view === "dome" ? DOME_VB : PANO_VB.w;
  const vbH = view === "dome" ? DOME_VB : PANO_VB.h;

  const onPointer = (e: PointerEvent<SVGSVGElement>) => {
    if (!built || !svgRef.current) return;
    const ctm = svgRef.current.getScreenCTM();
    if (!ctm) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    const limit = (12 * vbW) / Math.max(1, svgRef.current.clientWidth); // ~12 px on screen
    let best: { body: "sun" | "earth"; i: number; d: number } | null = null;
    for (const [body, pts] of [["sun", built.sunPts], ["earth", built.earthPts]] as const) {
      for (let k = 0; k < pts.length; k++) {
        const d = Math.hypot(pts[k].x - pt.x, pts[k].y - pt.y);
        if (d < limit && (!best || d < best.d)) best = { body, i: k, d };
      }
    }
    setHover(best ? { body: best.body, i: best.i } : null);
  };

  if (!built || n === 0) {
    return <div className={`grid aspect-square place-items-center text-muted ${className}`}>No data yet.</div>;
  }

  // Fractional index -> interpolated positions (smooth playback/scrubbing; az goes the short way round).
  const p = Math.min(Math.max(0, index), Math.max(0, n - 1));
  const atSample = Math.abs(p - Math.round(p)) < 1e-6;
  const sAz = interpAz(sun.az, p);
  const sEl = interpAt(sun.el, p);
  const sFrac = interpAt(sun.fraction, p);
  const eAz = interpAz(earth.az, p);
  const eEl = interpAt(earth.el, p);
  const toXY = (az: number, el: number) => (view === "dome" ? domeXY(az, el, DOME) : panoXY(az, el, panoGeom(range)));
  const sunP = toXY(sAz, sEl);
  const earthP = toXY(eAz, eEl);
  // Between steps, follow the interpolated margin (same rule as countdowns), not the interpolated fraction.
  const sHz = sun.horizonEl?.length === n ? interpAt(sun.horizonEl, p) : horizonAtSafe(horizon, sAz);
  const eHz = earth.horizonEl?.length === n ? interpAt(earth.horizonEl, p) : horizonAtSafe(horizon, eAz);
  const sMargin = sEl - sHz;
  const sunVisible = atSample ? sun.fraction[i] >= 0.5 : sMargin >= 0;
  const sunFracShown = atSample ? sFrac : diskFraction(sMargin);
  const earthVisible = atSample ? earth.visible[i] : eEl - eHz > 0;
  const selectedMs = timeAt(timesMs, p);
  const wrap = view === "panorama" ? panoGeom(range).width : null;
  const sunR = SUN_RADIUS_DEG * built.pxPerDeg;
  const earthR = EARTH_RADIUS_DEG * built.pxPerDeg;
  const labelUp = (p: XY) => (view === "dome" ? p.y > DOME.cy : p.y > panoY((range.min + range.max) / 2, panoGeom(range)));

  const hoverPt = hover ? (hover.body === "sun" ? built.sunPts[hover.i] : built.earthPts[hover.i]) : null;
  const hoverInfo = hover
    ? hover.body === "sun"
      ? { name: "Sun", az: sun.az[hover.i], el: sun.el[hover.i], vis: sun.fraction[hover.i] >= 0.5 }
      : { name: "Earth", az: earth.az[hover.i], el: earth.el[hover.i], vis: earth.visible[hover.i] }
    : null;

  return (
    <div className={`relative ${className}`}>
      {/* view controls */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div role="radiogroup" aria-label="Sky view" className="inline-flex rounded-lg border border-border bg-bg/40 p-0.5">
          {(["dome", "panorama"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={view === v}
              onClick={() => setUserView({ key: siteKey, view: v })}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${view === v ? "bg-accent text-bg" : "text-muted hover:text-text"}`}
            >
              {v === "dome" ? "◯ Dome" : "▭ Panorama"}
            </button>
          ))}
        </div>
        {view === "panorama" && (
          <label className="flex items-center gap-2 text-xs text-muted">
            <span className="hud">Vertical range</span>
            <select
              value={range.label}
              onChange={(e) => setUserRange({ key: siteKey, label: e.target.value })}
              className="rounded-md border border-border bg-surface-solid px-2 py-1 font-mono text-xs text-text"
            >
              {RANGES.map((r) => (
                <option key={r.label} value={r.label}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <span className="hud">{terrain === "lola" ? "Skyline: NASA LOLA" : "Flat 0° horizon"}</span>
      </div>

      {/* Panorama keeps a readable minimum width and scrolls sideways inside its panel on phones. */}
      <div className={view === "panorama" ? "-mx-1 overflow-x-auto px-1 pb-1" : ""}>
      <div className={`relative ${view === "panorama" ? "min-w-[680px]" : ""}`}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${vbW} ${vbH}`}
          className={`block w-full select-none ${view === "dome" ? "mx-auto max-w-[560px]" : ""}`}
          role="img"
          aria-label={`${view === "dome" ? "Dome" : "Panorama"} sky plot at ${fmtTime(new Date(selectedMs))}. Sun azimuth ${fmtAz(sAz)}, elevation ${fmtEl(sEl)}, ${sunVisible ? "visible" : "hidden"}. Earth azimuth ${fmtAz(eAz)}, elevation ${fmtEl(eEl)}, ${earthVisible ? "visible" : "out of view"}.`}
          onPointerMove={onPointer}
          onPointerDown={onPointer}
          onPointerLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id="sky-terrain" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-lunar-800)" />
              <stop offset="100%" stopColor="var(--color-lunar-900)" />
            </linearGradient>
            <radialGradient id="sun-glow">
              <stop offset="0%" stopColor="var(--color-sun)" stopOpacity={0.55} />
              <stop offset="40%" stopColor="var(--color-sun)" stopOpacity={0.15} />
              <stop offset="100%" stopColor="var(--color-sun)" stopOpacity={0} />
            </radialGradient>
            <radialGradient id="earth-fill" cx="35%" cy="35%">
              <stop offset="0%" stopColor="#c8edff" />
              <stop offset="60%" stopColor="var(--color-earth)" />
              <stop offset="100%" stopColor="#1d5f8a" />
            </radialGradient>
          </defs>

          <StaticLayer view={view} range={range} built={built} siteKey={siteKey} clipId={clipId} reduced={reduced} />

          <EarthMarker p={earthP} r={earthR} visible={earthVisible} clipId={clipId} wrap={wrap} reduced={reduced || instant} labelUp={labelUp(earthP)} />
          <SunMarker p={sunP} r={sunR} visible={sunVisible} clipId={clipId} wrap={wrap} reduced={reduced || instant} labelUp={labelUp(sunP)} />

          {hoverPt && <circle cx={hoverPt.x} cy={hoverPt.y} r={5} fill="none" stroke="var(--color-text)" strokeWidth={1.2} />}
        </svg>

        {/* tooltip */}
        {hover && hoverPt && hoverInfo && (
          <div
            role="tooltip"
            className="glass pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+12px)] whitespace-nowrap rounded-lg px-3 py-2 font-mono text-[11px] leading-relaxed"
            style={{ left: `${(hoverPt.x / vbW) * 100}%`, top: `${(hoverPt.y / vbH) * 100}%` }}
          >
            <div className={hoverInfo.name === "Sun" ? "text-sun" : "text-earth"}>
              {hoverInfo.name === "Sun" ? "☀" : "◉"} {hoverInfo.name} · {hoverInfo.vis ? "visible" : "hidden"}
            </div>
            <div className="text-lunar-300">{fmtTime(times[hover.i])}</div>
            <div className="text-lunar-300">
              az {fmtAz(hoverInfo.az)} · el {fmtEl(hoverInfo.el)}
            </div>
          </div>
        )}
      </div>
      </div>

      {/* HUD readout */}
      <div className="glass mt-3 grid gap-x-6 gap-y-1 rounded-xl px-4 py-3 font-mono text-[11px] uppercase tracking-[0.12em] sm:grid-cols-2" aria-live="off">
        <div>
          <span className="text-sun">☀ Sun</span>{" "}
          <span className="text-lunar-300">
            az {fmtAz(sAz)} el {fmtEl(sEl)}
          </span>
          <div className="text-lunar-500">
            horizon {fmtEl(sHz)} · {Math.round(Math.min(1, Math.max(0, sunFracShown)) * 100)}% of disk visible
          </div>
        </div>
        <div>
          <span className="text-earth">◉ Earth</span>{" "}
          <span className="text-lunar-300">
            az {fmtAz(eAz)} el {fmtEl(eEl)}
          </span>
          <div className="text-lunar-500">
            horizon {fmtEl(eHz)} · {earthVisible ? "in view" : "out of view"}
          </div>
        </div>
      </div>

      {/* legend */}
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
        <li className="flex items-center gap-2"><span aria-hidden className="inline-block h-0.5 w-6 bg-sun" /> Sun path (visible)</li>
        <li className="flex items-center gap-2"><span aria-hidden className="inline-block w-6 border-t-2 border-dotted border-sun/70" /> Sun hidden</li>
        <li className="flex items-center gap-2"><span aria-hidden className="inline-block h-0.5 w-6 bg-earth" /> Earth path (in view)</li>
        <li className="flex items-center gap-2"><span aria-hidden className="inline-block w-6 border-t-2 border-dotted border-earth/70" /> Earth hidden</li>
        <li className="flex items-center gap-2"><span aria-hidden className="inline-block w-6 border-t border-dashed border-lunar-400" /> Flat 0° line</li>
      </ul>
    </div>
  );
}

function horizonAtSafe(h: number[], az: number): number {
  if (h.length !== 360) return 0;
  const a = ((az % 360) + 360) % 360;
  const i0 = Math.floor(a) % 360;
  const f = a - Math.floor(a);
  return h[i0] * (1 - f) + h[(i0 + 1) % 360] * f;
}
