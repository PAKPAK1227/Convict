"""Tests for the pure decision logic in evaluate_theses.py."""
from evaluate_theses import (
    BROKEN_THRESHOLD,
    derive_thesis_status,
    evaluate_metric,
    normalize_metric_name,
)


# --- normalize_metric_name ------------------------------------------------- #

def test_normalize_lowercases_and_underscores():
    assert normalize_metric_name("Revenue Growth") == "revenue_growth"
    assert normalize_metric_name("  PE Ratio  ") == "pe_ratio"


def test_normalize_handles_none():
    assert normalize_metric_name(None) == ""


# --- evaluate_metric: higher-is-better (revenue_growth, profit_margin) ------ #

def test_higher_is_better_on_track_when_meets_target():
    assert evaluate_metric("revenue_growth", 15.0, 10.0) == "On Track"
    assert evaluate_metric("profit_margin", 10.0, 10.0) == "On Track"  # equal counts


def test_higher_is_better_small_miss_is_watch():
    # 9 vs target 10 -> 10% short, under the 25% Broken threshold
    assert evaluate_metric("revenue_growth", 9.0, 10.0) == "Watch"


def test_higher_is_better_large_miss_is_broken():
    # 5 vs target 10 -> 50% short, over threshold
    assert evaluate_metric("revenue_growth", 5.0, 10.0) == "Broken"


# --- evaluate_metric: lower-is-better (pe_ratio) --------------------------- #

def test_lower_is_better_on_track_when_below_target():
    assert evaluate_metric("pe_ratio", 18.0, 20.0) == "On Track"
    assert evaluate_metric("pe_ratio", 20.0, 20.0) == "On Track"  # equal counts


def test_lower_is_better_small_miss_is_watch():
    # 22 vs target 20 -> 10% over, under threshold
    assert evaluate_metric("pe_ratio", 22.0, 20.0) == "Watch"


def test_lower_is_better_large_miss_is_broken():
    # 30 vs target 20 -> 50% over, above threshold
    assert evaluate_metric("pe_ratio", 30.0, 20.0) == "Broken"


# --- evaluate_metric: edge cases ------------------------------------------- #

def test_threshold_boundary_is_watch_not_broken():
    # exactly at the 25% miss boundary -> Watch (strictly greater => Broken)
    target = 100.0
    current = target * (1 - BROKEN_THRESHOLD)  # 25% short
    assert evaluate_metric("revenue_growth", current, target) == "Watch"


def test_missing_current_value_is_unknown():
    assert evaluate_metric("pe_ratio", None, 20.0) == "Unknown"


def test_missing_target_value_is_unknown():
    assert evaluate_metric("pe_ratio", 20.0, None) == "Unknown"


def test_unsupported_metric_is_unknown():
    assert evaluate_metric("free_cash_flow", 5.0, 1.0) == "Unknown"


def test_zero_target_does_not_divide_by_zero():
    # miss against a zero target degrades to Watch rather than crashing
    assert evaluate_metric("revenue_growth", -5.0, 0.0) == "Watch"
    assert evaluate_metric("revenue_growth", 5.0, 0.0) == "On Track"


# --- derive_thesis_status -------------------------------------------------- #

def test_thesis_broken_wins():
    assert derive_thesis_status(["On Track", "Watch", "Broken"]) == "Broken"


def test_thesis_watch_beats_on_track():
    assert derive_thesis_status(["On Track", "Watch"]) == "Watch"


def test_thesis_all_on_track():
    assert derive_thesis_status(["On Track", "On Track"]) == "On Track"


def test_thesis_only_unknown_defaults_to_watch():
    assert derive_thesis_status(["Unknown", "Unknown"]) == "Watch"


def test_thesis_on_track_ignores_unknown():
    assert derive_thesis_status(["On Track", "Unknown"]) == "On Track"
