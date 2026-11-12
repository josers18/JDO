from collections import Counter
from datetime import date, datetime, timedelta

import db
import migrate
import service_now as sn

# Real home-org accounts: Marcus G Rodriguez (Jose Sifontes, person) and two accounts
# carrying backfill cases on 2026-10-24 (SN-HOME-309 person, SN-HOME-2581 business).
ACCOUNTS = [
    {"Id": "001am000026ZtgJAAS", "IsPersonAccount": True, "Owner": {"Name": "Jose Sifontes"}},
    {"Id": "001am00002AYPQnAAP", "IsPersonAccount": True, "Owner": {"Name": "Justin Chen"}},
    {"Id": "001am00002A9fbFAAR", "IsPersonAccount": False, "Owner": {"Name": "Allen Carter"}},
    {"Id": "001am0000FOREIGN00", "IsPersonAccount": True, "Owner": {"Name": "Someone Else"}},
]


def query(soql):
    assert soql.startswith("SELECT Id, IsPersonAccount, Owner.Name FROM Account WHERE Owner.Name IN ("), soql
    return ACCOUNTS


BOOKS = sn.load_books(query)


def test_books_keep_only_demo_bankers():
    assert BOOKS["Jose Sifontes"] == [("001am000026ZtgJAAS", True)]
    assert BOOKS["Allen Carter"] == [("001am00002A9fbFAAR", False)]
    assert all(a != "001am0000FOREIGN00" for book in BOOKS.values() for a, _ in book)


def test_day_cases_are_deterministic_and_match_book_type():
    a, b = sn.day_cases(date(2026, 11, 5), BOOKS), sn.day_cases(date(2026, 11, 5), BOOKS)
    assert a == b
    business = {t for t, _s, _c in sn.BUSINESS}
    for c in sn.due_cases(datetime(2026, 12, 31), BOOKS):
        if c["ext_account_id"] == "001am00002A9fbFAAR":
            assert c["type"] in business
        assert c["createddate"].date() == date(int(c["case_id"][5:9]), int(c["case_id"][9:11]), int(c["case_id"][11:13]))


def test_due_cases_start_after_the_backfill_and_stop_at_now():
    now = datetime(2026, 11, 11, 18, 30)
    cases = sn.due_cases(now, BOOKS)
    assert cases and all(sn.FEED_START < c["createddate"] <= now for c in cases)
    # The rest of Nov 11 arrives on later runs, unchanged.
    later = {c["case_id"]: c for c in sn.due_cases(datetime(2026, 11, 12, 6), BOOKS)}
    assert all(later[c["case_id"]] == c for c in cases)


def test_daily_rate_follows_the_backfill():
    books = {b: [(f"001am{i:013d}", True)] for i, b in enumerate(sn.BANKERS)}
    days = [date(2027, 1, 1) + timedelta(days=i) for i in range(400)]
    per_day = sum(len(sn.day_cases(d, books)) for d in days) / len(days)
    # 3,260 backfill cases over 602 days, skewed 1.67x toward the end: about 9 a day.
    assert 8 < per_day < 10.2


def test_plan_closes_like_the_backfill_and_some_never_close():
    plans = [sn.plan(f"SN-D-X-{i}") for i in range(5000)]
    closed_by = lambda d: sum(1 for _p, c in plans if c is not None and c <= d) / len(plans)
    assert 0.15 < closed_by(14) < 0.25
    assert 0.70 < closed_by(45) < 0.80
    assert 0.90 < closed_by(150) < 0.96
    assert 0 < sum(1 for _p, c in plans if c is None) / len(plans) < 0.02
    assert all(p < c for p, c in plans if c is not None)


def test_status_only_moves_forward_over_time():
    start = datetime(2026, 11, 1, 9)
    for i in range(200):
        cid = f"SN-D-20261101-0-{i}"
        ranks = [sn.RANK[sn.status_at(cid, start, start + timedelta(days=d))[0]] for d in range(0, 600, 3)]
        assert ranks == sorted(ranks)


def _rows(pg, like="%"):
    return {r[0]: r[1:] for r in pg.execute(
        f'SELECT "Case ID", status, closeddate, updated_at, createddate FROM {db.t(sn.TABLE)} '
        'WHERE "Case ID" LIKE %s', (like,)).fetchall()}


def test_step_inserts_once_then_advances_and_stamps_updated_at(pg):
    now = datetime(2026, 11, 11, 5, 10)
    inserted, _ = sn.step(pg, query, now)
    rows = _rows(pg)
    assert inserted == len(rows) > 0
    assert all(updated == now for _s, _c, updated, _cr in rows.values())
    # A re-run in the same hour writes nothing.
    assert sn.step(pg, query, now) == (0, 0)

    later = datetime(2027, 3, 1, 5, 10)
    sn.step(pg, query, later)
    after = _rows(pg)
    moved = [cid for cid, (s, *_rest) in after.items() if cid in rows and s != rows[cid][0]]
    assert moved
    for cid in moved:
        assert sn.RANK[after[cid][0]] > sn.RANK[rows[cid][0]]
        assert after[cid][2] == later
        if after[cid][0] == "closed":
            assert after[cid][1] and after[cid][1] <= later


def test_catch_up_equals_continuous(pg):
    for day in range(1, 11):
        sn.step(pg, query, datetime(2026, 11, day, 5))
    continuous = _rows(pg)
    pg.execute(f'DELETE FROM {db.t(sn.TABLE)}')  # test schema only
    sn.step(pg, query, datetime(2026, 11, 10, 5))
    caught_up = _rows(pg)
    assert set(continuous) == set(caught_up)
    assert all(continuous[k][:2] == caught_up[k][:2] for k in continuous)


def test_backfill_cases_still_open_start_their_plan_at_feed_start(pg):
    tbl = db.t(sn.TABLE)
    # Real backfill rows: SN-HOME-309 opened 2026-10-24 15:38, plus an old one left open.
    pg.execute(f'INSERT INTO {tbl} ("Case ID", createddate, status, ext_account_id) VALUES '
               "('SN-HOME-309', '2026-10-24 15:38', 'open', '001am00002AYPQnAAP'), "
               "('SN-HOME-1', '2025-06-01 10:00', 'open', '001am000026ZtgJAAS'), "
               "('SN-HOME-2', '2025-06-01 10:00', 'closed', '001am000026ZtgJAAS'), "
               "('Service_Now_1', '2024-01-01', 'open', 'account_id_1')")
    sn.step(pg, query, datetime(2026, 10, 25, 5))
    rows = _rows(pg, "S%")
    want, _ = sn.status_at("SN-HOME-1", sn.FEED_START, datetime(2026, 10, 25, 5))
    assert rows["SN-HOME-1"][0] == want
    assert rows["SN-HOME-2"][0] == "closed"
    # The original synthetic-account cases are left alone.
    assert rows["Service_Now_1"][0] == "open" and rows["Service_Now_1"][2] is None


def test_dry_run_writes_nothing(pg):
    inserted, _ = sn.step(pg, query, datetime(2026, 11, 11, 5), dry_run=True)
    assert inserted > 0 and _rows(pg) == {}


def test_counts_by_status_stay_level_over_a_year():
    """Open cases plateau instead of piling up: new cases close on plan."""
    books = {b: [(f"001am{i:013d}", True)] for i, b in enumerate(sn.BANKERS)}
    cases = sn.due_cases(datetime(2027, 11, 1), books)

    def open_on(now):
        return Counter(sn.status_at(c["case_id"], c["createddate"], now)[0]
                       for c in cases if c["createddate"] <= now)

    q2, q4 = open_on(datetime(2027, 5, 1)), open_on(datetime(2027, 11, 1))
    open_q2, open_q4 = q2["open"] + q2["in_progress"], q4["open"] + q4["in_progress"]
    assert open_q4 < open_q2 * 1.35


def test_migration_drops_the_old_table_and_keeps_the_new_one(pg):
    pg.execute(f'CREATE TABLE {db.t("service_now")} ("Case ID" varchar)')
    pg.execute(f"INSERT INTO {db.t(sn.TABLE)} (\"Case ID\", status) VALUES ('SN-HOME-1', 'open')")
    migrate.apply_sql(pg)
    assert pg.execute("SELECT to_regclass(%s)", (db.t("service_now"),)).fetchone()[0] is None
    assert "SN-HOME-1" in _rows(pg)
