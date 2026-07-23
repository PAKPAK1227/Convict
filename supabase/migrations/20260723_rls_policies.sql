-- Row-Level Security policies — canonical, version-controlled definitions.
--
-- IMPORTANT: this file declares the *intended* policy set so it lives in git and
-- is reviewable. It is NOT an export of whatever is currently live in your
-- Supabase project. Before running it, open Authentication → Policies and
-- compare — remove any old/duplicate policies whose names differ from these,
-- otherwise Postgres will OR them together (multiple permissive policies widen
-- access, they never narrow it).
--
-- Model:
--   * theses  — a user may act only on rows where user_id = auth.uid().
--   * metrics — has no user_id; ownership is inherited from the parent thesis.
--
-- Deploy: review, then paste into the Supabase SQL editor and run once.

-- ---------------------------------------------------------------------------
-- theses
-- ---------------------------------------------------------------------------
alter table public.theses enable row level security;

drop policy if exists theses_select_own on public.theses;
create policy theses_select_own on public.theses
  for select using (user_id = auth.uid());

drop policy if exists theses_insert_own on public.theses;
create policy theses_insert_own on public.theses
  for insert with check (user_id = auth.uid());

drop policy if exists theses_update_own on public.theses;
create policy theses_update_own on public.theses
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists theses_delete_own on public.theses;
create policy theses_delete_own on public.theses
  for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- metrics  (owned via the parent thesis)
-- ---------------------------------------------------------------------------
alter table public.metrics enable row level security;

drop policy if exists metrics_select_own on public.metrics;
create policy metrics_select_own on public.metrics
  for select using (
    thesis_id in (select id from public.theses where user_id = auth.uid())
  );

drop policy if exists metrics_insert_own on public.metrics;
create policy metrics_insert_own on public.metrics
  for insert with check (
    thesis_id in (select id from public.theses where user_id = auth.uid())
  );

drop policy if exists metrics_update_own on public.metrics;
create policy metrics_update_own on public.metrics
  for update using (
    thesis_id in (select id from public.theses where user_id = auth.uid())
  ) with check (
    thesis_id in (select id from public.theses where user_id = auth.uid())
  );

drop policy if exists metrics_delete_own on public.metrics;
create policy metrics_delete_own on public.metrics
  for delete using (
    thesis_id in (select id from public.theses where user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Verify (run as two different users, or check with a known other-user id):
--   select * from public.theses where id = '<another user''s thesis id>';
--   -- expected: 0 rows
-- ---------------------------------------------------------------------------
