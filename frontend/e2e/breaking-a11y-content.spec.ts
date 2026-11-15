import { readFileSync } from "node:fs";
import { join } from "node:path";

import AxeBuilder from "@axe-core/playwright";

import { allowConsole, API_URL, expect, layoutIssues, onlyOn, openNavigator, tabButton, test } from "./fixtures";

const apiHost = new URL(API_URL).host;
/** Error cards (the Next route announcer also has role="alert" but is always empty). */
const alerts = (page: import("@playwright/test").Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');
const NETWORK_NOISE = "Failed to load resource|net::ERR|ERR_INTERNET_DISCONNECTED|ERR_FAILED|status of 40[0-9]";

/** Step 13: breaking it (desktop). */
test.describe("breaking it", () => {
  test.beforeEach(({}, ti) => onlyOn(ti, "desktop"));

  test("offline: waking notice, then a friendly error with Try again; recovers when back online", async ({ page, context }) => {
    test.setTimeout(240_000);
    allowConsole(NETWORK_NOISE);
    await openNavigator(page, "site=shackleton-ridge");
    await context.setOffline(true);
    await page.locator("select").first().selectOption("apollo-11");
    await expect(page.getByText(/Waking up the model/).first()).toBeVisible({ timeout: 15_000 });
    // after the ~60 s retry budget: a friendly error card with Try again
    const alert = alerts(page).filter({ hasText: "Try again" });
    await expect(alert).toBeVisible({ timeout: 90_000 });
    await expect(alert.getByRole("button", { name: "Try again" })).toBeVisible();
    await context.setOffline(false);
    await alert.getByRole("button", { name: "Try again" }).click();
    await expect(page.locator("h1:visible")).toHaveText(/Apollo 11/, { timeout: 60_000 });
    await expect(alerts(page)).toHaveCount(0);
  });

  test("cold start: API failing for ~20 s shows 'Waking up the model…' then recovers on its own", async ({ page }) => {
    allowConsole(NETWORK_NOISE);
    const until = Date.now() + 20_000;
    await page.route(`**://${apiHost}/**`, (route) => (Date.now() < until ? route.abort("connectionrefused") : route.continue()));
    await page.goto("/app?site=im-2", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/Waking up the model/).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("h1:visible")).toHaveText(/IM-2/, { timeout: 90_000 });
    await expect(alerts(page)).toHaveCount(0);
    await expect(page.getByText(/Waking up the model/)).toHaveCount(0, { timeout: 20_000 });
  });

  test("weird URLs give sensible defaults or friendly errors, no crash", async ({ page }) => {
    allowConsole(NETWORK_NOISE);
    await page.goto("/app?site=xyz", { waitUntil: "domcontentloaded" });
    await expect(alerts(page)).toContainText(/Unknown site|xyz/i, { timeout: 90_000 });

    await openNavigator(page, "site=apollo-11&days=999");
    await expect(page.getByLabel("Mission length in days (1 to 60)")).toHaveValue("60");

    await openNavigator(page, "lat=abc&lon=10");
    await expect(page.locator("h1:visible")).toHaveText(/Shackleton/);

    await openNavigator(page, "site=im-2&start=not-a-date&step=7&terrain=banana&t=garbage");
    await expect(page.locator("h1:visible")).toHaveText(/IM-2/);
  });

  test("refresh mid-play and back/forward", async ({ page }) => {
    await openNavigator(page, "site=shackleton-ridge&start=2026-11-15T00:00:00Z&days=14");
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.waitForTimeout(2000);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("h1:visible")).toHaveText(/Shackleton/, { timeout: 90_000 });
    await expect(page).toHaveURL(/[?&]t=2026-11-1/);
    await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();

    await tabButton(page, "Compare").click();
    await expect(page).toHaveURL(/tab=compare/);
    await tabButton(page, "Moon map").click();
    await expect(page).toHaveURL(/tab=map/);
    await page.goBack();
    await expect(page).toHaveURL(/tab=compare/);
    await page.goForward();
    await expect(page).toHaveURL(/tab=map/);
  });
});

/** Step 14: accessibility + speed (desktop). */
test.describe("accessibility", () => {
  test.beforeEach(({}, ti) => onlyOn(ti, "desktop"));

  test("keyboard Tab reaches the navigator controls with a visible focus indicator", async ({ page }) => {
    await openNavigator(page, "site=shackleton-ridge");
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    const seen: { name: string; visible: boolean }[] = [];
    for (let i = 0; i < 45; i++) {
      await page.keyboard.press("Tab");
      seen.push(
        await page.evaluate(() => {
          const el = document.activeElement as HTMLElement;
          const cs = getComputedStyle(el);
          // Native date/time inputs move focus into their segments and highlight the active one instead of an outline.
          const nativeSegments = el instanceof HTMLInputElement && (el.type === "date" || el.type === "time");
          const ring = nativeSegments || (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== "none";
          return { name: `${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") || el.innerText || (el as HTMLInputElement).value || "").trim().slice(0, 30)}"`, visible: ring };
        }),
      );
    }
    const names = seen.map((s) => s.name).join(" | ");
    for (const want of [/select/, /Now/i, /14 d/, /Real terrain/, /Copy link/, /Play/]) expect(names, `Tab order: ${names}`).toMatch(want);
    const noRing = seen.filter((s) => !s.visible).map((s) => s.name);
    expect(noRing, "focused without a visible indicator").toEqual([]);
  });

  test("reduced motion: no 3D/auto animations, nothing breaks", async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);
    expect(await page.locator("canvas").count()).toBe(0); // 2D scenes only
    const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running" && (a.effect?.getTiming().iterations ?? 1) === Infinity).length);
    expect(running, "infinite animations still running").toBe(0);
    await page.goto("/app?site=im-2", { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1:visible")).toHaveText(/IM-2/, { timeout: 90_000 });
    expect(errors).toEqual([]);
    await ctx.close();
  });

  test("200% page zoom (640 px CSS viewport) is still usable", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.goto("/app?site=im-2", { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1:visible")).toHaveText(/IM-2/, { timeout: 90_000 });
    const r = await layoutIssues(page);
    expect(r.scrollWidth).toBeLessThanOrEqual(r.width);
    await page.locator("select").first().selectOption("apollo-11");
    await expect(page.locator("h1:visible")).toHaveText(/Apollo 11/, { timeout: 60_000 });
    await ctx.close();
  });

  for (const [name, url] of [["home", "/"], ["navigator", "/app?site=shackleton-ridge"], ["learn", "/learn"]] as const) {
    test(`axe-core: no serious/critical issues on ${name}`, async ({ page }) => {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      if (url.startsWith("/app")) await expect(page.locator("h1:visible")).not.toHaveText(/Loading/, { timeout: 90_000 });
      await page.waitForTimeout(4000);
      // (@axe-core/playwright ships its own Playwright types; the page object is the same at runtime.)
      const res = await new AxeBuilder({ page } as unknown as ConstructorParameters<typeof AxeBuilder>[0]).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      const bad = res.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      const summary = bad.map((v) => `${v.impact} ${v.id}: ${v.help} (${v.nodes.length}) e.g. ${v.nodes[0]?.target.join(" ")}`);
      await test.info().attach(`axe-${name}`, { body: JSON.stringify(res.violations, null, 1), contentType: "application/json" });
      expect(summary, summary.join("\n")).toEqual([]);
    });
  }
});

/** Step 15: content. */
test.describe("content", () => {
  test.beforeEach(({}, ti) => onlyOn(ti, "desktop"));

  test("no placeholder text on any page; footer credits", async ({ page }) => {
    const found: string[] = [];
    for (const url of ["/", "/app?site=shackleton-ridge&mode=expert", "/app?site=im-2&tab=compare", "/app?site=im-2&tab=best", "/app?site=im-2&tab=map", "/learn"]) {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(url === "/" || url === "/learn" ? 5000 : 7000);
      const text = await page.evaluate(() => document.body.innerText);
      for (const m of text.matchAll(/[^\n]{0,40}\b(lorem|placeholder|TODO|example)\b[^\n]{0,40}/gi)) found.push(`${url}: ${m[0].trim()}`);
    }
    expect(found, found.join("\n")).toEqual([]);
    const footer = page.locator("footer");
    await expect(footer).toContainText(/LOLA/);
    await expect(footer).toContainText(/JPL/);
    await expect(footer).toContainText(/Scientific Visualization Studio|SVS/);
    await expect(footer).toContainText("Not an official NASA product");
  });

  test("README live links / screenshot placeholders (flag only)", async () => {
    const readme = readFileSync(join(__dirname, "..", "..", "README.md"), "utf8");
    const flags = [...readme.matchAll(/[^\n]*(placeholder|<your-app>|<your-api>)[^\n]*/gi)].map((m) => m[0].trim());
    // Flag only (reported, not a failure): the README is for GitHub, not the deployed site.
    test.info().annotations.push({ type: "readme-flags", description: flags.length ? flags.join(" | ") : "none" });
    console.log(`[README flags] ${flags.length ? flags.join(" | ") : "none"}`);
  });
});
