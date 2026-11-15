"""Test settings: no background warm-up (it would race the cache-counting tests)."""

import os

os.environ["SHADOWLINE_WARMUP"] = "0"
