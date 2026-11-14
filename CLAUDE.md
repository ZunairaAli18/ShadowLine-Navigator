# Shadowline: Lunar Landing Site Navigator

NASA Space Apps Challenge 2026 project (CLPS Lunar Landing Site Navigator challenge).

## What we're building
A web app that helps mission planners, educators and the public decide where and when to land on the Moon.
For any landing site and date range, it computes where the Sun and Earth are in the local sky, checks them
against the real terrain horizon, and reports power (sunlight) and direct-to-Earth communication windows.
Users can compare 2-3 site/date scenarios side by side.

## Repo layout
```
backend/    FastAPI + Skyfield (Python 3.11+)
frontend/   Next.js (built separately; consumes the backend API)
```

Backend structure:
```
backend/
  app/
    main.py              FastAPI app, CORS, startup (load ephemeris once)
    models.py            Pydantic request/response models (the API contract)
    api/routes.py        endpoints
    core/
      ephemeris.py       Sun & Earth az/el from a lunar surface point (Skyfield)
      terrain.py         load terrain horizon profiles; flat fallback
      visibility.py      Sun/Earth visible vs horizon at each time step
      metrics.py         sunlight %, dark periods, countdowns, verdict
    data/
      sites.json         curated landing sites
      horizons/          <site_id>.json terrain horizon profiles (360 values)
      kernels/           ephemeris files (de421.bsp, moon frame files) - gitignored
  scripts/
    build_horizon.py     LOLA DEM -> horizon profile (offline)
    validate_horizons.py compare our output against the JPL Horizons API
  tests/
```

## Conventions (follow everywhere)
- Angles in degrees.
- Azimuth: 0 = north, 90 = east, clockwise. Elevation: degrees above the local flat horizon.
- Longitude: east-positive. Accept -180..180 or 0..360 on input; normalize to -180..180 internally.
- Latitude: -90 (south pole) to 90.
- Times: UTC, ISO 8601 strings in the API (e.g. "2026-12-01T00:00:00Z").
- Moon mean radius R = 1737.4 km.
- Sun angular diameter ~0.53 deg; report the visible fraction of the solar disk (0-1), not just yes/no.

## Ephemeris approach
- Skyfield with DE421 (`de421.bsp`) plus Moon orientation files:
  `moon_080317.tf`, `pck00008.tpc`, `moon_pa_de421_1900-2050.bpc`.
- Frame: `MOON_ME_DE421`. Observer = `moon + pc.build_latlon_degrees(frame, lat, lon)`.
- `observer.at(t).observe(body).apparent().altaz()` for Sun and Earth.
- This handles libration automatically. Load kernels once at startup.

## Terrain approach
- Horizon profile = for each azimuth 0..359, the max elevation angle of surrounding terrain out to 150 km.
  Exact sphere formula (R = 1737400 m, d = angular distance, h0 = site height + 2 m observer height):
  angle = atan2((R+h)*cos(d) - (R+h0), (R+h)*sin(d)).  (Small-angle form: atan((h - h0 - d^2/(2R)) / d).)
- ALL curated sites (equatorial, far side and south pole) get LOLA horizon profiles, built offline by
  `scripts/build_horizon.py` from two DEMs in `backend/data_raw/` (gitignored):
  - `LDEM_80S_80MPP_ADJ.TIF` (south polar stereographic, 80 m/px) when the whole 150 km circle fits inside it,
  - otherwise the LOLA global 64 ppd GeoTIFF (simple cylindrical).
  CRS/transform are read from each file (rasterio + pyproj), never hardcoded.
- Custom lat/lon points (and any site without a horizons/<id>.json file) fall back to a flat 0 deg horizon,
  and the API must return `terrain: "flat"` so the UI can say so.

## API endpoints
- `GET /health`
- `GET /sites?region=`, `GET /sites/{site_id}`
- `GET /visibility?site_id=|lat=&lon=&start=&days=14&step_minutes=60&terrain_mode=auto&earth_margin_deg=0`
  -> time series + metrics (days <= 60)
- `GET /snapshot?site_id=|lat=&lon=&time=&terrain_mode=&earth_margin_deg=` -> positions + countdowns
  (countdowns look 30 days ahead at 30-minute steps)
- `GET /horizon?site_id=` -> terrain profile
- `POST /compare` -> 1-3 scenarios in, metrics for each out (same order, no time series)
- `GET /best-windows?site_id=|lat=&lon=&from=&to=&mission_days=14&candidate_step_hours=12&top=5&terrain_mode=`
  -> best mission start times in from..to (<= 180 days); one visibility run, sliding window
- Errors: 422 bad input, 404 unknown site, 400 outside ephemeris range, 503 ephemeris not loaded.
- compute_visibility results are cached in memory (LRU, 128 entries); every response has an
  `X-Process-Time-Ms` header and is logged with its duration.

## Frontend
- Stack: Next.js 16 (App Router, Turbopack, `cacheComponents` on) + React 19 + TypeScript + Tailwind CSS v4.
  Next 16 differs from older versions: check `frontend/node_modules/next/dist/docs/` before using an API.
  With `cacheComponents`, uncached server-side fetches must sit inside `<Suspense>` (or use `"use cache"`);
  interactive data fetching happens in client components.
- Layout:
  ```
  frontend/
    app/                 routes: / (landing), /app (navigator), /learn (guide), /styleguide
      layout.tsx         fonts, header, footer, starfield
      globals.css        Tailwind import + theme tokens (@theme) + eyebrow/starfield utilities
    components/          Header, Footer, Starfield, HorizonSilhouette
      ui/                Button, Card, Pill, SectionHeading, VerdictBadge (import from "@/components/ui")
    lib/api.ts           typed client: the ONLY place that calls the backend
    lib/api-types.ts     generated, don't edit
  ```
- Theme tokens (Tailwind utilities like `bg-surface`, `text-muted`, `border-border`, plus CSS vars `--color-*`):
  bg #0B0D1A, surface #141729, border #2A2E4A, accent #B9A6FF, accent-deep #7C5CFF, text #F4F2FF,
  muted #A7A9C4, sun #FFC56B, earth #5EC8FF, good #5BD69A, risky #FFB454, notviable #FF6B7A.
  Fonts: Sora for headings (`font-heading`), Inter for body (`font-body`). Use the `eyebrow` class for labels.
  Verdicts always show color AND text (`VerdictBadge`).
- API rule: all backend calls go through `lib/api.ts` (getSites, getSite, getHorizon, getVisibility, getSnapshot,
  compare, bestWindows). Errors are thrown as `ApiError` with the backend's `detail` as the message.
  Types come from `npm run gen:api` (backend must be running); re-run it after any `models.py` change.
- Config: `NEXT_PUBLIC_API_URL` (default `http://127.0.0.1:8000`); see `frontend/.env.example`.
- Run: `cd frontend && npm install && npm run dev` (http://localhost:3000). Lint: `npm run lint`.

## Working rules
- Build one chunk at a time. Finish each with a test or a script that prints real output.
- `models.py` is the contract with the frontend team. Don't change field names without saying so clearly.
- Keep it simple and readable; this is a 48-hour hackathon.
- Run backend: `cd backend && uvicorn app.main:app --reload`
- Run tests: `cd backend && pytest`
