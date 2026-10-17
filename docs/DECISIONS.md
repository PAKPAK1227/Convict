# Convict — Decisions & Follow-ups

This file records the decisions made building Convict, plus the items that require **your** action (Supabase
dashboard, GitHub settings, deployment) which cannot be done from the codebase.

---

## §1 Session bug — fixed

- Centralized auth in `client/src/context/AuthContext.jsx` with an
  `onAuthStateChange` listener (no more one-shot `getSession()` per page).
- `ProtectedRoute` guards `/dashboard`, `/create`, `/thesis/:id`.
- `Login.jsx` now calls `supabase.auth.signOut()` **before** signup, checks
  whether `data.session` actually came back, and only navigates when it did.
- A visible **Log out** button lives in the shared `Navbar`.

### ⚠️ You must verify (needs live Supabase — cannot be done from code)
RLS independence check (§1 / §6). Log in as User A, then in the browser console:

```js
// Should return an empty array — RLS scopes by auth.uid()
const { data } = await supabase.from('theses').select('*').eq('id', '<User B thesis id>');
console.log(data); // expect []
```

Expected: empty. This should already pass (policies scope by `auth.uid()`), but
verify rather than assume.

---

## §2 Email confirmation policy — recommendation

The UI now handles **both** states correctly: if `signUp()` returns no session,
it shows "Check your email to confirm your account." So either policy works.

- **Recommended:** keep email confirmation **ON** (production-correct). The UX
  is now handled.
- If you want frictionless local dev, turn it off in
  Supabase → Authentication → Providers → Email → "Confirm email".

---

## §3 Data integrity

- **Metric dropdown** — done. `ThesisDetail` now uses a `<select>` restricted to
  the canonical keys (`pe_ratio`, `revenue_growth`, `profit_margin`) via
  `client/src/lib/metrics.js`.
- **Broken status** — done. Implemented in `data-service/evaluate_theses.py`:
  a metric that misses its target by more than **25%** (`BROKEN_THRESHOLD`) is
  `Broken`; a smaller miss is `Watch`. Thesis status is worst-wins.
- **Missing Finnhub fields** — done. `current_value` stays `null` and the UI
  shows "not tracked yet" instead of hiding the metric.

### Ticker validation — deferred (format-only for now)
Client-side format validation (`isValidTicker`, 1–5 letters) ships now. A live
"does this symbol exist?" check requires calling Finnhub, and the Finnhub key
**must not** ship to the browser (§6). Wire this up once the data-service is
deployed:

```
POST /validate-ticker { ticker }  ->  { exists: bool }   # server-side, holds the key
```

### `status_history` table — deferred to Phase 2
It powers accuracy scoring (the "Convict Score"), which is a Phase-2 feature
(§9). Deferring rather than half-building it. When you implement it, run:

```sql
create table status_history (
  id uuid primary key default gen_random_uuid(),
  thesis_id uuid not null references theses(id) on delete cascade,
  status text not null,
  created_at timestamptz not null default now()
);
alter table status_history enable row level security;
-- add a select policy scoped via the parent thesis's user_id
```
Then append a row in `evaluate_theses.py` wherever the thesis status is written.

### `last_updated` on the Dashboard — partially done
The UI renders a freshness timestamp **defensively** (`freshness()` in
`lib/metrics.js`) — it only shows if the row actually has a `last_updated` /
`updated_at` column. I did **not** make the evaluator write a timestamp, because
writing to a column that doesn't exist would crash the nightly job against your
live schema (which I can't inspect from here). To fully enable it:

```sql
alter table metrics add column last_updated timestamptz;
alter table theses  add column last_updated timestamptz;
```
Then in `evaluate_theses.py`, add `"last_updated": datetime.now(timezone.utc).isoformat()`
to the metric and thesis `update({...})` payloads.

---

## §4 Frontend — done

Edit/delete for theses and metrics, Dashboard empty state, current-vs-target on
cards, shared `Navbar`, centralized auth `context`, and responsive grid
(`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`).

---

## §5 Backend & infrastructure

- **`server/` deleted** — it was an empty Express scaffold (only `package.json`),
  fully bypassed by the Python service. Recoverable from git history.
- **`main.py`** — FastAPI stripped; it's now a plain importable module with a
  pure `map_fundamentals()` helper. `requirements.txt` no longer pulls
  `fastapi`/`uvicorn`.
- **Finnhub error handling** — a failed fetch for one ticker is caught, logged,
  and skipped; the run continues. Network requests now have a 15s timeout.
- **Logging / alerting** — the evaluator uses `logging` and **exits non-zero**
  when any ticker fails, so the GitHub Actions run goes red visibly.

### Notes (your call)
- **Cron time** (`0 6 * * *` UTC) — verify this is sensible for your market-data
  freshness and timezone.
- **Rate limiting** — the 1.2s delay + per-ticker cache scales with unique
  tickers; revisit once there's real volume.

---

## §6 Security review — findings

- ✅ **No `.env` in git history** (`git log --all --full-history -- "**/.env"` is empty).
- ✅ **No `.env` currently tracked.**
- ✅ **Service key never in client** — `client/src/` references only
  `REACT_APP_SUPABASE_URL` and `REACT_APP_SUPABASE_ANON_KEY` (the anon key is
  safe to expose; RLS enforces access). Service key stays in
  `data-service/.env` + GitHub Secrets.

### ⚠️ Your actions (cannot be done from code)
- **Enable 2FA on GitHub** — required by Aug 22, 2026 per the repo notice.
- **Rotate keys** before making the repo widely visible if there's any doubt
  about prior exposure.
- **Re-verify RLS** after the session fix (see §1 above).

---

## Account deletion (self-service, permanent)

Users can permanently delete their account + all data from **Account → Danger
Zone** (`/account`, linked in the Navbar). Typing `DELETE` arms the button,
which calls `supabase.rpc('delete_user')`, then signs out and returns to the
landing page.

Deleting the actual `auth.users` account needs privileges the browser must not
have (service-role). Instead of putting that key in the client, a
`SECURITY DEFINER` Postgres function does the work server-side; `auth.uid()`
inside it guarantees a caller can only ever delete **themselves**.

### ⚠️ One-time deploy step (required for the feature to work)
Paste **`supabase/migrations/20260723_delete_user.sql`** into the Supabase SQL
editor and run it once (as the privileged editor role, so the function owner can
delete from the `auth` schema). Until then the button will error with a helpful
"deploy the migration" message. The function deletes the user's `metrics`, then
`theses`, then their `auth.users` row (which cascades to their sessions).

---

## Tests

- `data-service/tests/` — 21 pytest cases over the pure evaluation logic
  (`evaluate_metric`, `derive_thesis_status`, `normalize_metric_name`,
  `map_fundamentals`). Run: `./venv/bin/python -m pytest tests/` (dev deps:
  `pip install -r requirements-dev.txt`).
- `client/src/lib/__tests__/` — 14 Jest cases over validation + metric helpers
  (incl. ticker, credential, and delete-confirmation logic). Run: `CI=true npm test`.
- A Login component render test was omitted: CRA 5's frozen Jest config can't
  resolve react-router-dom v7's ESM `exports` map. The extracted pure logic it
  would have exercised is covered directly.

---

## Evaluator monitoring — "green" didn't mean "worked" (2026-07-26)

Two silent-failure paths were closed. Neither was a bug in the sense of wrong
code; both were cases where the system failed and **nothing told anyone**.

### Failure 1 — swallowed DB writes exited 0

`evaluate_all_metrics()` returned only the count of tickers Finnhub couldn't
fetch. Every database write was wrapped in `try/except … logger.error(…)` and
then execution continued, so a failed `profiles` upsert — someone's Convict
Score not updating — produced a **green Actions run and no email**.

That specific failure is the worst one in the system: by the time the score
write is attempted the thesis is already marked `resolved`, so the scoring event
is gone for good and will never be retried.

**Fix:** the run now accumulates a `stats` dict counting every write failure
alongside the fetch failures, `_apply_score_events()` returns success/failure
instead of `None`, and `main()` exits non-zero if *any* count is non-zero. A red
run now means "something didn't get written," which is what it always implied.

### Failure 2 — the cron stopping entirely

A failing run emails you. A run that never happens doesn't. Three realistic ways
that occurs:

- GitHub **auto-disables scheduled workflows after 60 days of repo inactivity**
- a free-tier Supabase project **pauses after ~a week of no requests**
- schedules get dropped under Actions load

In all three, nothing turns red — theses just freeze on stale numbers, and the
symptom users report is "my data is wrong", not "there's an error".

**Fix, two parts:**

1. Every run stamps `public.evaluator_runs` (`20260726_evaluator_heartbeat.sql`)
   with a timestamp, an `ok` flag, and per-stage counts. `write_heartbeat()`
   never raises — a broken heartbeat must not change the outcome of the run it
   describes.
2. `.github/workflows/evaluator-heartbeat.yml` runs at 12:00 UTC (six hours
   after the evaluator, so a slow run isn't a false alarm), reads the newest
   stamp, and **fails if it's older than 36 hours** — which emails you. It also
   makes a keepalive commit if the repo has been quiet for 25+ days, so the
   60-day clock never runs out. The commit carries `[skip ci]` so Vercel doesn't
   burn a production build on it.

**Why a table rather than an error-tracking vendor:** this detects *absence*,
which a client-side tracker structurally cannot. It costs one row a day, adds no
vendor and no CSP change, and the counts double as a record of what the
evaluator has actually been doing. Pruned to 90 days by `prune_evaluator_runs()`.

**Why `evaluator_runs` has RLS on with no policies:** the service key bypasses
RLS, so the evaluator writes fine, while no client can read it at all. Row
counts would leak how many users exist, and operational data isn't something
end users need. If the app ever shows "data last refreshed X ago", expose
`ran_at` through a view rather than opening the table.

### ⚠️ One-time deploy step
Paste **`supabase/migrations/20260726_evaluator_heartbeat.sql`** into the
Supabase SQL editor and run it once. Until then the evaluator logs
`Failed to write heartbeat` (harmless — the run itself still works) and the
heartbeat workflow fails with "No evaluator run has ever been recorded."

### ⚠️ Check your notification settings
This whole mechanism assumes GitHub emails you about failed Actions runs.
Verify at **GitHub → Settings → Notifications → Actions** that failure
notifications are on for the address you actually read. Without that, the runs
turn red and no one looks.

### Deliberately not done
**Sentry / client-side error tracking.** Considered and deferred: at current
user numbers, issues are reproducible directly, and the setup cost is real —
`vercel.json` pins `connect-src` to self + Supabase, so the CSP would need
`https://*.ingest.sentry.io` added, and CRA 5 with no craco has no clean hook
for source-map upload (Vercel's Sentry integration is the way in, when it's
time). Revisit when reports start arriving from users who can't be messaged
directly. The gap it would close — Supabase call failures at the
`console.error` sites in `Dashboard`/`ThesisDetail`/`CreateThesis`/`Profile`
currently die with the tab — is real but not yet urgent.

---

## Thesis integrity locks (2026-09-26)

A thesis is now a commitment, not a draft. Full reasoning in
[SCORING.md §3.7](SCORING.md); the operational side:

- **Rules.** Theses and their targets can be edited or deleted only within 24
  hours of creation. Deadlines must be ≥ 30 days after creation, ≥ 90 with a
  revenue-growth or profit-margin target. `created_at` and
  `metrics.current_value` are server-owned. The evaluator (service key) is
  exempt from all of it.
- **Where.** Triggers in `20260926_thesis_integrity_locks.sql`. They *raise*
  rather than silently ignore a change, so the client can show why. The UI
  mirrors the rules (`lib/lock.js`, `minDeadlineDays` in `lib/metrics.js`) but
  is not what enforces them.
- **Account deletion.** `delete_user()` is redefined to set a
  transaction-local flag (`convict.account_deletion`) that the triggers honour,
  so users can still delete an account full of locked theses. Clients can't
  set arbitrary settings through PostgREST.
- **Void.** New `theses.status` value for a thesis that reaches its deadline
  with no usable market data or no targets. Not scored. The heartbeat table has
  no column for it; the run summary log reports the count.
- **Time zones.** Minimum deadlines are counted from the UTC creation date, in
  the database and the form alike, matching the evaluator's UTC day.

### ⚠️ One-time deploy step
Paste **`supabase/migrations/20260926_thesis_integrity_locks.sql`** into the
Supabase SQL editor and run it once. Until then the UI hides edits after 24h
but the database would still accept them, and the evaluator's first `Void`
write fails the `theses_status_valid` check (the run turns red, nothing is
lost).

---

## Target baselines (2026-09-26)

Reasoning in [SCORING.md §3.8](SCORING.md). Operationally:

- **Schema.** `metrics.baseline_value`, `baseline_at`, `already_met`;
  `theses.unscored`. All written only by the evaluator — the metrics trigger
  and `theses_protect_verdict()` are redefined to freeze them for clients.
- **Evaluator.** Stamps the baseline in the same `update` as `current_value`,
  on the first run that returns a value. `was_already_met()` and
  `counts_toward_score()` are the pure pieces, unit-tested; run-level tests
  cover stamping, never-overwriting, and the resolution outcomes.
- **Run summary** logs an `unscored` count alongside `void`.

### ⚠️ One-time deploy step
Run **`supabase/migrations/20260927_target_baselines.sql`** in the Supabase SQL
editor **before** merging. Otherwise the evaluator's first write of
`baseline_value` fails, every metric update counts as a write failure and the
run turns red (nothing is lost; it catches up once the migration runs).

---

## Ticker snapshots instead of a live lookup API (2026-09-26)

The create form shows a ticker's company name, last close and 52-week range,
and rejects symbols that don't exist.

**Why nightly snapshots and not a live endpoint.** A live lookup would need a
server-side proxy (Supabase Edge Function) holding the Finnhub key, a cache and
per-user throttling — and every keystroke would draw on the single free-tier
budget of 60 calls/minute shared by all users. Instead `refresh_snapshots.py`
writes everything to `ticker_snapshots` once a night and the browser only reads
Supabase. No new deploy target, no key anywhere new, zero API calls while users
type. The data is "as of last close", which is also the price grading uses.
A live Edge Function can still be layered on later if the one-day delay ever
matters.

- **Universe.** Full data for the S&P 500 (`data-service/universe/sp500.txt`,
  from Wikipedia — refresh it when membership changes) plus every ticker with
  an open thesis. Every other US symbol gets a row from the symbol list only
  (name, no price), which is enough to validate it exists.
- **Budget.** ~500 tickers × 2 calls throttled to 1.1s ≈ 20 minutes nightly;
  company names are fetched once per ticker, ever.
- **Failure policy.** One ticker failing doesn't stop the run. The run fails
  (and emails) only if the symbol list fails or >10% of tickers do. The form
  treats a missing row as "unknown ticker" only when the table is populated —
  if the table is empty or the read fails, it lets the user continue.
- **Gotcha, fixed in code.** supabase-py sends the union of a batch's keys as
  PostgREST's `columns`, and PostgREST writes NULL for any listed column a row
  omits. Batches are therefore grouped by row shape (`upsert_batches`), or a
  row without `company_name` would wipe a stored one.

### ⚠️ One-time deploy steps
1. Run **`supabase/migrations/20260928_ticker_snapshots.sql`** in the Supabase
   SQL editor.
2. After merging, run **Actions → Refresh Ticker Snapshots → Run workflow**
   once so the panel has data before the first scheduled run.

### Rate-limit safeguards
- Every Finnhub call goes through `main._get()`, which on HTTP 429 waits
  (`Retry-After`, else 5s) and retries up to 3 times instead of failing the
  ticker.
- `evaluate-theses.yml` and `refresh-snapshots.yml` share the `finnhub-api`
  concurrency group, so GitHub never runs them at once — each paces itself
  under 60/min, but two at the same time wouldn't be. (A delayed 04:00 run
  can otherwise overlap the 06:00 one.) GitHub keeps one pending run per
  group, which is plenty for two daily schedules.

---

## Price history, volatility and API budgets (2026-10-17)

### Where historical prices come from: Massive
The volatility profile needs a year of daily closes. **Finnhub's free plan
returns 403 for historical candles** (verified with a live call), so a second
provider was needed.

- **Chosen: Massive (formerly Polygon.io), free "Stocks Basic" plan.** End-of-day
  data, 2 years of history, 5 calls/minute. Its *grouped daily* endpoint
  returns every US stock's bar for one date in a single call, so call volume
  doesn't grow with tickers or users. Bars are split-adjusted and are the
  official closes, which also removes the risk of a late-starting GitHub job
  reading a mid-session price.
- **Rejected: building our own history from nightly Finnhub quotes** —
  volatility would take ~3 months to appear and a year to be complete, and a
  delayed run on a weekday can capture an intraday price instead of the close.
- **Rejected: Tiingo free plan** — one call per ticker, capped at 50/hour and
  500 symbols/month; too tight for 500+ tickers.
- **Licensing:** free market-data plans (Finnhub's included) generally restrict
  commercial use and redistribution. Fine while building; **review the terms
  before a paid or public launch.**

### Coverage: S&P 500 + tracked tickers
History and volatility are kept for the S&P 500 plus every ticker with an open
thesis (~510 tickers, ~126k rows/year, ~15 MB — about 3% of Supabase's free
tier). Because one grouped call covers the whole market, coverage costs storage,
not API calls. Every US stock (~2.5M rows/year) was rejected as too much for the
free database; tracked-only was rejected because the panel would show nothing
for most tickers a user types.

### Prices moved off Finnhub
Last close and 52-week range are now computed from the Massive history
(52-week range from daily highs/lows). That replaced ~1,000 Finnhub quote and
metric calls a night with zero. Finnhub is kept for the symbol list (1 call),
company names (once per ticker, ever) and fundamentals in the grader.

### Rate limits as the app grows
| Caller | Calls | Grows with |
|---|---|---|
| Browser | 0 — reads Supabase only | nothing |
| Snapshot job → Massive | ~2/night (1 grouped + 1 splits) | nothing, except one-off backfills |
| Snapshot job → Finnhub | ~1/night (+1 per brand-new ticker, ever) | new tickers only |
| Grader → Finnhub | 1 per distinct ticker with an open thesis | tracked tickers |

Protections:
- **Massive:** every call goes through one module-level throttle (12.5s apart,
  4.8/min under the 5 allowed) with HTTP 429 retries, and
  `MASSIVE_CALL_BUDGET` (220) caps calls per run. The initial year-long
  backfill (~265 calls) therefore spans two nights; missing days are fetched
  newest first so current prices exist after the first night.
- **Grader:** `MAX_TICKERS_PER_RUN` (2,500 ≈ 50 min at 1.2s/call) with theses
  processed in deadline order, so outgrowing the free tier only ever delays the
  theses with the most time left, by a night. Deferred theses are never voided.
  The count is stored in `evaluator_runs.tickers_deferred`, and the heartbeat
  workflow raises a warning when it's non-zero.
- **Both nightly workflows** share the `finnhub-api` concurrency group (from
  the snapshot PR), and all Finnhub calls retry on 429.

### History correctness
- **Splits.** Grouped bars are split-adjusted as of the night they're fetched,
  so stored history before a split no longer lines up. One splits call a night
  finds affected tickers; each has its history replaced with one range call,
  recorded in `ticker_snapshots.history_backfilled_at` so it isn't repeated.
  (This is also groundwork for price targets' split protection.)
- **New tickers.** A ticker with under 90% of the market's stored trading days
  that has never been backfilled gets one range call. Recent IPOs aren't
  re-fetched every night.
- **Holidays.** Weekdays are asked for; one returning no bars is recorded as a
  market holiday only once it's more than 3 days old, so a day that simply
  isn't published yet is retried rather than lost.
- **Retention.** 372 calendar days are used; rows older than 400 days are
  pruned nightly.

### Volatility framework
The project owner's own definitions, implemented in `data-service/volatility.py`
— deliberately not standard realised volatility. Notation: p₀…pₙ sampled
prices, Δt = 1/252 for daily closes, T = window length in years,
rᵢ = ln(pᵢ/pᵢ₋₁), r̄ = mean rᵢ, a = mean price.

- **MAV — mean absolute volatility ("how violent").**
  σ_MAV = √(π/2) · (1/n)·Σ|rᵢ − r̄| · (1/√Δt). Annualised and comparable to
  quoted volatility. Subtracting r̄ removes drift exactly; √(π/2) converts MAD
  to standard-deviation units; MAD is steadier than variance under fat tails.
  No continuous-time limit exists, so Δt is always reported.
- **M — mean excursion ("how wide").** M = mean(|pᵢ − a|)/a. Dimensionless; the
  expected payoff of an ATM straddle struck at a for a uniformly random
  exercise date, as a fraction of notional. Blind to price order by design.
- **Θ — directionality ("how directional").** Θ = M / (C · σ_MAV · √T), where
  C = √(2/π) · ∫₀¹ √(t² − t + 1/3) dt. The framework quotes C ≈ 0.318; the code
  uses the exact closed form, **0.31789** (verified against numerical
  integration in the tests).

Implementation choices:
- **Window:** the latest 253 daily closes (one year, T ≈ 1). Shown only with at
  least 64 closes (about a quarter); below that the estimates are too noisy.
- **Validation:** seeded simulations confirm the framework's claims — Θ
  averages 1.0 across 400 driftless random walks; a strong trend reads above
  1.5; a range-bound series below 0.7.
- **Θ is noisy over one year.** Simulating 4,000 random walks: median 0.90,
  middle half 0.68–1.23, and **12.8% land above 1.5 by chance alone**. The UI
  therefore presents Θ as a description of the past year, never a forecast.
- **Θ readings are PROVISIONAL.** The owner's original table was truncated
  ("> 1.5 | Directional; variance spent going…"). Until it's recovered, the
  panel uses: **< 0.6 Range-bound · 0.6–1.5 Random-walk-like · > 1.5
  Directional** (random walks land in each ~15% / ~72% / ~13% of the time).
  They live in `THETA_BANDS` in `client/src/lib/ticker.js`.
- **Naming:** shown as "Θ" with the caption "How directional", since Θ alone
  also means options time-decay to finance readers.

### ⚠️ One-time deploy steps
1. Run **`supabase/migrations/20261017_price_history.sql`** in the Supabase SQL
   editor **before merging** — the grader writes `tickers_deferred` to its
   heartbeat, and the snapshot job writes the new columns.
2. Add the **`MASSIVE_API_KEY`** repository secret (and to `data-service/.env`
   for local runs).
3. After merging, run **Actions → Refresh Ticker Snapshots → Run workflow**
   twice (or let two nights pass) to complete the year of history.
