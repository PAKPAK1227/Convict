"""Nightly ticker-snapshot refresh (GitHub Actions cron).

Writes market context into public.ticker_snapshots so the create form can show
a ticker's price, 52-week range and company name — and reject symbols that
don't exist — without the browser ever calling Finnhub (the key stays
server-side, and users typing never spend the shared rate limit).

  1. Symbol list: one call, every US symbol that fits the app's ticker rule.
     A row existing is what "this ticker is real" means to the client.
  2. Prices: last close + 52-week range for the universe — the S&P 500
     (universe/sp500.txt) plus every ticker with an open thesis. Company names
     come from the profile endpoint, fetched once per ticker, ever.

Pure pieces (parsing, filtering, row building) are separated from I/O so they
can be unit-tested — see tests/test_refresh_snapshots.py.
"""

import datetime
import logging
import os
import re
import sys
import time

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("refresh_snapshots")

UNIVERSE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "universe", "sp500.txt")

TICKER_RE = re.compile(r"^[A-Z]{1,5}$")  # mirrors the theses_ticker_format CHECK

# Symbol-list types a thesis can sensibly be written on. Warrants, rights,
# units and preferreds are excluded; ETFs (ETP) are kept for price targets.
SECURITY_TYPES = {"Common Stock", "ADR", "REIT", "ETP"}

# Finnhub free tier: 60 calls/minute. A little headroom for clock jitter.
MIN_CALL_INTERVAL = 1.1

UPSERT_CHUNK = 500

# Fail the run (so GitHub emails) if more than this share of tickers failed.
# A handful failing is normal (halted or freshly delisted names); a lot means
# something is actually wrong.
MAX_FAILURE_RATE = 0.10


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


def price_row(ticker, quote, metric, now_iso):
    """Snapshot price fields for one ticker, or None if the quote is empty.

    Finnhub answers an unknown or untraded symbol with c=0 / t=0 rather than
    an error, so a zero price means "no data", never a real price.
    """
    quote = quote or {}
    metric = metric or {}
    price, ts = quote.get("c"), quote.get("t")
    if not price or price <= 0 or not ts:
        return None
    return {
        "ticker": ticker,
        "price": price,
        "price_at": datetime.datetime.fromtimestamp(ts, datetime.timezone.utc).isoformat(),
        "week52_high": metric.get("52WeekHigh"),
        "week52_low": metric.get("52WeekLow"),
        "refreshed_at": now_iso,
    }


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


class Throttle:
    """Space API calls at least `interval` seconds apart."""

    def __init__(self, interval=MIN_CALL_INTERVAL, clock=time.monotonic, sleep=time.sleep):
        self.interval, self.clock, self.sleep = interval, clock, sleep
        self.last = None

    def wait(self):
        if self.last is not None:
            remaining = self.interval - (self.clock() - self.last)
            if remaining > 0:
                self.sleep(remaining)
        self.last = self.clock()


# --------------------------------------------------------------------------- #
# Orchestration (network + DB)
# --------------------------------------------------------------------------- #

def refresh(supabase, api, universe, throttle=None):
    """Run one refresh. `api` provides get_symbols/get_quote/get_metric/
    get_profile (main.py in production, a fake in tests). Returns stats."""
    throttle = throttle or Throttle()
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    stats = {"symbols": 0, "priced": 0, "named": 0, "failed": [], "symbols_failed": False}

    # 1. Symbol list
    try:
        throttle.wait()
        rows = symbol_rows(api.get_symbols(), now_iso)
        for batch in upsert_batches(rows):
            supabase.table("ticker_snapshots").upsert(batch, on_conflict="ticker").execute()
        stats["symbols"] = len(rows)
        logger.info("Symbol list: %d tickers", len(rows))
    except Exception as exc:  # noqa: BLE001 - prices can still refresh
        logger.error("Failed to refresh the symbol list: %s", exc)
        stats["symbols_failed"] = True

    # 2. Prices for the universe + every ticker with an open thesis
    open_theses = supabase.table("theses").select("ticker").eq("resolved", False).execute().data or []
    tracked = {t["ticker"] for t in open_theses if TICKER_RE.match(t.get("ticker") or "")}
    targets = sorted(set(universe) | tracked)

    named = supabase.table("ticker_snapshots").select("ticker").not_.is_(
        "company_name", "null"
    ).execute().data or []
    have_name = {r["ticker"] for r in named}

    price_rows = []
    for ticker in targets:
        try:
            throttle.wait()
            quote = api.get_quote(ticker)
            throttle.wait()
            metric = api.get_metric(ticker)
            row = price_row(ticker, quote, metric, now_iso)
            if row is None:
                logger.warning("No price for %s", ticker)
                stats["failed"].append(ticker)
                continue
            if ticker not in have_name:
                throttle.wait()
                name = (api.get_profile(ticker) or {}).get("name")
                if name:
                    row["company_name"] = name
                    stats["named"] += 1
            price_rows.append(row)
        except Exception as exc:  # noqa: BLE001 - one ticker must not stop the run
            logger.error("Failed to refresh %s: %s", ticker, exc)
            stats["failed"].append(ticker)

    for batch in upsert_batches(price_rows):
        supabase.table("ticker_snapshots").upsert(batch, on_conflict="ticker").execute()
    stats["priced"] = len(price_rows)
    stats["targets"] = len(targets)
    return stats


def run_ok(stats):
    """Whether a run should exit 0."""
    if stats["symbols_failed"]:
        return False
    targets = stats.get("targets", 0)
    return targets == 0 or len(stats["failed"]) / targets <= MAX_FAILURE_RATE


def main():
    import main as api  # noqa: WPS433 - loads the Finnhub key only when run
    from evaluate_theses import get_supabase

    with open(UNIVERSE_FILE) as f:
        universe = load_universe(f.read())

    try:
        stats = refresh(get_supabase(), api, universe)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Snapshot refresh crashed: %s", exc)
        return 1

    logger.info(
        "Refresh summary: %d symbols, %d/%d priced, %d names fetched, %d failed%s",
        stats["symbols"], stats["priced"], stats["targets"], stats["named"],
        len(stats["failed"]), f" ({', '.join(stats['failed'][:20])})" if stats["failed"] else "",
    )
    return 0 if run_ok(stats) else 1


if __name__ == "__main__":
    sys.exit(main())
