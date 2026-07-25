# Convict

**Put your investment convictions on the record.** Convict turns investment
theses into measurable, time-bound predictions, then grades them against live
market data — so you learn whether you were *right*, not just whether you *felt*
right. Your accuracy over time rolls up into a single trademark number: the
**Convict Score**.

---

## What it does

1. **Write a thesis** on a stock — a claim, a **conviction level** (High / Medium
   / Low), and a **resolution deadline** (the date it's judged by).
2. **Set metric targets** that would prove it — P/E ratio, revenue growth, or
   profit margin, each with a target value.
3. **Convict evaluates it daily** against live market data (Finnhub) and grades
   each metric, rolling them into a per-thesis verdict.
4. **At the deadline the verdict locks** and moves your **Convict Score**.

### The status system

Every thesis resolves to one of three states (color is used *only* here):

| Status       | Meaning                                              |
|--------------|------------------------------------------------------|
| **On Track** | Meets its target (`≥` target, or `≤` for P/E)        |
| **Watch**    | Misses the target by **≤ 25%** of the target value   |
| **Broken**   | Misses by **> 25%**                                  |

A thesis takes the **worst grade** across its metrics (any Broken → Broken).
Targets show a `≥` / `≤` so the direction is unambiguous (P/E is lower-is-better).

### The Convict Score (the trademark metric)

A long-term, credit-score-style rating in **0–100, starting at 50**. It changes
**only when a thesis resolves at its deadline** — one scoring event per thesis,
applied once. Each event:

```
delta = 8 × conviction_weight × (outcome − 0.5)
outcome:           On Track = 1.0 · Watch = 0.5 · Broken = 0.0
conviction_weight: High = 1.25 · Medium = 1.0 · Low = 0.75
```

…then **damped toward 0 near the bounds**, so 0 and 100 are asymptotic and
require *sustained* accuracy. One correct Medium call is only +4 (50 → 54). A
high score genuinely means someone predicts the market well. Deleting a thesis
**never** changes the score (anti-gaming). It's written **only** by the nightly
evaluator (service key) — clients can never edit it.

---

## Tech stack

- **client/** — React 19 (Create React App), React Router 7, Tailwind CSS 3,
  Supabase JS. Token-based light/dark theming (deep-emerald brand on a monochrome
  ink base, Fraunces serif + JetBrains Mono).
- **data-service/** — Python nightly evaluator (Finnhub + Supabase), run on a
  GitHub Actions cron. Pure decision logic is separated and unit-tested.
- **supabase/** — Postgres schema, Row-Level Security policies, and
  `SECURITY DEFINER` RPCs (SQL migrations).

## Architecture

```
 React client ──(anon key, RLS)──► Supabase Postgres ◄──(service key)── Python evaluator
   auth / theses / metrics /            theses · metrics · profiles         (GitHub Actions cron)
   profile · convict score               (RLS: owner-scoped)                Finnhub market data
```

- The Finnhub key **never ships to the browser** — all market-data fetching is
  server-side in the evaluator.
- All user data is **owner-scoped by RLS**. Profiles are private (no leaderboard
  yet). The Convict Score is written only by the evaluator.

## Repository layout

```
client/               React app
  src/pages/           Landing, Login, Dashboard, CreateThesis, ThesisDetail,
                       Profile, ForgotPassword, ResetPassword
  src/components/       Brand, StatusBadge, MetricBar, Progress, ConvictScore,
                       Select, HeroDemo, Ticker, ThemeToggle, ...
  src/lib/             validation, metrics, format, deadline, score (pure, tested)
data-service/         evaluate_theses.py (grading + scoring), main.py (Finnhub)
supabase/migrations/  SQL — run these in the Supabase SQL editor (see Setup)
docs/                 DECISIONS, DESIGN, ROADMAP, SECURITY
```

---

## Setup & deployment

### 1. Database — run the migrations (Supabase SQL editor, in order)

Paste each file and run once, **in this order**:

1. `supabase/migrations/20260723_rls_policies.sql`
2. `supabase/migrations/20260723_data_constraints.sql`
3. `supabase/migrations/20260723_delete_user.sql`
4. `supabase/migrations/20260724_thesis_deadline.sql`
5. `supabase/migrations/20260724_convict_score.sql`
6. `supabase/migrations/20260724_profiles_identity.sql`

(If a table already has rows that violate a new CHECK, either clean them first or
append `NOT VALID` to that constraint — see the notes inside each file.)

### 2. Supabase Auth configuration

In **Authentication → URL Configuration**, add your app URLs to **Site URL** and
the **Redirect allow-list** — both local and production, e.g.:

```
http://localhost:3000
http://localhost:3000/reset-password
http://localhost:3000/login
https://<your-domain>            (and /reset-password, /login)
```

Without these, the password-reset and email-confirmation links won't redirect
back into the app. Email confirmation can be on or off — the app handles both.

### 3. Environment variables

**client/.env**
```
REACT_APP_SUPABASE_URL=...
REACT_APP_SUPABASE_ANON_KEY=...
```

**data-service/.env** (only needed to run the evaluator locally)
```
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...      # service role key — server-side only, never in the client
FINNHUB_API_KEY=...
```

**GitHub Actions secrets** (for the scheduled evaluator)
```
SUPABASE_URL, SUPABASE_SERVICE_KEY, FINNHUB_API_KEY
```

### 4. Run locally

```bash
# client
cd client && npm install && npm start      # http://localhost:3000

# evaluator (one-off run)
cd data-service && pip install -r requirements.txt && python evaluate_theses.py

# tests
cd client && CI=true npx react-scripts test --watchAll=false
cd data-service && python -m pytest
```

### 5. Deploy

- **Client → Vercel:** Root Directory `client`, Framework Preset *Create React
  App*. `client/vercel.json` rewrites all routes to `index.html` so deep links
  don't 404. Add the production URL to the Supabase redirect allow-list (step 2).
- **Evaluator → GitHub Actions:** a scheduled workflow runs
  `data-service/evaluate_theses.py` daily with the secrets from step 3.

---

## Documentation

- **[docs/DESIGN.md](docs/DESIGN.md)** — design system, palettes, typography.
- **[docs/DECISIONS.md](docs/DECISIONS.md)** — engineering decisions & follow-ups.
- **[docs/ROADMAP.md](docs/ROADMAP.md)** — deferred work, the score formula, and
  the Phase 2 social layer (profiles/following/leaderboard).
- **[docs/SECURITY.md](docs/SECURITY.md)** — security posture.

## Roadmap (high level)

- **Now:** thesis tracking, daily evaluation, deadlines + verdict-locking,
  persisted Convict Score, profiles with usernames & track record.
- **Next (Phase 2 — social):** public profiles, following, a feed, and a
  Convict Score **leaderboard**. Deliberately deferred; requires careful RLS.
