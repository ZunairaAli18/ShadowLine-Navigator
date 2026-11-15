"use client";

import { memo, useMemo, useRef, useState, type PointerEvent } from "react";

import { Card } from "@/components/ui";
import { SPEEDS } from "@/hooks/usePlayback";
import type { CountdownSeries, EventKind, TimelineEvent } from "@/lib/countdowns";
import { timeAt } from "@/lib/interp";

/**
 * Timeline strip: Sun / Earth / Both bands over the whole window, rise/set markers, UTC day ticks,
 * playhead, drag-to-scrub, hover guide. Static layers are memoised; only the playhead and hover move.
 */

const ROW_H = 20;
const EV_Y = 4; // event icon row
const ROWS_Y = 26;
const GAP = 8;
const rowY = (r: number) => ROWS_Y + r * (ROW_H + GAP);
const TICKS_Y = rowY(3) + 2;
const H = TICKS_Y + 22;

const EVENT_META: Record<EventKind, { icon: string; label: string; tone: string }> = {
  sunrise: { icon: "☀↑", label: "Sunrise", tone: "var(--color-sun)" },
  sunset: { icon: "☀↓", label: "Sunset", tone: "var(--color-sun)" },
  earthrise: { icon: "◉↑", label: "Earthrise", tone: "var(--color-earth)" },
  earthset: { icon: "◉↓", label: "Earthset", tone: "var(--color-earth)" },
};

const fmtUtc = (ms: number) => `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC`;
const fmtDay = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

type Props = {
  series: CountdownSeries;
  events: TimelineEvent[];
  pos: number;
  onSeek: (p: number) => void;
  playing: boolean;
  onToggle: () => void;
  onStart: () => void;
  onNextEvent: () => void;
  speed: number;
  onSpeed: (s: number) => void;
  loop: boolean;
  onLoop: (v: boolean) => void;
};

/** Merge consecutive steps with the same value into [start, end) runs. */
function runs<T>(values: T[], keep: (v: T) => boolean): { from: number; to: number; v: T }[] {
  const out: { from: number; to: number; v: T }[] = [];
  for (let k = 0; k < values.length; k++) {
    if (!keep(values[k])) continue;
    const last = out[out.length - 1];
    if (last && last.to === k && last.v === values[k]) last.to = k + 1;
    else out.push({ from: k, to: k + 1, v: values[k] });
  }
  return out;
}

const pct = (p: number, n: number) => (Math.min(Math.max(p, 0), n - 1) / Math.max(1, n - 1)) * 100;
const X = (p: number, n: number) => `${pct(p, n).toFixed(3)}%`;

const StaticStrip = memo(function StaticStrip({ series, events }: { series: CountdownSeries; events: TimelineEvent[] }) {
  const n = series.timesMs.length;
  const x = (p: number) => X(p, n);

  const { sunRuns, earthRuns, bothRuns, ticks } = useMemo(() => {
    // Sun opacity follows the visible fraction, quantised to 4 levels so runs stay few.
    const bucket = series.sunFraction.map((f) => (f < 0.02 ? 0 : Math.ceil(f * 4) / 4));
    const both = series.sunUp.map((u, k) => u && series.earthVisible[k]);
    const t0 = series.timesMs[0];
    const t1 = series.timesMs[n - 1];
    const dayMs = 86_400_000;
    const days = Math.max(1, (t1 - t0) / dayMs);
    const every = days <= 10 ? 1 : days <= 21 ? 2 : days <= 45 ? 5 : 7;
    const tk: { p: number; label: string | null }[] = [];
    let d = Math.ceil(t0 / dayMs) * dayMs;
    for (let k = 0; d <= t1; d += dayMs, k++) {
      const p = ((d - t0) / (t1 - t0)) * (n - 1);
      tk.push({ p, label: k % every === 0 ? fmtDay(d) : null });
    }
    return {
      sunRuns: runs(bucket, (b) => b > 0),
      earthRuns: runs(series.earthVisible, (v) => v),
      bothRuns: runs(both, (v) => v),
      ticks: tk,
    };
  }, [series, n]);

  const band = (r: { from: number; to: number }, row: number, fill: string, opacity: number, key: string) => (
    <rect key={key} x={x(r.from)} width={`${Math.max(0.08, pct(r.to, n) - pct(r.from, n)).toFixed(3)}%`} y={rowY(row)} height={ROW_H} fill={fill} opacity={opacity} rx={1.5} />
  );

  return (
    <g>
      {[0, 1, 2].map((r) => (
        <rect key={r} x={0} y={rowY(r)} width="100%" height={ROW_H} fill="var(--color-bg)" opacity={0.55} rx={3} />
      ))}
      {sunRuns.map((r, k) => band(r, 0, "var(--color-sun)", 0.25 + 0.7 * (r.v as number), `s${k}`))}
      {earthRuns.map((r, k) => band(r, 1, "var(--color-earth)", 0.85, `e${k}`))}
      {bothRuns.map((r, k) => band(r, 2, "var(--color-accent)", 0.9, `b${k}`))}

      {ticks.map((t, k) => (
        <g key={k}>
          <line x1={x(t.p)} x2={x(t.p)} y1={ROWS_Y - 2} y2={TICKS_Y + (t.label ? 5 : 2)} stroke="var(--color-lunar-700)" strokeOpacity={t.label ? 0.8 : 0.4} />
          {t.label && (
            <text x={x(t.p)} y={TICKS_Y + 16} textAnchor={pct(t.p, n) < 4 ? "start" : pct(t.p, n) > 96 ? "end" : "middle"} fontSize={10} fill="var(--color-lunar-500)" className="font-mono">
              {t.label}
            </text>
          )}
        </g>
      ))}

      {events.map((e, k) => {
        const meta = EVENT_META[e.kind];
        return (
          <g key={k}>
            <line x1={x(e.pos)} x2={x(e.pos)} y1={EV_Y + 14} y2={rowY(3) - GAP} stroke={meta.tone} strokeOpacity={0.35} strokeDasharray="2 3" />
            <text x={x(e.pos)} y={EV_Y + 10} textAnchor="middle" fontSize={11} fill={meta.tone}>
              <title>{`${meta.label} · ${fmtUtc(e.time)}`}</title>
              {meta.icon}
            </text>
          </g>
        );
      })}
    </g>
  );
});

function Transport(props: Omit<Props, "series" | "events" | "pos" | "onSeek">) {
  const btn =
    "grid h-9 min-w-9 place-items-center rounded-full border border-border px-2 text-sm text-text transition-colors hover:border-accent/50 hover:text-accent";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={btn} onClick={props.onStart} aria-label="Go to start">
        ⏮
      </button>
      <button
        type="button"
        className={`${btn} h-10 min-w-10 border-accent/60 bg-accent/10 text-accent`}
        onClick={props.onToggle}
        aria-label={props.playing ? "Pause" : "Play"}
        aria-pressed={props.playing}
      >
        {props.playing ? "⏸" : "▶"}
      </button>
      <button type="button" className={btn} onClick={props.onNextEvent} aria-label="Jump to next event">
        ⏭
      </button>
      <div role="radiogroup" aria-label="Playback speed" className="ml-1 inline-flex rounded-lg border border-border bg-bg/40 p-0.5">
        {SPEEDS.map((s) => (
          <button
            key={s.hoursPerSec}
            type="button"
            role="radio"
            aria-checked={props.speed === s.hoursPerSec}
            onClick={() => props.onSpeed(s.hoursPerSec)}
            className={`rounded-md px-2.5 py-1.5 font-mono text-[11px] ${props.speed === s.hoursPerSec ? "bg-accent text-bg" : "text-muted hover:text-text"}`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <label className="flex min-h-9 cursor-pointer items-center gap-2 rounded-full border border-border px-3 text-xs text-muted">
        <input type="checkbox" checked={props.loop} onChange={(e) => props.onLoop(e.target.checked)} className="accent-[var(--color-accent)]" />
        ↻ Loop
      </label>
      <span className="hud ml-auto hidden md:inline">Space play · ← → step · Shift day · Home/End</span>
    </div>
  );
}

export function Timeline(props: Props) {
  const { series, events, pos, onSeek } = props;
  const n = series.timesMs.length;
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const [hover, setHover] = useState<number | null>(null);
  const x = (p: number) => X(p, n);

  const posFromEvent = (e: PointerEvent<SVGSVGElement>) => {
    const r = svgRef.current!.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    return f * (n - 1);
  };

  const hoverIdx = hover === null ? null : Math.round(hover);
  const hoverEvent = hover === null ? null : events.find((ev) => Math.abs(pct(ev.pos, n) - pct(hover, n)) < 0.6);

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg">Timeline</h2>
        <span className="font-mono text-xs text-lunar-300">{fmtUtc(timeAt(series.timesMs, pos))}</span>
      </div>

      <Transport {...props} />

      <div className="-mx-1 overflow-x-auto px-1 pb-1" tabIndex={0} role="region" aria-label="Timeline bands (scroll sideways on narrow screens)">
        <div className="flex min-w-[640px] gap-3">
          {/* row labels */}
          <div className="relative w-16 shrink-0 select-none text-[11px] font-semibold" style={{ height: H }} aria-hidden>
            {[
              { label: "☀ Sun", cls: "text-sun" },
              { label: "◉ Earth", cls: "text-earth" },
              { label: "◆ Both", cls: "text-accent" },
            ].map((r, k) => (
              <span key={r.label} className={`absolute left-0 flex items-center ${r.cls}`} style={{ top: rowY(k), height: ROW_H }}>
                {r.label}
              </span>
            ))}
          </div>

          <div className="relative min-w-0 flex-1">
            <svg
              ref={svgRef}
              className="block w-full cursor-ew-resize select-none touch-pan-y"
              style={{ height: H }}
              role="slider"
              aria-label="Timeline: selected time"
              aria-valuemin={0}
              aria-valuemax={n - 1}
              aria-valuenow={Math.round(pos)}
              aria-valuetext={fmtUtc(timeAt(series.timesMs, pos))}
              tabIndex={0}
              onPointerDown={(e) => {
                dragging.current = true;
                e.currentTarget.setPointerCapture(e.pointerId);
                onSeek(posFromEvent(e));
              }}
              onPointerMove={(e) => {
                const p = posFromEvent(e);
                setHover(p);
                if (dragging.current) onSeek(p);
              }}
              onPointerUp={(e) => {
                dragging.current = false;
                e.currentTarget.releasePointerCapture(e.pointerId);
              }}
              onPointerLeave={() => setHover(null)}
            >
              <StaticStrip series={series} events={events} />
              {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={0} y2={TICKS_Y} stroke="var(--color-lunar-300)" strokeOpacity={0.5} />}
              {/* playhead */}
              <g>
                <line x1={x(pos)} x2={x(pos)} y1={0} y2={TICKS_Y + 4} stroke="var(--color-text)" strokeWidth={2} />
                <circle cx={x(pos)} cy={4} r={4.5} fill="var(--color-text)" />
              </g>
            </svg>

            {hover !== null && hoverIdx !== null && (
              <div
                role="tooltip"
                className="glass pointer-events-none absolute top-0 z-10 -translate-x-1/2 -translate-y-[calc(100%+6px)] whitespace-nowrap rounded-lg px-3 py-2 font-mono text-[11px] leading-relaxed"
                style={{ left: `${(hover / Math.max(1, n - 1)) * 100}%` }}
              >
                <div className="text-lunar-200">{fmtUtc(timeAt(series.timesMs, hover))}</div>
                {hoverEvent && (
                  <div style={{ color: EVENT_META[hoverEvent.kind].tone }}>
                    {EVENT_META[hoverEvent.kind].icon} {EVENT_META[hoverEvent.kind].label} at {fmtUtc(hoverEvent.time).slice(11)}
                  </div>
                )}
                <div className={series.sunUp[hoverIdx] ? "text-sun" : "text-lunar-400"}>☀ Sun {series.sunUp[hoverIdx] ? "up" : "down"}</div>
                <div className={series.earthVisible[hoverIdx] ? "text-earth" : "text-lunar-400"}>
                  ◉ Earth {series.earthVisible[hoverIdx] ? "visible" : "hidden"}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex justify-between font-mono text-[11px] text-lunar-500">
        <span>Start {fmtUtc(series.timesMs[0])}</span>
        <span>End {fmtUtc(series.timesMs[n - 1])}</span>
      </div>
    </Card>
  );
}
