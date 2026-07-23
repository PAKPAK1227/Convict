-- Server-side data integrity constraints.
--
-- Why: all client-side validation (ticker format, metric dropdown, numeric
-- targets, lengths) is UX only — a user can bypass the UI and POST directly to
-- the PostgREST API. These CHECK constraints enforce the same rules at the
-- database, which is the only place enforcement actually holds.
--
-- Deploy: paste into the Supabase SQL editor and run once.
--
-- NOTE: if you already have rows that violate a rule, the matching ALTER will
-- fail. Either clean those rows first, or append `NOT VALID` to that constraint
-- (new rows are still enforced; existing rows are grandfathered) and validate
-- later with `ALTER TABLE ... VALIDATE CONSTRAINT ...`.

-- ---------------------------------------------------------------------------
-- theses
-- ---------------------------------------------------------------------------

alter table public.theses
  add constraint theses_ticker_format
  check (ticker ~ '^[A-Z]{1,5}$');

alter table public.theses
  add constraint theses_conviction_level_valid
  check (conviction_level in ('High', 'Medium', 'Low'));

alter table public.theses
  add constraint theses_company_name_len
  check (company_name is null or char_length(company_name) <= 200);

alter table public.theses
  add constraint theses_thesis_text_len
  check (thesis_text is null or char_length(thesis_text) <= 5000);

-- status is written by the evaluator; keep it within the known set.
alter table public.theses
  add constraint theses_status_valid
  check (status is null or status in ('On Track', 'Watch', 'Broken', 'Pending'));

-- ---------------------------------------------------------------------------
-- metrics
-- ---------------------------------------------------------------------------

-- The evaluator only understands these canonical names; anything else was
-- silently skipped. Enforce the allow-list at the DB.
alter table public.metrics
  add constraint metrics_name_valid
  check (metric_name in ('pe_ratio', 'revenue_growth', 'profit_margin'));

-- A target must be present and finite for a metric to be evaluable.
alter table public.metrics
  add constraint metrics_target_not_null
  check (target_value is not null);

-- Prevent duplicate metrics of the same type on one thesis (matches the UI's
-- "already tracked" guard). Comment out if you intentionally allow duplicates.
alter table public.metrics
  add constraint metrics_unique_per_thesis
  unique (thesis_id, metric_name);
