import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against the deployed site (or a local one).
 *   npm run test:e2e
 *   E2E_BASE_URL=http://localhost:3000 E2E_API_URL=http://127.0.0.1:8000 npm run test:e2e
 */
export const BASE_URL = process.env.E2E_BASE_URL ?? "https://shadowline-navigator.vercel.app";
export const API_URL = (process.env.E2E_API_URL ?? "https://shadowline-navigator.onrender.com").replace(/\/+$/, "");

// Software WebGL so the 3D views can mount in headless Chromium.
const gl = { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] };

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 120_000,
  expect: { timeout: 25_000 },
  retries: 1, // a failure is re-run once before it counts
  workers: 2, // the API is a free Render instance: keep the load low
  fullyParallel: false,
  reporter: [["list"], ["json", { outputFile: "e2e-results/results.json" }], ["html", { open: "never", outputFolder: "e2e-results/html" }]],
  outputDir: "e2e-results/artifacts",
  use: {
    baseURL: BASE_URL,
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    navigationTimeout: 60_000,
    actionTimeout: 20_000,
    launchOptions: gl,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 }, launchOptions: gl } },
    { name: "laptop", use: { ...devices["Desktop Chrome"], viewport: { width: 982, height: 700 }, launchOptions: gl } },
    {
      name: "tablet",
      use: { browserName: "chromium", viewport: { width: 768, height: 1024 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, launchOptions: gl },
    },
    { name: "phone", use: { ...devices["iPhone 13"], browserName: "chromium", viewport: { width: 375, height: 812 }, launchOptions: gl } },
  ],
});
