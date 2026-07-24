"""Nightly thesis evaluator (GitHub Actions cron).

Pulls each tracked metric's live value from Finnhub, compares it against the
user's target, writes `current_value` back to `metrics`, and rolls the metric
outcomes up into a per-thesis `status` (On Track / Watch / Broken).

The pure decision logic (normalize_metric_name, evaluate_metric,
derive_thesis_status) is separated from the DB/network orchestration so it can
be unit-tested without a live Supabase or Finnhub — see tests/.
"""

import datetime
import logging
import os
import sys
import time

# Optional/heavy deps are imported lazily inside the functions that need them so
# the pure decision logic (and its tests) import without Supabase/Finnhub/dotenv.
try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:  # env vars may be provided directly (e.g. CI, Actions)
    pass

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
        from supabase import create_client
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
# Convict Score (the app's trademark metric)
# --------------------------------------------------------------------------- #
# A long-term, credit-score-style rating in [0, 100], starting at 50. It only
# changes when a thesis *resolves* at its deadline — one scoring event per
# thesis, applied exactly once. Each event nudges the score by a small, bounded
# amount, damped toward 0 near the edges so 0/100 are asymptotic: a high score
# genuinely reflects sustained accuracy, not one lucky call.

SCORE_START = 50.0
SCORE_STEP = 8.0  # base move at mid-range for a Medium-conviction call
CONVICTION_WEIGHT = {"High": 1.25, "Medium": 1.0, "Low": 0.75}
# Resolved outcome mapped to [0, 1]: right / partial / wrong.
OUTCOME_VALUE = {"On Track": 1.0, "Watch": 0.5, "Broken": 0.0}


def score_delta(current_score, thesis_status, conviction_level):
    """Signed change a single resolved thesis applies to the Convict Score.

    On Track raises it, Broken lowers it, Watch is neutral. Weighted by
    conviction and damped toward 0 near the bounds. Pure — safe to unit-test.
    """
    outcome = OUTCOME_VALUE.get(thesis_status)
    if outcome is None:
        return 0.0  # Unknown / Pending never scores
    weight = CONVICTION_WEIGHT.get(conviction_level, 1.0)
    signed = SCORE_STEP * weight * (outcome - 0.5)
    if signed > 0:
        signed *= (100.0 - current_score) / 50.0  # harder to gain near 100
    elif signed < 0:
        signed *= current_score / 50.0            # harder to lose near 0
    return signed


def apply_resolution(current_score, thesis_status, conviction_level):
    """New score after one resolution, clamped to [0, 100]."""
    new = current_score + score_delta(current_score, thesis_status, conviction_level)
    return max(0.0, min(100.0, new))


def is_past_deadline(target_date, today=None):
    """True if target_date (a date or ISO 'YYYY-MM-DD' string) is before today."""
    if not target_date:
        return False
    if today is None:
        today = datetime.date.today()
    if isinstance(target_date, str):
        try:
            target_date = datetime.date.fromisoformat(target_date[:10])
        except ValueError:
            return False
    return target_date < today


# --------------------------------------------------------------------------- #
# Orchestration (network + DB)
# --------------------------------------------------------------------------- #

def get_cached_fundamentals(ticker, cache):
    """Fetch fundamentals for a ticker at most once per run, with the Finnhub
    rate-limit delay applied only on an actual API call."""
    if ticker not in cache:
        from main import get_fundamentals
        cache[ticker] = get_fundamentals(ticker)
        time.sleep(1.2)
    return cache[ticker]


def evaluate_all_metrics():
    """Evaluate every tracked metric and update statuses.

    Returns the number of tickers whose fundamentals could not be fetched, so
    the caller can exit non-zero and surface the failure in CI (§5).
    """
    supabase = get_supabase()

    metrics_response = supabase.table("metrics").select(
        "*, theses(id, ticker, target_date, resolved, conviction_level, user_id)"
    ).execute()
    metrics = metrics_response.data or []

    today = datetime.date.today()
    fundamentals_cache = {}
    failed_tickers = set()
    thesis_statuses = {}
    thesis_meta = {}

    for metric in metrics:
        thesis = metric.get("theses") or {}
        thesis_id = thesis.get("id")
        ticker = thesis.get("ticker")
        if not thesis_id or not ticker:
            logger.warning("Skipping metric %s — no linked thesis", metric.get("id"))
            continue

        # Already resolved: the verdict is locked. Skip fetching/updating entirely
        # (this also spares Finnhub calls as theses age out — see rate-limit note).
        if thesis.get("resolved"):
            continue

        thesis_meta.setdefault(thesis_id, thesis)

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

        # Write back the live value (None surfaces as "awaiting data" in the UI).
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

    # Roll each thesis up. Past its deadline -> lock the verdict + record a
    # scoring event; otherwise just keep the live status current.
    resolutions_by_user = {}
    for thesis_id, statuses in thesis_statuses.items():
        new_status = derive_thesis_status(statuses)
        meta = thesis_meta.get(thesis_id, {})

        if is_past_deadline(meta.get("target_date"), today):
            try:
                supabase.table("theses").update(
                    {"status": new_status, "resolved": True}
                ).eq("id", thesis_id).execute()
                logger.info("Thesis %s RESOLVED as %s (verdict locked)", thesis_id, new_status)
            except Exception as exc:  # noqa: BLE001
                logger.error("Failed to resolve thesis %s: %s", thesis_id, exc)
                continue
            user_id = meta.get("user_id")
            if user_id:
                resolutions_by_user.setdefault(user_id, []).append(
                    (new_status, meta.get("conviction_level"))
                )
        else:
            try:
                supabase.table("theses").update(
                    {"status": new_status}
                ).eq("id", thesis_id).execute()
                logger.info("Thesis %s set to %s", thesis_id, new_status)
            except Exception as exc:  # noqa: BLE001
                logger.error("Failed to update thesis %s: %s", thesis_id, exc)

    # Apply Convict Score changes one user at a time — damping depends on the
    # running score, so fold each user's events sequentially from their stored value.
    for user_id, events in resolutions_by_user.items():
        _apply_score_events(supabase, user_id, events)

    if failed_tickers:
        logger.warning("Completed with %d failed ticker(s): %s",
                       len(failed_tickers), ", ".join(sorted(failed_tickers)))
    return len(failed_tickers)


def _apply_score_events(supabase, user_id, events):
    """Fold a user's resolution events into their Convict Score and persist it."""
    try:
        resp = supabase.table("profiles").select(
            "convict_score, resolved_count"
        ).eq("id", user_id).single().execute()
        row = resp.data or {}
    except Exception:  # noqa: BLE001 - missing profile row -> start from defaults
        row = {}

    score = float(row.get("convict_score", SCORE_START))
    count = int(row.get("resolved_count", 0))

    for status, conviction in events:
        score = apply_resolution(score, status, conviction)
    count += len(events)

    try:
        supabase.table("profiles").upsert(
            {
                "id": user_id,
                "convict_score": round(score, 2),
                "resolved_count": count,
                "updated_at": datetime.datetime.utcnow().isoformat(),
            }
        ).execute()
        logger.info("User %s Convict Score -> %.2f (%d resolved)", user_id, score, count)
    except Exception as exc:  # noqa: BLE001
        logger.error("Failed to update score for user %s: %s", user_id, exc)


if __name__ == "__main__":
    failures = evaluate_all_metrics()
    # Non-zero exit turns the GitHub Actions run red so failures are visible (§5).
    sys.exit(1 if failures else 0)
