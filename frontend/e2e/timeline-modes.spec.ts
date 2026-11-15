import { readFileSync } from "node:fs";

import { countApiRequests, expect, onlyOn, openNavigator, summaryPct, test } from "./fixtures";

const slider = (page: import("@playwright/test").Page) => page.getByRole("slider", { name: "Timeline: selected time" });
const sky = (page: import("@playwright/test").Page) => page.locator('svg[role="img"][aria-label*="sky plot at"]').first();
const chips = (page: import("@playwright/test").Page) => page.locator('[aria-live="off"] span.rounded-full');

/** Step 5: timeline and playback (desktop). */
test.describe("timeline / playback", () => {
  test.beforeEach(({}, ti) => onlyOn(ti, "desktop"));

  test("play/pause, speeds, loop, keyboard, zero API requests while playing/scrubbing", async ({ page }) => {
    await openNavigator(page, "site=shackleton-ridge&start=2026-11-15T00:00:00Z&days=14&mode=expert");
    const net = countApiRequests(page);
    const n0 = net.count;

    // speeds
    for (const sp of ["1 h/s", "1 d/s", "6 h/s"]) {
      const r = page.getByRole("radiogroup", { name: "Playback speed" }).getByRole("radio", { name: sp });
      await r.click();
      await expect(r).toHaveAttribute("aria-checked", "true");
    }

    // play / pause
    const t0 = await slider(page).getAttribute("aria-valuetext");
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.waitForTimeout(2500);
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    const t1 = await slider(page).getAttribute("aria-valuetext");
    expect(t1).not.toBe(t0);

    // keyboard (focus on the page body, not a form field)
    await page.locator("h1:visible").click();
    await page.keyboard.press("Home");
    await expect(slider(page)).toHaveAttribute("aria-valuetext", /2026-11-15 00:00/);
    await page.keyboard.press("ArrowRight");
    await expect(slider(page)).toHaveAttribute("aria-valuetext", /2026-11-15 01:00/);
    await page.keyboard.press("Shift+ArrowRight");
    await expect(slider(page)).toHaveAttribute("aria-valuetext", /2026-11-16 01:00/);
    await page.keyboard.press("ArrowLeft");
    await expect(slider(page)).toHaveAttribute("aria-valuetext", /2026-11-16 00:00/);
    await page.keyboard.press("End");
    await expect(slider(page)).toHaveAttribute("aria-valuetext", /2026-11-28 23:00/);
    await page.keyboard.press("Space");
    await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
    await page.keyboard.press("Space");
    await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();

    // loop: from the end, playing wraps back to the start
    await page.getByText("↻ Loop").click();
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.waitForTimeout(2000);
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await expect(slider(page)).toHaveAttribute("aria-valuetext", /2026-11-1[5-6]/);

    expect(net.since(n0), "API requests while playing/scrubbing").toEqual([]);
  });

  test("⏭ next event lands on a margin of ~0; scrubbing keeps sky plot, chips and countdowns consistent", async ({ page }) => {
    await openNavigator(page, "site=shackleton-ridge&start=2026-11-15T00:00:00Z&days=14&mode=expert");
    await page.locator("h1:visible").click();
    await page.keyboard.press("Home");
    await page.getByRole("button", { name: "Jump to next event" }).click();
    await expect(slider(page)).toHaveAttribute("aria-valuetext", /2026-11-17 17:(1\d|2\d)/);
    const margins = (await chips(page).allInnerTexts()).join(" ");
    expect(margins).toMatch(/margin [+−]0\.[0-2]\d°/); // the Earth's margin at earthrise

    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Shift+ArrowRight");
      const aria = (await sky(page).getAttribute("aria-label")) ?? "";
      const sunPart = aria.split("Sun azimuth")[1].split("Earth azimuth")[0];
      const earthPart = aria.split("Earth azimuth")[1];
      const [sunChip, earthChip] = await chips(page).allInnerTexts();
      const at = await slider(page).getAttribute("aria-valuetext");
      expect(/visible/.test(sunPart), `sun @ ${at}: "${sunPart}" vs "${sunChip}"`).toBe(/Sun up/.test(sunChip));
      expect(/visible/.test(earthPart), `earth @ ${at}: "${earthPart}" vs "${earthChip}"`).toBe(/Earth in view/.test(earthChip));
    }
  });
});

/** Step 6: metrics and modes (desktop). */
test.describe("metrics + modes", () => {
  test.beforeEach(({}, ti) => onlyOn(ti, "desktop"));

  test("Simple: plain words, Why? lead + bullets, story card, dismissible hints", async ({ page }) => {
    await openNavigator(page, "site=change-4&start=2026-12-01T00:00:00Z&days=14&mode=simple");
    const [sunChip, earthChip] = await chips(page).allInnerTexts();
    expect(sunChip).not.toMatch(/margin|°/);
    expect(earthChip).not.toMatch(/margin|°/);
    await page.getByRole("button", { name: "Why?" }).click();
    const note = page.getByRole("note");
    await expect(note.locator("p")).toContainText(/because/);
    // One lead sentence + one bullet per remaining verdict reason.
    const reasons = await page.locator("section", { has: page.locator("#verdict-h") }).locator("ul").last().locator("li").count();
    expect(await note.locator("li").count()).toBe(Math.max(0, reasons - 1));
    await expect(page.getByRole("complementary", { name: "About this site" })).toBeVisible();
    const hint = page.getByRole("button", { name: "Dismiss hint" });
    await expect(hint).toBeVisible();
    const first = await page.locator('[role="status"]', { has: hint }).innerText();
    await hint.click();
    await expect(page.locator('[role="status"]', { has: hint })).not.toHaveText(first);
  });

  test("Expert: exact numbers, fields, events, raw horizon, data table row click, downloads", async ({ page }) => {
    await openNavigator(page, "site=shackleton-ridge&start=2026-11-15T00:00:00Z&days=14&step=60&mode=expert");
    expect((await chips(page).allInnerTexts()).join(" ")).toMatch(/margin [+−]\d+\.\d\d°/);
    await expect(page.getByLabel("Earth margin in degrees (0 to 10)")).toBeVisible();
    await expect(page.getByLabel("Time step in minutes (5 to 1440)")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Events in this window" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Raw horizon" })).toBeVisible();
    const table = page.getByLabel(/Time series table, 336 rows/);
    await expect(table).toBeVisible();
    await table.locator("tbody tr", { hasText: "2026-11-15 05:00" }).first().click();
    await expect(slider(page)).toHaveAttribute("aria-valuetext", /2026-11-15 05:00/);

    const dl = async (name: RegExp) => {
      const [d] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name }).click()]);
      return { name: d.suggestedFilename(), text: readFileSync((await d.path())!, "utf8") };
    };
    const csv = await dl(/Time series CSV/);
    expect(csv.name).toBe("shadowline_shackleton-ridge_20261115_14d.csv");
    const rows = csv.text.split("\n").filter((l) => l && !l.startsWith("#"));
    expect(rows[0]).toBe("time_utc,sun_az_deg,sun_el_deg,sun_horizon_el_deg,sun_visible_fraction,earth_az_deg,earth_el_deg,earth_horizon_el_deg,earth_visible");
    expect(rows.length - 1).toBe((14 * 24 * 60) / 60);
    const json = await dl(/Raw JSON/);
    expect(JSON.parse(json.text).times.length).toBe(336);
    const ev = await dl(/Events CSV/);
    expect(ev.text.split("\n")[0]).toBe("event,time_utc,hours_from_start");
  });

  test("Earth margin 2° lowers Earth % with one refetch; mode=expert URL opens Expert", async ({ page }) => {
    await openNavigator(page, "site=shackleton-ridge&start=2026-11-15T00:00:00Z&days=14&mode=expert");
    await expect(page.getByRole("radiogroup", { name: "Detail level" }).getByRole("radio", { name: "Expert" })).toHaveAttribute("aria-checked", "true");
    const before = await summaryPct(page, "Earth in view");
    const net = countApiRequests(page);
    const field = page.getByLabel("Earth margin in degrees (0 to 10)");
    await field.fill("2");
    await field.press("Enter");
    await expect(page).toHaveURL(/emargin=2/);
    await expect.poll(() => summaryPct(page, "Earth in view"), { timeout: 60_000 }).toBeLessThan(before);
    expect(net.urls.filter((u) => u.includes("/visibility")).length).toBe(1);
  });
});
