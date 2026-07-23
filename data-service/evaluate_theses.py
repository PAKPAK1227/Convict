"""Nightly thesis evaluator (GitHub Actions cron).

Pulls each tracked metric's live value from Finnhub, compares it against the
user's target, writes `current_value` back to `metrics`, and rolls the metric
outcomes up into a per-thesis `status` (On Track / Watch / Broken).

The pure decision logic (normalize_metric_name, evaluate_metric,
derive_thesis_status) is separated from the DB/network orchestration so it can
be unit-tested without a live Supabase or Finnhub — see tests/.
"""

import logging
import os
import sys
import time

from dotenv import load_dotenv
from supabase import create_client

from main import get_fundamentals

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("evaluate_theses")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

# §3: a metric that misses its target by more than this fraction (25%) is
# "Broken"; a smaller miss is "Watch".
BROKEN_THRESHOLD = 0.25

# Metrics where a *lower* value is better than the target.
LOWER_IS_BETTER = {"pe_ratio"}

SUPPORTED_METRICS = {"pe_ratio", "revenue_growth", "profit_margin"}

_supabase = None


def get_supabase():
    """Lazily create the Supabase client so importing this module (e.g. in
    tests) doesn't require credentials."""
    global _supabase
    if _supabase is None:
        _supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    return _supabase


# --------------------------------------------------------------------------- #
# Pure decision logic (no I/O)
# --------------------------------------------------------------------------- #

def normalize_metric_name(name):
    """Canonicalize a stored metric name to match SUPPORTED_METRICS."""
    if name is None:
        return ""
    return name.strip().lower().replace(" ", "_")


def evaluate_metric(metric_name, current_value, target_value):
    """Return the status for a single metric.

    One of: "On Track", "Watch", "Broken", or "Unknown" (missing data or an
    unsupported metric). Pure — safe to unit-test.
    """
    if metric_name not in SUPPORTED_METRICS:
        return "Unknown"
    if current_value is None or target_value is None:
        return "Unknown"

    lower_is_better = metric_name in LOWER_IS_BETTER
    if lower_is_better:
        ok = current_value <= target_value
        shortfall = current_value - target_value  # positive => over target (bad)
    else:
        ok = current_value >= target_value
        shortfall = target_value - current_value  # positive => under target (bad)

    if ok:
        return "On Track"

    # Not on track — grade the size of the miss relative to the target.
    if target_value == 0:
        # No meaningful relative miss against a zero target; don't overclaim.
        return "Watch"

    miss_ratio = shortfall / abs(target_value)
    if miss_ratio > BROKEN_THRESHOLD:
        return "Broken"
    return "Watch"


def derive_thesis_status(metric_statuses):
    """Roll per-metric statuses up to a single thesis status.

    Worst-wins: any Broken -> Broken; else any Watch -> Watch; else any
    On Track -> On Track; otherwise (only Unknown / none) -> Watch.
    """
    if "Broken" in metric_statuses:
        return "Broken"
    if "Watch" in metric_statuses:
        return "Watch"
    if "On Track" in metric_statuses:
        return "On Track"
    return "Watch"


# --------------------------------------------------------------------------- #
# Orchestration (network + DB)
# --------------------------------------------------------------------------- #

def get_cached_fundamentals(ticker, cache):
    """Fetch fundamentals for a ticker at most once per run, with the Finnhub
    rate-limit delay applied only on an actual API call."""
    if ticker not in cache:
        cache[ticker] = get_fundamentals(ticker)
        time.sleep(1.2)
    return cache[ticker]


def evaluate_all_metrics():
    """Evaluate every tracked metric and update statuses.

    Returns the number of tickers whose fundamentals could not be fetched, so
    the caller can exit non-zero and surface the failure in CI (§5).
    """
    supabase = get_supabase()

    metrics_response = supabase.table("metrics").select("*, theses(id, ticker)").execute()
    metrics = metrics_response.data or []

    fundamentals_cache = {}
    failed_tickers = set()
    thesis_statuses = {}

    for metric in metrics:
        thesis = metric.get("theses") or {}
        thesis_id = thesis.get("id")
        ticker = thesis.get("ticker")
        if not thesis_id or not ticker:
            logger.warning("Skipping metric %s — no linked thesis", metric.get("id"))
            continue

        # §5: an API failure on one ticker must not kill the whole run.
        if ticker in failed_tickers:
            continue
        try:
            fundamentals = get_cached_fundamentals(ticker, fundamentals_cache)
        except Exception as exc:  # noqa: BLE001 - continue past any Finnhub failure
            logger.error("Failed to fetch fundamentals for %s: %s", ticker, exc)
            failed_tickers.add(ticker)
            continue

        metric_name = normalize_metric_name(metric.get("metric_name"))
        target_value = metric.get("target_value")
        current_value = fundamentals.get(metric_name)

        status = evaluate_metric(metric_name, current_value, target_value)

        # Write back the live value (None surfaces as "not tracked yet" in the UI).
        try:
            supabase.table("metrics").update(
                {"current_value": current_value}
            ).eq("id", metric["id"]).execute()
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to update metric %s: %s", metric.get("id"), exc)
            continue

        logger.info(
            "%s — %s: target %s, current %s -> %s",
            ticker, metric_name, target_value, current_value, status,
        )

        thesis_statuses.setdefault(thesis_id, []).append(status)

    for thesis_id, statuses in thesis_statuses.items():
        new_status = derive_thesis_status(statuses)
        try:
            supabase.table("theses").update(
                {"status": new_status}
            ).eq("id", thesis_id).execute()
            logger.info("Thesis %s set to %s", thesis_id, new_status)
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to update thesis %s: %s", thesis_id, exc)

    if failed_tickers:
        logger.warning("Completed with %d failed ticker(s): %s",
                       len(failed_tickers), ", ".join(sorted(failed_tickers)))
    return len(failed_tickers)


if __name__ == "__main__":
    failures = evaluate_all_metrics()
    # Non-zero exit turns the GitHub Actions run red so failures are visible (§5).
    sys.exit(1 if failures else 0)
