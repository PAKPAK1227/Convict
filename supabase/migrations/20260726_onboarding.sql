-- Onboarding walkthrough: remember that an account has seen the intro so it
-- shows once per *user*, not once per browser.
--
-- Same pattern as the identity migration: no blanket UPDATE policy on profiles
-- (RLS is row-level, not column-level — one would expose convict_score to
-- tampering), so the client marks itself onboarded through a SECURITY DEFINER
-- function that writes exactly this one column.
--
-- Deploy: paste into the Supabase SQL editor and run once. Run AFTER
-- 20260724_profiles_identity.sql.
--
-- The client degrades gracefully if this is never deployed — it falls back to
-- localStorage (see client/src/lib/onboarding.js), so the tour still shows once
-- per device rather than breaking.

-- --------------------------------------------------------------------------- --
-- 1. Column — null means "hasn't finished the walkthrough yet".
-- --------------------------------------------------------------------------- --
alter table public.profiles add column if not exists onboarded_at timestamptz;

-- Existing accounts are treated as new here on purpose: they signed up before
-- the walkthrough existed and have never been shown it. To suppress it for
-- everyone who already has theses, run this instead:
--
--   update public.profiles p set onboarded_at = now()
--   where onboarded_at is null
--     and exists (select 1 from public.theses t where t.user_id = p.id);

-- --------------------------------------------------------------------------- --
-- 2. complete_onboarding() — stamps the caller's own row. Idempotent: replaying
--    the tour from the profile page and finishing it again is harmless.
-- --------------------------------------------------------------------------- --
create or replace function public.complete_onboarding()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  stamped timestamptz := now();
begin
  update public.profiles
    set onboarded_at = stamped, updated_at = now()
  where id = auth.uid();
  return stamped;
end;
$$;

grant execute on function public.complete_onboarding() to authenticated;
