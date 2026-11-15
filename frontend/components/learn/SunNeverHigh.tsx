"use client";

import { useCallback, useState } from "react";

import { LiveError, LiveSkeleton } from "@/components/learn/LiveState";
import { NumbersLink } from "@/components/learn/NumbersLink";
import { useSiteSky } from "@/components/learn/useSiteSky";
import { SkyPlot } from "@/components/navigator/SkyPlot";
import { Card } from "@/components/ui";
import { usePlayback } from "@/hooks/usePlayback";
import { timeAt } from "@/lib/interp";
import { useNowHour } from "@/lib/useNowHour";

const DAYS = 14;
const fmt = (ms: number) => `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC`;

function SkyCard({ title, sub, sky, pos, playing, site, start }: { title: string; sub: string; sky: ReturnType<typeof useSiteSky>; pos: number; playing: boolean; site: string; start: Date }) {
  return (
    <Card className="min-w-0 space-y-2 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-lg">{title}</h3>
          <p className="text-xs text-muted">{sub}</p>
        </div>
        <NumbersLink site={site} start={start} days={DAYS} />
      </div>
      {sky.status.kind === "error" ? (
        <LiveError message={sky.status.message} onRetry={sky.retry} />
      ) : sky.data && sky.horizon && sky.sun && sky.earth ? (
        <SkyPlot
          horizon={sky.horizon.elevation}
          terrain={sky.horizon.terrain}
          siteKey={sky.data.site.id}
          times={sky.times}
          sun={sky.sun}
          earth={sky.earth}
          index={pos}
          instant={playing}
        />
      ) : (
        <LiveSkeleton className="aspect-square" label="Loading the sky…" />
      )}
    </Card>
  );
}

function DualSky({ start }: { start: Date }) {
  const eq = useSiteSky("apollo-11", start, DAYS);
  const pole = useSiteSky("shackleton-ridge", start, DAYS);
  const n = Math.min(eq.n, pole.n);
  const [pos, setPos] = useState(0);
  const seek = useCallback((p: number) => setPos(Math.min(Math.max(0, p), Math.max(0, n - 1))), [n]);
  // One playback drives both plots in the same frame (same window, same step).
  const play = usePlayback({ n, stepMinutes: 60, pos, seek });
  const ready = n > 1;
  const times = eq.series?.timesMs ?? pole.series?.timesMs;

  return (
    <div className="mt-10 space-y-4">
      <div className="glass flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3">
        <button
          type="button"
          onClick={play.toggle}
          disabled={!ready}
          aria-pressed={play.playing}
          className="grid h-10 min-w-10 place-items-center rounded-full border border-accent/60 bg-accent/10 px-3 text-accent disabled:opacity-40"
        >
          <span aria-hidden>{play.playing ? "⏸" : "▶"}</span>
          <span className="sr-only">{play.playing ? "Pause both skies" : "Play both skies"}</span>
        </button>
        <span className="text-sm text-muted">{play.playing ? "Playing both skies at 6 h per second" : "Play both skies together"}</span>
        <input
          type="range"
          min={0}
          max={Math.max(0, n - 1)}
          step="any"
          value={pos}
          disabled={!ready}
          onChange={(e) => seek(Number(e.target.value))}
          aria-label="Time in the 14-day window"
          aria-valuetext={times ? fmt(timeAt(times, pos)) : undefined}
          className="h-8 min-w-40 flex-1 accent-[var(--color-accent)]"
        />
        <span className="font-mono text-xs text-lunar-300">{times && ready ? fmt(timeAt(times, pos)) : "—"}</span>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <SkyCard title="Apollo 11 · equator" sub="Looking straight up: the Sun arcs high across the sky." sky={eq} pos={pos} playing={play.playing} site="apollo-11" start={start} />
        <SkyCard title="Shackleton ridge · south pole" sub="Looking at the horizon all the way round (height exaggerated)." sky={pole} pos={pos} playing={play.playing} site="shackleton-ridge" start={start} />
      </div>
    </div>
  );
}

export function SunNeverHigh() {
  const start = useNowHour();
  return start ? <DualSky start={start} /> : <LiveSkeleton className="mt-10 h-96" label="Loading both skies…" />;
}
