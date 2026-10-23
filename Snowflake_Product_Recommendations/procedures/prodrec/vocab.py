"""Column orders (DESCRIBE TABLE, 2026-10-23) and categorical vocabularies (spec Appendix A)."""
from __future__ import annotations

import random

BUSINESS_SUBSET_COLUMNS: tuple[str, ...] = (
    "ACCOUNTID", "INDUSTRY", "EXISTING_PRODUCT_COUNT", "PROFIT_MARGIN_PCT", "ANNUAL_REVENUE",
    "YEARS_IN_BUSINESS", "NUMBER_OF_EMPLOYEES", "OPERATING_ACCOUNT_BALANCE",
    "MONTHLY_AVG_DEPOSITS", "NET_MONTHLY_CASH_FLOW", "YEARS_AS_CUSTOMER",
    "CASH_FLOW_VOLATILITY", "NUMBER_OF_LOCATIONS",
    # Added 2026-10-23 after the retrained model's top contributors (migrations/001_*.sql).
    "HAS_BUSINESS_SAVINGS", "REVENUE_GROWTH_YOY_PCT", "DEBT_SERVICE_COVERAGE_RATIO",
    "PAYROLL_BURDEN_PCT", "BUSINESS_STRUCTURE", "AVG_RECEIVABLES_DAYS", "HAS_BUSINESS_CREDIT_CARD",
    "ACH_TRANSACTIONS_PER_EMPLOYEE", "HAS_LINE_OF_CREDIT", "MONTHLY_WIRE_TRANSFER_COUNT",
    "HAS_MERCHANT_SERVICES",
)
BUSINESS_TRAINING_COLUMNS: tuple[str, ...] = (
    "ACCOUNTID", "INDUSTRY", "BUSINESS_STRUCTURE", "ANNUAL_REVENUE", "NUMBER_OF_EMPLOYEES",
    "YEARS_IN_BUSINESS", "MONTHLY_AVG_DEPOSITS", "NET_MONTHLY_CASH_FLOW",
    "OPERATING_ACCOUNT_BALANCE", "CASH_FLOW_VOLATILITY", "NUMBER_OF_LOCATIONS",
    "INTERNATIONAL_OPERATIONS", "BUSINESS_CREDIT_SCORE", "DEBT_TO_REVENUE_RATIO",
    "PAYROLL_BURDEN_PCT", "HAS_BUSINESS_CHECKING", "HAS_BUSINESS_SAVINGS",
    "HAS_BUSINESS_CREDIT_CARD", "HAS_BUSINESS_LOAN", "HAS_LINE_OF_CREDIT",
    "HAS_MERCHANT_SERVICES", "EXISTING_PRODUCT_COUNT", "YEARS_AS_CUSTOMER",
    "DIGITAL_BANKING_USAGE", "REVENUE_GROWTH_YOY_PCT", "PROFIT_MARGIN_PCT", "SEASONAL_BUSINESS",
    "AVG_RECEIVABLES_DAYS", "DEBT_SERVICE_COVERAGE_RATIO", "MONTHLY_WIRE_TRANSFER_COUNT",
    "ACH_TRANSACTIONS_PER_EMPLOYEE", "RECOMMENDED_PRODUCT",
)
PERSONAL_SUBSET_COLUMNS: tuple[str, ...] = (
    "ACCOUNTID", "ANNUAL_INCOME", "EXISTING_PRODUCT_COUNT", "TOTAL_ACCOUNT_BALANCE",
    "CREDIT_SCORE", "AGE", "DEBT_TO_INCOME_RATIO", "RISK_TOLERANCE", "EMPLOYMENT_STATUS",
    "HOME_OWNERSHIP", "MONTHLY_DEPOSIT_AMOUNT", "SAVINGS_RATE_PCT", "EDUCATION_LEVEL",
    # Added 2026-10-23 after the retrained model's top contributors (migrations/002_*.sql).
    "HAS_MORTGAGE", "HAS_AUTO_LOAN", "HAS_CREDIT_CARD", "HAS_SAVINGS", "GEOGRAPHIC_REGION",
    "AVG_TRANSACTION_AMOUNT", "MONTHS_SINCE_LAST_PRODUCT", "RECENT_LIFE_EVENT",
    "DIGITAL_BANKING_LOGINS_MONTHLY", "CUSTOMER_SATISFACTION_SCORE", "MONTHLY_TRANSACTION_COUNT",
    "YEARS_AS_CUSTOMER",
    # The retrained model also requires these at inference (migrations/003_*.sql).
    "BRANCH_VISITS_MONTHLY", "HAS_INVESTMENT_ACCOUNT", "YEARS_AT_CURRENT_JOB",
    "NUMBER_OF_DEPENDENTS", "OVERDRAFT_COUNT_12M", "MARITAL_STATUS",
)
PERSONAL_TRAINING_COLUMNS: tuple[str, ...] = (
    "ACCOUNTID", "AGE", "EDUCATION_LEVEL", "ANNUAL_INCOME", "CREDIT_SCORE", "EMPLOYMENT_STATUS",
    "YEARS_AT_CURRENT_JOB", "MARITAL_STATUS", "NUMBER_OF_DEPENDENTS", "HOME_OWNERSHIP",
    "GEOGRAPHIC_REGION", "TOTAL_ACCOUNT_BALANCE", "MONTHLY_TRANSACTION_COUNT",
    "AVG_TRANSACTION_AMOUNT", "MONTHLY_DEPOSIT_AMOUNT", "DEBT_TO_INCOME_RATIO", "HAS_CHECKING",
    "HAS_SAVINGS", "HAS_INVESTMENT_ACCOUNT", "HAS_MORTGAGE", "HAS_AUTO_LOAN", "HAS_CREDIT_CARD",
    "EXISTING_PRODUCT_COUNT", "YEARS_AS_CUSTOMER", "DIGITAL_BANKING_LOGINS_MONTHLY",
    "BRANCH_VISITS_MONTHLY", "MOBILE_APP_ACTIVE", "RISK_TOLERANCE", "RECENT_LIFE_EVENT",
    "MONTHS_SINCE_LAST_PRODUCT", "CUSTOMER_SATISFACTION_SCORE", "OVERDRAFT_COUNT_12M",
    "SAVINGS_RATE_PCT", "RECOMMENDED_PRODUCT",
)

# --- Business categoricals (3,500-row training profile) ---------------------
INDUSTRY_WEIGHTS: dict[str, int] = {
    "Technology": 422, "Retail": 376, "Healthcare": 337, "Professional_Services": 337,
    "Manufacturing": 302, "Construction": 292, "Food_Beverage": 259, "Real_Estate": 209,
    "Financial_Services": 196, "Transportation": 176, "Energy": 157, "Hospitality": 154,
    "Education": 145, "Agriculture": 138,
}
INDUSTRIES: tuple[str, ...] = tuple(INDUSTRY_WEIGHTS)

BUSINESS_STRUCTURE_WEIGHTS: dict[str, int] = {
    "LLC": 1102, "S_Corp": 676, "Sole_Proprietorship": 526, "C_Corp": 505,
    "Partnership": 417, "Nonprofit": 274,
}
CASH_FLOW_VOLATILITY_WEIGHTS: dict[str, int] = {"High": 1757, "Medium": 1105, "Low": 638}
DIGITAL_BANKING_USAGE_WEIGHTS: dict[str, int] = {"Medium": 1611, "High": 1199, "Low": 690}
BUSINESS_RECOMMENDED_PRODUCT_WEIGHTS: dict[str, int] = {
    "Credit_Cards": 853, "Line_of_Credit": 827, "Savings": 555, "Deposits": 313,
    "Commercial_Loans": 271, "Merchant_Services": 255, "Money_Market": 200, "CDs": 101,
    "Business_Banking_Services": 79, "Brokerage_Advisory": 30, "Treasury_Services": 9,
    "Wealth_Management": 7,
}
BUSINESS_PRODUCTS: tuple[str, ...] = tuple(BUSINESS_RECOMMENDED_PRODUCT_WEIGHTS)

# --- Personal categoricals (7,500-row training profile) ---------------------
EDUCATION_LEVEL_WEIGHTS: dict[str, int] = {
    "Bachelors": 2579, "High_School": 1885, "Masters": 1383, "Associates": 1113,
    "Doctorate": 540,
}
EMPLOYMENT_STATUS_WEIGHTS: dict[str, int] = {
    "Employed_FT": 3888, "Self_Employed": 956, "Retired": 813, "Unemployed": 707,
    "Student": 660, "Employed_PT": 476,
}
MARITAL_STATUS_WEIGHTS: dict[str, int] = {
    "Married": 3634, "Single": 1817, "Divorced": 1516, "Widowed": 533,
}
HOME_OWNERSHIP_WEIGHTS: dict[str, int] = {"Rent": 3778, "Mortgage": 2618, "Own": 1104}
GEOGRAPHIC_REGION_WEIGHTS: dict[str, int] = {
    "Southeast": 1513, "Midwest": 1351, "Northeast": 1341, "West": 1291,
    "Southwest": 1072, "Mid_Atlantic": 932,
}
RISK_TOLERANCE_WEIGHTS: dict[str, int] = {"Moderate": 3355, "Conservative": 2221, "Aggressive": 1924}
RECENT_LIFE_EVENT_WEIGHTS: dict[str, int] = {
    "None": 3762, "New_Home": 759, "Retirement_Planning": 759, "Marriage": 620,
    "College_Planning": 593, "Job_Change": 514, "New_Baby": 493,
}
PERSONAL_RECOMMENDED_PRODUCT_WEIGHTS: dict[str, int] = {
    "Savings": 1895, "Personal_Loans": 1672, "Auto_Loans": 1268, "Credit_Cards": 795,
    "Deposits": 458, "Money_Market": 438, "CDs": 378, "Brokerage_Advisory": 259,
    "Residential_Loans": 160, "HELOC": 158, "Wealth_Management": 19,
}
PERSONAL_PRODUCTS: tuple[str, ...] = tuple(PERSONAL_RECOMMENDED_PRODUCT_WEIGHTS)

# --- Industry crosswalk (anchor label -> 14 training codes) -----------------
INDUSTRY_CROSSWALK: dict[str, str] = {
    # live anchor labels (probed 2026-10-23)
    "Restaurant": "Food_Beverage",
    "Retail Trade": "Retail",
    "Construction": "Construction",
    "Professional Services": "Professional_Services",
    "Healthcare": "Healthcare",
    "Wholesale": "Retail",
    "Real Estate": "Real_Estate",
    "Manufacturing": "Manufacturing",
    "Logistics": "Transportation",
    "Healthcare Systems": "Healthcare",
    "Professional Services Mid-Market": "Professional_Services",
    "Real Estate Holdings": "Real_Estate",
    "Wholesale Distribution": "Retail",
    "Hospitality": "Hospitality",
    "Technology": "Technology",
    "Financial Services": "Financial_Services",
    "Healthcare & Life Sciences": "Healthcare",
    "Communications": "Technology",
    "Retail": "Retail",
    "Insurance": "Financial_Services",
    "Banking": "Financial_Services",
    "Consulting": "Professional_Services",
    "Energy": "Energy",
    "Finance": "Financial_Services",
    "Transportation": "Transportation",
    "Education": "Education",
    # extras: plausible variants and the training codes themselves
    "Agriculture": "Agriculture",
    "Food & Beverage": "Food_Beverage",
    "Food and Beverage": "Food_Beverage",
    "Professional_Services": "Professional_Services",
    "Real_Estate": "Real_Estate",
    "Financial_Services": "Financial_Services",
    "Food_Beverage": "Food_Beverage",
    "Utilities": "Energy",
    "Telecommunications": "Technology",
    "Software": "Technology",
}
_voc_CROSSWALK_LOWER: dict[str, str] = {k.lower(): v for k, v in INDUSTRY_CROSSWALK.items()}

# --- State -> region ---------------------------------------------------------
_voc_REGION_STATES: dict[str, str] = {
    "Northeast": "CT ME MA NH RI VT",
    "Mid_Atlantic": "DE DC MD NJ NY PA VA WV",
    "Southeast": "AL AR FL GA KY LA MS NC SC TN",
    "Midwest": "IA IL IN KS MI MN MO ND NE OH SD WI",
    "Southwest": "AZ NM OK TX",
    "West": "AK CA CO HI ID MT NV OR UT WA WY",
}
REGION_BY_STATE: dict[str, str] = {
    st: region for region, states in _voc_REGION_STATES.items() for st in states.split()
}


def _voc_weighted_pick(weights: dict[str, int], rng: random.Random) -> str:
    return rng.choices(list(weights), weights=list(weights.values()), k=1)[0]


def map_industry(label: str | None, rng: random.Random) -> str:
    """Map an anchor industry label to one of the 14 codes; unknown/blank -> weighted pick."""
    if label is not None:
        hit = _voc_CROSSWALK_LOWER.get(str(label).strip().lower())
        if hit:
            return hit
    return _voc_weighted_pick(INDUSTRY_WEIGHTS, rng)


def map_region(state: str | None, rng: random.Random) -> str:
    """Map a 2-letter state code to a region; unknown/blank -> weighted pick."""
    if state is not None:
        hit = REGION_BY_STATE.get(str(state).strip().upper())
        if hit:
            return hit
    return _voc_weighted_pick(GEOGRAPHIC_REGION_WEIGHTS, rng)
