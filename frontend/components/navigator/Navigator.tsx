"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ControlBar } from "@/components/navigator/ControlBar";
import { SkyPlot } from "@/components/navigator/SkyPlot";
import { Button, Card, Pill, VerdictBadge } from "@/components/ui";
import { useNavigatorData } from "@/hooks/useNavigatorData";
import { useNavState } from "@/hooks/useNavState";
import { indexForTime, type NavState, type NavTab } from "@/lib/navState";

const TABS: { id: NavTab; label: string }[] = [
  { id: "compare", label: "Compare" },
  { id: "best", label: "Best dates" },
  { id: "map", label: "Moon map" },
  { id: "learn", label: "Learn" },
];
const URL_WRITE_MS = 150;

const fmtTime = (d: Date) => `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;

export function Navigator() {
  const { state, update, shareUrl } = useNavState();
  const nav = useNavigatorData(state);
  const { data, horizon, times, n, status } = nav;

  // Selected index: from the URL's t, or a local value while scrubbing (no refetch, URL written throttled).
  const seriesStart = data ? new Date(data.start) : state.start;
  const seriesStep = data?.step_minutes ?? state.step;
  const urlIndex = indexForTime(state.t, seriesStart, seriesStep, n);
  const [scrub, setScrub] = useState<number | null>(null);
  const index = scrub ?? urlIndex;
  const writeTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (writeTimer.current) window.clearTimeout(writeTimer.current);
  }, []);

  const onScrub = (i: number) => {
    setScrub(i);
    if (writeTimer.current) window.clearTimeout(writeTimer.current);
    writeTimer.current = window.setTimeout(() => {
      if (times[i]) update({ t: times[i] }, { replace: true });
      setScrub(null);
    }, URL_WRITE_MS);
  };

  const onControl = useCallback(
    (patch: Partial<NavState>) => {
      setScrub(null);
      update(patch);
    },
    [update],
  );

  const sun = useMemo(
    () => (data ? { az: data.sun.az, el: data.sun.el, fraction: data.sun.visible_fraction } : { az: [], el: [], fraction: [] }),
    [data],
  );
  const earth = useMemo(
    () => (data ? { az: data.earth.az, el: data.earth.el, visible: data.earth.visible } : { az: [], el: [], visible: [] }),
    [data],
  );

  const loc = state.location;
  const siteKey = `${loc.kind === "site" ? loc.siteId : `${loc.lat},${loc.lon}`}|${horizon?.terrain ?? "flat"}`;
  const title = data?.site.name ?? (loc.kind === "site" ? "Loading…" : `Custom (${loc.lat}, ${loc.lon})`);
  const loading = status.kind === "loading";
  const m = nav.metrics;

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow mb-2">Navigator</p>
          <h1 className="truncate text-3xl sm:text-4xl">{title}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data && <Pill tone={data.terrain === "lola" ? "accent" : "default"}>{data.terrain === "lola" ? "▲ LOLA terrain" : "Flat horizon"}</Pill>}
          <span className="hud" aria-live="polite">
            {loading ? "Computing…" : status.kind === "ok" ? `${n} steps · ${state.days} d` : ""}
          </span>
        </div>
      </header>

      <ControlBar state={state} onChange={onControl} shareUrl={shareUrl} />

      {status.kind === "error" && (
        <Card role="alert" className="flex flex-col items-start gap-3 border-notviable/30 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-heading text-lg font-semibold">{status.title}</p>
            <p className="mt-1 text-sm text-muted">{status.message}</p>
          </div>
          <Button variant="secondary" onClick={nav.retry}>
            Try again
          </Button>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Sky plot */}
        <Card className="relative min-w-0 p-4 sm:p-5" aria-busy={loading}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg">Sky</h2>
            {times[index] && <span className="font-mono text-xs text-lunar-300">{fmtTime(times[index])}</span>}
          </div>
          {data && horizon ? (
            <div className={`transition-opacity duration-300 ${loading ? "opacity-60" : "opacity-100"}`}>
              <SkyPlot horizon={horizon.elevation} terrain={horizon.terrain} siteKey={siteKey} times={times} sun={sun} earth={earth} index={index} />
            </div>
          ) : (
            <div className="grid aspect-[16/9] animate-pulse place-items-center rounded-xl bg-bg/40 text-sm text-muted">
              {status.kind === "error" ? "No data" : "Loading the sky…"}
            </div>
          )}
        </Card>

        {/* Metrics placeholder (F4) */}
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg">Metrics</h2>
            <span className="hud">Preview</span>
          </div>
          {m ? (
            <>
              <VerdictBadge verdict={m.verdict} />
              <dl className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-border p-3">
                  <dt className="hud">Sunlight</dt>
                  <dd className="mt-1 font-mono text-2xl text-sun">{m.sun_pct.toFixed(1)}%</dd>
                </div>
                <div className="rounded-xl border border-border p-3">
                  <dt className="hud">Earth in view</dt>
                  <dd className="mt-1 font-mono text-2xl text-earth">{m.earth_pct.toFixed(1)}%</dd>
                </div>
              </dl>
              <ul className="space-y-1 text-sm text-muted">
                {m.verdict_reasons.map((r) => (
                  <li key={r}>· {r}</li>
                ))}
              </ul>
              <p className="text-xs text-muted/70">Full metrics panel comes in F4.</p>
            </>
          ) : (
            <div className="h-40 animate-pulse rounded-xl bg-bg/40" />
          )}
        </Card>
      </div>

      {/* Timeline placeholder (F5) */}
      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg">Timeline</h2>
          <span className="font-mono text-xs text-lunar-300">{times[index] ? fmtTime(times[index]) : "—"}</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Previous step"
            disabled={!n || index <= 0}
            onClick={() => onScrub(Math.max(0, index - 1))}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border text-muted hover:text-text disabled:opacity-40"
          >
            ‹
          </button>
          <input
            type="range"
            min={0}
            max={Math.max(0, n - 1)}
            step={1}
            value={Math.min(index, Math.max(0, n - 1))}
            disabled={!n}
            onChange={(e) => onScrub(Number(e.target.value))}
            aria-label="Selected time"
            aria-valuetext={times[index] ? fmtTime(times[index]) : undefined}
            className="h-8 w-full cursor-pointer accent-[var(--color-accent)]"
          />
          <button
            type="button"
            aria-label="Next step"
            disabled={!n || index >= n - 1}
            onClick={() => onScrub(Math.min(n - 1, index + 1))}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border text-muted hover:text-text disabled:opacity-40"
          >
            ›
          </button>
        </div>
        <div className="flex justify-between font-mono text-[11px] text-lunar-500">
          <span>{times[0] ? fmtTime(times[0]) : ""}</span>
          <span>{times[n - 1] ? fmtTime(times[n - 1]) : ""}</span>
        </div>
      </Card>

      {/* Tabs placeholder */}
      <nav aria-label="Navigator tools" className="glass flex flex-wrap gap-1 rounded-2xl p-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={state.tab === t.id}
            onClick={() => onControl({ tab: state.tab === t.id ? null : t.id })}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm transition-colors ${
              state.tab === t.id ? "bg-accent/15 text-accent" : "text-muted hover:text-text"
            }`}
          >
            {t.label} <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-lunar-500">soon</span>
          </button>
        ))}
      </nav>
      {state.tab && (
        <Card className="text-sm text-muted">
          {TABS.find((t) => t.id === state.tab)?.label} is coming in a later chunk.
        </Card>
      )}
    </div>
  );
}
