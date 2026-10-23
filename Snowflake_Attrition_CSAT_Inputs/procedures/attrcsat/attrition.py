"""ATTRITION_PREDICTION_INPUTS row factory."""
from __future__ import annotations

from attrcsat.common import clamp
from attrcsat.vocab import ATTRITION_COLUMNS, RANGES

_AT_PREFERRED = ("WealthManagement", "Gold", "Platinum")
_AT_PREMIUM = ("CommercialBanking", "Silver")


def _at_int(col: str, value: float) -> int:
    lo, hi = RANGES[col]
    return int(clamp(round(value), lo, hi))


def _at_dec(col: str, value: float) -> float:
    lo, hi = RANGES[col]
    return round(clamp(value, lo, hi), 2)


def _at_yn(flag) -> str:
    return "Yes" if flag else "No"


def _at_segment(p: dict) -> str:
    cat, bal = p["client_category"], p["total_balance"]
    if cat in _AT_PREFERRED or bal >= 250000:
        return "Preferred"
    if cat in _AT_PREMIUM or bal >= 75000:
        return "Premium"
    return "Regular"


def attrition_row(profile: dict, enrollment: dict) -> dict:
    p = profile
    row = {
        "CUSTOMER_SEGMENT_C": _at_segment(p),
        "CROSS_SELL_SCORE_C": _at_int("CROSS_SELL_SCORE_C", 1 + round(6 * p["cross_sell"])),
        "ONLINE_BANKING_C": _at_yn(enrollment["ONLINE_ENROLLED"]),
        "MOBILE_BANKING_C": _at_yn(enrollment["MOBILE_ENROLLED"]),
        "DIRECT_DEPOSIT_C": _at_yn(p["has_direct_deposit"]),
        "AVG_NUMBER_OF_TRANSACTIONS_C": _at_int("AVG_NUMBER_OF_TRANSACTIONS_C", p["monthly_txn"]),
        "TENURE_IN_MONTHS_C": _at_int("TENURE_IN_MONTHS_C", p["tenure_months"]),
        "AVG_BALANCE_6_MONTHS_C": _at_dec("AVG_BALANCE_6_MONTHS_C", p["avg_balance"]),
        "NPS_SCORE_C": p["nps_category"],
        "SINGLE_PRODUCT_CUSTOMER_C": _at_yn(p["n_products"] == 1),
        "PROMOTIONAL_PRODUCT_C": _at_yn(p["has_promo"]),
        "PCT_BALANCE_DROP_6_MONTHS_AVG_C": _at_dec("PCT_BALANCE_DROP_6_MONTHS_AVG_C", p["pct_balance_drop"]),
        "DAYS_SINCE_LAST_INTERACTION_C": _at_int("DAYS_SINCE_LAST_INTERACTION_C", p["days_since_interaction"]),
        "CHURNED_C": "No",
        "UNIQUEID": p["account_id"],
        "AVG_NUMBER_OF_CALL_CENTER_CALLS_C": _at_int("AVG_NUMBER_OF_CALL_CENTER_CALLS_C", p["monthly_calls"]),
    }
    return {c: row[c] for c in ATTRITION_COLUMNS}
