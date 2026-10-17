"""Nightly ticker-snapshot refresh (GitHub Actions cron).

Writes market context into public.ticker_snapshots so the create form can show
a ticker's price, 52-week range, volatility profile and company name — and
reject symbols that don't exist — without the browser ever calling an API.

  1. Symbol list (Finnhub, 1 call): every US symbol that fits the app's ticker
     rule. A row existing is what "this ticker is real" means to the client.
  2. Price history (Massive): each missing trading day's bars for EVERY US
     stock arrive in one call; rows are kept for the universe — the S&P 500
     (universe/sp500.txt) plus every ticker with an open thesis.
  3. Splits (Massive, 1 call): a ticker that split since its history was
     downloaded has its history replaced (one call), because stored bars are
     split-adjusted only as of the night they were fetched.
  4. Backfill (Massive, 1 call each): a ticker with far less history than the
     market (newly tracked, or newly in the S&P) is downloaded once.
  5. Snapshot: last close, 52-week range and MAV / M / Θ computed from the
     stored history; company names from Finnhub's profile, once per ticker.

Call volume is fixed by design: on a normal night ~1 Finnhub call and ~2
Massive calls, however many users or tickers there are. A per-run Massive
budget caps the one-off cost of the initial year-long backfill (it completes
over two nights) and of bursts of new tickers.

Pure pieces are separated from I/O — see tests/test_refresh_snapshots.py.
"""

import datetime
import logging
import os
import re
import sys

import volatility

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("refresh_snapshots")

UNIVERSE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "universe", "sp500.txt")

TICKER_RE = re.compile(r"^[A-Z]{1,5}$")  # mirrors the theses_ticker_format CHECK

# Symbol-list types a thesis can sensibly be written on. Warrants, rights,
# units and preferreds are excluded; ETFs (ETP) are kept for price targets.
SECURITY_TYPES = {"Common Stock", "ADR", "REIT", "ETP"}

UPSERT_CHUNK = 500
PAGE_SIZE = 1000

# History kept: enough calendar days for one year of trading (253 closes)
# plus slack; anything older is pruned.
HISTORY_CALENDAR_DAYS = 372
PRUNE_AFTER_DAYS = 400

# Massive calls per run (12.5s apart -> ~46 minutes at most). A normal night
# needs 2; the first run's year of history needs ~265, so it spans two nights.
MASSIVE_CALL_BUDGET = 220

# A weekday that returned no bars is recorded as a market holiday only once
# it's this old — a very recent empty day may just not be published yet.
EMPTY_DAY_GRACE = 3

# A ticker with less than this share of the market's trading days gets a
# one-off backfill (if it has never had one).
BACKFILL_COVERAGE = 0.9

# Fail the run if more than this share of tickers ends up without a price.
MAX_UNPRICED_RATE = 0.10


# --------------------------------------------------------------------------- #
# Pure logic (no I/O)
# --------------------------------------------------------------------------- #

def load_universe(text):
    """Tickers from a universe file: one per line, '#' comments ignored."""
    tickers = []
    for line in text.splitlines():
        line = line.split("#", 1)[0].strip().upper()
        if TICKER_RE.match(line):
            tickers.append(line)
    return sorted(set(tickers))


def symbol_rows(raw_symbols, now_iso):
    """Snapshot rows for the symbol list, filtered to thesis-able tickers."""
    rows = {}
    for s in raw_symbols or []:
        ticker = (s.get("symbol") or "").strip().upper()
        if not TICKER_RE.match(ticker) or s.get("type") not in SECURITY_TYPES:
            continue
        rows[ticker] = {
            "ticker": ticker,
            "listed_name": (s.get("description") or "").strip() or None,
            "security_type": s.get("type"),
            "listed_at": now_iso,
        }
    return [rows[t] for t in sorted(rows)]


def chunks(rows, size):
    for i in range(0, len(rows), size):
        yield rows[i:i + size]


def upsert_batches(rows, size=UPSERT_CHUNK):
    """Split rows into upsert batches whose rows all share the same keys.

    supabase-py sends the union of a batch's keys as PostgREST's `columns`,
    and PostgREST writes NULL for any listed column a row omits. Mixing a row
    that carries company_name with one that doesn't would wipe the second
    row's stored name — so never mix shapes in one request.
    """
    by_shape = {}
    for row in rows:
        by_shape.setdefault(frozenset(row), []).append(row)
    for shape in sorted(by_shape, key=sorted):
        yield from chunks(by_shape[shape], size)


def weekdays_between(start, end):
    """Mon–Fri dates from start to end inclusive (holidays are found by asking)."""
    days, d = [], start
    while d <= end:
        if d.weekday() < 5:
            days.append(d)
        d += datetime.timedelta(days=1)
    return days


def days_to_fetch(today, ingested, budget):
    """Trading days still missing from history, newest first, at most `budget`.
    Newest first so a part-finished backfill already has current prices."""
    start = today - datetime.timedelta(days=HISTORY_CALENDAR_DAYS)
    yesterday = today - datetime.timedelta(days=1)
    missing = [d for d in weekdays_between(start, yesterday) if d not in ingested]
    return sorted(missing, reverse=True)[:max(budget, 0)]


def bar_rows(bars, day, keep):
    """price_history rows for one grouped-daily response, for tickers in `keep`."""
    rows = []
    for b in bars or []:
        ticker, close = b.get("T"), b.get("c")
        if ticker in keep and close and close > 0:
            rows.append({"ticker": ticker, "day": str(day), "close": close,
                         "high": b.get("h"), "low": b.get("l")})
    return rows


def range_rows(ticker, bars):
    """price_history rows for one ticker's range response. Massive stamps a
    daily bar with the start of its session (midnight Eastern), which is still
    that same date in UTC."""
    rows = []
    for b in bars or []:
        close, ts = b.get("c"), b.get("t")
        if close and close > 0 and ts:
            day = datetime.datetime.fromtimestamp(ts / 1000, datetime.timezone.utc).date()
            rows.append({"ticker": ticker, "day": str(day), "close": close,
                         "high": b.get("h"), "low": b.get("l")})
    return rows


def needs_backfill(ticker_days, market_days, backfilled_at, splits):
    """Whether a ticker's history must be (re)downloaded in one piece.

    ticker_days  sorted ISO dates stored for the ticker
    market_days  number of trading days the market has in stored history
    backfilled_at  ISO timestamp of the last full download, or None
    splits       ISO execution dates of the ticker's recent splits

    A split after the last full download breaks stored history that predates
    it. Otherwise only a ticker that has never been downloaded and covers well
    under the market's days needs one — after that, a genuinely young stock
    (a recent IPO) isn't re-fetched every night.
    """
    last_full = (backfilled_at or "")[:10]
    for split_day in splits:
        if split_day > last_full and ticker_days and ticker_days[0] < split_day:
            return "split"
    if backfilled_at is None and len(ticker_days) < BACKFILL_COVERAGE * market_days:
        return "new"
    return None


def snapshot_row(ticker, history, now_iso):
    """Snapshot price + volatility fields from a ticker's history (oldest
    first), or None without any history."""
    if not history:
        return None
    last = history[-1]
    year = history[-volatility.WINDOW_CLOSES:]
    highs = [float(r["high"] if r.get("high") is not None else r["close"]) for r in year]
    lows = [float(r["low"] if r.get("low") is not None else r["close"]) for r in year]
    row = {
        "ticker": ticker,
        "price": float(last["close"]),
        # 20:00 UTC is ~4pm New York: the close, and the right calendar date
        # in every US time zone when the browser formats it.
        "price_at": f"{last['day']}T20:00:00+00:00",
        "week52_high": max(highs),
        "week52_low": min(lows),
        "refreshed_at": now_iso,
        "vol_mav": None, "vol_m": None, "vol_theta": None,
        "vol_window_days": None, "vol_as_of": None,
    }
    prof = volatility.profile([float(r["close"]) for r in history])
    if prof:
        row.update({
            "vol_mav": round(prof["mav"], 6),
            "vol_m": round(prof["m"], 6),
            "vol_theta": None if prof["theta"] is None else round(prof["theta"], 4),
            "vol_window_days": prof["closes"],
            "vol_as_of": last["day"],
        })
    return row


def run_ok(stats):
    """Whether a run should exit 0."""
    if stats["symbols_failed"] or stats["massive_failures"]:
        return False
    targets = stats.get("targets", 0)
    return targets == 0 or stats["unpriced"] / targets <= MAX_UNPRICED_RATE


# --------------------------------------------------------------------------- #
# Orchestration (network + DB)
# --------------------------------------------------------------------------- #

def _select_all(query_factory):
    """Page through a select (PostgREST caps responses at 1,000 rows)."""
    rows, start = [], 0
    while True:
        page = query_factory().range(start, start + PAGE_SIZE - 1).execute().data or []
        rows.extend(page)
        if len(page) < PAGE_SIZE:
            return rows
        start += PAGE_SIZE


def _upsert(supabase, table, rows, on_conflict):
    for batch in upsert_batches(rows):
        supabase.table(table).upsert(batch, on_conflict=on_conflict).execute()


def refresh(supabase, finnhub, massive, universe, today, budget=MASSIVE_CALL_BUDGET):
    """Run one refresh. `finnhub` provides get_symbols/get_profile (main.py in
    production), `massive` provides grouped_daily/ticker_range/splits_since
    (massive.py). Both are fakes in tests. Returns stats."""
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    stats = {"symbols": 0, "symbols_failed": False, "days_ingested": 0, "days_pending": 0,
             "splits_repaired": 0, "backfilled": 0, "priced": 0, "named": 0,
             "unpriced": 0, "massive_calls": 0, "massive_failures": 0, "targets": 0}

    def call_massive(fn, *args):
        stats["massive_calls"] += 1
        return fn(*args)

    # 1. Symbol list --------------------------------------------------------
    try:
        rows = symbol_rows(finnhub.get_symbols(), now_iso)
        _upsert(supabase, "ticker_snapshots", rows, "ticker")
        stats["symbols"] = len(rows)
        logger.info("Symbol list: %d tickers", len(rows))
    except Exception as exc:  # noqa: BLE001 - history can still refresh
        logger.error("Failed to refresh the symbol list: %s", exc)
        stats["symbols_failed"] = True

    # Universe + every ticker with an open thesis
    open_theses = supabase.table("theses").select("ticker").eq("resolved", False).execute().data or []
    tracked = {t["ticker"] for t in open_theses if TICKER_RE.match(t.get("ticker") or "")}
    targets = sorted(set(universe) | tracked)
    keep = set(targets)
    stats["targets"] = len(targets)

    # 2. Splits (one call) ----------------------------------------------------
    split_days = {}
    if budget - stats["massive_calls"] > 0:
        try:
            since = today - datetime.timedelta(days=HISTORY_CALENDAR_DAYS)
            for s in call_massive(massive.splits_since, since):
                if s.get("ticker") in keep and s.get("execution_date"):
                    split_days.setdefault(s["ticker"], []).append(s["execution_date"][:10])
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to fetch splits: %s", exc)
            stats["massive_failures"] += 1

    # 3. Missing trading days, newest first (one call per day) ---------------
    ingested = {datetime.date.fromisoformat(r["day"][:10]) for r in
                _select_all(lambda: supabase.table("price_history_days").select("day").order("day"))}
    todo = days_to_fetch(today, ingested, budget - stats["massive_calls"])
    for day in todo:
        try:
            bars = call_massive(massive.grouped_daily, day.isoformat())
        except Exception as exc:  # noqa: BLE001 - retried next night
            logger.error("Failed to fetch bars for %s: %s", day, exc)
            stats["massive_failures"] += 1
            continue
        if not bars and (today - day).days <= EMPTY_DAY_GRACE:
            continue  # maybe not published yet — ask again tomorrow
        rows = bar_rows(bars, day, keep)
        for batch in chunks(rows, UPSERT_CHUNK):
            supabase.table("price_history").upsert(batch, on_conflict="ticker,day").execute()
        supabase.table("price_history_days").upsert(
            {"day": day.isoformat(), "bars": len(bars)}, on_conflict="day").execute()
        stats["days_ingested"] += 1
    stats["days_pending"] = len(days_to_fetch(today, ingested | set(todo), 10_000))

    # 4. Split repairs and one-off backfills (one call per ticker) -----------
    cutoff = (today - datetime.timedelta(days=HISTORY_CALENDAR_DAYS)).isoformat()
    history = {}
    for r in _select_all(lambda: supabase.table("price_history")
                         .select("ticker,day,close,high,low").gte("day", cutoff)
                         .order("ticker").order("day")):
        history.setdefault(r["ticker"], []).append(r)
    market_days = sum(1 for r in _select_all(
        lambda: supabase.table("price_history_days").select("day,bars").gte("day", cutoff).order("day"))
        if r["bars"] > 0)

    meta = {}
    for batch in chunks(targets, 200):
        for r in supabase.table("ticker_snapshots").select(
                "ticker,company_name,history_backfilled_at").in_("ticker", batch).execute().data or []:
            meta[r["ticker"]] = r

    queue = []
    for ticker in targets:
        days = [r["day"][:10] for r in history.get(ticker, [])]
        reason = needs_backfill(days, market_days, (meta.get(ticker) or {}).get("history_backfilled_at"),
                                split_days.get(ticker, []))
        if reason:
            queue.append((0 if reason == "split" else 1, ticker, reason))  # splits first

    for _, ticker, reason in sorted(queue):
        if budget - stats["massive_calls"] <= 0:
            logger.info("Massive budget spent; %d backfill(s) deferred", len(queue))
            break
        try:
            bars = call_massive(massive.ticker_range, ticker, cutoff,
                                (today - datetime.timedelta(days=1)).isoformat())
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to backfill %s: %s", ticker, exc)
            stats["massive_failures"] += 1
            continue
        rows = range_rows(ticker, bars)
        supabase.table("price_history").delete().eq("ticker", ticker).execute()
        for batch in chunks(rows, UPSERT_CHUNK):
            supabase.table("price_history").upsert(batch, on_conflict="ticker,day").execute()
        supabase.table("ticker_snapshots").upsert(
            {"ticker": ticker, "history_backfilled_at": now_iso}, on_conflict="ticker").execute()
        history[ticker] = rows
        stats["splits_repaired" if reason == "split" else "backfilled"] += 1

    # 5. Snapshots ------------------------------------------------------------
    snapshot_rows = []
    for ticker in targets:
        row = snapshot_row(ticker, history.get(ticker, []), now_iso)
        if row is None:
            stats["unpriced"] += 1
            continue
        if not (meta.get(ticker) or {}).get("company_name"):
            try:
                name = (finnhub.get_profile(ticker) or {}).get("name")
                if name:
                    row["company_name"] = name
                    stats["named"] += 1
            except Exception as exc:  # noqa: BLE001 - a name is cosmetic
                logger.warning("No profile name for %s: %s", ticker, exc)
        snapshot_rows.append(row)
    _upsert(supabase, "ticker_snapshots", snapshot_rows, "ticker")
    stats["priced"] = len(snapshot_rows)

    # 6. Prune ----------------------------------------------------------------
    old = (today - datetime.timedelta(days=PRUNE_AFTER_DAYS)).isoformat()
    supabase.table("price_history").delete().lt("day", old).execute()
    supabase.table("price_history_days").delete().lt("day", old).execute()
    return stats


def main():
    import main as finnhub  # noqa: WPS433 - loads the API keys only when run
    import massive
    from evaluate_theses import get_supabase

    with open(UNIVERSE_FILE) as f:
        universe = load_universe(f.read())

    try:
        stats = refresh(get_supabase(), finnhub, massive, universe,
                        datetime.datetime.now(datetime.timezone.utc).date())
    except Exception as exc:  # noqa: BLE001
        logger.exception("Snapshot refresh crashed: %s", exc)
        return 1

    logger.info(
        "Refresh summary: %d symbols, %d day(s) ingested (%d still missing), "
        "%d split repair(s), %d backfill(s), %d/%d priced, %d unpriced, "
        "%d name(s) fetched, %d Massive call(s), %d Massive failure(s)",
        stats["symbols"], stats["days_ingested"], stats["days_pending"],
        stats["splits_repaired"], stats["backfilled"], stats["priced"], stats["targets"],
        stats["unpriced"], stats["named"], stats["massive_calls"], stats["massive_failures"],
    )
    return 0 if run_ok(stats) else 1


if __name__ == "__main__":
    sys.exit(main())
