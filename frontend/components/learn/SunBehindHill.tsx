"use client";

import { useId, useState } from "react";

import { diskFraction } from "@/lib/countdowns";

/**
 * Side view: a lander with a solar panel, a ridge whose top is 3° above the lander's horizon, and the Sun.
 * The slider sets the Sun's elevation (−2° to +6°). Angles are drawn 5× steeper so tiny polar angles show.
 * The Sun is clipped by the sight line from the panel through the ridge top, so a Sun straddling the ridge
 * really looks partly hidden; power = visible fraction of the disk (same formula as the navigator).
 */

const K = 5; // vertical exaggeration of angles
const RIDGE_DEG = 3;
const SUN_R_DEG = 0.2666;
const VB = { w: 800, h: 330 };
const P = { x: 150, y: 246 }; // solar panel (observer)
const R = 470; // radius of the Sun's drawn arc around the panel
const GROUND = 280;
const rad = (d: number) => (d * Math.PI) / 180;
const lineY = (x: number) => P.y - (x - P.x) * Math.tan(rad(K * RIDGE_DEG)); // sight line through the ridge top
const CREST = { x: 560, y: lineY(560) };
const RIDGE = [
  [420, GROUND],
  [480, 212],
  [530, 165],
  [CREST.x, CREST.y],
  [600, 152],
  [650, 180],
  [705, 168],
  [800, 205],
  [800, GROUND],
];

export function SunBehindHill() {
  const id = useId().replace(/:/g, "");
  const [el, setEl] = useState(4);
  const margin = el - RIDGE_DEG;
  const f = diskFraction(margin, SUN_R_DEG);
  const power = Math.round(f * 100);
  const sun = { x: P.x + R * Math.cos(rad(K * el)), y: P.y - R * Math.sin(rad(K * el)) };
  const sunR = R * Math.tan(rad(K * SUN_R_DEG));
  const status = f >= 0.995 ? "Full sunlight" : f <= 0.005 ? "Sun blocked by the ridge" : "Sun partly behind the ridge";
  const statusIcon = f >= 0.995 ? "☀" : f <= 0.005 ? "☾" : "◐";
  const panelLit = f > 0.005;
  // Ray from the ridge top towards the lander, descending at the (exaggerated) Sun angle.
  const slope = Math.tan(rad(K * el));
  const rayY = (x: number) => Math.min(GROUND, CREST.y + (CREST.x - x) * slope);
  const hitX = slope > 0 ? CREST.x - (GROUND - CREST.y) / slope : -Infinity; // where the ray meets the ground
  const shadow =
    hitX >= 0
      ? `${CREST.x},${CREST.y} ${hitX},${GROUND} ${CREST.x},${GROUND}`
      : `${CREST.x},${CREST.y} 0,${rayY(0)} 0,${GROUND} ${CREST.x},${GROUND}`;

  return (
    <div className="mt-10 grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="glass min-w-0 rounded-2xl p-3 sm:p-4">
        <svg viewBox={`0 0 ${VB.w} ${VB.h}`} className="block w-full" role="img" aria-label={`Side view: Sun at ${el.toFixed(1)} degrees, ridge top at 3 degrees. ${status}. Power ${power} percent.`}>
          <defs>
            <clipPath id={`${id}-sky`}>
              <polygon points={`${P.x},${P.y} ${VB.w},${lineY(VB.w)} ${VB.w},-400 0,-400 0,${P.y}`} />
            </clipPath>
            <radialGradient id={`${id}-glow`}>
              <stop offset="0%" stopColor="var(--color-sun)" stopOpacity={0.5} />
              <stop offset="100%" stopColor="var(--color-sun)" stopOpacity={0} />
            </radialGradient>
            <linearGradient id={`${id}-rock`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-lunar-700)" />
              <stop offset="100%" stopColor="var(--color-lunar-900)" />
            </linearGradient>
          </defs>

          {/* Sun (clipped by the sight line over the ridge top) */}
          <g clipPath={`url(#${id}-sky)`}>
            <circle cx={sun.x} cy={sun.y} r={sunR * 4} fill={`url(#${id}-glow)`} />
            <circle cx={sun.x} cy={sun.y} r={sunR} fill="#fff1d0" stroke="var(--color-sun)" />
          </g>
          <text x={Math.min(sun.x + sunR + 8, VB.w - 70)} y={Math.max(16, sun.y - sunR - 6)} fontSize={13} fill="var(--color-sun)" className="font-mono">
            ☀ Sun {el >= 0 ? "+" : "−"}
            {Math.abs(el).toFixed(1)}°
          </text>

          {/* sight line through the ridge top */}
          <line x1={P.x} y1={P.y} x2={VB.w} y2={lineY(VB.w)} stroke="var(--color-accent)" strokeOpacity={0.6} strokeDasharray="6 6" />
          <text x={CREST.x - 120} y={CREST.y - 14} fontSize={12} fill="var(--color-accent)" className="font-mono">
            ridge top: 3° up
          </text>
          {/* flat horizon */}
          <line x1={P.x} y1={P.y} x2={VB.w} y2={P.y} stroke="var(--color-lunar-500)" strokeOpacity={0.6} strokeDasharray="2 5" />
          <text x={VB.w - 8} y={P.y - 6} textAnchor="end" fontSize={11} fill="var(--color-lunar-400)" className="font-mono">
            flat horizon 0°
          </text>

          {/* ridge and ground */}
          <polygon points={RIDGE.map((p) => p.join(",")).join(" ")} fill={`url(#${id}-rock)`} stroke="var(--color-lunar-500)" strokeOpacity={0.5} />
          <rect x={0} y={GROUND} width={VB.w} height={VB.h - GROUND} fill="var(--color-lunar-900)" />
          <line x1={0} y1={GROUND} x2={VB.w} y2={GROUND} stroke="var(--color-lunar-600)" />

          {/* the ridge's cast shadow: everything below the sunlight ray grazing the ridge top.
              Its edge reaches the panel exactly when the Sun drops to 3°. */}
          <polygon points={shadow} fill="#000" opacity={0.5} />

          {/* lander */}
          <g>
            <line x1={128} y1={GROUND} x2={138} y2={262} stroke="var(--color-lunar-300)" strokeWidth={2} />
            <line x1={172} y1={GROUND} x2={162} y2={262} stroke="var(--color-lunar-300)" strokeWidth={2} />
            <rect x={132} y={244} width={36} height={20} rx={3} fill="var(--color-lunar-300)" />
            <rect
              x={P.x - 3}
              y={P.y - 26}
              width={6}
              height={26}
              rx={1}
              fill={panelLit ? "var(--color-sun)" : "var(--color-lunar-600)"}
              transform={`rotate(-20 ${P.x} ${P.y})`}
              className="transition-colors duration-300 motion-reduce:transition-none"
            />
            <text x={P.x} y={GROUND + 22} textAnchor="middle" fontSize={12} fill="var(--color-text)" className="font-mono">
              lander + solar panel
            </text>
          </g>
        </svg>
        <p className="mt-2 text-xs text-muted">Angles are drawn 5× steeper than real so small differences are visible.</p>
      </div>

      <div className="space-y-4">
        <div className="glass space-y-3 rounded-2xl p-4">
          <label htmlFor={`${id}-el`} className="hud block">
            Sun elevation
          </label>
          <input
            id={`${id}-el`}
            type="range"
            min={-2}
            max={6}
            step={0.05}
            value={el}
            onChange={(e) => setEl(Number(e.target.value))}
            aria-valuetext={`${el.toFixed(1)} degrees`}
            className="h-8 w-full accent-[var(--color-sun)]"
          />
          <div className="flex justify-between font-mono text-[11px] text-lunar-500">
            <span>−2°</span>
            <span className="text-sun">{el >= 0 ? "+" : "−"}{Math.abs(el).toFixed(1)}°</span>
            <span>+6°</span>
          </div>
        </div>

        <div className="glass space-y-3 rounded-2xl p-4" aria-live="polite">
          <p className="hud">Power</p>
          <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
            <span className="font-mono text-3xl tabular-nums text-text">{power}%</span>
            <span className={`text-sm font-semibold ${f >= 0.995 ? "text-good" : f <= 0.005 ? "text-notviable" : "text-risky"}`}>
              <span aria-hidden>{statusIcon} </span>
              {status}
            </span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-bg/60" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={power} aria-label="Solar power">
            <div className="h-full rounded-full bg-sun transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${power}%` }} />
          </div>
          <p className="text-xs text-muted">Power follows how much of the Sun&apos;s disk is above the ridge.</p>
        </div>
      </div>
    </div>
  );
}
