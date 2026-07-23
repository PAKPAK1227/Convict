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
