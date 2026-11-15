import { expect, layoutIssues, onlyOn, openNavigator, tabButton, test } from "./fixtures";

/** Step 11: Learn page (desktop). */
test.describe("learn page", () => {
  test.beforeEach(({}, ti) => onlyOn(ti, "desktop"));

  test("live skies load and play together; hill slider; EarthBob; flat vs terrain; glossary", async ({ page }) => {
    await page.goto("/learn", { waitUntil: "domcontentloaded" });
    const skies = page.locator('svg[role="img"][aria-label*="sky plot at"]');
    await skies.first().scrollIntoViewIfNeeded();
    await expect(skies).toHaveCount(2, { timeout: 90_000 });
    const before = await skies.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
    await page.getByRole("button", { name: "Play both skies" }).click();
    await page.waitForTimeout(2500);
    await page.getByRole("button", { name: "Pause both skies" }).click();
    const after = await skies.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
    expect(after[0]).not.toBe(before[0]);
    expect(after[1]).not.toBe(before[1]);
    const time = (s: string | null) => s?.match(/sky plot at ([^.]+UTC)/)?.[1];
    expect(time(after[0])).toBe(time(after[1])); // one playback drives both

    // hill slider: ridge top at 3°
    const el = page.getByLabel("Sun elevation");
    const meter = page.getByRole("meter", { name: "Solar power" });
    await el.scrollIntoViewIfNeeded();
    for (const [v, p] of [["3", "50"], ["2", "0"], ["4", "100"]] as const) {
      await el.fill(v);
      await expect(meter).toHaveAttribute("aria-valuenow", p);
    }

    // EarthBob
    const bob = page.locator('svg[role="img"][aria-label^="Earth seen from Shackleton ridge"]');
    await bob.scrollIntoViewIfNeeded();
    await expect(bob).toBeVisible({ timeout: 90_000 });

    // flat vs terrain: the two cards differ
    const flat = page.locator("div", { has: page.getByRole("heading", { name: "If the ground were flat" }) }).last();
    const real = page.locator("div", { has: page.getByRole("heading", { name: "With the real terrain" }) }).last();
    await flat.scrollIntoViewIfNeeded();
    await expect(real).toBeVisible({ timeout: 90_000 });
    expect((await flat.innerText()).replace(/\s+/g, " ")).not.toBe((await real.innerText()).replace(/\s+/g, " "));

    // glossary
    const first = page.locator("details").first();
    await first.locator("summary").click();
    await expect(first).toHaveAttribute("open", "");
  });

  test("CTAs and 'See the numbers' links open the right navigator state", async ({ page }) => {
    await page.goto("/learn", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);
    const hrefs = await page.locator('a[href^="/app"]').evaluateAll((as) => as.map((a) => a.getAttribute("href")!));
    expect(hrefs.length).toBeGreaterThan(4);
    const sites = new Set(["shackleton-ridge", "im-2", "apollo-11", "change-4", "im-1", "chandrayaan-3", "apollo-15", "apollo-17", "blue-ghost-m1", "slim", "reiner-gamma"]);
    for (const h of hrefs) {
      const q = new URL(h, "https://x").searchParams;
      if (q.get("site")) expect(sites.has(q.get("site")!), h).toBe(true);
    }
    const numbers = hrefs.filter((h) => h.includes("mode=expert"));
    expect(numbers.length, "See the numbers links").toBeGreaterThanOrEqual(3);

    await page.locator(`a[href="${numbers[0]}"]`).first().click();
    await expect(page).toHaveURL(/\/app\?.*mode=expert/);
    // (Next 16 keeps the previous route mounted but hidden, so only visible headings count.)
    await expect(page.locator("h1:visible")).not.toHaveText(/Loading/, { timeout: 90_000 });
    await expect(page.getByRole("radiogroup", { name: "Detail level" }).getByRole("radio", { name: "Expert" })).toHaveAttribute("aria-checked", "true");
  });
});

/** Step 12: responsive, on all four projects. */
test.describe("responsive", () => {
  const pages: [string, string][] = [
    ["home", "/"],
    ["navigator", "/app?site=shackleton-ridge"],
    ["navigator compare", "/app?site=shackleton-ridge&tab=compare"],
    ["navigator best dates", "/app?site=shackleton-ridge&tab=best"],
    ["navigator moon map", "/app?site=shackleton-ridge&tab=map"],
    ["learn", "/learn"],
    ["404", "/this-page-does-not-exist"],
  ];

  for (const [name, url] of pages) {
    test(`no horizontal overflow, tap targets >= 24 px: ${name}`, async ({ page }) => {
      if (name === "404") test.info().annotations.push({ type: "allow-console", description: "status of 404" });
      if (url.startsWith("/app")) {
        await openNavigator(page, url.slice(5));
        if (url.includes("tab=")) await page.waitForTimeout(4000);
      } else {
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(4000);
      }
      // scroll through so lazy sections render
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 600) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 120));
        }
        window.scrollTo(0, 0);
      });
      const r = await layoutIssues(page);
      if (r.small.length) test.info().annotations.push({ type: "small-targets", description: r.small.join("; ") });
      expect(r.scrollWidth, `horizontal overflow: ${r.overflow.join(", ")}`).toBeLessThanOrEqual(r.width);
      expect(r.overflow).toEqual([]);
      expect(r.small, "tap targets under 24 px").toEqual([]);
    });
  }

  test("tabs are reachable on this screen size", async ({ page }) => {
    await openNavigator(page, "site=im-2");
    for (const t of ["Compare", "Best dates", "Moon map"] as const) await expect(tabButton(page, t)).toBeVisible();
  });
});
