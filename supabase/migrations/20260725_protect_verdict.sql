-- Protect the Convict Score's integrity.
--
-- The `theses_update_own` RLS policy lets a user UPDATE their own thesis rows,
-- and RLS is row-level (not column-level), so it cannot stop them writing the
-- `status` / `resolved` columns specifically. Because the nightly evaluator keys
-- on `resolved` (it skips already-resolved theses and scores on the transition
-- to resolved), a user could otherwise:
--   * set resolved=true on a losing thesis before its deadline  -> dodge the loss
--   * set resolved=false on a won, scored thesis                -> farm points
--
-- This trigger makes `status` and `resolved` writable ONLY by the evaluator
-- (service_role). Normal users' other edits (thesis_text, company_name,
-- conviction_level, target_date) are unaffected. New theses are forced to start
-- Pending + unresolved regardless of what the client sends.
--
-- Deploy: paste into the Supabase SQL editor and run once (after the other
-- 20260724 migrations).

create or replace function public.theses_protect_verdict()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The evaluator (service_role) is exempt; it's the only writer of the verdict.
  if coalesce(auth.role(), '') <> 'service_role' then
    if tg_op = 'INSERT' then
      new.resolved := false;         -- can't self-declare a resolved thesis
      new.status := 'Pending';       -- can't self-declare a verdict at creation
    elsif tg_op = 'UPDATE' then
      new.status := old.status;      -- freeze the verdict columns
      new.resolved := old.resolved;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists theses_protect_verdict_trg on public.theses;
create trigger theses_protect_verdict_trg
  before insert or update on public.theses
  for each row execute function public.theses_protect_verdict();
