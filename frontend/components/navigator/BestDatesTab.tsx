"use client";

import { memo, useEffect, useMemo, useState } from "react";

import { SitePicker } from "@/components/navigator/SitePicker";
import { UtcDateTime } from "@/components/navigator/UtcDateTime";
import { Button, Card, VerdictBadge } from "@/components/ui";
import { ApiError, bestWindows, type BestWindowsResponse } from "@/lib/api";
import { isoUtc, MAX_DAYS, MIN_DAYS, normalizeLon, validLat, type ExtraKey, type Location, type TerrainChoice } from "@/lib/navState";

const DEBOUNCE_MS = 400;
const MAX_RANGE_DAYS = 180;
const DAY = 86_400_000;
const TOP = 8;

type Extras = Partial<Record<ExtraKey, string>>;
type Props = {
  extras: Extras;
  current: { location: Location; start: Date; days: number; terrain: TerrainChoice };
  onChangeExtras: (patch: Extras) => void;
  onLoad: (w: { location: Location; start: Date; days: number; terrain: TerrainChoice }) => void;
};

type Inputs = { location: Location; from: Date; to: Date; days: number; terrain: TerrainChoice; gapDays: number };

const locToStr = (l: Location) => (l.kind === "site" ? l.siteId : `${l.lat}:${l.lon}`);
function strToLoc(s: string | undefined): Location | null {
  if (!s) return null;
  if (s.includes(":")) {
    const [a, b] = s.split(":");
    const lat = Number(a);
    const lon = normalizeLon(Number(b));
    return validLat(lat) && lon !== null ? { kind: "custom", lat, lon } : null;
  }
  return /^[a-z0-9-]+$/i.test(s) ? { kind: "site", siteId: s } : null;
}
const parseDate = (s: string | undefined) => {
  if (!s) return null;
  const d = new Date(s.length === 10 ? `${s}T00:00:00Z` : s);
  return Number.isNaN(d.getTime()) ? null : d;
};
const clampInt = (s: string | undefined, lo: number, hi: number) => {
  const n = Math.round(Number(s));
  return s && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null;
};

/** Inputs from the URL (b* params) with defaults from the current navigator view. */
function readInputs(x: Extras, cur: Props["current"]): Inputs {
  const from = parseDate(x.bfrom) ?? cur.start;
  const days = clampInt(x.bdays, MIN_DAYS, MAX_DAYS) ?? cur.days;
  return {
    location: strToLoc(x.bsite) ?? cur.location,
    from,
    to: parseDate(x.bto) ?? new Date(from.getTime() + 90 * DAY),
    days,
    terrain: x.bterrain === "flat" ? "flat" : x.bterrain === "auto" ? "auto" : cur.terrain,
    gapDays: clampInt(x.bgap, 0, MAX_RANGE_DAYS) ?? days,
  };
}

const fmtUtc = (s: string) => `${s.slice(0, 16).replace("T", " ")}`;
const fmtDay = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

type Res = { status: "idle" | "loading" } | { status: "ok"; data: BestWindowsResponse } | { status: "error"; message: string };

export const BestDatesTab = memo(function BestDatesTab({ extras, current, onChangeExtras, onLoad }: Props) {
  const inp = readInputs(extras, current);
  const rangeDays = (inp.to.getTime() - inp.from.getTime()) / DAY;
  const inputError =
    rangeDays < 0 ? "'To' must be after 'From'." : rangeDays > MAX_RANGE_DAYS ? `The range can be at most ${MAX_RANGE_DAYS} days (it is ${Math.round(rangeDays)}).` : null;
  const key = JSON.stringify({
    l: locToStr(inp.location),
    f: inp.from.getTime(),
    t: inp.to.getTime(),
    d: inp.days,
    tr: inp.terrain,
    g: inp.gapDays,
    e: inputError,
  });
  const [res, setRes] = useState<Res>({ status: "idle" });
  const [daysText, setDaysText] = useState(String(inp.days));
  const [gapText, setGapText] = useState(String(inp.gapDays));
  // Refresh the text boxes when the values change from outside (URL, navigator), "previous value in state" pattern.
  const [seenDays, setSeenDays] = useState(inp.days);
  const [seenGap, setSeenGap] = useState(inp.gapDays);
  if (seenDays !== inp.days) {
    setSeenDays(inp.days);
    setDaysText(String(inp.days));
  }
  if (seenGap !== inp.gapDays) {
    setSeenGap(inp.gapDays);
    setGapText(String(inp.gapDays));
  }

  useEffect(() => {
    if (inputError) return;
    const ctrl = new AbortController();
    const q = JSON.parse(key) as { l: string; f: number; t: number; d: number; tr: TerrainChoice; g: number };
    const loc = strToLoc(q.l)!;
    const timer = window.setTimeout(async () => {
      setRes({ status: "loading" });
      try {
        const data = await bestWindows(
          {
            ...(loc.kind === "site" ? { site_id: loc.siteId } : { lat: loc.lat, lon: loc.lon }),
            from: new Date(q.f),
            to: new Date(q.t),
            mission_days: q.d,
            terrain_mode: q.tr,
            top: TOP,
            min_separation_hours: q.g * 24,
          },
          { signal: ctrl.signal },
        );
        setRes({ status: "ok", data });
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
        setRes({ status: "error", message: e instanceof ApiError ? e.message : "Unexpected error." });
      }
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [key, inputError]);

  const data = res.status === "ok" ? res.data : null;
  const anyGood = data?.windows.some((w) => w.verdict === "good") ?? false;
  const strip = useMemo(() => {
    if (!data) return [];
    const t0 = new Date(data.range_start).getTime();
    const t1 = new Date(data.range_end).getTime();
    const span = Math.max(1, t1 - t0);
    return data.windows.map((w, k) => {
      const s = new Date(w.start).getTime();
      const e = new Date(w.end).getTime();
      return { k, verdict: w.verdict, left: ((s - t0) / span) * 100, width: Math.max(0.6, ((Math.min(e, t1 + data.mission_days * DAY) - s) / span) * 100) };
    });
  }, [data]);

  const commitInt = (text: string, lo: number, hi: number, key: ExtraKey, reset: (s: string) => void, fallback: number) => {
    const n = Math.round(Number(text));
    if (Number.isFinite(n) && n >= lo && n <= hi) onChangeExtras({ [key]: String(n) });
    else reset(String(fallback));
  };

  const verdictColor = { good: "var(--color-good)", risky: "var(--color-risky)", not_viable: "var(--color-notviable)" } as const;

  return (
    <section aria-labelledby="best-h" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-1">Best dates</p>
          <h2 id="best-h" className="text-2xl">
            When should we land?
          </h2>
        </div>
        <span className="hud" aria-live="polite">
          {res.status === "loading" ? "Searching…" : data ? `${data.candidates_evaluated} start times checked` : ""}
        </span>
      </div>

      <Card className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_auto_auto_auto]">
        <SitePicker value={inp.location} onChange={(l) => onChangeExtras({ bsite: locToStr(l) })} />
        <UtcDateTime label="From" value={inp.from} withTime={false} onChange={(d) => onChangeExtras({ bfrom: isoUtc(d).slice(0, 10) })} />
        <UtcDateTime label="To" value={inp.to} withTime={false} onChange={(d) => onChangeExtras({ bto: isoUtc(d).slice(0, 10) })} />
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="hud">Mission days</span>
            <input
              type="number"
              min={MIN_DAYS}
              max={MAX_DAYS}
              value={daysText}
              onChange={(e) => setDaysText(e.target.value)}
              onBlur={(e) => commitInt(e.target.value, MIN_DAYS, MAX_DAYS, "bdays", setDaysText, inp.days)}
              onKeyDown={(e) => e.key === "Enter" && commitInt((e.target as HTMLInputElement).value, MIN_DAYS, MAX_DAYS, "bdays", setDaysText, inp.days)}
              className="w-20 rounded-lg border border-border bg-surface-solid px-2.5 py-1.5 font-mono text-sm"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="hud">Min gap (d)</span>
            <input
              type="number"
              min={0}
              max={MAX_RANGE_DAYS}
              value={gapText}
              onChange={(e) => setGapText(e.target.value)}
              onBlur={(e) => commitInt(e.target.value, 0, MAX_RANGE_DAYS, "bgap", setGapText, inp.gapDays)}
              onKeyDown={(e) => e.key === "Enter" && commitInt((e.target as HTMLInputElement).value, 0, MAX_RANGE_DAYS, "bgap", setGapText, inp.gapDays)}
              className="w-20 rounded-lg border border-border bg-surface-solid px-2.5 py-1.5 font-mono text-sm"
              aria-describedby="gap-help"
            />
          </label>
          <div role="radiogroup" aria-label="Horizon" className="inline-flex rounded-lg border border-border bg-bg/40 p-0.5">
            {(["auto", "flat"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={inp.terrain === t}
                onClick={() => onChangeExtras({ bterrain: t })}
                className={`rounded-md px-2.5 py-1.5 text-xs font-semibold ${inp.terrain === t ? "bg-accent text-bg" : "text-muted hover:text-text"}`}
              >
                {t === "auto" ? "Real terrain" : "Flat"}
              </button>
            ))}
          </div>
        </div>
        <p id="gap-help" className="text-xs text-muted md:col-span-2 xl:col-span-4">
          Results are at least the gap apart (default: the mission length), so you see distinct options rather than neighbouring hours.
        </p>
      </Card>

      {inputError && (
        <Card role="alert" className="text-sm text-risky">
          {inputError}
        </Card>
      )}
      {res.status === "error" && !inputError && (
        <Card role="alert" className="text-sm">
          <p className="font-semibold">Couldn&apos;t search this range</p>
          <p className="mt-1 text-muted">{res.message}</p>
        </Card>
      )}

      {data && !inputError && (
        <>
          {/* range strip */}
          <Card className="space-y-2">
            <div className="flex justify-between font-mono text-[11px] text-lunar-500">
              <span>{fmtDay(new Date(data.range_start).getTime())}</span>
              <span className="hud">Mission starts across the range</span>
              <span>{fmtDay(new Date(data.range_end).getTime())}</span>
            </div>
            <div className="relative h-12 overflow-hidden rounded-lg bg-bg/50" role="img" aria-label={`${data.windows.length} best windows across the range`}>
              {strip.map((s) => (
                <div
                  key={s.k}
                  className="absolute top-1.5 flex h-9 items-center justify-center overflow-hidden rounded-md border text-[10px] font-semibold"
                  style={{
                    left: `${s.left}%`,
                    width: `${s.width}%`,
                    background: `color-mix(in srgb, ${verdictColor[s.verdict]} 22%, transparent)`,
                    borderColor: verdictColor[s.verdict],
                    color: verdictColor[s.verdict],
                  }}
                  title={`#${s.k + 1} · ${s.verdict.replace("_", " ")}`}
                >
                  #{s.k + 1}
                </div>
              ))}
            </div>
          </Card>

          {!anyGood && (
            <Card className="text-sm text-muted" role="status">
              No good windows in this range. Try a longer range or shorter mission.
            </Card>
          )}

          <ol className="space-y-3">
            {data.windows.map((w, k) => (
              <li key={w.start}>
                <Card className={`flex flex-col gap-3 md:flex-row md:items-center ${w.verdict === "not_viable" ? "opacity-60" : ""}`}>
                  <span className="font-heading text-3xl font-bold text-accent/80 md:w-14">#{k + 1}</span>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="font-mono text-sm text-text">
                      {fmtUtc(w.start)} → {fmtUtc(w.end)} <span className="text-lunar-500">UTC</span>
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <VerdictBadge verdict={w.verdict} />
                      <span className="text-xs text-muted">{w.verdict_reasons.join(" · ")}</span>
                    </div>
                    <p className="font-mono text-xs">
                      <span className="text-sun">☀ {w.sun_pct.toFixed(0)}%</span> · <span className="text-earth">◉ {w.earth_pct.toFixed(0)}%</span> ·{" "}
                      <span className="text-accent">◆ {w.both_pct.toFixed(0)}%</span> · <span className="text-lunar-300">dark {w.longest_dark_hours.toFixed(0)} h</span>
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    arrow
                    onClick={() => onLoad({ location: inp.location, start: new Date(w.start), days: data.mission_days, terrain: inp.terrain })}
                  >
                    Load in navigator
                  </Button>
                </Card>
              </li>
            ))}
          </ol>
        </>
      )}
      {res.status === "loading" && !data && <div className="h-40 animate-pulse rounded-2xl bg-bg/40" aria-hidden />}
    </section>
  );
});
