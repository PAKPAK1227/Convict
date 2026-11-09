"""Behavioural tests for the migrations, acting as each Supabase role."""


def test_migrations_apply_in_order(db):
    assert db.root().one("select count(*) from pg_proc where proname = 'metrics_integrity_lock'")[0] == 1


# --- 20260926 thesis integrity locks ---------------------------------------- #

def test_deadline_minimum_is_30_days(db):
    u = db.user()
    db.as_("authenticated", u).fails(
        "insert into theses(user_id,ticker,conviction_level,target_date) values (%s,'NVDA','Medium',current_date+29)",
        (u,), match="at least 30 days")


def test_client_cannot_set_status_or_backdate(db):
    u = db.user()
    db.as_("authenticated", u)
    tid = db.one("insert into theses(user_id,ticker,conviction_level,target_date,status,created_at) "
                 "values (%s,'NVDA','Medium',current_date+40,'On Track',now()+interval '100 days') "
                 "returning id", (u,))[0]
    status, future = db.root().one("select status, created_at > now() + interval '1 minute' from theses where id=%s", (tid,))
    assert status == "Pending" and future is False


def test_earnings_metrics_need_90_days(db):
    u = db.user()
    short, long_ = db.thesis(u, days=30), db.thesis(u, days=90)
    db.as_("authenticated", u)
    db.fails("insert into metrics(thesis_id,metric_name,target_value) values (%s,'revenue_growth',10)",
             (short,), match="at least 90 days")
    db.run("insert into metrics(thesis_id,metric_name,target_value) values (%s,'revenue_growth',10)", (long_,))
    db.fails("update theses set target_date=current_date+45 where id=%s", (long_,), match="at least 90 days")


def test_everything_locks_after_24_hours(db):
    u = db.user()
    old = db.thesis(u, age="25 hours")
    db.as_("service_role").run("insert into metrics(thesis_id,metric_name,target_value) values (%s,'pe_ratio',20)", (old,))
    db.as_("authenticated", u)
    for sql in ("update theses set conviction_level='High' where id=%s",
                "delete from theses where id=%s",
                "update metrics set target_value=5 where thesis_id=%s",
                "delete from metrics where thesis_id=%s",
                "insert into metrics(thesis_id,metric_name,target_value) values (%s,'profit_margin',5)"):
        db.fails(sql, (old,), match="locked")


def test_edits_and_deletes_allowed_inside_the_window(db):
    u = db.user()
    young = db.thesis(u, age="23 hours")
    db.as_("authenticated", u).run("update theses set conviction_level='High' where id=%s", (young,))
    db.run("delete from theses where id=%s", (young,))


def test_evaluator_is_exempt(db):
    u = db.user()
    old = db.thesis(u, age="40 hours")
    db.as_("service_role").run("update theses set status='Void', resolved=true where id=%s", (old,))


def test_client_cannot_resolve_or_write_current_value(db):
    u = db.user()
    tid = db.thesis(u)
    db.as_("authenticated", u).run("update theses set resolved=true where id=%s", (tid,))
    db.run("insert into metrics(thesis_id,metric_name,target_value,current_value) values (%s,'pe_ratio',20,999)", (tid,))
    assert db.root().one("select resolved from theses where id=%s", (tid,))[0] is False
    assert db.one("select current_value from metrics where thesis_id=%s", (tid,))[0] is None


def test_users_cannot_see_each_other(db):
    a, b = db.user(), db.user()
    db.thesis(a)
    assert db.as_("authenticated", b).one("select count(*) from theses where user_id=%s", (a,))[0] == 0


def test_delete_user_removes_locked_theses(db):
    u = db.user()
    db.thesis(u, age="10 days")
    db.as_("authenticated", u).run("select public.delete_user()")
    assert db.root().one("select count(*) from theses where user_id=%s", (u,))[0] == 0


# --- 20260927 target baselines ---------------------------------------------- #

def test_baselines_are_evaluator_only_and_reset_on_target_change(db):
    u = db.user()
    tid = db.thesis(u)
    db.as_("authenticated", u)
    mid = db.one("insert into metrics(thesis_id,metric_name,target_value,baseline_value,already_met) "
                 "values (%s,'pe_ratio',20,5,false) returning id", (tid,))[0]
    assert db.root().one("select baseline_value, already_met from metrics where id=%s", (mid,)) == (None, None)

    db.as_("service_role").run("update metrics set baseline_value=25, already_met=false where id=%s", (mid,))
    db.as_("authenticated", u).run("update metrics set baseline_value=1 where id=%s", (mid,))
    assert float(db.root().one("select baseline_value from metrics where id=%s", (mid,))[0]) == 25

    db.as_("authenticated", u).run("update metrics set target_value=22 where id=%s", (mid,))
    assert db.root().one("select baseline_value from metrics where id=%s", (mid,))[0] is None


def test_unscored_is_evaluator_only(db):
    u = db.user()
    tid = db.thesis(u)
    db.as_("authenticated", u).run("update theses set unscored=true where id=%s", (tid,))
    assert db.root().one("select unscored from theses where id=%s", (tid,))[0] is False


# --- 20260928 ticker snapshots / 20261017 price history ---------------------- #

def test_snapshots_readable_by_users_only_and_writable_by_service(db):
    db.as_("service_role").run("insert into ticker_snapshots(ticker,company_name,price) values ('SNAP','Snap Inc',10) "
                               "on conflict (ticker) do nothing")
    db.fails("insert into ticker_snapshots(ticker) values ('BRK.B')", match="ticker_snapshots_ticker_check")
    u = db.user()
    assert db.as_("authenticated", u).one("select company_name from ticker_snapshots where ticker='SNAP'") == ("Snap Inc",)
    db.fails("insert into ticker_snapshots(ticker) values ('ZZZZ')", match="row-level security")
    assert db.as_("anon").one("select count(*) from ticker_snapshots")[0] == 0


def test_price_history_is_server_only(db):
    db.as_("service_role").run("insert into price_history(ticker,day,close) values ('HIST','2026-10-16',230) "
                               "on conflict do nothing")
    db.fails("insert into price_history(ticker,day,close) values ('HIST','2026-10-15',0)", match="price_history_close_check")
    db.run("update ticker_snapshots set vol_theta=1.1, history_backfilled_at=now() where ticker='SNAP'")
    db.run("insert into evaluator_runs(ok, tickers_deferred) values (true, 3)")
    u = db.user()
    assert db.as_("authenticated", u).one("select count(*) from price_history")[0] == 0
    db.fails("insert into price_history(ticker,day,close) values ('HIST','2026-10-16',1)", match="row-level security")
    assert db.as_("anon").one("select count(*) from price_history_days")[0] == 0
