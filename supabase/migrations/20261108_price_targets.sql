-- Price targets: "at least $X", "at most $X", or "within ±5% of $X" by the
-- deadline, graded on the official close.
--
-- Why: most real investment opinions are about price, and "at most $X" is the
-- first way to bet against a company. Fundamentals keep their fixed directions
-- for now (owner's decision, 2026-11-08), so `direction` exists only on price.
--
--   * metrics_name_valid gains 'price'. Minimum deadline stays 30 days (price
--     moves daily; min_deadline_days already returns 30 for it).
--   * metrics.direction — 'at_least' | 'at_most' | 'within'; required for
--     price, must be null for every other metric.
--   * Splits. A $ target is meaningless after a split (4-for-1: $400 -> $100),
--     so the snapshot job adjusts unresolved price targets by the split ratio
--     and records it: target_split_factor (cumulative price multiplier, 1 =
--     never adjusted) and split_adjusted_through (latest split applied, so a
--     split is applied once). Evaluator-only, like the baseline columns.
--   * Changing a target's direction during the 24-hour window clears its
--     baseline, like changing its value.
--
-- Deploy: paste into the Supabase SQL editor and run once, AFTER
-- 20261017_price_history.sql.

-- --------------------------------------------------------------------------- --
-- 1. Columns and constraints
-- --------------------------------------------------------------------------- --
alter table public.metrics drop constraint if exists metrics_name_valid;
alter table public.metrics
  add constraint metrics_name_valid
  check (metric_name is not null
         and metric_name in ('pe_ratio', 'revenue_growth', 'profit_margin', 'price'));

alter table public.metrics add column if not exists direction text;
alter table public.metrics drop constraint if exists metrics_direction_valid;
alter table public.metrics
  add constraint metrics_direction_valid
  check (
    -- `is not null` matters: `null in (...)` is unknown, and CHECK lets
    -- unknown through, so without it a price target with no direction passes.
    (metric_name = 'price' and direction is not null
       and direction in ('at_least', 'at_most', 'within'))
    or (metric_name <> 'price' and direction is null)
  );

-- A price target is a positive dollar amount.
alter table public.metrics drop constraint if exists metrics_price_positive;
alter table public.metrics
  add constraint metrics_price_positive
  check (metric_name <> 'price' or target_value > 0);

alter table public.metrics add column if not exists target_split_factor    numeric not null default 1;
alter table public.metrics add column if not exists split_adjusted_through date;

-- --------------------------------------------------------------------------- --
-- 2. metrics trigger: everything from 20260927_target_baselines.sql, plus the
--    direction resetting the baseline and evaluator-only split columns.
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
    new.current_value          := null;
    new.baseline_value         := null;
    new.baseline_at            := null;
    new.already_met            := null;
    new.target_split_factor    := 1;
    new.split_adjusted_through := null;
  else
    new.current_value          := old.current_value;
    new.target_split_factor    := old.target_split_factor;
    new.split_adjusted_through := old.split_adjusted_through;
    if new.target_value is distinct from old.target_value
       or new.metric_name is distinct from old.metric_name
       or new.direction is distinct from old.direction then
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
