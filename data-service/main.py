"""Finnhub data access for Convict.

This used to be a FastAPI service whose endpoints were never
deployed. It is only ever imported by evaluate_theses.py, so it is now a plain
module. Fetching (network) is kept separate from mapping (pure) so the mapping
logic can be unit-tested without hitting the network.
"""

import os
import time

import requests
from dotenv import load_dotenv

load_dotenv()

FINNHUB_API_KEY = os.getenv("FINNHUB_API_KEY")
FINNHUB_BASE = "https://finnhub.io/api/v1"

# Finnhub timeout (seconds) so a hung request can't stall the nightly job.
REQUEST_TIMEOUT = 15

# Retries after an HTTP 429 (rate limited). Both nightly jobs pace themselves
# under the free tier's 60/min, but a limit hit — e.g. a manual run overlapping
# a scheduled one — should cost a short wait, not a failed ticker.
MAX_RETRIES = 3
DEFAULT_RETRY_AFTER = 5.0


def _get(path, params, timeout=REQUEST_TIMEOUT, sleep=time.sleep):
    """GET a Finnhub endpoint, waiting and retrying on 429. Raises otherwise."""
    params = {**params, "token": FINNHUB_API_KEY}
    for attempt in range(MAX_RETRIES + 1):
        response = requests.get(f"{FINNHUB_BASE}{path}", params=params, timeout=timeout)
        if response.status_code != 429 or attempt == MAX_RETRIES:
            response.raise_for_status()
            return response.json()
        try:
            wait = float(response.headers.get("Retry-After", DEFAULT_RETRY_AFTER))
        except ValueError:
            wait = DEFAULT_RETRY_AFTER
        sleep(max(wait, 1.0))


def map_fundamentals(raw_metric, ticker):
    """Map Finnhub's raw `metric` object to the fields Convict tracks.

    Pure function — no network. `raw_metric` is the dict under the API's
    "metric" key (may be empty). Missing fields come back as None.
    """
    raw_metric = raw_metric or {}
    return {
        "ticker": ticker.upper(),
        "pe_ratio": raw_metric.get("peNormalizedAnnual"),
        "revenue_growth": raw_metric.get("revenueGrowthTTMYoy"),
        "profit_margin": raw_metric.get("netProfitMarginTTM"),
        "52_week_high": raw_metric.get("52WeekHigh"),
        "52_week_low": raw_metric.get("52WeekLow"),
    }


def get_quote(ticker):
    """Return Finnhub's raw quote payload for a ticker."""
    return _get("/quote", {"symbol": ticker})


def get_symbols(exchange="US"):
    """Every symbol listed on `exchange` (one call; ~30k rows for US)."""
    return _get("/stock/symbol", {"exchange": exchange}, timeout=60)


def get_profile(ticker):
    """Company profile (name, exchange, ...). Empty dict for an unknown symbol."""
    return _get("/stock/profile2", {"symbol": ticker})


def get_metric(ticker):
    """Finnhub's raw `metric` object for a ticker (may be empty)."""
    return _get("/stock/metric", {"symbol": ticker, "metric": "all"}).get("metric", {})


def get_fundamentals(ticker):
    """Fetch fundamentals for a ticker and map them to Convict's fields.

    Raises on network / HTTP errors so callers can decide how to handle a
    failure (evaluate_theses catches these per-ticker — §5).
    """
    return map_fundamentals(get_metric(ticker), ticker)
