"use client";

import { AnimatePresence, motion } from "motion/react";
import { memo, useId } from "react";

import { CountUp } from "@/components/fx/CountUp";
import { Card, Pill, VerdictBadge } from "@/components/ui";
import type { Metrics } from "@/lib/api";
import { formatDuration, type Countdown, type SelectedState } from "@/lib/countdowns";
import { useReducedMotionPref } from "@/lib/useCapable";

const fmtUtc = (ms: number) => `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC`;

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
        className="glass pointer-events-none absolute right-0 top-7 z-20 w-56 rounded-lg px-3 py-2 text-xs normal-case leading-relaxed tracking-normal text-text opacity-0 transition-opacity group-hover/tip:opacity-100 group-focus-within/tip:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------- selected-time parts (re-render while scrubbing)

function CountdownCard({ label, icon, cd, tone }: { label: string; icon: string; cd: Countdown; tone: "sun" | "earth" }) {
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
          <p className="mt-0.5 font-mono text-[11px] text-lunar-500">{fmtUtc(cd.time)}</p>
        </>
      ) : (
        <p className="mt-1.5 text-sm text-muted">Not in this window</p>
      )}
    </div>
  );
}

function StatusChips({ s }: { s: SelectedState }) {
  const pct = Math.round(s.sunFraction * 100);
  return (
    <div className="flex flex-wrap gap-2" aria-live="off">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
          s.sunUp ? "border-sun/50 bg-sun/10 text-sun" : "border-border text-muted"
        }`}
      >
        <span aria-hidden>{s.sunUp ? "☀" : "☾"}</span>
        {s.sunUp ? `Sun up · ${pct}% of disk` : pct > 0 ? `Sun down · ${pct}% of disk` : "Sun down"}
      </span>
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
          s.earthVisible ? "border-earth/50 bg-earth/10 text-earth" : "border-border text-muted"
        }`}
      >
        <span aria-hidden>{s.earthVisible ? "◉" : "◌"}</span>
        {s.earthVisible ? "Earth in view" : "Earth out of view"}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------- mission parts (memoised: change only with new data)

function Bar({ label, value, tone, tip }: { label: string; value: number; tone: "sun" | "earth" | "accent"; tip: string }) {
  const reduced = useReducedMotionPref();
  const color = tone === "sun" ? "bg-sun" : tone === "earth" ? "bg-earth" : "bg-accent";
  const text = tone === "sun" ? "text-sun" : tone === "earth" ? "text-earth" : "text-accent";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1.5 text-muted">
          {label} <InfoTip text={tip} />
        </span>
        <CountUp value={value} decimals={1} suffix="%" className={`font-mono text-sm ${text}`} duration={0.9} />
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

const hoursText = (h: number, truncated: boolean) => {
  const v = h >= 48 ? `${(h / 24).toFixed(1)} d` : `${h.toFixed(h < 10 ? 1 : 0)} h`;
  return truncated ? `at least ${v}` : v;
};

const MissionSummary = memo(function MissionSummary({ m, terrain }: { m: Metrics; terrain: "lola" | "flat" }) {
  const reduced = useReducedMotionPref();
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
            <VerdictBadge verdict={m.verdict} />
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
        <Bar label="Sunlight" value={m.sun_pct} tone="sun" tip="Share of the window with the centre of the Sun above the real skyline: when solar panels can make power." />
        <Bar label="Earth in view" value={m.earth_pct} tone="earth" tip="Share of the window with Earth above the skyline: when you can talk straight to Earth without a relay satellite." />
        <Bar label="Both" value={m.both_pct} tone="accent" tip="Share of the window with sunlight AND Earth in view at the same time: full operations (power plus comms)." />
        <dl className="grid grid-cols-2 gap-2">
          <Stat label="Longest dark" value={hoursText(m.longest_dark_hours, m.longest_dark_truncated)} tip="The longest stretch with the Sun down. Batteries and heaters must survive it. 'At least' means it runs past the window edge." />
          <Stat label="Longest no Earth" value={hoursText(m.longest_no_earth_hours, m.longest_no_earth_truncated)} tip="The longest stretch without Earth in view: how long the lander would be out of direct contact." />
          <Stat label="Power index" value={m.power_index.toFixed(2)} tip="Average fraction of the Sun's disk visible over the window (0 to 1). Assumes panels that face the Sun, as polar landers use." />
          <Stat label="Sun el max / mean" value={`${m.max_sun_el.toFixed(1)}° / ${m.mean_sun_el.toFixed(1)}°`} tip="Highest and average Sun elevation above the flat horizon. Near the pole the Sun stays within a couple of degrees." />
        </dl>
      </section>
    </>
  );
});

// ---------------------------------------------------------------- panel

export function MetricsPanel({
  metrics,
  selected,
  terrain,
}: {
  metrics: Metrics | null;
  selected: SelectedState | null;
  terrain: "lola" | "flat";
}) {
  return (
    <Card className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg">Metrics</h2>
        {selected && <span className="font-mono text-[11px] text-lunar-400">{fmtUtc(selected.timeMs)}</span>}
      </div>

      {selected && metrics ? (
        <>
          <section aria-labelledby="now-h" className="space-y-3">
            <h3 id="now-h" className="hud">
              At selected time
            </h3>
            <StatusChips s={selected} />
            <div className="grid grid-cols-2 gap-2">
              <CountdownCard label="Next sunset" icon="☀↓" cd={selected.countdowns.sunset} tone="sun" />
              <CountdownCard label="Next sunrise" icon="☀↑" cd={selected.countdowns.sunrise} tone="sun" />
              <CountdownCard label="Next Earthset" icon="◉↓" cd={selected.countdowns.earthset} tone="earth" />
              <CountdownCard label="Next Earthrise" icon="◉↑" cd={selected.countdowns.earthrise} tone="earth" />
            </div>
          </section>
          <MissionSummary m={metrics} terrain={terrain} />
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
