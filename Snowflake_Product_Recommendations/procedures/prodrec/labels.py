"""Rule-scored product labels (spec 5.5): additive per-class scores, argmax rule label, noisy draw.

Every tunable threshold / weight is a named module-level constant so Task 8 can retune the mix.
Scores lean mainly on the model-input subset variables.
"""
from __future__ import annotations

from prodrec.common import clamp
from prodrec.vocab import BUSINESS_PRODUCTS, PERSONAL_PRODUCTS

BASE_SCORE = 0.05
NOISE = 0.35

# --- Business terms ------------------------------------------------------------------------
_lbl_LOC_HIGH_VOL = 0.95           # High volatility, no line of credit
_lbl_LOC_SEASONAL = 0.3            # seasonal, no line of credit
_lbl_LOC_MED_VOL = 0.15            # Medium volatility, no line of credit
_lbl_TRS_REV_HUGE, _lbl_TRS_REV_HUGE_W = 50_000_000, 1.0
_lbl_TRS_REV_LARGE, _lbl_TRS_REV_LARGE_W = 20_000_000, 0.5
_lbl_TRS_LOCATIONS, _lbl_TRS_LOCATIONS_W = 5, 0.6
_lbl_TRS_WIRES, _lbl_TRS_WIRES_W = 10, 0.2
_lbl_TRS_INTL_W = 0.2
_lbl_MERCHANT_INDUSTRIES = ("Retail", "Food_Beverage", "Hospitality")
_lbl_MERCHANT_W = 1.0
_lbl_IDLE_START, _lbl_IDLE_SPAN, _lbl_IDLE_W = 0.25, 0.25, 0.9   # balance / revenue ramp
_lbl_IDLE_MM_LOW_VOL, _lbl_IDLE_CD_LOW_VOL, _lbl_IDLE_CD_OTHER = 0.9, 1.0, 0.5
_lbl_LOAN_INDUSTRIES = ("Construction", "Manufacturing", "Real_Estate")
_lbl_LOAN_INDUSTRY_W = 0.4
_lbl_LOAN_GROWTH, _lbl_LOAN_GROWTH_W = 15.0, 0.5
_lbl_LOAN_DSCR, _lbl_LOAN_DSCR_W = 1.5, 0.4     # only counts when growth also qualifies
_lbl_YOUNG_YEARS = 3
_lbl_THIN_COUNT = 1
_lbl_CC_YOUNG_W, _lbl_CC_THIN_W, _lbl_CC_NO_CARD_W = 0.5, 0.5, 0.3
_lbl_BBS_YOUNG_W, _lbl_BBS_THIN_W, _lbl_BBS_NO_CHECKING_W = 0.4, 0.5, 0.6
_lbl_WM_REV, _lbl_WM_BAL, _lbl_WM_YEARS = 10_000_000, 1_000_000, 10
_lbl_WM_W = 0.4                                  # per condition
_lbl_BA_BAL, _lbl_BA_BAL_W = 500_000, 0.6
_lbl_BA_MARGIN, _lbl_BA_MARGIN_W = 20.0, 0.4
_lbl_BA_YEARS, _lbl_BA_YEARS_W = 8, 0.2
_lbl_SAV_NO_SAVINGS_POS_FLOW, _lbl_SAV_NO_SAVINGS = 0.9, 0.3
_lbl_DEP_NO_SAVINGS_POS_FLOW = 0.7
_lbl_DEP_LOW_VOL_DEPOSITS, _lbl_DEP_DEPOSIT_RATIO = 0.7, 0.9   # deposits >= ratio * revenue/12

# --- Personal terms ------------------------------------------------------------------------
_lbl_P_SAVE_RATE = 12.0
_lbl_P_SAV_RATE_W, _lbl_P_SAV_RENT_W, _lbl_P_SAV_NO_SAVINGS_W = 0.5, 0.4, 0.3
_lbl_P_CD_RATE_W, _lbl_P_CD_RENT_W, _lbl_P_CD_CONS_W = 0.3, 0.4, 0.3
_lbl_P_CD_CONS_BAL = 20_000
_lbl_P_HELOC_CREDIT, _lbl_P_HELOC_CREDIT_W = 740, 0.5
_lbl_P_HELOC_MORTGAGE_W = 0.4
_lbl_P_EQUITY_AGE, _lbl_P_EQUITY_DTI, _lbl_P_EQUITY_W = 35, 0.35, 0.5   # proxy for property equity
_lbl_P_RES_RENT_W, _lbl_P_RES_CREDIT, _lbl_P_RES_CREDIT_W = 0.4, 720, 0.4
_lbl_P_RES_INCOME, _lbl_P_RES_INCOME_W = 80_000, 0.5
_lbl_P_PL_CREDIT, _lbl_P_PL_CREDIT_W = 670, 0.3
_lbl_P_PL_DTI, _lbl_P_PL_DTI_W, _lbl_P_PL_BOTH_W = 0.33, 0.6, 0.3
_lbl_P_AUTO_NO_LOAN_W = 0.3
_lbl_P_AUTO_AGE, _lbl_P_AUTO_AGE_W = (22, 60), 0.3
_lbl_P_AUTO_EMP_FT_W, _lbl_P_AUTO_EMP_OTHER_W = 0.4, 0.2
_lbl_P_BA_BAL, _lbl_P_BA_AGGRESSIVE_W, _lbl_P_BA_NONCONS_W = 100_000, 0.8, 0.3
_lbl_P_WM_INCOME, _lbl_P_WM_INCOME_W = 250_000, 0.7
_lbl_P_WM_AGE, _lbl_P_WM_AGE_W = 50, 0.4
_lbl_P_WM_BAL, _lbl_P_WM_BAL_W = 500_000, 0.5
_lbl_P_CC_AGE, _lbl_P_CC_AGE_W = 25, 0.5
_lbl_P_CC_THIN_COUNT, _lbl_P_CC_THIN_W, _lbl_P_CC_NO_CARD_W = 1, 0.6, 0.3
_lbl_P_MM_BAL, _lbl_P_MM_DTI, _lbl_P_MM_W = 50_000, 0.3, 0.8
_lbl_P_DEP_NO_CHECKING_W = 0.8
_lbl_P_DEP_BAL, _lbl_P_DEP_BAL_W = 30_000, 0.4


def _lbl_f(p: dict, key: str, default: float = 0.0) -> float:
    v = p.get(key)
    return default if v is None else float(v)


def _lbl_flag(p: dict, key: str) -> bool:
    return _lbl_f(p, key) > 0


def business_scores(p: dict) -> dict[str, float]:
    """Score every business class; each score is BASE_SCORE plus its additive rule terms."""
    s = {c: BASE_SCORE for c in BUSINESS_PRODUCTS}
    rev = max(_lbl_f(p, "ANNUAL_REVENUE"), 1.0)
    bal = _lbl_f(p, "OPERATING_ACCOUNT_BALANCE")
    vol = p.get("CASH_FLOW_VOLATILITY")
    industry = p.get("INDUSTRY")
    net = _lbl_f(p, "NET_MONTHLY_CASH_FLOW")
    yib = _lbl_f(p, "YEARS_IN_BUSINESS")
    yac = _lbl_f(p, "YEARS_AS_CUSTOMER")
    count = _lbl_f(p, "EXISTING_PRODUCT_COUNT")
    no_loc = not _lbl_flag(p, "HAS_LINE_OF_CREDIT")
    no_savings = not _lbl_flag(p, "HAS_BUSINESS_SAVINGS")

    if no_loc:
        if vol == "High":
            s["Line_of_Credit"] += _lbl_LOC_HIGH_VOL
        elif vol == "Medium":
            s["Line_of_Credit"] += _lbl_LOC_MED_VOL
        if _lbl_flag(p, "SEASONAL_BUSINESS"):
            s["Line_of_Credit"] += _lbl_LOC_SEASONAL

    if rev >= _lbl_TRS_REV_HUGE:
        s["Treasury_Services"] += _lbl_TRS_REV_HUGE_W
    elif rev >= _lbl_TRS_REV_LARGE:
        s["Treasury_Services"] += _lbl_TRS_REV_LARGE_W
    if _lbl_f(p, "NUMBER_OF_LOCATIONS") >= _lbl_TRS_LOCATIONS:
        s["Treasury_Services"] += _lbl_TRS_LOCATIONS_W
    if _lbl_f(p, "MONTHLY_WIRE_TRANSFER_COUNT") >= _lbl_TRS_WIRES:
        s["Treasury_Services"] += _lbl_TRS_WIRES_W
    if _lbl_flag(p, "INTERNATIONAL_OPERATIONS"):
        s["Treasury_Services"] += _lbl_TRS_INTL_W

    if industry in _lbl_MERCHANT_INDUSTRIES and not _lbl_flag(p, "HAS_MERCHANT_SERVICES"):
        s["Merchant_Services"] += _lbl_MERCHANT_W

    idle = clamp((bal / rev - _lbl_IDLE_START) / _lbl_IDLE_SPAN, 0.0, 1.0) * _lbl_IDLE_W
    low_vol = vol == "Low"
    s["Money_Market"] += idle * (_lbl_IDLE_MM_LOW_VOL if low_vol else 1.0)
    s["CDs"] += idle * (_lbl_IDLE_CD_LOW_VOL if low_vol else _lbl_IDLE_CD_OTHER)

    growth_ok = _lbl_f(p, "REVENUE_GROWTH_YOY_PCT") >= _lbl_LOAN_GROWTH
    if industry in _lbl_LOAN_INDUSTRIES:
        s["Commercial_Loans"] += _lbl_LOAN_INDUSTRY_W
    if growth_ok:
        s["Commercial_Loans"] += _lbl_LOAN_GROWTH_W
        if _lbl_f(p, "DEBT_SERVICE_COVERAGE_RATIO") >= _lbl_LOAN_DSCR:
            s["Commercial_Loans"] += _lbl_LOAN_DSCR_W

    young = yib <= _lbl_YOUNG_YEARS
    thin = count <= _lbl_THIN_COUNT
    if young:
        s["Credit_Cards"] += _lbl_CC_YOUNG_W
        s["Business_Banking_Services"] += _lbl_BBS_YOUNG_W
    if thin:
        s["Credit_Cards"] += _lbl_CC_THIN_W
        s["Business_Banking_Services"] += _lbl_BBS_THIN_W
    if not _lbl_flag(p, "HAS_BUSINESS_CREDIT_CARD"):
        s["Credit_Cards"] += _lbl_CC_NO_CARD_W
    if not _lbl_flag(p, "HAS_BUSINESS_CHECKING"):
        s["Business_Banking_Services"] += _lbl_BBS_NO_CHECKING_W

    s["Wealth_Management"] += _lbl_WM_W * (
        (rev >= _lbl_WM_REV) + (bal >= _lbl_WM_BAL) + (yac >= _lbl_WM_YEARS))
    if bal >= _lbl_BA_BAL:
        s["Brokerage_Advisory"] += _lbl_BA_BAL_W
    if _lbl_f(p, "PROFIT_MARGIN_PCT") >= _lbl_BA_MARGIN:
        s["Brokerage_Advisory"] += _lbl_BA_MARGIN_W
    if yac >= _lbl_BA_YEARS:
        s["Brokerage_Advisory"] += _lbl_BA_YEARS_W

    if no_savings:
        s["Savings"] += _lbl_SAV_NO_SAVINGS_POS_FLOW if net > 0 else _lbl_SAV_NO_SAVINGS
        if net > 0:
            s["Deposits"] += _lbl_DEP_NO_SAVINGS_POS_FLOW
    if (low_vol and _lbl_f(p, "MONTHLY_AVG_DEPOSITS") >= _lbl_DEP_DEPOSIT_RATIO * rev / 12.0
            and idle == 0.0):
        s["Deposits"] += _lbl_DEP_LOW_VOL_DEPOSITS
    return s


def personal_scores(p: dict) -> dict[str, float]:
    """Score every personal class; each score is BASE_SCORE plus its additive rule terms."""
    s = {c: BASE_SCORE for c in PERSONAL_PRODUCTS}
    age = _lbl_f(p, "AGE")
    income = _lbl_f(p, "ANNUAL_INCOME")
    credit = _lbl_f(p, "CREDIT_SCORE")
    bal = _lbl_f(p, "TOTAL_ACCOUNT_BALANCE")
    dti = _lbl_f(p, "DEBT_TO_INCOME_RATIO")
    rate = _lbl_f(p, "SAVINGS_RATE_PCT")
    home = p.get("HOME_OWNERSHIP")
    risk = p.get("RISK_TOLERANCE")
    employment = p.get("EMPLOYMENT_STATUS")
    count = _lbl_f(p, "EXISTING_PRODUCT_COUNT")
    rent = home == "Rent"
    high_rate = rate >= _lbl_P_SAVE_RATE

    if high_rate:
        s["Savings"] += _lbl_P_SAV_RATE_W
        s["CDs"] += _lbl_P_CD_RATE_W
        if rent:
            s["Savings"] += _lbl_P_SAV_RENT_W
            s["CDs"] += _lbl_P_CD_RENT_W
    if not _lbl_flag(p, "HAS_SAVINGS"):
        s["Savings"] += _lbl_P_SAV_NO_SAVINGS_W
    if risk == "Conservative" and bal >= _lbl_P_CD_CONS_BAL:
        s["CDs"] += _lbl_P_CD_CONS_W

    if credit >= _lbl_P_HELOC_CREDIT:
        s["HELOC"] += _lbl_P_HELOC_CREDIT_W
    if home == "Mortgage":
        s["HELOC"] += _lbl_P_HELOC_MORTGAGE_W
        if age >= _lbl_P_EQUITY_AGE and dti <= _lbl_P_EQUITY_DTI:
            s["HELOC"] += _lbl_P_EQUITY_W

    if rent:
        s["Residential_Loans"] += _lbl_P_RES_RENT_W
        if credit >= _lbl_P_RES_CREDIT:
            s["Residential_Loans"] += _lbl_P_RES_CREDIT_W
        if income >= _lbl_P_RES_INCOME:
            s["Residential_Loans"] += _lbl_P_RES_INCOME_W

    mid_credit = credit <= _lbl_P_PL_CREDIT
    high_dti = dti >= _lbl_P_PL_DTI
    s["Personal_Loans"] += (_lbl_P_PL_CREDIT_W * mid_credit + _lbl_P_PL_DTI_W * high_dti
                            + _lbl_P_PL_BOTH_W * (mid_credit and high_dti))

    if not _lbl_flag(p, "HAS_AUTO_LOAN"):
        s["Auto_Loans"] += _lbl_P_AUTO_NO_LOAN_W
        if _lbl_P_AUTO_AGE[0] <= age <= _lbl_P_AUTO_AGE[1]:
            s["Auto_Loans"] += _lbl_P_AUTO_AGE_W
        if employment == "Employed_FT":
            s["Auto_Loans"] += _lbl_P_AUTO_EMP_FT_W
        elif employment in ("Employed_PT", "Self_Employed"):
            s["Auto_Loans"] += _lbl_P_AUTO_EMP_OTHER_W

    if bal >= _lbl_P_BA_BAL:
        if risk == "Aggressive":
            s["Brokerage_Advisory"] += _lbl_P_BA_AGGRESSIVE_W
        if risk != "Conservative":
            s["Brokerage_Advisory"] += _lbl_P_BA_NONCONS_W

    if income >= _lbl_P_WM_INCOME:
        s["Wealth_Management"] += _lbl_P_WM_INCOME_W
    if age >= _lbl_P_WM_AGE:
        s["Wealth_Management"] += _lbl_P_WM_AGE_W
    if bal >= _lbl_P_WM_BAL:
        s["Wealth_Management"] += _lbl_P_WM_BAL_W

    if age <= _lbl_P_CC_AGE:
        s["Credit_Cards"] += _lbl_P_CC_AGE_W
    if count <= _lbl_P_CC_THIN_COUNT:
        s["Credit_Cards"] += _lbl_P_CC_THIN_W
    if not _lbl_flag(p, "HAS_CREDIT_CARD"):
        s["Credit_Cards"] += _lbl_P_CC_NO_CARD_W

    if bal >= _lbl_P_MM_BAL and dti < _lbl_P_MM_DTI:
        s["Money_Market"] += _lbl_P_MM_W
    if not _lbl_flag(p, "HAS_CHECKING"):
        s["Deposits"] += _lbl_P_DEP_NO_CHECKING_W
    if bal >= _lbl_P_DEP_BAL and dti < _lbl_P_MM_DTI:
        s["Deposits"] += _lbl_P_DEP_BAL_W
    return s


def rule_label(scores: dict[str, float]) -> str:
    """Argmax of the scores; ties go to the earliest class in dict (tuple) order."""
    best, best_score = None, float("-inf")
    for c, v in scores.items():
        if v > best_score:
            best, best_score = c, v
    return best


def draw_label(scores: dict[str, float], rng, noise: float = NOISE) -> str:
    """rule_label with probability 1 - noise, else a draw weighted by the scores."""
    if rng.random() >= noise:
        return rule_label(scores)
    total = sum(scores.values())
    pick = rng.random() * total
    acc = 0.0
    last = None
    for c, v in scores.items():
        acc += v
        last = c
        if pick < acc:
            return c
    return last
