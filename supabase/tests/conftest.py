"""Run every migration against a throwaway Postgres and test them as Supabase
would see them.

Supabase isn't needed: pgserver ships a real Postgres binary, and a small shim
recreates the parts of Supabase the migrations rely on — the anon /
authenticated / service_role roles, auth.users, and auth.uid() / auth.role()
reading the request's JWT claims (as PostgREST sets them).

Run:  python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt
      .venv/bin/python -m pytest
"""
import glob
import json
import os
import tempfile
import uuid

import pgserver
import psycopg2
import pytest

MIGRATIONS = os.path.join(os.path.dirname(__file__), "..", "migrations")

# The two tables that predate the versioned migrations, as the app uses them.
SHIM = """
do $$ begin
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
exception when duplicate_object then null; end $$;
create schema if not exists auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create or replace function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claims', true)::jsonb->>'sub','')::uuid $$;
create or replace function auth.role() returns text language sql stable as
  $$ select current_setting('request.jwt.claims', true)::jsonb->>'role' $$;
grant usage on schema auth, public to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
create table public.theses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ticker text, company_name text, thesis_text text, conviction_level text,
  status text default 'Pending', created_at timestamptz not null default now());
create table public.metrics (
  id uuid primary key default gen_random_uuid(),
  thesis_id uuid not null references public.theses(id) on delete cascade,
  metric_name text, target_value numeric, current_value numeric);
"""


class Db:
    """A cursor that can act as any Supabase role."""

    def __init__(self, cur):
        self.cur = cur

    def as_(self, role, uid=None):
        self.cur.execute("reset role")
        self.cur.execute("select set_config('request.jwt.claims', %s, false)",
                         (json.dumps({"role": role, "sub": uid or ""}),))
        if role != "postgres":
            self.cur.execute(f"set role {role}")
        return self

    def root(self):
        return self.as_("postgres")

    def run(self, sql, params=()):
        self.cur.execute(sql, params)
        return self

    def all(self, sql, params=()):
        self.cur.execute(sql, params)
        return self.cur.fetchall()

    def one(self, sql, params=()):
        self.cur.execute(sql, params)
        return self.cur.fetchone()

    def fails(self, sql, params=(), match=""):
        """Assert that sql raises, with `match` in the error message."""
        with pytest.raises(psycopg2.Error) as err:
            self.cur.execute(sql, params)
        assert match in str(err.value), str(err.value)

    # --- fixtures as methods ------------------------------------------------ #

    def user(self):
        uid = str(uuid.uuid4())
        self.root().run("insert into auth.users(id, email) values (%s, %s)", (uid, f"{uid}@x"))
        return uid

    def thesis(self, uid, days=60, age=None, ticker="NVDA"):
        """A thesis created by `uid`, `days` from creation to deadline,
        optionally backdated by `age` (e.g. '25 hours')."""
        self.as_("authenticated", uid)
        tid = self.one(
            "insert into theses(user_id,ticker,conviction_level,target_date) "
            "values (%s,%s,'Medium',current_date + %s) returning id", (uid, ticker, days))[0]
        if age:
            self.as_("service_role").run(
                f"update theses set created_at = now() - interval '{age}' where id=%s", (tid,))
        return tid


@pytest.fixture(scope="session")
def _server():
    srv = pgserver.get_server(tempfile.mkdtemp(), cleanup_mode="stop")
    conn = psycopg2.connect(srv.get_uri())
    conn.autocommit = True
    cur = conn.cursor()
    # Supabase runs in UTC, and the deadline rules count UTC dates; a local
    # time zone would make current_date disagree with them near midnight.
    cur.execute("set timezone to 'UTC'")
    cur.execute(SHIM)
    for path in sorted(glob.glob(os.path.join(MIGRATIONS, "*.sql"))):
        cur.execute(open(path).read())
    # Supabase's default grants: roles reach every public table; RLS decides rows.
    cur.execute("grant all on all tables in schema public to anon, authenticated, service_role;"
                "grant all on all sequences in schema public to anon, authenticated, service_role;")
    yield cur
    conn.close()


@pytest.fixture
def db(_server):
    d = Db(_server)
    yield d
    d.root()
