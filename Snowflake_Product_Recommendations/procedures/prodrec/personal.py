"""Personal profile factory: one anchor + real-feed features -> every personal training variable.

Precedence (spec 5.1): anchor value > real feed (if inside a sanity window) > generated.
Base values and categoricals come from stable_rng (month independent, fixed draw order);
continuous generated values then get at most +/-3% drift from month_rng. Real values are never
jittered, and derived values are computed from un-jittered bases so drift never compounds.
"""
from __future__ import annotations

import math
from datetime import datetime

from prodrec.common import allocate_flags, as_date, as_float, clamp, jitter, month_rng, stable_rng
from prodrec.vocab import (
    EDUCATION_LEVEL_WEIGHTS,
    EMPLOYMENT_STATUS_WEIGHTS,
    MARITAL_STATUS_WEIGHTS,
    HOME_OWNERSHIP_WEIGHTS,
    PERSONAL_SUBSET_COLUMNS,
    PERSONAL_TRAINING_COLUMNS,
    RECENT_LIFE_EVENT_WEIGHTS,
    RISK_TOLERANCE_WEIGHTS,
    map_region,
    _voc_weighted_pick,
)

PERSONAL_SALT = "product_rec_personal"

# Sanity windows (multiples of annual income, or of income/12 for monthly figures).
PER_BALANCE_WINDOW = (0.0, 5.0)        # DEPOSIT_BALANCE vs income
DEPOSIT_WINDOW = (0.05, 1.5)       # DIRECT_DEPOSIT / MONTHLY_CREDITS vs income/12
GEN_DEPOSIT_FRACTION = (0.25, 0.6)  # generated deposit = income/12 * U(...)
GEN_BALANCE_FLOOR = 0.01           # generated balance >= 1% of income

# Appendix A training ranges (generated values are clamped to these).
_per_AGE_RANGE = (18, 85)
_per_INC_RANGE = (15_000, 750_000)
_per_CREDIT_RANGE = (450, 850)     # training covers 449-796; real population runs higher
_per_RATES = {  # Appendix A flag rates
    "HAS_CHECKING": 0.90, "HAS_SAVINGS": 0.60, "HAS_INVESTMENT_ACCOUNT": 0.19,
    "HAS_MORTGAGE": 0.35, "HAS_AUTO_LOAN": 0.40, "HAS_CREDIT_CARD": 0.70,
}
_per_MOBILE_RATE = 0.94
# Median generated income by age band (Appendix A mean 55.8k, sd 47.8k -> lognormal sigma 0.7).
_per_INCOME_MEDIAN_BY_AGE = ((25, 24_000), (35, 39_000), (55, 50_000), (65, 43_000), (200, 30_000))
_per_INCOME_SIGMA = 0.7
_per_DEPENDENT_WEIGHTS = (25, 25, 25, 15, 10)
_per_OVERDRAFT_WEIGHTS = (50, 28, 14, 5, 2, 1)
_per_JITTER_FIELDS = (
    "ANNUAL_INCOME", "CREDIT_SCORE", "TOTAL_ACCOUNT_BALANCE", "MONTHLY_DEPOSIT_AMOUNT",
    "DEBT_TO_INCOME_RATIO", "SAVINGS_RATE_PCT", "MONTHLY_TRANSACTION_COUNT",
    "AVG_TRANSACTION_AMOUNT", "DIGITAL_BANKING_LOGINS_MONTHLY", "BRANCH_VISITS_MONTHLY",
    "CUSTOMER_SATISFACTION_SCORE",
)


def _per_fin(v: float, lo: float, hi: float, dp: int, factor: float):
    """Jitter by a pre-drawn factor, clamp, round (dp=0 -> int)."""
    out = round(clamp(v * factor, lo, hi), dp)
    return int(out) if dp == 0 else float(out)


def _per_in_window(v: float | None, base: float, window: tuple[float, float]) -> bool:
    return v is not None and window[0] * base <= v <= window[1] * base


def _per_flag(v) -> int | None:
    """Real 0/1 flag (bool/int/float/'true'/'0'...) -> 0/1; missing -> None."""
    if isinstance(v, bool):
        return int(v)
    if isinstance(v, str) and v.strip().lower() in ("true", "t", "yes", "y"):
        return 1
    if isinstance(v, str) and v.strip().lower() in ("false", "f", "no", "n"):
        return 0
    f = as_float(v)
    return None if f is None else int(f > 0)


def _per_age(birthdate, run_ts: datetime) -> int | None:
    b = as_date(birthdate)
    if b is None:
        return None
    d = run_ts.date()
    return max(0, d.year - b.year - ((d.month, d.day) < (b.month, b.day)))


def _per_scale(weights: dict, factors: dict) -> dict:
    return {k: w * factors.get(k, 1.0) for k, w in weights.items()}


def _per_income_median(age: int) -> float:
    return next((m for hi, m in _per_INCOME_MEDIAN_BY_AGE if age < hi), _per_INCOME_MEDIAN_BY_AGE[-1][1])


def _per_propensity(v) -> float | None:
    """Claritas INVESTMENT_PROPENSITY_SCORE (NUMBER(5,2), 0-100) -> 0..1."""
    f = as_float(v)
    return None if f is None else clamp(f / 100.0, 0.0, 1.0)


def _per_employment_weights(age: int, retirees: bool) -> dict:
    f: dict = {}
    if age < 50:
        f["Retired"] = 0.0
    elif age < 62:
        f["Retired"] = 0.15
    elif age < 70:
        f["Retired"] = 3.0
    else:
        f["Retired"] = 9.0 * sum(w for k, w in EMPLOYMENT_STATUS_WEIGHTS.items()
                                 if k not in ("Retired", "Student")) / EMPLOYMENT_STATUS_WEIGHTS["Retired"]
    if retirees and age >= 50:
        f["Retired"] = f["Retired"] * 3.0 if f["Retired"] > 0 else 0.0
    if age > 35:
        f["Student"] = 0.0
    elif age < 23:
        f["Student"] = 1.5 * sum(w for k, w in EMPLOYMENT_STATUS_WEIGHTS.items()
                                 if k not in ("Retired", "Student")) / EMPLOYMENT_STATUS_WEIGHTS["Student"]
    elif age < 26:
        f["Student"] = 1.0
    else:
        f["Student"] = 0.4
    return _per_scale(EMPLOYMENT_STATUS_WEIGHTS, f)


def _per_education_weights(age: int, income: float) -> dict:
    t = clamp(math.log(max(income, 1.0) / 55_829.0) / math.log(4.0), -1.0, 1.0)
    f = {"Bachelors": 1 + 0.3 * t, "Masters": 1 + 0.8 * t, "Doctorate": 1 + 1.2 * t,
         "High_School": 1 - 0.6 * t, "Associates": 1 - 0.3 * t}
    if age < 22:
        f["Masters"] = f["Doctorate"] = 0.0
    elif age < 26:
        f["Masters"] *= 0.5
        f["Doctorate"] *= 0.1
    return _per_scale(EDUCATION_LEVEL_WEIGHTS, f)


def _per_risk_weights(age: int, propensity: float | None) -> dict:
    f: dict = {}
    if propensity is not None:
        f["Aggressive"] = 0.25 + 1.5 * propensity
        f["Conservative"] = max(0.25, 1.75 - 1.5 * propensity)
    if age >= 65:
        f["Conservative"] = f.get("Conservative", 1.0) * 4.0
        f["Aggressive"] = f.get("Aggressive", 1.0) * 0.3
    return _per_scale(RISK_TOLERANCE_WEIGHTS, f)


def _per_marital_weights(age: int) -> dict:
    f: dict = {}
    if age < 22:
        f.update(Married=0.1, Divorced=0.0, Widowed=0.0)
    elif age < 30:
        f.update(Divorced=0.3, Widowed=0.0)
    elif age >= 65:
        f.update(Widowed=2.0)
    return _per_scale(MARITAL_STATUS_WEIGHTS, f)


def _per_life_event_weights(age: int) -> dict:
    f = {"Retirement_Planning": 0.0 if age < 45 else 2.0 if age >= 55 else 1.0,
         "College_Planning": 0.0 if age >= 50 else 1.0,
         "New_Baby": 1.0 if 20 <= age <= 42 else 0.0,
         "Marriage": 1.0 if age >= 20 else 0.0}
    return _per_scale(RECENT_LIFE_EVENT_WEIGHTS, f)


def personal_profile(anchor: dict, feats: dict, run_ts: datetime, key: str | None = None) -> dict:
    """Every PERSONAL_TRAINING_COLUMNS key except RECOMMENDED_PRODUCT."""
    account_id = anchor["ACCOUNT_ID"]
    key = key or account_id
    feats = feats or {}
    rng = stable_rng(key, PERSONAL_SALT)
    mrng = month_rng(key, PERSONAL_SALT, run_ts)
    jf = {f: jitter(1.0, mrng) for f in _per_JITTER_FIELDS}  # fixed order -> stable stream

    # --- fixed-order base draws (always drawn, used only when the real value is missing) ---
    age_draw = int(clamp(round(rng.gauss(44.6, 14.5)), *_per_AGE_RANGE))
    inc_z = rng.gauss(0.0, 1.0)
    credit_draw = rng.gauss(675.0, 60.0)
    own_draw = _voc_weighted_pick(HOME_OWNERSHIP_WEIGHTS, rng)
    bal_ratio = rng.lognormvariate(-1.3, 0.8)
    dep_frac = rng.uniform(*GEN_DEPOSIT_FRACTION)
    emp_u, edu_u, risk_u, marital_u, life_u = (rng.random() for _ in range(5))
    dependents_u = rng.random()
    flag_u = {f: rng.random() for f in _per_RATES}
    mobile_u = rng.random()
    dti_noise = rng.gauss(0.0, 0.05)
    sav_noise = rng.gauss(0.0, 3.0)
    job_draw = rng.expovariate(1 / 3.0)
    tenure_draw = rng.lognormvariate(1.35, 0.9)
    txn_draw = rng.gauss(24.0, 6.4)
    amt_z = rng.gauss(0.0, 0.8)
    logins_draw = rng.gauss(13.9, 5.5)
    visits_draw = rng.gauss(2.0, 1.4)
    since_draw = rng.lognormvariate(2.4, 1.0)
    csat_draw = rng.gauss(7.46, 1.45)
    overdraft_u = rng.random()

    # --- anchors (copied, never clamped) -------------------------------------------------
    age_a = _per_age(anchor.get("BIRTHDATE"), run_ts)
    age = age_a if age_a is not None else age_draw

    inc_a = as_float(anchor.get("ANNUAL_INCOME"))
    if inc_a is not None:
        income, inc_base = round(inc_a), inc_a
    else:
        inc_base = clamp(_per_income_median(age) * math.exp(_per_INCOME_SIGMA * inc_z), *_per_INC_RANGE)
        income = _per_fin(inc_base, *_per_INC_RANGE, 0, jf["ANNUAL_INCOME"])
    inc_eff = max(inc_base, 1.0)

    cr_a = as_float(anchor.get("CREDIT_SCORE"))
    if cr_a is not None:
        credit, cr_base = round(cr_a), cr_a
    else:
        cr_base = clamp(credit_draw, *_per_CREDIT_RANGE)
        credit = _per_fin(cr_base, *_per_CREDIT_RANGE, 0, jf["CREDIT_SCORE"])

    # --- home ownership (CoreLogic) -------------------------------------------------------
    owner = _per_flag(feats.get("IS_OWNER"))
    mortgage_bal = as_float(feats.get("MORTGAGE_BALANCE"))
    if owner is None:
        home = own_draw
    elif owner:
        home = "Mortgage" if mortgage_bal is not None and mortgage_bal > 0 else "Own"
    else:
        home = "Rent"
    has_mortgage = int(home == "Mortgage")

    region = map_region(anchor.get("STATE_CODE"), stable_rng(key, PERSONAL_SALT + "|region"))

    # --- money: real feed inside the income-relative window, else generated ---------------
    dbal = as_float(feats.get("DEPOSIT_BALANCE"))
    if _per_in_window(dbal, inc_eff, PER_BALANCE_WINDOW):
        bal_base, balance = dbal, round(dbal)
    else:
        bal_base = clamp(bal_ratio * inc_eff, GEN_BALANCE_FLOOR * inc_eff, PER_BALANCE_WINDOW[1] * inc_eff)
        balance = _per_fin(bal_base, GEN_BALANCE_FLOOR * inc_eff, PER_BALANCE_WINDOW[1] * inc_eff, 0,
                           jf["TOTAL_ACCOUNT_BALANCE"])
    monthly_inc = inc_eff / 12.0
    deposit = None
    for feed in ("DIRECT_DEPOSIT", "MONTHLY_CREDITS"):
        v = as_float(feats.get(feed))
        if _per_in_window(v, monthly_inc, DEPOSIT_WINDOW):
            deposit = round(v)
            break
    if deposit is None:
        deposit = _per_fin(dep_frac * monthly_inc, DEPOSIT_WINDOW[0] * monthly_inc,
                           DEPOSIT_WINDOW[1] * monthly_inc, 0, jf["MONTHLY_DEPOSIT_AMOUNT"])

    # --- categoricals (stable only) -------------------------------------------------------
    retirees = str(feats.get("LIFE_STAGE") or "").strip().lower() == "retirees"
    employment = _per_pick_u(_per_employment_weights(age, retirees), emp_u)
    education = _per_pick_u(_per_education_weights(age, inc_eff), edu_u)
    risk = _per_pick_u(_per_risk_weights(age, _per_propensity(feats.get("INVESTMENT_PROPENSITY"))), risk_u)
    marital = _per_pick_u(_per_marital_weights(age), marital_u)
    life_event = _per_pick_u(_per_life_event_weights(age), life_u)
    dep_w = [0.0 if (age < 22 and i > 0) or (age < 25 and i > 1) else w
             for i, w in enumerate(_per_DEPENDENT_WEIGHTS)]
    dependents = int(_per_pick_u({i: w for i, w in enumerate(dep_w)}, dependents_u))

    # --- ratios from un-jittered bases ----------------------------------------------------
    cr_eff = clamp(cr_base, 300.0, 850.0)
    dti_base = 0.48 - (cr_eff - 300.0) / 550.0 * 0.40 + dti_noise + (0.08 if has_mortgage else 0.0)
    dti = _per_fin(clamp(dti_base, 0.0, 0.68), 0.0, 0.68, 2, jf["DEBT_TO_INCOME_RATIO"])
    sav_base = 3.0 + 14.0 * math.sqrt(max(bal_base, 0.0) / inc_eff) + sav_noise
    savings_rate = _per_fin(clamp(sav_base, 0.1, 36.1), 0.1, 36.1, 1, jf["SAVINGS_RATE_PCT"])

    # --- holdings -------------------------------------------------------------------------
    seeded = {"HAS_MORTGAGE": has_mortgage}
    if dbal is not None:  # any deposit account in the feed
        seeded["HAS_CHECKING"] = 1
    elif as_float(feats.get("PRODUCT_COUNT")) is not None:  # FTA-covered, no deposit account
        seeded["HAS_CHECKING"] = 0
    for feat, flag in (("HAS_INVESTMENT", "HAS_INVESTMENT_ACCOUNT"), ("HAS_CARD", "HAS_CREDIT_CARD")):
        real = _per_flag(feats.get(feat))
        if real is not None:  # a real 0 is information; draw only when missing
            seeded[flag] = real
    if _per_flag(feats.get("HAS_LOAN")) == 0:  # no loan at all rules out an auto loan; 1 does not seed it
        seeded["HAS_AUTO_LOAN"] = 0
    ordered = allocate_flags(_per_RATES, flag_u, seeded, feats.get("PRODUCT_COUNT"))

    # --- tenure / job ---------------------------------------------------------------------
    adult_years = max(0, age - 18)
    opened = as_date(feats.get("FIRST_OPEN_DATE"))
    tenure = max(0, run_ts.year - opened.year) if opened is not None else int(clamp(round(tenure_draw), 0, 40))
    tenure = min(tenure, adult_years)
    job = 0 if employment in ("Student", "Unemployed") else int(clamp(round(job_draw), 0, 37))
    job = min(job, adult_years)

    # --- training-only behaviour ----------------------------------------------------------
    txn_count = _per_fin(txn_draw, 3, 47, 0, jf["MONTHLY_TRANSACTION_COUNT"])
    amt_median = 147.0 * (inc_eff / 55_829.0) ** 0.3
    avg_amt = _per_fin(amt_median * math.exp(amt_z), 10, 2817, 0, jf["AVG_TRANSACTION_AMOUNT"])
    mobile = int(mobile_u < _per_MOBILE_RATE)
    logins = _per_fin(logins_draw, 0, 32, 0, jf["DIGITAL_BANKING_LOGINS_MONTHLY"])
    visits = _per_fin(visits_draw, 0, 9, 0, jf["BRANCH_VISITS_MONTHLY"])
    since = int(clamp(round(since_draw), 1, 120))
    csat = _per_fin(csat_draw, 1.5, 10.0, 1, jf["CUSTOMER_SATISFACTION_SCORE"])
    overdraft = int(_per_pick_u(dict(enumerate(_per_OVERDRAFT_WEIGHTS)), overdraft_u))

    profile = {
        "ACCOUNTID": account_id,
        "AGE": age,
        "EDUCATION_LEVEL": education,
        "ANNUAL_INCOME": income,
        "CREDIT_SCORE": credit,
        "EMPLOYMENT_STATUS": employment,
        "YEARS_AT_CURRENT_JOB": job,
        "MARITAL_STATUS": marital,
        "NUMBER_OF_DEPENDENTS": dependents,
        "HOME_OWNERSHIP": home,
        "GEOGRAPHIC_REGION": region,
        "TOTAL_ACCOUNT_BALANCE": balance,
        "MONTHLY_TRANSACTION_COUNT": txn_count,
        "AVG_TRANSACTION_AMOUNT": avg_amt,
        "MONTHLY_DEPOSIT_AMOUNT": deposit,
        "DEBT_TO_INCOME_RATIO": dti,
        **ordered,
        "EXISTING_PRODUCT_COUNT": sum(ordered.values()),
        "YEARS_AS_CUSTOMER": tenure,
        "DIGITAL_BANKING_LOGINS_MONTHLY": logins,
        "BRANCH_VISITS_MONTHLY": visits,
        "MOBILE_APP_ACTIVE": mobile,
        "RISK_TOLERANCE": risk,
        "RECENT_LIFE_EVENT": life_event,
        "MONTHS_SINCE_LAST_PRODUCT": since,
        "CUSTOMER_SATISFACTION_SCORE": csat,
        "OVERDRAFT_COUNT_12M": overdraft,
        "SAVINGS_RATE_PCT": savings_rate,
    }
    return {c: profile[c] for c in PERSONAL_TRAINING_COLUMNS if c != "RECOMMENDED_PRODUCT"}


def _per_pick_u(weights: dict, u: float):
    """Weighted pick from a pre-drawn uniform u in [0, 1) so the rng stream never depends on weights."""
    total = sum(weights.values())
    target, acc, last = u * total, 0.0, None
    for k, w in weights.items():
        if w <= 0:
            continue
        last = k
        acc += w
        if target < acc:
            return k
    return last


def personal_input_row(profile: dict) -> dict:
    """Project a profile onto the personal subset (model input) columns."""
    return {c: profile[c] for c in PERSONAL_SUBSET_COLUMNS}
