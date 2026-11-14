"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Reveal } from "@/components/fx/Reveal";
import { TiltCard } from "@/components/fx/TiltCard";
import { Card, Pill } from "@/components/ui";
import { ApiError, getSites, type Site } from "@/lib/api";
import { navigatorUrl, regionLabel } from "@/lib/format";

const FEATURED: { id: string; tag: string }[] = [
  { id: "apollo-11", tag: "1969" },
  { id: "im-2", tag: "2025" },
  { id: "shackleton-ridge", tag: "Future target" },
];

type State = { status: "loading" } | { status: "ok"; sites: Site[] } | { status: "error"; message: string };

export function SiteCards() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    const ctrl = new AbortController();
    getSites(undefined, { signal: ctrl.signal })
      .then((r) => {
        const byId = new Map(r.sites.map((s) => [s.id, s]));
        setState({ status: "ok", sites: FEATURED.map((f) => byId.get(f.id)).filter((s): s is Site => !!s) });
      })
      .catch((e: unknown) => {
        if ((e as Error)?.name === "AbortError") return;
        setState({ status: "error", message: e instanceof ApiError ? e.message : "Something went wrong." });
      });
    return () => ctrl.abort();
  }, []);

  if (state.status === "error") {
    return (
      <Card className="text-muted" role="status">
        Couldn&apos;t load the landing sites right now. {state.message}
      </Card>
    );
  }

  return (
    <ul className="grid gap-4 md:grid-cols-3" aria-busy={state.status === "loading"}>
      {state.status === "loading"
        ? FEATURED.map((f) => (
            <li key={f.id}>
              <Card className="h-full animate-pulse space-y-4" aria-hidden>
                <div className="h-5 w-16 rounded-full bg-border" />
                <div className="h-6 w-3/4 rounded bg-border" />
                <div className="space-y-2">
                  <div className="h-3 rounded bg-border/70" />
                  <div className="h-3 w-5/6 rounded bg-border/70" />
                </div>
              </Card>
            </li>
          ))
        : state.sites.map((site, i) => {
            const tag = FEATURED.find((f) => f.id === site.id)?.tag;
            return (
              <Reveal as="li" key={site.id} delay={i * 0.08}>
                <TiltCard>
                <Link
                  href={navigatorUrl({ site: site.id })}
                  className="group block h-full rounded-2xl focus-visible:outline-offset-4"
                  aria-label={`Open ${site.name} in the navigator`}
                >
                  <Card className="flex h-full flex-col gap-4 transition-colors group-hover:border-accent/60">
                    <div className="flex items-center justify-between gap-2">
                      <Pill tone="accent">{tag}</Pill>
                      <span
                        aria-hidden
                        className="grid h-9 w-9 place-items-center rounded-full border border-border text-accent transition-transform group-hover:translate-x-0.5 group-hover:border-accent/60"
                      >
                        →
                      </span>
                    </div>
                    <h3 className="text-xl">{site.name}</h3>
                    <p className="flex-1 text-sm text-muted">{site.description}</p>
                    <div>
                      <Pill>{regionLabel(site.region)}</Pill>
                    </div>
                  </Card>
                </Link>
                </TiltCard>
              </Reveal>
            );
          })}
    </ul>
  );
}
