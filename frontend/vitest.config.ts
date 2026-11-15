import { defineConfig } from "vitest/config";

// Unit tests only; the Playwright suite in e2e/ runs with `npm run test:e2e`.
export default defineConfig({
  test: { exclude: ["**/node_modules/**", "e2e/**", "e2e-results/**"] },
});
