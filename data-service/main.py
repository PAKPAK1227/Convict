"""Finnhub data access for Convict.

§5 of CONVICT_TODO: this used to be a FastAPI service whose endpoints were never
deployed. It is only ever imported by evaluate_theses.py, so it is now a plain
module. Fetching (network) is kept separate from mapping (pure) so the mapping
logic can be unit-tested without hitting the network.
"""

import os

import requests
from dotenv import load_dotenv

load_dotenv()

FINNHUB_API_KEY = os.getenv("FINNHUB_API_KEY")
FINNHUB_BASE = "https://finnhub.io/api/v1"

# Finnhub timeout (seconds) so a hung request can't stall the nightly job.
REQUEST_TIMEOUT = 15


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
    url = f"{FINNHUB_BASE}/quote"
    params = {"symbol": ticker, "token": FINNHUB_API_KEY}
    response = requests.get(url, params=params, timeout=REQUEST_TIMEOUT)
    response.raise_for_status()
    return response.json()


def get_fundamentals(ticker):
    """Fetch fundamentals for a ticker and map them to Convict's fields.

    Raises on network / HTTP errors so callers can decide how to handle a
    failure (evaluate_theses catches these per-ticker — §5).
    """
    url = f"{FINNHUB_BASE}/stock/metric"
    params = {"symbol": ticker, "metric": "all", "token": FINNHUB_API_KEY}
    response = requests.get(url, params=params, timeout=REQUEST_TIMEOUT)
    response.raise_for_status()
    data = response.json()
    return map_fundamentals(data.get("metric", {}), ticker)
