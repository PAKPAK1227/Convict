"""Tests for the Massive client: throttling, retries, and that the key travels
in a header rather than the URL."""
import pytest

import massive


class FakeResponse:
    def __init__(self, status, body=None, headers=None):
        self.status_code, self._body, self.headers = status, body or {}, headers or {}

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def json(self):
        return self._body


class CountingThrottle:
    def __init__(self):
        self.waits = 0

    def wait(self):
        self.waits += 1


def fake_get(monkeypatch, responses):
    calls = []

    def get(url, params, headers, timeout):
        calls.append({"url": url, "params": params, "headers": headers})
        return responses.pop(0)

    monkeypatch.setattr(massive.requests, "get", get)
    return calls


def test_key_is_sent_as_a_header_never_in_the_url(monkeypatch):
    monkeypatch.setattr(massive, "MASSIVE_API_KEY", "secret-key")
    calls = fake_get(monkeypatch, [FakeResponse(200, {"results": []})])
    massive._get("/v2/x", {"a": 1}, throttle=CountingThrottle())
    assert calls[0]["headers"]["Authorization"] == "Bearer secret-key"
    assert "secret-key" not in calls[0]["url"] and "secret-key" not in str(calls[0]["params"])


def test_every_attempt_is_throttled_and_429_is_retried(monkeypatch):
    fake_get(monkeypatch, [FakeResponse(429, headers={"Retry-After": "3"}), FakeResponse(200, {"ok": 1})])
    throttle, slept = CountingThrottle(), []
    assert massive._get("/v2/x", throttle=throttle, sleep=slept.append) == {"ok": 1}
    assert throttle.waits == 2 and slept == [3.0]


def test_gives_up_after_max_retries(monkeypatch):
    fake_get(monkeypatch, [FakeResponse(429)] * (massive.MAX_RETRIES + 1))
    with pytest.raises(RuntimeError, match="429"):
        massive._get("/v2/x", throttle=CountingThrottle(), sleep=lambda s: None)


def test_throttle_spaces_calls_under_the_free_tier():
    now, slept = [0.0], []

    def sleep(s):
        slept.append(round(s, 2))
        now[0] += s

    t = massive.Throttle(massive.MIN_CALL_INTERVAL, clock=lambda: now[0], sleep=sleep)
    t.wait()
    now[0] += 2.5
    t.wait()
    assert slept == [10.0]
    assert 60 / massive.MIN_CALL_INTERVAL < 5  # calls/minute stays under the 5 allowed


def test_endpoints_unwrap_results_and_tolerate_empty(monkeypatch):
    fake_get(monkeypatch, [FakeResponse(200, {"results": [{"T": "AAPL"}]}), FakeResponse(200, {})])
    monkeypatch.setattr(massive, "_throttle", CountingThrottle())
    assert massive.grouped_daily("2026-10-16") == [{"T": "AAPL"}]
    assert massive.splits_since("2026-01-01") == []
