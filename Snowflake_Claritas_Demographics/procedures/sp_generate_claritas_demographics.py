"""Claritas-style synthetic demographics generator.

Snowpark Python stored procedure registered as FINS.PUBLIC.SP_GENERATE_CLARITAS_DEMOGRAPHICS.
Mirrors the canonical 5-step pattern from the Cumulus umbrella spec §5.1.

Audience: ACCOUNT_TYPE_FLAG = 'PERSON'
Cadence:  MONTHLY
Salt:     "claritas"
Plan:     docs/superpowers/plans/2026-05-28-cumulus-plan-1-claritas-demographics.md
Rowspec:  docs/superpowers/plans/attachments/cumulus-plan-1-claritas-demographics-rowspec.md
"""
from __future__ import annotations

import random
import uuid
from datetime import date, datetime
from typing import Any

# Locally + in Snowflake, cumulus_common is shipped via pip install -e or
# the IMPORTS clause on CREATE PROCEDURE.
from cumulus_common import seed_for, assert_coverage


# -------------------------------------------------------------------
# Constants — these MUST stay in sync with the rowspec attachment
# -------------------------------------------------------------------

TABLE        = "FINS.PUBLIC.CLARITAS_DEMOGRAPHICS"
TASK_NAME    = "TASK_MONTHLY_CLARITAS_DEMOGRAPHICS"
DATASET_SALT = "claritas"

# Audience predicate — the same string in 2 places (AUDIENCE_SQL + COVERAGE_SQL).
# A drift between the two would silently produce a coverage gap; we keep them
# both anchored on this single string.
_AUDIENCE_PREDICATE = "ACCOUNT_TYPE_FLAG = 'PERSON'"
AUDIENCE_SQL = f"SELECT DISTINCT * FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS WHERE {_AUDIENCE_PREDICATE}"
COVERAGE_SQL = f"SELECT COUNT(DISTINCT ACCOUNT_ID) FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS WHERE {_AUDIENCE_PREDICATE}"

# 15-column output contract (kept in sync with table DDL by the L1 schema test).
# v1.x multi-org-additive: ORG_ID leads the contract list; stamped from anchor.
EXPECTED_OUTPUT_COLUMNS: frozenset[str] = frozenset({
    "ORG_ID",
    "ACCOUNT_ID", "PROFILE_MONTH",
    "PRIZM_SEGMENT_CODE", "PRIZM_SEGMENT_NAME", "PRIZM_LIFESTYLE_GROUP",
    "LIFE_STAGE", "HOUSEHOLD_COMPOSITION",
    "ESTIMATED_NET_WORTH_BAND",
    "WEALTH_PROPENSITY_SCORE", "INVESTMENT_PROPENSITY_SCORE", "MORTGAGE_PROPENSITY_SCORE",
    "URBANICITY", "FINANCIAL_STRESS_INDICATOR",
    "GENERATED_AT",
})


# -------------------------------------------------------------------
# Entry point — invoked by FINS.PUBLIC.SP_RUN_WITH_RETRY → SP_GENERATE_CLARITAS_DEMOGRAPHICS
# -------------------------------------------------------------------

def main(session: Any) -> str:
    """The 5-step canonical pattern: read → build → MERGE → assert → log."""
    log_id = str(uuid.uuid4())
    started = datetime.utcnow()
    rows_inserted, accounts_processed, status, err = 0, 0, "SUCCEEDED", None

    try:
        # 1. Read audience from the shared view (zero-copy fresh anchors).
        audience = session.sql(AUDIENCE_SQL).collect()
        accounts_processed = len(audience)

        # 2. Build deterministic rows; tolerate up to 1% per-row failures.
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

        # 3. Idempotent MERGE on PK (ACCOUNT_ID, PROFILE_MONTH).
        rows_inserted = _merge(session, records)

        # 4. Coverage assertion — canonical message format from spec §6.2.
        actual_sql = f"SELECT COUNT(DISTINCT ACCOUNT_ID) FROM {TABLE}"
        assert_coverage(session, COVERAGE_SQL, actual_sql)

    except Exception as exc:
        status = "FAILED"
        err = str(exc)[:4000]
        raise

    finally:
        # 5. Always log — success or failure.
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
    """Snowpark Row → plain dict so _row_for can be tested with dict literals."""
    if isinstance(row, dict):
        return row
    if hasattr(row, "asDict"):
        return dict(row.asDict())
    if hasattr(row, "_fields"):
        return {f.name: row[f.name] for f in row._fields}
    return dict(row)


# -------------------------------------------------------------------
# _anchor_in_audience — defense-in-depth for the audience predicate
# -------------------------------------------------------------------

def _anchor_in_audience(anchor: dict) -> bool:
    """Translate the AUDIENCE_PREDICATE into a Python predicate."""
    return anchor.get("ACCOUNT_TYPE_FLAG") == "PERSON"


# -------------------------------------------------------------------
# _row_for — the substantive synthesis logic (per rowspec)
# -------------------------------------------------------------------

# 12 PRIZM segments — recognisable subset, NOT license-grade.
# (code, name, lifestyle_group)
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
    """Tolerate ISO string, datetime, date, or None inputs."""
    if birthdate is None:
        return 40  # safe default; should not happen for PERSON audience
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
    """Hand-tuned heuristic from US ZIP first digit. Not real Esri data."""
    if not zip_code:
        return rng.choices(["Suburban", "Town", "Rural"], weights=[0.4, 0.4, 0.2])[0]
    first = str(zip_code)[0]
    if first in ("0", "1", "9"):
        return rng.choices(["Urban", "Suburban", "Town"], weights=[0.5, 0.35, 0.15])[0]
    if first in ("2", "3", "8"):
        return rng.choices(["Urban", "Suburban", "Town"], weights=[0.3, 0.5, 0.2])[0]
    return rng.choices(["Suburban", "Town", "Rural"], weights=[0.4, 0.4, 0.2])[0]


def _prizm_pool(income: float, life_stage: str, urbanicity: str, client_cat: str) -> list[tuple[str, str, str]]:
    """Build a candidate PRIZM pool weighted by anchor signal."""
    pool: list[tuple[str, str, str]] = []
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
    # Life-stage filter so retirees don't end up "Young Achievers".
    if life_stage == "Retirees":
        retiree_groups = {"Affluent Empty Nests", "Empty Nesters", "Retirees", "Town/Rural Families"}
        filtered = [p for p in pool if p[2] in retiree_groups]
        pool = filtered or pool
    if not pool:
        pool = _PRIZM_MID_INCOME_URBAN[:1]  # fallback: City Roots
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


def _net_worth_band(income: float, client_cat: str, rng: random.Random) -> str:
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


def _wealth_propensity(income: float, age: int, rng: random.Random) -> float:
    base = min(100.0, 5 + (income / 5_000))
    if 45 <= age <= 65:
        base += 10
    return round(max(0.0, min(100.0, base + (rng.random() - 0.5) * 20)), 2)


def _investment_propensity(income: float, life_stage: str, rng: random.Random) -> float:
    base = min(100.0, 10 + (income / 4_000))
    if life_stage in ("Empty Nesters", "Retirees", "Established Families"):
        base += 15
    return round(max(0.0, min(100.0, base + (rng.random() - 0.5) * 20)), 2)


def _mortgage_propensity(life_stage: str, client_cat: str, rng: random.Random) -> float:
    base = {
        "Young Couples": 65, "Young Families": 80, "Established Families": 50,
        "Empty Nesters": 25, "Retirees": 5, "Young Singles": 30, "Gen Z": 15,
    }.get(life_stage, 30)
    if client_cat == "Wealth Management":
        base -= 10
    return round(max(0.0, min(100.0, base + (rng.random() - 0.5) * 20)), 2)


def _financial_stress(income: float, client_cat: str, rng: random.Random) -> str:
    if client_cat == "Wealth Management" or income >= 250_000:
        return rng.choices(["Low", "Moderate"], weights=[0.85, 0.15])[0]
    if income >= 75_000:
        return rng.choices(["Low", "Moderate", "High"], weights=[0.6, 0.3, 0.1])[0]
    if income >= 35_000:
        return rng.choices(["Low", "Moderate", "High"], weights=[0.3, 0.5, 0.2])[0]
    return rng.choices(["Low", "Moderate", "High"], weights=[0.1, 0.4, 0.5])[0]


def _row_for(anchor: dict, run_ts: datetime) -> dict:
    """Pure function: anchor row → fact row. Deterministic.

    Per rowspec: seed = SHA-256(account_id || "claritas" || YYYY-MM).
    Mid-month re-runs replay exactly; new month rolls a new seed.
    """
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
        # v1.x multi-org-additive: ORG_ID leads each emitted row (default 'JDO' backstop
        # if anchor lacks the column — backward-compat with pre-migration fixtures).
        "ORG_ID":                     anchor.get("ORG_ID") or "JDO",
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
        # Bucket GENERATED_AT to the month-start so same-month re-runs produce
        # byte-identical rows (the deterministic-month-bucket contract). The
        # actual wall-clock execution time is captured in TASK_EXECUTION_LOG.
        "GENERATED_AT":               datetime(run_ts.year, run_ts.month, 1),
    }


# -------------------------------------------------------------------
# _merge — idempotent MERGE on PK (ACCOUNT_ID, PROFILE_MONTH)
# -------------------------------------------------------------------

def _merge(session: Any, records: list[dict]) -> int:
    """MERGE records into TABLE. Returns rows MERGED.

    Implementation: write_pandas → staging table → MERGE statement.
    The staging table is overwrite-truncated each call so re-runs produce
    consistent state.
    """
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
    # v1.x multi-org-additive: ORG_ID is part of the join eligibility; we
    # never UPDATE it in WHEN MATCHED (a row can't change orgs).
    merge_sql = f"""
        MERGE INTO FINS.PUBLIC.CLARITAS_DEMOGRAPHICS tgt
        USING (
            SELECT
                ORG_ID,
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
        ON tgt.ORG_ID = src.ORG_ID
           AND tgt.ACCOUNT_ID = src.ACCOUNT_ID
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
            ORG_ID, ACCOUNT_ID, PROFILE_MONTH, PRIZM_SEGMENT_CODE, PRIZM_SEGMENT_NAME,
            PRIZM_LIFESTYLE_GROUP, LIFE_STAGE, HOUSEHOLD_COMPOSITION,
            ESTIMATED_NET_WORTH_BAND, WEALTH_PROPENSITY_SCORE,
            INVESTMENT_PROPENSITY_SCORE, MORTGAGE_PROPENSITY_SCORE,
            URBANICITY, FINANCIAL_STRESS_INDICATOR, GENERATED_AT
        ) VALUES (
            src.ORG_ID, src.ACCOUNT_ID, src.PROFILE_MONTH, src.PRIZM_SEGMENT_CODE, src.PRIZM_SEGMENT_NAME,
            src.PRIZM_LIFESTYLE_GROUP, src.LIFE_STAGE, src.HOUSEHOLD_COMPOSITION,
            src.ESTIMATED_NET_WORTH_BAND, src.WEALTH_PROPENSITY_SCORE,
            src.INVESTMENT_PROPENSITY_SCORE, src.MORTGAGE_PROPENSITY_SCORE,
            src.URBANICITY, src.FINANCIAL_STRESS_INDICATOR, src.GENERATED_AT
        )
    """
    rows = session.sql(merge_sql).collect()
    return int(rows[0][0]) if rows else len(records)
