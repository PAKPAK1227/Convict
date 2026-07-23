# Convict — Security & Ship-Readiness

Convict has **no custom API layer**: the React client talks directly to
Supabase's PostgREST API with the anon key, protected by RLS, plus a nightly
GitHub Actions cron. So security rests on **Supabase configuration + RLS + the
constraints in this repo**, not on a backend you control. This file tracks what
is enforced in code vs. what only you can do in the Supabase/Vercel dashboards.

---

## ✅ Now enforced in code (deploy the migrations to activate)

| Area | What | Where |
|------|------|-------|
| Server-side validation | `CHECK` constraints on ticker format, metric allow-list, conviction enum, status enum, length limits, non-null target, unique metric-per-thesis | `supabase/migrations/20260723_data_constraints.sql` |
| Authorization | Canonical RLS policies (select/insert/update/delete scoped to `auth.uid()`; metrics owned via parent thesis) | `supabase/migrations/20260723_rls_policies.sql` |
| Account deletion | `SECURITY DEFINER delete_user()`, `authenticated`-only, self-scoped | `supabase/migrations/20260723_delete_user.sql` |
| Security headers | `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, HSTS, `Permissions-Policy` | `client/vercel.json` |
| CSP (report-only) | Content-Security-Policy-Report-Only — logs violations without blocking | `client/vercel.json` |
| Client resilience | Top-level `ErrorBoundary` (hook point for Sentry) | `client/src/components/ErrorBoundary.jsx` |
| Secrets | Service key server-side only; no `.env` in git history; anon key safe by design | verified |

### ⚠️ Deploy steps required (paste each into the Supabase SQL editor, once)
1. `20260723_rls_policies.sql` — **review against your live policies first** (see the
   file header; duplicate permissive policies widen access).
2. `20260723_data_constraints.sql` — if existing rows violate a rule, clean them
   or use the `NOT VALID` fallback noted in the file.
3. `20260723_delete_user.sql` — required for the Account → Delete flow.

### Flipping the CSP from report-only to enforcing
1. Deploy as-is; open the site; watch the browser console for CSP violation
   reports. Common expected sources: your Supabase URL (already allowed via
   `*.supabase.co` — if you use a **custom** Supabase domain, add it to
   `connect-src`).
2. The build already sets `INLINE_RUNTIME_CHUNK=false` so `script-src 'self'`
   works (no inline runtime script to block).
3. When the console is clean, rename the header key in `client/vercel.json` from
   `Content-Security-Policy-Report-Only` to `Content-Security-Policy` and redeploy.

---

## ⚠️ Dashboard-only — you must configure these (cannot be done from code)

- [ ] **Verify RLS independently.** Log in as User A, try to read User B's thesis
      id (see `rls_policies.sql` footer). Expected: 0 rows. **Do this before any
      public launch** — authorization is currently assumed, not proven.
- [ ] **Auth rate limits.** Supabase → Authentication → Rate Limits. Review the
      sign-in / sign-up / email limits; the defaults are generous.
- [ ] **Bot protection (CAPTCHA).** Supabase → Authentication → enable
      hCaptcha/Turnstile on signup. Currently off → signup is open to automation.
- [ ] **Email confirmation.** Confirm it's **on** for production (the UI already
      handles the "check your email" state).
- [ ] **Database backups / PITR.** Confirm your Supabase plan's backup policy.
- [ ] **GitHub 2FA** (required by Aug 22, 2026) and **key rotation** if there's
      any doubt about prior exposure.

---

## ❌ Known gaps that need architecture decisions (not quick fixes)

- **Data-API rate limiting.** There is no application-level throttling on
  `insert`/`update`/`select`. RLS stops a user touching *others'* data, but not
  from spamming their *own* writes. True per-user throttling would require a
  serverless function / API gateway in front of Supabase (there is currently no
  backend to host it). Supabase's platform limits are the only backstop today.
- **Client error tracking.** The `ErrorBoundary` is in place, but no service is
  wired. Add Sentry (needs a DSN) in `ErrorBoundary.componentDidCatch` and
  `index.js` when ready.
- **No automated dependency / secret scanning.** Consider enabling GitHub
  Dependabot + secret scanning on the repo.

---

## Summary: is it shippable?

For a **private / small-audience** launch: yes, once the three migrations are
deployed and RLS is verified. For a **public** launch, also close the dashboard
items above (especially RLS verification and CAPTCHA) and flip the CSP to
enforcing. The data-API rate-limiting gap is acceptable at low volume but should
be revisited before real scale.
