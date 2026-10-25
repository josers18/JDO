"""Feature row -> shared account profile.

Every later row factory (enrollments, attrition, CSAT) derives from this one profile so the
three tables agree about the same account. Values are not clamped to model ranges here.
Missing feed data falls back to draws from stable_rng(account_id, "attrcsat-<field>"), which
are deterministic per account and do not change month to month.
"""
from __future__ import annotations

import math
from datetime import date, datetime

from attrcsat.common import as_date, as_float, clamp, stable_rng

# Negative Gong weeks per complaint, on top of the low NPS responses.
_PF_NEG_WEEKS_PER_COMPLAINT = 2

_PF_KIND_WEIGHTS = (("N_DEPOSIT", 0.20), ("N_LOAN", 0.25), ("N_INVESTMENT", 0.30), ("N_LINE", 0.25))


def _pf_rng(account_id: str, field: str):
    return stable_rng(account_id, "attrcsat-" + field)


# CLIENT_CATEGORY decides the kind; ACCOUNT_TYPE_FLAG (= BIRTHDATE IS NOT NULL in V_ACCOUNT_ANCHORS)
# is only the fallback for an unknown or empty category, since persons without a birthdate carry 'BUSINESS'.
_PF_PERSON_CATEGORIES = ("retail", "wealthmanagement", "gold", "silver", "bronze", "platinum")
_PF_BUSINESS_CATEGORIES = ("smallbusiness", "commercialbanking", "corporate", "commercial", "business")


def _pf_category(feature: dict) -> str:
    """Compact CLIENT_CATEGORY ('Wealth Management' live -> 'WealthManagement'), the form downstream keys on."""
    return "".join(str(feature.get("CLIENT_CATEGORY") or "").split())


def _pf_kind(feature: dict) -> str:
    cat = _pf_category(feature).lower()
    if cat == "household":
        return "HOUSEHOLD"
    if cat in _PF_BUSINESS_CATEGORIES:
        return "BUSINESS"
    if cat in _PF_PERSON_CATEGORIES:
        return "PERSON"
    if str(feature.get("ACCOUNT_TYPE_FLAG") or "").upper() == "PERSON":
        return "PERSON"
    return "BUSINESS"


def _pf_months_between(start: date, end: date) -> int:
    months = (end.year - start.year) * 12 + (end.month - start.month)
    if end.day < start.day:
        months -= 1
    return max(0, months)


def _pf_age(feature: dict, kind: str, anchor: date, aid: str) -> int:
    born = as_date(feature.get("BIRTHDATE"))
    if kind == "PERSON" and born is not None:
        age = anchor.year - born.year - ((anchor.month, anchor.day) < (born.month, born.day))
        return max(0, age)
    rng = _pf_rng(aid, "age")
    if kind == "PERSON":
        return rng.randint(25, 78)
    return rng.randint(30, 72)


def _pf_income(feature: dict, kind: str, aid: str) -> float:
    inc = as_float(feature.get("ANNUAL_INCOME"))
    rev = as_float(feature.get("ANNUAL_REVENUE"))
    order = (rev, inc) if kind == "BUSINESS" else (inc, rev)
    for v in order:
        if v is not None and v > 0:
            return v
    rng = _pf_rng(aid, "income")
    if kind == "PERSON":
        return round(rng.uniform(40000, 160000), 2)
    if kind == "HOUSEHOLD":
        return round(rng.uniform(90000, 400000), 2)
    return round(rng.uniform(300000, 8000000), 2)


def _pf_credit(feature: dict, kind: str, income: float, aid: str) -> float:
    cs = as_float(feature.get("CREDIT_SCORE"))
    if cs is not None:
        return cs
    base = _pf_rng(aid, "credit").uniform(640, 820)
    if kind == "BUSINESS":
        # larger revenue skews the score higher, up to about +25 points
        base += clamp((math.log10(max(income, 1.0)) - 5.5) * 12, 0, 25)
    return round(base, 1)


def _pf_holdings(feature: dict, aid: str) -> tuple[int, dict]:
    """(n_products, {kind-column: count}); seeded when the feed has no holdings."""
    n = as_float(feature.get("N_PRODUCTS"))
    cols = [c for c, _ in _PF_KIND_WEIGHTS]
    counts = {c: as_float(feature.get(c)) for c in cols}
    if n is not None:
        have = {c: int(v or 0) for c, v in counts.items()}
        return max(1, int(n)), have
    rng = _pf_rng(aid, "n_products")
    n_prod = rng.randint(1, 3)
    have = {c: 0 for c in cols}
    have["N_DEPOSIT"] = 1
    extra = [c for c in cols if c != "N_DEPOSIT"]
    rng.shuffle(extra)
    for c in extra[: n_prod - 1]:
        have[c] = 1
    return n_prod, have


def _pf_nps_category(feature: dict, aid: str) -> str:
    desc = str(feature.get("NPS_DESCRIPTION") or "").strip().lower()
    if desc.startswith("promoter"):
        return "Promoter"
    if desc.startswith("passive"):
        return "Passive"
    if desc.startswith("detractor"):
        return "Detractor"
    score = as_float(feature.get("NPS_SCORE"))
    if score is not None:
        return "Promoter" if score >= 9 else ("Passive" if score >= 7 else "Detractor")
    r = _pf_rng(aid, "nps").random()
    return "Promoter" if r < 0.35 else ("Passive" if r < 0.75 else "Detractor")


def _pf_risk(feature: dict) -> str:
    if any(bool(feature.get(k)) for k in ("SANCTIONS_HIT", "PEP_HIT", "ADVERSE_MEDIA_HIT")):
        return "REVIEW"
    rating = str(feature.get("RISK_RATING") or "Low").strip().lower()
    if rating in ("high", "severe"):
        return "REVIEW"
    if rating == "medium":
        return "WATCH"
    return "CLEAN"


def build_profile(feature: dict, run_ts: datetime) -> dict:
    aid = str(feature["ACCOUNT_ID"])
    kind = _pf_kind(feature)
    anchor = date(run_ts.year, run_ts.month, 1)
    grounded = feature.get("N_PRODUCTS") is not None

    age = _pf_age(feature, kind, anchor, aid)
    income = _pf_income(feature, kind, aid)
    credit = _pf_credit(feature, kind, income, aid)

    opened = as_date(feature.get("FIRST_OPEN_DATE"))
    if opened is not None:
        tenure = _pf_months_between(opened, anchor)
    else:
        tenure = _pf_rng(aid, "tenure").randint(12, 240)

    n_products, held = _pf_holdings(feature, aid)

    dd = as_float(feature.get("DD_AMOUNT"))
    if dd is not None:
        has_dd = dd > 0
    else:
        has_dd = _pf_rng(aid, "direct_deposit").random() < (0.55 if kind == "PERSON" else 0.20)
    bonus = as_float(feature.get("BONUS_AMOUNT"))
    if bonus is not None:
        has_promo = bonus > 0
    else:
        has_promo = _pf_rng(aid, "promo").random() < 0.30

    total = as_float(feature.get("TOTAL_BALANCE"))
    avg = as_float(feature.get("AVG_BALANCE"))
    if total is None and avg is None:
        total = max(100.0, income * 0.25 * math.exp(_pf_rng(aid, "balance").gauss(0, 0.5)))
        avg = total
    elif total is None:
        total = avg
    elif avg is None:
        avg = total

    early = as_float(feature.get("EARLY_AVG_BALANCE"))
    late = as_float(feature.get("LATE_AVG_BALANCE"))
    if early is not None and late is not None:
        drop = (early - late) / early if early > 0 and late < early else 0.0
    else:
        r = _pf_rng(aid, "balance_drop")
        drop = r.uniform(0.0, 0.15) if r.random() < 0.3 else 0.0
    drop = round(drop, 4)

    adb_txn = as_float(feature.get("ADB_TXN"))
    adb_days = as_float(feature.get("ADB_DAYS"))
    ft_txn = as_float(feature.get("FT_TXN"))
    if adb_txn is not None and adb_days:
        monthly_txn = adb_txn / adb_days * 30
    elif ft_txn is not None:
        monthly_txn = ft_txn
    else:
        monthly_txn = _pf_rng(aid, "monthly_txn").uniform(2, 30)

    credits = as_float(feature.get("CREDITS"))
    debits = as_float(feature.get("DEBITS"))
    if credits is not None and credits > 0 and debits is not None:
        savings = max(0.0, (credits - debits) / credits)
    else:
        savings = _pf_rng(aid, "savings_rate").uniform(0.02, 0.12)

    calls = as_float(feature.get("CALLS"))
    weeks = as_float(feature.get("GONG_WEEKS"))
    if calls is not None and weeks is not None:
        monthly_calls = calls / max(weeks, 1.0) * 4.33
    else:
        monthly_calls = _pf_rng(aid, "monthly_calls").uniform(0.3, 2.0)
    last_call = as_date(feature.get("LAST_CALL_DATE"))
    if last_call is not None:
        days_since = max(0, (anchor - last_call).days)
    else:
        days_since = _pf_rng(aid, "days_since").randint(20, 90)

    neg_weeks = int(as_float(feature.get("NEG_WEEKS")) or 0)
    complaints = int(as_float(feature.get("LOW_NPS_12M")) or 0) + neg_weeks // _PF_NEG_WEEKS_PER_COMPLAINT
    escalations = int(as_float(feature.get("VNEG_WEEKS")) or 0)

    breadth = sum(w for c, w in _PF_KIND_WEIGHTS if held.get(c, 0) > 0)
    jit = _pf_rng(aid, "cross_sell").uniform(-0.02, 0.02)
    cross_sell = clamp(0.7 * breadth + 0.25 * min(n_products, 8) / 8 + jit, 0.0, 1.0)

    z = -0.06 * (age - 50) + 0.02 * (monthly_txn - 15)
    if kind == "BUSINESS":
        z += 0.6
    elif kind == "HOUSEHOLD":
        z -= 0.5
    digital = 1.0 / (1.0 + math.exp(-z))

    return {
        "account_id": aid,
        "kind": kind,
        "client_category": _pf_category(feature),
        "age": int(age),
        "income": float(income),
        "credit_score": float(credit),
        "tenure_months": int(tenure),
        "n_products": int(n_products),
        "has_direct_deposit": bool(has_dd),
        "has_promo": bool(has_promo),
        "total_balance": float(total),
        "avg_balance": float(avg),
        "pct_balance_drop": float(drop),
        "monthly_txn": float(monthly_txn),
        "savings_rate": float(savings),
        "monthly_calls": float(monthly_calls),
        "days_since_interaction": int(days_since),
        "complaints": int(complaints),
        "escalations": int(escalations),
        "nps_category": _pf_nps_category(feature, aid),
        "cross_sell": float(cross_sell),
        "risk": _pf_risk(feature),
        "digital_affinity": float(clamp(digital, 0.0, 1.0)),
        "grounded": bool(grounded),
    }
