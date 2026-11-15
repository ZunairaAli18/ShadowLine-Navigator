"use client";

import { memo, useEffect, useId, useState } from "react";

import { Collapse } from "@/components/fx/Collapse";
import { SitePicker } from "@/components/navigator/SitePicker";
import { floorToHour, MAX_DAYS, MAX_EARTH_MARGIN, MAX_STEP, MIN_DAYS, MIN_STEP, STEPS, type NavMode, type NavState } from "@/lib/navState";

type Props = {
  state: NavState;
  mode: NavMode;
  onMode: (m: NavMode) => void;
  onChange: (patch: Partial<NavState>) => void;
  shareUrl: () => string;
};

/** Number box that commits on blur/Enter, resets on invalid input, and follows outside changes. */
function NumberField({ id, label, value, min, max, step, onCommit, width = "w-20", describedBy }: { id: string; label: string; value: number; min: number; max: number; step: number; onCommit: (v: number) => void; width?: string; describedBy?: string }) {
  const [text, setText] = useState(String(value));
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setText(String(value));
  }
  const commit = (t: string) => {
    const n = Number(t);
    if (t.trim() !== "" && Number.isFinite(n) && n >= min && n <= max) onCommit(n);
    else setText(String(value));
  };
  return (
    <>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        step={step}
        value={text}
        aria-describedby={describedBy}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && commit((e.target as HTMLInputElement).value)}
        className={`${width} rounded-lg border border-border bg-surface-solid px-3 py-1.5 font-mono text-sm`}
      />
    </>
  );
}

const STEP_LABEL: Record<number, string> = { 30: "30 min", 60: "1 h", 180: "3 h" };
const DAY_PRESETS = [7, 14, 30];

const dateStr = (d: Date) => d.toISOString().slice(0, 10);
const timeStr = (d: Date) => d.toISOString().slice(11, 16);

function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
  render,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  render: (v: T) => string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-border bg-bg/40 p-0.5">
      {options.map((o) => (
        <button
          key={String(o)}
          type="button"
          role="radio"
          aria-checked={value === o}
          onClick={() => onChange(o)}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
            value === o ? "bg-accent text-bg" : "text-muted hover:text-text"
          }`}
        >
          {render(o)}
        </button>
      ))}
    </div>
  );
}

/** Memoised: scrubbing the timeline re-renders the navigator but not the controls. */
export const ControlBar = memo(function ControlBar({ state, mode, onMode, onChange, shareUrl }: Props) {
  const id = useId();
  const [daysText, setDaysText] = useState(String(state.days));
  const [copied, setCopied] = useState(false);

  // keep the number box in sync when days change elsewhere (chips, URL)
  useEffect(() => {
    const t = window.setTimeout(() => setDaysText(String(state.days)), 0);
    return () => window.clearTimeout(t);
  }, [state.days]);

  const setStart = (date: string, time: string) => {
    const d = new Date(`${date}T${time || "00:00"}:00Z`);
    if (!Number.isNaN(d.getTime())) onChange({ start: d, t: d });
  };

  const commitDays = (text: string) => {
    const n = Math.round(Number(text));
    if (Number.isFinite(n) && n >= MIN_DAYS && n <= MAX_DAYS) onChange({ days: n });
    else setDaysText(String(state.days));
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copy this link:", shareUrl());
    }
  };

  return (
    <div className="glass rounded-2xl p-4 sm:p-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_auto_auto] lg:items-start">
        <SitePicker value={state.location} onChange={(location) => onChange({ location })} />

        {/* start (UTC) */}
        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="hud mb-2">
            Start <span className="text-accent">UTC</span>
          </legend>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={`${id}-date`} className="sr-only">
              Start date (UTC)
            </label>
            <input
              id={`${id}-date`}
              type="date"
              value={dateStr(state.start)}
              onChange={(e) => setStart(e.target.value, timeStr(state.start))}
              className="rounded-lg border border-border bg-surface-solid px-3 py-2 font-mono text-sm [color-scheme:dark]"
            />
            <label htmlFor={`${id}-time`} className="sr-only">
              Start time (UTC)
            </label>
            <input
              id={`${id}-time`}
              type="time"
              step={3600}
              value={timeStr(state.start)}
              onChange={(e) => setStart(dateStr(state.start), e.target.value)}
              className="rounded-lg border border-border bg-surface-solid px-3 py-2 font-mono text-sm [color-scheme:dark]"
            />
            <button
              type="button"
              onClick={() => {
                const now = floorToHour(new Date());
                onChange({ start: now, t: now });
              }}
              className="rounded-lg border border-border px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted hover:border-accent/50 hover:text-accent"
            >
              Now
            </button>
          </div>
        </fieldset>

        {/* mission length */}
        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="hud mb-2">Mission length</legend>
          <div className="flex flex-wrap items-center gap-2">
            {DAY_PRESETS.map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={state.days === d}
                onClick={() => onChange({ days: d })}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  state.days === d ? "border-accent bg-accent/15 text-accent" : "border-border text-muted hover:text-text"
                }`}
              >
                {d} d
              </button>
            ))}
            <label htmlFor={`${id}-days`} className="sr-only">
              Mission length in days (1 to 60)
            </label>
            <input
              id={`${id}-days`}
              type="number"
              min={MIN_DAYS}
              max={MAX_DAYS}
              value={daysText}
              onChange={(e) => setDaysText(e.target.value)}
              onBlur={(e) => commitDays(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && commitDays((e.target as HTMLInputElement).value)}
              className="w-20 rounded-lg border border-border bg-surface-solid px-3 py-1.5 font-mono text-sm"
            />
            <span className="text-xs text-muted">days</span>
          </div>
        </fieldset>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border pt-4">
        <div className="flex items-center gap-3">
          <span className="hud">Step</span>
          <Segmented label="Time step" options={STEPS} value={state.step as (typeof STEPS)[number]} onChange={(step) => onChange({ step })} render={(v) => STEP_LABEL[v]} />
        </div>
        <div className="flex items-center gap-3">
          <span className="hud">Horizon</span>
          <Segmented
            label="Horizon model"
            options={["auto", "flat"] as const}
            value={state.terrain}
            onChange={(terrain) => onChange({ terrain })}
            render={(v) => (v === "auto" ? "Real terrain" : "Flat horizon")}
          />
        </div>
        {state.location.kind === "custom" && (
          <p className="text-xs text-risky" role="note">
            <span aria-hidden>▲ </span>Flat horizon: terrain data is available for curated sites.
          </p>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <Segmented
            label="Detail level"
            options={["simple", "expert"] as const}
            value={mode}
            onChange={onMode}
            render={(v) => (v === "simple" ? "Simple" : "Expert")}
          />
          <button
            type="button"
            onClick={copy}
            className="min-h-8 rounded-full border border-border px-4 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-accent/50 hover:text-accent"
            aria-live="polite"
          >
            {copied ? "✓ Link copied" : "Copy link"}
          </button>
        </div>
      </div>

      {/* Expert-only controls */}
      <Collapse show={mode === "expert"}>
        <div className="mt-4 flex flex-wrap items-start gap-x-8 gap-y-3 border-t border-border pt-4">
          <div className="flex flex-col gap-1.5">
            <span className="hud">Earth margin</span>
            <div className="flex items-center gap-2">
              <NumberField id={`${id}-em`} label="Earth margin in degrees (0 to 10)" value={state.earthMargin} min={0} max={MAX_EARTH_MARGIN} step={0.5} onCommit={(v) => onChange({ earthMargin: Math.round(v * 10) / 10 })} describedBy={`${id}-em-help`} />
              <span className="text-xs text-muted">°</span>
            </div>
            <p id={`${id}-em-help`} className="max-w-64 text-[11px] text-muted">
              Extra clearance above the skyline for the antenna. Earth counts as visible only this far above it.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="hud">Custom step</span>
            <div className="flex items-center gap-2">
              <NumberField id={`${id}-step`} label="Time step in minutes (5 to 1440)" value={state.step} min={MIN_STEP} max={MAX_STEP} step={5} onCommit={(v) => onChange({ step: Math.round(v) })} width="w-24" />
              <span className="text-xs text-muted">min</span>
            </div>
            <p className="max-w-64 text-[11px] text-muted">Smaller steps give finer timing (up to 20,000 points per window).</p>
          </div>
        </div>
      </Collapse>
    </div>
  );
});
