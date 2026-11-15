import { api, countdownText, expect, onlyOn, openNavigator, summaryPct, tabButton, test, verdictText } from "./fixtures";

type Metrics = {
  sun_pct: number;
  earth_pct: number;
  verdict: string;
  next_sunrise: string | null;
  events: { type: string; time: string }[];
};
type Vis = { metrics: Metrics };

const minutesBetween = (a: string, b: string) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 60_000;

/** Step 4: known answers, checked against the API directly and in the UI. */
test.describe("known answers: API", () => {
  test.beforeEach(({}, ti) => onlyOn(ti, "desktop"));

  test("apollo-11 Dec 2026", async () => {
    const v = await api<Vis>("/visibility?site_id=apollo-11&start=2026-12-01T00:00:00Z&days=14");
    expect(v.metrics.sun_pct).toBeGreaterThan(0.5);
    expect(v.metrics.sun_pct).toBeLessThan(4);
    expect(v.metrics.earth_pct).toBe(100);
    expect(v.metrics.verdict).toBe("not_viable");
    expect(minutesBetween(v.metrics.next_sunrise!, "2026-12-14T15:15:00Z")).toBeLessThanOrEqual(10);
  });

  test("shackleton Feb 2027: flat vs real terrain", async () => {
    const flat = await api<Vis>("/visibility?site_id=shackleton-ridge&start=2027-02-11T00:00:00Z&days=14&terrain_mode=flat");
    const real = await api<Vis>("/visibility?site_id=shackleton-ridge&start=2027-02-11T00:00:00Z&days=14");
    expect(flat.metrics.sun_pct).toBe(0);
    expect(flat.metrics.verdict).toBe("not_viable");
    expect(real.metrics.sun_pct).toBeCloseTo(80.7, 0);
    expect(real.metrics.verdict).toBe("risky");
  });

  test("shackleton Earthrise ~2026-11-17 17:20", async () => {
    const v = await api<Vis>("/visibility?site_id=shackleton-ridge&start=2026-11-15T00:00:00Z&days=14");
    const rise = v.metrics.events.find((e) => e.type === "earthrise" && e.time.startsWith("2026-11-17"));
    expect(rise, JSON.stringify(v.metrics.events)).toBeTruthy();
    expect(minutesBetween(rise!.time, "2026-11-17T17:20:00Z")).toBeLessThanOrEqual(10);
  });

  test("change-4 Earth 0%", async () => {
    const v = await api<Vis>("/visibility?site_id=change-4&start=2026-12-01T00:00:00Z&days=14");
    expect(v.metrics.earth_pct).toBe(0);
  });

  test("best dates apollo-11 Dec-Jan, 10-day missions", async () => {
    const b = await api<{ windows: { start: string; verdict: string }[] }>(
      "/best-windows?site_id=apollo-11&from=2026-12-01T00:00:00Z&to=2027-01-31T00:00:00Z&mission_days=10",
    );
    const good = b.windows.filter((w) => w.verdict === "good").map((w) => w.start.slice(0, 10));
    expect(good.some((d) => d >= "2026-12-14" && d <= "2026-12-16"), good.join(",")).toBe(true);
    expect(good.some((d) => d >= "2027-01-12" && d <= "2027-01-14"), good.join(",")).toBe(true);
  });
});

test.describe("known answers: UI", () => {
  test.beforeEach(({}, ti) => onlyOn(ti, "desktop"));

  test("apollo-11 Dec 2026 in the navigator", async ({ page }) => {
    await openNavigator(page, "site=apollo-11&start=2026-12-01T00:00:00Z&days=14&mode=expert");
    expect(await summaryPct(page, "Sunlight")).toBeLessThan(4);
    expect(await summaryPct(page, "Earth in view")).toBe(100);
    expect(await verdictText(page)).toMatch(/Not viable/);
    expect(await countdownText(page, /NEXT SUNRISE/i)).toMatch(/2026-12-14 15:(0[5-9]|1\d|2[0-5]) UTC/);
  });

  test("shackleton Feb 2027: real vs flat in the navigator", async ({ page }) => {
    await openNavigator(page, "site=shackleton-ridge&start=2027-02-11T00:00:00Z&days=14&mode=expert");
    expect(await summaryPct(page, "Sunlight")).toBeCloseTo(80.7, 0);
    expect(await verdictText(page)).toMatch(/Risky/);
    await openNavigator(page, "site=shackleton-ridge&start=2027-02-11T00:00:00Z&days=14&mode=expert&terrain=flat");
    expect(await summaryPct(page, "Sunlight")).toBe(0);
    expect(await verdictText(page)).toMatch(/Not viable/);
  });

  test("shackleton Earthrise countdown ~17:20", async ({ page }) => {
    await openNavigator(page, "site=shackleton-ridge&start=2026-11-15T00:00:00Z&days=14&mode=expert");
    expect(await countdownText(page, /NEXT EARTHRISE/i)).toMatch(/2026-11-17 17:(1\d|2\d|30) UTC/);
  });

  test("change-4: Earth 0% and Why? mentions a relay satellite", async ({ page }) => {
    await openNavigator(page, "site=change-4&start=2026-12-01T00:00:00Z&days=14&mode=simple");
    expect(await summaryPct(page, "Earth in view")).toBe(0);
    await page.getByRole("button", { name: "Why?" }).click();
    await expect(page.getByRole("note")).toContainText(/relay satellite/);
  });

  test("best dates apollo-11 shows 15 Dec and 13 Jan as Good", async ({ page }) => {
    await openNavigator(page, "site=apollo-11&tab=best&bsite=apollo-11&bfrom=2026-12-01&bto=2027-01-31&bdays=10");
    await expect(tabButton(page, "Best dates")).toBeVisible();
    const results = page.locator("section", { has: page.getByRole("heading", { name: /When should we land/ }) });
    await expect(results.getByText(/Load in navigator/).first()).toBeVisible({ timeout: 90_000 });
    const txt = (await results.innerText()).replace(/\s+/g, " ");
    expect(txt).toMatch(/1[4-6] Dec → [^✓✕!]*✓ Good/);
    expect(txt).toMatch(/1[2-4] Jan → [^✓✕!]*✓ Good/);
  });
});
