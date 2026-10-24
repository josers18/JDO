from datetime import date, datetime

import pytest

from attrcsat.profile import build_profile
from tests.conftest import FEED_KEYS, make_feature

RUN_TS = datetime(2026, 10, 2, 5, 0, 0)

KEYS = {
    "account_id", "kind", "client_category", "age", "income", "credit_score", "tenure_months",
    "n_products", "has_direct_deposit", "has_promo", "total_balance", "avg_balance",
    "pct_balance_drop", "monthly_txn", "savings_rate", "monthly_calls", "days_since_interaction",
    "complaints", "escalations", "nps_category", "cross_sell", "risk", "digital_affinity", "grounded",
}


def test_profile_keys_and_types(feature_rows):
    for row in feature_rows:
        p = build_profile(row, RUN_TS)
        assert set(p) == KEYS
        assert all(v is not None for v in p.values()), (row["ACCOUNT_ID"], p)
        assert isinstance(p["age"], int) and isinstance(p["tenure_months"], int)
        assert isinstance(p["n_products"], int) and isinstance(p["complaints"], int)
        assert isinstance(p["has_direct_deposit"], bool) and isinstance(p["grounded"], bool)
        assert p["kind"] in ("PERSON", "BUSINESS", "HOUSEHOLD")
        assert p["risk"] in ("REVIEW", "WATCH", "CLEAN")
        assert p["nps_category"] in ("Promoter", "Passive", "Detractor")


def test_profile_feedless_account_is_complete():
    row = make_feature(**{k: None for k in FEED_KEYS}, CALLS=None, GONG_WEEKS=None, LAST_CALL_DATE=None,
                       NPS_SCORE=None, NPS_DESCRIPTION=None, RISK_RATING=None, SANCTIONS_HIT=None,
                       PEP_HIT=None, ADVERSE_MEDIA_HIT=None, DETRACTOR_12M=None, NEG_WEEKS=None,
                       VNEG_WEEKS=None)
    p = build_profile(row, RUN_TS)
    assert set(p) == KEYS
    assert all(v is not None for v in p.values())
    assert p["grounded"] is False
    assert p["n_products"] >= 1
    assert p["risk"] == "CLEAN"


def test_profile_kind():
    assert build_profile(make_feature(ACCOUNT_TYPE_FLAG="BUSINESS", CLIENT_CATEGORY="Household"), RUN_TS)["kind"] == "HOUSEHOLD"
    assert build_profile(make_feature(ACCOUNT_TYPE_FLAG="BUSINESS", CLIENT_CATEGORY="SmallBusiness"), RUN_TS)["kind"] == "BUSINESS"
    assert build_profile(make_feature(), RUN_TS)["kind"] == "PERSON"


@pytest.mark.parametrize("desc,expected", [("Promoter", "Promoter"), ("Passives", "Passive"), ("Detractor", "Detractor")])
def test_profile_nps_category_from_description(desc, expected):
    assert build_profile(make_feature(NPS_DESCRIPTION=desc, NPS_SCORE=None), RUN_TS)["nps_category"] == expected


@pytest.mark.parametrize("score,expected", [(10, "Promoter"), (9, "Promoter"), (8, "Passive"), (7, "Passive"), (6, "Detractor"), (0, "Detractor")])
def test_profile_nps_category_from_score(score, expected):
    assert build_profile(make_feature(NPS_DESCRIPTION=None, NPS_SCORE=score), RUN_TS)["nps_category"] == expected


def test_profile_nps_category_seeded_when_missing():
    row = make_feature(NPS_DESCRIPTION=None, NPS_SCORE=None)
    a = build_profile(row, RUN_TS)["nps_category"]
    assert a in ("Promoter", "Passive", "Detractor")
    assert a == build_profile(row, datetime(2026, 11, 2))["nps_category"]


def test_profile_risk():
    for hit in ("SANCTIONS_HIT", "PEP_HIT", "ADVERSE_MEDIA_HIT"):
        assert build_profile(make_feature(**{hit: True}), RUN_TS)["risk"] == "REVIEW"
    assert build_profile(make_feature(RISK_RATING="High"), RUN_TS)["risk"] == "REVIEW"
    assert build_profile(make_feature(RISK_RATING="Severe"), RUN_TS)["risk"] == "REVIEW"
    assert build_profile(make_feature(RISK_RATING="Medium"), RUN_TS)["risk"] == "WATCH"
    assert build_profile(make_feature(RISK_RATING="Low"), RUN_TS)["risk"] == "CLEAN"


def test_profile_balance_drop():
    p = build_profile(make_feature(EARLY_AVG_BALANCE=100000, LATE_AVG_BALANCE=60000), RUN_TS)
    assert p["pct_balance_drop"] == pytest.approx(0.4)
    p = build_profile(make_feature(EARLY_AVG_BALANCE=60000, LATE_AVG_BALANCE=100000), RUN_TS)
    assert p["pct_balance_drop"] == 0.0


def test_profile_cross_sell_tracks_holdings():
    low = build_profile(make_feature(N_PRODUCTS=1, N_DEPOSIT=1, N_LOAN=0, N_INVESTMENT=0, N_LINE=0), RUN_TS)
    high = build_profile(make_feature(N_PRODUCTS=4, N_DEPOSIT=1, N_LOAN=1, N_INVESTMENT=1, N_LINE=1), RUN_TS)
    assert high["cross_sell"] > low["cross_sell"]
    assert 0 <= low["cross_sell"] <= 1 and 0 <= high["cross_sell"] <= 1


def test_profile_digital_affinity_by_age():
    young = build_profile(make_feature(BIRTHDATE=date(2001, 5, 15)), RUN_TS)
    old = build_profile(make_feature(BIRTHDATE=date(1951, 5, 15)), RUN_TS)
    assert young["age"] == 25 and old["age"] == 75
    assert young["digital_affinity"] > old["digital_affinity"]
    biz = build_profile(make_feature(ACCOUNT_TYPE_FLAG="BUSINESS", CLIENT_CATEGORY="SmallBusiness"), RUN_TS)
    hh = build_profile(make_feature(ACCOUNT_TYPE_FLAG="BUSINESS", CLIENT_CATEGORY="Household"), RUN_TS)
    assert biz["digital_affinity"] > hh["digital_affinity"]


def test_profile_deterministic(feature_rows):
    for row in feature_rows[:20]:
        assert build_profile(row, RUN_TS) == build_profile(dict(row), RUN_TS)


def test_profile_complaints_counts_detractors():
    p = build_profile(make_feature(DETRACTOR_12M=3, NEG_WEEKS=8), RUN_TS)
    assert p["complaints"] == 5


def test_profile_savings_without_debits_uses_seeded_rate():
    p = build_profile(make_feature(CREDITS=5000.0, DEBITS=None), RUN_TS)
    assert 0.02 <= p["savings_rate"] <= 0.12


def test_profile_snowflake_typed_values():
    from decimal import Decimal
    row = make_feature(
        ANNUAL_INCOME=Decimal("125000.50"), CREDIT_SCORE=Decimal("701"), N_PRODUCTS=Decimal("3"),
        N_DEPOSIT=Decimal("1"), N_LOAN=Decimal("1"), N_INVESTMENT=Decimal("0"), N_LINE=Decimal("1"),
        DD_AMOUNT=Decimal("0"), BONUS_AMOUNT=Decimal("12.5"), TOTAL_BALANCE=Decimal("1000.25"),
        AVG_BALANCE=Decimal("900.10"), EARLY_AVG_BALANCE=Decimal("1000"), LATE_AVG_BALANCE=Decimal("800"),
        CREDITS=Decimal("0"), DEBITS=Decimal("10"), ADB_TXN=Decimal("40"), ADB_DAYS=Decimal("0"),
        FT_TXN=Decimal("9"), CALLS=Decimal("5"), GONG_WEEKS=Decimal("0"),
        FIRST_OPEN_DATE=datetime(2019, 4, 2, 10, 0), LAST_CALL_DATE=datetime(2026, 9, 20, 8, 30),
        DETRACTOR_12M=Decimal("2"), NEG_WEEKS=Decimal("4"), VNEG_WEEKS=Decimal("1"),
    )
    p = build_profile(row, RUN_TS)
    assert set(p) == KEYS and all(v is not None for v in p.values())
    assert p["complaints"] == 3 and p["escalations"] == 1


@pytest.mark.parametrize("flag,category,expected", [
    ("BUSINESS", "Retail", "PERSON"),
    ("BUSINESS", "WealthManagement", "PERSON"),
    ("BUSINESS", "Gold", "PERSON"),
    ("BUSINESS", "Silver", "PERSON"),
    ("BUSINESS", "Bronze", "PERSON"),
    ("BUSINESS", "Platinum", "PERSON"),
    ("PERSON", "SmallBusiness", "BUSINESS"),
    ("PERSON", "CommercialBanking", "BUSINESS"),
    ("PERSON", "Household", "HOUSEHOLD"),
    ("BUSINESS", " household ", "HOUSEHOLD"),
    ("PERSON", "SomethingNew", "PERSON"),
    ("BUSINESS", "SomethingNew", "BUSINESS"),
    ("PERSON", None, "PERSON"),
    ("BUSINESS", "", "BUSINESS"),
])
def test_profile_kind_from_category_first(flag, category, expected):
    p = build_profile(make_feature(ACCOUNT_TYPE_FLAG=flag, CLIENT_CATEGORY=category), RUN_TS)
    assert p["kind"] == expected


def test_profile_person_without_birthdate_gets_seeded_age():
    ages = []
    for i in range(300):
        row = make_feature(ACCOUNT_ID=f"001am{i:013d}", ACCOUNT_TYPE_FLAG="BUSINESS", CLIENT_CATEGORY="Retail",
                           BIRTHDATE=None)
        p = build_profile(row, RUN_TS)
        assert p["kind"] == "PERSON"
        assert 25 <= p["age"] <= 78
        assert p["age"] == build_profile(dict(row), datetime(2026, 11, 2))["age"]
        ages.append(p["age"])
    assert len(set(ages)) > 20


def test_profile_canonicalizes_spaced_live_categories():
    # Live V_ACCOUNT_ANCHORS spells categories with spaces; downstream code keys on the compact form.
    wm = build_profile(make_feature(ACCOUNT_TYPE_FLAG="PERSON", CLIENT_CATEGORY="Wealth Management"), RUN_TS)
    assert (wm["kind"], wm["client_category"]) == ("PERSON", "WealthManagement")
    sb = build_profile(make_feature(ACCOUNT_TYPE_FLAG="BUSINESS", CLIENT_CATEGORY="Small Business"), RUN_TS)
    assert (sb["kind"], sb["client_category"]) == ("BUSINESS", "SmallBusiness")
    cb = build_profile(make_feature(ACCOUNT_TYPE_FLAG="BUSINESS", CLIENT_CATEGORY=" Commercial Banking "), RUN_TS)
    assert (cb["kind"], cb["client_category"]) == ("BUSINESS", "CommercialBanking")
