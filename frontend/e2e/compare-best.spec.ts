import { expect, onlyOn, openNavigator, test } from "./fixtures";

const cmpStarts = (url: string) =>
  decodeURIComponent(new URL(url).searchParams.get("cmp") ?? "")
    .split(",")
    .filter(Boolean)
    .map((s) => new Date(s.split("~")[1]).getTime());

/** Step 7: Compare (desktop). */
test.describe("compare", () => {
  test.beforeEach(({}, ti) => onlyOn(ti, "desktop"));

  test("presets, add/remove (max 3), best markers, open in navigator, cmp= URL restores", async ({ page, context }) => {
    await openNavigator(page, "site=shackleton-ridge&start=2026-11-15T00:00:00Z&days=14&tab=compare");
    const results = () => page.getByRole("button", { name: /Open in navigator/ });
    const loaded = (n: number) => expect(page.getByText(new RegExp(`${n} scenarios`, "i"))).toBeVisible({ timeout: 90_000 });

    for (const [label, n] of [["Flat vs real terrain", 2], ["Equator vs pole", 3], ["Launch slips", 3]] as const) {
      await page.getByRole("button", { name: label, exact: true }).click();
      await loaded(n);
      await expect(results()).toHaveCount(n);
    }
    // Launch slips: columns about one lunar day (~29.5 d) apart
    const starts = cmpStarts(page.url());
    for (let i = 1; i < starts.length; i++) expect((starts[i] - starts[i - 1]) / 86_400_000).toBeCloseTo(29.5, 0);
    await expect(page.getByText("★ best").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "+ Add scenario" })).toBeDisabled(); // 3 is the max

    await page.getByRole("button", { name: "Remove scenario C" }).click();
    await loaded(2);
    await page.getByRole("button", { name: "+ Add scenario" }).click();
    await loaded(3);

    // shared URL restores the same comparison
    const shared = page.url();
    const p2 = await context.newPage();
    await p2.goto(shared);
    await expect(p2.getByText(/3 scenarios/i)).toBeVisible({ timeout: 90_000 });
    expect(cmpStarts(p2.url())).toEqual(cmpStarts(shared));
    await p2.close();

    // open a column in the navigator
    await results().first().click();
    await expect(page).not.toHaveURL(/tab=compare/);
    await expect(page.locator("h1:visible")).not.toHaveText(/Loading/, { timeout: 60_000 });
  });
});

/** Step 8: Best dates (desktop). */
test.describe("best dates", () => {
  test.beforeEach(({}, ti) => onlyOn(ti, "desktop"));

  test("results, range strip, greyed not-viable rows, Load in navigator", async ({ page }) => {
    await openNavigator(page, "site=apollo-11&tab=best&bsite=apollo-11&bfrom=2026-12-01&bto=2027-01-31&bdays=10");
    await expect(page.getByRole("img", { name: /best windows across the range/ })).toBeVisible({ timeout: 90_000 });
    const rows = page.locator("ol > li");
    expect(await rows.count()).toBeGreaterThan(1);
    const notViable = rows.filter({ hasText: "Not viable" });
    if ((await notViable.count()) > 0) {
      const op = await notViable.first().locator("> div").evaluate((e) => getComputedStyle(e).opacity);
      expect(Number(op)).toBeLessThan(1);
    }
    await rows.first().getByRole("button", { name: /Load in navigator/ }).click();
    await expect(page).not.toHaveURL(/tab=best/);
    await expect(page).toHaveURL(/start=2026-12-1[4-6]/);
    await expect(page).toHaveURL(/days=10/);
  });

  test("change-4: friendly no-good-windows message, no crash", async ({ page }) => {
    await openNavigator(page, "site=change-4&tab=best&bsite=change-4&bfrom=2026-12-01&bto=2027-02-28&bdays=14");
    await expect(page.getByText(/No good windows in this range/)).toBeVisible({ timeout: 90_000 });
  });
});
