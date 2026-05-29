"""MoneyGuidePro / eMoney / NaviPlan-style synthetic financial-plan generator.

Snowpark Python stored procedure registered as
FINS.PUBLIC.SP_GENERATE_MGP_FINANCIAL_PLANS. Cumulus rebroadcast (v2):
all-accounts audience (~36,813 anchors, PERSON + BUSINESS) with current-month
emission. The companion backfill SP (sp_backfill_mgp_financial_plans) iterates
the same row-factory across 24 months for ~884K rows — eliminating the 89%
empty-customer gap that the v1 Wealth-Management-only audience left behind.

Audience: all distinct V_ACCOUNT_ANCHORS rows (no predicate).
Cadence:  MONTHLY (07:00 UTC on the 1st) — emits one row per anchor for the
          current calendar month.
Salt:     "mgp" (month-bucketed, single-salt).
Plan:     docs/superpowers/plans/2026-05-28-cumulus-plan-8-mgp-financial-plans.md
Rowspec:  docs/superpowers/plans/attachments/cumulus-plan-8-mgp-financial-plans-rowspec.md

STRUCTURAL CHANGES from v1 (Wealth-Management-only):
  1. 24-month history backfill. Backfill SP iterates _rows_for over 24 month
     starts, producing 36,813 x 24 = 883,512 rows. Current-cycle SP only
     emits the current month (1 month per run).
  2. All-accounts audience. Plan 7's CLIENT_CATEGORY filter is dropped — the
     row factory now serves the full anchor population (PERSON + BUSINESS).
     Audience predicate stays as an empty-string sentinel for symmetry with
     Plans 1-7.
  3. BUSINESS-anchor fallback. PERSON anchors keep BIRTHDATE + ANNUAL_INCOME
     populated; BUSINESS anchors have both NULL. Two new helpers,
     _effective_age and _effective_annual_income, synthesize a "business
     owner" persona (year-stable owner age in [40,65] from ACCOUNT_ID hash;
     owner draw ~5% of ANNUAL_REVENUE clamped to [150K, 2M]). Existing
     age/income-banded helpers downstream are unchanged.

The cycle parameter throughout the row factory is the *month*, not the
run timestamp. month_start.date() anchors every date-helper call so
mid-month re-runs and historical backfill runs are byte-identical.
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

# All-accounts audience — no predicate. Empty string kept for symmetry with
# Plans 1-7 (where this slot held a CLIENT_CATEGORY filter).
_AUDIENCE_PREDICATE = ""
AUDIENCE_SQL = "SELECT DISTINCT * FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS"
COVERAGE_SQL = "SELECT COUNT(DISTINCT ACCOUNT_ID) FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS"

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
    """All-accounts audience — every anchor with a non-empty ACCOUNT_ID is in.

    No CLIENT_CATEGORY filter. The L1 audience-violator test still depends on
    this returning False for a missing or empty ACCOUNT_ID.
    """
    return bool(anchor.get("ACCOUNT_ID"))


# -------------------------------------------------------------------
# BUSINESS-anchor fallback helpers.
#
# PERSON anchors carry populated BIRTHDATE and ANNUAL_INCOME. BUSINESS anchors
# carry NULL for both — instead they expose ANNUAL_REVENUE. Rather than
# branching deep inside the synthesis helpers, we synthesize a "business owner"
# persona at the anchor edge:
#
#   _effective_age — year-stable owner age in [40, 65] from a hash of
#       ACCOUNT_ID when BIRTHDATE is missing. The age is held constant across
#       a calendar year (it advances by 1 each calendar year so 24-month
#       backfills see two age values per BUSINESS anchor at most).
#
#   _effective_annual_income — owner draw / management compensation modeled
#       as ~5% of ANNUAL_REVENUE, clamped to [150K, 2M]. Drops back to 250K
#       only when both ANNUAL_INCOME and ANNUAL_REVENUE are missing.
#
# Both helpers are pure and depend only on the anchor dict + month_start.
# -------------------------------------------------------------------

def _effective_age(anchor: dict, month_start: date) -> int:
    """Age at month_start. PERSON anchors use BIRTHDATE; BUSINESS anchors use
    a year-stable owner-age in [40, 65] derived from ACCOUNT_ID hash.

    Uses the v1 _age_from_birthdate logic when BIRTHDATE is populated. When
    BIRTHDATE is missing (BUSINESS anchors), the synthesized owner-age is
    held year-stable so a 24-month backfill produces at most two age values
    per anchor. Owner-age band [40, 65] reflects typical business-owner
    demographics and keeps the downstream age-banded helpers in their
    well-tested middle ranges (no <35 or >=70 clipping).
    """
    bd = anchor.get("BIRTHDATE")
    if bd is not None:
        # v1 logic, lifted verbatim.
        if isinstance(bd, str):
            try:
                parsed: date = date.fromisoformat(bd.split("T")[0])
            except ValueError:
                parsed = date(1980, 1, 1)
        elif isinstance(bd, datetime):
            parsed = bd.date()
        elif isinstance(bd, date):
            parsed = bd
        else:
            return 40
        return month_start.year - parsed.year - (
            (month_start.month, month_start.day) < (parsed.month, parsed.day)
        )

    # BUSINESS-anchor fallback. Year-stable owner-age in [40, 65].
    aid = anchor.get("ACCOUNT_ID") or ""
    base = 40 + (abs(hash(f"{aid}|owner-age")) % 26)  # [40, 65]
    # Advance by month_start.year - 2020 so the age glides 1yr/yr — keeps the
    # anchor "aging" across the 24-month backfill in a way analogous to
    # PERSON anchors with real BIRTHDATEs.
    return min(85, base + max(0, month_start.year - 2020))


def _effective_annual_income(anchor: dict) -> float:
    """ANNUAL_INCOME if populated; else ANNUAL_REVENUE x 0.05 clamped to
    [150K, 2M]; else 250K fallback.

    The 5% multiplier models owner-draw / management compensation as a rough
    fraction of business revenue — anchored low enough that a $1M-revenue
    BUSINESS clamps to the 150K floor (still affluent) and high enough that
    a $40M-revenue BUSINESS clamps to the 2M ceiling (capped to keep the
    downstream Monte Carlo / total-goal helpers in their tested ranges).
    """
    income = anchor.get("ANNUAL_INCOME")
    if income is not None:
        try:
            return float(income)
        except (TypeError, ValueError):
            pass
    revenue = anchor.get("ANNUAL_REVENUE")
    if revenue is not None:
        try:
            r = float(revenue)
            return max(150_000.0, min(2_000_000.0, r * 0.05))
        except (TypeError, ValueError):
            pass
    return 250_000.0


# -------------------------------------------------------------------
# Per-field synthesis helpers — implemented verbatim from the rowspec.
# -------------------------------------------------------------------

def _plan_status(rng: random.Random) -> str:
    """Active / Draft / Stale at ~80% / 12% / 8%."""
    return rng.choices(
        ["Active", "Draft", "Stale"],
        weights=[0.80, 0.12, 0.08],
    )[0]


def _plan_last_updated(plan_status: str, month_start: date, rng: random.Random) -> date:
    """Days-ago bias keyed off plan_status; never future-dated.

    Anchored on month_start (a date) so mid-month re-runs and historical
    backfill runs are byte-identical — the AGENTS.md determinism contract
    requires it. Result is always <= month_start, which is itself <=
    run_ts.date() in the current-cycle SP.
    """
    if plan_status == "Stale":
        days_ago = rng.randint(365, 1095)
    elif plan_status == "Draft":
        days_ago = rng.randint(0, 90)
    else:
        days_ago = rng.randint(30, 365)
    return month_start - timedelta(days=days_ago)


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
    in L1 asserts the result lies in [annual_income x 0.70 / 12, annual_income x 0.90 / 12].

    No absolute floor/ceiling clamp — the per-anchor band is the contract.
    DDL allows any NUMBER(8,0) value; the L1 absolute-range test 4e covers
    the floor only for BUSINESS-fallback anchors where the rowspec band was
    designed."""
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
    """Textbook 5-tier age glide. L1 invariant: <35 -> {Aggressive, Moderate Aggressive};
    >=70 -> {Moderate Conservative, Conservative}. Other bands have noise overlap."""
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


def _review_dates(plan_status: str, plan_last_updated: date, month_start: date,
                   rng: random.Random) -> tuple[date | None, date | None]:
    """Status-gated review dates with a date-coherence guard.

    NULL semantics:
      - Draft: LAST_REVIEW_DATE None (advisor hasn't reviewed yet).
      - Stale: NEXT_REVIEW_DATE None (no review scheduled).
      - Active: both populated.

    Anchored on month_start (a date) so mid-month re-runs and historical
    backfill runs are byte-identical. The 7-90 day clamp band keeps a
    clamped last_review recognisably "recent" without colliding with
    month_start; the 30-day next_review floor keeps next_review in the
    future relative to any in-month run timestamp.
    """
    last_review: date | None = None
    next_review: date | None = None
    if plan_status != "Draft":
        review_offset = rng.randint(30, 365)
        last_review = plan_last_updated + timedelta(days=review_offset)
        if last_review > month_start:
            last_review = month_start - timedelta(days=rng.randint(7, 90))
    if plan_status != "Stale":
        next_review = month_start + timedelta(days=rng.randint(30, 540))
    return last_review, next_review


def _advisor_notes_flag(plan_status: str, rng: random.Random) -> bool:
    """Status-driven rate. The explicit bool(...) coercion guarantees a Python
    bool (not numpy.bool_) at the dict-level — write_pandas can otherwise
    surface numpy types into the staging table and break ::BOOLEAN casts."""
    rate = {"Active": 0.75, "Draft": 0.30, "Stale": 0.15}[plan_status]
    return bool(rng.random() < rate)


# -------------------------------------------------------------------
# _rows_for — substantive synthesis logic (per rowspec)
# -------------------------------------------------------------------

def _rows_for(anchor: dict, profile_month: date | datetime) -> list[dict]:
    """Pure function: anchor row -> 1-element list of fact rows.

    Cycle parameter is the *month* (date or datetime), NOT a run timestamp.
    This is the v2 contract change: the backfill SP iterates _rows_for over
    24 month_start values, and the current-cycle SP passes today's month.
    Truncating any datetime input to first-of-month keeps mid-month re-runs
    byte-identical with first-of-month runs.

    Reads anchor['ACCOUNT_ID'], 'BIRTHDATE', 'ANNUAL_INCOME', 'ANNUAL_REVENUE',
    'ACCOUNT_TYPE_FLAG'. PERSON anchors use BIRTHDATE + ANNUAL_INCOME directly;
    BUSINESS anchors fall back to _effective_age / _effective_annual_income.
    """
    if not _anchor_in_audience(anchor):
        raise ValueError(
            f"anchor failed all-accounts audience predicate "
            f"(ACCOUNT_ID empty/missing): {anchor!r}"
        )

    # Normalize cycle parameter to a first-of-month date.
    if isinstance(profile_month, datetime):
        month_start: date = profile_month.replace(
            day=1, hour=0, minute=0, second=0, microsecond=0
        ).date()
    elif isinstance(profile_month, date):
        month_start = profile_month.replace(day=1)
    else:
        raise TypeError(
            f"profile_month must be date or datetime, got {type(profile_month)!r}"
        )

    account_id = anchor["ACCOUNT_ID"]
    seed = seed_for(
        account_id, DATASET_SALT,
        datetime.combine(month_start, datetime.min.time()),
    )
    rng = random.Random(seed)

    # Age + income via the BUSINESS-aware helpers. PERSON anchors take the
    # populated paths; BUSINESS anchors take the synthesized owner-persona
    # paths. Either way, downstream age-banded / income-banded helpers see
    # the same shape of input.
    age = _effective_age(anchor, month_start)
    income = _effective_annual_income(anchor)

    # Status-first computation: PLAN_STATUS gates the NULL semantics for
    # LAST_REVIEW_DATE / NEXT_REVIEW_DATE, so it must be drawn before
    # _review_dates is called. Reordering breaks the load-bearing L1
    # NULL-semantic invariants (Active -> both populated, Draft -> LAST None,
    # Stale -> NEXT None).
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

    return [{
        "ACCOUNT_ID":                    account_id,
        "PROFILE_MONTH":                 month_start,
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
        "GENERATED_AT":                  datetime.combine(month_start, datetime.min.time()),
    }]


# -------------------------------------------------------------------
# Entry point — invoked by FINS.PUBLIC.SP_RUN_WITH_RETRY -> SP_GENERATE_MGP_FINANCIAL_PLANS
# -------------------------------------------------------------------

def main(session: Any) -> str:
    """The 5-step canonical pattern: read -> build -> MERGE -> assert -> log.

    Current-cycle SP — emits exactly one row per anchor for the current
    calendar month. The companion backfill SP handles the 24-month history.
    """
    log_id = str(uuid.uuid4())
    started = datetime.utcnow()
    rows_inserted, accounts_processed, status, err = 0, 0, "SUCCEEDED", None

    try:
        audience = session.sql(AUDIENCE_SQL).collect()
        accounts_processed = len(audience)

        current_month_start = started.replace(
            day=1, hour=0, minute=0, second=0, microsecond=0
        ).date()

        records, errors = [], []
        for row in audience:
            try:
                records.extend(
                    _rows_for(_anchor_to_dict(row), current_month_start)
                )
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

        # Coverage: every anchor must be represented at least once across the
        # full table (current-month rows MERGE-replace previous current-month
        # rows in place, so >= holds).
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
    """Snowpark Row -> plain dict so _rows_for can be tested with dict literals."""
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
        on MERGE. The 2 NULLable date columns serialise Python None -> SQL NULL.
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
