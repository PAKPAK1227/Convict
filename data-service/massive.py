"""Massive (formerly Polygon.io) data access — daily price history.

Used only by the nightly refresh_snapshots.py job. Free "Stocks Basic" plan:
end-of-day bars, 2 years of history, 5 calls/minute. The endpoints here are
chosen so call volume doesn't grow with tickers or users:

  grouped_daily(day)  every US stock's bar for one date        — 1 call/night
  splits_since(day)   every split executed since a date        — 1 call/night
  ticker_range(...)   one ticker's history (backfill only)     — rare

Every call goes through one module-level throttle (12.5s apart) and retries on
HTTP 429, so no caller can exceed the free tier. The key is sent as a bearer
header, never in the URL, so it can't leak into logs.
"""

import os
import time

import requests

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:  # env vars may be provided directly (e.g. Actions)
    pass

MASSIVE_API_KEY = os.getenv("MASSIVE_API_KEY")
MASSIVE_BASE = "https://api.massive.com"

REQUEST_TIMEOUT = 30
MIN_CALL_INTERVAL = 12.5     # 4.8 calls/minute, under the free tier's 5
MAX_RETRIES = 3
DEFAULT_RETRY_AFTER = 15.0


class Throttle:
    """Space calls at least `interval` seconds apart."""

    def __init__(self, interval, clock=time.monotonic, sleep=time.sleep):
        self.interval, self.clock, self.sleep = interval, clock, sleep
        self.last = None

    def wait(self):
        if self.last is not None:
            remaining = self.interval - (self.clock() - self.last)
            if remaining > 0:
                self.sleep(remaining)
        self.last = self.clock()


_throttle = Throttle(MIN_CALL_INTERVAL)


def _get(path, params=None, throttle=None, sleep=time.sleep):
    """GET a Massive endpoint (throttled; waits and retries on 429)."""
    throttle = throttle or _throttle
    headers = {"Authorization": f"Bearer {MASSIVE_API_KEY}"}
    for attempt in range(MAX_RETRIES + 1):
        throttle.wait()
        response = requests.get(f"{MASSIVE_BASE}{path}", params=params or {},
                                headers=headers, timeout=REQUEST_TIMEOUT)
        if response.status_code != 429 or attempt == MAX_RETRIES:
            response.raise_for_status()
            return response.json()
        try:
            wait = float(response.headers.get("Retry-After", DEFAULT_RETRY_AFTER))
        except ValueError:
            wait = DEFAULT_RETRY_AFTER
        sleep(max(wait, 1.0))


def grouped_daily(day):
    """Split-adjusted daily bars for every US stock on `day` (a date or ISO
    string). Empty list when the market was closed."""
    data = _get(f"/v2/aggs/grouped/locale/us/market/stocks/{day}", {"adjusted": "true"})
    return data.get("results") or []


def ticker_range(ticker, start, end):
    """Split-adjusted daily bars for one ticker between two dates, oldest first."""
    data = _get(f"/v2/aggs/ticker/{ticker}/range/1/day/{start}/{end}",
                {"adjusted": "true", "sort": "asc", "limit": 50000})
    return data.get("results") or []


def splits_since(day):
    """Splits (forward and reverse) executed on or after `day`."""
    data = _get("/stocks/v1/splits", {
        "execution_date.gte": str(day),
        "adjustment_type.any_of": "forward_split,reverse_split",
        "limit": 5000,
    })
    return data.get("results") or []
