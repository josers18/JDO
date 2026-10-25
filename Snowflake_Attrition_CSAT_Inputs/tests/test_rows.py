from datetime import date, datetime

from attrcsat.attrition import attrition_row
from attrcsat.checks import cross_table_problems, row_problems
from attrcsat.csat import csat_row
from attrcsat.enrollments import enrollment_row
from attrcsat.profile import build_profile
from tests.conftest import make_feature

RUN_TS = datetime(2026, 10, 23)


def _triple(feature):
    p = build_profile(feature, RUN_TS)
    e = enrollment_row(p, RUN_TS)
    return p, attrition_row(p, e), csat_row(p, e), e


def _assert_clean(p, a, c, e):
    assert row_problems("ATTRITION", a) == []
    assert row_problems("CSAT", c) == []
    assert row_problems("ENROLLMENTS", e) == []


def test_rows_columns_vocab_ranges(feature_rows):
    for f in feature_rows:
        _assert_clean(*_triple(f))


def test_rows_feedless_complete():
    base = dict(N_PRODUCTS=None, TOTAL_BALANCE=None, AVG_BALANCE=None, ADB_TXN=None, FIRST_OPEN_DATE=None,
                DD_AMOUNT=None, BONUS_AMOUNT=None)
    for kw in (dict(), dict(ACCOUNT_TYPE_FLAG="BUSINESS", CLIENT_CATEGORY="SmallBusiness", ANNUAL_REVENUE=5e5,
                            BIRTHDATE=None, CREDIT_SCORE=None, ANNUAL_INCOME=None),
               dict(ACCOUNT_TYPE_FLAG="BUSINESS", CLIENT_CATEGORY="Household", BIRTHDATE=None,
                    CREDIT_SCORE=None)):
        _assert_clean(*_triple(make_feature(**base, **kw)))


def test_rows_extreme_inputs_clamped():
    f = make_feature(ANNUAL_INCOME=9e9, CREDIT_SCORE=400, FIRST_OPEN_DATE=date(1980, 1, 1),
                     BIRTHDATE=date(2015, 1, 1), AVG_BALANCE=5e7, CALLS=500, GONG_WEEKS=1)
    _assert_clean(*_triple(f))


def test_banking_flags_match_enrollment(feature_rows):
    for f in feature_rows:
        _, a, _, e = _triple(f)
        assert (a["ONLINE_BANKING_C"] == "Yes") == e["ONLINE_ENROLLED"]
        assert (a["MOBILE_BANKING_C"] == "Yes") == e["MOBILE_ENROLLED"]


def test_cross_sell_agrees(feature_rows):
    for f in feature_rows:
        _, a, c, e = _triple(f)
        enr = (e["CROSS_SELL_SCORE"] - 1) / 9
        assert abs((a["CROSS_SELL_SCORE_C"] - 1) / 6 - enr) <= 0.17
        assert abs(c["CROSS_SELL_SCORE"] / 100 - enr) <= 0.12


def test_attrition_semantics(feature_rows):
    for f in feature_rows:
        p, a, _, _ = _triple(f)
        assert a["UNIQUEID"] == p["account_id"]
        assert a["CHURNED_C"] == "No"
        assert a["NPS_SCORE_C"] == p["nps_category"]
        assert (a["SINGLE_PRODUCT_CUSTOMER_C"] == "Yes") == (p["n_products"] == 1)
        assert (a["DIRECT_DEPOSIT_C"] == "Yes") == bool(p["has_direct_deposit"])
        assert (a["PROMOTIONAL_PRODUCT_C"] == "Yes") == bool(p["has_promo"])


def test_csat_segment_mapping():
    cases = [("PERSON", "Retail", "Banking"), ("PERSON", "WealthManagement", "Wealth Management"),
             ("PERSON", "Gold", "Wealth Management"), ("PERSON", "Platinum", "Wealth Management"),
             ("PERSON", "Other", "Banking"), ("BUSINESS", "CommercialBanking", "Corporate"),
             ("BUSINESS", "SmallBusiness", "Commercial"), ("HOUSEHOLD", "Household", "Banking")]
    for kind, cat, want in cases:
        p = {**build_profile(make_feature(), RUN_TS), "kind": kind, "client_category": cat}
        e = enrollment_row(p, RUN_TS)
        assert csat_row(p, e)["SEGMENT"] == want, (kind, cat)


def test_customer_segment_mapping():
    cases = [("WealthManagement", 10, "Preferred"), ("Gold", 10, "Preferred"), ("Platinum", 10, "Preferred"),
             ("Retail", 250000, "Preferred"), ("CommercialBanking", 10, "Premium"), ("Silver", 10, "Premium"),
             ("Retail", 75000, "Premium"), ("Retail", 74999, "Regular")]
    for cat, bal, want in cases:
        p = {**build_profile(make_feature(), RUN_TS), "client_category": cat, "total_balance": bal}
        e = enrollment_row(p, RUN_TS)
        assert attrition_row(p, e)["CUSTOMER_SEGMENT_C"] == want, (cat, bal)


def test_cross_table_problems_detects_mismatch(feature_rows):
    trip = [_triple(f) for f in feature_rows]
    att, csat, enr = [t[1] for t in trip], [t[2] for t in trip], [t[3] for t in trip]
    assert cross_table_problems(att, csat, enr) == []
    att[0] = {**att[0], "ONLINE_BANKING_C": "No" if att[0]["ONLINE_BANKING_C"] == "Yes" else "Yes"}
    assert len(cross_table_problems(att, csat, enr)) == 1
