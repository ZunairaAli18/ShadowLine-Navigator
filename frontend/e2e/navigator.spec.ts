import { expect, onlyOn, openNavigator, test } from "./fixtures";

/** Step 3: navigator basics (desktop). */
test.describe("navigator basics", () => {
  test.beforeEach(({}, ti) => onlyOn(ti, "desktop"));

  const skyView = (page: import("@playwright/test").Page) => page.getByRole("radiogroup", { name: "Sky view" });

  test("defaults to shackleton-ridge in Panorama; apollo-11 switches to Dome; change-4 Earth out of view", async ({ page }) => {
    await openNavigator(page, "");
    await expect(page.locator("h1:visible")).toHaveText(/Shackleton/);
    await expect(skyView(page).getByRole("radio", { name: /Panorama/ })).toHaveAttribute("aria-checked", "true");

    await page.locator("select").first().selectOption("apollo-11");
    await expect(page.locator("h1:visible")).toHaveText(/Apollo 11/, { timeout: 60_000 });
    await expect(skyView(page).getByRole("radio", { name: /Dome/ })).toHaveAttribute("aria-checked", "true");

    await page.locator("select").first().selectOption("change-4");
    await expect(page.locator("h1:visible")).toHaveText(/Chang/, { timeout: 60_000 });
    await expect(page.locator('svg[role="img"][aria-label*="sky plot"]').first()).toHaveAttribute("aria-label", /Earth .*out of view/);
  });

  test("custom coordinates: validation, 320 -> -40, flat-horizon note", async ({ page }) => {
    await openNavigator(page, "site=shackleton-ridge");
    await page.locator("select").first().selectOption("__custom__");
    const lat = page.getByPlaceholder(/Lat/);
    const lon = page.getByPlaceholder(/Lon/);
    await lat.fill("95");
    await lon.fill("10");
    await expect(page.getByText("Latitude must be −90 to 90")).toBeVisible();
    await expect(page.getByRole("button", { name: "Go", exact: true })).toBeDisabled();
    await lat.fill("-85.2");
    await lon.fill("320");
    await page.getByRole("button", { name: "Go", exact: true }).click();
    await expect(page).toHaveURL(/lat=-85\.2/);
    await expect(page).toHaveURL(/lon=-40(&|$)/);
    await expect(page.locator("h1:visible")).toHaveText(/Custom/, { timeout: 60_000 });
    await expect(page.getByText(/Flat horizon: terrain data is available for curated sites/)).toBeVisible();
  });

  test("start date, Now, 7/14/30 chips, days=61 capped, step change", async ({ page }) => {
    await openNavigator(page, "site=apollo-11&start=2026-12-01T00:00:00Z&days=14");
    const date = page.locator('input[type="date"]').first();
    await date.fill("2026-12-05");
    await date.blur();
    await expect(page).toHaveURL(/start=2026-12-05T00%3A00%3A00Z/);
    await page.getByRole("button", { name: /^now$/i }).click();
    const nowHour = new Date();
    nowHour.setUTCMinutes(0, 0, 0);
    await expect(page).toHaveURL(new RegExp(`start=${encodeURIComponent(nowHour.toISOString().slice(0, 13))}`));
    for (const d of [7, 30, 14]) {
      await page.getByRole("button", { name: `${d} d`, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`days=${d}(&|$)`));
    }
    await page.goto("/app?site=apollo-11&days=61");
    await expect(page.locator("h1:visible")).not.toHaveText(/Loading/, { timeout: 90_000 });
    // Capped to 60 in the app state (the URL is rewritten on the next change).
    await expect(page.getByLabel("Mission length in days (1 to 60)")).toHaveValue("60");
    await page.getByRole("radio", { name: "3 h", exact: true }).click();
    await expect(page).toHaveURL(/step=180/);
    await expect(page).toHaveURL(/days=60(&|$)/);
    await expect(page.getByText(/\d+ steps · 60 d/i)).toBeVisible({ timeout: 60_000 });
  });

  test("terrain toggle changes the numbers", async ({ page }) => {
    await openNavigator(page, "site=shackleton-ridge&start=2027-02-11T00:00:00Z&days=14&mode=expert");
    const sunline = page.locator("section", { has: page.locator("#summary-h") });
    const real = await sunline.innerText();
    await page.getByRole("radiogroup", { name: "Horizon" }).getByRole("radio", { name: "Flat horizon" }).click();
    await expect(page).toHaveURL(/terrain=flat/);
    await expect(sunline).not.toHaveText(real, { timeout: 60_000 });
  });

  test("Copy link restores the same state in a new page; Back works", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openNavigator(page, "site=im-2&start=2026-12-01T00:00:00Z&days=7&step=30&terrain=flat&mode=expert");
    await page.getByRole("button", { name: /Copy link/ }).click();
    await expect(page.getByRole("button", { name: /Link copied/ })).toBeVisible();
    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link).toContain("site=im-2");
    const p2 = await context.newPage();
    await p2.goto(link);
    await expect(p2.locator("h1:visible")).toHaveText(/IM-2/, { timeout: 90_000 });
    for (const part of ["days=7", "step=30", "terrain=flat", "mode=expert", "start=2026-12-01"]) expect(p2.url()).toContain(part);
    await expect(p2.getByRole("button", { name: "7 d", exact: true })).toHaveAttribute("aria-pressed", "true");
    await p2.close();

    // Back button: a site change pushes history; Back returns to the previous site.
    await page.locator("select").first().selectOption("apollo-11");
    await expect(page.locator("h1:visible")).toHaveText(/Apollo 11/, { timeout: 60_000 });
    await page.goBack();
    await expect(page.locator("h1:visible")).toHaveText(/IM-2/, { timeout: 60_000 });
  });
});
