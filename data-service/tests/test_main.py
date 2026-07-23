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
