import os
from datetime import date, datetime, timedelta

import pytest

import engine
from tests.golden import rows_hash

HERE = os.path.dirname(os.path.abspath(__file__))


def camp(**kw):
    c = {"campaign_key": "k", "campaign_id": "701000000000000AAA", "campaign_name": "Test Campaign",
         "audience_source": "Segment", "target": "Personal", "audience_rule": "all",
         "product_name": "P", "product_category": "C", "start_date": date(2026, 11, 5),
         "end_date": date(2026, 11, 15), "template_key": "t", "crm_state": "Linked"}
    c.update(kw)
    return c


def acct(person=True, created=date(2026, 1, 1)):
    return {"person": person, "person_contact": "003P" if person else None, "created": created}


def test_funnel_matches_pre_refactor_golden():
    with open(os.path.join(HERE, "golden_events.txt")) as f:
        assert rows_hash(engine.build_rows) == f.read().strip()


def test_audience_excludes_accounts_created_on_or_after_start():
    c = camp()
    assert engine.in_audience(c, "001A", acct(created=date(2026, 11, 4)), set())
    assert not engine.in_audience(c, "001B", acct(created=date(2026, 11, 5)), set())
    assert not engine.in_audience(c, "001C", acct(created=date(2026, 11, 20)), set())


def test_audience_target_filter():
    assert not engine.in_audience(camp(target="Personal"), "001A", acct(person=False), set())
    assert engine.in_audience(camp(target="Business"), "001A", acct(person=False), set())
    assert engine.in_audience(camp(target="All"), "001A", acct(person=False), set())


def test_share_rule_is_deterministic_by_name_and_account():
    c = camp(audience_rule="share:0.40")
    picks = [engine.in_audience(c, f"001{i:015d}", acct(), set()) for i in range(2000)]
    assert picks == [engine.unit("Test Campaign", f"001{i:015d}") < 0.40 for i in range(2000)]
    assert 0.35 < sum(picks) / 2000 < 0.45


def test_new_accounts_rule_takes_previous_calendar_month():
    c = camp(audience_rule="new_accounts", target="All", start_date=date(2026, 11, 3))
    assert engine.in_audience(c, "001A", acct(created=date(2026, 10, 1)), set())
    assert engine.in_audience(c, "001B", acct(created=date(2026, 10, 31)), set())
    assert not engine.in_audience(c, "001C", acct(created=date(2026, 9, 30)), set())
    assert not engine.in_audience(c, "001D", acct(created=date(2026, 11, 1)), set())


def test_new_accounts_rule_january_uses_december():
    c = camp(audience_rule="new_accounts", target="All", start_date=date(2027, 1, 3))
    assert engine.in_audience(c, "001A", acct(created=date(2026, 12, 15)), set())


def test_uncovered_rule_includes_all_uncovered():
    c = camp(audience_rule="uncovered+0.00")
    assert engine.in_audience(c, "001A", acct(), set())
    assert not engine.in_audience(c, "001A", acct(), {"001A"})


def test_unknown_rule_raises():
    with pytest.raises(ValueError):
        engine.in_audience(camp(audience_rule="bogus"), "001A", acct(), set())


def test_member_created_after_cutoff_sends_from_member_date():
    c = camp(audience_source="Campaign Member", audience_rule="members", start_date=date(2026, 9, 16), end_date=None)
    accounts = {"001A": acct(), "001B": acct()}
    members = {c["campaign_id"]: [
        {"id": "00vA", "contact_id": "003A", "account_id": "001A", "responded": False, "created": date(2026, 9, 20)},
        {"id": "00vB", "contact_id": "003B", "account_id": "001B", "responded": False, "created": date(2026, 10, 20)},
    ]}
    sends = {s["account_id"]: s for s in engine.build_sends([c], accounts, {}, members)}
    assert sends["001A"]["start"] == date(2026, 9, 16)
    assert sends["001B"]["start"] == date(2026, 10, 20)


def test_oldest_member_per_account_wins():
    c = camp(audience_source="Campaign Member", audience_rule="members")
    members = {c["campaign_id"]: [
        {"id": "00vOLD", "contact_id": "003A", "account_id": "001A", "responded": False, "created": date(2026, 1, 1)},
        {"id": "00vNEW", "contact_id": "003A", "account_id": "001A", "responded": True, "created": date(2026, 1, 2)},
    ]}
    sends = engine.build_sends([c], {"001A": acct()}, {}, members)
    assert [s["campaign_member_id"] for s in sends] == ["00vOLD"]


def test_skip_send_ids_drops_whole_send():
    c = camp(start_date=date(2026, 3, 1), end_date=date(2026, 3, 5))
    sends = engine.build_sends([c], {"001A": acct(created=date(2026, 1, 1))}, {}, {})
    as_of = datetime(2026, 10, 1)
    assert engine.build_rows(sends, as_of, as_of)
    assert engine.build_rows(sends, as_of, as_of, skip_send_ids={sends[0]["send_id"]}) == []


def test_rows_never_after_as_of():
    c = camp(start_date=date(2026, 11, 1), end_date=date(2026, 11, 30))
    accounts = {f"001{i:015d}": acct() for i in range(300)}
    as_of = datetime(2026, 11, 3, 12)
    rows = engine.build_rows(engine.build_sends([c], accounts, {}, {}), as_of, as_of)
    assert rows and max(r[12] for r in rows) <= as_of


def test_is_active():
    c = camp(start_date=date(2026, 11, 5), end_date=date(2026, 11, 15))
    assert not engine.is_active(c, datetime(2026, 11, 4, 23))
    assert engine.is_active(c, datetime(2026, 11, 5))
    assert engine.is_active(c, datetime(2026, 11, 29, 23, 59))
    assert not engine.is_active(c, datetime(2026, 11, 30, 0, 0, 1))
    assert engine.is_active(camp(end_date=None, start_date=date(2026, 1, 1)), datetime(2030, 1, 1))


def test_is_active_grace_extends_past_cap():
    c = camp(start_date=date(2026, 11, 5), end_date=date(2026, 11, 15))
    week = timedelta(days=7)
    assert engine.is_active(c, datetime(2026, 12, 6, 23, 59), grace=week)
    assert not engine.is_active(c, datetime(2026, 12, 7, 0, 0, 1), grace=week)
    assert not engine.is_active(c, datetime(2026, 11, 4, 23), grace=week)


def test_new_rows_closed_campaign_only_extends_stored_sends_and_never_bounces_delivered():
    c = camp(start_date=date(2026, 3, 1), end_date=date(2026, 3, 5))
    sends = engine.build_sends([c], {f"001{i:015d}": acct() for i in range(400)}, {}, {})
    as_of = datetime(2026, 10, 1)
    bounced = sorted({r[1] for r in engine.build_rows(sends, as_of, as_of) if r[11] == "Bounced"})
    assert bounced
    stored = {bounced[0]: {"Sent", "Delivered"}}  # delivered earlier, before a HasResponded flip
    rows = engine.new_rows([c], sends, stored, as_of, as_of)
    assert {r[1] for r in rows} == {bounced[0]}
    assert "Bounced" not in {r[11] for r in rows}


def test_new_rows_active_campaign_adds_new_sends_and_skips_bounced():
    c = camp(start_date=date(2026, 11, 1), end_date=date(2026, 11, 30))
    sends = engine.build_sends([c], {f"001{i:015d}": acct() for i in range(50)}, {}, {})
    as_of = datetime(2026, 11, 10)
    stored = {sends[0]["send_id"]: {"Sent", "Bounced"}}
    rows = engine.new_rows([c], sends, stored, as_of, as_of)
    assert {r[1] for r in rows} == {s["send_id"] for s in sends[1:]}
