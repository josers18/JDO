"""MoneyGuidePro / eMoney / NaviPlan-style synthetic financial-plan generator.

Snowpark Python stored procedure registered as
FINS.PUBLIC.SP_GENERATE_MGP_FINANCIAL_PLANS. Smallest Cumulus dataset by
2.9× — Wealth Management only (~3,920 anchors). Emits exactly one row
per Wealth anchor per calendar month (1:1, ~3,920 rows/month).

Audience: CLIENT_CATEGORY = 'Wealth Management'
Cadence:  MONTHLY (07:00 UTC on the 1st)
Salt:     "mgp" (month-bucketed; single salt — no year-stable subfields,
          unlike Plan 7's three-salt arrangement; back to Plan 6's shape)
Plan:     docs/superpowers/plans/2026-05-28-cumulus-plan-8-mgp-financial-plans.md
Rowspec:  docs/superpowers/plans/attachments/cumulus-plan-8-mgp-financial-plans-rowspec.md

STRUCTURAL DEVIATIONS from Plans 1-7 (load-bearing for tests, not the SP itself):
  1. Smallest audience by 2.9×. SAMPLE_ANCHORS at 100 anchors yields ~3-5
     Wealth anchors — too narrow for distributional convergence tests.
     L1 shifts to per-anchor deterministic invariants; the SP shape is
     unaffected, but the test contract changes.
  2. Status-driven NULL semantics. PLAN_STATUS (Active/Draft/Stale) gates
     LAST_REVIEW_DATE and NEXT_REVIEW_DATE — the first Cumulus dataset whose
     NULL semantics depend on a non-Boolean enum. PLAN_STATUS must be
     computed BEFORE the review-date helper so NULL gating is determined
     upfront (status-first computation; see _row_for body).
"""
from __future__ import annotations

import random
import uuid
from datetime import date, datetime, timedelta
from typing import Any

from cumulus_common import seed_for, assert_coverage


# -------------------------------------------------------------------
# Constants — these MUST stay in sync with the rowspec attachment
# -------------------------------------------------------------------

TABLE        = "FINS.PUBLIC.MGP_FINANCIAL_PLANS"
TASK_NAME    = "TASK_MONTHLY_MGP_FINANCIAL_PLANS"
DATASET_SALT = "mgp"

_AUDIENCE_PREDICATE = "CLIENT_CATEGORY = 'Wealth Management'"
AUDIENCE_SQL = f"SELECT DISTINCT * FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS WHERE {_AUDIENCE_PREDICATE}"
COVERAGE_SQL = f"SELECT COUNT(DISTINCT ACCOUNT_ID) FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS WHERE {_AUDIENCE_PREDICATE}"

EXPECTED_OUTPUT_COLUMNS: frozenset[str] = frozenset({
    "ACCOUNT_ID", "PROFILE_MONTH",
    "PLAN_STATUS", "PLAN_LAST_UPDATED_DATE",
    "RETIREMENT_TARGET_AGE", "MONTHLY_INCOME_TARGET_USD",
    "TOTAL_GOAL_AMOUNT_USD", "GOAL_COUNT",
    "MONTE_CARLO_SUCCESS_PCT", "RECOMMENDED_ASSET_ALLOCATION",
    "LAST_REVIEW_DATE", "NEXT_REVIEW_DATE",
    "ADVISOR_NOTES_FLAG", "GENERATED_AT",
})


_GOAL_TYPES = ["Retirement", "College", "Vacation Home", "Legacy", "Travel", "Education"]


# -------------------------------------------------------------------
# Audience predicate — defense-in-depth in Python.
# -------------------------------------------------------------------

def _anchor_in_audience(anchor: dict) -> bool:
    """Translate _AUDIENCE_PREDICATE into a Python predicate.

    Wealth Management anchors only, with a non-empty ACCOUNT_ID. The L1
    audience-violator test depends on this returning False for both a
    missing ACCOUNT_ID and a wrong CLIENT_CATEGORY.
    """
    return (
        anchor.get("CLIENT_CATEGORY") == "Wealth Management"
        and bool(anchor.get("ACCOUNT_ID"))
    )


# -------------------------------------------------------------------
# Per-field synthesis helpers — implemented verbatim from the rowspec.
# -------------------------------------------------------------------

def _age_from_birthdate(birthdate: Any, ref_date: date) -> int:
    """ISO-string / date / datetime → integer age at ref_date.

    BIRTHDATE in V_ACCOUNT_ANCHORS is an ISO 'YYYY-MM-DD' string in the
    fixtures and the live view. For Wealth Management the field is 100%
    populated, but we tolerate other shapes for L1 fixture flexibility.
    """
    if birthdate is None:
        return 40
    if isinstance(birthdate, str):
        bd = date.fromisoformat(birthdate.split("T")[0])
    elif isinstance(birthdate, datetime):
        bd = birthdate.date()
    elif isinstance(birthdate, date):
        bd = birthdate
    else:
        return 40
    return ref_date.year - bd.year - ((ref_date.month, ref_date.day) < (bd.month, bd.day))


def _plan_status(rng: random.Random) -> str:
    """Active / Draft / Stale at ~80% / 12% / 8%."""
    return rng.choices(
        ["Active", "Draft", "Stale"],
        weights=[0.80, 0.12, 0.08],
    )[0]


def _plan_last_updated(plan_status: str, month_start: datetime, rng: random.Random) -> date:
    """Days-ago bias keyed off plan_status; never future-dated.

    Anchored on month_start (not run_ts) so mid-month re-runs are byte-identical
    — the AGENTS.md determinism contract requires it. The rowspec skeleton uses
    run_ts.date() directly, which would drift across mid-month re-runs since
    days-ago is subtracted from a moving "today". Anchoring on month_start.date()
    keeps date-coherence (result ≤ month_start ≤ run_ts.date()) intact.
    """
    if plan_status == "Stale":
        days_ago = rng.randint(365, 1095)
    elif plan_status == "Draft":
        days_ago = rng.randint(0, 90)
    else:
        days_ago = rng.randint(30, 365)
    return month_start.date() - timedelta(days=days_ago)


def _retirement_target_age(current_age: int, rng: random.Random) -> int:
    """Age-glide bias: already-retired pin to current age, FIRE-curious skew young."""
    if current_age >= 70:
        return current_age
    if current_age >= 60:
        return rng.choice([62, 65, 67, 70])
    if current_age >= 45:
        return rng.choice([62, 65, 67])
    if current_age >= 30:
        return rng.choice([60, 62, 65, 67])
    return rng.choice([55, 60, 62, 65])


def _monthly_income_target(annual_income: float, rng: random.Random) -> int:
    """70-90% replacement-rate band, expressed monthly. Per-anchor invariant test
    in L1 asserts the result lies in [annual_income × 0.70 / 12, annual_income × 0.90 / 12]."""
    replacement_rate = rng.uniform(0.70, 0.90)
    monthly = annual_income * replacement_rate / 12
    return round(monthly)


def _total_goal_amount(annual_income: float, age: int, rng: random.Random) -> int:
    """Years-of-income multiplier biased by life stage; clamped to [500K, 50M]."""
    if age < 35:
        years_mult = rng.uniform(8.0, 15.0)
    elif age < 50:
        years_mult = rng.uniform(15.0, 25.0)
    elif age < 65:
        years_mult = rng.uniform(20.0, 35.0)
    else:
        years_mult = rng.uniform(15.0, 30.0)
    total = annual_income * years_mult
    return round(min(50_000_000, max(500_000, total)))


def _goal_count(age: int, rng: random.Random) -> int:
    """1-6 goals; older anchors lean higher (Legacy/Education additions)."""
    if age >= 55:
        return rng.choices([2, 3, 4, 5, 6], weights=[0.10, 0.30, 0.30, 0.20, 0.10])[0]
    if age >= 35:
        return rng.choices([1, 2, 3, 4, 5], weights=[0.05, 0.30, 0.40, 0.18, 0.07])[0]
    return rng.choices([1, 2, 3, 4], weights=[0.20, 0.40, 0.30, 0.10])[0]


def _monte_carlo_success(annual_income: float, age: int, goal_count: int,
                          rng: random.Random) -> float:
    """Synthesised confidence %; clamped to [30.0, 99.0] and rounded to 2dp."""
    base = 70.0
    if annual_income >= 500_000:
        base += 15
    elif annual_income >= 300_000:
        base += 8
    base -= (goal_count - 2) * 4
    if age >= 60:
        base += rng.uniform(-12, 12)
    else:
        base += rng.uniform(-8, 15)
    return round(max(30.0, min(99.0, base)), 2)


def _asset_allocation(age: int, rng: random.Random) -> str:
    """Textbook 5-tier age glide. L1 invariant: <35 → {Aggressive, Moderate Aggressive};
    ≥70 → {Moderate Conservative, Conservative}. Other bands have noise overlap."""
    if age < 35:
        return rng.choices(
            ["Aggressive", "Moderate Aggressive"], weights=[0.65, 0.35]
        )[0]
    if age < 50:
        return rng.choices(
            ["Aggressive", "Moderate Aggressive", "Moderate"],
            weights=[0.25, 0.55, 0.20],
        )[0]
    if age < 60:
        return rng.choices(
            ["Moderate Aggressive", "Moderate", "Moderate Conservative"],
            weights=[0.30, 0.50, 0.20],
        )[0]
    if age < 70:
        return rng.choices(
            ["Moderate", "Moderate Conservative", "Conservative"],
            weights=[0.30, 0.50, 0.20],
        )[0]
    return rng.choices(
        ["Moderate Conservative", "Conservative"], weights=[0.40, 0.60]
    )[0]


def _review_dates(plan_status: str, plan_last_updated: date, month_start: datetime,
                   rng: random.Random) -> tuple[date | None, date | None]:
    """Status-gated review dates with a date-coherence guard.

    NULL semantics:
      - Draft: LAST_REVIEW_DATE None (advisor hasn't reviewed yet).
      - Stale: NEXT_REVIEW_DATE None (no review scheduled).
      - Active: both populated.

    Anchored on month_start.date() (not run_ts.date()) so mid-month re-runs are
    byte-identical. The rowspec skeleton uses run_ts.date() directly; anchoring
    on month_start.date() keeps both the determinism contract AND the date-
    coherence invariants intact:
      - last_review clamp lands ≥7 days before month_start, so always ≤ run_ts.date().
      - next_review = month_start + ≥30 days; for any in-month run (day-of-month
        ≤ 31), next_review is ≥ month_start + 30 days > run_ts.date(). The 30-day
        floor is the rowspec's lower bound and is wide enough that no in-month
        run can land on or after the next review date.

    The 7-90 day clamp band: floor 7 keeps clamped last_reviews recognisably
    "recent" without colliding with run_ts (avoids ambiguous edge-of-day
    comparisons); cap 90 keeps the distribution tight rather than re-introducing
    multi-month variance after a clamp.
    """
    last_review: date | None = None
    next_review: date | None = None
    if plan_status != "Draft":
        review_offset = rng.randint(30, 365)
        last_review = plan_last_updated + timedelta(days=review_offset)
        if last_review > month_start.date():
            last_review = month_start.date() - timedelta(days=rng.randint(7, 90))
    if plan_status != "Stale":
        next_review = month_start.date() + timedelta(days=rng.randint(30, 540))
    return last_review, next_review


def _advisor_notes_flag(plan_status: str, rng: random.Random) -> bool:
    """Status-driven rate. The explicit bool(...) coercion guarantees a Python
    bool (not numpy.bool_) at the dict-level — write_pandas can otherwise
    surface numpy types into the staging table and break ::BOOLEAN casts."""
    rate = {"Active": 0.75, "Draft": 0.30, "Stale": 0.15}[plan_status]
    return bool(rng.random() < rate)


# -------------------------------------------------------------------
# _row_for — substantive synthesis logic (per rowspec)
# -------------------------------------------------------------------

def _row_for(anchor: dict, run_ts: datetime) -> dict:
    """Pure function: anchor row → fact row. Deterministic on (account_id, month_start).

    Reads anchor['ACCOUNT_ID'], 'BIRTHDATE', 'ANNUAL_INCOME', 'CLIENT_CATEGORY'.
    Mid-month re-runs are byte-identical because month_start truncates the
    day-of-month and time of day from run_ts before the seed is derived.
    """
    if not _anchor_in_audience(anchor):
        raise ValueError(
            f"anchor failed audience predicate "
            f"({_AUDIENCE_PREDICATE}) or has empty ACCOUNT_ID: {anchor!r}"
        )

    account_id = anchor["ACCOUNT_ID"]
    birthdate  = anchor.get("BIRTHDATE")
    income     = float(anchor.get("ANNUAL_INCOME") or 0)

    month_start = run_ts.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    seed = seed_for(account_id, DATASET_SALT, month_start)
    rng = random.Random(seed)

    # Anchor age on month_start.date() (not run_ts.date()) so an anchor whose
    # birthday falls mid-month doesn't flip age bands between mid-month re-runs.
    # Otherwise: birthday-day-N anchor at 50→51 transition has age=50 on day 1
    # but age=51 on day 28, which cascades through every age-banded helper
    # (retirement target, asset allocation, total goal, goal count).
    age = _age_from_birthdate(birthdate, month_start.date())

    # Status-first computation: PLAN_STATUS gates the NULL semantics for
    # LAST_REVIEW_DATE / NEXT_REVIEW_DATE, so it must be drawn before
    # _review_dates is called. Reordering breaks the load-bearing L1
    # NULL-semantic invariants (Active → both populated, Draft → LAST None,
    # Stale → NEXT None).
    plan_status  = _plan_status(rng)
    plan_updated = _plan_last_updated(plan_status, month_start, rng)

    retire_age     = _retirement_target_age(age, rng)
    monthly_target = _monthly_income_target(income, rng)
    goal_count     = _goal_count(age, rng)
    total_goal     = _total_goal_amount(income, age, rng)
    mc_success     = _monte_carlo_success(income, age, goal_count, rng)
    allocation     = _asset_allocation(age, rng)

    last_review, next_review = _review_dates(plan_status, plan_updated, month_start, rng)
    notes_flag = _advisor_notes_flag(plan_status, rng)

    return {
        "ACCOUNT_ID":                    account_id,
        "PROFILE_MONTH":                 month_start.date(),
        "PLAN_STATUS":                   plan_status,
        "PLAN_LAST_UPDATED_DATE":        plan_updated,
        "RETIREMENT_TARGET_AGE":         retire_age,
        "MONTHLY_INCOME_TARGET_USD":     monthly_target,
        "TOTAL_GOAL_AMOUNT_USD":         total_goal,
        "GOAL_COUNT":                    goal_count,
        "MONTE_CARLO_SUCCESS_PCT":       mc_success,
        "RECOMMENDED_ASSET_ALLOCATION":  allocation,
        "LAST_REVIEW_DATE":              last_review,
        "NEXT_REVIEW_DATE":              next_review,
        "ADVISOR_NOTES_FLAG":            notes_flag,
        "GENERATED_AT":                  month_start,
    }


# -------------------------------------------------------------------
# Entry point — invoked by FINS.PUBLIC.SP_RUN_WITH_RETRY → SP_GENERATE_MGP_FINANCIAL_PLANS
# -------------------------------------------------------------------

def main(session: Any) -> str:
    """The 5-step canonical pattern: read → build → MERGE → assert → log."""
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
    """Snowpark Row → plain dict so _row_for can be tested with dict literals."""
    if isinstance(row, dict):
        return row
    if hasattr(row, "asDict"):
        return dict(row.asDict())
    if hasattr(row, "_fields"):
        return {f.name: row[f.name] for f in row._fields}
    return dict(row)


# -------------------------------------------------------------------
# _merge — idempotent MERGE on composite PK (ACCOUNT_ID, PROFILE_MONTH)
# -------------------------------------------------------------------

def _merge(session: Any, records: list[dict]) -> int:
    """MERGE records into TABLE. Returns rows MERGED.

    Casts in the source SELECT (defensive against write_pandas auto-typing
    on an empty target):
      - GENERATED_AT — datetime64[ns] mis-types as NUMBER(38,0) (nanoseconds-
        since-epoch); cast back via TO_TIMESTAMP_NTZ. Same pattern as Plan 1.
      - ADVISOR_NOTES_FLAG — explicit ::BOOLEAN cast because write_pandas
        can infer int8 on an empty stage; the DC DLO Boolean parse fails
        on Text-typed inputs (Plan 5 finding).
      - 4 DATE columns (PROFILE_MONTH, PLAN_LAST_UPDATED_DATE, LAST_REVIEW_DATE,
        NEXT_REVIEW_DATE) pass through — Plan 1 demonstrates that pandas
        serialises datetime.date as DATE-compatible, so write_pandas creates
        the staging columns with DATE-friendly types and Snowflake auto-coerces
        on MERGE. The 2 NULLable date columns serialise Python None → SQL NULL.
    """
    if not records:
        return 0

    import pandas as pd
    df = pd.DataFrame(records)
    staging = "MGP_FINANCIAL_PLANS_STAGING"

    session.write_pandas(
        df, staging,
        auto_create_table=True, overwrite=True,
        database="FINS", schema="PUBLIC",
    )

    merge_sql = f"""
        MERGE INTO FINS.PUBLIC.MGP_FINANCIAL_PLANS tgt
        USING (
            SELECT
                ACCOUNT_ID,
                PROFILE_MONTH,
                PLAN_STATUS,
                PLAN_LAST_UPDATED_DATE,
                RETIREMENT_TARGET_AGE,
                MONTHLY_INCOME_TARGET_USD,
                TOTAL_GOAL_AMOUNT_USD,
                GOAL_COUNT,
                MONTE_CARLO_SUCCESS_PCT,
                RECOMMENDED_ASSET_ALLOCATION,
                LAST_REVIEW_DATE,
                NEXT_REVIEW_DATE,
                ADVISOR_NOTES_FLAG::BOOLEAN AS ADVISOR_NOTES_FLAG,
                TO_TIMESTAMP_NTZ(GENERATED_AT::NUMBER / 1000000000) AS GENERATED_AT
            FROM FINS.PUBLIC.{staging}
        ) src
        ON tgt.ACCOUNT_ID = src.ACCOUNT_ID
           AND tgt.PROFILE_MONTH = src.PROFILE_MONTH
        WHEN MATCHED THEN UPDATE SET
            PLAN_STATUS                  = src.PLAN_STATUS,
            PLAN_LAST_UPDATED_DATE       = src.PLAN_LAST_UPDATED_DATE,
            RETIREMENT_TARGET_AGE        = src.RETIREMENT_TARGET_AGE,
            MONTHLY_INCOME_TARGET_USD    = src.MONTHLY_INCOME_TARGET_USD,
            TOTAL_GOAL_AMOUNT_USD        = src.TOTAL_GOAL_AMOUNT_USD,
            GOAL_COUNT                   = src.GOAL_COUNT,
            MONTE_CARLO_SUCCESS_PCT      = src.MONTE_CARLO_SUCCESS_PCT,
            RECOMMENDED_ASSET_ALLOCATION = src.RECOMMENDED_ASSET_ALLOCATION,
            LAST_REVIEW_DATE             = src.LAST_REVIEW_DATE,
            NEXT_REVIEW_DATE             = src.NEXT_REVIEW_DATE,
            ADVISOR_NOTES_FLAG           = src.ADVISOR_NOTES_FLAG,
            GENERATED_AT                 = src.GENERATED_AT
        WHEN NOT MATCHED THEN INSERT (
            ACCOUNT_ID, PROFILE_MONTH, PLAN_STATUS, PLAN_LAST_UPDATED_DATE,
            RETIREMENT_TARGET_AGE, MONTHLY_INCOME_TARGET_USD,
            TOTAL_GOAL_AMOUNT_USD, GOAL_COUNT, MONTE_CARLO_SUCCESS_PCT,
            RECOMMENDED_ASSET_ALLOCATION, LAST_REVIEW_DATE, NEXT_REVIEW_DATE,
            ADVISOR_NOTES_FLAG, GENERATED_AT
        ) VALUES (
            src.ACCOUNT_ID, src.PROFILE_MONTH, src.PLAN_STATUS, src.PLAN_LAST_UPDATED_DATE,
            src.RETIREMENT_TARGET_AGE, src.MONTHLY_INCOME_TARGET_USD,
            src.TOTAL_GOAL_AMOUNT_USD, src.GOAL_COUNT, src.MONTE_CARLO_SUCCESS_PCT,
            src.RECOMMENDED_ASSET_ALLOCATION, src.LAST_REVIEW_DATE, src.NEXT_REVIEW_DATE,
            src.ADVISOR_NOTES_FLAG, src.GENERATED_AT
        )
    """
    rows = session.sql(merge_sql).collect()
    return int(rows[0][0]) if rows else len(records)
