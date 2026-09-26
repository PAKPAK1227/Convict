"""Tests for the pure fundamentals mapper in main.py."""
from main import map_fundamentals


def test_map_fundamentals_maps_known_fields():
    raw = {
        "peNormalizedAnnual": 20.5,
        "revenueGrowthTTMYoy": 12.0,
        "netProfitMarginTTM": 25.0,
        "52WeekHigh": 150,
        "52WeekLow": 90,
    }
    result = map_fundamentals(raw, "nvda")
    assert result["ticker"] == "NVDA"
    assert result["pe_ratio"] == 20.5
    assert result["revenue_growth"] == 12.0
    assert result["profit_margin"] == 25.0
    assert result["52_week_high"] == 150
    assert result["52_week_low"] == 90


def test_map_fundamentals_missing_fields_are_none():
    result = map_fundamentals({}, "aapl")
    assert result["ticker"] == "AAPL"
    assert result["pe_ratio"] is None
    assert result["revenue_growth"] is None
    assert result["profit_margin"] is None


def test_map_fundamentals_handles_none_metric():
    result = map_fundamentals(None, "msft")
    assert result["ticker"] == "MSFT"
    assert result["pe_ratio"] is None


# --- _get: retry on rate limiting ------------------------------------------ #

import pytest  # noqa: E402

import main  # noqa: E402


class FakeResponse:
    def __init__(self, status, body=None, headers=None):
        self.status_code, self._body, self.headers = status, body or {}, headers or {}

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def json(self):
        return self._body


def fake_get(monkeypatch, responses):
    calls = []

    def get(url, params, timeout):
        calls.append(params)
        return responses.pop(0)

    monkeypatch.setattr(main.requests, "get", get)
    return calls


def test_rate_limited_call_waits_and_retries(monkeypatch):
    calls = fake_get(monkeypatch, [FakeResponse(429, headers={"Retry-After": "2"}),
                                   FakeResponse(200, {"c": 1})])
    slept = []
    assert main._get("/quote", {"symbol": "AAPL"}, sleep=slept.append) == {"c": 1}
    assert slept == [2.0]
    assert len(calls) == 2


def test_missing_or_bad_retry_after_uses_the_default(monkeypatch):
    fake_get(monkeypatch, [FakeResponse(429, headers={"Retry-After": "soon"}),
                           FakeResponse(200, {})])
    slept = []
    main._get("/quote", {}, sleep=slept.append)
    assert slept == [main.DEFAULT_RETRY_AFTER]


def test_gives_up_after_max_retries(monkeypatch):
    calls = fake_get(monkeypatch, [FakeResponse(429)] * (main.MAX_RETRIES + 1))
    with pytest.raises(RuntimeError, match="429"):
        main._get("/quote", {}, sleep=lambda s: None)
    assert len(calls) == main.MAX_RETRIES + 1


def test_other_errors_are_not_retried(monkeypatch):
    calls = fake_get(monkeypatch, [FakeResponse(500)])
    with pytest.raises(RuntimeError, match="500"):
        main._get("/quote", {}, sleep=lambda s: None)
    assert len(calls) == 1
