from datetime import date, datetime

import db
import migrate


def row(eid, send="s1", kind="Sent", at=datetime(2026, 11, 5, 14), cid="701000000000000AAA"):
    return (eid, send, cid, "C", "Segment", None, "001A", None, "Personal", "P", "C", kind, at, None,
            datetime(2026, 11, 5, 15))


def test_insert_events_is_insert_only(pg):
    assert db.insert_events(pg, [row("e1"), row("e2")]) == 2
    assert db.insert_events(pg, [row("e1", at=datetime(2030, 1, 1)), row("e3")]) == 1
    stored = dict(pg.execute(f"SELECT engagement_id, engagement_at FROM {db.t('marketing_engagement')}").fetchall())
    assert stored == {"e1": datetime(2026, 11, 5, 14), "e2": datetime(2026, 11, 5, 14), "e3": datetime(2026, 11, 5, 14)}


def test_insert_events_dry_run_counts_without_writing(pg):
    db.insert_events(pg, [row("e1")])
    assert db.insert_events(pg, [row("e1"), row("e2")], dry_run=True) == 1
    assert db.table_counts(pg)["marketing_engagement"] == 1


def test_campaign_insert_is_idempotent_and_state_settable(pg):
    c = {"campaign_key": "x-2026-11", "campaign_name": "X — November 2026", "audience_source": "Segment",
         "target": "Personal", "audience_rule": "share:0.30", "product_name": "P", "product_category": "C",
         "start_date": date(2026, 11, 5), "end_date": date(2026, 11, 15), "template_key": "x",
         "crm_state": "Pending CRM"}
    assert db.insert_campaign(pg, c) is True
    assert db.insert_campaign(pg, c) is False
    db.set_campaign(pg, "x-2026-11", campaign_id="701000000000001AAA", crm_state="Linked")
    [got] = db.campaigns(pg, state="Linked")
    assert got["campaign_id"] == "701000000000001AAA" and got["start_date"] == date(2026, 11, 5)


def test_linked_requires_campaign_id(pg):
    import psycopg
    c = {"campaign_key": "y", "campaign_name": "Y", "audience_source": "Segment", "target": "Personal",
         "audience_rule": "all", "start_date": date(2026, 11, 1), "crm_state": "Linked"}
    try:
        db.insert_campaign(pg, c)
        raise AssertionError("expected CHECK violation")
    except psycopg.errors.CheckViolation:
        pass


def test_templates_seeded(pg):
    tpls = db.templates(pg)
    assert len([t for t in tpls if t["target"] == "Personal"]) == 6
    assert len([t for t in tpls if t["target"] == "Business"]) == 6
    assert [t["template_key"] for t in tpls if t["target"] == "All"] == ["welcome"]
    assert all("{month}" in t["name_pattern"] for t in tpls)


def test_bounced_and_sent_counts(pg):
    db.insert_events(pg, [row("e1", send="s1"), row("e2", send="s1", kind="Bounced"), row("e3", send="s2")])
    assert db.stored_sends(pg, ["701000000000000AAA"]) == {"s1": {"Sent", "Bounced"}, "s2": {"Sent"}}
    assert db.sent_counts(pg) == {"701000000000000AAA": 2}
    assert db.covered_accounts(pg) == {"001A"}


def test_run_log(pg):
    assert db.last_success(pg, "reconcile") is None
    db.log_run(pg, "reconcile", "error", detail="boom")
    assert db.last_success(pg, "reconcile") is None
    db.log_run(pg, "reconcile", "ok", campaigns=3)
    assert db.last_success(pg, "reconcile") is not None


def test_catalog_rows_cover_all_15():
    from catalog import CRM_CAMPAIGNS, SIMULATED_CAMPAIGNS
    fake = {n: {"Id": f"701{i:015d}", "StartDate": "2026-01-01", "EndDate": None}
            for i, n in enumerate([*CRM_CAMPAIGNS, *SIMULATED_CAMPAIGNS])}
    rows = migrate.catalog_rows(fake)
    assert len(rows) == 15 and len({r["campaign_key"] for r in rows}) == 15
    by_name = {r["campaign_name"]: r for r in rows}
    assert by_name["Treasury Modernization Brief"]["audience_rule"] == "share:0.40"
    assert by_name["Retirement Readiness Series"]["audience_rule"] == "uncovered+0.20"
    assert by_name["Premier Checking Onboarding"]["audience_source"] == "Campaign Member"
    assert all(r["crm_state"] == "Linked" and len(r["campaign_key"]) <= 40 for r in rows)
