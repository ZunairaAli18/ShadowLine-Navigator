"use client";

import { memo, useMemo, useState } from "react";

import { Card } from "@/components/ui";
import type { HorizonData } from "@/hooks/useNavigatorData";
import type { VisibilityResponse } from "@/lib/api";
import type { EventKind, TimelineEvent } from "@/lib/countdowns";
import { downloadName, downloadText, eventsCsv, seriesCsv } from "@/lib/csv";

/**
 * Expert-only panels: full event list, raw 360° skyline, virtualised time-series table, downloads.
 * Memoised parts depend only on the loaded data; just the highlighted row follows the selected time.
 */

type Props = {
  data: VisibilityResponse;
  horizon: HorizonData;
  events: TimelineEvent[];
  pos: number;
  onSeek: (p: number) => void;
  terrainMode: string;
  earthMargin: number;
};

const EV: Record<EventKind, { icon: string; label: string; cls: string }> = {
  sunrise: { icon: "☀↑", label: "Sunrise", cls: "text-sun" },
  sunset: { icon: "☀↓", label: "Sunset", cls: "text-sun" },
  earthrise: { icon: "◉↑", label: "Earthrise", cls: "text-earth" },
  earthset: { icon: "◉↓", label: "Earthset", cls: "text-earth" },
};
const fmtUtc = (ms: number | string) => `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")}`;

function EventTable({ events, startMs, onSeek }: { events: TimelineEvent[]; startMs: number; onSeek: (p: number) => void }) {
  return (
    <Card className="min-w-0 space-y-3">
      <h3 className="text-base">Events in this window</h3>
      {events.length === 0 ? (
        <p className="text-sm text-muted">No rises or sets in this window.</p>
      ) : (
        <div className="max-h-64 overflow-auto rounded-lg border border-border">
          <table className="w-full font-mono text-xs">
            <thead className="sticky top-0 bg-surface-solid text-left text-lunar-400">
              <tr>
                <th className="px-3 py-2 font-normal">Event</th>
                <th className="px-3 py-2 font-normal">UTC</th>
                <th className="px-3 py-2 text-right font-normal">+h</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e, i) => (
                <tr key={i} className="border-t border-border/50 hover:bg-accent/10">
                  <td className={`px-3 py-1.5 ${EV[e.kind].cls}`}>
                    <button type="button" className="min-h-6 text-left" onClick={() => onSeek(e.pos)}>
                      {EV[e.kind].icon} {EV[e.kind].label}
                    </button>
                  </td>
                  <td className="px-3 py-1.5 text-lunar-200">{fmtUtc(e.time)}</td>
                  <td className="px-3 py-1.5 text-right text-lunar-400">{((e.time - startMs) / 3_600_000).toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function RawHorizon({ h }: { h: HorizonData }) {
  const W = 360;
  const H = 120;
  const lo = Math.min(-1, ...h.elevation);
  const hi = Math.max(1, ...h.elevation);
  const y = (e: number) => 8 + ((hi - e) / (hi - lo)) * (H - 20);
  const path = h.elevation.map((e, a) => `${a ? "L" : "M"}${a},${y(e).toFixed(1)}`).join("");
  const source = !h.demSource ? null : /80S|80MPP/i.test(h.demSource) ? "LOLA south polar map (80 m)" : "LOLA global map (64 px/deg)";
  return (
    <Card className="min-w-0 space-y-3">
      <h3 className="text-base">Raw horizon</h3>
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={`Skyline elevation for all 360 azimuths, from ${lo.toFixed(2)} to ${hi.toFixed(2)} degrees.`}>
        <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="var(--color-lunar-500)" strokeDasharray="3 3" strokeOpacity={0.6} />
        <path d={`${path}L${W - 1},${H}L0,${H}Z`} fill="var(--color-lunar-800)" />
        <path d={path} fill="none" stroke="var(--color-accent)" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
        {[0, 90, 180, 270].map((a) => (
          <text key={a} x={a + 2} y={H - 3} fontSize={9} fill="var(--color-lunar-500)" className="font-mono">
            {["N", "E", "S", "W"][a / 90]}
          </text>
        ))}
        <text x={W - 2} y={10} textAnchor="end" fontSize={9} fill="var(--color-lunar-500)" className="font-mono">
          {hi.toFixed(2)}° / {lo.toFixed(2)}°
        </text>
      </svg>
      {h.terrain === "lola" ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px]">
          <dt className="text-lunar-500">Source</dt>
          <dd className="text-lunar-200">{source ?? h.demSource}</dd>
          <dt className="text-lunar-500">Resolution</dt>
          <dd className="text-lunar-200">{h.demResolutionM ? `${h.demResolutionM.toFixed(0)} m` : "—"}</dd>
          <dt className="text-lunar-500">Site height</dt>
          <dd className="text-lunar-200">{h.siteHeightM != null ? `${h.siteHeightM.toFixed(1)} m` : "—"}</dd>
          <dt className="text-lunar-500">Search radius</dt>
          <dd className="text-lunar-200">{h.maxDistanceKm ? `${h.maxDistanceKm} km` : "—"}</dd>
        </dl>
      ) : (
        <p className="text-xs text-muted">Flat 0° horizon (no terrain data for this point or flat mode selected).</p>
      )}
    </Card>
  );
}

const ROW = 28;
const VIEW = 320;

const DataTable = memo(function DataTable({ data, current, onSeek }: { data: VisibilityResponse; current: number; onSeek: (p: number) => void }) {
  const [top, setTop] = useState(0);
  const n = data.times.length;
  const first = Math.max(0, Math.floor(top / ROW) - 6);
  const last = Math.min(n, Math.ceil((top + VIEW) / ROW) + 6);
  const f2 = (v: number) => v.toFixed(2);
  const rows = [];
  for (let i = first; i < last; i++) {
    rows.push(
      <tr
        key={i}
        onClick={() => onSeek(i)}
        aria-selected={i === current}
        className={`cursor-pointer border-t border-border/40 ${i === current ? "bg-accent/15 text-text" : "hover:bg-accent/5"}`}
        style={{ height: ROW }}
      >
        <td className="whitespace-nowrap px-2">{fmtUtc(data.times[i])}</td>
        <td className="px-2 text-right">{f2(data.sun.az[i])}</td>
        <td className="px-2 text-right">{f2(data.sun.el[i])}</td>
        <td className="px-2 text-right">{f2(data.sun.horizon_el[i])}</td>
        <td className="px-2 text-right">{data.sun.visible_fraction[i].toFixed(3)}</td>
        <td className="px-2 text-right">{f2(data.earth.az[i])}</td>
        <td className="px-2 text-right">{f2(data.earth.el[i])}</td>
        <td className="px-2 text-right">{f2(data.earth.horizon_el[i])}</td>
        <td className={`px-2 text-center ${data.earth.visible[i] ? "text-earth" : "text-lunar-500"}`}>{data.earth.visible[i] ? "✓" : "–"}</td>
      </tr>,
    );
  }
  return (
    <div className="overflow-auto rounded-lg border border-border" style={{ height: VIEW }} onScroll={(e) => setTop(e.currentTarget.scrollTop)} tabIndex={0} aria-label={`Time series table, ${n} rows. Click a row to jump there.`}>
      <table className="w-full min-w-[720px] font-mono text-[11px] text-lunar-300">
        <thead className="sticky top-0 z-10 bg-surface-solid text-lunar-400">
          <tr style={{ height: ROW }}>
            <th className="px-2 text-left font-normal">UTC</th>
            <th className="px-2 text-right font-normal text-sun">☀ az</th>
            <th className="px-2 text-right font-normal text-sun">el</th>
            <th className="px-2 text-right font-normal text-sun">hzn</th>
            <th className="px-2 text-right font-normal text-sun">frac</th>
            <th className="px-2 text-right font-normal text-earth">◉ az</th>
            <th className="px-2 text-right font-normal text-earth">el</th>
            <th className="px-2 text-right font-normal text-earth">hzn</th>
            <th className="px-2 text-center font-normal text-earth">vis</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ height: first * ROW }} aria-hidden />
          {rows}
          <tr style={{ height: Math.max(0, (n - last) * ROW) }} aria-hidden />
        </tbody>
      </table>
    </div>
  );
});

export function ExpertPanels({ data, horizon, events, pos, onSeek, terrainMode, earthMargin }: Props) {
  const startMs = useMemo(() => new Date(data.start).getTime(), [data.start]);
  const days = Math.round((data.times.length * data.step_minutes) / 1440);
  const site = data.site.id;
  const btn = "min-h-9 rounded-full border border-border px-4 text-xs font-semibold text-muted hover:border-accent/50 hover:text-accent";

  return (
    <section aria-labelledby="expert-h" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-1">Expert</p>
          <h2 id="expert-h" className="text-2xl">
            Data and downloads
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn} onClick={() => downloadText(downloadName(site, data.start, days, "csv"), seriesCsv(data, { terrainMode, earthMarginDeg: earthMargin }))}>
            ⬇ Time series CSV
          </button>
          <button type="button" className={btn} onClick={() => downloadText(downloadName(site, data.start, days, "json", "_visibility"), JSON.stringify(data, null, 2), "application/json")}>
            ⬇ Raw JSON
          </button>
          <button type="button" className={btn} onClick={() => downloadText(downloadName(site, data.start, days, "csv", "_events"), eventsCsv(events, startMs))}>
            ⬇ Events CSV
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <EventTable events={events} startMs={startMs} onSeek={onSeek} />
        <RawHorizon h={horizon} />
      </div>

      <Card className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base">Time series</h3>
          <span className="hud">
            {data.times.length} steps · {data.step_minutes} min
          </span>
        </div>
        <DataTable data={data} current={Math.round(pos)} onSeek={onSeek} />
      </Card>
    </section>
  );
}
