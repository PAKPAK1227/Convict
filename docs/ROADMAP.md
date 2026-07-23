# Convict — Roadmap (Deferred Work)

These are the sections of `CONVICT_TODO.md` that were **intentionally not done**
in the §1–§6 pass — either because they're external/manual actions (Vercel,
GitHub, your resume) or deliberately queued for later phases. Captured here so
nothing gets lost.

> For the decisions and follow-ups from the work that **was** done, see
> [`DECISIONS.md`](./DECISIONS.md). For the future visual redesign, see
> [`DESIGN.md`](./DESIGN.md).

---

## §7 — Deployment cleanup  *(manual — Vercel dashboard)*

- [ ] **Delete the duplicate Vercel project.** Two projects point at the same
      repo; one is misconfigured (Root Directory `./`, Framework Preset "Other")
      and returns 404.
- [ ] **Confirm the surviving project's settings:** Root Directory `client`,
      Framework Preset "Create React App".
- [ ] **Verify `client/vercel.json` rewrite rule is in place** — ✅ it is
      (`/(.*) → /index.html`), so deep links won't 404 on refresh. Just confirm
      the *surviving* project picks it up.
- [ ] **Test deep links on the live URL** — refresh while on a `/thesis/:id`
      route and confirm it loads.
- [ ] **Consider a custom domain** once the app is presentable.

---

## §8 — Documentation  *(partly code, partly manual)*

- [ ] **Write a proper README.** Should include: what Convict does, screenshots,
      tech stack, architecture diagram, local setup for all three services, and
      a link to the live demo. (Current `README.md` is one line.)
- [ ] **Add screenshots or a short GIF** of the dashboard and thesis-detail flow.
- [ ] **Document the required environment variables** per service:
  - `client/.env`: `REACT_APP_SUPABASE_URL`, `REACT_APP_SUPABASE_ANON_KEY`
  - `data-service/.env`: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `FINNHUB_API_KEY`
  - GitHub Secrets (for the cron): `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `FINNHUB_API_KEY`
- [ ] **Pin the repo on your GitHub profile.**
- [ ] **Add the GitHub profile link to your resume header** — flagged across
      every resume review and still missing.

> When ready, I can draft the README + an architecture diagram (Mermaid) in one
> pass — just say the word.

---

## §9 — Phase 2: Social layer  *(deferred by design)*

Queued deliberately for after Phase 1 is polished. Not to be started before the
above is complete.

- [ ] Public/private toggle on theses
- [ ] **Convict Score** — accuracy metric across a user's resolved thesis history
      (this is what the deferred `status_history` table powers — see `DECISIONS.md`)
- [ ] User profiles with visible scores
- [ ] Follow / unfollow
- [ ] Feed of followed users' public theses
- [ ] Leaderboard
- [ ] Moderation considerations before anything is publicly visible

**Prerequisite for the Convict Score:** create and populate `status_history`
(SQL migration already written in `DECISIONS.md` §3).

---

## §10 — Phase 3: Thesis migration  *(deferred by design)*

- [ ] Rebuild the existing Streamlit "Thesis" app in React
- [ ] Migrate from yFinance to Finnhub for consistency and rate-limit stability
- [ ] Consider unifying "Thesis" and "Convict" into a single product surface

---

## Suggested order when you resume

1. **§7 Vercel cleanup** — small, removes ongoing confusion (5 min).
2. **§8 README + screenshots** — do before showing anyone.
3. **Visual redesign pass** — see [`DESIGN.md`](./DESIGN.md).
4. **§9 Phase 2** (social) — starting with `status_history` + Convict Score.
5. **§10 Phase 3** (Thesis migration).

## Resume-facing note (from the TODO)

Once §1, §3, §7, and §8 are complete, this is credibly describable as:

> Built and deployed a full-stack investment thesis tracking platform (React,
> Supabase/PostgreSQL, Python) with row-level security, automated daily
> evaluation of user-defined metric targets against live market data via a
> scheduled GitHub Actions pipeline.

§1 and §3 are now done. §7 and §8 remain before adding the live URL anywhere
public.
