-- Ticker snapshots: market context for the create form, without a live API.
--
-- Why: the create form should show a ticker's price and 52-week range, fill in
-- the company name, and reject symbols that don't exist. The Finnhub key must
-- never reach the browser, and every live lookup would spend the shared
-- 60-calls/minute free-tier budget. So the nightly refresh_snapshots.py job
-- (service key) writes everything here, and the browser only ever reads this
-- table through Supabase like any other.
--
--   * One row per US-listed symbol that fits the app's ticker rule, from
--     Finnhub's symbol list (one API call). A missing row = unknown ticker.
--   * price / week52_* / refreshed_at are filled only for the refreshed
--     universe: the S&P 500 plus every ticker with an open thesis.
--   * price is the last close ("as of" price_at), the same price grading uses.
--
-- Deploy: paste into the Supabase SQL editor and run once, AFTER
-- 20260927_target_baselines.sql.

create table if not exists public.ticker_snapshots (
  ticker        text primary key check (ticker ~ '^[A-Z]{1,5}$'),
  company_name  text,
  security_type text,
  price         numeric,
  price_at      timestamptz,
  week52_high   numeric,
  week52_low    numeric,
  listed_at     timestamptz not null default now(),  -- last seen in the symbol list
  refreshed_at  timestamptz                          -- last price refresh
);

-- Market data isn't user data: any signed-in user may read it. There are no
-- write policies, so only the service key (which bypasses RLS) can write.
alter table public.ticker_snapshots enable row level security;

drop policy if exists ticker_snapshots_read on public.ticker_snapshots;
create policy ticker_snapshots_read on public.ticker_snapshots
  for select to authenticated using (true);
