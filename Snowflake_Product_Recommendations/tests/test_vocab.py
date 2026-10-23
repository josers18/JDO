import random

from prodrec import vocab as v

BIZ_SUBSET = "ACCOUNTID, INDUSTRY, EXISTING_PRODUCT_COUNT, PROFIT_MARGIN_PCT, ANNUAL_REVENUE, YEARS_IN_BUSINESS, NUMBER_OF_EMPLOYEES, OPERATING_ACCOUNT_BALANCE, MONTHLY_AVG_DEPOSITS, NET_MONTHLY_CASH_FLOW, YEARS_AS_CUSTOMER, CASH_FLOW_VOLATILITY, NUMBER_OF_LOCATIONS, HAS_BUSINESS_SAVINGS, REVENUE_GROWTH_YOY_PCT, DEBT_SERVICE_COVERAGE_RATIO, PAYROLL_BURDEN_PCT, BUSINESS_STRUCTURE, AVG_RECEIVABLES_DAYS, HAS_BUSINESS_CREDIT_CARD, ACH_TRANSACTIONS_PER_EMPLOYEE, HAS_LINE_OF_CREDIT, MONTHLY_WIRE_TRANSFER_COUNT, HAS_MERCHANT_SERVICES"
BIZ_TRAIN = "ACCOUNTID, INDUSTRY, BUSINESS_STRUCTURE, ANNUAL_REVENUE, NUMBER_OF_EMPLOYEES, YEARS_IN_BUSINESS, MONTHLY_AVG_DEPOSITS, NET_MONTHLY_CASH_FLOW, OPERATING_ACCOUNT_BALANCE, CASH_FLOW_VOLATILITY, NUMBER_OF_LOCATIONS, INTERNATIONAL_OPERATIONS, BUSINESS_CREDIT_SCORE, DEBT_TO_REVENUE_RATIO, PAYROLL_BURDEN_PCT, HAS_BUSINESS_CHECKING, HAS_BUSINESS_SAVINGS, HAS_BUSINESS_CREDIT_CARD, HAS_BUSINESS_LOAN, HAS_LINE_OF_CREDIT, HAS_MERCHANT_SERVICES, EXISTING_PRODUCT_COUNT, YEARS_AS_CUSTOMER, DIGITAL_BANKING_USAGE, REVENUE_GROWTH_YOY_PCT, PROFIT_MARGIN_PCT, SEASONAL_BUSINESS, AVG_RECEIVABLES_DAYS, DEBT_SERVICE_COVERAGE_RATIO, MONTHLY_WIRE_TRANSFER_COUNT, ACH_TRANSACTIONS_PER_EMPLOYEE, RECOMMENDED_PRODUCT"
PER_SUBSET = "ACCOUNTID, ANNUAL_INCOME, EXISTING_PRODUCT_COUNT, TOTAL_ACCOUNT_BALANCE, CREDIT_SCORE, AGE, DEBT_TO_INCOME_RATIO, RISK_TOLERANCE, EMPLOYMENT_STATUS, HOME_OWNERSHIP, MONTHLY_DEPOSIT_AMOUNT, SAVINGS_RATE_PCT, EDUCATION_LEVEL, HAS_MORTGAGE, HAS_AUTO_LOAN, HAS_CREDIT_CARD, HAS_SAVINGS, GEOGRAPHIC_REGION, AVG_TRANSACTION_AMOUNT, MONTHS_SINCE_LAST_PRODUCT, RECENT_LIFE_EVENT, DIGITAL_BANKING_LOGINS_MONTHLY, CUSTOMER_SATISFACTION_SCORE, MONTHLY_TRANSACTION_COUNT, YEARS_AS_CUSTOMER, BRANCH_VISITS_MONTHLY, HAS_INVESTMENT_ACCOUNT, YEARS_AT_CURRENT_JOB, NUMBER_OF_DEPENDENTS, OVERDRAFT_COUNT_12M, MARITAL_STATUS"
PER_TRAIN = "ACCOUNTID, AGE, EDUCATION_LEVEL, ANNUAL_INCOME, CREDIT_SCORE, EMPLOYMENT_STATUS, YEARS_AT_CURRENT_JOB, MARITAL_STATUS, NUMBER_OF_DEPENDENTS, HOME_OWNERSHIP, GEOGRAPHIC_REGION, TOTAL_ACCOUNT_BALANCE, MONTHLY_TRANSACTION_COUNT, AVG_TRANSACTION_AMOUNT, MONTHLY_DEPOSIT_AMOUNT, DEBT_TO_INCOME_RATIO, HAS_CHECKING, HAS_SAVINGS, HAS_INVESTMENT_ACCOUNT, HAS_MORTGAGE, HAS_AUTO_LOAN, HAS_CREDIT_CARD, EXISTING_PRODUCT_COUNT, YEARS_AS_CUSTOMER, DIGITAL_BANKING_LOGINS_MONTHLY, BRANCH_VISITS_MONTHLY, MOBILE_APP_ACTIVE, RISK_TOLERANCE, RECENT_LIFE_EVENT, MONTHS_SINCE_LAST_PRODUCT, CUSTOMER_SATISFACTION_SCORE, OVERDRAFT_COUNT_12M, SAVINGS_RATE_PCT, RECOMMENDED_PRODUCT"

LIVE_LABELS = [
    "Restaurant", "Retail Trade", "Construction", "Professional Services", "Healthcare",
    "Wholesale", "Real Estate", "Manufacturing", "Logistics", "Healthcare Systems",
    "Professional Services Mid-Market", "Real Estate Holdings", "Wholesale Distribution",
    "Hospitality", "Technology", "Financial Services", "Healthcare & Life Sciences",
    "Communications", "Retail", "Insurance", "Banking", "Consulting", "Energy", "Finance",
    "Transportation", "Education",
]


def _cols(s):
    return tuple(c.strip() for c in s.split(","))


def test_columns_match_describe():
    assert v.BUSINESS_SUBSET_COLUMNS == _cols(BIZ_SUBSET)
    assert v.BUSINESS_TRAINING_COLUMNS == _cols(BIZ_TRAIN)
    assert v.PERSONAL_SUBSET_COLUMNS == _cols(PER_SUBSET)
    assert v.PERSONAL_TRAINING_COLUMNS == _cols(PER_TRAIN)
    assert v.BUSINESS_TRAINING_COLUMNS[-1] == "RECOMMENDED_PRODUCT"
    assert v.PERSONAL_TRAINING_COLUMNS[-1] == "RECOMMENDED_PRODUCT"


def test_products_and_weights_consistent():
    assert len(v.BUSINESS_PRODUCTS) == 12 and len(v.PERSONAL_PRODUCTS) == 11
    assert len(v.INDUSTRIES) == 14
    assert set(v.INDUSTRY_WEIGHTS) == set(v.INDUSTRIES)
    assert v.INDUSTRY_WEIGHTS["Technology"] == 422 and v.INDUSTRY_WEIGHTS["Agriculture"] == 138
    assert set(v.BUSINESS_RECOMMENDED_PRODUCT_WEIGHTS) == set(v.BUSINESS_PRODUCTS)
    assert set(v.PERSONAL_RECOMMENDED_PRODUCT_WEIGHTS) == set(v.PERSONAL_PRODUCTS)
    assert sum(v.BUSINESS_RECOMMENDED_PRODUCT_WEIGHTS.values()) == 3500
    assert sum(v.PERSONAL_RECOMMENDED_PRODUCT_WEIGHTS.values()) == 7500
    assert sum(v.INDUSTRY_WEIGHTS.values()) == 3500
    for name in ("BUSINESS_STRUCTURE", "CASH_FLOW_VOLATILITY", "DIGITAL_BANKING_USAGE"):
        assert sum(getattr(v, name + "_WEIGHTS").values()) == 3500
    for name in ("EDUCATION_LEVEL", "EMPLOYMENT_STATUS", "MARITAL_STATUS", "HOME_OWNERSHIP",
                 "GEOGRAPHIC_REGION", "RISK_TOLERANCE", "RECENT_LIFE_EVENT"):
        assert sum(getattr(v, name + "_WEIGHTS").values()) == 7500


def test_crosswalk_covers_live_labels():
    for label in LIVE_LABELS:
        assert label in v.INDUSTRY_CROSSWALK, label
        assert v.INDUSTRY_CROSSWALK[label] in v.INDUSTRIES
    assert set(v.INDUSTRY_CROSSWALK.values()) <= set(v.INDUSTRIES)
    pinned = {
        "Restaurant": "Food_Beverage", "Retail Trade": "Retail", "Wholesale": "Retail",
        "Logistics": "Transportation", "Healthcare Systems": "Healthcare",
        "Banking": "Financial_Services", "Communications": "Technology",
    }
    for k, want in pinned.items():
        assert v.INDUSTRY_CROSSWALK[k] == want
        assert v.map_industry(k, random.Random(1)) == want


def test_unknown_industry_weighted_pick():
    rng = random.Random(42)
    assert v.map_industry("Underwater Basket Weaving", rng) in v.INDUSTRIES
    assert v.map_industry(None, rng) in v.INDUSTRIES
    picks = [v.map_industry(None if i % 2 else "  ", rng) for i in range(2000)]
    assert picks.count("Technology") > picks.count("Agriculture")


def test_region_map():
    regions = {"Northeast", "Mid_Atlantic", "Southeast", "Midwest", "Southwest", "West"}
    assert len(v.REGION_BY_STATE) == 51
    assert "DC" in v.REGION_BY_STATE
    rng = random.Random(3)
    for st in v.REGION_BY_STATE:
        assert v.map_region(st, rng) in regions
    assert v.map_region("ZZ", rng) in regions
    assert v.map_region(None, rng) in regions
    assert v.map_region("tx", rng) == "Southwest"
