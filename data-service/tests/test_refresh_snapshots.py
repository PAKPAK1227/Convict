"""Tests for refresh_snapshots.py: the pure helpers plus a run against fakes."""
from types import SimpleNamespace

import refresh_snapshots as rs

NOW = "2026-09-26T05:00:00+00:00"


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
        {"symbol": "TOOLONG", "description": "X", "type": "Common Stock"},
    ]
    rows = rs.symbol_rows(raw, NOW)
    assert [r["ticker"] for r in rows] == ["AAPL", "SPY"]
    assert rows[0] == {"ticker": "AAPL", "listed_name": "APPLE INC",
                       "security_type": "Common Stock", "listed_at": NOW}


def test_symbol_rows_never_touch_the_profile_name():
    # company_name comes from the profile endpoint; the symbol list must not
    # overwrite it with its all-caps description on every run.
    rows = rs.symbol_rows([{"symbol": "AAPL", "description": "APPLE INC", "type": "ADR"}], NOW)
    assert "company_name" not in rows[0]


def test_price_row_maps_quote_and_range():
    row = rs.price_row("AAPL", {"c": 230.5, "t": 1758844800}, {"52WeekHigh": 260, "52WeekLow": 170}, NOW)
    assert row["price"] == 230.5
    assert row["price_at"].startswith("2025-09-26")
    assert (row["week52_high"], row["week52_low"]) == (260, 170)


def test_empty_quote_is_no_data_not_a_zero_price():
    assert rs.price_row("ZZZZ", {"c": 0, "t": 0}, {}, NOW) is None
    assert rs.price_row("ZZZZ", {}, {}, NOW) is None


def test_throttle_spaces_calls():
    now = [0.0]
    slept = []

    def sleep(s):
        slept.append(round(s, 3))
        now[0] += s

    t = rs.Throttle(interval=1.1, clock=lambda: now[0], sleep=sleep)
    t.wait()           # first call: no wait
    now[0] += 0.4
    t.wait()           # 0.4s later: waits the remaining 0.7s
    now[0] += 5
    t.wait()           # long gap: no wait
    assert slept == [0.7]


def test_upsert_batches_never_mix_row_shapes():
    rows = [{"ticker": "A", "price": 1},
            {"ticker": "B", "price": 2, "company_name": "B Inc"},
            {"ticker": "C", "price": 3}]
    batches = list(rs.upsert_batches(rows, size=10))
    assert len(batches) == 2
    for batch in batches:
        assert len({frozenset(r) for r in batch}) == 1
    assert sorted(r["ticker"] for b in batches for r in b) == ["A", "B", "C"]


def test_run_ok_tolerates_a_few_failures_but_not_many():
    base = {"symbols_failed": False, "targets": 100}
    assert rs.run_ok({**base, "failed": ["X"] * 10}) is True
    assert rs.run_ok({**base, "failed": ["X"] * 11}) is False
    assert rs.run_ok({**base, "failed": [], "symbols_failed": True}) is False


# --- a run against fakes --------------------------------------------------- #

class FakeQuery:
    def __init__(self, db, table):
        self.db, self.table, self.filters, self.op, self.payload = db, table, [], "select", None
        self.not_ = self  # .not_.is_(col, "null") -> "col is not null"

    def select(self, *_a, **_k):
        return self

    def eq(self, col, val):
        self.filters.append(lambda r: r.get(col) == val)
        return self

    def is_(self, col, _null):
        self.filters.append(lambda r: r.get(col) is not None)
        return self

    def upsert(self, rows, on_conflict=None):
        self.op, self.payload = "upsert", rows
        return self

    def execute(self):
        rows = self.db.setdefault(self.table, {})
        if self.op == "upsert":
            # Like supabase-py + PostgREST: the batch's key union becomes the
            # column list, and a row missing one of those columns writes NULL.
            columns = set().union(*self.payload)
            for r in self.payload:
                rows.setdefault(r["ticker"], {}).update({c: r.get(c) for c in columns})
            return SimpleNamespace(data=None)
        return SimpleNamespace(data=[r for r in rows.values() if all(f(r) for f in self.filters)])


class FakeSupabase:
    def __init__(self, theses, snapshots=()):
        self.db = {"theses": {i: t for i, t in enumerate(theses)},
                   "ticker_snapshots": {s["ticker"]: dict(s) for s in snapshots}}

    def table(self, name):
        return FakeQuery(self.db, name)


class FakeApi:
    def __init__(self, quotes, fail=()):
        self.quotes, self.fail, self.profile_calls = quotes, set(fail), []

    def get_symbols(self):
        return [{"symbol": t, "description": t + " INC", "type": "Common Stock"}
                for t in ["AAPL", "MSFT", "NEWCO"]]

    def get_quote(self, t):
        if t in self.fail:
            raise RuntimeError("boom")
        return self.quotes.get(t, {"c": 0, "t": 0})

    def get_metric(self, t):
        return {"52WeekHigh": 300, "52WeekLow": 100}

    def get_profile(self, t):
        self.profile_calls.append(t)
        return {"name": t.title() + " Inc"}


class NoThrottle:
    def wait(self):
        pass


def test_refresh_prices_universe_plus_tracked_and_names_once():
    sb = FakeSupabase(
        theses=[{"ticker": "NEWCO", "resolved": False}, {"ticker": "OLDCO", "resolved": True}],
        snapshots=[{"ticker": "MSFT", "company_name": "Microsoft Corp"}],
    )
    api = FakeApi({t: {"c": 50, "t": 1758844800} for t in ["AAPL", "MSFT", "NEWCO"]})
    stats = rs.refresh(sb, api, ["AAPL", "MSFT"], throttle=NoThrottle())

    snaps = sb.db["ticker_snapshots"]
    assert stats["targets"] == 3                   # AAPL, MSFT + tracked NEWCO; not resolved OLDCO
    assert snaps["NEWCO"]["price"] == 50
    assert "OLDCO" not in snaps
    assert sorted(api.profile_calls) == ["AAPL", "NEWCO"]  # MSFT already named
    assert snaps["MSFT"]["company_name"] == "Microsoft Corp"
    assert snaps["AAPL"]["listed_name"] == "AAPL INC"
    assert rs.run_ok(stats)


def test_one_failing_ticker_does_not_stop_the_run():
    sb = FakeSupabase(theses=[])
    api = FakeApi({"MSFT": {"c": 400, "t": 1758844800}}, fail={"AAPL"})
    stats = rs.refresh(sb, api, ["AAPL", "MSFT"], throttle=NoThrottle())

    assert stats["failed"] == ["AAPL"]
    assert sb.db["ticker_snapshots"]["MSFT"]["price"] == 400
