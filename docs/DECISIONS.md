# Convict — Decisions & Follow-ups

This file records the decisions made while working through §1–§6 of
`CONVICT_TODO.md`, plus the items that require **your** action (Supabase
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
