"use client";

import { useCallback, useMemo, useState } from "react";

import { LiveError, LiveSkeleton } from "@/components/learn/LiveState";
import { useSiteSky } from "@/components/learn/useSiteSky";
import { usePlayback } from "@/hooks/usePlayback";
import { interpAt, interpAz, timeAt } from "@/lib/interp";
import { horizonAt, splitRuns } from "@/lib/skyMath";
import { useNowHour } from "@/lib/useNowHour";

const DAYS = 30;
const W = 800;
const H = 250;
const PAD = { l: 46, r: 16, t: 14, b: 30 };
const fmt = (ms: number) => `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC`;
const sgn = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}°`;

/** Unwrap azimuths around a centre so a window crossing 0/360 stays continuous. */
const unwrap = (az: number, centre: number) => centre + ((((az - centre) % 360) + 540) % 360) - 180;

function Strip({ start }: { start: Date }) {
  const sky = useSiteSky("shackleton-ridge", start, DAYS);
  const { data, horizon, series, n } = sky;
  const [pos, setPos] = useState(0);
  const seek = useCallback((p: number) => setPos(Math.min(Math.max(0, p), Math.max(0, n - 1))), [n]);
  const play = usePlayback({ n, stepMinutes: 60, pos, seek });

  const geom = useMemo(() => {
    if (!data || !horizon) return null;
    const az = data.earth.az;
    const centre = az[0];
    const u = az.map((a) => unwrap(a, centre));
    const azMin = Math.min(...u) - 8;
    const azMax = Math.max(...u) + 8;
    const sky: { az: number; h: number }[] = [];
    for (let a = azMin; a <= azMax; a += 0.5) sky.push({ az: a, h: horizonAt(horizon.elevation, a) });
    const els = [...data.earth.el, ...sky.map((s) => s.h)];
    const elMin = Math.floor(Math.min(...els) - 1);
    const elMax = Math.ceil(Math.max(...els) + 1);
    const x = (a: number) => PAD.l + ((a - azMin) / (azMax - azMin)) * (W - PAD.l - PAD.r);
    const y = (e: number) => PAD.t + ((elMax - e) / (elMax - elMin)) * (H - PAD.t - PAD.b);
    const skyPath = sky.map((s, i) => `${i ? "L" : "M"}${x(s.az).toFixed(1)},${y(s.h).toFixed(1)}`).join("");
    const runs = splitRuns(u, data.earth.visible, false).map((r) => ({
      visible: r.visible,
      d: r.idx.map((i, k) => `${k ? "L" : "M"}${x(u[i]).toFixed(1)},${y(data.earth.el[i]).toFixed(1)}`).join(""),
    }));
    const ticks: number[] = [];
    for (let e = elMin; e <= elMax; e++) if (e % 2 === 0) ticks.push(e);
    return { centre, x, y, skyPath, runs, ticks, azMin, azMax, elMin, elMax, pxPerDeg: (H - PAD.t - PAD.b) / (elMax - elMin) };
  }, [data, horizon]);

  if (sky.status.kind === "error") return <LiveError message={sky.status.message} onRetry={sky.retry} />;
  if (!data || !geom || !series) return <LiveSkeleton className="h-72" label="Loading Earth's path…" />;

  const eAz = unwrap(interpAz(data.earth.az, pos), geom.centre);
  const eEl = interpAt(data.earth.el, pos);
  const hz = interpAt(data.earth.horizon_el, pos);
  const up = eEl - hz > 0;
  const px = geom.x(eAz);
  const py = geom.y(eEl);
  const r = Math.max(5, 0.95 * geom.pxPerDeg);

  return (
    <div className="mt-10 space-y-4">
      <div className="glass min-w-0 rounded-2xl p-3 sm:p-4">
        <div className="-mx-1 overflow-x-auto px-1">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="block w-full min-w-[560px]"
            role="img"
            aria-label={`Earth seen from Shackleton ridge at ${fmt(timeAt(series.timesMs, pos))}: elevation ${sgn(eEl)}, skyline ${sgn(hz)}, ${up ? "above the skyline, contact possible" : "below the skyline, no contact"}.`}
          >
            <defs>
              <clipPath id="eb-plot">
                <rect x={PAD.l} y={PAD.t} width={W - PAD.l - PAD.r} height={H - PAD.t - PAD.b} />
              </clipPath>
              <radialGradient id="eb-earth" cx="35%" cy="35%">
                <stop offset="0%" stopColor="#c8edff" />
                <stop offset="60%" stopColor="var(--color-earth)" />
                <stop offset="100%" stopColor="#1d5f8a" />
              </radialGradient>
            </defs>
            {geom.ticks.map((e) => (
              <g key={e}>
                <line x1={PAD.l} x2={W - PAD.r} y1={geom.y(e)} y2={geom.y(e)} stroke="var(--color-lunar-800)" strokeOpacity={e === 0 ? 0 : 0.7} />
                <text x={PAD.l - 6} y={geom.y(e)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="var(--color-lunar-500)" className="font-mono">
                  {e > 0 ? `+${e}` : e}°
                </text>
              </g>
            ))}
            <g clipPath="url(#eb-plot)">
              <path d={`${geom.skyPath}L${W - PAD.r},${H}L${PAD.l},${H}Z`} fill="var(--color-lunar-800)" />
              <path d={geom.skyPath} fill="none" stroke="var(--color-accent)" strokeOpacity={0.7} strokeWidth={1.4} />
              <line x1={PAD.l} x2={W - PAD.r} y1={geom.y(0)} y2={geom.y(0)} stroke="var(--color-lunar-400)" strokeDasharray="5 5" strokeOpacity={0.6} />
              {geom.runs.map((rn, i) => (
                <path key={i} d={rn.d} fill="none" stroke="var(--color-earth)" strokeOpacity={rn.visible ? 0.85 : 0.45} strokeWidth={rn.visible ? 1.6 : 1.2} strokeDasharray={rn.visible ? undefined : "2 4"} />
              ))}
              <circle cx={px} cy={py} r={r} fill={up ? "url(#eb-earth)" : "var(--color-earth)"} fillOpacity={up ? 1 : 0.25} stroke="var(--color-earth)" strokeDasharray={up ? undefined : "2 3"} />
            </g>
            <text x={PAD.l + 8} y={PAD.t + 14} fontSize={12} fill="var(--color-earth)" className="font-mono">
              ◉ Earth up = can talk
            </text>
            <text x={PAD.l + 8} y={H - PAD.b - 8} fontSize={12} fill="var(--color-lunar-300)" className="font-mono">
              ◌ Earth down = no contact
            </text>
            <text x={W - PAD.r} y={H - 8} textAnchor="end" fontSize={10} fill="var(--color-lunar-500)" className="font-mono">
              azimuth {Math.round(((geom.azMin % 360) + 360) % 360)}°–{Math.round(((geom.azMax % 360) + 360) % 360)}° (towards Earth) · height exaggerated
            </text>
          </svg>
        </div>
      </div>

      <div className="glass flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3">
        <button
          type="button"
          onClick={play.toggle}
          aria-pressed={play.playing}
          className="grid h-10 min-w-10 place-items-center rounded-full border border-earth/60 bg-earth/10 px-3 text-earth"
        >
          <span aria-hidden>{play.playing ? "⏸" : "▶"}</span>
          <span className="sr-only">{play.playing ? "Pause Earth's motion" : "Play Earth's motion"}</span>
        </button>
        <input
          type="range"
          min={0}
          max={Math.max(0, n - 1)}
          step="any"
          value={pos}
          onChange={(e) => seek(Number(e.target.value))}
          aria-label="Time in the 30-day window"
          aria-valuetext={fmt(timeAt(series.timesMs, pos))}
          className="h-8 min-w-40 flex-1 accent-[var(--color-earth)]"
        />
        <span className="font-mono text-xs text-lunar-300">{fmt(timeAt(series.timesMs, pos))}</span>
      </div>

      <p className="glass rounded-xl px-4 py-3 font-mono text-xs uppercase tracking-[0.12em]" aria-live="off">
        <span className="text-earth">◉ Earth</span> <span className="text-lunar-300">el {sgn(eEl)}</span> ·{" "}
        <span className="text-lunar-300">skyline {sgn(hz)}</span> →{" "}
        <span className={up ? "text-good" : "text-notviable"}>{up ? "✓ above the skyline: can talk" : "✕ below the skyline: no contact"}</span>
      </p>
    </div>
  );
}

export function EarthBob() {
  const start = useNowHour();
  return start ? <Strip start={start} /> : <LiveSkeleton className="mt-10 h-72" label="Loading Earth's path…" />;
}
