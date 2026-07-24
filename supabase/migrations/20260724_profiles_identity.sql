-- Profile identity: username, display name, bio — plus SECURITY DEFINER RPCs so
-- the client can edit those fields WITHOUT ever being able to write convict_score
-- (a blanket UPDATE policy would expose the score to tampering — RLS is
-- row-level, not column-level, so we go through functions instead).
--
-- Deploy: paste into the Supabase SQL editor and run once. Run AFTER
-- 20260724_convict_score.sql.

-- --------------------------------------------------------------------------- --
-- 1. Columns
-- --------------------------------------------------------------------------- --
alter table public.profiles add column if not exists username     text;
alter table public.profiles add column if not exists display_name text
  check (display_name is null or char_length(display_name) <= 50);
alter table public.profiles add column if not exists bio          text
  check (bio is null or char_length(bio) <= 280);

-- Case-insensitive unique usernames (multiple NULLs allowed while unset).
create unique index if not exists profiles_username_lower_idx
  on public.profiles (lower(username));

-- --------------------------------------------------------------------------- --
-- 2. username_available(name) — validates format + checks it's unused.
--    Callable pre-signup (anon), so it must bypass RLS -> SECURITY DEFINER.
-- --------------------------------------------------------------------------- --
create or replace function public.username_available(name text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select name ~ '^[a-zA-Z0-9_]{3,20}$'
     and not exists (
       select 1 from public.profiles where lower(username) = lower(name)
     );
$$;

grant execute on function public.username_available(text) to anon, authenticated;

-- --------------------------------------------------------------------------- --
-- 3. set_username(name) — sets the caller's own username (validated + unique).
-- --------------------------------------------------------------------------- --
create or replace function public.set_username(name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if name !~ '^[a-zA-Z0-9_]{3,20}$' then
    raise exception 'Username must be 3-20 letters, numbers, or underscores.';
  end if;
  if exists (
    select 1 from public.profiles
    where lower(username) = lower(name) and id <> auth.uid()
  ) then
    raise exception 'That username is taken.';
  end if;
  update public.profiles
    set username = name, updated_at = now()
  where id = auth.uid();
  return name;
end;
$$;

grant execute on function public.set_username(text) to authenticated;

-- --------------------------------------------------------------------------- --
-- 4. update_profile(username, display_name, bio) — one call to save the editable
--    profile fields. Writes ONLY these columns; convict_score is untouchable.
-- --------------------------------------------------------------------------- --
create or replace function public.update_profile(
  p_username text,
  p_display_name text,
  p_bio text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_username is not null then
    perform public.set_username(p_username);  -- reuse validation + uniqueness
  end if;
  update public.profiles
    set display_name = nullif(trim(p_display_name), ''),
        bio          = nullif(trim(p_bio), ''),
        updated_at   = now()
  where id = auth.uid();
end;
$$;

grant execute on function public.update_profile(text, text, text) to authenticated;

-- --------------------------------------------------------------------------- --
-- 4b. email_for_username(name) — resolve a username to its email so users can
--     log in with EITHER their email or username (Supabase auth signs in by
--     email only). Callable pre-login (anon).
--
--     ⚠️ Trade-off: this lets anyone map a (public) username to its email, i.e.
--     email enumeration by username. Acceptable for a username-login UX; if you
--     later want emails fully private, move this lookup+signin into a Supabase
--     Edge Function (or add a captcha) so the email never leaves the server.
-- --------------------------------------------------------------------------- --
create or replace function public.email_for_username(name text)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select u.email
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(p.username) = lower(name)
  limit 1;
$$;

grant execute on function public.email_for_username(text) to anon, authenticated;

-- --------------------------------------------------------------------------- --
-- 5. Signup trigger — accept a username from signup metadata when it's valid and
--    free; otherwise leave it null (the app prompts on first visit).
-- --------------------------------------------------------------------------- --
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  desired text := nullif(trim(new.raw_user_meta_data->>'username'), '');
begin
  if desired is not null
     and desired ~ '^[a-zA-Z0-9_]{3,20}$'
     and not exists (select 1 from public.profiles where lower(username) = lower(desired))
  then
    insert into public.profiles (id, username) values (new.id, desired)
      on conflict (id) do nothing;
  else
    insert into public.profiles (id) values (new.id)
      on conflict (id) do nothing;
  end if;
  return new;
end;
$$;
