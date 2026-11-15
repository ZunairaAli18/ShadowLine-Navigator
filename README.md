# Shadowline: Lunar Landing Site Navigator

**Where and when should you land on the Moon?** Shadowline answers that for any landing site and date range.
It works out where the Sun and Earth sit in the local sky, checks them against the real terrain horizon from
NASA's lunar laser altimeter, and reports when a lander would have **sunlight for power** and a **direct line
to Earth for radio contact**. Mission planners can compare sites and dates side by side, educators can show
why the lunar south pole is so hard, and anyone can scrub through a lunar day and watch the light move.

Built for the **NASA Space Apps Challenge 2026**, challenge **"CLPS Lunar Landing Site Navigator"**.

- **Live app:** `https://<your-app>.vercel.app` _(placeholder)_
- **API:** `https://<your-api>.onrender.com` _(placeholder; try `/health` and `/docs`)_

![Shadowline screenshot](docs/screenshot.png)
_(screenshot placeholder: add `docs/screenshot.png`)_

---

## Features

- **Navigator** (`/app`): pick a curated site (Apollo, CLPS, Chang'e, Chandrayaan, SLIM, south pole) or any
  latitude/longitude, a start date and a window of 1–60 days.
  - **Sky plot**: a dome view of the whole sky or a panorama of the horizon, with the real terrain skyline
    and the Sun and Earth paths drawn over it.
  - **Metrics**: sunlight %, Earth-in-view %, both at once, longest darkness, longest time without Earth.
  - **Countdowns** to the next sunrise, sunset, earthrise and earthset from the selected moment.
  - **Verdict**: Good / Risky / Not viable, always shown with colour, icon and the reasons.
  - **Timeline playback**: play or scrub through the window at 60 fps from data that's already loaded.
- **Compare**: 2–3 site/date/terrain scenarios side by side, with presets such as "flat ground vs real terrain".
- **Best landing dates**: slides a mission window across up to 180 days and ranks the best start times.
- **3D Moon map**: the Moon lit by the real Sun for the selected time, with the zone that can see Earth
  tinted, site markers and camera presets (a 2D map on phones and low-power devices).
- **Simple and Expert modes**: plain-English labels and a "Why?" explanation, or exact numbers, Earth
  antenna margin, custom time step, raw horizon, data table and **CSV / JSON export**.
- **Learn** (`/learn`): a three-minute guide with live interactive sections: the low polar Sun, hills that
  hide it, Earth bobbing on the horizon, and flat ground vs real terrain.

## How it works

1. **Sun and Earth positions**: [Skyfield](https://rhodesmill.org/skyfield/) with the JPL **DE421**
   ephemeris and the Moon's orientation kernels (`MOON_ME_DE421` frame). The observer stands on the lunar
   surface, so libration (the Moon's wobble, which makes Earth drift around its sky) is included
   automatically. Positions are apparent: light-time and aberration are applied.
2. **Terrain horizons**: for every curated site we built a 360-direction horizon profile offline from NASA
   **LOLA** elevation maps (the 80 m/pixel south-polar map where it fits, otherwise the global 64 px/degree
   map). Each direction is searched out to **150 km** with the exact spherical formula, so the Moon's
   curvature is included. The polar map is in the Moon's principal-axis frame, so it is rotated into the
   mean-Earth frame (**PA→ME correction**) to line up with the ephemeris.
3. **Visibility**: at each time step the Sun and Earth elevations are compared with the horizon height in
   their direction. The Sun is treated as a disk (~0.53°), so a Sun half hidden behind a ridge counts as
   half visible. Earth can be given an extra antenna margin.
4. **Metrics and verdict**: percentages, the longest dark and no-Earth stretches, power index, countdowns
   and a verdict with plain reasons. Custom points without a terrain file use a flat 0° horizon and say so.

## Accuracy

Our Sun and Earth positions were checked against **NASA JPL Horizons** for 4 sites at 4 dates
(32 comparisons): the largest difference was **0.04 arcseconds**, about 1/44,000 of the Sun's width.
Details: [`backend/validation/README.md`](backend/validation/README.md).

**Why terrain matters, in one example:** Shackleton connecting ridge, **11–25 February 2027**.
With flat ground, the model says **"Not viable, 0% Sun"**: the Sun stays just below the ideal horizon.
With the real LOLA terrain the ridge sits above the surrounding ground and the verdict becomes
**"Risky, 80.7% Sun"**. The landscape changes the answer completely.

## NASA data and resources used

- **LOLA** (Lunar Orbiter Laser Altimeter) elevation maps, NASA GSFC Planetary Geodesy Data Archive (PGDA):
  terrain horizons.
- **JPL Horizons** (NASA JPL Solar System Dynamics): validation of our positions.
- **DE421 and Moon orientation kernels** (NASA NAIF / JPL): Sun, Earth and Moon positions.
- **LROC QuickMap** and **Moon Trek** (NASA Solar System Treks): checking site coordinates and terrain.
- **CSA Moon exploration** resources (Canadian Space Agency): background for the learn page.
- **NASA SVS CGI Moon Kit** (LRO LROC/LOLA, credit NASA/GSFC/Arizona State University): 3D Moon textures.

## Local setup

Requirements: Python 3.11+ (we use 3.13) and Node.js 20.9+.

**Backend**

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt   # runtime + tests + offline scripts (runtime only: requirements.txt)
python scripts/fetch_kernels.py       # downloads the 4 JPL kernels (~19 MB) into app/data/kernels/
uvicorn app.main:app --reload         # http://127.0.0.1:8000 (docs at /docs)
pytest
```

**Frontend**

```bash
cd frontend
npm install
cp .env.example .env.local       # NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
npm run dev                      # http://localhost:3000
npm test && npm run lint
```

Deploying: see [DEPLOY.md](DEPLOY.md) (Render for the API, Vercel for the web app).

## Tech stack

- **Backend:** Python, FastAPI, Skyfield, NumPy, Pydantic. Offline tools: rasterio, pyproj, matplotlib.
- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, motion, GSAP + ScrollTrigger,
  Lenis, three.js with React Three Fiber and drei.
- **Hosting:** Render (API) and Vercel (web app).

## Project structure

```
backend/
  app/
    main.py            FastAPI app, CORS (env vars), startup, warm-up
    models.py          request/response models (the API contract)
    api/routes.py      endpoints: /health /sites /visibility /snapshot /horizon /compare /best-windows /globe-geometry
    core/              ephemeris, terrain, visibility, metrics, sites, warm-up
    data/              sites.json, horizons/<site>.json (kernels are downloaded, not committed)
  scripts/             fetch_kernels.py, build_horizon.py (LOLA -> horizon), validate_horizons.py
  validation/          comparison with JPL Horizons
  tests/
frontend/
  app/                 routes: / (landing), /app (navigator), /learn, 404, icons, Open Graph image
  components/          navigator, landing, learn, moon (3D), fx (motion), ui
  lib/                 api.ts (the only place that calls the backend), formatting, CSV, maths
render.yaml            Render blueprint for the API
DEPLOY.md              deployment steps
```

## Team

**Team Shadowline**, NASA Space Apps Challenge 2026.

## AI use

Built with help from **Claude Code** (Anthropic), which we used for writing and reviewing code, tests and
documentation. Every number and claim was checked by running the code: tests, validation against JPL
Horizons, and the scripts in `backend/scripts/`.

## License

MIT. See [LICENSE](LICENSE). NASA data and imagery keep their own terms (NASA content is generally not
subject to copyright in the United States; see each source's credit).

---

_Shadowline is not an official NASA product and is not endorsed by NASA._
