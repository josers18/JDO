"""CSAT_NPS_DATA-style CSAT model input row factory."""
from __future__ import annotations

from attrcsat.common import clamp
from attrcsat.vocab import BOOL_COLUMNS, CSAT_COLUMNS, RANGES

_CS_WEALTH = ("WealthManagement", "Gold", "Platinum")


def _cs_int(col: str, value: float, key: str | None = None) -> int:
    lo, hi = RANGES[key or col]
    return int(clamp(round(value), lo, hi))


def _cs_dec(col: str, value: float) -> float:
    lo, hi = RANGES[col]
    return round(clamp(value, lo, hi), 2)


def _cs_segment(p: dict) -> str:
    if p["kind"] == "BUSINESS":
        return "Corporate" if p["client_category"] == "CommercialBanking" else "Commercial"
    if p["kind"] == "PERSON" and p["client_category"] in _CS_WEALTH:
        return "Wealth Management"  # the training label's spelling, not the compact category
    return "Banking"


def csat_row(profile: dict, enrollment: dict) -> dict:
    p = profile
    share = sum(1 for c in BOOL_COLUMNS if enrollment[c] is True) / len(BOOL_COLUMNS)
    engagement = 40 + 59 * (p["digital_affinity"] + share) / 2
    row = {
        "SEGMENT": _cs_segment(p),
        "AGE": _cs_int("AGE", p["age"]),
        "ANNUAL_INCOME": _cs_int("ANNUAL_INCOME", p["income"]),
        "ACCOUNT_BALANCE": _cs_dec("ACCOUNT_BALANCE", p["total_balance"]),
        "TENURE_YEARS": _cs_int("TENURE_YEARS", p["tenure_months"] / 12),
        "NUM_PRODUCTS": _cs_int("NUM_PRODUCTS", p["n_products"]),
        "DIGITAL_ENGAGEMENT": _cs_dec("DIGITAL_ENGAGEMENT", engagement),
        "COMPLAINT_COUNT": _cs_int("COMPLAINT_COUNT", p["complaints"]),
        "CUSTOMER_SERVICE_CONTACT": _cs_int("CUSTOMER_SERVICE_CONTACT", p["monthly_calls"]),
        "CROSS_SELL_SCORE": _cs_int("CROSS_SELL_SCORE", 100 * p["cross_sell"], "CSAT.CROSS_SELL_SCORE"),
        "ESCALATED_CASES": _cs_int("ESCALATED_CASES", p["escalations"]),
        "TRANSACTION_VOLUME": _cs_int("TRANSACTION_VOLUME", p["monthly_txn"]),
        "CREDIT_SCORE": _cs_dec("CREDIT_SCORE", p["credit_score"]),
        "ACCOUNTID": p["account_id"],
    }
    return {c: row[c] for c in CSAT_COLUMNS}
