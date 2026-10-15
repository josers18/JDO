from datetime import date, datetime

import backfill
import db


class FakeQuery:
    """SOQL-shaped responses for crm.load_* (Account / Contact / CampaignMember)."""

    def __init__(self, accounts, members=()):
        self.accounts, self.members = accounts, list(members)

    def __call__(self, soql):
        if "FROM Account" in soql:
            return self.accounts
        if "FROM Contact" in soql:
            return []
        if "FROM CampaignMember" in soql:
            return [m for m in self.members if m["CampaignId"] in soql]
        raise AssertionError(soql)


def account(i, person=True, created="2026-01-01"):
    return {"Id": f"001{i:015d}", "IsPersonAccount": person, "PersonContactId": f"003{i:015d}" if person else None,
            "CreatedDate": f"{created}T00:00:00.000+0000"}


def seed(pg):
    db.insert_campaign(pg, {
        "campaign_key": "seg", "campaign_id": "701000000000000SEG", "campaign_name": "Seg Campaign",
        "audience_source": "Segment", "target": "Personal", "audience_rule": "share:0.50",
        "product_name": "P", "product_category": "C", "start_date": date(2026, 3, 1),
        "end_date": date(2026, 3, 10), "crm_state": "Linked"})


def test_backfill_rerun_is_insert_only(pg):
    seed(pg)
    q = FakeQuery([account(i) for i in range(200)])
    as_of = datetime(2026, 10, 15)
    rows, _ = backfill.plan(pg, q, as_of, as_of)
    assert db.insert_events(pg, rows) == len(rows) > 0
    before = sorted(pg.execute(f"SELECT * FROM {db.t('marketing_engagement')}").fetchall())

    rows2, _ = backfill.plan(pg, q, as_of, datetime(2026, 10, 16))  # different load time
    assert db.insert_events(pg, rows2) == 0
    assert sorted(pg.execute(f"SELECT * FROM {db.t('marketing_engagement')}").fetchall()) == before


def test_backfill_skips_bounced_sends(pg):
    seed(pg)
    q = FakeQuery([account(i) for i in range(400)])
    as_of = datetime(2026, 10, 15)
    rows, _ = backfill.plan(pg, q, as_of, as_of)
    db.insert_events(pg, rows)
    bounced = {r[1] for r in rows if r[11] == "Bounced"}
    assert bounced
    rows2, _ = backfill.plan(pg, q, as_of, as_of)
    assert not {r[1] for r in rows2} & bounced
