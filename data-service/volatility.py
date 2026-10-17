"""Volatility profile: MAV, M and Θ.

The project owner's own framework (see docs/DECISIONS.md, "Volatility
framework") — deliberately not standard realised volatility. Three numbers
describe a price series over a window:

  MAV  σ_MAV = sqrt(π/2) · mean|r_i − r̄| / sqrt(Δt)      "how violent"
       Annualised, comparable to quoted vol. r_i = ln(p_i / p_{i−1}).
       Subtracting r̄ removes drift exactly (Σ r_i = ln(p_n / p_0)); sqrt(π/2)
       turns a mean absolute deviation into standard-deviation units, and MAD
       is steadier than variance under the fat tails equities have. There is
       no continuous-time limit, so Δt is always reported alongside it.

  M    M = mean|p_i − a| / a,  a = mean price                "how wide"
       Dimensionless. The expected payoff of an ATM straddle struck at a for a
       uniformly random exercise date, as a fraction of notional. Blind to the
       order of prices by design.

  Θ    Θ = M / (C · σ_MAV · sqrt(T))                         "how directional"
       C is the random-walk baseline: for driftless GBM, E[M] ≈ C·σ·sqrt(T)
       with C = sqrt(2/π) · ∫₀¹ sqrt(t² − t + 1/3) dt ≈ 0.318. Θ ≈ 1 means the
       path wandered as much as diffusion predicts; larger means it went
       somewhere.

Pure functions, no I/O or dependencies — see tests/test_volatility.py.
"""

import math

TRADING_DAYS = 252
DAILY_DT = 1.0 / TRADING_DAYS

# One year of daily closes gives 252 returns.
WINDOW_CLOSES = TRADING_DAYS + 1

# Below about a quarter of trading the estimates are too noisy to show.
MIN_CLOSES = 64


def _rw_integral():
    """∫₀¹ sqrt(t² − t + 1/3) dt in closed form (substitute u = t − ½)."""
    c = 1.0 / 12.0
    half = 0.5
    root = math.sqrt(half * half + c)
    # ∫ sqrt(u² + c) du = (u/2)·sqrt(u² + c) + (c/2)·ln(u + sqrt(u² + c))
    antiderivative = (half / 2) * root + (c / 2) * math.log((half + root) / math.sqrt(c))
    return 2 * antiderivative


# ≈ 0.31789. The framework quotes 0.318; the exact value is used here.
RANDOM_WALK_CONSTANT = math.sqrt(2.0 / math.pi) * _rw_integral()


def log_returns(closes):
    return [math.log(b / a) for a, b in zip(closes, closes[1:])]


def mav(closes, dt=DAILY_DT):
    """σ_MAV, annualised. None with fewer than two returns."""
    r = log_returns(closes)
    if len(r) < 2:
        return None
    mean = sum(r) / len(r)
    mad = sum(abs(x - mean) for x in r) / len(r)
    return math.sqrt(math.pi / 2.0) * mad / math.sqrt(dt)


def mean_excursion(closes):
    """M: mean absolute distance from the window's mean price, as a fraction
    of that mean. None for an empty series."""
    if not closes:
        return None
    a = sum(closes) / len(closes)
    return sum(abs(p - a) for p in closes) / len(closes) / a


def theta(m, sigma, years):
    """Θ, or None when the random-walk baseline is zero (a flat series)."""
    if m is None or sigma is None or years <= 0:
        return None
    baseline = RANDOM_WALK_CONSTANT * sigma * math.sqrt(years)
    return m / baseline if baseline > 0 else None


def profile(closes, dt=DAILY_DT, window=WINDOW_CLOSES, min_closes=MIN_CLOSES):
    """{mav, m, theta, closes} over the most recent `window` closes (oldest
    first), or None if there aren't at least `min_closes` positive closes."""
    series = [float(p) for p in closes if p is not None and p > 0][-window:]
    if len(series) < min_closes:
        return None
    sigma = mav(series, dt)
    m = mean_excursion(series)
    years = (len(series) - 1) * dt
    return {"mav": sigma, "m": m, "theta": theta(m, sigma, years), "closes": len(series)}
