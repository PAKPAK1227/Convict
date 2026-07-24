-- Persisted Convict Score + thesis resolution.
--
-- The Convict Score is the app's trademark metric: a long-term, credit-score-style
-- number (0–100, starts at 50) that only moves when a prediction *resolves* at its
-- deadline. It's written exclusively by the nightly evaluator (service key) — users
-- can never edit their own score.
--
-- Deploy: paste into the Supabase SQL editor and run once. Run AFTER
-- 20260724_thesis_deadline.sql.

-- --------------------------------------------------------------------------- --
-- 1. profiles — one row per user, holds the Convict Score.
-- --------------------------------------------------------------------------- --
create table if not exists public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  convict_score  numeric  not null default 50 check (convict_score >= 0 and convict_score <= 100),
  resolved_count integer  not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Owner can read their own profile. Public read (for the future leaderboard) is
-- deliberately NOT enabled yet. No INSERT/UPDATE policy exists, so clients cannot
-- write the score — only the evaluator (service key, bypasses RLS) can.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (auth.uid() = id);

-- --------------------------------------------------------------------------- --
-- 2. Auto-create a profile on signup, and backfill existing users.
-- --------------------------------------------------------------------------- --
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;

-- --------------------------------------------------------------------------- --
-- 3. theses.resolved — set true once a thesis has passed its deadline and had
--    its verdict locked + scored. Idempotency guard so it scores exactly once.
-- --------------------------------------------------------------------------- --
alter table public.theses
  add column if not exists resolved boolean not null default false;
