"""Tests for the pure decision logic in evaluate_theses.py."""
import datetime

from evaluate_theses import (
    BROKEN_THRESHOLD,
    SCORE_START,
    apply_resolution,
    derive_thesis_status,
    evaluate_metric,
    is_past_deadline,
    normalize_metric_name,
    score_delta,
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


# --- Convict Score: score_delta / apply_resolution ------------------------- #

def test_on_track_raises_broken_lowers():
    assert score_delta(50.0, "On Track", "Medium") > 0
    assert score_delta(50.0, "Broken", "Medium") < 0


def test_close_costs_a_little_but_nothing_like_broken():
    """A near-miss must not be free.

    If Close scored 0 (the original design), "set a target you'll land just
    short of" would be a risk-free strategy — you could never lose points.
    """
    close = score_delta(50.0, "Watch", "Medium")
    broken = score_delta(50.0, "Broken", "Medium")
    assert close < 0
    assert abs(close) < abs(broken) / 4


def test_close_still_scales_with_conviction():
    high = score_delta(50.0, "Watch", "High")
    medium = score_delta(50.0, "Watch", "Medium")
    low = score_delta(50.0, "Watch", "Low")
    assert high < medium < low < 0


def test_higher_conviction_moves_more():
    assert score_delta(50.0, "On Track", "High") > score_delta(50.0, "On Track", "Medium")
    assert score_delta(50.0, "On Track", "Low") < score_delta(50.0, "On Track", "Medium")


# --- Convict Score: the incentive property --------------------------------- #
#
# The design constraint that matters most, and the one that's easiest to break
# by "just retuning the weights": conviction is self-declared and free, so it
# must never pay to declare High on everything. These tests pin the incentive,
# not the arithmetic — they'd survive a rescaling of SCORE_STEP but fail if the
# gain/loss asymmetry were flattened back out.

def _expected_value(conviction, p):
    """Score change expected from one call you believe lands with probability p."""
    win = score_delta(50.0, "On Track", conviction)
    lose = score_delta(50.0, "Broken", conviction)
    return p * win + (1 - p) * lose


def _crossover(conviction_a, conviction_b):
    """The p at which conviction_a overtakes conviction_b, by bisection."""
    lo, hi = 0.0, 1.0
    for _ in range(60):
        mid = (lo + hi) / 2
        if _expected_value(conviction_a, mid) > _expected_value(conviction_b, mid):
            hi = mid
        else:
            lo = mid
    return (lo + hi) / 2


def test_losses_are_weighted_more_steeply_than_gains():
    """The whole mechanism rests on this: High must cost more than it pays."""
    high_gain = score_delta(50.0, "On Track", "High")
    high_loss = abs(score_delta(50.0, "Broken", "High"))
    assert high_loss > high_gain

    low_gain = score_delta(50.0, "On Track", "Low")
    low_loss = abs(score_delta(50.0, "Broken", "Low"))
    assert low_loss < low_gain  # Low is the reverse trade: safer, pays less


def test_declaring_high_on_everything_is_not_optimal():
    """A merely-better-than-a-coin-flip forecaster should NOT pick High."""
    assert _expected_value("High", 0.55) < _expected_value("Medium", 0.55)
    assert _expected_value("High", 0.55) < _expected_value("Low", 0.55)


def test_high_pays_off_only_when_you_are_genuinely_confident():
    assert _expected_value("High", 0.85) > _expected_value("Medium", 0.85)
    assert _expected_value("High", 0.65) < _expected_value("Medium", 0.65)


def test_each_conviction_level_owns_a_band_of_confidence():
    """Documented in docs/SCORING.md: Low < ~67% < Medium < ~73% < High."""
    med_over_low = _crossover("Medium", "Low")
    high_over_med = _crossover("High", "Medium")
    assert 0.66 < med_over_low < 0.68
    assert 0.72 < high_over_med < 0.74
    # Ordered bands, so every level is the right answer somewhere.
    assert med_over_low < high_over_med


def test_a_single_call_moves_only_gradually():
    # One correct Medium call from the start should NOT jump to 60 (the old bug).
    assert apply_resolution(SCORE_START, "On Track", "Medium") == 54.0


def test_gains_shrink_near_the_top_losses_near_the_bottom():
    # Damped: the same call moves less the closer you are to a bound.
    assert score_delta(90.0, "On Track", "Medium") < score_delta(50.0, "On Track", "Medium")
    assert abs(score_delta(10.0, "Broken", "Medium")) < abs(score_delta(50.0, "Broken", "Medium"))


def test_score_is_clamped_to_0_100():
    assert apply_resolution(99.5, "On Track", "High") <= 100.0
    assert apply_resolution(0.5, "Broken", "High") >= 0.0


def test_unknown_status_never_scores():
    assert score_delta(50.0, "Pending", "Medium") == 0.0
    assert apply_resolution(50.0, "Pending", "Medium") == 50.0


def test_sustained_accuracy_climbs_but_stays_bounded():
    score = SCORE_START
    for _ in range(30):
        score = apply_resolution(score, "On Track", "High")
    assert 85 < score < 100  # high, but never pinned at 100


# --- is_past_deadline ------------------------------------------------------ #

def test_is_past_deadline():
    today = datetime.date(2026, 7, 24)
    assert is_past_deadline("2026-07-23", today) is True
    assert is_past_deadline("2026-07-24", today) is False  # the day itself isn't past
    assert is_past_deadline("2026-08-01", today) is False
    assert is_past_deadline(None, today) is False
    assert is_past_deadline("garbage", today) is False
    assert is_past_deadline(datetime.date(2026, 7, 1), today) is True
