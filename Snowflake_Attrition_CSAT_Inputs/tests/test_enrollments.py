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
