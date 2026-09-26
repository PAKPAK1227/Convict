"""Run-level tests for evaluate_all_metrics() against an in-memory fake of the
few Supabase query-builder calls the evaluator makes. Finnhub is stubbed too,
so these cover the resolution/void/scoring orchestration without any network.
"""
from types import SimpleNamespace

import pytest

import evaluate_theses as ev

PAST = "2020-01-01"
FUTURE = "2999-01-01"


class FakeQuery:
    def __init__(self, db, table):
        self.db, self.table = db, table
        self.op, self.payload, self.filters = "select", None, []
        self._single = False

    def select(self, *_args, **_kwargs):
        self.op = "select"
        return self

    def update(self, payload):
        self.op, self.payload = "update", payload
        return self

    def upsert(self, payload):
        self.op, self.payload = "upsert", payload
        return self

    def insert(self, payload):
        self.op, self.payload = "insert", payload
        return self

    def eq(self, column, value):
        self.filters.append((column, value))
        return self

    def single(self):
        self._single = True
        return self

    def _matches(self, row):
        return all(row.get(c) == v for c, v in self.filters)

    def execute(self):
        rows = self.db.tables.setdefault(self.table, [])
        if self.op == "select":
            found = [dict(r) for r in rows if self._matches(r)]
            if self.table == "metrics":  # emulate the embedded theses(...) join
                theses = {t["id"]: t for t in self.db.tables["theses"]}
                for m in found:
                    m["theses"] = theses.get(m["thesis_id"])
            if self._single:
                if not found:
                    raise RuntimeError("no rows")
                return SimpleNamespace(data=found[0])
            return SimpleNamespace(data=found)
        if self.op == "update":
            for r in rows:
                if self._matches(r):
                    r.update(self.payload)
        elif self.op == "upsert":
            existing = [r for r in rows if r["id"] == self.payload["id"]]
            if existing:
                existing[0].update(self.payload)
            else:
                rows.append(dict(self.payload))
        elif self.op == "insert":
            rows.append(dict(self.payload))
        return SimpleNamespace(data=None)


class FakeSupabase:
    def __init__(self, theses, metrics, profiles=()):
        self.tables = {"theses": theses, "metrics": metrics, "profiles": list(profiles)}

    def table(self, name):
        return FakeQuery(self, name)


def thesis(tid, target_date, ticker="NVDA", conviction="Medium", user="u1"):
    return {"id": tid, "ticker": ticker, "target_date": target_date, "resolved": False,
            "status": "Pending", "conviction_level": conviction, "user_id": user}


def metric(mid, tid, name="pe_ratio", target=20.0, baseline=None, already_met=None):
    return {"id": mid, "thesis_id": tid, "metric_name": name,
            "target_value": target, "current_value": None,
            "baseline_value": baseline, "already_met": already_met}


@pytest.fixture
def run(monkeypatch):
    def _run(db, fundamentals):
        def fake_fetch(ticker, cache):
            value = fundamentals[ticker]
            if isinstance(value, Exception):
                raise value
            return value
        monkeypatch.setattr(ev, "get_supabase", lambda: db)
        monkeypatch.setattr(ev, "get_cached_fundamentals", fake_fetch)
        return ev.evaluate_all_metrics()
    return _run


def status_of(db, tid):
    return next(t for t in db.tables["theses"] if t["id"] == tid)


def metric_row(db, mid):
    return next(m for m in db.tables["metrics"] if m["id"] == mid)


def fresh_profile():
    return [{"id": "u1", "convict_score": 50, "resolved_count": 0}]


def test_winning_thesis_resolves_and_scores(run):
    db = FakeSupabase([thesis("t1", PAST)], [metric("m1", "t1")],
                      [{"id": "u1", "convict_score": 50, "resolved_count": 0}])
    stats = run(db, {"NVDA": {"pe_ratio": 18.0}})

    t = status_of(db, "t1")
    assert (t["status"], t["resolved"]) == ("On Track", True)
    assert db.tables["profiles"][0]["convict_score"] == 54.0
    assert db.tables["profiles"][0]["resolved_count"] == 1
    assert stats["write_failures"] == 0


def test_no_market_data_at_deadline_voids_without_scoring(run):
    db = FakeSupabase([thesis("t1", PAST)], [metric("m1", "t1")],
                      [{"id": "u1", "convict_score": 50, "resolved_count": 0}])
    stats = run(db, {"NVDA": {"pe_ratio": None}})

    t = status_of(db, "t1")
    assert (t["status"], t["resolved"]) == ("Void", True)
    assert db.tables["profiles"][0]["convict_score"] == 50  # untouched
    assert db.tables["profiles"][0]["resolved_count"] == 0
    assert stats["theses_voided"] == 1


def test_no_market_data_before_deadline_stays_pending(run):
    db = FakeSupabase([thesis("t1", FUTURE)], [metric("m1", "t1")])
    run(db, {"NVDA": {"pe_ratio": None}})

    t = status_of(db, "t1")
    assert (t["status"], t["resolved"]) == ("Pending", False)


def test_thesis_with_no_targets_is_voided_at_deadline(run):
    db = FakeSupabase([thesis("t1", PAST), thesis("t2", FUTURE)], [])
    stats = run(db, {})

    assert (status_of(db, "t1")["status"], status_of(db, "t1")["resolved"]) == ("Void", True)
    assert status_of(db, "t2")["resolved"] is False  # deadline not reached yet
    assert stats["theses_voided"] == 1


def test_fetch_failure_on_deadline_night_is_retried_not_voided(run):
    """A Finnhub outage must never lock someone's call as Void."""
    db = FakeSupabase([thesis("t1", PAST)], [metric("m1", "t1")])
    stats = run(db, {"NVDA": RuntimeError("Finnhub down")})

    t = status_of(db, "t1")
    assert (t["status"], t["resolved"]) == ("Pending", False)
    assert stats["theses_voided"] == 0
    assert stats["failed_tickers"] == ["NVDA"]


def test_partial_data_grades_on_what_is_available(run):
    db = FakeSupabase(
        [thesis("t1", PAST)],
        [metric("m1", "t1", "pe_ratio", 20.0), metric("m2", "t1", "profit_margin", 30.0)],
        [{"id": "u1", "convict_score": 50, "resolved_count": 0}],
    )
    run(db, {"NVDA": {"pe_ratio": 18.0, "profit_margin": None}})

    assert status_of(db, "t1")["status"] == "On Track"


# --- baselines ------------------------------------------------------------- #

def test_first_value_stamps_the_baseline(run):
    db = FakeSupabase([thesis("t1", FUTURE)], [metric("m1", "t1", "pe_ratio", 20.0)])
    run(db, {"NVDA": {"pe_ratio": 25.0}})

    m = metric_row(db, "m1")
    assert m["baseline_value"] == 25.0
    assert m["already_met"] is False
    assert m["baseline_at"]


def test_baseline_is_never_overwritten(run):
    db = FakeSupabase([thesis("t1", FUTURE)],
                      [metric("m1", "t1", "pe_ratio", 20.0, baseline=25.0, already_met=False)])
    run(db, {"NVDA": {"pe_ratio": 15.0}})

    m = metric_row(db, "m1")
    assert (m["baseline_value"], m["already_met"], m["current_value"]) == (25.0, False, 15.0)


def test_no_value_leaves_the_baseline_unset(run):
    db = FakeSupabase([thesis("t1", FUTURE)], [metric("m1", "t1")])
    run(db, {"NVDA": {"pe_ratio": None}})

    assert metric_row(db, "m1")["baseline_value"] is None


def test_all_targets_already_met_locks_but_does_not_score(run):
    db = FakeSupabase([thesis("t1", PAST)],
                      [metric("m1", "t1", "pe_ratio", 40.0, baseline=25.0, already_met=True)],
                      fresh_profile())
    stats = run(db, {"NVDA": {"pe_ratio": 26.0}})

    t = status_of(db, "t1")
    assert (t["status"], t["resolved"], t["unscored"]) == ("On Track", True, True)
    assert db.tables["profiles"][0]["convict_score"] == 50
    assert db.tables["profiles"][0]["resolved_count"] == 0
    assert stats["theses_unscored"] == 1


def test_a_genuine_target_alongside_an_easy_one_still_scores(run):
    db = FakeSupabase(
        [thesis("t1", PAST)],
        [metric("m1", "t1", "pe_ratio", 40.0, baseline=25.0, already_met=True),
         metric("m2", "t1", "profit_margin", 30.0, baseline=22.0, already_met=False)],
        fresh_profile(),
    )
    run(db, {"NVDA": {"pe_ratio": 26.0, "profit_margin": 31.0}})

    assert status_of(db, "t1").get("unscored") is not True
    assert db.tables["profiles"][0]["convict_score"] == 54.0


def test_all_already_met_thesis_is_unscored_even_if_it_later_breaks(run):
    """Symmetric on purpose: a call that wasn't a prediction doesn't count
    either way. That's what the UI promises ("won't count toward your
    Convict Score"), and it can't be exploited — it earns nothing."""
    db = FakeSupabase([thesis("t1", PAST)],
                      [metric("m1", "t1", "pe_ratio", 40.0, baseline=25.0, already_met=True)],
                      fresh_profile())
    run(db, {"NVDA": {"pe_ratio": 60.0}})

    t = status_of(db, "t1")
    assert (t["status"], t["unscored"]) == ("Broken", True)
    assert db.tables["profiles"][0]["convict_score"] == 50


def test_a_baseline_first_taken_on_the_deadline_night_is_not_already_met(run):
    """If data only arrives at resolution, the baseline equals the graded value
    and can't tell us whether the target was met when it was set."""
    db = FakeSupabase([thesis("t1", PAST)], [metric("m1", "t1", "pe_ratio", 20.0)],
                      fresh_profile())
    run(db, {"NVDA": {"pe_ratio": 18.0}})

    m = metric_row(db, "m1")
    assert (m["baseline_value"], m["already_met"]) == (18.0, None)
    assert db.tables["profiles"][0]["convict_score"] == 54.0  # scored normally
