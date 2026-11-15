"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Collapse } from "@/components/fx/Collapse";
import { ControlBar } from "@/components/navigator/ControlBar";
import { ExpertPanels } from "@/components/navigator/ExpertPanels";
import { Hints, type HintId } from "@/components/navigator/Hints";
import { BestDatesTab } from "@/components/navigator/BestDatesTab";
import { CompareTab } from "@/components/navigator/CompareTab";
import { MetricsPanel, type BodyDetail } from "@/components/navigator/MetricsPanel";
import { MoonMapTab } from "@/components/navigator/MoonMapTab";
import { SkyPlot } from "@/components/navigator/SkyPlot";
import { TabBar } from "@/components/navigator/TabBar";
import { Timeline } from "@/components/navigator/Timeline";
import { Button, Card, Pill } from "@/components/ui";
import { useNavigatorData } from "@/hooks/useNavigatorData";
import { useNavState } from "@/hooks/useNavState";
import { usePlayback } from "@/hooks/usePlayback";
import { encodeScenarios, presetFlatVsReal } from "@/lib/compareUrl";
import { stateAt } from "@/lib/countdowns";
import { clampPos, interpAt, posForTime, timeAt } from "@/lib/interp";
import { type Location, type NavMode, type NavState, type NavTab, type TerrainChoice } from "@/lib/navState";
import { useApiWaking } from "@/lib/useApiWaking";
import { storeMode, useStoredMode } from "@/lib/useStoredMode";

const URL_WRITE_MS = 250; // ~4 writes/s while scrubbing or playing

const fmtLatLon = (lat: number, lon: number) =>
  `${Math.abs(lat).toFixed(2)}°${lat < 0 ? "S" : "N"}, ${Math.abs(lon).toFixed(2)}°${lon < 0 ? "W" : "E"}`;

/** Tiny "you are here" marker: a dot inside a ring. */
function HereIcon() {
  return (
    <svg viewBox="0 0 12 12" className="mt-[3px] h-3 w-3 shrink-0 text-accent" role="img" aria-label="You are here">
      <circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" strokeOpacity={0.6} />
      <circle cx="6" cy="6" r="2" fill="currentColor" />
    </svg>
  );
}

const fmtTime = (ms: number) => `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC`;

export function Navigator() {
  const { state, update, shareUrl } = useNavState();
  const nav = useNavigatorData(state);
  const { data, horizon, times, n, status, series, events } = nav;

  // ---- selected position (fractional index). Scrubbing/playing changes it locally; the URL's t follows, throttled.
  const startMs = data ? new Date(data.start).getTime() : state.start.getTime();
  const stepMin = data?.step_minutes ?? state.step;
  const urlPos = posForTime(state.t.getTime(), startMs, stepMin, n);
  const syncKey = `${state.t.getTime()}|${startMs}|${stepMin}|${n}`;
  const [seen, setSeen] = useState(syncKey);
  const [localPos, setLocalPos] = useState(urlPos);
  // Adopt the URL's t when it changes from outside (loaded link, control snapped t to the start, new window).
  if (syncKey !== seen) {
    setSeen(syncKey);
    if (Math.abs(urlPos - localPos) > 0.05) setLocalPos(urlPos);
  }
  const pos = clampPos(localPos, n);

  const writeTimer = useRef<number | null>(null);
  const pendingPos = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (writeTimer.current) window.clearTimeout(writeTimer.current);
    },
    [],
  );

  const seriesTimes = series?.timesMs;
  const writeUrlSoon = useCallback(
    (p: number) => {
      pendingPos.current = p;
      if (writeTimer.current) return; // throttle: one write per interval, with the latest value
      writeTimer.current = window.setTimeout(() => {
        writeTimer.current = null;
        const latest = pendingPos.current;
        if (latest === null || !seriesTimes?.length) return;
        update({ t: new Date(Math.round(timeAt(seriesTimes, latest) / 1000) * 1000) }, { replace: true });
      }, URL_WRITE_MS);
    },
    [seriesTimes, update],
  );

  const seek = useCallback(
    (p: number) => {
      const c = clampPos(p, n);
      setLocalPos(c);
      writeUrlSoon(c);
    },
    [n, writeUrlSoon],
  );

  const onControl = useCallback((patch: Partial<NavState>) => update(patch), [update]);

  const sun = useMemo(
    () =>
      data
        ? { az: data.sun.az, el: data.sun.el, fraction: data.sun.visible_fraction, horizonEl: data.sun.horizon_el }
        : { az: [], el: [], fraction: [] },
    [data],
  );
  const earth = useMemo(
    () =>
      data
        ? { az: data.earth.az, el: data.earth.el, visible: data.earth.visible, horizonEl: data.earth.horizon_el }
        : { az: [], el: [], visible: [] },
    [data],
  );
  const selected = series && n ? stateAt(series, events, pos) : null;

  // ---- Simple / Expert (F10): URL first, then the remembered choice, then Simple.
  const storedMode = useStoredMode();
  const mode: NavMode = state.mode ?? storedMode ?? "simple";
  const onMode = useCallback(
    (m: NavMode) => {
      storeMode(m);
      update({ mode: m }, { replace: true });
    },
    [update],
  );
  const detail: BodyDetail | null =
    data && n
      ? (() => {
          const sunEl = interpAt(data.sun.el, pos);
          const earthEl = interpAt(data.earth.el, pos);
          return {
            sunEl,
            sunMargin: sunEl - interpAt(data.sun.horizon_el, pos),
            earthEl,
            earthMargin: earthEl - interpAt(data.earth.horizon_el, pos) - nav.dataMargin,
          };
        })()
      : null;

  // ---- tabs (F6/F7). Inputs are memoised so tab content doesn't re-render on every playback frame.
  const curLocKey = JSON.stringify(state.location);
  const curStartMs = state.start.getTime();
  const curDays = state.days;
  const curTerrain = state.terrain;
  const current = useMemo(
    () => ({ location: JSON.parse(curLocKey) as Location, start: new Date(curStartMs), days: curDays, terrain: curTerrain }),
    [curLocKey, curStartMs, curDays, curTerrain],
  );
  const extrasKey = JSON.stringify(state.extras);
  const onSelectTab = useCallback((tab: NavTab | null) => update({ tab }), [update]);
  const onChangeCmp = useCallback(
    (cmp: string) => update({ extras: { ...JSON.parse(extrasKey), cmp } }, { replace: true }),
    [update, extrasKey],
  );
  const extrasObj = useMemo(() => JSON.parse(extrasKey) as NavState["extras"], [extrasKey]);
  const onChangeExtras = useCallback(
    (patch: NavState["extras"]) => update({ extras: { ...JSON.parse(extrasKey), ...patch } }, { replace: true }),
    [update, extrasKey],
  );
  // Moon map (F9): same window as the loaded /visibility data; picks keep the tab open.
  const mapWindow = useMemo(() => ({ start: new Date(startMs), days: state.days, step: stepMin }), [startMs, state.days, stepMin]);
  const selectSiteFromMap = useCallback((id: string) => update({ location: { kind: "site", siteId: id } }), [update]);
  const pickFromMap = useCallback(
    (lat: number, lon: number) =>
      update({ location: { kind: "custom", lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100 } }),
    [update],
  );
  const onHint = useCallback(
    (id: HintId) => {
      if (id === "compare") update({ tab: "compare", extras: { ...JSON.parse(extrasKey), cmp: encodeScenarios(presetFlatVsReal(current)) } });
      if (id === "map") update({ tab: "map" });
    },
    [update, extrasKey, current],
  );
  const openScenario = useCallback(
    (s: { location: Location; start: Date; days: number; terrain: TerrainChoice }) => {
      update({ location: s.location, start: s.start, days: s.days, terrain: s.terrain, t: s.start, tab: null });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [update],
  );

  // ---- playback (F5)
  const play = usePlayback({ n, stepMinutes: stepMin, pos, seek });
  const goStart = useCallback(() => seek(0), [seek]);
  const nextEvent = useCallback(() => {
    const ev = events.find((e) => e.pos > pos + 1e-3);
    if (ev) seek(ev.pos);
  }, [events, pos, seek]);

  // Keyboard: Space play/pause, ←/→ one step, Shift+←/→ one day, Home/End. Ignored while typing in a field.
  const stepsPerDay = 1440 / stepMin;
  const { toggle } = play;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || el?.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey || !n) return;
      if (e.key === " " && tag !== "BUTTON") {
        e.preventDefault();
        toggle();
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const dir = e.key === "ArrowRight" ? 1 : -1;
        seek(Math.round(pos) + dir * (e.shiftKey ? stepsPerDay : 1));
      } else if (e.key === "Home") {
        e.preventDefault();
        seek(0);
      } else if (e.key === "End") {
        e.preventDefault();
        seek(n - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [n, pos, seek, stepsPerDay, toggle]);

  const loc = state.location;
  const siteKey = `${loc.kind === "site" ? loc.siteId : `${loc.lat},${loc.lon}`}|${horizon?.terrain ?? "flat"}`;
  const title = data?.site.name ?? (loc.kind === "site" ? "Loading…" : `Custom (${loc.lat}, ${loc.lon})`);
  const loading = status.kind === "loading";
  const waking = useApiWaking();
  const selectedMs = series && n ? timeAt(series.timesMs, pos) : null;

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
            {loading ? (waking ? "Waking up the model…" : "Computing…") : status.kind === "ok" ? `${n} steps · ${state.days} d` : ""}
          </span>
        </div>
      </header>

      <ControlBar state={state} mode={mode} onMode={onMode} onChange={onControl} shareUrl={shareUrl} />

      {mode === "simple" && <Hints onAction={onHint} />}

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

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="relative min-w-0 p-4 sm:p-5" aria-busy={loading}>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <div className="min-w-0">
              <h2 className="text-lg">Sky</h2>
              {data && (
                <p className="mt-0.5 flex items-start gap-1.5 text-xs text-muted">
                  <HereIcon />
                  <span>
                    View from{" "}
                    <span className="text-lunar-200">{data.site.id === "custom" ? "a custom point" : data.site.name}</span>{" "}
                    <span className="font-mono text-lunar-400">({fmtLatLon(data.site.lat, data.site.lon)})</span> · looking all around from the lander
                  </span>
                </p>
              )}
            </div>
            {selectedMs !== null && <span className="font-mono text-xs text-lunar-300">{fmtTime(selectedMs)}</span>}
          </div>
          {data && horizon ? (
            <div className={`transition-opacity duration-300 ${loading ? "opacity-60" : "opacity-100"}`}>
              <SkyPlot horizon={horizon.elevation} terrain={horizon.terrain} siteKey={siteKey} times={times} sun={sun} earth={earth} index={pos} instant={play.playing} hud={mode} />
            </div>
          ) : (
            <div className="grid aspect-[16/9] animate-pulse place-items-center rounded-xl bg-bg/40 text-sm text-muted">
              {status.kind === "error" ? "No data" : "Loading the sky…"}
            </div>
          )}
          <Collapse show={mode === "simple" && !!data?.site.description}>
            <aside className="mt-4 rounded-xl border border-border bg-bg/30 p-4" aria-label="About this site">
              <p className="hud mb-1.5">About this site</p>
              <p className="text-sm text-text">{data?.site.description}</p>
              {data?.site.why_interesting && <p className="mt-1.5 text-sm text-muted">{data.site.why_interesting}</p>}
            </aside>
          </Collapse>
        </Card>

        <MetricsPanel metrics={nav.metrics} selected={selected} detail={detail} terrain={data?.terrain ?? "flat"} mode={mode} />
      </div>

      {series && n > 1 ? (
        <Timeline
          series={series}
          events={events}
          pos={pos}
          onSeek={seek}
          playing={play.playing}
          onToggle={play.toggle}
          onStart={goStart}
          onNextEvent={nextEvent}
          speed={play.speed}
          onSpeed={play.setSpeed}
          loop={play.loop}
          onLoop={play.setLoop}
        />
      ) : (
        <Card className="h-48 animate-pulse" aria-hidden />
      )}

      <Collapse show={mode === "expert" && !!data && !!horizon}>
        {data && horizon && (
          <ExpertPanels data={data} horizon={horizon} events={events} pos={pos} onSeek={seek} terrainMode={state.terrain} earthMargin={nav.dataMargin} />
        )}
      </Collapse>

      <TabBar active={state.tab} onSelect={onSelectTab} />

      {state.tab === "compare" && (
        <CompareTab cmp={state.extras.cmp ?? null} current={current} onChangeCmp={onChangeCmp} onOpen={openScenario} mode={mode} />
      )}
      {state.tab === "map" && (
        <MoonMapTab
          location={state.location}
          window={data ? mapWindow : null}
          pos={pos}
          selected={selected}
          onSelectSite={selectSiteFromMap}
          onPick={pickFromMap}
        />
      )}
      {state.tab === "best" && <BestDatesTab extras={extrasObj} current={current} onChangeExtras={onChangeExtras} onLoad={openScenario} mode={mode} />}
    </div>
  );
}
