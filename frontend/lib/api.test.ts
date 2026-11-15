import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Fresh copy of the module per test (it keeps the "waking"/"answered" state at module level). */
async function freshApi() {
  vi.resetModules();
  return import("./api");
}

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

describe("cold-start retries", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("retries network failures and 502s, flags waking, then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(new Response("Bad gateway", { status: 502 }))
      .mockResolvedValueOnce(ok({ status: "ok", ephemeris_loaded: true }));
    vi.stubGlobal("fetch", fetchMock);
    const api = await freshApi();
    const seen: boolean[] = [];
    api.subscribeApiWaking(() => seen.push(api.isApiWaking()));

    const p = api.getHealth();
    await vi.advanceTimersByTimeAsync(1_000); // first backoff
    await vi.advanceTimersByTimeAsync(2_000); // second backoff
    await expect(p).resolves.toEqual({ status: "ok", ephemeris_loaded: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(seen).toEqual([true, false]);
    expect(api.isApiWaking()).toBe(false);
  });

  it("gives up after about a minute with a friendly ApiError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const api = await freshApi();
    const p = api.getSites();
    const assertion = expect(p).rejects.toMatchObject({ name: "ApiError", status: 0 });
    await vi.advanceTimersByTimeAsync(api.WAKE_BUDGET_MS + 10_000);
    await assertion;
    expect(api.isApiWaking()).toBe(false);
  });

  it("does not retry the backend's own errors (503 with a detail, 404, 422)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "Ephemeris not loaded" }), { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    const api = await freshApi();
    await expect(api.getHealth()).rejects.toMatchObject({ status: 503, message: "Ephemeris not loaded" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("flags a slow first response as waking without cancelling it", async () => {
    let resolve!: (r: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((r) => (resolve = r))));
    const api = await freshApi();
    const p = api.getHealth();
    await vi.advanceTimersByTimeAsync(4_000);
    expect(api.isApiWaking()).toBe(true);
    resolve(ok({ status: "ok", ephemeris_loaded: true }));
    await p;
    expect(api.isApiWaking()).toBe(false);
  });

  it("stops retrying when aborted", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const api = await freshApi();
    const ctrl = new AbortController();
    const p = api.getSites(undefined, { signal: ctrl.signal });
    const assertion = expect(p).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(500);
    ctrl.abort();
    await assertion;
  });
});
