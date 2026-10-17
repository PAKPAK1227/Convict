"""Tests for refresh_snapshots.py: the pure helpers plus runs against fakes of
Supabase, Finnhub and Massive."""
import datetime
import math
from types import SimpleNamespace

import pytest

import refresh_snapshots as rs

NOW = "2026-10-17T04:00:00+00:00"
TODAY = datetime.date(2026, 10, 17)  # a Saturday


# --- pure helpers ---------------------------------------------------------- #

def test_load_universe_skips_comments_blanks_and_invalid_tickers():
    text = "# header\nAAPL\n\nmsft  # lower-case is normalised\nBRK.B\nAAPL\n"
    assert rs.load_universe(text) == ["AAPL", "MSFT"]


def test_universe_file_is_the_sp500():
    with open(rs.UNIVERSE_FILE) as f:
        tickers = rs.load_universe(f.read())
    assert 490 <= len(tickers) <= 510
    assert {"AAPL", "MSFT", "NVDA"} <= set(tickers)


def test_symbol_rows_keep_thesisable_types_and_valid_tickers():
    raw = [
        {"symbol": "AAPL", "description": "APPLE INC", "type": "Common Stock"},
        {"symbol": "SPY", "description": "SPDR S&P 500", "type": "ETP"},
        {"symbol": "ABCDW", "description": "ABC WARRANT", "type": "Warrant"},
        {"symbol": "BRK.B", "description": "BERKSHIRE", "type": "Common Stock"},
    ]
    rows = rs.symbol_rows(raw, NOW)
    assert [r["ticker"] for r in rows] == ["AAPL", "SPY"]
    assert "company_name" not in rows[0]  # never overwrites the profile name


def test_upsert_batches_never_mix_row_shapes():
    rows = [{"ticker": "A", "price": 1}, {"ticker": "B", "price": 2, "company_name": "B"},
            {"ticker": "C", "price": 3}]
    batches = list(rs.upsert_batches(rows, size=10))
    assert len(batches) == 2
    assert all(len({frozenset(r) for r in b}) == 1 for b in batches)


def test_weekdays_skip_weekends():
    days = rs.weekdays_between(datetime.date(2026, 10, 9), datetime.date(2026, 10, 13))
    assert [d.isoformat() for d in days] == ["2026-10-09", "2026-10-12", "2026-10-13"]


def test_days_to_fetch_is_newest_first_capped_and_skips_ingested():
    ingested = {datetime.date(2026, 10, 16)}
    todo = rs.days_to_fetch(TODAY, ingested, budget=3)
    assert [d.isoformat() for d in todo] == ["2026-10-15", "2026-10-14", "2026-10-13"]


def test_a_full_backfill_is_about_a_year_of_weekdays():
    assert 255 <= len(rs.days_to_fetch(TODAY, set(), budget=10_000)) <= 270


def test_bar_rows_keep_only_the_universe_and_valid_closes():
    bars = [{"T": "AAPL", "c": 230, "h": 232, "l": 228}, {"T": "ZZZZ", "c": 5},
            {"T": "MSFT", "c": 0}]
    rows = rs.bar_rows(bars, datetime.date(2026, 10, 16), {"AAPL", "MSFT"})
    assert rows == [{"ticker": "AAPL", "day": "2026-10-16", "close": 230, "high": 232, "low": 228}]


def test_range_rows_date_each_bar_by_its_session():
    # Massive stamps daily bars at midnight New York (04:00 UTC in summer).
    ts = int(datetime.datetime(2026, 10, 16, 4, tzinfo=datetime.timezone.utc).timestamp() * 1000)
    assert rs.range_rows("AAPL", [{"c": 230, "t": ts}])[0]["day"] == "2026-10-16"


@pytest.mark.parametrize("days, market, backfilled, splits, expected", [
    (["2025-11-01", "2026-10-16"] * 125, 250, None, [], None),          # full coverage
    (["2026-10-16"], 250, None, [], "new"),                             # newly tracked
    (["2026-10-16"], 250, "2026-10-01T04:00:00", [], None),             # young IPO, already fetched
    (["2025-11-01", "2026-10-16"], 2, None, ["2026-06-01"], "split"),   # split mid-history
    (["2025-11-01", "2026-10-16"], 2, "2026-06-02T04:00:00", ["2026-06-01"], None),  # repaired
    (["2026-07-01", "2026-10-16"], 2, None, ["2026-06-01"], None),      # all history post-split
])
def test_needs_backfill(days, market, backfilled, splits, expected):
    assert rs.needs_backfill(sorted(days), market, backfilled, splits) == expected


def _history(n, start=100.0, step=0.01):
    day = datetime.date(2025, 10, 1)
    rows = []
    for i in range(n):
        rows.append({"day": (day + datetime.timedelta(days=i)).isoformat(),
                     "close": start * math.exp(step * math.sin(i)), "high": None, "low": None})
    return rows


def test_snapshot_row_prices_ranges_and_volatility():
    hist = _history(300)
    hist[-1]["high"] = 999  # intraday high counts toward the 52-week range
    row = rs.snapshot_row("AAPL", hist, NOW)
    assert row["price"] == pytest.approx(hist[-1]["close"])
    assert row["price_at"] == f"{hist[-1]['day']}T20:00:00+00:00"
    assert row["week52_high"] == 999
    assert row["vol_window_days"] == 253 and row["vol_as_of"] == hist[-1]["day"]
    assert row["vol_mav"] > 0 and row["vol_theta"] is not None


def test_short_history_gets_a_price_but_no_volatility():
    row = rs.snapshot_row("NEWCO", _history(10), NOW)
    assert row["price"] and row["vol_mav"] is None and row["vol_window_days"] is None


def test_no_history_no_snapshot():
    assert rs.snapshot_row("ZZZZ", [], NOW) is None


def test_run_ok():
    base = {"symbols_failed": False, "massive_failures": 0, "targets": 100, "unpriced": 10}
    assert rs.run_ok(base) is True
    assert rs.run_ok({**base, "unpriced": 11}) is False
    assert rs.run_ok({**base, "massive_failures": 1}) is False
    assert rs.run_ok({**base, "symbols_failed": True}) is False


# --- runs against fakes ---------------------------------------------------- #

KEYS = {"ticker_snapshots": ("ticker",), "price_history": ("ticker", "day"),
        "price_history_days": ("day",), "theses": ("id",)}


class FakeQuery:
    def __init__(self, db, table):
        self.db, self.table, self.filters = db, table, []
        self.op, self.payload, self.window, self.orders = "select", None, None, []
        self.not_ = self

    def select(self, *_a, **_k):
        return self

    def eq(self, c, v):
        self.filters.append(lambda r: r.get(c) == v)
        return self

    def gte(self, c, v):
        self.filters.append(lambda r: r.get(c) is not None and r[c] >= v)
        return self

    def lt(self, c, v):
        self.filters.append(lambda r: r.get(c) is not None and r[c] < v)
        return self

    def in_(self, c, vals):
        vals = set(vals)
        self.filters.append(lambda r: r.get(c) in vals)
        return self

    def order(self, c):
        self.orders.append(c)
        return self

    def range(self, a, b):
        self.window = (a, b)
        return self

    def upsert(self, rows, on_conflict=None):
        self.op, self.payload = "upsert", rows if isinstance(rows, list) else [rows]
        return self

    def delete(self):
        self.op = "delete"
        return self

    def execute(self):
        table = self.db.setdefault(self.table, {})
        key = KEYS[self.table]
        if self.op == "upsert":
            columns = set().union(*self.payload)  # PostgREST null-fills omitted columns
            for r in self.payload:
                table.setdefault(tuple(r[k] for k in key), {}).update({c: r.get(c) for c in columns})
            return SimpleNamespace(data=None)
        matched = [k for k, r in table.items() if all(f(r) for f in self.filters)]
        if self.op == "delete":
            for k in matched:
                del table[k]
            return SimpleNamespace(data=None)
        rows = [dict(table[k]) for k in matched]
        for c in reversed(self.orders):
            rows.sort(key=lambda r: r.get(c))
        if self.window:
            a, b = self.window
            rows = rows[a:min(b + 1, a + 1000)]  # PostgREST caps a page at 1,000
        return SimpleNamespace(data=rows)


class FakeSupabase:
    def __init__(self, theses=(), snapshots=(), history=(), days=()):
        self.db = {
            "theses": {(i,): dict(t, id=i) for i, t in enumerate(theses)},
            "ticker_snapshots": {(s["ticker"],): dict(s) for s in snapshots},
            "price_history": {(r["ticker"], r["day"]): dict(r) for r in history},
            "price_history_days": {(d["day"],): dict(d) for d in days},
        }

    def table(self, name):
        return FakeQuery(self.db, name)

    def rows(self, table):
        return list(self.db[table].values())


class FakeFinnhub:
    def __init__(self):
        self.profile_calls = []

    def get_symbols(self):
        return [{"symbol": t, "description": t + " INC", "type": "Common Stock"}
                for t in ["AAPL", "MSFT", "NEWCO"]]

    def get_profile(self, t):
        self.profile_calls.append(t)
        return {"name": t.title() + " Inc"}


class FakeMassive:
    """Every weekday has bars for AAPL and MSFT (and NEWCO, which is listed but
    only tracked when a thesis exists); prices drift so volatility is real."""

    def __init__(self, splits=(), fail_days=()):
        self.calls, self.splits, self.fail_days = [], list(splits), set(fail_days)

    @staticmethod
    def _close(ticker, day):
        i = datetime.date.fromisoformat(day).toordinal()
        return {"AAPL": 200, "MSFT": 400, "NEWCO": 20}[ticker] * math.exp(0.02 * math.sin(i))

    def grouped_daily(self, day):
        self.calls.append(("grouped", day))
        if day in self.fail_days:
            raise RuntimeError("boom")
        return [{"T": t, "c": self._close(t, day), "h": None, "l": None}
                for t in ("AAPL", "MSFT", "NEWCO")]

    def ticker_range(self, ticker, start, end):
        self.calls.append(("range", ticker))
        days = rs.weekdays_between(datetime.date.fromisoformat(start), datetime.date.fromisoformat(end))
        return [{"c": self._close(ticker, d.isoformat()),
                 "t": int(datetime.datetime(d.year, d.month, d.day, 4,
                                            tzinfo=datetime.timezone.utc).timestamp() * 1000)}
                for d in days]

    def splits_since(self, day):
        self.calls.append(("splits", str(day)))
        return self.splits


def snap(sb, ticker):
    return sb.db["ticker_snapshots"].get((ticker,))


def test_first_run_backfills_newest_first_within_budget():
    sb, mv = FakeSupabase(), FakeMassive()
    stats = rs.refresh(sb, FakeFinnhub(), mv, ["AAPL", "MSFT"], TODAY, budget=31)

    assert stats["massive_calls"] == 31            # 1 splits + 30 days, never more
    assert stats["days_ingested"] == 30
    assert stats["days_pending"] > 200             # the rest finishes on later nights
    assert mv.calls[1] == ("grouped", "2026-10-16")  # newest first
    assert snap(sb, "AAPL")["price_at"].startswith("2026-10-16")
    assert snap(sb, "AAPL")["vol_mav"] is None     # 30 closes: not enough yet
    assert snap(sb, "AAPL")["company_name"] == "Aapl Inc"
    assert {r["ticker"] for r in sb.rows("price_history")} == {"AAPL", "MSFT"}  # NEWCO untracked


def test_full_history_yields_volatility_and_steady_state_is_two_calls():
    sb, mv = FakeSupabase(), FakeMassive()
    rs.refresh(sb, FakeFinnhub(), mv, ["AAPL", "MSFT"], TODAY, budget=10_000)
    assert snap(sb, "AAPL")["vol_window_days"] == 253
    assert snap(sb, "AAPL")["vol_theta"] is not None

    mv.calls.clear()
    finnhub = FakeFinnhub()
    stats = rs.refresh(sb, finnhub, mv, ["AAPL", "MSFT"], TODAY + datetime.timedelta(days=3))  # Tuesday
    assert [c[0] for c in mv.calls] == ["splits", "grouped"]  # just Monday's bars
    assert finnhub.profile_calls == []                        # names are fetched once
    assert stats["days_pending"] == 0


def test_a_newly_tracked_ticker_is_backfilled_once():
    sb, mv = FakeSupabase(), FakeMassive()
    rs.refresh(sb, FakeFinnhub(), mv, ["AAPL"], TODAY, budget=10_000)

    sb.db["theses"][(0,)] = {"id": 0, "ticker": "NEWCO", "resolved": False}
    mv.calls.clear()
    stats = rs.refresh(sb, FakeFinnhub(), mv, ["AAPL"], TODAY)
    assert ("range", "NEWCO") in mv.calls and stats["backfilled"] == 1
    assert snap(sb, "NEWCO")["vol_window_days"] == 253

    mv.calls.clear()
    rs.refresh(sb, FakeFinnhub(), mv, ["AAPL"], TODAY)
    assert ("range", "NEWCO") not in mv.calls


def test_a_split_replaces_the_tickers_history_once():
    sb, mv = FakeSupabase(), FakeMassive()
    rs.refresh(sb, FakeFinnhub(), mv, ["AAPL", "MSFT"], TODAY, budget=10_000)

    mv.splits = [{"ticker": "AAPL", "execution_date": "2026-08-03"}]
    mv.calls.clear()
    stats = rs.refresh(sb, FakeFinnhub(), mv, ["AAPL", "MSFT"], TODAY)
    assert stats["splits_repaired"] == 1 and ("range", "AAPL") in mv.calls
    assert ("range", "MSFT") not in mv.calls

    mv.calls.clear()
    rs.refresh(sb, FakeFinnhub(), mv, ["AAPL", "MSFT"], TODAY)
    assert ("range", "AAPL") not in mv.calls       # already repaired


def test_a_failed_day_is_retried_and_fails_the_run():
    sb, mv = FakeSupabase(), FakeMassive(fail_days={"2026-10-15"})
    stats = rs.refresh(sb, FakeFinnhub(), mv, ["AAPL"], TODAY, budget=10)
    assert stats["massive_failures"] == 1 and not rs.run_ok(stats)
    assert ("2026-10-15",) not in sb.db["price_history_days"]

    mv.fail_days.clear()
    mv.calls.clear()
    rs.refresh(sb, FakeFinnhub(), mv, ["AAPL"], TODAY, budget=10)
    assert ("grouped", "2026-10-15") in mv.calls


def test_a_very_recent_empty_day_is_not_recorded_as_a_holiday():
    sb = FakeSupabase()
    mv = FakeMassive()
    real = mv.grouped_daily
    mv.grouped_daily = lambda day: [] if day == "2026-10-16" else real(day)
    rs.refresh(sb, FakeFinnhub(), mv, ["AAPL"], TODAY, budget=5)
    assert ("2026-10-16",) not in sb.db["price_history_days"]   # asked again tomorrow


def test_pagination_reads_every_page_of_history(monkeypatch):
    monkeypatch.setattr(rs, "PAGE_SIZE", 100)  # ~530 rows -> six pages
    sb = FakeSupabase()
    rs.refresh(sb, FakeFinnhub(), FakeMassive(), ["AAPL", "MSFT"], TODAY, budget=10_000)
    assert len(sb.rows("price_history")) > 5 * rs.PAGE_SIZE
    assert snap(sb, "AAPL")["vol_window_days"] == 253   # first rows by ticker order
    assert snap(sb, "MSFT")["vol_window_days"] == 253   # last pages


def test_old_history_is_pruned():
    old = {"ticker": "AAPL", "day": "2025-01-02", "close": 1.0, "high": None, "low": None}
    sb = FakeSupabase(history=[old], days=[{"day": "2025-01-02", "bars": 1}])
    rs.refresh(sb, FakeFinnhub(), FakeMassive(), ["AAPL"], TODAY, budget=3)
    assert ("AAPL", "2025-01-02") not in sb.db["price_history"]
    assert ("2025-01-02",) not in sb.db["price_history_days"]
