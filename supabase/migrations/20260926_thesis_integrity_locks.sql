-- Thesis integrity locks: a 24-hour edit window and minimum deadlines.
--
-- Why: the Convict Score is only meaningful if a call can't be reshaped after
-- the fact. Before this migration a user could, at any time before resolution:
--   * delete a thesis that was going badly            -> dodge the loss
--   * delete its targets                              -> it never resolves at all
--   * switch conviction to High on a winner / Low on a loser
--   * lower a target, or move the deadline
--   * set a deadline of tomorrow on a target that's already met -> farm wins
--
-- Rules enforced here (the evaluator, service_role, is exempt from all of them):
--   1. A thesis and its targets can be edited or deleted only within 24 hours
--      of creation. After that the whole call is frozen.
--   2. created_at is set by the database, never by the client — otherwise a
--      forged future timestamp would keep the edit window open forever.
--   3. The deadline must be at least 30 days after creation, or 90 days if the
--      thesis has a revenue-growth or profit-margin target. Those are
--      trailing-twelve-month figures that only change when the company reports
--      earnings (~every 91 days); a shorter window usually contains no report,
--      so the outcome would be decided the moment it was set.
--   4. metrics.current_value is written only by the evaluator.
--   5. New status 'Void': a thesis that reaches its deadline with no usable
--      market data (or no targets) resolves as Void and is not scored.
--
-- RLS is row-level, not column-level, so like theses_protect_verdict these
-- rules are triggers. They raise (rather than silently ignoring the change) so
-- the client can show the user why.
--
-- Self-service account deletion still works: delete_user() is redefined below
-- to flag its own transaction, which the triggers honour.
--
-- Deploy: paste into the Supabase SQL editor and run once, AFTER
-- 20260726_onboarding.sql.

-- --------------------------------------------------------------------------- --
-- 1. Allow the 'Void' status.
-- --------------------------------------------------------------------------- --
alter table public.theses drop constraint if exists theses_status_valid;
alter table public.theses
  add constraint theses_status_valid
  check (status is null or status in ('On Track', 'Watch', 'Broken', 'Pending', 'Void'));

-- --------------------------------------------------------------------------- --
-- 2. The rule constants, in one place. Mirrored in client/src/lib/metrics.js
--    (minDeadlineDays) and client/src/lib/lock.js (EDIT_WINDOW_HOURS).
-- --------------------------------------------------------------------------- --
create or replace function public.thesis_edit_window()
returns interval
language sql
immutable
as $$ select interval '24 hours' $$;

create or replace function public.min_deadline_days(p_metric_name text)
returns integer
language sql
immutable
as $$
  select case
    when p_metric_name in ('revenue_growth', 'profit_margin') then 90
    else 30
  end
$$;

-- True for callers the locks don't apply to: the evaluator, and delete_user()
-- tearing down an account. The flag is a transaction-local setting that only
-- delete_user() sets; clients have no way to set arbitrary settings through
-- the API.
create or replace function public.integrity_exempt()
returns boolean
language sql
stable
as $$
  select coalesce(auth.role(), '') = 'service_role'
      or coalesce(current_setting('convict.account_deletion', true), '') = 'on'
$$;

-- --------------------------------------------------------------------------- --
-- 3. theses: edit window, server-set created_at, minimum deadline.
-- --------------------------------------------------------------------------- --
create or replace function public.theses_integrity_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  min_days integer;
begin
  if public.integrity_exempt() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'INSERT' then
    new.created_at := now();
  else
    if old.created_at < now() - public.thesis_edit_window() then
      raise exception 'This thesis is locked. A thesis can only be edited or deleted within 24 hours of creating it.';
    end if;
    if tg_op = 'DELETE' then
      return old;
    end if;
    new.created_at := old.created_at;
  end if;

  if new.target_date is null then
    raise exception 'A thesis needs a resolution deadline.';
  end if;

  -- On INSERT there are no targets yet, so this is the 30-day floor; the
  -- metrics trigger applies the 90-day floor as earnings targets are added.
  select coalesce(max(public.min_deadline_days(m.metric_name)), 30)
    into min_days
    from public.metrics m
   where m.thesis_id = new.id;

  if new.target_date < (new.created_at at time zone 'UTC')::date + min_days then
    raise exception 'The deadline must be at least % days after the thesis is created.', min_days;
  end if;

  return new;
end;
$$;

drop trigger if exists theses_integrity_lock_trg on public.theses;
create trigger theses_integrity_lock_trg
  before insert or update or delete on public.theses
  for each row execute function public.theses_integrity_lock();

-- --------------------------------------------------------------------------- --
-- 4. metrics: same edit window (measured from the parent thesis), earnings
--    deadline floor, evaluator-only current_value.
-- --------------------------------------------------------------------------- --
create or replace function public.metrics_integrity_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent public.theses%rowtype;
  min_days integer;
begin
  if public.integrity_exempt() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'UPDATE' and new.thesis_id is distinct from old.thesis_id then
    raise exception 'A target cannot be moved to a different thesis.';
  end if;

  select * into parent
    from public.theses
   where id = case when tg_op = 'DELETE' then old.thesis_id else new.thesis_id end;

  if not found then
    -- The parent is already gone: this is a cascade from deleting the thesis,
    -- which the theses trigger has already allowed. (On INSERT the foreign key
    -- rejects the row anyway.)
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if parent.created_at < now() - public.thesis_edit_window() then
    raise exception 'This thesis is locked. Its targets can only be changed within 24 hours of creating it.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  min_days := public.min_deadline_days(new.metric_name);
  if parent.target_date < (parent.created_at at time zone 'UTC')::date + min_days then
    raise exception 'Revenue growth and profit margin only change when the company reports earnings, so their deadline must be at least % days after the thesis is created.', min_days;
  end if;

  if tg_op = 'INSERT' then
    new.current_value := null;
  else
    new.current_value := old.current_value;
  end if;

  return new;
end;
$$;

drop trigger if exists metrics_integrity_lock_trg on public.metrics;
create trigger metrics_integrity_lock_trg
  before insert or update or delete on public.metrics
  for each row execute function public.metrics_integrity_lock();

-- --------------------------------------------------------------------------- --
-- 5. delete_user(): unchanged behaviour, but flags its transaction so the locks
--    above don't block a user from deleting their own (old, locked) theses.
-- --------------------------------------------------------------------------- --
create or replace function public.delete_user()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Transaction-local: cleared automatically when this call's transaction ends.
  perform set_config('convict.account_deletion', 'on', true);

  delete from public.metrics
    where thesis_id in (select id from public.theses where user_id = uid);

  delete from public.theses
    where user_id = uid;

  delete from auth.users
    where id = uid;
end;
$$;

revoke all on function public.delete_user() from public;
revoke all on function public.delete_user() from anon;
grant execute on function public.delete_user() to authenticated;
