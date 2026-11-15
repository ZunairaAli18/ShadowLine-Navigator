"use client";

import { AnimatePresence, motion } from "motion/react";
import { memo, useId, useState } from "react";

import { CountUp } from "@/components/fx/CountUp";
import { Card, Pill, VerdictBadge } from "@/components/ui";
import type { Metrics } from "@/lib/api";
import { formatDuration, type Countdown, type SelectedState } from "@/lib/countdowns";
import type { NavMode } from "@/lib/navState";
import { useReducedMotionPref } from "@/lib/useCapable";
import { plainDuration, verdictSentence } from "@/lib/verdictSentence";

const fmtUtc = (ms: number) => `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC`;
const fmtDay = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const sgn = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}°`;

/** Extra body details at the selected time (for plain-English wording and Expert margins). */
export type BodyDetail = { sunEl: number; sunMargin: number; earthEl: number; earthMargin: number };

/** "?" with a plain-English explanation on hover/focus. */
function InfoTip({ text }: { text: string }) {
  const id = useId();
  return (
    <span className="group/tip relative inline-flex">
      <button
        type="button"
        aria-describedby={id}
        className="grid h-6 w-6 place-items-center rounded-full border border-border text-[10px] text-lunar-400 hover:border-accent/50 hover:text-accent focus-visible:text-accent"
      >
        ?<span className="sr-only">What does this mean?</span>
      </button>
      <span
        id={id}
        role="tooltip"
        className="glass pointer-events-none absolute right-0 top-7 z-20 w-56 rounded-lg max-sm:fixed max-sm:inset-x-4 max-sm:bottom-4 max-sm:top-auto max-sm:z-50 max-sm:w-auto px-3 py-2 text-xs normal-case leading-relaxed tracking-normal text-text opacity-0 transition-opacity group-hover/tip:opacity-100 group-focus-within/tip:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------- selected-time parts (re-render while scrubbing)

function CountdownCard({ label, icon, cd, tone, mode }: { label: string; icon: string; cd: Countdown; tone: "sun" | "earth"; mode: NavMode }) {
  return (
    <div className="rounded-xl border border-border bg-bg/30 p-3">
      <p className="hud flex items-center gap-1.5">
        <span aria-hidden className={tone === "sun" ? "text-sun" : "text-earth"}>
          {icon}
        </span>
        {label}
      </p>
      {cd ? (
        <>
          <p className="mt-1.5 font-mono text-lg tabular-nums text-text">{formatDuration(cd.hoursFromSelected)}</p>
          <p className="mt-0.5 font-mono text-[11px] text-lunar-500">{mode === "expert" ? fmtUtc(cd.time) : `on ${fmtDay(cd.time)}`}</p>
        </>
      ) : (
        <p className="mt-1.5 text-sm text-muted">Not in this window</p>
      )}
    </div>
  );
}

function sunWords(s: SelectedState, d: BodyDetail | null): { icon: string; text: string; on: boolean } {
  const f = s.sunFraction;
  if (f >= 0.995) return { icon: "☀", text: "Sun up", on: true };
  if (f > 0.005) return { icon: "◐", text: "Sun half hidden behind the ridge", on: s.sunUp };
  if (d && d.sunEl > 0) return { icon: "☾", text: "Sun hidden behind the ridge", on: false };
  return { icon: "☾", text: "Sun below the horizon", on: false };
}

function earthWords(s: SelectedState, d: BodyDetail | null): { icon: string; text: string } {
  if (s.earthVisible) return { icon: "◉", text: "Earth in view: you can talk to Earth" };
  if (d && d.earthEl > 0) return { icon: "◌", text: "Earth hidden behind the hills" };
  return { icon: "◌", text: "Earth below the horizon" };
}

function StatusChips({ s, d, mode }: { s: SelectedState; d: BodyDetail | null; mode: NavMode }) {
  const pct = Math.round(s.sunFraction * 100);
  const sw = sunWords(s, d);
  const ew = earthWords(s, d);
  const sunText =
    mode === "expert"
      ? `${s.sunUp ? "Sun up" : "Sun down"} · ${(s.sunFraction * 100).toFixed(1)}% of disk${d ? ` · margin ${sgn(d.sunMargin)}` : ""}`
      : sw.text;
  const earthText =
    mode === "expert" ? `${s.earthVisible ? "Earth in view" : "Earth hidden"}${d ? ` · margin ${sgn(d.earthMargin)}` : ""}` : ew.text;
  return (
    <div className="flex flex-wrap gap-2" aria-live="off">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
          pct > 0 && (sw.on || s.sunUp) ? "border-sun/50 bg-sun/10 text-sun" : "border-border text-muted"
        }`}
      >
        <span aria-hidden>{sw.icon}</span>
        {sunText}
      </span>
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
          s.earthVisible ? "border-earth/50 bg-earth/10 text-earth" : "border-border text-muted"
        }`}
      >
        <span aria-hidden>{ew.icon}</span>
        {earthText}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------- mission parts (memoised: change only with new data/mode)

function Bar({ label, value, tone, tip, decimals }: { label: string; value: number; tone: "sun" | "earth" | "accent"; tip: string; decimals: number }) {
  const reduced = useReducedMotionPref();
  const color = tone === "sun" ? "bg-sun" : tone === "earth" ? "bg-earth" : "bg-accent";
  const text = tone === "sun" ? "text-sun" : tone === "earth" ? "text-earth" : "text-accent";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1.5 text-muted">
          {label} <InfoTip text={tip} />
        </span>
        <CountUp value={decimals ? value : Math.round(value)} decimals={decimals} suffix="%" className={`font-mono text-sm ${text}`} duration={0.9} />
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-bg/60" role="presentation">
        <motion.div
          className={`h-full rounded-full ${color}`}
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(0, Math.min(100, value))}%` }}
          transition={{ duration: reduced ? 0 : 0.9, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </div>
  );
}

function Stat({ label, value, tip }: { label: string; value: string; tip: string }) {
  return (
    <div className="rounded-xl border border-border bg-bg/30 p-3">
      <dt className="hud flex items-center justify-between gap-2">
        {label} <InfoTip text={tip} />
      </dt>
      <dd className="mt-1.5 font-mono text-base tabular-nums text-text">{value}</dd>
    </div>
  );
}

const expertHours = (h: number, truncated: boolean) => `${truncated ? "≥ " : ""}${h.toFixed(1)} h`;
const simpleHours = (h: number, truncated: boolean) => (h === 0 ? "none" : `${truncated ? "at least " : ""}${plainDuration(h)}`);

function WhyPopover({ m }: { m: Metrics }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const why = verdictSentence(m);
  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="min-h-7 rounded-full border border-border px-3 text-xs font-semibold text-accent hover:border-accent/50"
      >
        Why?
      </button>
      {open && (
        <div id={id} className="glass absolute left-0 top-9 z-20 w-64 rounded-xl px-3 py-2.5 text-sm leading-relaxed text-text" role="note">
          <p>{why.lead}</p>
          {why.more.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 text-muted">
              {why.more.map((r) => (
                <li key={r}>· {r}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

const MissionSummary = memo(function MissionSummary({ m, terrain, mode }: { m: Metrics; terrain: "lola" | "flat"; mode: NavMode }) {
  const reduced = useReducedMotionPref();
  const expert = mode === "expert";
  const dec = expert ? 1 : 0;
  return (
    <>
      <section aria-labelledby="verdict-h" className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 id="verdict-h" className="hud">
            Verdict · whole window
          </h3>
          <Pill tone={terrain === "lola" ? "accent" : "default"}>{terrain === "lola" ? "▲ Real LOLA terrain" : "Flat horizon"}</Pill>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${m.verdict}|${m.verdict_reasons.join("|")}`}
            initial={{ opacity: 0, y: reduced ? 0 : 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.25 }}
            className="space-y-2"
          >
            <div className="flex items-center gap-2">
              <VerdictBadge verdict={m.verdict} />
              {!expert && <WhyPopover m={m} />}
            </div>
            <ul className="space-y-1 text-sm text-muted">
              {m.verdict_reasons.map((r) => (
                <li key={r}>· {r}</li>
              ))}
            </ul>
          </motion.div>
        </AnimatePresence>
      </section>

      <section aria-labelledby="summary-h" className="space-y-3">
        <h3 id="summary-h" className="hud">
          Mission summary
        </h3>
        <Bar label="Sunlight" value={m.sun_pct} decimals={dec} tone="sun" tip="Share of the window with the centre of the Sun above the real skyline: when solar panels can make power." />
        <Bar label="Earth in view" value={m.earth_pct} decimals={dec} tone="earth" tip="Share of the window with Earth above the skyline: when you can talk straight to Earth without a relay satellite." />
        <Bar label="Both" value={m.both_pct} decimals={dec} tone="accent" tip="Share of the window with sunlight AND Earth in view at the same time: full operations (power plus comms)." />
        <dl className="grid grid-cols-2 gap-2">
          <Stat
            label="Longest dark"
            value={expert ? expertHours(m.longest_dark_hours, m.longest_dark_truncated) : simpleHours(m.longest_dark_hours, m.longest_dark_truncated)}
            tip="The longest stretch with the Sun down. Batteries and heaters must survive it. 'At least' (≥) means it runs past the window edge."
          />
          {expert && (
            <>
              <Stat label="Longest no Earth" value={expertHours(m.longest_no_earth_hours, m.longest_no_earth_truncated)} tip="The longest stretch without Earth in view: how long the lander would be out of direct contact." />
              <Stat label="Power index" value={m.power_index.toFixed(3)} tip="Average fraction of the Sun's disk visible over the window (0 to 1). Assumes panels that face the Sun, as polar landers use." />
              <Stat label="Sun el max / mean" value={`${m.max_sun_el.toFixed(2)}° / ${m.mean_sun_el.toFixed(2)}°`} tip="Highest and average Sun elevation above the flat horizon. Near the pole the Sun stays within a couple of degrees." />
            </>
          )}
        </dl>
      </section>
    </>
  );
});

// ---------------------------------------------------------------- panel

export function MetricsPanel({
  metrics,
  selected,
  detail,
  terrain,
  mode,
}: {
  metrics: Metrics | null;
  selected: SelectedState | null;
  detail: BodyDetail | null;
  terrain: "lola" | "flat";
  mode: NavMode;
}) {
  return (
    <Card className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg">Metrics</h2>
        {selected && <span className="font-mono text-[11px] text-lunar-400">{mode === "expert" ? fmtUtc(selected.timeMs) : fmtDay(selected.timeMs)}</span>}
      </div>

      {selected && metrics ? (
        <>
          <section aria-labelledby="now-h" className="space-y-3">
            <h3 id="now-h" className="hud">
              At selected time
            </h3>
            <StatusChips s={selected} d={detail} mode={mode} />
            <div className="grid grid-cols-2 gap-2">
              <CountdownCard label="Next sunset" icon="☀↓" cd={selected.countdowns.sunset} tone="sun" mode={mode} />
              <CountdownCard label="Next sunrise" icon="☀↑" cd={selected.countdowns.sunrise} tone="sun" mode={mode} />
              <CountdownCard label="Next Earthset" icon="◉↓" cd={selected.countdowns.earthset} tone="earth" mode={mode} />
              <CountdownCard label="Next Earthrise" icon="◉↑" cd={selected.countdowns.earthrise} tone="earth" mode={mode} />
            </div>
          </section>
          <MissionSummary m={metrics} terrain={terrain} mode={mode} />
        </>
      ) : (
        <div className="space-y-3" aria-hidden>
          <div className="h-8 animate-pulse rounded-full bg-bg/40" />
          <div className="grid grid-cols-2 gap-2">
            {[0, 1, 2, 3].map((k) => (
              <div key={k} className="h-20 animate-pulse rounded-xl bg-bg/40" />
            ))}
          </div>
          <div className="h-40 animate-pulse rounded-xl bg-bg/40" />
        </div>
      )}
    </Card>
  );
}
