"use client";

import { useEffect, useState } from "react";

import { CountUp } from "@/components/fx/CountUp";
import { Reveal } from "@/components/fx/Reveal";
import { LiveError, LiveSkeleton } from "@/components/learn/LiveState";
import { NumbersLink } from "@/components/learn/NumbersLink";
import { Card, Pill, VerdictBadge } from "@/components/ui";
import { ApiError, compare, type ScenarioResult } from "@/lib/api";
import { LUNAR_DAY_DAYS } from "@/lib/compareUrl";
import { isoUtc } from "@/lib/navState";
import { useNowHour } from "@/lib/useNowHour";

const SITE = "shackleton-ridge";
const DAYS = 14;
const CANDIDATES = 4; // this lunar day and the next three

type Pick = { offset: number; start: Date; real: ScenarioResult; flat: ScenarioResult };

/** How different are the two answers? A changed verdict counts most. */
function difference(a: ScenarioResult, b: ScenarioResult): number {
  const m = a.metrics;
  const n = b.metrics;
  return (m.verdict !== n.verdict ? 100 : 0) + Math.abs(m.earth_pct - n.earth_pct) + Math.abs(m.sun_pct - n.sun_pct) + Math.abs(m.both_pct - n.both_pct);
}

const fmtDay = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const hrs = (h: number, t: boolean) => `${t ? "≥ " : ""}${h >= 48 ? `${(h / 24).toFixed(1)} d` : `${h.toFixed(0)} h`}`;

function ResultCard({ r, title, tone }: { r: ScenarioResult; title: string; tone: "accent" | "default" }) {
  const m = r.metrics;
  return (
    <Card className="h-full space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg">{title}</h3>
        <Pill tone={tone}>{tone === "accent" ? "▲ LOLA terrain" : "Flat 0° horizon"}</Pill>
      </div>
      <VerdictBadge verdict={m.verdict} />
      <dl className="grid grid-cols-2 gap-2">
        {[
          { k: "☀ Sun", v: m.sun_pct, c: "text-sun" },
          { k: "◉ Earth", v: m.earth_pct, c: "text-earth" },
          { k: "◆ Both", v: m.both_pct, c: "text-accent" },
        ].map((x) => (
          <div key={x.k} className="rounded-xl border border-border p-3">
            <dt className="hud">{x.k}</dt>
            <dd className={`mt-1 font-mono text-xl ${x.c}`}>
              <CountUp value={x.v} decimals={1} suffix="%" />
            </dd>
          </div>
        ))}
        <div className="rounded-xl border border-border p-3">
          <dt className="hud">Longest dark</dt>
          <dd className="mt-1 font-mono text-xl text-text">{hrs(m.longest_dark_hours, m.longest_dark_truncated)}</dd>
        </div>
      </dl>
      <ul className="space-y-0.5 text-xs text-muted">
        {m.verdict_reasons.map((x) => (
          <li key={x}>· {x}</li>
        ))}
      </ul>
    </Card>
  );
}

function Live({ now }: { now: Date }) {
  const [state, setState] = useState<{ kind: "loading" } | { kind: "ok"; pick: Pick } | { kind: "error"; message: string }>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const nowMs = now.getTime();

  useEffect(() => {
    const ctrl = new AbortController();
    const starts = Array.from({ length: CANDIDATES }, (_, k) => new Date(nowMs + Math.round(k * LUNAR_DAY_DAYS * 24) * 3_600_000));
    Promise.all(
      starts.map((s) =>
        compare(
          {
            scenarios: (["auto", "flat"] as const).map((t) => ({ site_id: SITE, start: isoUtc(s), days: DAYS, terrain_mode: t })),
          },
          { signal: ctrl.signal },
        ),
      ),
    )
      .then((all) => {
        let best: Pick | null = null;
        all.forEach((res, k) => {
          const [real, flat] = res.results;
          const cand = { offset: k, start: starts[k], real, flat };
          if (!best || difference(real, flat) > difference(best.real, best.flat)) best = cand;
        });
        if (best) setState({ kind: "ok", pick: best });
      })
      .catch((e: unknown) => {
        if ((e as Error)?.name === "AbortError") return;
        setState({ kind: "error", message: e instanceof ApiError ? e.message : "Unexpected error." });
      });
    return () => ctrl.abort();
  }, [nowMs, attempt]);

  if (state.kind === "error")
    return (
      <LiveError
        message={state.message}
        onRetry={() => {
          setState({ kind: "loading" });
          setAttempt((a) => a + 1);
        }}
      />
    );
  if (state.kind === "loading") return <LiveSkeleton className="h-80" label="Comparing flat ground with real terrain…" />;

  const { pick } = state;
  const end = new Date(pick.start.getTime() + DAYS * 86_400_000);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Shackleton ridge, {fmtDay(pick.start)} – {fmtDay(end)} ({DAYS} days).{" "}
        {pick.offset === 0
          ? "This is the current window, the one with the biggest difference among the next four lunar days."
          : `We checked this lunar day and the next three; this window (${pick.offset} lunar day${pick.offset > 1 ? "s" : ""} from now) shows the biggest difference.`}
      </p>
      <NumbersLink site={SITE} start={pick.start} days={DAYS} />
      <div className="grid gap-4 md:grid-cols-2">
        <Reveal>
          <ResultCard r={pick.flat} title="If the ground were flat" tone="default" />
        </Reveal>
        <Reveal delay={0.1}>
          <ResultCard r={pick.real} title="With the real terrain" tone="accent" />
        </Reveal>
      </div>
    </div>
  );
}

export function FlatVsTerrain() {
  const now = useNowHour();
  return <div className="mt-10">{now ? <Live now={now} /> : <LiveSkeleton className="h-80" label="Comparing flat ground with real terrain…" />}</div>;
}
