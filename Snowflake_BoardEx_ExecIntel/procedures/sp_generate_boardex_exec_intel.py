"""BoardEx / Equilar / ISS-style synthetic board-and-exec intelligence generator.

Snowpark Python stored procedure registered as
FINS.PUBLIC.SP_GENERATE_BOARDEX_EXEC_INTEL. **Smallest Cumulus dataset of
all 13 plans by 4.1×** — Commercial Banking only (~960 anchors), dethroning
Plan 8 (MGP Financial Plans, 3,920) from that title. Emits exactly one row
per Commercial Banking anchor per calendar month (1:1, ~960 rows/month).

Audience: CLIENT_CATEGORY = 'Commercial Banking'
Cadence:  MONTHLY (07:00 UTC on the 1st)
Salt:     "boardex" (month-bucketed; single salt — no year-stable subfields,
          matches Plan 8's simpler shape)
Plan:     docs/superpowers/plans/2026-05-28-cumulus-plan-10-boardex-exec-intel.md
Rowspec:  docs/superpowers/plans/attachments/cumulus-plan-10-boardex-exec-intel-rowspec.md

STRUCTURAL DEVIATIONS from Plans 1-8 (load-bearing for tests, not the SP itself):
  1. Smallest audience by 4.1×. SAMPLE_ANCHORS at 100 anchors yields ZERO
     Commercial Banking anchors (the 100-row Retail / Wealth / Household /
     Small Business slice contains none of this cohort). The L1 conftest
     therefore overrides SAMPLE_ANCHORS entirely with an inline 5-anchor
     synthetic Commercial Banking fixture spanning the EMPLOYEE_COUNT and
     INTERLOCK_DEGREE bias bands. The Plan 5/6 graceful-skip pattern is
     NOT acceptable here — skipping every cohort assertion would defeat
     the point.
  2. Single NULLable column with independent 30%/70% Bernoulli draw —
     RECENT_GOVERNANCE_EVENT_DATE has no enum gating (compare Plan 8's
     PLAN_STATUS-gated 2-NULL setup). The MERGE source SELECT preserves
     None -> NULL via straight pandas serialisation.
  3. Per-anchor deterministic invariants are even more load-bearing than
     Plan 8 because the cohort is too narrow for any rate-convergence
     approach across SAMPLE_ANCHORS at all.
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

TABLE        = "FINS.PUBLIC.BOARDEX_EXEC_INTEL"
TASK_NAME    = "TASK_MONTHLY_BOARDEX_EXEC_INTEL"
DATASET_SALT = "boardex"

_AUDIENCE_PREDICATE = "CLIENT_CATEGORY = 'Commercial Banking'"
AUDIENCE_SQL = f"SELECT DISTINCT * FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS WHERE {_AUDIENCE_PREDICATE}"
COVERAGE_SQL = f"SELECT COUNT(DISTINCT ACCOUNT_ID) FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS WHERE {_AUDIENCE_PREDICATE}"

EXPECTED_OUTPUT_COLUMNS: frozenset[str] = frozenset({
    "ACCOUNT_ID", "PROFILE_MONTH",
    "BOARD_SIZE", "BOARD_INDEPENDENCE_PCT",
    "WOMEN_BOARD_PCT", "MINORITY_BOARD_PCT",
    "BOARD_AVG_TENURE_YEARS", "CEO_TENURE_YEARS",
    "EXEC_TURNOVER_FLAG", "GOVERNANCE_RATING",
    "INTERLOCK_COUNT", "KEY_DIRECTOR_NAME",
    "RECENT_GOVERNANCE_EVENT_DATE", "LAST_DATA_REFRESH_DATE",
    "GENERATED_AT",
})


_GOVERNANCE_TIERS = ["Excellent", "Strong", "Adequate", "Weak", "Concerning"]

_FIRST_NAMES = [
    "James", "Mary", "Robert", "Patricia", "John", "Jennifer", "Michael",
    "Linda", "David", "Elizabeth", "Aisha", "Diego", "Priya", "Wei",
    "Carlos", "Fatima", "Hiroshi", "Chen",
]
_LAST_NAMES = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller",
    "Davis", "Rodriguez", "Martinez", "Patel", "Nguyen", "Kim", "Khan",
    "O'Connor", "Hassan",
]


# -------------------------------------------------------------------
# Audience predicate — defense-in-depth in Python.
# -------------------------------------------------------------------

def _anchor_in_audience(anchor: dict) -> bool:
    """Translate _AUDIENCE_PREDICATE into a Python predicate.

    Commercial Banking anchors only, with a non-empty ACCOUNT_ID. The
    cohort is overwhelmingly BUSINESS-typed but the predicate keys on
    CLIENT_CATEGORY only (matching the SQL audience filter); a Person
    row that drifts in is still emitted with the BUSINESS shape — there
    are no Person-specific synthesis paths in this dataset to guard.
    """
    return (
        anchor.get("CLIENT_CATEGORY") == "Commercial Banking"
        and bool(anchor.get("ACCOUNT_ID"))
    )


# -------------------------------------------------------------------
# Per-field synthesis helpers — implemented verbatim from the rowspec.
# -------------------------------------------------------------------

def _board_size(employee_count: int, rng: random.Random) -> int:
    """Larger firms have larger boards. BoardEx median ~9 across public companies.
    Range [5, 15]. Bias bands keyed on EMPLOYEE_COUNT (rowspec)."""
    if employee_count >= 10000:
        return rng.choices(
            [9, 10, 11, 12, 13, 14, 15],
            weights=[0.10, 0.20, 0.25, 0.20, 0.15, 0.07, 0.03],
        )[0]
    if employee_count >= 1000:
        return rng.choices(
            [7, 8, 9, 10, 11, 12],
            weights=[0.10, 0.20, 0.30, 0.25, 0.10, 0.05],
        )[0]
    if employee_count >= 100:
        return rng.choices(
            [5, 6, 7, 8, 9, 10],
            weights=[0.10, 0.20, 0.25, 0.25, 0.15, 0.05],
        )[0]
    return rng.choices([5, 6, 7, 8], weights=[0.30, 0.35, 0.25, 0.10])[0]


def _board_independence_pct(rng: random.Random) -> float:
    """Skewed 70-90 for established commercial-banking clients (NYSE/NASDAQ
    governance norms). Range [50.00, 100.00]."""
    return round(rng.uniform(50.0, 100.0) * 0.4 + rng.uniform(70.0, 90.0) * 0.6, 2)


def _women_board_pct(rng: random.Random) -> float:
    """Real BoardEx 2026 mean ~32% women across S+P 500; skews 20-45.
    Range [0.00, 100.00]."""
    return round(rng.uniform(0.0, 50.0) * 0.3 + rng.uniform(20.0, 45.0) * 0.7, 2)


def _minority_board_pct(rng: random.Random) -> float:
    """Real BoardEx 2026 mean ~22% minorities; skews 10-35. Range [0.00, 100.00]."""
    return round(rng.uniform(0.0, 50.0) * 0.3 + rng.uniform(10.0, 35.0) * 0.7, 2)


def _board_avg_tenure(rng: random.Random) -> float:
    """Established commercial banks: avg board tenure 6-10 years. Range [1.0, 20.0]."""
    return round(rng.uniform(3.0, 14.0), 1)


def _ceo_tenure(employee_count: int, rng: random.Random) -> float:
    """Larger firms have longer-tenured CEOs (succession planning). Range [0.0, 25.0]."""
    if employee_count >= 10000:
        return round(rng.uniform(2.0, 18.0), 1)
    if employee_count >= 1000:
        return round(rng.uniform(1.0, 12.0), 1)
    return round(rng.uniform(0.0, 10.0), 1)


def _exec_turnover_flag(ceo_tenure_years: float, rng: random.Random) -> bool:
    """Long-CEO-tenure firms less likely to have C-suite churn.
    new CEO (<2yrs) -> 35%; mid -> 20%; long-tenure -> 10%.
    Explicit bool(...) coercion guarantees a Python bool (not numpy.bool_) so
    write_pandas does not stage as int8 and break the ::BOOLEAN cast at MERGE."""
    rate = 0.35 if ceo_tenure_years < 2.0 else (0.20 if ceo_tenure_years < 7.0 else 0.10)
    return bool(rng.random() < rate)


def _governance_rating(independence_pct: float, avg_tenure: float,
                        exec_turnover: bool, rng: random.Random) -> str:
    """Composite of independence + avg tenure + exec turnover. High independence
    is better; very-low or very-high avg tenure is worse (board churn or
    stagnation). EXEC_TURNOVER nudges toward lower tiers. Returns one of
    _GOVERNANCE_TIERS."""
    score = 0.0
    score += 2.0 if independence_pct >= 85.0 else (1.0 if independence_pct >= 70.0 else 0.0)
    if 5.0 <= avg_tenure <= 10.0:
        score += 1.0
    elif avg_tenure < 3.0 or avg_tenure > 14.0:
        score -= 1.0
    if exec_turnover:
        score -= 0.5
    score += rng.uniform(-1.0, 1.0)
    if score >= 2.0:
        return "Excellent"
    if score >= 1.0:
        return "Strong"
    if score >= -0.5:
        return "Adequate"
    if score >= -1.5:
        return "Weak"
    return "Concerning"


def _interlock_count(interlock_degree: int, rng: random.Random) -> int:
    """Anchor INTERLOCK_DEGREE drives this; default to a small distribution at 1-2.
    Range [0, 5]."""
    base = int(interlock_degree or 0)
    if base >= 4:
        return rng.choices([2, 3, 4, 5], weights=[0.20, 0.35, 0.30, 0.15])[0]
    if base >= 2:
        return rng.choices([0, 1, 2, 3, 4], weights=[0.10, 0.25, 0.35, 0.20, 0.10])[0]
    return rng.choices([0, 1, 2, 3], weights=[0.40, 0.30, 0.20, 0.10])[0]


def _key_director_name(rng: random.Random) -> str:
    """Single-row exemplar director used for narrative generation downstream.
    Synthesized from a small name pool — clearly fake; not real-person PII."""
    return f"{rng.choice(_FIRST_NAMES)} {rng.choice(_LAST_NAMES)}"


def _recent_governance_event_date(run_ts: datetime, rng: random.Random) -> date | None:
    """Independent 30%/70% Bernoulli; when populated, drawn 1-365 days before
    run_ts.date(). NULL in ~70% of rows. The MERGE source SELECT preserves
    None -> NULL via straight pandas serialisation (no enum gating)."""
    if rng.random() >= 0.30:
        return None
    return run_ts.date() - timedelta(days=rng.randint(1, 365))


def _last_data_refresh(run_ts: datetime, rng: random.Random) -> date:
    """Vendor refresh cadence: 1-30 days before run_ts.date(). Always <= run_ts.date()."""
    return run_ts.date() - timedelta(days=rng.randint(1, 30))


# -------------------------------------------------------------------
# _row_for — substantive synthesis logic (per rowspec)
# -------------------------------------------------------------------

def _row_for(anchor: dict, run_ts: datetime) -> dict:
    """Pure function: anchor row -> fact row. Deterministic on (account_id, month_start).

    Reads anchor['ACCOUNT_ID'], 'EMPLOYEE_COUNT', 'INTERLOCK_DEGREE',
    'CLIENT_CATEGORY'. Mid-month re-runs are byte-identical because
    month_start truncates the day-of-month and time of day from run_ts
    before the seed is derived. ALL date helpers use month_start.date()
    (not run_ts.date()) so dates do not drift across mid-month re-runs.
    """
    if not _anchor_in_audience(anchor):
        raise ValueError(
            f"anchor failed audience predicate "
            f"({_AUDIENCE_PREDICATE}) or has empty ACCOUNT_ID: {anchor!r}"
        )

    account_id      = anchor["ACCOUNT_ID"]
    employee_count  = int(anchor.get("EMPLOYEE_COUNT") or 0)
    interlock_deg   = int(anchor.get("INTERLOCK_DEGREE") or 0)

    month_start = run_ts.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    seed = seed_for(account_id, DATASET_SALT, month_start)
    rng = random.Random(seed)

    # 1. Independent board-structure scalars (size + independence + diversity + tenure).
    board_size       = _board_size(employee_count, rng)
    independence_pct = _board_independence_pct(rng)
    women_pct        = _women_board_pct(rng)
    minority_pct     = _minority_board_pct(rng)
    avg_tenure       = _board_avg_tenure(rng)

    # 2. CEO + exec-suite chain. _exec_turnover depends on ceo_tenure;
    #    _governance_rating depends on independence_pct + avg_tenure + exec_turnover.
    #    Order MUST be ceo_tenure -> exec_turnover -> governance_rating.
    ceo_tenure_years  = _ceo_tenure(employee_count, rng)
    exec_turnover     = _exec_turnover_flag(ceo_tenure_years, rng)
    governance_rating = _governance_rating(
        independence_pct, avg_tenure, exec_turnover, rng,
    )

    # 3. Network exemplar + dates. All dates anchored on month_start.date()
    #    (not run_ts.date()) so mid-month re-runs are byte-identical.
    interlock_count   = _interlock_count(interlock_deg, rng)
    director_name     = _key_director_name(rng)
    recent_event_date = _recent_governance_event_date(month_start, rng)
    last_refresh_date = _last_data_refresh(month_start, rng)

    return {
        "ACCOUNT_ID":                    account_id,
        "PROFILE_MONTH":                 month_start.date(),
        "BOARD_SIZE":                    board_size,
        "BOARD_INDEPENDENCE_PCT":        independence_pct,
        "WOMEN_BOARD_PCT":               women_pct,
        "MINORITY_BOARD_PCT":            minority_pct,
        "BOARD_AVG_TENURE_YEARS":        avg_tenure,
        "CEO_TENURE_YEARS":              ceo_tenure_years,
        "EXEC_TURNOVER_FLAG":            exec_turnover,
        "GOVERNANCE_RATING":             governance_rating,
        "INTERLOCK_COUNT":               interlock_count,
        "KEY_DIRECTOR_NAME":             director_name,
        "RECENT_GOVERNANCE_EVENT_DATE":  recent_event_date,
        "LAST_DATA_REFRESH_DATE":        last_refresh_date,
        "GENERATED_AT":                  month_start,
    }


# -------------------------------------------------------------------
# Entry point — invoked by FINS.PUBLIC.SP_RUN_WITH_RETRY -> SP_GENERATE_BOARDEX_EXEC_INTEL
# -------------------------------------------------------------------

def main(session: Any) -> str:
    """The 5-step canonical pattern: read -> build -> MERGE -> assert -> log."""
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
    """Snowpark Row -> plain dict so _row_for can be tested with dict literals."""
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
      - EXEC_TURNOVER_FLAG — explicit ::BOOLEAN cast because write_pandas
        can infer int8 on an empty stage; the DC DLO Boolean parse fails
        on Text-typed inputs (Plan 5 finding).
      - 3 DATE columns (PROFILE_MONTH, RECENT_GOVERNANCE_EVENT_DATE,
        LAST_DATA_REFRESH_DATE) pass through — pandas serialises datetime.date
        as DATE-compatible, so write_pandas creates the staging columns with
        DATE-friendly types and Snowflake auto-coerces on MERGE. The single
        NULLable date column serialises Python None -> SQL NULL.
    """
    if not records:
        return 0

    import pandas as pd
    df = pd.DataFrame(records)
    staging = "BOARDEX_EXEC_INTEL_STAGING"

    session.write_pandas(
        df, staging,
        auto_create_table=True, overwrite=True,
        database="FINS", schema="PUBLIC",
    )

    merge_sql = f"""
        MERGE INTO FINS.PUBLIC.BOARDEX_EXEC_INTEL tgt
        USING (
            SELECT
                ACCOUNT_ID,
                PROFILE_MONTH,
                BOARD_SIZE,
                BOARD_INDEPENDENCE_PCT,
                WOMEN_BOARD_PCT,
                MINORITY_BOARD_PCT,
                BOARD_AVG_TENURE_YEARS,
                CEO_TENURE_YEARS,
                EXEC_TURNOVER_FLAG::BOOLEAN AS EXEC_TURNOVER_FLAG,
                GOVERNANCE_RATING,
                INTERLOCK_COUNT,
                KEY_DIRECTOR_NAME,
                RECENT_GOVERNANCE_EVENT_DATE,
                LAST_DATA_REFRESH_DATE,
                TO_TIMESTAMP_NTZ(GENERATED_AT::NUMBER / 1000000000) AS GENERATED_AT
            FROM FINS.PUBLIC.{staging}
        ) src
        ON tgt.ACCOUNT_ID = src.ACCOUNT_ID
           AND tgt.PROFILE_MONTH = src.PROFILE_MONTH
        WHEN MATCHED THEN UPDATE SET
            BOARD_SIZE                   = src.BOARD_SIZE,
            BOARD_INDEPENDENCE_PCT       = src.BOARD_INDEPENDENCE_PCT,
            WOMEN_BOARD_PCT              = src.WOMEN_BOARD_PCT,
            MINORITY_BOARD_PCT           = src.MINORITY_BOARD_PCT,
            BOARD_AVG_TENURE_YEARS       = src.BOARD_AVG_TENURE_YEARS,
            CEO_TENURE_YEARS             = src.CEO_TENURE_YEARS,
            EXEC_TURNOVER_FLAG           = src.EXEC_TURNOVER_FLAG,
            GOVERNANCE_RATING            = src.GOVERNANCE_RATING,
            INTERLOCK_COUNT              = src.INTERLOCK_COUNT,
            KEY_DIRECTOR_NAME            = src.KEY_DIRECTOR_NAME,
            RECENT_GOVERNANCE_EVENT_DATE = src.RECENT_GOVERNANCE_EVENT_DATE,
            LAST_DATA_REFRESH_DATE       = src.LAST_DATA_REFRESH_DATE,
            GENERATED_AT                 = src.GENERATED_AT
        WHEN NOT MATCHED THEN INSERT (
            ACCOUNT_ID, PROFILE_MONTH, BOARD_SIZE, BOARD_INDEPENDENCE_PCT,
            WOMEN_BOARD_PCT, MINORITY_BOARD_PCT, BOARD_AVG_TENURE_YEARS,
            CEO_TENURE_YEARS, EXEC_TURNOVER_FLAG, GOVERNANCE_RATING,
            INTERLOCK_COUNT, KEY_DIRECTOR_NAME, RECENT_GOVERNANCE_EVENT_DATE,
            LAST_DATA_REFRESH_DATE, GENERATED_AT
        ) VALUES (
            src.ACCOUNT_ID, src.PROFILE_MONTH, src.BOARD_SIZE, src.BOARD_INDEPENDENCE_PCT,
            src.WOMEN_BOARD_PCT, src.MINORITY_BOARD_PCT, src.BOARD_AVG_TENURE_YEARS,
            src.CEO_TENURE_YEARS, src.EXEC_TURNOVER_FLAG, src.GOVERNANCE_RATING,
            src.INTERLOCK_COUNT, src.KEY_DIRECTOR_NAME, src.RECENT_GOVERNANCE_EVENT_DATE,
            src.LAST_DATA_REFRESH_DATE, src.GENERATED_AT
        )
    """
    rows = session.sql(merge_sql).collect()
    return int(rows[0][0]) if rows else len(records)
