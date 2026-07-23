-- Self-service permanent account deletion.
--
-- Deploy: paste this whole file into the Supabase SQL editor and run it once.
-- (Run it as the default privileged editor role so the function owner can
-- delete from the auth schema — SECURITY DEFINER then runs with that authority.)
--
-- The client calls this with the *anon* key while authenticated:
--     await supabase.rpc('delete_user');
-- auth.uid() resolves to the caller's own id from their JWT, so a user can only
-- ever delete themselves — never another account.

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

  -- Remove the user's data first, in case the foreign keys don't cascade.
  delete from public.metrics
    where thesis_id in (select id from public.theses where user_id = uid);

  delete from public.theses
    where user_id = uid;

  -- Finally remove the auth account itself. Deleting the auth.users row
  -- cascades to the user's sessions / identities / refresh tokens.
  delete from auth.users
    where id = uid;
end;
$$;

-- Only signed-in users may call it; never anon or the public role.
revoke all on function public.delete_user() from public;
revoke all on function public.delete_user() from anon;
grant execute on function public.delete_user() to authenticated;
