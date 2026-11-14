"use client";

import { memo, useEffect, useId, useState } from "react";

import { SitePicker } from "@/components/navigator/SitePicker";
import { floorToHour, MAX_DAYS, MIN_DAYS, STEPS, type NavState } from "@/lib/navState";

type Props = {
  state: NavState;
  onChange: (patch: Partial<NavState>) => void;
  shareUrl: () => string;
};

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
export const ControlBar = memo(function ControlBar({ state, onChange, shareUrl }: Props) {
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
        <button
          type="button"
          onClick={copy}
          className="ml-auto rounded-full border border-border px-4 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-accent/50 hover:text-accent"
          aria-live="polite"
        >
          {copied ? "✓ Link copied" : "Copy link"}
        </button>
      </div>
    </div>
  );
});
