-- Target baselines: record where each metric stood when its target was set,
-- and don't score calls whose every target was already met.
--
-- Why: the 30-day minimum deadline stops next-day farming, but a user can still
-- look up a company's P/E, set "P/E <= 40" when it's 25, and bank a win a month
-- later. That's not a prediction. To tell, we need to know where the metric was
-- when the target was set — which the schema never recorded.
--
--   * metrics.baseline_value / baseline_at — stamped by the evaluator on the
--     metric's first successful evaluation (the browser can't fetch market
--     data; the Finnhub key is server-side only). Never changes after that.
--     This is also the reference point the score-v2 boldness weighting needs.
--   * metrics.already_met — whether the target was already satisfied at the
--     baseline. Null until baselined.
--   * theses.unscored — set by the evaluator at resolution when every target
--     graded at the deadline was already met at its baseline. The thesis still
--     locks with its normal verdict; it just emits no scoring event.
--
-- All four are evaluator-only. If a user edits a target during the 24-hour
-- window, its baseline is cleared so the next run re-stamps it against the new
-- target (otherwise already_met would describe a target that no longer exists).
--
-- Deploy: paste into the Supabase SQL editor and run once, AFTER
-- 20260926_thesis_integrity_locks.sql.

-- --------------------------------------------------------------------------- --
-- 1. Columns
-- --------------------------------------------------------------------------- --
alter table public.metrics add column if not exists baseline_value numeric;
alter table public.metrics add column if not exists baseline_at    timestamptz;
alter table public.metrics add column if not exists already_met    boolean;

alter table public.theses add column if not exists unscored boolean not null default false;

-- --------------------------------------------------------------------------- --
-- 2. metrics trigger: everything from 20260926_thesis_integrity_locks.sql, plus
--    evaluator-only baseline columns.
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
    -- Cascade from deleting the thesis, which its own trigger already allowed.
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
    new.current_value  := null;
    new.baseline_value := null;
    new.baseline_at    := null;
    new.already_met    := null;
  else
    new.current_value := old.current_value;
    if new.target_value is distinct from old.target_value
       or new.metric_name is distinct from old.metric_name then
      -- A different target: re-baseline it on the next evaluator run.
      new.baseline_value := null;
      new.baseline_at    := null;
      new.already_met    := null;
    else
      new.baseline_value := old.baseline_value;
      new.baseline_at    := old.baseline_at;
      new.already_met    := old.already_met;
    end if;
  end if;

  return new;
end;
$$;

-- --------------------------------------------------------------------------- --
-- 3. theses verdict trigger: also freeze `unscored` for everyone but the
--    evaluator (same shape as 20260725_protect_verdict.sql).
-- --------------------------------------------------------------------------- --
create or replace function public.theses_protect_verdict()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    if tg_op = 'INSERT' then
      new.resolved := false;
      new.status := 'Pending';
      new.unscored := false;
    elsif tg_op = 'UPDATE' then
      new.status := old.status;
      new.resolved := old.resolved;
      new.unscored := old.unscored;
    end if;
  end if;
  return new;
end;
$$;
