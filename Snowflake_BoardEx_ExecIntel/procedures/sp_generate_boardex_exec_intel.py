"""BoardEx / Equilar / ISS-style synthetic board-and-exec intelligence generator.

Snowpark Python stored procedure registered as
FINS.PUBLIC.SP_GENERATE_BOARDEX_EXEC_INTEL. **Rebroadcast — all-accounts
audience** (~36,813 anchors) with a 24-month history backfill companion
SP. The original Plan 10 design narrowed to Commercial Banking only; the
rebroadcast widens to every distinct anchor and emits one row per anchor
per calendar month. Current-cycle SP emits ~36,813 rows per run; the
backfill SP (sp_backfill_boardex_exec_intel.py) iterates audience x 24
months for ~883K rows.

Audience: all accounts (1=1 predicate; SELECT DISTINCT to dedupe MASTER_ACCOUNTS).
Cadence:  MONTHLY (07:00 UTC on the 1st).
Salt:     "boardex" (month-bucketed; single salt — no year-stable subfields).
Plan:     docs/superpowers/plans/2026-05-28-cumulus-plan-10-boardex-exec-intel.md
Rowspec:  docs/superpowers/plans/attachments/cumulus-plan-10-boardex-exec-intel-rowspec.md

PERSON-anchor personal-governance fallback (rebroadcast deviation):
  PERSON anchors have NULL EMPLOYEE_COUNT and no real board. Rather than
  reject them or fold into the BUSINESS bias bands, the rebroadcast emits
  a "personal household" governance row:
    - BOARD_SIZE = 1 (self only)
    - BOARD_INDEPENDENCE_PCT = 100.0 (self is fully independent of self)
    - WOMEN_BOARD_PCT in {0.0, 100.0} (deterministic from ACCOUNT_ID hash)
    - MINORITY_BOARD_PCT in {0.0, 100.0} (deterministic from ACCOUNT_ID hash)
    - BOARD_AVG_TENURE_YEARS = 5.0 default
    - CEO_TENURE_YEARS = same as BOARD_AVG_TENURE_YEARS
    - EXEC_TURNOVER_FLAG = False (no exec to turn over)
    - GOVERNANCE_RATING = 'Adequate' (neutral)
    - INTERLOCK_COUNT = 0
    - KEY_DIRECTOR_NAME = 'Self'
    - RECENT_GOVERNANCE_EVENT_DATE = None
    - LAST_DATA_REFRESH_DATE = month_start.date() - small random offset
  This keeps the schema invariant (15 columns) and makes coverage hold
  trivially (every anchor produces exactly one row).

Contract for the L1 sibling tests (Plan 10 T3):
    from sp_generate_boardex_exec_intel import (
        _rows_for,                # (anchor, profile_month) -> [dict] (len 1)
        _anchor_in_audience,      # (anchor) -> bool — True iff ACCOUNT_ID non-empty
        EXPECTED_OUTPUT_COLUMNS,  # frozenset of 15 unchanged column names
    )
"""
from __future__ import annotations

import random
import uuid
from datetime import date, datetime, timedelta
from typing import Any

from cumulus_common import seed_for, assert_coverage


# -------------------------------------------------------------------
# Constants — these MUST stay in sync with the rowspec attachment + DDL
# -------------------------------------------------------------------

TABLE        = "FINS.PUBLIC.BOARDEX_EXEC_INTEL"
TASK_NAME    = "TASK_MONTHLY_BOARDEX_EXEC_INTEL"
DATASET_SALT = "boardex"

# Rebroadcast: no audience predicate. Every distinct anchor contributes.
_AUDIENCE_PREDICATE = ""  # all-accounts
AUDIENCE_SQL = "SELECT DISTINCT * FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS"
COVERAGE_SQL = "SELECT COUNT(DISTINCT ACCOUNT_ID) FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS"

# 15-column output contract — UNCHANGED from the original Plan 10 DDL.
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
    """Rebroadcast audience predicate: every anchor with a non-empty ACCOUNT_ID.

    The L1 audience-violator test depends on this returning False for a
    missing or empty ACCOUNT_ID. There is no CLIENT_CATEGORY gate in the
    rebroadcast — both BUSINESS and PERSON anchors are in audience and
    routed via _is_person_anchor to the appropriate row-builder.
    """
    return bool(anchor.get("ACCOUNT_ID"))


def _is_person_anchor(anchor: dict) -> bool:
    """PERSON-vs-BUSINESS classifier for the rebroadcast row-builder routing.

    Two equivalent triggers — either is sufficient:
      1. ACCOUNT_TYPE_FLAG explicitly says PERSON (the canonical V_ACCOUNT_ANCHORS
         signal); or
      2. EMPLOYEE_COUNT is NULL / 0 / falsy (defensive: handles PERSON rows
         that lack the flag and BUSINESS rows that lack employee data).
    """
    return anchor.get("ACCOUNT_TYPE_FLAG") == "PERSON" or not anchor.get("EMPLOYEE_COUNT")


# -------------------------------------------------------------------
# Per-field synthesis helpers (BUSINESS path) — implemented verbatim
# from the rowspec.
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
    """Real BoardEx 2026 mean ~32% women across the S+P 500; skews 20-45.
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


def _recent_governance_event_date(month_start: datetime, rng: random.Random) -> date | None:
    """Independent 30%/70% Bernoulli; when populated, drawn 1-365 days before
    month_start.date(). NULL in ~70% of rows. The MERGE source SELECT preserves
    None -> NULL via straight pandas serialisation (no enum gating)."""
    if rng.random() >= 0.30:
        return None
    return month_start.date() - timedelta(days=rng.randint(1, 365))


def _last_data_refresh(month_start: datetime, rng: random.Random) -> date:
    """Vendor refresh cadence: 1-30 days before month_start.date(). Always <= run_ts.date()."""
    return month_start.date() - timedelta(days=rng.randint(1, 30))


# -------------------------------------------------------------------
# _business_governance_row — substantive synthesis logic for BUSINESS
# anchors (existing Plan 10 path, modulo date-helper anchoring).
# -------------------------------------------------------------------

def _business_governance_row(anchor: dict, month_start: datetime) -> dict:
    """BUSINESS anchor row-builder. Pure function: deterministic on
    (account_id, month_start). All date helpers anchor on month_start.date()
    so mid-month re-runs are byte-identical."""
    account_id     = anchor["ACCOUNT_ID"]
    employee_count = int(anchor.get("EMPLOYEE_COUNT") or 0)
    interlock_deg  = int(anchor.get("INTERLOCK_DEGREE") or 0)

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
# _personal_governance_row — PERSON anchor fallback ("personal household"
# governance shape). Most fields are constants; the only stochastic
# pieces are the deterministic gender / minority hash and the small
# random LAST_DATA_REFRESH_DATE offset.
# -------------------------------------------------------------------

# PERSON personal-governance constants — load-bearing for tests.
_PERSON_BOARD_SIZE             = 1
_PERSON_BOARD_INDEPENDENCE_PCT = 100.0
_PERSON_BOARD_AVG_TENURE_YEARS = 5.0
_PERSON_INTERLOCK_COUNT        = 0
_PERSON_GOVERNANCE_RATING      = "Adequate"
_PERSON_KEY_DIRECTOR_NAME      = "Self"


def _personal_governance_row(anchor: dict, month_start: datetime) -> dict:
    """PERSON anchor "personal household" governance row-builder.

    Pure function: deterministic on (account_id, month_start). The
    seed is derived the same way as the BUSINESS path so cross-routing
    bugs are caught quickly (any anchor that flips PERSON-vs-BUSINESS
    between runs would emit a different but still byte-identical row
    on each side).

    Field shape (rebroadcast contract):
      - BOARD_SIZE = 1, INDEPENDENCE = 100.0, INTERLOCK = 0
      - WOMEN_BOARD_PCT in {0.0, 100.0} via deterministic ACCOUNT_ID hash
      - MINORITY_BOARD_PCT in {0.0, 100.0} via deterministic ACCOUNT_ID hash
      - tenure 5.0 default; CEO_TENURE_YEARS = BOARD_AVG_TENURE_YEARS
      - EXEC_TURNOVER_FLAG = False
      - GOVERNANCE_RATING = 'Adequate'
      - KEY_DIRECTOR_NAME = 'Self'
      - RECENT_GOVERNANCE_EVENT_DATE = None
      - LAST_DATA_REFRESH_DATE = month_start.date() - small random offset
    """
    account_id = anchor["ACCOUNT_ID"]
    seed = seed_for(account_id, DATASET_SALT, month_start)
    rng = random.Random(seed)

    # Two independent deterministic Bernoulli draws — gender and minority.
    # rng is consumed in a stable order: women -> minority -> last_refresh
    # offset. Re-runs in the same calendar month are byte-identical.
    women_pct    = 100.0 if rng.random() < 0.5 else 0.0
    minority_pct = 100.0 if rng.random() < 0.5 else 0.0
    last_refresh = month_start.date() - timedelta(days=rng.randint(1, 30))

    return {
        "ACCOUNT_ID":                    account_id,
        "PROFILE_MONTH":                 month_start.date(),
        "BOARD_SIZE":                    _PERSON_BOARD_SIZE,
        "BOARD_INDEPENDENCE_PCT":        _PERSON_BOARD_INDEPENDENCE_PCT,
        "WOMEN_BOARD_PCT":               women_pct,
        "MINORITY_BOARD_PCT":            minority_pct,
        "BOARD_AVG_TENURE_YEARS":        _PERSON_BOARD_AVG_TENURE_YEARS,
        "CEO_TENURE_YEARS":              _PERSON_BOARD_AVG_TENURE_YEARS,
        "EXEC_TURNOVER_FLAG":            False,
        "GOVERNANCE_RATING":             _PERSON_GOVERNANCE_RATING,
        "INTERLOCK_COUNT":               _PERSON_INTERLOCK_COUNT,
        "KEY_DIRECTOR_NAME":             _PERSON_KEY_DIRECTOR_NAME,
        "RECENT_GOVERNANCE_EVENT_DATE":  None,
        "LAST_DATA_REFRESH_DATE":        last_refresh,
        "GENERATED_AT":                  month_start,
    }


# -------------------------------------------------------------------
# _rows_for — list-of-1 row factory dispatching on PERSON-vs-BUSINESS.
#
# Contract for the L1 sibling tests: (anchor, profile_month) -> [dict]
# of length 1. profile_month is a datetime; first-of-month/00:00:00 is
# enforced inside the function (defensive — callers may pass either a
# raw datetime or an already-floored month_start).
# -------------------------------------------------------------------

def _rows_for(anchor: dict, profile_month: datetime) -> list[dict]:
    """Pure function: anchor row -> [fact row] of length 1.

    Deterministic on (account_id, month_start) where month_start is the
    first-of-month floor of profile_month. PERSON anchors are routed to
    _personal_governance_row; BUSINESS anchors (and any anchor with a
    non-zero EMPLOYEE_COUNT) go to _business_governance_row.

    Args:
        anchor: distinct V_ACCOUNT_ANCHORS row as a dict.
        profile_month: a datetime; defensively floored to first-of-month
            00:00:00 UTC inside the function so mid-month re-runs are
            byte-identical regardless of caller carelessness.

    Returns:
        Single-row list (length 1). Wrapped to mirror the 1:N row-factory
        signature of the Plan 9 sibling — Plan 10 is 1:1 but the wrapper
        keeps both call sites uniform across plans.
    """
    if not _anchor_in_audience(anchor):
        raise ValueError(
            f"anchor failed audience predicate "
            f"(ACCOUNT_ID empty/missing): {anchor!r}"
        )

    # profile_month may be `date` or `datetime`; the L1 contract accepts both.
    # Normalize to `datetime` at first-of-month 00:00:00 UTC. Downstream
    # helpers consistently call `month_start.date()` — they all expect a
    # datetime, not a date.
    if isinstance(profile_month, datetime):
        month_start = profile_month.replace(
            day=1, hour=0, minute=0, second=0, microsecond=0,
        )
    else:
        month_start = datetime(profile_month.year, profile_month.month, 1)

    if _is_person_anchor(anchor):
        return [_personal_governance_row(anchor, month_start)]
    return [_business_governance_row(anchor, month_start)]


# -------------------------------------------------------------------
# Entry point — invoked by FINS.PUBLIC.SP_RUN_WITH_RETRY -> SP_GENERATE_BOARDEX_EXEC_INTEL
# -------------------------------------------------------------------

def main(session: Any, num_months: int = 1) -> str:
    """5-step pattern with optional history backfill.

    `num_months=1` (default): cron-driven, current month only.
    `num_months=24`: one-shot historical backfill.
    """
    log_id = str(uuid.uuid4())
    started = datetime.utcnow()
    rows_inserted, accounts_processed, status, err = 0, 0, "SUCCEEDED", None

    try:
        audience = session.sql(AUDIENCE_SQL).collect()
        accounts_processed = len(audience)

        current_month_start = started.replace(
            day=1, hour=0, minute=0, second=0, microsecond=0
        )
        month_starts = []
        y, m = current_month_start.year, current_month_start.month
        for _ in range(max(1, num_months)):
            month_starts.append(datetime(y, m, 1))
            m -= 1
            if m == 0:
                m = 12
                y -= 1

        records, errors = [], []
        for row in audience:
            anchor = _anchor_to_dict(row)
            for ms in month_starts:
                try:
                    records.extend(_rows_for(anchor, ms))
                except Exception as exc:
                    errors.append((row.ACCOUNT_ID, str(exc)[:200]))
        max_tolerated = max(10, (len(audience) * len(month_starts)) // 100)
        if len(errors) > max_tolerated:
            raise RuntimeError(
                f"row factory failed on {len(errors)}/{len(audience) * len(month_starts)} pairs "
                f"(tolerance {max_tolerated}); first: {errors[0] if errors else 'n/a'}"
            )
        if errors:
            err = (
                f"row factory failed on {len(errors)}/{len(audience) * len(month_starts)} pairs; "
                f"first: {errors[0]}"
            )

        BATCH_SIZE = 100_000
        rows_inserted = 0
        for batch_start in range(0, len(records), BATCH_SIZE):
            batch = records[batch_start:batch_start + BATCH_SIZE]
            rows_inserted += _merge(session, batch)

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
