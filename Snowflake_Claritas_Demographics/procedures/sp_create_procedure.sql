-- =============================================================================
-- FINS.PUBLIC.SP_GENERATE_CLARITAS_DEMOGRAPHICS  (Snowpark Python SP)
-- =============================================================================
-- Plan:    docs/superpowers/plans/2026-05-28-cumulus-plan-1-claritas-demographics.md
-- Task:    Plan 1 T6
-- Source:  procedures/sp_generate_claritas_demographics.py
--          (with cumulus_common.seed_for + cumulus_common.assert_coverage
--          inlined so the SP body is self-contained — no IMPORTS / no stage).
--
-- Audience: ACCOUNT_TYPE_FLAG = 'PERSON'
-- Cadence:  MONTHLY (TASK_MONTHLY_CLARITAS_DEMOGRAPHICS)
-- Salt:     "claritas"
-- =============================================================================

CREATE OR REPLACE PROCEDURE FINS.PUBLIC.SP_GENERATE_CLARITAS_DEMOGRAPHICS()
RETURNS STRING
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('snowflake-snowpark-python', 'pandas')
HANDLER = 'main'
EXECUTE AS CALLER
AS
$$
from __future__ import annotations

import hashlib
import random
import uuid
from datetime import date, datetime
from typing import Any


# -------------------------------------------------------------------
# Inlined from cumulus_common.seed
# -------------------------------------------------------------------
def seed_for(account_id: str, dataset_salt: str, run_ts: datetime) -> bytes:
    if not account_id:
        raise ValueError("account_id must be non-empty")
    if not dataset_salt:
        raise ValueError("dataset_salt must be non-empty")
    key = f"{account_id}|{dataset_salt}|{run_ts:%Y-%m}"
    return hashlib.sha256(key.encode("utf-8")).digest()


# -------------------------------------------------------------------
# Inlined from cumulus_common.coverage
# -------------------------------------------------------------------
def assert_coverage(session: Any, expected_sql: str, actual_sql: str) -> None:
    expected = session.sql(expected_sql).collect()[0][0]
    actual = session.sql(actual_sql).collect()[0][0]
    if actual < expected:
        missing = expected - actual
        raise RuntimeError(
            f"coverage gap: {missing} missing rows (expected {expected}, got {actual})"
        )


# -------------------------------------------------------------------
# Constants — keep in sync with the rowspec attachment
# -------------------------------------------------------------------
TABLE        = "FINS.PUBLIC.CLARITAS_DEMOGRAPHICS"
TASK_NAME    = "TASK_MONTHLY_CLARITAS_DEMOGRAPHICS"
DATASET_SALT = "claritas"

_AUDIENCE_PREDICATE = "ACCOUNT_TYPE_FLAG = 'PERSON'"
AUDIENCE_SQL = f"SELECT DISTINCT * FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS WHERE {_AUDIENCE_PREDICATE}"
COVERAGE_SQL = f"SELECT COUNT(DISTINCT ACCOUNT_ID) FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS WHERE {_AUDIENCE_PREDICATE}"


# -------------------------------------------------------------------
# Entry point — invoked via SP_RETRY_WRAPPER
# -------------------------------------------------------------------
def main(session: Any) -> str:
    log_id = str(uuid.uuid4())
    started = datetime.utcnow()
    rows_inserted, accounts_processed, status, err = 0, 0, "SUCCEEDED", None

    try:
        audience = session.sql(AUDIENCE_SQL).collect()
        accounts_processed = len(audience)

        records, errors = [], []
        for row in audience:
            try:
                records.append(_row_for(_anchor_to_dict(row), started))
            except Exception as exc:
                errors.append((row.ACCOUNT_ID, str(exc)[:200]))
        max_tolerated = max(10, len(audience) // 100)
        if len(errors) > max_tolerated:
            raise RuntimeError(
                f"row factory failed on {len(errors)}/{len(audience)} accounts "
                f"(tolerance {max_tolerated}); first: {errors[0] if errors else 'n/a'}"
            )
        if errors:
            err = (
                f"row factory failed on {len(errors)}/{len(audience)} accounts; "
                f"first: {errors[0]}"
            )

        rows_inserted = _merge(session, records)

        actual_sql = f"SELECT COUNT(DISTINCT ACCOUNT_ID) FROM {TABLE}"
        assert_coverage(session, COVERAGE_SQL, actual_sql)

    except Exception as exc:
        status = "FAILED"
        err = str(exc)[:4000]
        raise

    finally:
        duration_ms = int((datetime.utcnow() - started).total_seconds() * 1000)
        session.sql(
            """
            INSERT INTO FINS.PUBLIC.TASK_EXECUTION_LOG
                (LOG_ID, TASK_NAME, EXECUTION_TIME, STATUS, ROWS_INSERTED,
                 ACCOUNTS_PROCESSED, ERROR_MESSAGE, DURATION_MS)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            params=[log_id, TASK_NAME, started, status,
                    rows_inserted, accounts_processed, err, duration_ms],
        ).collect()

    return f"{TASK_NAME}: {status} rows={rows_inserted} accounts={accounts_processed}"


def _anchor_to_dict(row: Any) -> dict:
    if isinstance(row, dict):
        return row
    if hasattr(row, "asDict"):
        return dict(row.asDict())
    if hasattr(row, "_fields"):
        return {f.name: row[f.name] for f in row._fields}
    return dict(row)


def _anchor_in_audience(anchor: dict) -> bool:
    return anchor.get("ACCOUNT_TYPE_FLAG") == "PERSON"


# -------------------------------------------------------------------
# PRIZM segments
# -------------------------------------------------------------------
_PRIZM_AFFLUENT_EMPTY_NESTS = [
    ("UC", "Upper Crust", "Affluent Empty Nests"),
    ("MB", "Money & Brains", "Affluent Empty Nests"),
]
_PRIZM_HIGH_INCOME_FAMILY = [
    ("MS", "Movers & Shakers", "Established Families"),
]
_PRIZM_AFFLUENT_PRE_FAMILY = [
    ("YA", "Young Achievers", "Affluent Pre-Family"),
]
_PRIZM_ESTABLISHED_FAMILIES = [
    ("PP", "Pools & Patios", "Established Families"),
]
_PRIZM_EMPTY_NESTERS_MID = [
    ("BB", "Beltway Boomers", "Empty Nesters"),
]
_PRIZM_MID_INCOME_URBAN = [
    ("CR", "City Roots", "Urban Singles"),
    ("CD", "Cosmopolitan Domesticity", "Young Couples"),
    ("MT", "Multi-Cultural Talent", "Young Families"),
]
_PRIZM_LOW_INCOME = [
    ("SS", "Striving Singles", "Young Singles"),
    ("HR", "Hometown Retired", "Retirees"),
]
_PRIZM_RURAL = ("FS", "Farms & Suburbs", "Town/Rural Families")


def _age_from_birthdate(birthdate: Any, today: date) -> int:
    if birthdate is None:
        return 40
    if isinstance(birthdate, str):
        bd = datetime.fromisoformat(birthdate.split("T")[0]).date()
    elif isinstance(birthdate, datetime):
        bd = birthdate.date()
    elif isinstance(birthdate, date):
        bd = birthdate
    else:
        return 40
    return (today - bd).days // 365


def _life_stage(age: int, rng: random.Random) -> str:
    if age < 25:
        return "Gen Z"
    if age < 32:
        return "Young Singles" if rng.random() < 0.6 else "Young Couples"
    if age < 38:
        return "Young Couples"
    if age < 50:
        return "Young Families" if rng.random() < 0.65 else "Established Families"
    if age < 60:
        return "Established Families" if rng.random() < 0.6 else "Empty Nesters"
    if age < 70:
        return "Empty Nesters"
    return "Retirees"


def _urbanicity_from_zip(zip_code: Any, rng: random.Random) -> str:
    if not zip_code:
        return rng.choices(["Suburban", "Town", "Rural"], weights=[0.4, 0.4, 0.2])[0]
    first = str(zip_code)[0]
    if first in ("0", "1", "9"):
        return rng.choices(["Urban", "Suburban", "Town"], weights=[0.5, 0.35, 0.15])[0]
    if first in ("2", "3", "8"):
        return rng.choices(["Urban", "Suburban", "Town"], weights=[0.3, 0.5, 0.2])[0]
    return rng.choices(["Suburban", "Town", "Rural"], weights=[0.4, 0.4, 0.2])[0]


def _prizm_pool(income, life_stage, urbanicity, client_cat):
    pool = []
    if income >= 250_000 or client_cat == "Wealth Management":
        pool.extend(_PRIZM_AFFLUENT_EMPTY_NESTS + _PRIZM_HIGH_INCOME_FAMILY)
    if income >= 150_000:
        pool.extend(_PRIZM_AFFLUENT_PRE_FAMILY + _PRIZM_ESTABLISHED_FAMILIES + _PRIZM_EMPTY_NESTERS_MID)
    if 50_000 <= income < 150_000:
        pool.extend(_PRIZM_MID_INCOME_URBAN)
    if income < 50_000:
        pool.extend(_PRIZM_LOW_INCOME)
    if urbanicity == "Rural":
        pool.append(_PRIZM_RURAL)
    if life_stage == "Retirees":
        retiree_groups = {"Affluent Empty Nests", "Empty Nesters", "Retirees", "Town/Rural Families"}
        filtered = [p for p in pool if p[2] in retiree_groups]
        pool = filtered or pool
    if not pool:
        pool = _PRIZM_MID_INCOME_URBAN[:1]
    return pool


_HOUSEHOLD_BIAS = {
    "Gen Z":                [("Single", 0.55), ("Roommates", 0.35), ("Family with Children", 0.10)],
    "Young Singles":        [("Single", 0.70), ("Roommates", 0.25), ("Couple", 0.05)],
    "Young Couples":        [("Couple", 0.70), ("Family with Children", 0.20), ("Single", 0.10)],
    "Young Families":       [("Family with Children", 0.85), ("Couple", 0.10), ("Multi-Generational", 0.05)],
    "Established Families": [("Family with Children", 0.60), ("Couple", 0.25), ("Multi-Generational", 0.15)],
    "Empty Nesters":        [("Couple", 0.70), ("Single", 0.20), ("Multi-Generational", 0.10)],
    "Retirees":             [("Couple", 0.55), ("Single", 0.40), ("Multi-Generational", 0.05)],
}


def _household_composition(life_stage: str, rng: random.Random) -> str:
    bias = _HOUSEHOLD_BIAS[life_stage]
    choices, weights = zip(*[(c, w) for c, w in bias])
    return rng.choices(choices, weights=weights)[0]


_NET_WORTH_BANDS = ["<$50K", "$50K-$250K", "$250K-$1M", "$1M-$5M", "$5M+"]


def _net_worth_band(income, client_cat, rng):
    if income >= 1_000_000:
        idx = 4
    elif income >= 250_000:
        idx = 3
    elif income >= 100_000:
        idx = 2
    elif income >= 50_000:
        idx = 1
    else:
        idx = 0
    if client_cat == "Wealth Management":
        idx = max(idx, 3)
    idx += rng.choices([0, 0, 1, -1], weights=[0.5, 0.25, 0.15, 0.1])[0]
    idx = max(0, min(4, idx))
    return _NET_WORTH_BANDS[idx]


def _wealth_propensity(income, age, rng):
    base = min(100.0, 5 + (income / 5_000))
    if 45 <= age <= 65:
        base += 10
    return round(max(0.0, min(100.0, base + (rng.random() - 0.5) * 20)), 2)


def _investment_propensity(income, life_stage, rng):
    base = min(100.0, 10 + (income / 4_000))
    if life_stage in ("Empty Nesters", "Retirees", "Established Families"):
        base += 15
    return round(max(0.0, min(100.0, base + (rng.random() - 0.5) * 20)), 2)


def _mortgage_propensity(life_stage, client_cat, rng):
    base = {
        "Young Couples": 65, "Young Families": 80, "Established Families": 50,
        "Empty Nesters": 25, "Retirees": 5, "Young Singles": 30, "Gen Z": 15,
    }.get(life_stage, 30)
    if client_cat == "Wealth Management":
        base -= 10
    return round(max(0.0, min(100.0, base + (rng.random() - 0.5) * 20)), 2)


def _financial_stress(income, client_cat, rng):
    if client_cat == "Wealth Management" or income >= 250_000:
        return rng.choices(["Low", "Moderate"], weights=[0.85, 0.15])[0]
    if income >= 75_000:
        return rng.choices(["Low", "Moderate", "High"], weights=[0.6, 0.3, 0.1])[0]
    if income >= 35_000:
        return rng.choices(["Low", "Moderate", "High"], weights=[0.3, 0.5, 0.2])[0]
    return rng.choices(["Low", "Moderate", "High"], weights=[0.1, 0.4, 0.5])[0]


def _row_for(anchor: dict, run_ts: datetime) -> dict:
    if not _anchor_in_audience(anchor):
        raise ValueError(
            f"anchor {anchor.get('ACCOUNT_ID')} fails audience predicate "
            f"({_AUDIENCE_PREDICATE})"
        )

    account_id  = anchor["ACCOUNT_ID"]
    birthdate   = anchor.get("BIRTHDATE")
    income      = float(anchor.get("ANNUAL_INCOME") or 0)
    client_cat  = anchor.get("CLIENT_CATEGORY") or ""
    postal_code = anchor.get("POSTAL_CODE")

    seed = seed_for(account_id, DATASET_SALT, run_ts)
    rng  = random.Random(seed)

    age          = _age_from_birthdate(birthdate, run_ts.date())
    life_stage   = _life_stage(age, rng)
    urbanicity   = _urbanicity_from_zip(postal_code, rng)
    pool         = _prizm_pool(income, life_stage, urbanicity, client_cat)
    code, name, group = rng.choice(pool)
    household    = _household_composition(life_stage, rng)
    net_worth    = _net_worth_band(income, client_cat, rng)
    wealth_p     = _wealth_propensity(income, age, rng)
    investment_p = _investment_propensity(income, life_stage, rng)
    mortgage_p   = _mortgage_propensity(life_stage, client_cat, rng)
    stress       = _financial_stress(income, client_cat, rng)

    return {
        "ACCOUNT_ID":                 account_id,
        "PROFILE_MONTH":              run_ts.replace(day=1).date(),
        "PRIZM_SEGMENT_CODE":         code,
        "PRIZM_SEGMENT_NAME":         name,
        "PRIZM_LIFESTYLE_GROUP":      group,
        "LIFE_STAGE":                 life_stage,
        "HOUSEHOLD_COMPOSITION":      household,
        "ESTIMATED_NET_WORTH_BAND":   net_worth,
        "WEALTH_PROPENSITY_SCORE":    wealth_p,
        "INVESTMENT_PROPENSITY_SCORE":investment_p,
        "MORTGAGE_PROPENSITY_SCORE":  mortgage_p,
        "URBANICITY":                 urbanicity,
        "FINANCIAL_STRESS_INDICATOR": stress,
        "GENERATED_AT":               datetime(run_ts.year, run_ts.month, 1),
    }


def _merge(session: Any, records: list) -> int:
    if not records:
        return 0

    import pandas as pd
    df = pd.DataFrame(records)
    staging = "CLARITAS_DEMOGRAPHICS_STAGING"

    session.write_pandas(
        df, staging,
        auto_create_table=True, overwrite=True,
        database="FINS", schema="PUBLIC",
    )

    # write_pandas serializes Python datetime as datetime64[ns], which Snowflake
    # then auto-creates as NUMBER(38,0) holding nanoseconds-since-epoch in the
    # staging table. Cast back to TIMESTAMP_NTZ in the MERGE so the target
    # TIMESTAMP_NTZ(9) column type is satisfied.
    merge_sql = f"""
        MERGE INTO FINS.PUBLIC.CLARITAS_DEMOGRAPHICS tgt
        USING (
            SELECT
                ACCOUNT_ID,
                PROFILE_MONTH,
                PRIZM_SEGMENT_CODE,
                PRIZM_SEGMENT_NAME,
                PRIZM_LIFESTYLE_GROUP,
                LIFE_STAGE,
                HOUSEHOLD_COMPOSITION,
                ESTIMATED_NET_WORTH_BAND,
                WEALTH_PROPENSITY_SCORE,
                INVESTMENT_PROPENSITY_SCORE,
                MORTGAGE_PROPENSITY_SCORE,
                URBANICITY,
                FINANCIAL_STRESS_INDICATOR,
                TO_TIMESTAMP_NTZ(GENERATED_AT::NUMBER / 1000000000) AS GENERATED_AT
            FROM FINS.PUBLIC.{staging}
        ) src
        ON tgt.ACCOUNT_ID = src.ACCOUNT_ID
           AND tgt.PROFILE_MONTH = src.PROFILE_MONTH
        WHEN MATCHED THEN UPDATE SET
            PRIZM_SEGMENT_CODE          = src.PRIZM_SEGMENT_CODE,
            PRIZM_SEGMENT_NAME          = src.PRIZM_SEGMENT_NAME,
            PRIZM_LIFESTYLE_GROUP       = src.PRIZM_LIFESTYLE_GROUP,
            LIFE_STAGE                  = src.LIFE_STAGE,
            HOUSEHOLD_COMPOSITION       = src.HOUSEHOLD_COMPOSITION,
            ESTIMATED_NET_WORTH_BAND    = src.ESTIMATED_NET_WORTH_BAND,
            WEALTH_PROPENSITY_SCORE     = src.WEALTH_PROPENSITY_SCORE,
            INVESTMENT_PROPENSITY_SCORE = src.INVESTMENT_PROPENSITY_SCORE,
            MORTGAGE_PROPENSITY_SCORE   = src.MORTGAGE_PROPENSITY_SCORE,
            URBANICITY                  = src.URBANICITY,
            FINANCIAL_STRESS_INDICATOR  = src.FINANCIAL_STRESS_INDICATOR,
            GENERATED_AT                = src.GENERATED_AT
        WHEN NOT MATCHED THEN INSERT (
            ACCOUNT_ID, PROFILE_MONTH, PRIZM_SEGMENT_CODE, PRIZM_SEGMENT_NAME,
            PRIZM_LIFESTYLE_GROUP, LIFE_STAGE, HOUSEHOLD_COMPOSITION,
            ESTIMATED_NET_WORTH_BAND, WEALTH_PROPENSITY_SCORE,
            INVESTMENT_PROPENSITY_SCORE, MORTGAGE_PROPENSITY_SCORE,
            URBANICITY, FINANCIAL_STRESS_INDICATOR, GENERATED_AT
        ) VALUES (
            src.ACCOUNT_ID, src.PROFILE_MONTH, src.PRIZM_SEGMENT_CODE, src.PRIZM_SEGMENT_NAME,
            src.PRIZM_LIFESTYLE_GROUP, src.LIFE_STAGE, src.HOUSEHOLD_COMPOSITION,
            src.ESTIMATED_NET_WORTH_BAND, src.WEALTH_PROPENSITY_SCORE,
            src.INVESTMENT_PROPENSITY_SCORE, src.MORTGAGE_PROPENSITY_SCORE,
            src.URBANICITY, src.FINANCIAL_STRESS_INDICATOR, src.GENERATED_AT
        )
    """
    rows = session.sql(merge_sql).collect()
    return int(rows[0][0]) if rows else len(records)
$$;
