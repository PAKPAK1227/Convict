# The Convict Score — design record

Everything about how the score works, why each number is what it is, and what
was rejected along the way. If you change the formula, change this file in the
same commit.

**Source of truth:** `data-service/evaluate_theses.py` (`BASE_MOVE`,
`GAIN_WEIGHT`, `LOSS_WEIGHT`, `score_delta`, `apply_resolution`).
Nothing else computes the score.

---

## 1. What the score is

A credit-score-style rating in **0–100, starting at 50**. It is a claim about
*judgement*, not about returns — you're scored on whether the targets you
committed to actually landed.

Three properties it has to have, which drove every decision below:

1. **It can only move on resolution.** One scoring event per thesis, applied
   exactly once, when the deadline passes. Day-to-day market noise never touches
   it — otherwise the score would measure volatility, not judgement.
2. **It can't be farmed.** Every degree of freedom a user controls — how many
   theses they open, what conviction they declare, how close they set targets,
   whether they delete a loser — must be neutral or negative in expectation.
3. **It has to be hard to max out.** A high score should mean sustained
   accuracy, not one lucky quarter.

---

## 2. The formula

For one resolved thesis, at current score `S`:

```
base = BASE_MOVE[status]           # On Track +4.0 · Watch −0.5 · Broken −4.0

if base > 0:  delta = base × GAIN_WEIGHT[conviction] × (100 − S) / 50
else:         delta = base × LOSS_WEIGHT[conviction] × S / 50

S' = clamp(S + delta, 0, 100)
```

| Conviction | Gain weight | Loss weight | At S=50, right | At S=50, wrong |
|---|---|---|---|---|
| High   | ×1.15 | ×1.40 | **+4.6** | **−5.6** |
| Medium | ×1.00 | ×1.00 | +4.0 | −4.0 |
| Low    | ×0.85 | ×0.70 | +3.4 | −2.8 |

A near-miss (`Watch` → shown as **Close**) costs `−0.5 × LOSS_WEIGHT`, so −0.7 /
−0.5 / −0.35 by conviction.

Unknown or Pending statuses score **zero** — an unevaluated thesis never moves
the score in either direction.

---

## 3. Decision log

### 3.1 Why the score only moves at the deadline
*Decided when the score was first persisted (`20260724_convict_score.sql`).*

The alternative was scoring live standings. Rejected: a user could watch a
thesis go green, screenshot the score, and the number would mean nothing because
it'd swing back next week. Locking to resolution also makes the score *append-only* —
each event is applied once and never revisited, so there's no recomputation path
and no way to retroactively edit history.

**Consequence, accepted:** the score is not reproducible from the current
database state. Two users with identical records can hold different scores
depending on the order and timing of their resolutions, because the damping term
depends on the running score. Fine for v1. **Worth revisiting before a public
leaderboard**, where "why is my score different from theirs" becomes a support
question — that would want a `status_history` table and a recomputable score.

### 3.2 Why deleting a thesis doesn't refund the score
*Anti-gaming, decided with the above.*

The scoring event is applied to `profiles.convict_score` at resolution and the
thesis's contribution is not tracked separately, so deleting it afterwards
changes nothing. This is intentional: you cannot erase a loss.

### 3.3 Why gains and losses are damped near the bounds

`(100 − S)/50` on gains and `S/50` on losses makes 0 and 100 asymptotic. Without
it, twelve good calls would pin someone at 100 and the top of the range would be
crowded and meaningless. With it, 30 straight High-conviction wins land in the
high 80s–90s (pinned by a test) and the last few points stay genuinely expensive.

### 3.4 Close used to be free — fixed 2026-07-26

**Original design:** `outcome` mapped On Track=1.0 / Watch=0.5 / Broken=0.0 into
`delta = 8 × weight × (outcome − 0.5)`, which made a Close worth **exactly zero**.

**The hole:** you set the target yourself. If missing-but-nearly costs nothing,
the optimal strategy is to set targets you'll land just short of — you bank the
wins and pay nothing for the misses. Risk-free.

**Fix:** Close now costs −0.5 at Medium. Deliberately small — 8× lighter than
Broken — because a near-miss genuinely is better forecasting than being wildly
wrong, and the point is to register the miss, not to punish it. It still scales
with conviction, so a confident near-miss stings slightly more.

### 3.5 Conviction weights made asymmetric — 2026-07-26

**Original design:** one `CONVICTION_WEIGHT` (High 1.25 / Medium 1.0 / Low 0.75)
multiplying gains and losses equally.

**The hole — this is the important one.** Conviction is *self-declared and
free*. Under symmetric weights, expected value for a call you believe lands with
probability `p` is `w × 4 × (2p − 1)`. That's increasing in `w` whenever
`p > 0.5`. So **any** forecaster better than a coin flip maximises their score by
declaring High on every single thesis. The field would then carry no information,
the pips on the dashboard would be decorative, and the score would stop measuring
calibration — it would just measure hit rate, scaled by 1.25.

**Fix:** weight the downside more steeply than the upside, so declaring High is a
real bet rather than a free multiplier. Expected value at S=50:

```
High     10.2p − 5.6
Medium    8.0p − 4.0
Low       6.2p − 2.8
```

Crossovers: **Medium beats Low above p ≈ 66.7%**, **High beats Medium above
p ≈ 72.7%**. Each level therefore owns a band of confidence and is the correct
answer somewhere. Declaring High now asserts roughly 3-to-1 odds, and doing it
indiscriminately actively costs you.

This is the same logic as a proper scoring rule: the incentive-compatible
reporting strategy has to be the honest one.

**Tuning knob:** if High feels too punishing in practice, `LOSS_WEIGHT["High"]`
= 1.25 moves its threshold from ~73% to ~65%. Lower it further and you walk back
toward the always-High degenerate case; at 1.15 (symmetric) you're all the way
back to it.

**Rejected alternative:** requiring users to enter a numeric probability and
scoring with a Brier score. Strictly better epistemics, considerably worse
product — three labelled buttons is the reason people fill the field in at all.
The banded thresholds above are an approximation of the same idea.

### 3.6 The client-side score estimator was deleted — 2026-07-26

`client/src/lib/score.js` used to export `convictScore()`, a v1 estimate
computed from current standings before the server-side score existed. By the
time the evaluator owned the number, this was dead code that disagreed with it.
Removed; only `scoreTier()` (presentation) remains.

**Rule going forward:** the score is computed in exactly one place. The client
displays it and never derives it.

---

## 4. Where the numbers are duplicated

Changing the weights means touching these, in the same commit:

| File | What it holds |
|---|---|
| `data-service/evaluate_theses.py` | The formula. Source of truth. |
| `data-service/tests/test_evaluate_theses.py` | Pins the incentive property and the crossover bands. |
| `client/src/components/Onboarding.jsx` | Step 2 shows the gain/loss table to users. |
| `README.md` | Public description of the formula. |
| This file | The reasoning. |

The tests are written to pin **incentives, not arithmetic** — they check that
High only pays above ~73% confidence, not that a win is worth 4.6 points. Rescale
`BASE_MOVE` and they still pass; flatten the asymmetry and they fail. That's the
property you'd actually regret breaking.
