import random

from prodrec.labels import (
    BASE_SCORE, NOISE, business_scores, draw_label, personal_scores, rule_label,
)
from prodrec.vocab import BUSINESS_PRODUCTS, PERSONAL_PRODUCTS


def _neutral_business(**kw):
    p = {
        "INDUSTRY": "Technology", "ANNUAL_REVENUE": 1_300_000, "NUMBER_OF_EMPLOYEES": 10,
        "YEARS_IN_BUSINESS": 8, "MONTHLY_AVG_DEPOSITS": 90_000, "NET_MONTHLY_CASH_FLOW": 8_000,
        "OPERATING_ACCOUNT_BALANCE": 150_000, "CASH_FLOW_VOLATILITY": "Medium",
        "NUMBER_OF_LOCATIONS": 1, "INTERNATIONAL_OPERATIONS": 0, "HAS_BUSINESS_CHECKING": 1,
        "HAS_BUSINESS_SAVINGS": 1, "HAS_BUSINESS_CREDIT_CARD": 1, "HAS_BUSINESS_LOAN": 0,
        "HAS_LINE_OF_CREDIT": 1, "HAS_MERCHANT_SERVICES": 1, "EXISTING_PRODUCT_COUNT": 4,
        "YEARS_AS_CUSTOMER": 3, "REVENUE_GROWTH_YOY_PCT": 8.0, "PROFIT_MARGIN_PCT": 10.0,
        "SEASONAL_BUSINESS": 0, "DEBT_SERVICE_COVERAGE_RATIO": 1.8,
        "MONTHLY_WIRE_TRANSFER_COUNT": 4,
    }
    p.update(kw)
    return p


def _neutral_personal(**kw):
    p = {
        "AGE": 40, "ANNUAL_INCOME": 55_000, "CREDIT_SCORE": 680, "EMPLOYMENT_STATUS": "Employed_FT",
        "HOME_OWNERSHIP": "Own", "TOTAL_ACCOUNT_BALANCE": 8_000, "DEBT_TO_INCOME_RATIO": 0.25,
        "HAS_CHECKING": 1, "HAS_SAVINGS": 1, "HAS_INVESTMENT_ACCOUNT": 0, "HAS_MORTGAGE": 0,
        "HAS_AUTO_LOAN": 1, "HAS_CREDIT_CARD": 1, "EXISTING_PRODUCT_COUNT": 4,
        "RISK_TOLERANCE": "Moderate", "SAVINGS_RATE_PCT": 8.0,
    }
    p.update(kw)
    return p


def _b(**kw):
    return rule_label(business_scores(_neutral_business(**kw)))


def _p(**kw):
    return rule_label(personal_scores(_neutral_personal(**kw)))


def test_scores_cover_every_class_above_base():
    bs, ps = business_scores(_neutral_business()), personal_scores(_neutral_personal())
    assert tuple(bs) == BUSINESS_PRODUCTS and tuple(ps) == PERSONAL_PRODUCTS
    assert all(v >= BASE_SCORE for v in [*bs.values(), *ps.values()])


def test_rule_label_tie_breaks_by_tuple_order():
    assert rule_label({c: 1.0 for c in BUSINESS_PRODUCTS}) == BUSINESS_PRODUCTS[0]


# --- business rules ---
def test_b_line_of_credit():
    assert _b(CASH_FLOW_VOLATILITY="High", HAS_LINE_OF_CREDIT=0) == "Line_of_Credit"


def test_b_treasury():
    assert _b(ANNUAL_REVENUE=80_000_000, NUMBER_OF_LOCATIONS=6) == "Treasury_Services"


def test_b_merchant():
    assert _b(INDUSTRY="Food_Beverage", HAS_MERCHANT_SERVICES=0) == "Merchant_Services"


def test_b_idle_balance():
    assert _b(ANNUAL_REVENUE=500_000, OPERATING_ACCOUNT_BALANCE=200_000, CASH_FLOW_VOLATILITY="Low") in {"Money_Market", "CDs"}


def test_b_commercial_loans():
    assert _b(INDUSTRY="Construction", REVENUE_GROWTH_YOY_PCT=25.0,
              DEBT_SERVICE_COVERAGE_RATIO=2.5) == "Commercial_Loans"


def test_b_young_thin():
    assert _b(YEARS_IN_BUSINESS=1, EXISTING_PRODUCT_COUNT=1) in {"Credit_Cards", "Business_Banking_Services"}


def test_b_wealth_or_brokerage():
    assert _b(ANNUAL_REVENUE=30_000_000, OPERATING_ACCOUNT_BALANCE=3_000_000,
              YEARS_AS_CUSTOMER=12) in {"Wealth_Management", "Brokerage_Advisory"}


def test_b_savings_or_deposits():
    assert _b(HAS_BUSINESS_SAVINGS=0, NET_MONTHLY_CASH_FLOW=5_000) in {"Savings", "Deposits"}


# --- personal rules ---
def test_p_savings_or_cds():
    assert _p(HOME_OWNERSHIP="Rent", SAVINGS_RATE_PCT=25.0) in {"Savings", "CDs"}


def test_p_heloc():
    assert _p(CREDIT_SCORE=780, HOME_OWNERSHIP="Mortgage", HAS_MORTGAGE=1) == "HELOC"


def test_p_residential():
    assert _p(HOME_OWNERSHIP="Rent", CREDIT_SCORE=760, ANNUAL_INCOME=120_000) == "Residential_Loans"


def test_p_personal_loans():
    assert _p(CREDIT_SCORE=600, DEBT_TO_INCOME_RATIO=0.5) == "Personal_Loans"


def test_p_auto():
    assert _p(AGE=35, EMPLOYMENT_STATUS="Employed_FT", HAS_AUTO_LOAN=0) == "Auto_Loans"


def test_p_brokerage():
    assert _p(RISK_TOLERANCE="Aggressive", TOTAL_ACCOUNT_BALANCE=150_000) == "Brokerage_Advisory"


def test_p_wealth():
    assert _p(ANNUAL_INCOME=600_000, AGE=58) == "Wealth_Management"


def test_p_credit_cards():
    assert _p(AGE=21, EXISTING_PRODUCT_COUNT=1) == "Credit_Cards"


def test_p_money_market_or_deposits():
    assert _p(TOTAL_ACCOUNT_BALANCE=60_000, DEBT_TO_INCOME_RATIO=0.15) in {"Money_Market", "Deposits"}


def test_every_class_reachable():
    biz = {
        "Credit_Cards": dict(YEARS_IN_BUSINESS=1, EXISTING_PRODUCT_COUNT=1, HAS_BUSINESS_CREDIT_CARD=0),
        "Line_of_Credit": dict(CASH_FLOW_VOLATILITY="High", HAS_LINE_OF_CREDIT=0),
        "Savings": dict(HAS_BUSINESS_SAVINGS=0, NET_MONTHLY_CASH_FLOW=5_000),
        "Deposits": dict(CASH_FLOW_VOLATILITY="Low", MONTHLY_AVG_DEPOSITS=200_000),
        "Commercial_Loans": dict(INDUSTRY="Construction", REVENUE_GROWTH_YOY_PCT=25.0,
                                 DEBT_SERVICE_COVERAGE_RATIO=2.5),
        "Merchant_Services": dict(INDUSTRY="Food_Beverage", HAS_MERCHANT_SERVICES=0),
        "Money_Market": dict(ANNUAL_REVENUE=500_000, OPERATING_ACCOUNT_BALANCE=200_000),
        "CDs": dict(ANNUAL_REVENUE=500_000, OPERATING_ACCOUNT_BALANCE=200_000, CASH_FLOW_VOLATILITY="Low"),
        "Business_Banking_Services": dict(YEARS_IN_BUSINESS=1, EXISTING_PRODUCT_COUNT=1,
                                          HAS_BUSINESS_CHECKING=0),
        "Brokerage_Advisory": dict(ANNUAL_REVENUE=5_000_000, OPERATING_ACCOUNT_BALANCE=600_000,
                                   PROFIT_MARGIN_PCT=25.0, YEARS_AS_CUSTOMER=9),
        "Treasury_Services": dict(ANNUAL_REVENUE=80_000_000, NUMBER_OF_LOCATIONS=6),
        "Wealth_Management": dict(ANNUAL_REVENUE=30_000_000, OPERATING_ACCOUNT_BALANCE=3_000_000,
                                  YEARS_AS_CUSTOMER=12),
    }
    assert set(biz) == set(BUSINESS_PRODUCTS)
    for cls, kw in biz.items():
        assert _b(**kw) == cls, cls
    per = {
        "Savings": dict(HOME_OWNERSHIP="Rent", SAVINGS_RATE_PCT=25.0),
        "Personal_Loans": dict(CREDIT_SCORE=600, DEBT_TO_INCOME_RATIO=0.5),
        "Auto_Loans": dict(AGE=35, HAS_AUTO_LOAN=0),
        "Credit_Cards": dict(AGE=21, EXISTING_PRODUCT_COUNT=1),
        "Deposits": dict(HAS_CHECKING=0),
        "Money_Market": dict(TOTAL_ACCOUNT_BALANCE=60_000, DEBT_TO_INCOME_RATIO=0.15),
        "CDs": dict(HOME_OWNERSHIP="Rent", SAVINGS_RATE_PCT=20.0, RISK_TOLERANCE="Conservative",
                    TOTAL_ACCOUNT_BALANCE=30_000),
        "Brokerage_Advisory": dict(RISK_TOLERANCE="Aggressive", TOTAL_ACCOUNT_BALANCE=150_000),
        "Residential_Loans": dict(HOME_OWNERSHIP="Rent", CREDIT_SCORE=760, ANNUAL_INCOME=120_000),
        "HELOC": dict(CREDIT_SCORE=780, HOME_OWNERSHIP="Mortgage", HAS_MORTGAGE=1),
        "Wealth_Management": dict(ANNUAL_INCOME=600_000, AGE=58),
    }
    assert set(per) == set(PERSONAL_PRODUCTS)
    for cls, kw in per.items():
        assert _p(**kw) == cls, cls


def test_draw_label_noise_rate():
    scores = business_scores(_neutral_business())
    rule = rule_label(scores)
    rng = random.Random(7)
    n = 5000
    hits = sum(draw_label(scores, rng, noise=0.2) == rule for _ in range(n))
    assert 0.78 <= hits / n <= 0.86
    assert NOISE == 0.2


def test_draw_label_zero_noise_is_rule():
    scores = personal_scores(_neutral_personal(HOME_OWNERSHIP="Rent", SAVINGS_RATE_PCT=25.0))
    rng = random.Random(1)
    assert {draw_label(scores, rng, noise=0.0) for _ in range(50)} == {rule_label(scores)}
