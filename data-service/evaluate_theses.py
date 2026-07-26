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

# Points moved at mid-range (score 50) by a *Medium*-conviction call, before
# conviction weighting and edge damping.
#
# Close ("Watch") is a small negative rather than zero on purpose. A near-miss
# that costs nothing makes "set a target you'll land just short of" a risk-free
# strategy — you could never lose points. -0.5 registers the miss without
# pretending it's the same as being outright wrong (8x smaller than Broken).
BASE_MOVE = {
    "On Track": 4.0,   # target met
    "Watch": -0.5,     # missed, but within BROKEN_THRESHOLD of the target
    "Broken": -4.0,    # missed outright
}

# Conviction is *self-declared and free*, so it must not be weighted
# symmetrically: if High multiplied gains and losses equally, anyone right more
# than half the time would maximise their score by declaring High on every call,
# and the field would carry no information.
#
# Making the downside steeper than the upside prices that honesty in. Expected
# value at score 50, for a call you believe has probability p of landing:
#
#     High    10.2p - 5.6      best when p > ~72.7%
#     Medium   8.0p - 4.0      best when ~66.7% < p < ~72.7%
#     Low      6.2p - 2.8      best when p < ~66.7%
#
# So "High" now genuinely asserts roughly 3-to-1 odds. See docs/SCORING.md for
# the full derivation; tests/ pins these crossover points.
GAIN_WEIGHT = {"High": 1.15, "Medium": 1.0, "Low": 0.85}
LOSS_WEIGHT = {"High": 1.40, "Medium": 1.0, "Low": 0.70}


def score_delta(current_score, thesis_status, conviction_level):
    """Signed change a single resolved thesis applies to the Convict Score.

    On Track raises it; Broken lowers it hard; Watch lowers it slightly. Scaled
    by conviction — more steeply on losses than on gains — and damped toward 0
    near the bounds. Pure — safe to unit-test.
    """
    base = BASE_MOVE.get(thesis_status)
    if base is None:
        return 0.0  # Unknown / Pending never scores

    if base > 0:
        signed = base * GAIN_WEIGHT.get(conviction_level, 1.0)
        signed *= (100.0 - current_score) / 50.0  # harder to gain near 100
    else:
        signed = base * LOSS_WEIGHT.get(conviction_level, 1.0)
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

    Returns a stats dict describing the run. Every failure is counted, not just
    the Finnhub ones: a swallowed DB write means somebody's score or status
    silently didn't update, and a green Actions run would hide that. The caller
    turns any non-zero failure count into a non-zero exit.
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
    stats = {
        "metrics_seen": len(metrics),
        "metrics_updated": 0,
        "theses_updated": 0,
        "theses_resolved": 0,
        "scores_updated": 0,
        "write_failures": 0,
    }

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
            stats["write_failures"] += 1
            continue

        stats["metrics_updated"] += 1
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
                stats["theses_resolved"] += 1
            except Exception as exc:  # noqa: BLE001
                logger.error("Failed to resolve thesis %s: %s", thesis_id, exc)
                stats["write_failures"] += 1
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
                stats["theses_updated"] += 1
            except Exception as exc:  # noqa: BLE001
                logger.error("Failed to update thesis %s: %s", thesis_id, exc)
                stats["write_failures"] += 1

    # Apply Convict Score changes one user at a time — damping depends on the
    # running score, so fold each user's events sequentially from their stored value.
    for user_id, events in resolutions_by_user.items():
        if _apply_score_events(supabase, user_id, events):
            stats["scores_updated"] += 1
        else:
            stats["write_failures"] += 1

    stats["failed_tickers"] = sorted(failed_tickers)
    if failed_tickers:
        logger.warning("Completed with %d failed ticker(s): %s",
                       len(failed_tickers), ", ".join(sorted(failed_tickers)))
    return stats


def _apply_score_events(supabase, user_id, events):
    """Fold a user's resolution events into their Convict Score and persist it.

    Returns True on a successful write. A failure here is the quietest bug in
    the system — the thesis is already locked, so the scoring event is gone for
    good and will never be retried — so the caller counts it and fails the run.
    """
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
        return True
    except Exception as exc:  # noqa: BLE001
        logger.error(
            "Failed to update score for user %s (%d scoring event(s) LOST): %s",
            user_id, len(events), exc,
        )
        return False


# --------------------------------------------------------------------------- #
# Heartbeat
# --------------------------------------------------------------------------- #
# The nightly cron failing loudly is only half the problem: it can also stop
# running entirely (GitHub auto-disables scheduled workflows after 60 days of
# repo inactivity, and a paused Supabase project takes it down too). In that
# case there is no red run to notice — every thesis just quietly freezes on
# stale numbers, and the symptom users report is "my data is wrong".
#
# So each run stamps evaluator_runs, and .github/workflows/evaluator-heartbeat.yml
# checks that stamp on its own schedule and fails if it has gone stale.

def write_heartbeat(supabase, stats, ok):
    """Record that the evaluator ran. Never raises — a failed heartbeat must not
    mask the result of the run it is describing."""
    try:
        supabase.table("evaluator_runs").insert({
            "ok": ok,
            "metrics_seen": stats.get("metrics_seen", 0),
            "metrics_updated": stats.get("metrics_updated", 0),
            "theses_updated": stats.get("theses_updated", 0),
            "theses_resolved": stats.get("theses_resolved", 0),
            "scores_updated": stats.get("scores_updated", 0),
            "write_failures": stats.get("write_failures", 0),
            "failed_tickers": stats.get("failed_tickers", []),
        }).execute()
        logger.info("Heartbeat written (ok=%s)", ok)
    except Exception as exc:  # noqa: BLE001
        # Most likely cause: 20260726_evaluator_heartbeat.sql not deployed yet.
        logger.error("Failed to write heartbeat: %s", exc)


def main():
    """Run an evaluation and return a process exit code."""
    try:
        stats = evaluate_all_metrics()
    except Exception as exc:  # noqa: BLE001 - a crash still deserves a heartbeat
        logger.exception("Evaluation run crashed: %s", exc)
        try:
            write_heartbeat(get_supabase(), {}, ok=False)
        except Exception:  # noqa: BLE001
            pass
        return 1

    failures = stats["write_failures"] + len(stats["failed_tickers"])
    ok = failures == 0

    logger.info(
        "Run summary: %d metric(s) seen, %d updated, %d thesis update(s), "
        "%d resolved, %d score(s) written, %d failure(s)",
        stats["metrics_seen"], stats["metrics_updated"], stats["theses_updated"],
        stats["theses_resolved"], stats["scores_updated"], failures,
    )

    write_heartbeat(get_supabase(), stats, ok)

    # Non-zero exit turns the GitHub Actions run red so failures are visible (§5).
    # This now covers DB write failures too, not just Finnhub ones — previously a
    # lost score update exited 0 and the run looked healthy.
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
