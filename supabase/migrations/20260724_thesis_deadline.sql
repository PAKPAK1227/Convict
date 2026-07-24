-- Resolution deadline for theses.
--
-- Why: a prediction with no deadline can never truly be proven right or wrong,
-- which is the whole point of "on the record" — and the (future) persisted
-- Convict Score needs a moment of resolution to lock a win/loss. `target_date`
-- is that moment.
--
-- Nullable so existing rows are unaffected (they simply have no deadline). New
-- theses created via the app always set one.
--
-- Deploy: paste into the Supabase SQL editor and run once.

alter table public.theses
  add column if not exists target_date date;
