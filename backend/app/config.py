"""Settings read from environment variables (all optional; defaults suit local development).

ALLOWED_ORIGINS        comma-separated origins allowed by CORS
                       (default: http://localhost:3000,http://127.0.0.1:3000)
ALLOWED_ORIGIN_REGEX   optional regex for extra origins, e.g. https://.*\\.vercel\\.app for Vercel previews
SHADOWLINE_WARMUP      "0" turns off the background cache warm-up (the tests do this)
"""

import os

DEFAULT_ORIGINS = ("http://localhost:3000", "http://127.0.0.1:3000")


def allowed_origins(env: dict | None = None) -> list[str]:
    env = os.environ if env is None else env
    raw = env.get("ALLOWED_ORIGINS", "")
    # Browsers send the Origin without a trailing slash, so strip any pasted one.
    origins = [o.strip().rstrip("/") for o in raw.split(",") if o.strip()]
    return origins or list(DEFAULT_ORIGINS)


def allowed_origin_regex(env: dict | None = None) -> str | None:
    env = os.environ if env is None else env
    return env.get("ALLOWED_ORIGIN_REGEX", "").strip() or None


def warmup_enabled(env: dict | None = None) -> bool:
    env = os.environ if env is None else env
    return env.get("SHADOWLINE_WARMUP", "1").strip().lower() not in ("0", "false", "no", "off")
