"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { motion } from "motion/react";

import { CountUp } from "@/components/fx/CountUp";
import { Button, Card, VerdictBadge } from "@/components/ui";
import { ApiError, compare, type ScenarioResult } from "@/lib/api";
import { navigatorUrl, nowHourUtc } from "@/lib/format";
import { useApiWaking, WAKING_TEXT } from "@/lib/useApiWaking";
import { useReducedMotionPref } from "@/lib/useCapable";

const SITE_IDS = ["apollo-11", "apollo-15", "im-2", "shackleton-ridge"];
const DAYS = 14;

type State =
  | { status: "loading" }
  | { status: "ok"; results: ScenarioResult[]; start: Date }
  | { status: "error"; message: string };

/** /compare accepts up to 3 scenarios, so the 4 sites go out as two requests in parallel. */
async function loadConditions(start: Date, signal: AbortSignal): Promise<ScenarioResult[]> {
  const scenario = (id: string) => ({ site_id: id, start: start.toISOString(), days: DAYS });
  const batches = [SITE_IDS.slice(0, 3), SITE_IDS.slice(3)];
  const responses = await Promise.all(
    batches.map((ids) => compare({ scenarios: ids.map(scenario) }, { signal })),
  );
  return responses.flatMap((r) => r.results);
}

/** Sun up: pulsing halo. Earth in view: gentle bob. Off: struck through (never color-only). Still under reduced motion. */
function StatusDot({ kind, on }: { kind: "sun" | "earth"; on: boolean }) {
  const reduced = useReducedMotionPref();
  const label = kind === "sun" ? (on ? "Sun up now" : "Sun down now") : on ? "Earth in view now" : "Earth hidden now";
  const color = kind === "sun" ? "border-sun/60 bg-sun/15 text-sun" : "border-earth/60 bg-earth/15 text-earth";
  const animateOn = on && !reduced;
  return (
    <span
      title={label}
      className={`relative grid h-8 w-8 place-items-center rounded-full border text-sm ${
        on ? color : "border-border bg-bg/40 text-muted/60"
      }`}
    >
      {animateOn && kind === "sun" && (
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-full border border-sun/60"
          animate={{ scale: [1, 1.7], opacity: [0.6, 0] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeOut" }}
        />
      )}
      <motion.span
        aria-hidden
        animate={animateOn && kind === "earth" ? { y: [0, -2.5, 0] } : { y: 0 }}
        transition={animateOn && kind === "earth" ? { duration: 3, repeat: Infinity, ease: "easeInOut" } : { duration: 0 }}
      >
        {kind === "sun" ? "☀" : "◉"}
      </motion.span>
      {!on && (
        <span aria-hidden className="absolute h-px w-6 rotate-45 bg-muted/70" /* strike-through: not color-only */ />
      )}
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function LiveConditions() {
  const [state, setState] = useState<State>({ status: "loading" });
  const waking = useApiWaking();
  const ctrlRef = useRef<AbortController | null>(null);

  const load = useCallback(() => {
    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    const start = nowHourUtc();
    loadConditions(start, ctrl.signal)
      .then((results) => setState({ status: "ok", results, start }))
      .catch((e: unknown) => {
        if ((e as Error)?.name === "AbortError") return;
        setState({ status: "error", message: e instanceof ApiError ? e.message : "Unexpected error." });
      });
  }, []);

  useEffect(() => {
    load();
    return () => ctrlRef.current?.abort();
  }, [load]);

  const retry = () => {
    setState({ status: "loading" });
    load();
  };

  if (state.status === "error") {
    return (
      <Card className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between" role="alert">
        <div>
          <p className="font-heading text-lg font-semibold">Couldn&rsquo;t load live conditions</p>
          <p className="mt-1 text-sm text-muted">{state.message}</p>
        </div>
        <Button variant="secondary" onClick={retry}>
          Try again
        </Button>
      </Card>
    );
  }

  return (
    <div>
      {state.status === "loading" && waking && (
        <p className="mb-3 text-sm text-muted" role="status">
          {WAKING_TEXT}
        </p>
      )}
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy={state.status === "loading"} aria-live="polite">
        {state.status === "loading"
          ? SITE_IDS.map((id) => (
              <li key={id}>
                <Card className="h-full animate-pulse space-y-4" aria-hidden>
                  <div className="flex gap-2">
                    <div className="h-8 w-8 rounded-full bg-border" />
                    <div className="h-8 w-8 rounded-full bg-border" />
                  </div>
                  <div className="h-5 w-3/4 rounded bg-border" />
                  <div className="h-5 w-20 rounded-full bg-border/70" />
                  <div className="h-3 w-1/2 rounded bg-border/70" />
                </Card>
              </li>
            ))
          : state.results.map((r) => (
              <li key={r.site.id}>
                <Link
                  href={navigatorUrl({ site: r.site.id, start: state.start, days: DAYS })}
                  className="group block h-full rounded-2xl"
                  aria-label={`${r.site.name}: open these 14 days in the navigator`}
                >
                  <Card className="flex h-full flex-col gap-3 transition-colors group-hover:border-accent/60">
                    <div className="flex gap-2">
                      <StatusDot kind="sun" on={r.metrics.sun_up_at_start} />
                      <StatusDot kind="earth" on={r.metrics.earth_visible_at_start} />
                    </div>
                    <h3 className="text-base leading-snug">{r.site.name}</h3>
                    <div>
                      <VerdictBadge verdict={r.metrics.verdict} />
                    </div>
                    <p className="text-sm text-muted">
                      <span className="text-sun">
                        Sun <CountUp value={Math.round(r.metrics.sun_pct)} suffix="%" duration={1.1} />
                      </span>
                      {" · "}
                      <span className="text-earth">
                        Earth <CountUp value={Math.round(r.metrics.earth_pct)} suffix="%" duration={1.1} />
                      </span>
                    </p>
                  </Card>
                </Link>
              </li>
            ))}
      </ul>
      <p className="mt-4 text-sm text-muted">
        Next {DAYS} days from now, real LOLA terrain.
        {state.status === "ok" && (
          <span className="text-muted/70">
            {" "}
            From{" "}
            <time dateTime={state.start.toISOString()}>
              {state.start.toISOString().slice(0, 16).replace("T", " ")} UTC
            </time>
            . Icons show the sky right now.
          </span>
        )}
      </p>
    </div>
  );
}
