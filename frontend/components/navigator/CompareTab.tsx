"use client";

import { memo, useEffect, useMemo, useState } from "react";

import { SitePicker } from "@/components/navigator/SitePicker";
import { UtcDateTime } from "@/components/navigator/UtcDateTime";
import { Button, Card, VerdictBadge } from "@/components/ui";
import { ApiError, compare, type ScenarioResult } from "@/lib/api";
import {
  bestIndex,
  decodeScenarios,
  encodeScenarios,
  MAX_SCENARIOS,
  presetEquatorVsPole,
  presetFlatVsReal,
  presetLaunchSlips,
  type CmpScenario,
} from "@/lib/compareUrl";
import { formatDuration } from "@/lib/countdowns";
import { compareCsv, downloadName, downloadText } from "@/lib/csv";
import { isoUtc, MAX_DAYS, MIN_DAYS, type Location, type NavMode, type TerrainChoice } from "@/lib/navState";

const DEBOUNCE_MS = 400;

type Props = {
  /** Raw `cmp` URL value (null = not set yet). */
  cmp: string | null;
  current: { location: Location; start: Date; days: number; terrain: TerrainChoice };
  onChangeCmp: (cmp: string) => void;
  onOpen: (s: CmpScenario) => void;
  mode: NavMode;
};

type Result = { status: "idle" | "loading" } | { status: "ok"; results: ScenarioResult[] } | { status: "error"; message: string };

const hours = (h: number, truncated = false) => {
  const v = h >= 48 ? `${(h / 24).toFixed(1)} d` : `${h.toFixed(h < 10 ? 1 : 0)} h`;
  return truncated ? `≥ ${v}` : v;
};

function Best({ on }: { on: boolean }) {
  return on ? (
    <span className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-good/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-good">
      ★ best
    </span>
  ) : null;
}

function ScenarioEditor({
  s,
  index,
  canRemove,
  onChange,
  onRemove,
}: {
  s: CmpScenario;
  index: number;
  canRemove: boolean;
  onChange: (s: CmpScenario) => void;
  onRemove: () => void;
}) {
  const [daysText, setDaysText] = useState(String(s.days));
  const commitDays = (v: string) => {
    const d = Math.round(Number(v));
    if (Number.isFinite(d) && d >= MIN_DAYS && d <= MAX_DAYS) onChange({ ...s, days: d });
    else setDaysText(String(s.days));
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="hud">Scenario {String.fromCharCode(65 + index)}</span>
        {canRemove && (
          <button type="button" onClick={onRemove} className="min-h-8 rounded-full px-3 text-xs text-muted hover:text-notviable" aria-label={`Remove scenario ${String.fromCharCode(65 + index)}`}>
            ✕ Remove
          </button>
        )}
      </div>
      <label className="block">
        <span className="sr-only">Label</span>
        <input
          value={s.label ?? ""}
          onChange={(e) => onChange({ ...s, label: e.target.value || undefined })}
          placeholder="Label (optional)"
          maxLength={40}
          className="w-full rounded-lg border border-border bg-surface-solid px-3 py-1.5 text-sm"
        />
      </label>
      <SitePicker value={s.location} onChange={(location) => onChange({ ...s, location })} />
      <UtcDateTime label="Start" value={s.start} onChange={(start) => onChange({ ...s, start })} />
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="hud">Days</span>
          <input
            type="number"
            min={MIN_DAYS}
            max={MAX_DAYS}
            value={daysText}
            onChange={(e) => setDaysText(e.target.value)}
            onBlur={(e) => commitDays(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && commitDays((e.target as HTMLInputElement).value)}
            className="w-20 rounded-lg border border-border bg-surface-solid px-2.5 py-1.5 font-mono text-sm"
          />
        </label>
        <div role="radiogroup" aria-label="Horizon" className="inline-flex rounded-lg border border-border bg-bg/40 p-0.5">
          {(["auto", "flat"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={s.terrain === t}
              onClick={() => onChange({ ...s, terrain: t })}
              className={`rounded-md px-2.5 py-1.5 text-xs font-semibold ${s.terrain === t ? "bg-accent text-bg" : "text-muted hover:text-text"}`}
            >
              {t === "auto" ? "Real terrain" : "Flat"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const utc = (iso: string | null | undefined) => (iso ? `${iso.slice(0, 16).replace("T", " ")} UTC` : "not in window");

function ResultBlock({ r, best, onOpen, mode }: { r: ScenarioResult; best: Record<string, boolean>; onOpen: () => void; mode: NavMode }) {
  const m = r.metrics;
  const expert = mode === "expert";
  const bar = (label: string, v: number, color: string, text: string, key: string) => (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted">
          {label}
          <Best on={best[key]} />
        </span>
        <span className={`font-mono ${text}`}>{expert ? v.toFixed(1) : Math.round(v)}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-bg/60">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, v)}%` }} />
      </div>
    </div>
  );
  const row = (label: string, v: string, key?: string) => (
    <div className="flex items-center justify-between gap-2 border-t border-border/60 py-1.5 text-xs">
      <span className="text-muted">
        {label}
        {key && <Best on={best[key]} />}
      </span>
      <span className="font-mono text-text">{v}</span>
    </div>
  );
  return (
    <div className="space-y-3 border-t border-border pt-4">
      <div className="space-y-1.5">
        <VerdictBadge verdict={m.verdict} />
        <ul className="space-y-0.5 text-xs text-muted">
          {m.verdict_reasons.map((x) => (
            <li key={x}>· {x}</li>
          ))}
        </ul>
      </div>
      {bar("☀ Sunlight", m.sun_pct, "bg-sun", "text-sun", "sun")}
      {bar("◉ Earth in view", m.earth_pct, "bg-earth", "text-earth", "earth")}
      {bar("◆ Both", m.both_pct, "bg-accent", "text-accent", "both")}
      <div>
        {row("Longest dark", hours(m.longest_dark_hours, m.longest_dark_truncated), "dark")}
        {expert && (
          <>
            {row("Longest no Earth", hours(m.longest_no_earth_hours, m.longest_no_earth_truncated), "noEarth")}
            {row("Power index", m.power_index.toFixed(3), "power")}
            {row("Next sunset", m.next_sunset ? utc(m.next_sunset) : "not in window")}
            {row("Next Earthset", m.next_earthset ? utc(m.next_earthset) : "not in window")}
          </>
        )}
        {!expert && row("Next sunset", m.next_sunset_hours != null ? `in ${formatDuration(m.next_sunset_hours)}` : "not in window")}
      </div>
      <Button variant="secondary" arrow onClick={onOpen} className="w-full">
        Open in navigator
      </Button>
    </div>
  );
}

export const CompareTab = memo(function CompareTab({ cmp, current, onChangeCmp, onOpen, mode }: Props) {
  const decoded = useMemo(() => decodeScenarios(cmp), [cmp]);
  // No `cmp` yet: start with "Flat vs real terrain" for the current view.
  const scenarios = decoded.length ? decoded : presetFlatVsReal(current);
  const key = encodeScenarios(scenarios);
  const [result, setResult] = useState<Result>({ status: "idle" });

  useEffect(() => {
    const ctrl = new AbortController();
    const list = decodeScenarios(key);
    const timer = window.setTimeout(async () => {
      setResult({ status: "loading" });
      try {
        const res = await compare(
          {
            scenarios: list.map((s) => ({
              ...(s.location.kind === "site" ? { site_id: s.location.siteId } : { lat: s.location.lat, lon: s.location.lon }),
              start: isoUtc(s.start),
              days: s.days,
              step_minutes: 60,
              terrain_mode: s.terrain,
              label: s.label ?? null,
            })),
          },
          { signal: ctrl.signal },
        );
        setResult({ status: "ok", results: res.results });
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
        setResult({ status: "error", message: e instanceof ApiError ? e.message : "Unexpected error." });
      }
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [key]);

  const set = (list: CmpScenario[]) => onChangeCmp(encodeScenarios(list));
  const results = result.status === "ok" && result.results.length === scenarios.length ? result.results : null;

  const best = useMemo(() => {
    const flags = scenarios.map(() => ({}) as Record<string, boolean>);
    if (!results) return flags;
    const rows: [string, (r: ScenarioResult) => number, boolean][] = [
      ["sun", (r) => r.metrics.sun_pct, true],
      ["earth", (r) => r.metrics.earth_pct, true],
      ["both", (r) => r.metrics.both_pct, true],
      ["dark", (r) => r.metrics.longest_dark_hours, false],
      ["noEarth", (r) => r.metrics.longest_no_earth_hours, false],
      ["power", (r) => r.metrics.power_index, true],
    ];
    for (const [k, get, higher] of rows) {
      const i = bestIndex(results.map(get), higher);
      if (i !== null) flags[i][k] = true;
    }
    return flags;
  }, [results, scenarios]);

  const presetBase = { location: current.location, start: current.start, days: current.days };

  return (
    <section aria-labelledby="compare-h" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-1">Compare</p>
          <h2 id="compare-h" className="text-2xl">
            Scenarios side by side
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="hud" aria-live="polite">
            {result.status === "loading" ? "Computing…" : results ? `${results.length} scenarios` : ""}
          </span>
          {mode === "expert" && results && (
            <button
              type="button"
              onClick={() => downloadText(downloadName("compare", scenarios[0].start, scenarios[0].days, "csv"), compareCsv(results, scenarios.map((x) => x.label)))}
              className="min-h-9 rounded-full border border-border px-4 text-xs font-semibold text-muted hover:border-accent/50 hover:text-accent"
            >
              ⬇ Comparison CSV
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <span className="hud self-center">Presets</span>
        {[
          { label: "Flat vs real terrain", run: () => set(presetFlatVsReal(presetBase)) },
          { label: "Launch slips", run: () => set(presetLaunchSlips(presetBase)) },
          { label: "Equator vs pole", run: () => set(presetEquatorVsPole(presetBase)) },
        ].map((p) => (
          <button key={p.label} type="button" onClick={p.run} className="min-h-9 rounded-full border border-border px-3 text-xs font-semibold text-muted hover:border-accent/50 hover:text-accent">
            {p.label}
          </button>
        ))}
        <button
          type="button"
          disabled={scenarios.length >= MAX_SCENARIOS}
          onClick={() => set([...scenarios, { ...current, label: "Current view" }])}
          className="min-h-9 rounded-full border border-accent/50 px-3 text-xs font-semibold text-accent hover:bg-accent/10 disabled:opacity-40"
        >
          ⊕ Add current view
        </button>
        <button
          type="button"
          disabled={scenarios.length >= MAX_SCENARIOS}
          onClick={() => set([...scenarios, { ...scenarios[scenarios.length - 1], label: undefined }])}
          className="min-h-9 rounded-full border border-border px-3 text-xs font-semibold text-muted hover:text-text disabled:opacity-40"
        >
          + Add scenario
        </button>
      </div>

      {result.status === "error" && (
        <Card role="alert" className="text-sm">
          <p className="font-semibold">Couldn&apos;t compare these scenarios</p>
          <p className="mt-1 text-muted">{result.message}</p>
        </Card>
      )}

      <div className="-mx-1 flex snap-x gap-4 overflow-x-auto px-1 pb-2 md:grid md:overflow-visible" style={{ gridTemplateColumns: `repeat(${scenarios.length}, minmax(0, 1fr))` }}>
        {scenarios.map((s, i) => (
          <Card key={i} className="w-[85%] shrink-0 snap-start space-y-4 sm:w-[320px] md:w-auto">
            <ScenarioEditor
              key={`${i}-${s.days}`}
              s={s}
              index={i}
              canRemove={scenarios.length > 2}
              onChange={(ns) => set(scenarios.map((x, k) => (k === i ? ns : x)))}
              onRemove={() => set(scenarios.filter((_, k) => k !== i))}
            />
            {results ? (
              <ResultBlock r={results[i]} best={best[i]} onOpen={() => onOpen(s)} mode={mode} />
            ) : (
              <div className="h-64 animate-pulse rounded-xl bg-bg/40" aria-hidden />
            )}
          </Card>
        ))}
      </div>
      <p className="text-xs text-muted">★ best marks the strongest value in each row. Links to this comparison include all scenarios.</p>
    </section>
  );
});
