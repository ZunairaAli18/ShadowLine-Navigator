import { API_URL } from "../playwright.config";

/** Wake the (free, sleeping) Render API before any test runs: poll /health until ephemeris_loaded (~90 s max). */
export default async function globalSetup() {
  const deadline = Date.now() + 120_000;
  let last = "";
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(30_000) });
      last = `${r.status} ${await r.text()}`;
      if (r.ok && last.includes('"ephemeris_loaded":true')) {
        console.log(`[e2e] API awake: ${API_URL}`);
        return;
      }
    } catch (e) {
      last = String(e);
    }
    await new Promise((r) => setTimeout(r, 5_000));
  }
  throw new Error(`API at ${API_URL} never became ready (last: ${last})`);
}
