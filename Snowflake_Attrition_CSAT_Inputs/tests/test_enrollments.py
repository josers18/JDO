from datetime import date, datetime

from attrcsat.enrollments import enrollment_problems, enrollment_row
from attrcsat.profile import build_profile
from attrcsat.vocab import BOOL_COLUMNS, ENROLLMENT_COLUMNS
from tests.conftest import make_feature

OCT = datetime(2026, 10, 5, 4, 0)
NOV = datetime(2026, 11, 3, 4, 0)
N = 2000


def _features(n=N, kind="PERSON", category="Retail", balance=None, risk="Low", age=None, **extra):
    out = []
    for i in range(n):
        a = age if age is not None else 20 + (i * 7) % 60
        bal = balance if balance is not None else 5000.0 + (i * 977) % 400000
        f = dict(
            ACCOUNT_ID=f"001am{i:013d}", ACCOUNT_TYPE_FLAG=kind, CLIENT_CATEGORY=category,
            BIRTHDATE=date(2026 - a, 5, 15) if kind == "PERSON" else None,
            ANNUAL_REVENUE=900000.0 if kind == "BUSINESS" else None,
            TOTAL_BALANCE=bal, AVG_BALANCE=bal, ADB_TXN=20 + (i * 13) % 300, ADB_DAYS=90,
            RISK_RATING=risk,
        )
        f.update(extra)
        out.append(make_feature(**f))
    return out


def _pairs(feats, ts=OCT):
    profs = [build_profile(f, ts) for f in feats]
    return profs, [enrollment_row(p, ts) for p in profs]


def test_enrollment_columns_and_no_nulls(feature_rows):
    for f in feature_rows:
        row = enrollment_row(build_profile(f, OCT), OCT)
        assert tuple(row) == ENROLLMENT_COLUMNS
        assert all(v is not None for v in row.values())
        assert row["SNAPSHOT_DATE"] == "2026-10-01 00:00:00"
        for c in BOOL_COLUMNS:
            assert isinstance(row[c], bool)


def test_mfa_requires_digital():
    for ts in (OCT, NOV):
        _, rows = _pairs(_features(kind="PERSON") + _features(kind="BUSINESS", category="SmallBusiness"), ts)
        bad = [r for r in rows if r["MFA_STATUS"] and not (r["ONLINE_ENROLLED"] or r["MOBILE_ENROLLED"])]
        assert not bad


def test_kyc_hit_overrides_low_rating():
    for hit in ("PEP_HIT", "SANCTIONS_HIT", "ADVERSE_MEDIA_HIT"):
        row = enrollment_row(build_profile(make_feature(RISK_RATING="Low", **{hit: True}), OCT), OCT)
        assert row["KYC_STATUS"] in ("Pending", "Under Review")
        assert row["AML_STATUS"] in ("Under Review", "Pending")


def test_clean_profile_statuses():
    profs, rows = _pairs(_features())
    assert all(p["risk"] == "CLEAN" for p in profs)
    assert {r["KYC_STATUS"] for r in rows} <= {"Current", "Expired"}
    assert {r["AML_STATUS"] for r in rows} <= {"Cleared", "None"}
    assert 0.02 <= sum(r["KYC_STATUS"] == "Expired" for r in rows) / N <= 0.08
    assert sum(r["AML_STATUS"] == "None" for r in rows) / N <= 0.05


def test_wire_rates():
    _, biz = _pairs(_features(kind="BUSINESS", category="SmallBusiness"))
    assert sum(r["WIRE_ENABLED"] for r in biz) / N >= 0.40
    _, small = _pairs(_features(kind="PERSON", category="Retail", balance=20000.0))
    assert sum(r["WIRE_ENABLED"] for r in small) / N <= 0.05


def test_paperless_alerts_follow_digital():
    _, rows = _pairs(_features() + _features(kind="BUSINESS", category="SmallBusiness"))
    dig = [r for r in rows if r["ONLINE_ENROLLED"] or r["MOBILE_ENROLLED"]]
    non = [r for r in rows if not (r["ONLINE_ENROLLED"] or r["MOBILE_ENROLLED"])]
    assert non and dig
    for c in ("PAPERLESS_ENROLLED", "ALERT_ENROLLED"):
        assert sum(r[c] for r in non) / len(non) <= 0.10
        assert sum(r[c] for r in dig) / len(dig) >= 0.40


def test_adoption_by_age():
    _, young = _pairs(_features(age=26))
    _, old = _pairs(_features(age=72))
    ry = sum(r["MOBILE_ENROLLED"] for r in young) / N
    ro = sum(r["MOBILE_ENROLLED"] for r in old) / N
    assert ry - ro >= 0.20


def test_enrollment_same_month_identical():
    p = build_profile(make_feature(), OCT)
    assert enrollment_row(p, datetime(2026, 10, 3)) == enrollment_row(p, datetime(2026, 10, 28, 13))


def test_enrollment_month_drift_small():
    feats = _features() + _features(kind="BUSINESS", category="SmallBusiness", risk="High")
    pa, a = _pairs(feats, OCT)
    pb, b = _pairs(feats, NOV)
    for c in BOOL_COLUMNS:
        diff = sum(x[c] != y[c] for x, y in zip(a, b))
        assert diff / len(a) <= 0.05, c
    assert any(x[c] != y[c] for x, y in zip(a, b) for c in BOOL_COLUMNS)
    for p, x, y in zip(pb, a, b):
        if p["risk"] == "REVIEW":
            assert y["KYC_STATUS"] in ("Pending", "Under Review")
            assert y["AML_STATUS"] in ("Pending", "Under Review")
            assert (x["KYC_STATUS"], x["AML_STATUS"]) == (y["KYC_STATUS"], y["AML_STATUS"])


def test_enrollment_problems_flags_violations():
    ts = OCT
    p_clean = build_profile(make_feature(ACCOUNT_ID="001am00000AAAA0001"), ts)
    p_rev = build_profile(make_feature(ACCOUNT_ID="001am00000AAAA0002", PEP_HIT=True), ts)
    good = [enrollment_row(p_clean, ts), enrollment_row(p_rev, ts)]
    assert enrollment_problems(good, [p_clean, p_rev]) == []

    def bad(row, prof, **chg):
        r = dict(row, **chg)
        out = enrollment_problems([r], [prof])
        assert out, chg
        assert any(r["ACCOUNTID"] in s for s in out)

    c = good[0]
    bad(c, p_clean, ONLINE_ENROLLED=False, MOBILE_ENROLLED=False, MFA_STATUS=True)
    bad(good[1], p_rev, KYC_STATUS="Current")
    bad(good[1], p_rev, AML_STATUS="Cleared")
    bad(c, p_clean, KYC_STATUS="Pending")
    bad(c, p_clean, AML_STATUS="Under Review")
    bad(c, p_clean, SAVINGS_RATE=0.9)
    bad(c, p_clean, WIRE_ENABLED=None)
    bad(c, p_clean, KYC_STATUS="Bogus")
    bad(c, p_clean, ACCOUNTID="003am00000AAAA0001")


def _month(i):
    y, m = divmod(9 + i, 12)  # i=0 -> 2026-10
    return datetime(2026 + y, m + 1, 4, 5, 0)


def _book():
    return (_features() + _features(kind="BUSINESS", category="SmallBusiness")
            + _features(kind="BUSINESS", category="Household", n=500) + _features(category="WealthManagement", n=500))


def _trajectories(feats, months):
    profs = [build_profile(f, _month(0)) for f in feats]
    return [[enrollment_row(p, _month(i)) for p in profs] for i in range(months)]


def _assert_no_reverts(traj):
    for j in range(len(traj[0])):
        for c in BOOL_COLUMNS:
            seq = [traj[i][j][c] for i in range(len(traj))]
            changes = sum(a != b for a, b in zip(seq, seq[1:]))
            assert changes <= 1, (traj[0][j]["ACCOUNTID"], c, seq)


def test_enrollment_drift_never_reverts_3_months():
    _assert_no_reverts(_trajectories(_book(), 3))


def test_enrollment_drift_never_reverts_12_months():
    traj = _trajectories(_book(), 12)
    _assert_no_reverts(traj)
    # drift still happens over a year
    assert any(traj[0][j][c] != traj[-1][j][c] for j in range(len(traj[0])) for c in BOOL_COLUMNS)


def test_enrollment_month_over_month_changed_share_small():
    traj = _trajectories(_book(), 12)
    n = len(traj[0])
    for a, b in zip(traj, traj[1:]):
        changed = sum(any(x[c] != y[c] for c in BOOL_COLUMNS) for x, y in zip(a, b))
        assert changed / n <= 0.02


def test_enrollment_mfa_implies_digital_every_month():
    for month in _trajectories(_book(), 12):
        assert not [r for r in month if r["MFA_STATUS"] and not (r["ONLINE_ENROLLED"] or r["MOBILE_ENROLLED"])]


def test_no_wire_for_young_retail_persons():
    for i in range(12):
        _, rows = _pairs(_features(age=21, balance=50000.0), _month(i))
        assert not any(r["WIRE_ENABLED"] for r in rows)
    # wealth or high-balance young persons may still wire
    _, wm = _pairs(_features(age=21, category="WealthManagement", balance=50000.0))
    _, rich = _pairs(_features(age=21, balance=400000.0))
    assert any(r["WIRE_ENABLED"] for r in wm) and any(r["WIRE_ENABLED"] for r in rich)


def test_enrollment_problems_young_wire():
    p = build_profile(make_feature(ACCOUNT_ID="001am00000YOUNG001", BIRTHDATE=date(2004, 5, 1),
                                   TOTAL_BALANCE=20000.0, AVG_BALANCE=20000.0), OCT)
    r = enrollment_row(p, OCT)
    assert r["WIRE_ENABLED"] is False and enrollment_problems([r], [p]) == []
    out = enrollment_problems([dict(r, WIRE_ENABLED=True)], [p])
    assert any("001am00000YOUNG001" in s and "WIRE" in s for s in out)


def test_enrollment_problems_retail_wire_cap():
    profs, rows = _pairs(_features(age=40, balance=20000.0, n=1200))
    assert enrollment_problems(rows, profs) == []
    bad = [dict(r, WIRE_ENABLED=(i % 10 == 0)) for i, r in enumerate(rows)]  # 10% of Retail persons
    assert any("Retail" in s and "wire" in s.lower() for s in enrollment_problems(bad, profs))


def test_rich_retail_book_stays_under_wire_cap():
    for ts in (_month(0), _month(11)):
        profs, rows = _pairs(_features(age=40, balance=400000.0, n=1500), ts)
        assert sum(r["WIRE_ENABLED"] for r in rows) / len(rows) <= 0.06
        assert enrollment_problems(rows, profs) == []
