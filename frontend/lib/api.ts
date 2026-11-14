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
export type CompareRequest = Schemas["CompareRequest"];
export type Scenario = Schemas["Scenario"];
export type CompareResponse = Schemas["CompareResponse"];
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

async function request<T>(path: string, init?: RequestInit & { signal?: AbortSignal }): Promise<T> {
  const url = `${API_URL}${path}`;
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { Accept: "application/json", ...init?.headers } });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw err;
    throw new ApiError(`Can't reach the Shadowline API at ${API_URL}. Is the backend running?`, 0);
  }
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

export function getHealth(opts?: Opts): Promise<Schemas["HealthResponse"]> {
  return request(`/health`, opts);
}
