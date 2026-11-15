/**
 * Typed client for the Shadowline backend. ALL backend calls go through this file.
 * Types are generated from the backend's OpenAPI spec: `npm run gen:api` (writes lib/api-types.ts).
 */

import type { components, paths } from "./api-types";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");

// ---------------------------------------------------------------- types (re-exported for components)

type Schemas = components["schemas"];

export type Site = Schemas["Site"];
export type Region = Site["region"];
export type SitesResponse = Schemas["SitesResponse"];
export type HorizonResponse = Schemas["HorizonResponse"];
export type VisibilityResponse = Schemas["VisibilityResponse"];
export type SnapshotResponse = Schemas["SnapshotResponse"];
export type Metrics = Schemas["Metrics"];
export type Verdict = Metrics["verdict"];
export type MissionEvent = Schemas["Event"];
export type Scenario = Schemas["Scenario"];
/** Fields with server-side defaults are optional when sending (the generated type marks them required). */
type ScenarioDefaults = "days" | "step_minutes" | "terrain_mode" | "earth_margin_deg";
export type ScenarioInput = Omit<Scenario, ScenarioDefaults> & Partial<Pick<Scenario, ScenarioDefaults>>;
export type CompareRequest = { scenarios: ScenarioInput[] };
export type CompareResponse = Schemas["CompareResponse"];
export type ScenarioResult = Schemas["ScenarioResult"];
export type BestWindow = Schemas["BestWindow"];
export type BestWindowsResponse = Schemas["BestWindowsResponse"];
export type TerrainMode = NonNullable<Scenario["terrain_mode"]>;

type DateLike = string | Date;
type WithDates<T, K extends keyof T> = Omit<T, K> & { [P in K]: DateLike };

export type VisibilityParams = WithDates<paths["/visibility"]["get"]["parameters"]["query"], "start">;
export type SnapshotParams = WithDates<paths["/snapshot"]["get"]["parameters"]["query"], "time">;
export type BestWindowsParams = WithDates<paths["/best-windows"]["get"]["parameters"]["query"], "from" | "to">;

// ---------------------------------------------------------------- errors

/** A failed API call. `message` is human-readable (the backend's "detail" when there is one). */
export class ApiError extends Error {
  constructor(
    message: string,
    /** HTTP status; 0 if the backend couldn't be reached. */
    public status: number,
    /** Raw "detail" from the backend, if any. */
    public detail?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type ValidationItem = { loc?: (string | number)[]; msg?: string };

function detailToMessage(detail: unknown): string | undefined {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    // FastAPI validation errors: [{loc: ["query", "lat"], msg: "..."}, ...]
    return (detail as ValidationItem[])
      .map((d) => {
        const field = (d.loc ?? []).filter((p) => p !== "query" && p !== "body").join(".");
        return field ? `${field}: ${d.msg}` : d.msg;
      })
      .filter(Boolean)
      .join("; ");
  }
  return undefined;
}

// ---------------------------------------------------------------- request helper

type QueryValue = string | number | boolean | Date | null | undefined;

function toQuery(params: Record<string, QueryValue>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    q.set(k, v instanceof Date ? v.toISOString() : String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

// ---------------------------------------------------------------- cold start (Render free tier)
//
// The free backend sleeps after ~15 min idle and takes up to a minute to wake. While it wakes, requests
// fail at the network level or come back 502/504 from Render's proxy, or simply hang. So: retry with
// backoff for up to WAKE_BUDGET_MS, and publish a "waking" flag that loading states show instead of an error.

/** How long to keep retrying an unreachable backend before giving up. */
export const WAKE_BUDGET_MS = 60_000;
/** A first response slower than this flips the "waking" flag on. */
const SLOW_MS = 3_500;
const BACKOFF_MS = [1_000, 2_000, 3_000, 5_000, 8_000];

let waking = false;
/** After the first answer the backend is awake; later slow responses are just heavy work, not a cold start. */
let answered = false;
const wakeListeners = new Set<() => void>();

function setWaking(v: boolean) {
  if (waking === v) return;
  waking = v;
  wakeListeners.forEach((l) => l());
}

/** True while the backend seems to be waking up (a request is slow or being retried). */
export function isApiWaking(): boolean {
  return waking;
}

/** Subscribe to waking changes (for useSyncExternalStore). Returns the unsubscribe function. */
export function subscribeApiWaking(listener: () => void): () => void {
  wakeListeners.add(listener);
  return () => wakeListeners.delete(listener);
}

/** Status codes Render's proxy returns while the instance boots. Our own 503 (with a JSON detail) is final. */
const WAKE_STATUSES = new Set([502, 504]);

function sleep(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** fetch with cold-start retries. Resolves with the first non-wake response; throws ApiError(status 0) after the budget. */
async function fetchWaking(url: string, init: RequestInit): Promise<Response> {
  const t0 = Date.now();
  for (let attempt = 0; ; attempt++) {
    // Flag a slow response as "waking" without cancelling it: the instance may answer this very request.
    const slowTimer = answered ? undefined : setTimeout(() => setWaking(true), SLOW_MS);
    let res: Response | null = null;
    try {
      res = await fetch(url, init);
    } catch (err) {
      if ((err as Error)?.name === "AbortError") throw err;
    } finally {
      clearTimeout(slowTimer);
    }
    if (res && !WAKE_STATUSES.has(res.status)) {
      answered = true;
      setWaking(false); // any answer means the instance is up
      return res;
    }
    const wait = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
    if (Date.now() - t0 + wait > WAKE_BUDGET_MS) {
      setWaking(false);
      throw new ApiError(
        res
          ? `The Shadowline API is still starting (HTTP ${res.status}). Please try again in a moment.`
          : `Can't reach the Shadowline API at ${API_URL}. It may be waking up or offline; please try again.`,
        res?.status ?? 0,
      );
    }
    setWaking(true);
    await sleep(wait, init.signal);
  }
}

async function request<T>(path: string, init?: RequestInit & { signal?: AbortSignal }): Promise<T> {
  const url = `${API_URL}${path}`;
  const res = await fetchWaking(url, { ...init, headers: { Accept: "application/json", ...init?.headers } });
  if (!res.ok) {
    let detail: unknown;
    try {
      detail = (await res.json())?.detail;
    } catch {
      /* non-JSON error body */
    }
    const fallback = res.status === 503 ? "The ephemeris isn't loaded on the server yet." : res.statusText;
    throw new ApiError(detailToMessage(detail) || `Request failed (${res.status}) ${fallback}`, res.status, detail);
  }
  return (await res.json()) as T;
}

let wakePinged = false;

/**
 * Fire-and-forget GET /health so a sleeping backend starts booting while the page renders.
 * Runs once per page load; never throws.
 */
export function wakeBackend(): void {
  if (wakePinged || typeof window === "undefined") return;
  wakePinged = true;
  getHealth().catch(() => {
    /* the real requests will retry and report */
  });
}

type Opts = { signal?: AbortSignal };

// ---------------------------------------------------------------- endpoints

export function getSites(region?: Region, opts?: Opts): Promise<SitesResponse> {
  return request(`/sites${toQuery({ region })}`, opts);
}

export function getSite(siteId: string, opts?: Opts): Promise<Site> {
  return request(`/sites/${encodeURIComponent(siteId)}`, opts);
}

export function getHorizon(siteId: string, opts?: Opts): Promise<HorizonResponse> {
  return request(`/horizon${toQuery({ site_id: siteId })}`, opts);
}

export function getVisibility(params: VisibilityParams, opts?: Opts): Promise<VisibilityResponse> {
  return request(`/visibility${toQuery(params)}`, opts);
}

export function getSnapshot(params: SnapshotParams, opts?: Opts): Promise<SnapshotResponse> {
  return request(`/snapshot${toQuery(params)}`, opts);
}

export function compare(body: CompareRequest, opts?: Opts): Promise<CompareResponse> {
  return request(`/compare`, {
    ...opts,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function bestWindows(params: BestWindowsParams, opts?: Opts): Promise<BestWindowsResponse> {
  return request(`/best-windows${toQuery(params)}`, opts);
}

export type GlobeGeometry = Schemas["GlobeGeometryResponse"];
export type GlobeGeometryParams = WithDates<paths["/globe-geometry"]["get"]["parameters"]["query"], "start">;

/** Sub-solar / sub-Earth points aligned with /visibility times (for the 3D Moon map). */
export function getGlobeGeometry(params: GlobeGeometryParams, opts?: Opts): Promise<GlobeGeometry> {
  return request(`/globe-geometry${toQuery(params)}`, opts);
}

export function getHealth(opts?: Opts): Promise<Schemas["HealthResponse"]> {
  return request(`/health`, opts);
}
