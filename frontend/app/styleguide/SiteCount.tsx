"use client";

import { useEffect, useState } from "react";

import { API_URL, ApiError, getSites, type Site } from "@/lib/api";

type State = { status: "loading" } | { status: "ok"; sites: Site[] } | { status: "error"; message: string };

/** Live check that the browser can reach the backend through lib/api.ts (and CORS allows it). */
export function SiteCount() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    const ctrl = new AbortController();
    getSites(undefined, { signal: ctrl.signal })
      .then((r) => setState({ status: "ok", sites: r.sites }))
      .catch((e: unknown) => {
        if ((e as Error)?.name === "AbortError") return;
        setState({ status: "error", message: e instanceof ApiError ? e.message : String(e) });
      });
    return () => ctrl.abort();
  }, []);

  if (state.status === "loading") return <p className="text-muted">Calling getSites() on {API_URL}…</p>;
  if (state.status === "error") return <p className="text-notviable">getSites() failed: {state.message}</p>;
  const withTerrain = state.sites.filter((s) => s.has_terrain).length;
  return (
    <p data-testid="site-count">
      <span className="font-heading text-2xl font-bold text-good">{state.sites.length} sites</span>{" "}
      <span className="text-muted">
        loaded from {API_URL} ({withTerrain} with LOLA terrain)
      </span>
    </p>
  );
}
