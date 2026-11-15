# Deploying Shadowline

The backend (FastAPI) runs on **Render** as a free web service. The frontend (Next.js) runs on **Vercel**.
Everything is already set up in the repo. These steps are the dashboard clicks.

| Part | Host | Config in the repo |
|---|---|---|
| API | Render (free web service) | `render.yaml`, `backend/requirements.txt`, `backend/.python-version`, `backend/scripts/fetch_kernels.py` |
| Web app | Vercel | `frontend/` (Next.js auto-detected), `frontend/.env.example` |

Order matters a little: deploy the API first (you need its URL for Vercel), then the frontend, then go back
to Render and allow the Vercel URL for CORS.

---

## 0. Push to GitHub

```bash
git push origin main
```

Render and Vercel both deploy from the GitHub repo (`ZunairaAli18/ShadowLine-Navigator`, branch `main`).

---

## 1. Backend on Render

### Option A: Blueprint (recommended, uses `render.yaml`)

1. Go to <https://dashboard.render.com> → **New** → **Blueprint**.
2. Connect GitHub if asked, then pick the **ShadowLine-Navigator** repo and branch **main**.
3. Render reads `render.yaml` and shows one service, **shadowline-api** (free plan). Click **Apply** / **Deploy Blueprint**.
4. Leave the env vars as they are for now. `ALLOWED_ORIGINS` has a placeholder; you fix it in step 3.

### Option B: Manual web service (same settings)

**New** → **Web Service** → pick the repo, then:

| Setting | Value |
|---|---|
| Name | `shadowline-api` |
| Language / Runtime | Python 3 |
| Branch | `main` |
| Root Directory | `backend` |
| Build Command | `pip install -r requirements.txt && python scripts/fetch_kernels.py` |
| Start Command | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| Instance Type | Free |
| Health Check Path (Advanced) | `/health` |

Environment variables (**Environment** tab):

| Key | Value |
|---|---|
| `PYTHON_VERSION` | `3.13.0` |
| `ALLOWED_ORIGINS` | `https://your-app.vercel.app` (placeholder; real value in step 3) |
| `ALLOWED_ORIGIN_REGEX` | `https://.*\.vercel\.app` (optional: allows Vercel preview URLs) |

### Wait for the build, then check it

1. Open the service → **Logs**. The build installs 5 packages and then prints:
   ```
   Kernels -> /opt/render/project/src/backend/app/data/kernels
     downloaded de421.bsp (16,790,528 bytes, …)
     …
   All 4 kernels present.
   ```
   Then on start: `CORS origins: …` and `warm-up: 11 sites + globe for … in … s`.
2. Copy the service URL from the top of the page, e.g. `https://shadowline-api.onrender.com`.
3. Open `https://<render-url>/health`. You must see:
   ```json
   {"status":"ok","ephemeris_loaded":true}
   ```
   If `ephemeris_loaded` is `false`, see Troubleshooting → 503.
4. Optional: `https://<render-url>/docs` shows the interactive API docs.

---

## 2. Frontend on Vercel

1. Go to <https://vercel.com/new> → **Import Git Repository** → pick **ShadowLine-Navigator**.
2. **Root Directory**: click **Edit** → choose `frontend` → **Continue**.
   Framework preset should say **Next.js** (auto-detected). Leave build settings at their defaults
   (`npm run build`, output `.next`, install `npm install`).
3. **Environment Variables**: add

   | Key | Value | Environments |
   |---|---|---|
   | `NEXT_PUBLIC_API_URL` | `https://<render-url>` (no trailing slash) | Production, Preview, Development |

4. Click **Deploy**. The build doesn't call the backend (the API types are committed), so it works even if
   Render is asleep.
5. Copy the production URL, e.g. `https://shadowline.vercel.app` (Project → **Domains**).

> `NEXT_PUBLIC_API_URL` is baked into the build. If you change it later, **redeploy**
> (Deployments → ⋯ → Redeploy) or the old value stays.

---

## 3. Back on Render: allow the Vercel URL (CORS)

1. Render → **shadowline-api** → **Environment**.
2. Set `ALLOWED_ORIGINS` to your Vercel production URL, exactly as the browser shows it, with **no trailing
   slash**: `https://shadowline.vercel.app`.
   To allow more than one, separate them with commas:
   `https://shadowline.vercel.app,https://www.your-domain.com`
3. Keep `ALLOWED_ORIGIN_REGEX` = `https://.*\.vercel\.app` if you want Vercel preview deployments to work too
   (delete it to allow production only).
4. **Save Changes** → choose **Save and Deploy** (or Manual Deploy → Deploy latest commit). Wait for "Live".
5. In the logs, the start-up line should now read `CORS origins: https://shadowline.vercel.app + regex …`.

---

## 4. Post-deploy checklist

Do this on the Vercel URL, first in a normal window and then in a **private window** (no cache), on a
**desktop** and on a **phone**.

- [ ] `https://<render-url>/health` → `{"status":"ok","ephemeris_loaded":true}`
- [ ] **Landing** `/`: the hero shows the 3D Moon (desktop) or the 2D sky (phone); the HUD line under the
      buttons shows live Sun numbers; **Live conditions** fills 4 site cards with verdicts.
- [ ] **Navigator** `/app?site=shackleton-ridge`: the sky plot draws (Dome and Panorama), metrics and
      countdowns fill, the verdict shows, **▶** on the timeline plays and the Sun moves smoothly.
- [ ] **Compare** tab: each preset button loads 2–3 scenarios side by side.
- [ ] **Best dates** tab: site `apollo-11`, range **1 Dec 2026 – 31 Jan 2027** → the top windows include
      **15 Dec** and **13 Jan**.
- [ ] **3D terrain** (desktop): on `/app?site=shackleton-ridge`, switch the Sky panel to **3D terrain**; the
      40 km terrain loads with shadows; **Lander's eye** shows the skyline, Sun and Earth. (`/terrain-patch?site_id=im-2`
      on the API returns JSON with a `bin_url`; the patch files are committed, nothing to configure.)
- [ ] **Moon map** tab: 3D globe with labels on desktop; 2D map on a phone. Switching tabs leaves no errors.
- [ ] **Simple / Expert** toggle: Expert shows the Earth margin and step fields, the raw horizon and data
      table; **⬇ Time series CSV** downloads `shadowline_<site>_<date>_14d.csv`.
- [ ] **Learn** `/learn`: the live sections (two skies, Earth bobbing, flat vs real terrain) load.
- [ ] A made-up URL such as `/nope` shows the "Lost in the shadows" 404 page.
- [ ] Browser console (F12): no red errors, no CORS messages.
- [ ] **Cold start**: leave the site alone for about 15 minutes (Render free instances sleep), then open it
      in a private window. You should see the "Waking up the model… (can take up to a minute)" notice, then
      the data appears without an error and without reloading.

---

## 5. Troubleshooting

**CORS error in the browser console** ("blocked by CORS policy: No 'Access-Control-Allow-Origin' header")
- `ALLOWED_ORIGINS` on Render must match the page's origin exactly: `https://`, the full host, no trailing
  slash, no path. Copy it from the browser's address bar.
- A Vercel *preview* URL (`https://shadowline-git-…vercel.app`) needs `ALLOWED_ORIGIN_REGEX`.
- After changing env vars, Render must redeploy (Save and Deploy). Check the `CORS origins:` log line.
- A 500 error from the API can also show up as a CORS error. Check the Render logs for a traceback.

**503 "Ephemeris not loaded"** / `/health` says `ephemeris_loaded: false`
- The kernel files are missing. The build command must include `&& python scripts/fetch_kernels.py`.
  Check the build log for `All 4 kernels present.` If a download failed (NAIF hiccup), use
  **Manual Deploy → Clear build cache & deploy**.
- `/health`, `/sites` and `/horizon` still work in this state; everything that needs positions returns 503.

**Slow first load / "Waking up the model…"**
- Normal on the free plan: the instance sleeps after ~15 minutes idle and needs up to a minute to wake.
  The app pings `/health` as soon as any page opens and retries requests for up to 60 s.
- Before a demo, open `https://<render-url>/health` a minute early to wake it.
- If it still fails after a minute, check the Render dashboard (the service may be redeploying or failing).

**The app calls `http://127.0.0.1:8000` or the wrong API**
- `NEXT_PUBLIC_API_URL` is missing or misspelled on Vercel (it must start with `NEXT_PUBLIC_`), or the
  project wasn't redeployed after setting it. Fix it, then Redeploy.

**Env var typos to double-check**
- Render: `ALLOWED_ORIGINS` (plural, with an S), `ALLOWED_ORIGIN_REGEX`, `PYTHON_VERSION`.
- Vercel: `NEXT_PUBLIC_API_URL`, with no trailing slash on the URL.

**Build fails on Render with a Python version error**
- Set `PYTHON_VERSION=3.13.0` (`backend/.python-version` also pins it).

**Link previews show a `localhost` image**
- Vercel sets the production domain automatically. For a custom domain, add
  `NEXT_PUBLIC_SITE_URL=https://your-domain` on Vercel and redeploy.
