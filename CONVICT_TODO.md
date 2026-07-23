# Convict — Outstanding Work & Fixes

**Status:** Phase 1 prototype complete and deployed
**Stack:** React (Vercel) · Supabase (Postgres + Auth + RLS) · Python/FastAPI microservice · Finnhub API · GitHub Actions (scheduled job)

---

## Current Architecture (for context)

```
convict/
├── client/           React frontend — deployed on Vercel
├── data-service/     Python: main.py (FastAPI + Finnhub), evaluate_theses.py (scheduled evaluator)
├── server/           Express scaffold — currently UNUSED, see cleanup section
└── .github/workflows/evaluate-theses.yml   Daily cron at 06:00 UTC
```

**Database tables:** `theses`, `metrics` — both with RLS enabled and per-user policies.

**Data flow:** User writes thesis + metric targets in React → stored in Supabase → GitHub Actions runs `evaluate_theses.py` daily → pulls live Finnhub fundamentals → compares against targets → writes `current_value` to `metrics` and `status` to `theses` → Dashboard reflects updated status on next load.

---

## 1. CRITICAL — Session bug (fix first)

### The bug
Signing up with a new email in a browser that already had an active session landed the user on the **previous user's dashboard**.

### Likely root cause
Not an RLS failure. RLS policies are correct — they scope by `auth.uid()` at the database level. The problem is client-side session handling:

1. Email confirmation is still **enabled** in Supabase.
2. When `signUp()` is called with confirmation on, Supabase does **not** create a new authenticated session — it returns success but no active session.
3. The old session from the previous user is still sitting in browser local storage, untouched.
4. `Login.jsx` navigates to `/dashboard` unconditionally on any non-error response.
5. `Dashboard.jsx` calls `getSession()`, finds the **stale previous session**, and renders that user's data.

So the app showed the old user's data because the old user was, in fact, still logged in.

### Required fixes

- [ ] **Add a logout function.** There is currently no way to sign out anywhere in the app.
  ```js
  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };
  ```
  Add a visible logout button to the Dashboard header.

- [ ] **Clear any existing session before signup.** Call `await supabase.auth.signOut()` at the start of `handleSignUp` so a new signup can never inherit a previous session.

- [ ] **Stop navigating blindly after signup.** Check whether a session actually came back:
  ```js
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) { alert(error.message); return; }
  if (!data.session) {
    // email confirmation required — show message, do NOT navigate
    setMessage('Check your email to confirm your account.');
    return;
  }
  navigate('/dashboard');
  ```
  Note: this reintroduces `data`, so it will no longer trip the `no-unused-vars` build error.

- [ ] **Add an auth state listener** so the app reacts to session changes rather than only checking once on mount:
  ```js
  supabase.auth.onAuthStateChange((_event, session) => { /* update state */ });
  ```

- [ ] **Verify RLS independently.** Confirm the policies genuinely hold by logging in as User A and attempting to query User B's thesis ID directly. Expected result: empty response. This should pass, but verify rather than assume.

---

## 2. Authentication & UX

- [ ] **Split Login and Sign Up into separate views.** Currently one card with two buttons, which is confusing and contributed to the bug above. Use a toggle between two distinct forms.
- [ ] **Email confirmation messaging.** Show "Check your email to confirm your account" instead of silently redirecting.
- [ ] **Decide on email confirmation policy.** Either keep it on (production-correct) and handle the UX properly, or disable it in Supabase for development. Currently on, with no UI acknowledging it.
- [ ] **Loading states on auth buttons.** Disable the button and show a spinner while the request is in flight to prevent double-submission.
- [ ] **Replace `alert()` with inline error messages.** Browser alerts are jarring and look unpolished.
- [ ] **Password validation feedback.** Supabase requires 6+ characters — surface that requirement before submission rather than after failure.

---

## 3. Data integrity

- [ ] **Replace free-text metric name with a dropdown.** This is the highest-value fix in this section. Currently a user can type anything, and if it doesn't normalize to `pe_ratio`, `revenue_growth`, or `profit_margin`, the evaluator silently skips it. Use a `<select>` with exactly the supported options, storing the canonical lowercase value.
- [ ] **Ticker validation on thesis creation.** Verify the ticker actually exists via Finnhub before saving, so users can't create theses on typos that will never evaluate.
- [ ] **Handle "Broken" status.** The status logic currently only ever produces `On Track` or `Watch`. `Broken` is defined in `getStatusColor` and used in the original design but is never actually assigned. Decide the rule — e.g. missing target by more than some threshold, or missing for N consecutive evaluations — and implement it.
- [ ] **Populate `status_history`.** This table was part of the original schema design but was never created or written to. Either implement it (to power a timeline view and eventual accuracy scoring) or formally drop it from the design.
- [ ] **Handle missing Finnhub fields.** Some tickers return `None` for certain metrics. Currently these are skipped silently — surface this in the UI so the user knows a metric isn't being tracked.

---

## 4. Frontend gaps

- [ ] **No edit or delete for theses.** Users can create but never modify or remove. RLS policies for update and delete already exist and are unused.
- [ ] **No edit or delete for metrics.** Same situation.
- [ ] **Empty state on Dashboard.** A new user with zero theses sees a blank grid with no guidance. Add a prompt directing them to create their first thesis.
- [ ] **Show `current_value` vs `target_value` on the Dashboard cards,** not just on the detail page.
- [ ] **Show `last_updated` timestamp** so users know how fresh the evaluation is.
- [ ] **No navigation component.** Every page rebuilds its own header. Extract a shared `Navbar` into `src/components/` (the folder exists and is currently empty).
- [ ] **`src/context/` is empty.** If auth state gets centralized (recommended, see §1), this is where it belongs.
- [ ] **Mobile responsiveness untested.** The grid uses `md:grid-cols-3` but nothing else has been checked at narrow widths.

---

## 5. Backend & infrastructure

- [ ] **Decide the fate of `server/`.** The Express scaffold was created early and then bypassed entirely when Python was given direct Supabase access. It currently contains `node_modules`, a `package.json`, and an unused `.env`. Either delete it or document why it's staying.
- [ ] **`main.py` is doing double duty.** It's both a FastAPI service and an importable module for `evaluate_theses.py`. The FastAPI endpoints (`/quote`, `/fundamentals`, `/evaluate`) are not actually deployed anywhere — only the local dev server runs them. Either deploy the service properly or strip FastAPI and keep it as a plain module.
- [ ] **No error handling on Finnhub failures.** If the API is down, rate-limited, or returns malformed data, `get_fundamentals` will raise and kill the entire scheduled run. Wrap in try/except and continue to the next ticker.
- [ ] **No logging or alerting on job failure.** If the nightly run fails, nothing notifies you. GitHub Actions will show a red X, but only if you look.
- [ ] **Cron runs at 06:00 UTC.** Verify this is a sensible time relative to market data freshness and your own timezone.
- [ ] **Rate limiting is handled but untested at scale.** The 1.2s delay plus per-ticker caching keeps usage proportional to unique tickers rather than total metrics. This has only been exercised with a single metric — revisit once there is real volume.

---

## 6. Security review

- [ ] **Confirm no `.env` file exists anywhere in git history,** not just that it's currently gitignored. Run `git log --all --full-history -- "**/.env"` and confirm empty output.
- [ ] **Verify the service key is only ever used server-side.** It belongs in `data-service/.env` and GitHub Secrets only — never in `client/`.
- [ ] **Re-enable and verify RLS behaviour after the session fix,** per §1.
- [ ] **Enable 2FA on GitHub.** Required by August 22, 2026 per the notice on the repo.
- [ ] **Rotate keys before making the repo widely visible** if there's any doubt about prior exposure.

---

## 7. Deployment cleanup

- [ ] **Delete the duplicate Vercel project.** Two projects currently point at the same repo; one is misconfigured (Root Directory `./`, Framework Preset "Other") and returns 404.
- [ ] **Confirm the surviving project's settings:** Root Directory `client`, Framework Preset "Create React App".
- [ ] **Verify `client/vercel.json` rewrite rule is in place** so direct navigation to `/dashboard` or `/thesis/:id` doesn't 404 on refresh.
- [ ] **Test deep links on the live URL** — refresh the page while on a thesis detail route and confirm it loads.
- [ ] **Consider a custom domain** once the app is presentable.

---

## 8. Documentation

- [ ] **Write a proper README.** Currently minimal. Should include: what Convict does, screenshots, tech stack, architecture diagram, local setup instructions, and a link to the live demo.
- [ ] **Add screenshots or a short GIF** of the dashboard and thesis detail flow.
- [ ] **Document the environment variables required** for each of the three services.
- [ ] **Pin the repo on your GitHub profile.**
- [ ] **Add the GitHub profile link to your resume header** — flagged across every resume review and still missing.

---

## 9. Deferred — Phase 2 (social layer)

Queued deliberately for after Phase 1 is polished. Not to be started before the above is complete.

- Public/private toggle on theses
- Convict Score — accuracy metric across a user's resolved thesis history
- User profiles with visible scores
- Follow / unfollow
- Feed of followed users' public theses
- Leaderboard
- Moderation considerations before anything is publicly visible

---

## 10. Deferred — Phase 3 (Thesis migration)

- Rebuild the existing Streamlit Thesis app in React
- Migrate from yFinance to Finnhub for consistency and rate-limit stability
- Consider unifying Thesis and Convict into a single product surface

---

## Suggested order of work

1. **§1 session bug** — correctness and trust issue, blocks everything else
2. **§7 deployment cleanup** — small, removes ongoing confusion
3. **§3 metric dropdown** — prevents silently broken data
4. **§2 split auth views** — directly related to the §1 fix, do while the code is fresh
5. **§4 edit/delete + empty states** — makes the app genuinely usable
6. **§8 README** — do before showing anyone
7. **§5 backend cleanup and error handling**
8. **Full visual redesign pass**
9. **Phase 2**

---

## Resume-facing note

Once §1, §3, §7, and §8 are complete, this is credibly describable as:

> Built and deployed a full-stack investment thesis tracking platform (React, Supabase/PostgreSQL, Python) with row-level security, automated daily evaluation of user-defined metric targets against live market data via a scheduled GitHub Actions pipeline.

Hold off on adding the live URL to anything public until the session bug in §1 is fixed and verified.