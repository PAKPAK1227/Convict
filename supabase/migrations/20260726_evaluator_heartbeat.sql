-- Evaluator heartbeat: a durable record that the nightly cron actually ran.
--
-- Why this exists: a failing run turns the GitHub Actions job red and emails
-- you. A run that never *starts* does neither — and that's the more likely
-- outcome, because GitHub auto-disables scheduled workflows after 60 days of
-- repository inactivity and a paused free-tier Supabase project stops the job
-- dead too. Without this table there is nothing to notice the absence.
--
-- Every run inserts one row; .github/workflows/evaluator-heartbeat.yml reads
-- the newest one on its own schedule and fails (emailing you) if it's stale.
--
-- Deploy: paste into the Supabase SQL editor and run once.

create table if not exists public.evaluator_runs (
  id              bigserial primary key,
  ran_at          timestamptz not null default now(),
  ok              boolean     not null,
  metrics_seen    integer     not null default 0,
  metrics_updated integer     not null default 0,
  theses_updated  integer     not null default 0,
  theses_resolved integer     not null default 0,
  scores_updated  integer     not null default 0,
  write_failures  integer     not null default 0,
  failed_tickers  text[]      not null default '{}'
);

create index if not exists evaluator_runs_ran_at_idx
  on public.evaluator_runs (ran_at desc);

-- --------------------------------------------------------------------------- --
-- RLS: on, with NO policies.
--
-- That is deliberate and it is not a bug. The evaluator writes with the service
-- key, which bypasses RLS entirely; no policy means no client can read or write
-- this table at all. Operational data about your infrastructure isn't something
-- end users need, and the row counts would leak how many users you have.
--
-- If you later want to show "data last refreshed X ago" in the app, add a
-- read-only policy for authenticated users exposing ran_at only (via a view),
-- rather than opening the whole table.
-- --------------------------------------------------------------------------- --
alter table public.evaluator_runs enable row level security;

-- --------------------------------------------------------------------------- --
-- Retention: keep the log from growing forever. One row a day is tiny, but
-- there's no reason to hold years of it — 90 days is plenty to spot a pattern.
-- Called opportunistically by the heartbeat workflow.
-- --------------------------------------------------------------------------- --
create or replace function public.prune_evaluator_runs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  delete from public.evaluator_runs where ran_at < now() - interval '90 days';
  get diagnostics removed = row_count;
  return removed;
end;
$$;
