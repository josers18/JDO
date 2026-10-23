from datetime import datetime
from statistics import mean

from prodrec.personal import personal_input_row, personal_profile
from prodrec.vocab import (
    EDUCATION_LEVEL_WEIGHTS, EMPLOYMENT_STATUS_WEIGHTS, GEOGRAPHIC_REGION_WEIGHTS,
    HOME_OWNERSHIP_WEIGHTS, MARITAL_STATUS_WEIGHTS, PERSONAL_SUBSET_COLUMNS,
    PERSONAL_TRAINING_COLUMNS, RECENT_LIFE_EVENT_WEIGHTS, RISK_TOLERANCE_WEIGHTS,
)

T0 = datetime(2026, 10, 23)
DEC2 = ("DEBT_TO_INCOME_RATIO",)
DEC1 = ("SAVINGS_RATE_PCT", "CUSTOMER_SATISFACTION_SCORE")
FLAGS = ("HAS_CHECKING", "HAS_SAVINGS", "HAS_INVESTMENT_ACCOUNT", "HAS_MORTGAGE",
         "HAS_AUTO_LOAN", "HAS_CREDIT_CARD")


def anchor(**kw):
    a = {"ACCOUNT_ID": "001am00000PTEST", "BIRTHDATE": "1986-05-10", "ANNUAL_INCOME": 84_000,
         "CREDIT_SCORE": 700, "STATE_CODE": "TX"}
    a.update(kw)
    return a


def age_anchor(age, **kw):
    return anchor(BIRTHDATE=f"{2026 - age}-01-15", **kw)


def test_anchor_values_copied_unclamped():
    p = personal_profile(anchor(ANNUAL_INCOME=2_400_000, CREDIT_SCORE=842), {}, T0)
    assert p["ANNUAL_INCOME"] == 2_400_000 and p["CREDIT_SCORE"] == 842
    # age is as of the run month's first day (T0 = 2026-10-23 -> 2026-10-01)
    assert personal_profile(anchor(BIRTHDATE="1986-10-01"), {}, T0)["AGE"] == 40
    assert personal_profile(anchor(BIRTHDATE="1986-10-02"), {}, T0)["AGE"] == 39


def test_null_anchor_still_complete():
    a = anchor(BIRTHDATE=None, ANNUAL_INCOME=None, CREDIT_SCORE=None, STATE_CODE=None)
    p = personal_profile(a, {}, T0)
    for c, v in p.items():
        assert v is not None, c
        if isinstance(v, (int, float)):
            assert v >= 0, c
    assert 18 <= p["AGE"] <= 85
    assert 15_000 <= p["ANNUAL_INCOME"] <= 750_000
    assert 400 <= p["CREDIT_SCORE"] <= 850


def test_home_ownership_from_corelogic():
    m = personal_profile(anchor(), {"IS_OWNER": True, "MORTGAGE_BALANCE": 200_000}, T0)
    o = personal_profile(anchor(), {"IS_OWNER": True, "MORTGAGE_BALANCE": 0}, T0)
    o2 = personal_profile(anchor(), {"IS_OWNER": 1, "MORTGAGE_BALANCE": None}, T0)
    r = personal_profile(anchor(), {"IS_OWNER": False, "MORTGAGE_BALANCE": 50_000}, T0)
    assert (m["HOME_OWNERSHIP"], m["HAS_MORTGAGE"]) == ("Mortgage", 1)
    assert (o["HOME_OWNERSHIP"], o["HAS_MORTGAGE"]) == ("Own", 0)
    assert (o2["HOME_OWNERSHIP"], o2["HAS_MORTGAGE"]) == ("Own", 0)
    assert (r["HOME_OWNERSHIP"], r["HAS_MORTGAGE"]) == ("Rent", 0)
    drawn = {personal_profile(anchor(), {}, T0, key=f"k{i}")["HOME_OWNERSHIP"] for i in range(200)}
    assert drawn == set(HOME_OWNERSHIP_WEIGHTS)
    for i in range(50):
        d = personal_profile(anchor(), {}, T0, key=f"k{i}")
        assert d["HAS_MORTGAGE"] == int(d["HOME_OWNERSHIP"] == "Mortgage")


def test_region_from_state():
    assert personal_profile(anchor(STATE_CODE="TX"), {}, T0)["GEOGRAPHIC_REGION"] == "Southwest"
    assert personal_profile(anchor(STATE_CODE="ZZ"), {}, T0)["GEOGRAPHIC_REGION"] in GEOGRAPHIC_REGION_WEIGHTS


def test_real_feed_used_when_sane():
    inc = 120_000
    feats = {"DEPOSIT_BALANCE": 30_000, "DIRECT_DEPOSIT": 6_000, "FIRST_OPEN_DATE": "2016-03-01",
             "HAS_INVESTMENT": 1, "HAS_CARD": 0}
    p = personal_profile(anchor(ANNUAL_INCOME=inc), feats, T0)
    assert p["TOTAL_ACCOUNT_BALANCE"] == 30_000
    assert p["MONTHLY_DEPOSIT_AMOUNT"] == 6_000
    assert p["YEARS_AS_CUSTOMER"] == 10
    assert (p["HAS_CHECKING"], p["HAS_INVESTMENT_ACCOUNT"], p["HAS_CREDIT_CARD"]) == (1, 1, 0)
    q = personal_profile(anchor(ANNUAL_INCOME=inc), {"DIRECT_DEPOSIT": 99_999, "MONTHLY_CREDITS": 4_000}, T0)
    assert q["MONTHLY_DEPOSIT_AMOUNT"] == 4_000


def test_feed_zero_flags_are_authoritative():
    for i in range(40):
        p = personal_profile(anchor(), {"HAS_INVESTMENT": 0, "HAS_CARD": 0}, T0, key=f"k{i}")
        assert p["HAS_INVESTMENT_ACCOUNT"] == 0 and p["HAS_CREDIT_CARD"] == 0


def test_absurd_feed_falls_back():
    inc = 80_000
    p = personal_profile(anchor(ANNUAL_INCOME=inc), {"DIRECT_DEPOSIT": 50 * inc / 12}, T0)
    assert p["MONTHLY_DEPOSIT_AMOUNT"] != round(50 * inc / 12)
    assert 0.05 * inc / 12 <= p["MONTHLY_DEPOSIT_AMOUNT"] <= 1.5 * inc / 12
    q = personal_profile(anchor(ANNUAL_INCOME=inc), {"DEPOSIT_BALANCE": 50 * inc}, T0)
    assert q["TOTAL_ACCOUNT_BALANCE"] <= 5 * inc
    r = personal_profile(anchor(ANNUAL_INCOME=inc), {"DEPOSIT_BALANCE": -100}, T0)
    assert r["TOTAL_ACCOUNT_BALANCE"] >= 0


def test_generated_money_scales_with_income():
    inc = 2_400_000
    for i in range(30):
        p = personal_profile(anchor(ANNUAL_INCOME=inc), {}, T0, key=f"k{i}")
        assert 0.05 * inc / 12 <= p["MONTHLY_DEPOSIT_AMOUNT"] <= 1.5 * inc / 12
        assert p["TOTAL_ACCOUNT_BALANCE"] <= 5 * inc
        assert p["TOTAL_ACCOUNT_BALANCE"] > 100_000


def test_age_gates_employment():
    def share(age, status, **feats):
        n = 500
        hits = [personal_profile(age_anchor(age), feats, T0, key=f"k{i}")["EMPLOYMENT_STATUS"] for i in range(n)]
        return hits.count(status) / n
    assert share(30, "Retired") == 0
    assert share(45, "Student") == 0
    assert share(75, "Retired") >= 0.8
    assert share(20, "Student") >= 0.4
    assert share(55, "Retired", LIFE_STAGE="Retirees") > share(55, "Retired")
    assert share(40, "Retired", LIFE_STAGE="Retirees") == 0


def test_education_gates_and_income_lean():
    for i in range(300):
        p = personal_profile(age_anchor(20), {}, T0, key=f"k{i}")
        assert p["EDUCATION_LEVEL"] not in ("Doctorate", "Masters")

    def adv(income):
        n = 400
        got = [personal_profile(anchor(ANNUAL_INCOME=income), {}, T0, key=f"k{i}")["EDUCATION_LEVEL"]
               for i in range(n)]
        return sum(g in ("Masters", "Doctorate") for g in got) / n
    assert adv(250_000) > adv(25_000)


def test_risk_leans_with_propensity_and_age():
    def share(age, tol, **feats):
        n = 500
        got = [personal_profile(age_anchor(age), feats, T0, key=f"k{i}")["RISK_TOLERANCE"] for i in range(n)]
        return got.count(tol) / n
    assert share(40, "Aggressive", INVESTMENT_PROPENSITY=90) > share(40, "Aggressive", INVESTMENT_PROPENSITY=20)
    rising = [share(40, "Aggressive", INVESTMENT_PROPENSITY=v) for v in (5, 15, 90)]
    assert rising[0] < rising[1] < rising[2], rising
    assert share(70, "Conservative") > share(40, "Conservative")


def test_dti_falls_with_credit():
    def avg(score):
        return mean(personal_profile(anchor(CREDIT_SCORE=score), {}, T0, key=f"k{i}")["DEBT_TO_INCOME_RATIO"]
                    for i in range(300))
    assert avg(800) < avg(550)
    for i in range(100):
        d = personal_profile(anchor(CREDIT_SCORE=300 + i), {}, T0, key=f"k{i}")["DEBT_TO_INCOME_RATIO"]
        assert 0 <= d <= 0.68


def test_mortgage_adds_to_dti():
    def avg(owner):
        feats = {"IS_OWNER": owner, "MORTGAGE_BALANCE": 100_000 if owner else None}
        return mean(personal_profile(anchor(), feats, T0, key=f"k{i}")["DEBT_TO_INCOME_RATIO"]
                    for i in range(300))
    assert 0.04 < avg(True) - avg(False) < 0.12


def test_savings_rate_rises_with_balance():
    def avg(bal):
        return mean(personal_profile(anchor(ANNUAL_INCOME=80_000), {"DEPOSIT_BALANCE": bal}, T0,
                                     key=f"k{i}")["SAVINGS_RATE_PCT"] for i in range(200))
    assert avg(200_000) > avg(2_000)
    for i in range(100):
        s = personal_profile(anchor(), {"DEPOSIT_BALANCE": i * 20_000}, T0, key=f"k{i}")["SAVINGS_RATE_PCT"]
        assert 0.1 <= s <= 36.1


def test_tenure_le_adult_years(person_anchors):
    for a in person_anchors:
        p = personal_profile(a, {"FIRST_OPEN_DATE": "1990-01-01"}, T0)
        assert p["YEARS_AS_CUSTOMER"] <= max(0, p["AGE"] - 18), a["ACCOUNT_ID"]
        q = personal_profile(a, {}, T0)
        assert q["YEARS_AS_CUSTOMER"] <= max(0, q["AGE"] - 18)


def test_product_count_equals_flags(person_anchors):
    for a in person_anchors:
        p = personal_profile(a, {}, T0)
        assert p["EXISTING_PRODUCT_COUNT"] == sum(p[f] for f in FLAGS)
    p = personal_profile(anchor(), {"DEPOSIT_BALANCE": 10, "HAS_INVESTMENT": 1, "HAS_CARD": 1}, T0)
    assert p["EXISTING_PRODUCT_COUNT"] == sum(p[f] for f in FLAGS)


def test_idempotent_within_month_bounded_drift(person_anchors):
    cont = ("ANNUAL_INCOME", "CREDIT_SCORE", "TOTAL_ACCOUNT_BALANCE", "MONTHLY_DEPOSIT_AMOUNT",
            "DEBT_TO_INCOME_RATIO", "SAVINGS_RATE_PCT", "MONTHLY_TRANSACTION_COUNT",
            "AVG_TRANSACTION_AMOUNT", "DIGITAL_BANKING_LOGINS_MONTHLY", "BRANCH_VISITS_MONTHLY",
            "CUSTOMER_SATISFACTION_SCORE")
    for a in person_anchors:
        a = {**a, "BIRTHDATE": None, "ANNUAL_INCOME": None, "CREDIT_SCORE": None}  # force generation
        p1 = personal_profile(a, {}, datetime(2026, 10, 1))
        p2 = personal_profile(a, {}, datetime(2026, 10, 23))
        p3 = personal_profile(a, {}, datetime(2026, 11, 1))
        assert p1 == p2
        for c in p1:
            if c in cont:
                slack = 0.01 if c in DEC2 else 0.1 if c in DEC1 else 1
                assert abs(p3[c] - p1[c]) <= abs(p1[c]) * (1.03 / 0.97 - 1) + slack, c
            else:
                assert p3[c] == p1[c], c


def test_vocab_and_columns(person_anchors):
    for a in person_anchors:
        p = personal_profile(a, {}, T0)
        assert tuple(p) == tuple(c for c in PERSONAL_TRAINING_COLUMNS if c != "RECOMMENDED_PRODUCT")
        assert p["ACCOUNTID"] == a["ACCOUNT_ID"]
        assert p["EDUCATION_LEVEL"] in EDUCATION_LEVEL_WEIGHTS
        assert p["EMPLOYMENT_STATUS"] in EMPLOYMENT_STATUS_WEIGHTS
        assert p["MARITAL_STATUS"] in MARITAL_STATUS_WEIGHTS
        assert p["HOME_OWNERSHIP"] in HOME_OWNERSHIP_WEIGHTS
        assert p["GEOGRAPHIC_REGION"] in GEOGRAPHIC_REGION_WEIGHTS
        assert p["RISK_TOLERANCE"] in RISK_TOLERANCE_WEIGHTS
        assert p["RECENT_LIFE_EVENT"] in RECENT_LIFE_EVENT_WEIGHTS
        assert tuple(personal_input_row(p)) == PERSONAL_SUBSET_COLUMNS
        assert all(v is not None for v in p.values())
        for c, v in p.items():
            if c in DEC2 + DEC1:
                assert isinstance(v, float), c
            elif c not in ("ACCOUNTID", "EDUCATION_LEVEL", "EMPLOYMENT_STATUS", "MARITAL_STATUS",
                           "HOME_OWNERSHIP", "GEOGRAPHIC_REGION", "RISK_TOLERANCE", "RECENT_LIFE_EVENT"):
                assert type(v) is int, c


def test_training_key_changes_generated_fields():
    a = anchor(BIRTHDATE=None, ANNUAL_INCOME=None, CREDIT_SCORE=None)
    assert personal_profile(a, {}, T0) != personal_profile(a, {}, T0, key=a["ACCOUNT_ID"] + "#T1")
    assert personal_profile(a, {}, T0, key="x#T1")["ACCOUNTID"] == a["ACCOUNT_ID"]


def test_age_anchor_exact():
    assert [personal_profile(age_anchor(a), {}, T0)["AGE"] for a in (20, 30, 45, 75)] == [20, 30, 45, 75]


def test_absurd_age_with_null_income_is_total():
    p = personal_profile(anchor(BIRTHDATE="1800-01-01", ANNUAL_INCOME=None), {}, T0)
    assert p["AGE"] >= 200 and p["ANNUAL_INCOME"] > 0


def test_product_count_feed_drives_count():
    for i in range(60):
        k = f"k{i}"
        # one seeded flag (card) + PRODUCT_COUNT=2 -> exactly 2, still the flag sum
        p = personal_profile(anchor(), {"PRODUCT_COUNT": 2, "HAS_CARD": 1, "IS_OWNER": False}, T0, key=k)
        assert p["EXISTING_PRODUCT_COUNT"] == 2 == sum(p[f] for f in FLAGS)
        assert p["HAS_CREDIT_CARD"] == 1
        big = personal_profile(anchor(), {"PRODUCT_COUNT": 9, "IS_OWNER": False, "DEPOSIT_BALANCE": 100}, T0, key=k)
        assert big["EXISTING_PRODUCT_COUNT"] == 5 == sum(big[f] for f in FLAGS)  # mortgage fixed at 0
        zero = personal_profile(anchor(), {"PRODUCT_COUNT": 0, "HAS_CARD": 1, "IS_OWNER": False}, T0, key=k)
        assert zero["EXISTING_PRODUCT_COUNT"] == 1  # clamped up to the seeded flags
    mix = {f: sum(personal_profile(anchor(), {"PRODUCT_COUNT": 3, "IS_OWNER": False}, T0, key=f"m{i}")[f]
                  for i in range(300)) for f in ("HAS_SAVINGS", "HAS_INVESTMENT_ACCOUNT")}
    assert mix["HAS_SAVINGS"] > mix["HAS_INVESTMENT_ACCOUNT"]  # likelier products are picked first


def test_checking_rule():
    for i in range(40):
        k = f"k{i}"
        assert personal_profile(anchor(), {"DEPOSIT_BALANCE": 5, "PRODUCT_COUNT": 3}, T0, key=k)["HAS_CHECKING"] == 1
        assert personal_profile(anchor(), {"DEPOSIT_BALANCE": None, "PRODUCT_COUNT": 3}, T0, key=k)["HAS_CHECKING"] == 0
    drawn = {personal_profile(anchor(), {}, T0, key=f"k{i}")["HAS_CHECKING"] for i in range(100)}
    assert drawn == {0, 1}


def test_no_loan_rules_out_auto_loan():
    assert all(personal_profile(anchor(), {"HAS_LOAN": 0}, T0, key=f"k{i}")["HAS_AUTO_LOAN"] == 0
               for i in range(60))
    assert {personal_profile(anchor(), {"HAS_LOAN": 1}, T0, key=f"k{i}")["HAS_AUTO_LOAN"] for i in range(100)} == {0, 1}


def test_real_values_exact_across_months():
    feats = {"DEPOSIT_BALANCE": 30_000, "DIRECT_DEPOSIT": 6_000}
    a = anchor(ANNUAL_INCOME=120_000, CREDIT_SCORE=720)
    p1 = personal_profile(a, feats, datetime(2026, 10, 23))
    p2 = personal_profile(a, feats, datetime(2026, 11, 23))
    for c in ("ANNUAL_INCOME", "CREDIT_SCORE", "TOTAL_ACCOUNT_BALANCE", "MONTHLY_DEPOSIT_AMOUNT"):
        assert p1[c] == p2[c], c


def test_age_is_as_of_run_month_start():
    # a birthday falling mid-month must not change the age between same-month re-runs
    a = anchor(BIRTHDATE="1986-10-15")
    ages = {personal_profile(a, {}, datetime(2026, 10, d))["AGE"] for d in (1, 14, 15, 31)}
    assert ages == {39}
    assert personal_profile(a, {}, datetime(2026, 11, 1))["AGE"] == 40
    assert personal_profile(anchor(BIRTHDATE="1986-10-01"), {}, datetime(2026, 10, 1))["AGE"] == 40
