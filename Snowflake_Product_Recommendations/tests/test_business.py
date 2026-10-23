from datetime import date, datetime
from statistics import mean

import pytest

from prodrec.business import business_input_row, business_profile
from prodrec.vocab import (
    BUSINESS_STRUCTURE_WEIGHTS, BUSINESS_SUBSET_COLUMNS, BUSINESS_TRAINING_COLUMNS,
    CASH_FLOW_VOLATILITY_WEIGHTS, DIGITAL_BANKING_USAGE_WEIGHTS, INDUSTRIES,
)

T0 = datetime(2026, 10, 23)
FLAGS = ("HAS_BUSINESS_CHECKING", "HAS_BUSINESS_SAVINGS", "HAS_BUSINESS_CREDIT_CARD",
         "HAS_BUSINESS_LOAN", "HAS_LINE_OF_CREDIT", "HAS_MERCHANT_SERVICES")


def anchor(**kw):
    a = {"ACCOUNT_ID": "001am00000TEST1", "INDUSTRY": "Restaurant", "ANNUAL_REVENUE": 2_000_000,
         "EMPLOYEE_COUNT": 20}
    a.update(kw)
    return a


def test_anchor_values_copied_unclamped():
    p = business_profile(anchor(ANNUAL_REVENUE=120_000_000, EMPLOYEE_COUNT=900), {}, T0)
    assert p["ANNUAL_REVENUE"] == 120_000_000 and p["NUMBER_OF_EMPLOYEES"] == 900


def test_null_anchor_still_complete():
    p = business_profile(anchor(ANNUAL_REVENUE=None, EMPLOYEE_COUNT=None, INDUSTRY=None), {}, T0)
    nonneg = [c for c in p if c not in ("NET_MONTHLY_CASH_FLOW", "REVENUE_GROWTH_YOY_PCT",
                                        "PROFIT_MARGIN_PCT")]
    for c in nonneg:
        if isinstance(p[c], (int, float)):
            assert p[c] >= 0, c
    for c in ("ANNUAL_REVENUE", "NUMBER_OF_EMPLOYEES", "MONTHLY_AVG_DEPOSITS",
              "NET_MONTHLY_CASH_FLOW", "OPERATING_ACCOUNT_BALANCE", "PROFIT_MARGIN_PCT"):
        assert p[c] is not None
    assert 50_000 <= p["ANNUAL_REVENUE"] <= 50_000_000


def test_one_null_derives_other():
    p = business_profile(anchor(ANNUAL_REVENUE=None, EMPLOYEE_COUNT=40), {}, T0)
    assert 40 * 150_000 * 0.6 <= p["ANNUAL_REVENUE"] <= 40 * 150_000 * 1.6
    q = business_profile(anchor(ANNUAL_REVENUE=3_000_000, EMPLOYEE_COUNT=None), {}, T0)
    assert 8 <= q["NUMBER_OF_EMPLOYEES"] <= 35


def test_absurd_feed_falls_back():
    rev = 6_000_000
    p = business_profile(anchor(ANNUAL_REVENUE=rev), {"MONTHLY_CREDITS": 100 * rev / 12}, T0)
    assert p["MONTHLY_AVG_DEPOSITS"] != round(100 * rev / 12)
    assert 0.05 * rev / 12 <= p["MONTHLY_AVG_DEPOSITS"] <= 3 * rev / 12
    q = business_profile(anchor(ANNUAL_REVENUE=20_000_000), {"DEPOSIT_BALANCE": 0}, T0)
    assert q["OPERATING_ACCOUNT_BALANCE"] > 0
    r = business_profile(anchor(ANNUAL_REVENUE=6_000_000), {"MONTHLY_NET": 50 * rev / 12}, T0)
    assert abs(r["NET_MONTHLY_CASH_FLOW"]) <= rev / 12


def test_real_feed_used_when_sane():
    feats = {"MONTHLY_CREDITS": 150_000, "DEPOSIT_BALANCE": 400_000, "MONTHLY_NET": 12_000,
             "FOUNDED_YEAR": 2001, "FIRST_OPEN_DATE": "2019-05-01"}
    p = business_profile(anchor(ANNUAL_REVENUE=2_000_000), feats, T0)
    assert p["MONTHLY_AVG_DEPOSITS"] == 150_000
    assert p["OPERATING_ACCOUNT_BALANCE"] == 400_000
    assert p["NET_MONTHLY_CASH_FLOW"] == 12_000
    assert p["YEARS_IN_BUSINESS"] == 25
    assert p["YEARS_AS_CUSTOMER"] == 7
    assert p["HAS_BUSINESS_CHECKING"] == 1
    assert business_profile(anchor(), {"FIRST_OPEN_DATE": date(2019, 5, 1)}, T0)["YEARS_AS_CUSTOMER"] == 7


def test_volatility_from_feed_and_flags_from_holdings():
    base = {"MONTHLY_CREDITS": 100_000, "FEED_MONTHS": 3}
    assert business_profile(anchor(), {**base, "MONTHLY_NET_SD": 5_000}, T0)["CASH_FLOW_VOLATILITY"] == "Low"
    assert business_profile(anchor(), {**base, "MONTHLY_NET_SD": 25_000}, T0)["CASH_FLOW_VOLATILITY"] == "Medium"
    assert business_profile(anchor(), {**base, "MONTHLY_NET_SD": 80_000}, T0)["CASH_FLOW_VOLATILITY"] == "High"
    one = {"MONTHLY_CREDITS": 100_000, "FEED_MONTHS": 1, "MONTHLY_NET_SD": 0}
    assert business_profile(anchor(), one, T0)["CASH_FLOW_VOLATILITY"] in CASH_FLOW_VOLATILITY_WEIGHTS
    p = business_profile(anchor(), {"HAS_LOAN": 1, "HAS_LINE": 1, "HAS_CARD": 1}, T0)
    assert p["HAS_BUSINESS_LOAN"] == p["HAS_LINE_OF_CREDIT"] == p["HAS_BUSINESS_CREDIT_CARD"] == 1


def test_product_count_equals_flags(business_anchors):
    for a in business_anchors:
        p = business_profile(a, {}, T0)
        assert p["EXISTING_PRODUCT_COUNT"] == sum(p[f] for f in FLAGS)


def test_customer_tenure_le_business_age(business_anchors):
    for a in business_anchors:
        p = business_profile(a, {"FIRST_OPEN_DATE": "2001-01-01", "FOUNDED_YEAR": 2020}, T0)
        assert p["YEARS_AS_CUSTOMER"] <= p["YEARS_IN_BUSINESS"]
        q = business_profile(a, {}, T0)
        assert q["YEARS_AS_CUSTOMER"] <= q["YEARS_IN_BUSINESS"]


def test_deposits_scale_with_revenue():
    def avg(rev):
        return mean(business_profile(anchor(ANNUAL_REVENUE=rev), {}, T0, key=f"k#{i}")
                    ["MONTHLY_AVG_DEPOSITS"] for i in range(200))
    assert avg(10_000_000) > 10 * avg(200_000)


def test_idempotent_within_month_bounded_drift(business_anchors):
    cont = ("ANNUAL_REVENUE", "NUMBER_OF_EMPLOYEES", "MONTHLY_AVG_DEPOSITS", "NET_MONTHLY_CASH_FLOW",
            "OPERATING_ACCOUNT_BALANCE", "BUSINESS_CREDIT_SCORE", "DEBT_TO_REVENUE_RATIO",
            "PAYROLL_BURDEN_PCT", "REVENUE_GROWTH_YOY_PCT", "PROFIT_MARGIN_PCT",
            "AVG_RECEIVABLES_DAYS", "DEBT_SERVICE_COVERAGE_RATIO", "MONTHLY_WIRE_TRANSFER_COUNT",
            "ACH_TRANSACTIONS_PER_EMPLOYEE")
    for a in business_anchors:
        a = {**a, "ANNUAL_REVENUE": None, "EMPLOYEE_COUNT": None}  # force generation
        p1 = business_profile(a, {}, datetime(2026, 10, 1))
        p2 = business_profile(a, {}, datetime(2026, 10, 23))
        p3 = business_profile(a, {}, datetime(2026, 11, 1))
        assert p1 == p2
        for c in p1:
            if c in cont:
                assert abs(p3[c] - p1[c]) <= abs(p1[c]) * (1.03 / 0.97 - 1) + 1, c
            else:
                assert p3[c] == p1[c], c


def test_vocab_and_columns(business_anchors):
    for a in business_anchors:
        p = business_profile(a, {}, T0)
        assert tuple(p) == tuple(c for c in BUSINESS_TRAINING_COLUMNS if c != "RECOMMENDED_PRODUCT")
        assert p["ACCOUNTID"] == a["ACCOUNT_ID"]
        assert p["INDUSTRY"] in INDUSTRIES
        assert p["BUSINESS_STRUCTURE"] in BUSINESS_STRUCTURE_WEIGHTS
        assert p["CASH_FLOW_VOLATILITY"] in CASH_FLOW_VOLATILITY_WEIGHTS
        assert p["DIGITAL_BANKING_USAGE"] in DIGITAL_BANKING_USAGE_WEIGHTS
        assert tuple(business_input_row(p)) == BUSINESS_SUBSET_COLUMNS
        assert all(v is not None for v in p.values())


def test_training_key_changes_generated_fields():
    a = anchor(ANNUAL_REVENUE=None, EMPLOYEE_COUNT=None)
    assert business_profile(a, {}, T0) != business_profile(a, {}, T0, key=a["ACCOUNT_ID"] + "#T1")
    assert business_profile(a, {}, T0, key="x#T1")["ACCOUNTID"] == a["ACCOUNT_ID"]
