-- Daily price history + volatility, from Massive (formerly Polygon.io).
--
-- Why: the ticker panel shows a volatility profile (MAV, M, Θ — see
-- data-service/volatility.py) that needs a year of daily closes, and Finnhub's
-- free plan doesn't serve history (403). Massive's free plan returns every US
-- stock's daily bar for a date in ONE call, so the nightly refresh costs one
-- call however many tickers or users there are. Prices and 52-week ranges now
-- come from this history too, which drops ~1,000 Finnhub calls a night.
--
--   * price_history       — one row per (ticker, trading day) for the S&P 500
--                           plus tracked tickers. ~126k rows/year (~15 MB).
--                           Server-only: the browser reads the derived numbers
--                           in ticker_snapshots, never the raw history.
--   * price_history_days  — which dates have been ingested (including holidays
--                           that returned nothing), so a date is fetched once.
--   * ticker_snapshots    — gains the volatility columns.
--   * evaluator_runs      — gains tickers_deferred: tickers the grader skipped
--                           because its per-run Finnhub budget ran out.
--
-- Deploy: paste into the Supabase SQL editor and run once, AFTER
-- 20260928_ticker_snapshots.sql.

-- --------------------------------------------------------------------------- --
-- 1. History
-- --------------------------------------------------------------------------- --
create table if not exists public.price_history (
  ticker text    not null check (ticker ~ '^[A-Z]{1,5}$'),
  day    date    not null,
  close  numeric not null check (close > 0),
  high   numeric,
  low    numeric,
  primary key (ticker, day)
);

create index if not exists price_history_day_idx on public.price_history (day);

create table if not exists public.price_history_days (
  day        date primary key,
  bars       integer     not null default 0,  -- bars returned (0 = market closed)
  fetched_at timestamptz not null default now()
);

-- RLS on with no policies: only the service key (which bypasses RLS) can read
-- or write. Same pattern as evaluator_runs.
alter table public.price_history      enable row level security;
alter table public.price_history_days enable row level security;

-- --------------------------------------------------------------------------- --
-- 2. Volatility on the snapshot (read by the create form)
-- --------------------------------------------------------------------------- --
alter table public.ticker_snapshots add column if not exists vol_mav         numeric;  -- annualised
alter table public.ticker_snapshots add column if not exists vol_m           numeric;  -- dimensionless
alter table public.ticker_snapshots add column if not exists vol_theta       numeric;
alter table public.ticker_snapshots add column if not exists vol_window_days integer;  -- closes used
alter table public.ticker_snapshots add column if not exists vol_as_of       date;

-- --------------------------------------------------------------------------- --
-- 3. Grader budget visibility
-- --------------------------------------------------------------------------- --
alter table public.evaluator_runs add column if not exists tickers_deferred integer not null default 0;
