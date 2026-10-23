"""Business profile factory: one anchor + real-feed features -> every business training variable.

Precedence (spec 5.1): anchor value > real feed (if inside a sanity window) > generated.
Base values and categoricals come from stable_rng (month independent); continuous generated
values then get at most +/-3% drift from month_rng. Real values are never jittered.
"""
from __future__ import annotations

import math
from datetime import datetime

from prodrec.common import allocate_flags, as_date, as_float, clamp, jitter, month_rng, stable_rng
from prodrec.vocab import (
    BUSINESS_STRUCTURE_WEIGHTS,
    BUSINESS_SUBSET_COLUMNS,
    BUSINESS_TRAINING_COLUMNS,
    CASH_FLOW_VOLATILITY_WEIGHTS,
    DIGITAL_BANKING_USAGE_WEIGHTS,
    map_industry,
    _voc_weighted_pick,
)

BUSINESS_SALT = "product_rec_business"

# Cash-flow volatility cut-offs on cv = MONTHLY_NET_SD / max(MONTHLY_CREDITS, 1). Tuned in Task 8.
VOL_LOW_MAX = 0.15
VOL_MED_MAX = 0.40
VOL_MIN_FEED_MONTHS = 2
# Sanity windows (multiples of annual revenue, or of revenue/12 for monthly figures).
DEPOSITS_WINDOW = (0.05, 3.0)      # MONTHLY_CREDITS vs revenue/12
BIZ_BALANCE_WINDOW = (0.01, 2.0)       # DEPOSIT_BALANCE vs revenue
NET_FLOW_WINDOW = (-1.0, 1.0)      # MONTHLY_NET vs revenue/12
REVENUE_PER_EMPLOYEE = 150_000.0

# Appendix A training ranges (generated values are clamped to these).
_biz_REV_RANGE = (50_000, 50_000_000)
_biz_EMP_RANGE = (1, 370)
_biz_DEP_RANGE = (2_000, 1_524_169)
_biz_NET_RANGE = (-86_309, 176_698)
_biz_BAL_RANGE = (5_500, 4_600_073)
_biz_RATES = {  # Appendix A flag rates
    "HAS_BUSINESS_CHECKING": 0.89, "HAS_BUSINESS_SAVINGS": 0.55,
    "HAS_BUSINESS_CREDIT_CARD": 0.60, "HAS_BUSINESS_LOAN": 0.28,
    "HAS_LINE_OF_CREDIT": 0.24, "HAS_MERCHANT_SERVICES": 0.27,
}
_biz_FLAGS = tuple(_biz_RATES)
_biz_LOCATION_WEIGHTS = {1: 760, 2: 150, 3: 50, 4: 20, 5: 10, 6: 5, 7: 3, 8: 2}
_biz_JITTER_FIELDS = (
    "ANNUAL_REVENUE", "NUMBER_OF_EMPLOYEES", "MONTHLY_AVG_DEPOSITS", "NET_MONTHLY_CASH_FLOW",
    "OPERATING_ACCOUNT_BALANCE", "BUSINESS_CREDIT_SCORE", "DEBT_TO_REVENUE_RATIO",
    "PAYROLL_BURDEN_PCT", "REVENUE_GROWTH_YOY_PCT", "PROFIT_MARGIN_PCT", "AVG_RECEIVABLES_DAYS",
    "DEBT_SERVICE_COVERAGE_RATIO", "MONTHLY_WIRE_TRANSFER_COUNT", "ACH_TRANSACTIONS_PER_EMPLOYEE",
)


def _biz_fin(v: float, lo: float, hi: float, dp: int, factor: float):
    """Jitter by a pre-drawn factor, clamp to the training range, round (dp=0 -> int)."""
    out = round(clamp(v * factor, lo, hi), dp)
    return int(out) if dp == 0 else float(out)


def _biz_in_window(v: float | None, base: float, window: tuple[float, float]) -> bool:
    return v is not None and window[0] * base <= v <= window[1] * base


def _biz_truthy(v) -> bool:
    f = as_float(v)
    return f is not None and f > 0


def _biz_volatility(feats: dict, rng, seasonal: int) -> str:
    sd = as_float(feats.get("MONTHLY_NET_SD"))
    months = as_float(feats.get("FEED_MONTHS"))
    credits = as_float(feats.get("MONTHLY_CREDITS"))
    # Always draw so the rng stream is the same whether or not the feed is used.
    weights = dict(CASH_FLOW_VOLATILITY_WEIGHTS)
    if seasonal:
        weights["High"] *= 2
    drawn = _voc_weighted_pick(weights, rng)
    if sd is not None and months is not None and months >= VOL_MIN_FEED_MONTHS:
        cv = sd / max(credits if credits is not None else 0.0, 1.0)
        if cv <= VOL_LOW_MAX:
            return "Low"
        return "Medium" if cv <= VOL_MED_MAX else "High"
    return drawn


def business_profile(anchor: dict, feats: dict, run_ts: datetime, key: str | None = None) -> dict:
    """Every BUSINESS_TRAINING_COLUMNS key except RECOMMENDED_PRODUCT."""
    account_id = anchor["ACCOUNT_ID"]
    key = key or account_id
    feats = feats or {}
    rng = stable_rng(key, BUSINESS_SALT)
    rng.random()  # industry's own stable_rng consumes one draw when the label is unknown; skip it here
    mrng = month_rng(key, BUSINESS_SALT, run_ts)
    jf = {f: jitter(1.0, mrng) for f in _biz_JITTER_FIELDS}  # fixed order -> stable stream

    industry = map_industry(anchor.get("INDUSTRY"), stable_rng(key, BUSINESS_SALT))

    # --- size (anchor copied, never clamped) --------------------------------------------
    rev_a = as_float(anchor.get("ANNUAL_REVENUE"))
    emp_a = as_float(anchor.get("EMPLOYEE_COUNT"))
    rev_draw = rng.lognormvariate(13.27, 1.27)
    rpe_draw = REVENUE_PER_EMPLOYEE * rng.uniform(0.7, 1.4)
    if rev_a is not None:
        revenue = round(rev_a)
        rev_base = rev_a
    elif emp_a is not None:
        rev_base = max(emp_a, 1.0) * rpe_draw  # scaled from a real anchor: no absolute cap
        revenue = _biz_fin(rev_base, 1, math.inf, 0, jf["ANNUAL_REVENUE"])
    else:
        rev_base = clamp(rev_draw, *_biz_REV_RANGE)
        revenue = _biz_fin(rev_base, *_biz_REV_RANGE, 0, jf["ANNUAL_REVENUE"])
    rev_eff = max(rev_base, 1.0)
    anchored = rev_a is not None or emp_a is not None
    if emp_a is not None:
        employees = round(emp_a)
    elif rev_a is not None:  # derived from a real revenue: min 1, no fixed max
        employees = _biz_fin(rev_eff / rpe_draw, 1, math.inf, 0, jf["NUMBER_OF_EMPLOYEES"])
    else:
        employees = _biz_fin(rev_eff / rpe_draw, *_biz_EMP_RANGE, 0, jf["NUMBER_OF_EMPLOYEES"])
    monthly_rev = rev_eff / 12.0

    # --- profit margin (drives generated cash flow) -------------------------------------
    margin_base = clamp(rng.gauss(11.8, 9.9), -15.0, 40.5)
    margin = _biz_fin(margin_base, -15.0, 40.5, 1, jf["PROFIT_MARGIN_PCT"])

    # --- real-feed-or-generated money values --------------------------------------------
    dep_gen = monthly_rev * rng.uniform(0.6, 1.1)
    bal_gen = rev_eff * rng.uniform(0.08, 0.2)
    net_gen = margin_base / 100.0 * monthly_rev * rng.uniform(0.8, 1.2)

    # Scale-relative bounds when anchored; absolute Appendix A bounds only when nothing anchors the size.
    if anchored:
        dep_b = (DEPOSITS_WINDOW[0] * monthly_rev, DEPOSITS_WINDOW[1] * monthly_rev)
        bal_b = (BIZ_BALANCE_WINDOW[0] * rev_eff, BIZ_BALANCE_WINDOW[1] * rev_eff)
        net_b = (NET_FLOW_WINDOW[0] * monthly_rev, NET_FLOW_WINDOW[1] * monthly_rev)
    else:
        dep_b, bal_b, net_b = _biz_DEP_RANGE, _biz_BAL_RANGE, _biz_NET_RANGE

    credits = as_float(feats.get("MONTHLY_CREDITS"))
    if _biz_in_window(credits, monthly_rev, DEPOSITS_WINDOW):
        deposits = round(credits)
    else:
        deposits = _biz_fin(dep_gen, *dep_b, 0, jf["MONTHLY_AVG_DEPOSITS"])
    dbal = as_float(feats.get("DEPOSIT_BALANCE"))
    if _biz_in_window(dbal, rev_eff, BIZ_BALANCE_WINDOW):
        balance = round(dbal)
    else:
        balance = _biz_fin(bal_gen, *bal_b, 0, jf["OPERATING_ACCOUNT_BALANCE"])
    net = as_float(feats.get("MONTHLY_NET"))
    if _biz_in_window(net, monthly_rev, NET_FLOW_WINDOW):
        net_flow = round(net)
    else:
        net_flow = _biz_fin(net_gen, *net_b, 0, jf["NET_MONTHLY_CASH_FLOW"])

    # --- categoricals / flags (stable only) ---------------------------------------------
    structure = _voc_weighted_pick(BUSINESS_STRUCTURE_WEIGHTS, rng)
    international = int(rng.random() < 0.09)
    seasonal = int(rng.random() < 0.24)
    digital = _voc_weighted_pick(DIGITAL_BANKING_USAGE_WEIGHTS, rng)
    volatility = _biz_volatility(feats, rng, seasonal)

    draws = {f: rng.random() for f in _biz_FLAGS}  # always drawn, fixed order
    # A feed value (0 or 1) is authoritative; only a missing feed (None) falls back to the draw.
    seeded = {}
    if as_float(feats.get("DEPOSIT_BALANCE")) is not None:  # any FTA deposit account
        seeded["HAS_BUSINESS_CHECKING"] = 1
    elif as_float(feats.get("PRODUCT_COUNT")) is not None:  # FTA-covered, no deposit account
        seeded["HAS_BUSINESS_CHECKING"] = 0
    for feat, flag in (("HAS_LOAN", "HAS_BUSINESS_LOAN"), ("HAS_LINE", "HAS_LINE_OF_CREDIT"),
                       ("HAS_CARD", "HAS_BUSINESS_CREDIT_CARD")):
        if as_float(feats.get(feat)) is not None:
            seeded[flag] = int(_biz_truthy(feats.get(feat)))
    flags = allocate_flags(_biz_RATES, draws, seeded, feats.get("PRODUCT_COUNT"))

    # --- tenure ---------------------------------------------------------------------------
    size_factor = clamp((rev_eff / 1_288_538.0) ** 0.1, 0.6, 1.8)
    yib_gen = int(clamp(round(rng.lognormvariate(1.7, 0.85) * size_factor), 1, 68))
    yac_gen = int(clamp(round(rng.lognormvariate(0.5, 0.9)), 0, 32))
    founded = as_float(feats.get("FOUNDED_YEAR"))
    opened = as_date(feats.get("FIRST_OPEN_DATE"))
    yac_real = max(0, run_ts.year - opened.year) if opened is not None else None
    if founded is not None:
        yib = max(1, run_ts.year - int(founded))
    else:  # a generated age must not contradict a real customer tenure
        yib = max(yib_gen, yac_real or 0)
    yac = yac_real if yac_real is not None else yac_gen
    yac = min(yac, yib)

    locations = _voc_weighted_pick(_biz_LOCATION_WEIGHTS, rng)
    bump = rng.random() < 0.5
    if employees >= 100 and bump:
        locations = min(8, locations + 1)

    # --- training-only continuous variables -----------------------------------------------
    credit = _biz_fin(100 - rng.lognormvariate(0.5, 0.9), 74, 100, 0, jf["BUSINESS_CREDIT_SCORE"])
    d2r = _biz_fin(rng.betavariate(2.5, 8.3), 0.01, 0.69, 2, jf["DEBT_TO_REVENUE_RATIO"])
    payroll = _biz_fin(rng.gauss(35.1, 12.2), 5.0, 75.0, 1, jf["PAYROLL_BURDEN_PCT"])
    growth = _biz_fin(rng.gauss(8.2, 14.7), -30.0, 57.0, 1, jf["REVENUE_GROWTH_YOY_PCT"])
    recv = _biz_fin(rng.gauss(35.0, 14.9), 5, 84, 0, jf["AVG_RECEIVABLES_DAYS"])
    dscr = _biz_fin(rng.gauss(1.8, 0.58), 0.5, 3.79, 2, jf["DEBT_SERVICE_COVERAGE_RATIO"])
    wires = _biz_fin(max(rng.gauss(4.6, 2.7), 0.0), 0, 19, 0, jf["MONTHLY_WIRE_TRANSFER_COUNT"])
    ach = _biz_fin(rng.gauss(3.55, 1.48), 0.5, 9.1, 1, jf["ACH_TRANSACTIONS_PER_EMPLOYEE"])

    profile = {
        "ACCOUNTID": account_id,
        "INDUSTRY": industry,
        "BUSINESS_STRUCTURE": structure,
        "ANNUAL_REVENUE": revenue,
        "NUMBER_OF_EMPLOYEES": employees,
        "YEARS_IN_BUSINESS": yib,
        "MONTHLY_AVG_DEPOSITS": deposits,
        "NET_MONTHLY_CASH_FLOW": net_flow,
        "OPERATING_ACCOUNT_BALANCE": balance,
        "CASH_FLOW_VOLATILITY": volatility,
        "NUMBER_OF_LOCATIONS": locations,
        "INTERNATIONAL_OPERATIONS": international,
        "BUSINESS_CREDIT_SCORE": credit,
        "DEBT_TO_REVENUE_RATIO": d2r,
        "PAYROLL_BURDEN_PCT": payroll,
        **flags,
        "EXISTING_PRODUCT_COUNT": sum(flags.values()),
        "YEARS_AS_CUSTOMER": yac,
        "DIGITAL_BANKING_USAGE": digital,
        "REVENUE_GROWTH_YOY_PCT": growth,
        "PROFIT_MARGIN_PCT": margin,
        "SEASONAL_BUSINESS": seasonal,
        "AVG_RECEIVABLES_DAYS": recv,
        "DEBT_SERVICE_COVERAGE_RATIO": dscr,
        "MONTHLY_WIRE_TRANSFER_COUNT": wires,
        "ACH_TRANSACTIONS_PER_EMPLOYEE": ach,
    }
    return {c: profile[c] for c in BUSINESS_TRAINING_COLUMNS if c != "RECOMMENDED_PRODUCT"}


def business_input_row(profile: dict) -> dict:
    """Project a profile onto the business subset (model input) columns."""
    return {c: profile[c] for c in BUSINESS_SUBSET_COLUMNS}
