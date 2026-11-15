import { expect, test as base, type Page, type TestInfo } from "@playwright/test";

import { API_URL } from "../playwright.config";

export { expect };
export { API_URL };

/**
 * Every test fails on console errors / uncaught page errors, except patterns a test explicitly allows with
 * allowConsole() (used only by the "breaking it" tests, e.g. expected network failures).
 */
export const test = base.extend<{ consoleGuard: void }>({
  consoleGuard: [
    async ({ page }, use, testInfo) => {
      const errors: string[] = [];
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });
      page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
      await use();
      const allowed = testInfo.annotations.filter((a) => a.type === "allow-console").map((a) => new RegExp(a.description ?? "^$"));
      const bad = errors.filter((e) => !allowed.some((re) => re.test(e)));
      if (bad.length) await testInfo.attach("console-errors", { body: bad.join("\n\n"), contentType: "text/plain" });
      expect(bad, `console errors:\n${bad.join("\n")}`).toEqual([]);
    },
    { auto: true },
  ],
});

/** Allow console errors matching `pattern` in this test (expected failures only). */
export function allowConsole(pattern: string) {
  test.info().annotations.push({ type: "allow-console", description: pattern });
}

/** Run only on these projects. */
export function onlyOn(testInfo: TestInfo, ...projects: string[]) {
  test.skip(!projects.includes(testInfo.project.name), `only on ${projects.join(", ")}`);
}

/** GET JSON from the API with a generous timeout. */
export async function api<T = unknown>(path: string): Promise<T> {
  const r = await fetch(`${API_URL}${path}`, { signal: AbortSignal.timeout(90_000) });
  if (!r.ok) throw new Error(`${path} -> ${r.status} ${await r.text()}`);
  return (await r.json()) as T;
}

/** Count requests to the API host made by the page. */
export function countApiRequests(page: Page) {
  const host = new URL(API_URL).host;
  const urls: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).host === host) urls.push(r.url());
  });
  return {
    get count() {
      return urls.length;
    },
    since(n: number) {
      return urls.slice(n);
    },
    urls,
  };
}

/** Open the navigator and wait until the visibility data has loaded (title is the site name, not "Loading…"). */
export async function openNavigator(page: Page, query: string) {
  await page.goto(`/app?${query}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("h1:visible")).not.toHaveText(/Loading/, { timeout: 90_000 });
  await expect(page.getByText(/\d+ steps · \d+ d/i)).toBeVisible({ timeout: 90_000 });
}

/** The two status chips at the selected time (Sun, Earth). */
export function statusChips(page: Page) {
  return page.locator("section[aria-labelledby], div").filter({ has: page.locator("#verdict-h") }).first();
}

/** Text of a countdown card, e.g. "NEXT SUNRISE". */
export async function countdownText(page: Page, label: RegExp) {
  return (await page.locator("p.hud", { hasText: label }).first().locator("xpath=..").innerText()).replace(/\s+/g, " ");
}

/** Mission summary percentage for a bar label ("Sunlight", "Earth in view", "Both"); waits for the count-up to settle. */
export async function summaryPct(page: Page, label: string): Promise<number> {
  const section = page.locator("section", { has: page.locator("#summary-h") });
  const row = section.locator("div.mb-1", { hasText: label }).first();
  const read = async () => {
    const m = (await row.innerText()).match(/(\d+(?:\.\d+)?)%/);
    if (!m) throw new Error(`no % for ${label}`);
    return Number(m[1]);
  };
  let prev = await read();
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(300);
    const cur = await read();
    if (cur === prev) return cur;
    prev = cur;
  }
  return prev;
}

/** Verdict section text. */
export async function verdictText(page: Page) {
  return (await page.locator("section", { has: page.locator("#verdict-h") }).innerText()).replace(/\s+/g, " ");
}

/** Navigator tab buttons. */
export function tabButton(page: Page, name: "Compare" | "Best dates" | "Moon map") {
  return page.getByRole("navigation", { name: "Navigator tools" }).getByRole("button", { name: new RegExp(name) });
}

/** Horizontal overflow + small tap targets on the current page. */
export async function layoutIssues(page: Page) {
  return page.evaluate(() => {
    const W = document.documentElement.clientWidth;
    const visible = (e: Element) => {
      for (let p: Element | null = e; p; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return false;
      }
      return true;
    };
    const clipped = (e: Element) => {
      for (let p = e.parentElement; p; p = p.parentElement) if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(p).overflowX)) return true;
      return false;
    };
    const overflow = [...document.querySelectorAll("body *")]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && visible(e) && !clipped(e) && (r.right > W + 1 || r.left < -1);
      })
      .slice(0, 8)
      .map((e) => `${e.tagName.toLowerCase()}.${String((e as HTMLElement).className).slice(0, 50)}`);
    // Inline links inside running text are exempt from the 24 px target size (WCAG 2.5.8).
    const inlineText = (e: Element) => getComputedStyle(e).display === "inline" && !!e.closest("p, li");
    const small = [...document.querySelectorAll("button, a[href], input:not([type=hidden]), select, [role=radio], [role=slider], summary")]
      .filter((e) => {
        if (!visible(e) || inlineText(e)) return false;
        const r = e.getBoundingClientRect();
        if (!r.width || !r.height) return false;
        if ((e as HTMLInputElement).type === "checkbox" && e.closest("label")) return false; // label is the target
        return r.width < 24 || r.height < 24;
      })
      .slice(0, 10)
      .map((e) => {
        const r = e.getBoundingClientRect();
        return `${e.tagName.toLowerCase()} "${((e as HTMLElement).innerText || e.getAttribute("aria-label") || "").trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`;
      });
    return { scrollWidth: document.documentElement.scrollWidth, width: W, overflow, small };
  });
}
