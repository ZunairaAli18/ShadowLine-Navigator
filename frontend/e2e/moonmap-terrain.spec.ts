import type { Page } from "@playwright/test";

import { expect, onlyOn, openNavigator, test } from "./fixtures";

/** One-finger drag across the centre of an element, with real (CDP) touch events. */
async function touchDrag(page: Page, selector: string, dx: number) {
  const box = (await page.locator(selector).first().boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let i = 1; i <= 10; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + (dx * i) / 10, y }] });
    await page.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

/** Step 9: Moon map. */
test.describe("moon map", () => {
  test("desktop: 3D mounts, presets, surface click sets a custom site, play moves the light, 3D<->2D, 2D dot selects", async ({ page }, ti) => {
    onlyOn(ti, "desktop");
    await openNavigator(page, "site=shackleton-ridge&start=2026-11-15T00:00:00Z&days=14&tab=map");
    const canvas = page.locator("[data-globe-active] canvas");
    await expect(canvas).toBeVisible({ timeout: 60_000 });
    await canvas.scrollIntoViewIfNeeded();
    await page.waitForTimeout(2500);

    for (const p of ["Near side", "Far side", "South pole", "Current site"]) {
      const b = page.getByRole("button", { name: p, exact: true });
      await b.click();
      await expect(b).toHaveAttribute("aria-pressed", "true");
    }

    // playing / scrubbing moves the day-night line: the rendered globe changes
    await page.getByRole("button", { name: "Near side", exact: true }).click();
    await page.waitForTimeout(1500);
    const before = await canvas.screenshot();
    await page.locator("h1:visible").click();
    for (let i = 0; i < 4; i++) await page.keyboard.press("Shift+ArrowRight");
    await page.waitForTimeout(1500);
    const after = await canvas.screenshot();
    expect(Buffer.compare(before, after)).not.toBe(0);

    // click the surface (left of centre, inside the disk) -> custom site + toast
    const box = (await canvas.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2 - box.height * 0.18, box.y + box.height / 2);
    await expect(page.getByRole("status").filter({ hasText: /Custom site set/ })).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/lat=-?\d/);

    // 3D <-> 2D, and a 2D dot selects a site
    await page.getByRole("radiogroup", { name: "Map view" }).getByRole("radio", { name: "2D map" }).click();
    await expect(canvas).toHaveCount(0);
    await page.getByRole("button", { name: /^Apollo 11 \(Tranquility Base\), Equatorial/ }).first().click();
    await expect(page.locator("h1:visible")).toHaveText(/Apollo 11/, { timeout: 60_000 });
    await page.getByRole("radiogroup", { name: "Map view" }).getByRole("radio", { name: "3D globe" }).click();
    await expect(page.locator("[data-globe-active] canvas")).toBeVisible({ timeout: 60_000 });
  });

  test("tablet/phone: touch globe + 2D map; page still scrolls outside the canvas", async ({ page }, ti) => {
    onlyOn(ti, "tablet", "phone");
    await openNavigator(page, "site=shackleton-ridge&tab=map");
    const globe = page.locator("[data-globe-active]");
    await expect(globe).toBeVisible({ timeout: 60_000 });
    await globe.scrollIntoViewIfNeeded();
    // touch is captured only inside the canvas
    const inside = await globe.evaluate((el) => [...el.querySelectorAll("*")].some((e) => getComputedStyle(e).touchAction === "none"));
    expect(inside).toBe(true);
    await touchDrag(page, "[data-globe-active] canvas", 120);

    // Page scrolling outside the canvas: headless Chromium can't synthesize a real touch scroll, so check the
    // CSS that decides it: touch-action:none only inside the 3D map, everything else keeps "auto".
    const blockers = await page.evaluate(() =>
      [...document.querySelectorAll("body *")]
        .filter((e) => getComputedStyle(e).touchAction === "none" && !e.closest("[data-globe-active]"))
        .map((e) => e.tagName + "." + String((e as HTMLElement).className).slice(0, 40)),
    );
    expect(blockers, "elements outside the 3D map that block touch scrolling").toEqual([]);
    expect(await page.evaluate(() => getComputedStyle(document.body).touchAction)).toBe("auto");
    test.info().annotations.push({ type: "needs-human", description: "real finger scrolling over the page on a phone" });

    await page.getByRole("radiogroup", { name: "Map view" }).getByRole("radio", { name: "2D map" }).click();
    await expect(page.getByRole("group", { name: /Map of the whole Moon/ })).toBeVisible();
    await page.getByRole("button", { name: /^IM-2 Athena/ }).first().click();
    await expect(page.locator("h1:visible")).toHaveText(/IM-2/, { timeout: 60_000 });
  });
});

/** Step 10: 3D terrain. */
test.describe("3D terrain", () => {
  const toggle = (page: Page) => page.getByRole("radiogroup", { name: "Sky panel view" }).getByRole("radio", { name: /3D terrain/ });
  const terrain = (page: Page) => page.locator("[data-terrain-active]");

  test("desktop: enabled for shackleton + im-2, disabled for apollo-11; cameras and buttons; hidden Sun agrees", async ({ page }, ti) => {
    onlyOn(ti, "desktop");
    await openNavigator(page, "site=apollo-11&mode=expert");
    await expect(toggle(page)).toHaveAttribute("aria-disabled", "true");
    await expect(toggle(page)).toHaveAttribute("title", "3D terrain is available for Shackleton ridge and IM-2");

    await openNavigator(page, "site=im-2&mode=expert");
    await expect(toggle(page)).toHaveAttribute("aria-disabled", "false");

    // Sun hidden behind the skyline at this moment (Sky panel) -> terrain HUD says hidden too
    await openNavigator(page, "site=shackleton-ridge&start=2027-02-11T00:00:00Z&days=14&t=2027-02-21T04:00:00Z&mode=expert");
    const sunChip = page.locator('[aria-live="off"] span.rounded-full').first();
    await expect(sunChip).toContainText(/Sun down/);
    await toggle(page).click();
    await expect(terrain(page)).toBeVisible({ timeout: 90_000 });
    await terrain(page).scrollIntoViewIfNeeded();
    await expect(terrain(page).locator('[aria-live="off"]')).toContainText(/Sun .*hidden/i);

    for (const step of ["Zoom to lander", "Back to overview", "Lander's eye", "Look at Sun", "Look at Earth", "Overview"]) {
      await terrain(page).getByRole(step.includes("eye") || step === "Overview" ? "radio" : "button", { name: new RegExp(step) }).click();
      await page.waitForTimeout(400);
    }
    // switching views repeatedly: no console errors (checked by the fixture)
    for (let i = 0; i < 3; i++) {
      await page.getByRole("radiogroup", { name: "Sky panel view" }).getByRole("radio", { name: "Sky plot" }).click();
      await toggle(page).click();
      await expect(terrain(page)).toBeVisible({ timeout: 60_000 });
    }
  });

  test("phone: lite terrain, Expand + Esc", async ({ page }, ti) => {
    onlyOn(ti, "phone");
    await openNavigator(page, "site=im-2&view=terrain");
    await expect(terrain(page)).toBeVisible({ timeout: 90_000 });
    await expect(terrain(page)).toHaveAttribute("data-terrain-lite", "true");
    await terrain(page).scrollIntoViewIfNeeded();
    await page.waitForTimeout(5000); // the lite FPS probe runs for ~4 s
    const fellBack = await page.getByText(/too heavy for this device/).isVisible();
    test.info().annotations.push({ type: "note", description: fellBack ? "software GL was too slow: lite watchdog fell back (expected in CI)" : "lite terrain stayed up" });
    test.skip(fellBack, "headless software GL too slow for the lite FPS watchdog; needs a real phone");
    await terrain(page).getByRole("button", { name: /Expand the 3D view/ }).click();
    const box = (await terrain(page).boundingBox())!;
    expect(Math.round(box.width)).toBe(375);
    expect(Math.round(box.y)).toBe(0);
    await page.keyboard.press("Escape");
    await expect(terrain(page)).not.toHaveAttribute("data-terrain-expanded-panel", "true");
    expect((await terrain(page).boundingBox())!.width).toBeLessThan(375);
  });
});
