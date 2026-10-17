"""Tests for the MAV / M / Θ volatility profile.

The statistical tests use seeded simulations, so they're deterministic; the
tolerances are set from the estimators' known sampling error, not tuned to pass.
"""
import math
import random

import pytest

import volatility as vol


def gbm(n, sigma, mu=0.0, start=100.0, dt=vol.DAILY_DT, rng=None):
    rng = rng or random.Random(0)
    prices = [start]
    for _ in range(n):
        z = rng.gauss(0.0, 1.0)
        prices.append(prices[-1] * math.exp((mu - 0.5 * sigma ** 2) * dt + sigma * math.sqrt(dt) * z))
    return prices


# --- the random-walk constant ---------------------------------------------- #

def test_constant_matches_the_framework_value():
    assert round(vol.RANDOM_WALK_CONSTANT, 3) == 0.318


def test_closed_form_integral_matches_numerical_integration():
    n = 100_000
    numeric = sum(math.sqrt(((i + 0.5) / n) ** 2 - (i + 0.5) / n + 1 / 3) for i in range(n)) / n
    assert vol._rw_integral() == pytest.approx(numeric, abs=1e-9)


# --- MAV ------------------------------------------------------------------- #

def test_mav_removes_drift_exactly():
    # Constant growth: every return equals the mean, so there's no volatility.
    closes = [100 * 1.001 ** i for i in range(300)]
    assert vol.mav(closes) == pytest.approx(0.0, abs=1e-12)


def test_mav_recovers_the_volatility_of_a_simulated_series():
    closes = gbm(252 * 4, sigma=0.30, rng=random.Random(1))
    assert vol.mav(closes) == pytest.approx(0.30, rel=0.06)


def test_mav_needs_two_returns():
    assert vol.mav([100, 101]) is None


# --- M --------------------------------------------------------------------- #

def test_m_is_zero_for_a_flat_series_and_scale_free():
    assert vol.mean_excursion([50.0] * 10) == 0.0
    prices = [100, 104, 98, 103, 101]
    assert vol.mean_excursion(prices) == pytest.approx(vol.mean_excursion([p * 10 for p in prices]))


def test_m_by_hand():
    # mean 100; deviations 10, 0, 10 -> mean 6.667 -> /100
    assert vol.mean_excursion([90, 100, 110]) == pytest.approx(20 / 3 / 100)


# --- Θ --------------------------------------------------------------------- #

def test_theta_averages_one_for_driftless_random_walks():
    rng = random.Random(7)
    thetas = [vol.profile(gbm(252, sigma=0.20, rng=rng))["theta"] for _ in range(400)]
    assert sum(thetas) / len(thetas) == pytest.approx(1.0, abs=0.06)


def test_a_steady_trend_reads_as_directional():
    rng = random.Random(3)
    closes = gbm(252, sigma=0.15, mu=0.80, rng=rng)  # strong drift, modest noise
    assert vol.profile(closes)["theta"] > 1.5


def test_a_range_bound_series_reads_below_one():
    rng = random.Random(5)
    # Oscillates around 100 with noise: lots of movement, little net excursion.
    closes = [100 * (1 + 0.03 * math.sin(i / 2.0)) * math.exp(rng.gauss(0, 0.004)) for i in range(253)]
    assert vol.profile(closes)["theta"] < 0.7


def test_theta_is_none_for_a_flat_series():
    assert vol.profile([100.0] * 200)["theta"] is None


# --- profile --------------------------------------------------------------- #

def test_profile_uses_only_the_most_recent_year():
    closes = [1.0] * 500 + gbm(252, sigma=0.25, rng=random.Random(9))
    p = vol.profile(closes)
    assert p["closes"] == vol.WINDOW_CLOSES
    assert p["mav"] == pytest.approx(vol.mav(closes[-vol.WINDOW_CLOSES:]))


def test_profile_needs_enough_history():
    assert vol.profile(gbm(vol.MIN_CLOSES - 2, sigma=0.2)) is None
    assert vol.profile(gbm(vol.MIN_CLOSES - 1, sigma=0.2)) is not None


def test_profile_ignores_missing_and_bad_closes():
    closes = gbm(100, sigma=0.2)
    assert vol.profile(closes[:50] + [None, 0, -1] + closes[50:]) == vol.profile(closes)
