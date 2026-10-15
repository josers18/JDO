import os
import subprocess
import sys
from datetime import date, datetime, time, timedelta

import pytest

import db
import feed


class FakeSf:
    """In-memory CRM: Accounts, Contacts (none) and Campaigns."""

    def __init__(self, n_person=60, n_business=30, created="2026-01-01"):
        self.accounts = (
            [{"Id": f"001P{i:014d}", "IsPersonAccount": True, "PersonContactId": f"003P{i:014d}",
              "CreatedDate": f"{created}T00:00:00.000+0000"} for i in range(n_person)]
            + [{"Id": f"001B{i:014d}", "IsPersonAccount": False, "PersonContactId": None,
                "CreatedDate": f"{created}T00:00:00.000+0000"} for i in range(n_business)])
        self.campaigns, self.creates, self.fail_create = {}, 0, False

    def query(self, soql):
        if "FROM Account" in soql:
            return self.accounts
        if "FROM Contact" in soql or "FROM CampaignMember" in soql:
            return []
        if soql.startswith("SELECT Id FROM Campaign WHERE Name = "):
            name = soql.split("Name = '", 1)[1][:-1].replace("\\'", "'")
            return [{"Id": i} for i, c in self.campaigns.items() if c["Name"] == name]
        if soql.startswith("SELECT Id, Name, StartDate, EndDate, Status, NumberSent FROM Campaign"):
            return [dict(c, Id=i) for i, c in self.campaigns.items() if f"'{i}'" in soql]
        raise AssertionError(soql)

    def create(self, sobject, fields):
        if self.fail_create:
            raise RuntimeError("CRM down")
        self.creates += 1
        cid = f"701FAKE{len(self.campaigns):011d}"
        self.campaigns[cid] = dict(fields, NumberSent=None)
        return cid

    def update(self, sobject, cid, fields):
        self.campaigns[cid].update(fields)


def engagement_ids(pg):
    return {r[0] for r in pg.execute(f"SELECT engagement_id FROM {db.t('marketing_engagement')}").fetchall()}


def test_rotation_crosses_year_without_repeat(pg):
    tpls = db.templates(pg)
    months = [date(2026, m, 1) for m in range(7, 13)] + [date(2027, m, 1) for m in range(1, 7)]
    personal = [next(c for c in feed.plan_rollover(tpls, m) if c["target"] == "Personal")["template_key"] for m in months]
    assert len(set(personal[:6])) == 6 and len(set(personal[6:])) == 6
    assert all(a != b for a, b in zip(personal, personal[1:]))
    dec = feed.plan_rollover(tpls, date(2026, 12, 1))
    assert len(dec) == 3 and {c["target"] for c in dec} == {"Personal", "Business", "All"}
    assert all(c["campaign_key"].endswith("-2026-12") and "December 2026" in c["campaign_name"] for c in dec)


def test_month_boundary_uses_utc_month(pg):
    fake = FakeSf()
    feed.run(pg, lambda: fake, datetime(2026, 12, 31, 23, 59))
    feed.run(pg, lambda: fake, datetime(2027, 1, 1, 0, 0))
    keys = sorted(c["campaign_key"] for c in db.campaigns(pg) if c["template_key"])
    assert sum(k.endswith("-2026-12") for k in keys) == 3 and sum(k.endswith("-2027-01") for k in keys) == 3


def test_first_run_creates_and_links_then_generates_due_rows_only(pg):
    fake = FakeSf()
    assert feed.run(pg, lambda: fake, datetime(2026, 11, 1, 7)) is True
    linked = [c for c in db.campaigns(pg, state="Linked") if c["template_key"]]
    assert len(linked) == 3 and fake.creates == 3
    assert all(fake.campaigns[c["campaign_id"]]["Status"] == "Planned" for c in linked)
    assert db.table_counts(pg)["marketing_engagement"] == 0  # all start days are after Nov 1

    now = datetime(2026, 11, 20, 12)
    assert feed.run(pg, lambda: fake, now) is True
    max_at = pg.execute(f"SELECT max(engagement_at), count(*) FROM {db.t('marketing_engagement')}").fetchone()
    assert max_at[1] > 0 and max_at[0] <= now
    assert fake.creates == 3  # no new campaigns mid-month


def test_rerun_same_hour_inserts_nothing_and_never_removes(pg):
    fake = FakeSf()
    now = datetime(2026, 11, 20, 12)
    feed.run(pg, lambda: fake, datetime(2026, 11, 1, 7))
    feed.run(pg, lambda: fake, now)
    before = engagement_ids(pg)
    feed.run(pg, lambda: fake, now)
    assert engagement_ids(pg) == before
    feed.run(pg, lambda: fake, datetime(2026, 11, 25))
    assert engagement_ids(pg) >= before


def test_catch_up_equals_continuous(pg):
    fake = FakeSf()
    feed.run(pg, lambda: fake, datetime(2026, 11, 1, 7))
    for day in (10, 25):
        feed.run(pg, lambda: fake, datetime(2026, 11, day, 9))
    expected = {r[0] for r in feed.due_rows(pg, fake, datetime(2026, 11, 25, 9))}
    assert engagement_ids(pg) == expected


def test_crm_create_links_existing_by_name(pg):
    fake = FakeSf()
    planned = feed.plan_rollover(db.templates(pg), date(2026, 11, 1))
    fake.campaigns["701EXISTING0000000"] = {"Name": planned[0]["campaign_name"], "Status": "Planned", "NumberSent": None}
    feed.run(pg, lambda: fake, datetime(2026, 11, 1, 7))
    by_name = {c["campaign_name"]: c for c in db.campaigns(pg)}
    assert by_name[planned[0]["campaign_name"]]["campaign_id"] == "701EXISTING0000000"
    assert fake.creates == 2


def test_crm_failure_keeps_pending_and_logs_error(pg):
    fake = FakeSf()
    fake.fail_create = True
    assert feed.run(pg, lambda: fake, datetime(2026, 11, 1, 7)) is False
    assert len(db.campaigns(pg, state="Pending CRM")) == 3
    errors = pg.execute(f"SELECT step FROM {db.t('marketing_feed_run')} WHERE status = 'error'").fetchall()
    assert errors == [("crm_create",)]
    fake.fail_create = False
    assert feed.run(pg, lambda: fake, datetime(2026, 11, 1, 8)) is True
    assert len(db.campaigns(pg, state="Pending CRM")) == 0


def test_auth_failure_logged(pg):
    def boom():
        raise RuntimeError("JWT login failed (400): invalid_grant")
    assert feed.run(pg, boom, datetime(2026, 11, 1, 7)) is False
    assert pg.execute(f"SELECT step, status FROM {db.t('marketing_feed_run')}").fetchall() == [("auth", "error")]


def test_reconcile_status_numbersent_drift_and_missing(pg):
    fake = FakeSf()
    feed.run(pg, lambda: fake, datetime(2026, 11, 1, 7))
    feed.run(pg, lambda: fake, datetime(2026, 11, 20, 7))
    camps = {c["template_key"]: c for c in db.campaigns(pg) if c["template_key"]}
    for c in camps.values():
        crm_c = fake.campaigns[c["campaign_id"]]
        assert crm_c["Status"] == feed.desired_status(c, date(2026, 11, 20))
        sent = db.sent_counts(pg).get(c["campaign_id"], 0)
        assert crm_c["NumberSent"] == sent

    welcome, *others = camps.values()
    fake.campaigns[others[0]["campaign_id"]]["Name"] = "Renamed in CRM"
    del fake.campaigns[others[1]["campaign_id"]]
    feed.run(pg, lambda: fake, datetime(2026, 11, 21, 7))
    states = {c["campaign_key"]: c["crm_state"] for c in db.campaigns(pg)}
    assert states[others[0]["campaign_key"]] == "Drifted"
    assert states[others[1]["campaign_key"]] == "Missing in CRM"


def test_reconcile_runs_once_per_day_after_0600(pg):
    fake = FakeSf()
    feed.run(pg, lambda: fake, datetime(2026, 11, 1, 5))
    feed.run(pg, lambda: fake, datetime(2026, 11, 1, 7))
    feed.run(pg, lambda: fake, datetime(2026, 11, 1, 8))
    n = pg.execute(f"SELECT count(*) FROM {db.t('marketing_feed_run')} WHERE step = 'reconcile'").fetchone()[0]
    assert n == 1


def test_dry_run_writes_nothing(pg):
    fake = FakeSf()
    before = db.table_counts(pg)
    assert feed.run(pg, lambda: fake, datetime(2026, 11, 20, 7), dry_run=True) is True
    assert db.table_counts(pg) == before and fake.creates == 0


def test_desired_status():
    c = {"start_date": date(2026, 11, 5), "end_date": date(2026, 11, 15)}
    assert feed.desired_status(c, date(2026, 11, 4)) == "Planned"
    assert feed.desired_status(c, date(2026, 11, 5)) == "In Progress"
    assert feed.desired_status(c, date(2026, 11, 15)) == "In Progress"
    assert feed.desired_status(c, date(2026, 11, 16)) == "Completed"


def test_no_generated_campaigns_before_first_month(pg):
    fake = FakeSf()
    assert feed.run(pg, lambda: fake, datetime(2026, 10, 20, 7)) is True
    assert [c for c in db.campaigns(pg) if c["template_key"]] == [] and fake.creates == 0


def test_catch_up_across_cap_loses_nothing(pg):
    fake = FakeSf()
    feed.run(pg, lambda: fake, datetime(2026, 11, 1, 7))
    first = min((c for c in db.campaigns(pg, state="Linked") if c["template_key"] and c["audience_rule"] != "new_accounts"),
                key=lambda c: c["end_date"])
    cap = datetime.combine(first["end_date"], time(23, 59, 59)) + timedelta(days=14)
    expected = {r[0] for r in feed.due_rows(pg, fake, cap) if r[2] == first["campaign_id"]}
    feed.run(pg, lambda: fake, cap + timedelta(days=3))  # outage spanned the cap, ended within GRACE
    got = {r[0] for r in pg.execute(f"SELECT engagement_id FROM {db.t('marketing_engagement')} "
                                    "WHERE campaign_id = %s", (first["campaign_id"],)).fetchall()}
    assert expected and got == expected


def test_template_added_mid_month_creates_no_extra_campaign(pg):
    fake = FakeSf()
    feed.run(pg, lambda: fake, datetime(2026, 11, 1, 7))
    pg.execute(f"INSERT INTO {db.t('marketing_campaign_template')} (template_key, name_pattern, target, "
               "audience_rule, product_name, product_category, start_day, duration_days) "
               "VALUES ('aaa-new', 'New Offer — {month}', 'Personal', 'share:0.30', 'P', 'C', 3, 10)")
    feed.run(pg, lambda: fake, datetime(2026, 11, 15, 7))
    assert fake.creates == 3
    assert len([c for c in db.campaigns(pg) if c["campaign_key"].endswith("-2026-11")]) == 3


def test_overlapping_run_is_skipped(pg):
    other = db.connect()
    try:
        assert db.try_lock(other)
        fake = FakeSf()
        assert feed.run(pg, lambda: fake, datetime(2026, 11, 1, 7)) is True
        assert fake.creates == 0 and db.table_counts(pg)["marketing_feed_run"] == 0
    finally:
        other.close()


def test_future_now_refused_without_dry_run():
    env = {k: v for k, v in os.environ.items() if k != "DATABASE_URL"} | {"ME_ENV_FILE": "/nonexistent"}
    out = subprocess.run([sys.executable, "feed.py", "--now", "2099-01-01T00:00"], capture_output=True, text=True,
                         cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))), env=env)
    assert out.returncode != 0 and "future" in out.stderr
