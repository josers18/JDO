"""24-month historical backfill for MGP_FINANCIAL_PLANS.

Snowpark Python stored procedure registered as
FINS.PUBLIC.SP_BACKFILL_MGP_FINANCIAL_PLANS. Iterates the canonical row
factory (sp_generate_mgp_financial_plans._rows_for) across N month_starts
to produce ~36,813 anchors x 24 months = ~883,512 rows.

Why a separate SP rather than a flag on the current-cycle SP:
  - Different cadence (one-shot, manual invocation; not on the monthly task).
  - Different memory profile (~884K rows in memory vs ~37K).
  - Different coverage assertion (history coverage AND anchor coverage).
  - Imports the canonical row factory + audience predicate from
    sp_generate_mgp_financial_plans so the backfill can never drift from the
    current-cycle SP — one source of truth for the row shape.

Audience: all distinct V_ACCOUNT_ANCHORS rows (no predicate, same as v2 SP).
Cadence:  ONE-SHOT manual run; not on a TASK. Defaults to 24 months.
Salt:     "mgp" (inherited from sp_generate_mgp_financial_plans).
Plan:     docs/superpowers/plans/2026-05-28-cumulus-plan-8-mgp-financial-plans.md

Implementation note — batching strategy:
  Assemble all ~883K rows in memory then MERGE in 100K-row batches via a
  Python loop. Each batch creates and overwrites its own staging table and
  runs an independent MERGE statement. write_pandas + MERGE handles 100K
  rows comfortably; 883K in one shot can OOM the Snowpark SP runtime
  (the Snowpark XL warehouse runs each SP in a Python container with a
  bounded heap).

  Trade-off: slightly more SQL round-trips (9 batches at 100K vs 1 at 884K),
  but no risk of mid-MERGE memory exhaustion. Each batch is independent —
  a partial failure leaves earlier batches committed and the table in a
  valid state because PROFILE_MONTH is part of the composite PK.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta
from typing import Any

# Canonical row factory + audience predicate from the current-cycle SP.
# Importing rather than reimplementing keeps the row shape single-sourced.
from sp_generate_mgp_financial_plans import (
    AUDIENCE_SQL,
    COVERAGE_SQL,
    EXPECTED_OUTPUT_COLUMNS,
    TABLE,
    _anchor_in_audience,
    _anchor_to_dict,
    _rows_for,
)


# -------------------------------------------------------------------
# Constants
# -------------------------------------------------------------------

TASK_NAME      = "SP_BACKFILL_MGP_FINANCIAL_PLANS"
BACKFILL_MONTHS = 24
MERGE_BATCH_ROWS = 100_000


# -------------------------------------------------------------------
# Helpers
# -------------------------------------------------------------------

def _first_of_month(d: date) -> date:
    """First-of-month for the given date."""
    return d.replace(day=1)


def _months_back(today: date, n: int) -> list[date]:
    """Return n first-of-month dates ending with today's month, oldest first.

    Example: today=2026-05-15, n=3 -> [2026-03-01, 2026-04-01, 2026-05-01].

    Uses month-arithmetic via timedelta walking back ~31 days at a time then
    snapping to first-of-month — robust across month-length differences and
    DST-free since these are pure dates.
    """
    out: list[date] = []
    current = _first_of_month(today)
    for _ in range(n):
        out.append(current)
        # Step back into the previous month, then snap to first-of-month.
        prev_month_any_day = current - timedelta(days=1)
        current = _first_of_month(prev_month_any_day)
    out.reverse()  # oldest first
    return out


def _chunked(records: list[dict], size: int):
    """Yield successive size-bounded slices of records."""
    for i in range(0, len(records), size):
        yield records[i:i + size]


# -------------------------------------------------------------------
# Entry point — invoked manually:
#   CALL FINS.PUBLIC.SP_BACKFILL_MGP_FINANCIAL_PLANS();
#   CALL FINS.PUBLIC.SP_BACKFILL_MGP_FINANCIAL_PLANS(12);  -- 12 months
# -------------------------------------------------------------------

def main(session: Any, num_months: int = BACKFILL_MONTHS) -> str:
    """Backfill num_months of historical rows for the all-accounts audience.

    Snowpark SP signature must match this when registered (session, INTEGER).
    Returns the standard "TASK: STATUS rows=N accounts=N" summary string.

    Steps:
      1. Read audience via AUDIENCE_SQL (~36,813 distinct anchors).
      2. Compute num_months month_starts ending with today's month (oldest
         first so backfilled rows accumulate forward in calendar order).
      3. Build ~883,512 rows in memory by iterating _rows_for over each
         (anchor, month_start) pair.
      4. MERGE in MERGE_BATCH_ROWS-sized batches to stay under the Snowpark
         SP heap budget.
      5. Two-part coverage assertion: anchor coverage = audience_size;
         history coverage = num_months distinct PROFILE_MONTH values.
      6. Log to TASK_EXECUTION_LOG with TASK_NAME='SP_BACKFILL_MGP_FINANCIAL_PLANS'.
    """
    log_id = str(uuid.uuid4())
    started = datetime.utcnow()
    rows_inserted, accounts_processed, status, err = 0, 0, "SUCCEEDED", None

    try:
        if num_months < 1:
            raise ValueError(f"num_months must be >=1, got {num_months}")

        # 1. Read audience.
        raw_audience = session.sql(AUDIENCE_SQL).collect()
        audience = [_anchor_to_dict(r) for r in raw_audience]
        accounts_processed = len(audience)

        # 2. Compute num_months first-of-month dates (oldest first).
        today = started.date()
        month_starts = _months_back(today, num_months)

        # 3. Build all rows in memory. Each (anchor, month_start) pair yields
        # exactly 1 row; total = audience_size x num_months.
        records: list[dict] = []
        errors: list[tuple[Any, str]] = []
        for anchor in audience:
            if not _anchor_in_audience(anchor):
                # Defense-in-depth — V_ACCOUNT_ANCHORS shouldn't surface
                # rows with NULL ACCOUNT_ID, but an empty audience predicate
                # makes this the only filter line.
                continue
            for month_start in month_starts:
                try:
                    records.extend(_rows_for(anchor, month_start))
                except Exception as exc:
                    errors.append(
                        (anchor.get("ACCOUNT_ID"), month_start.isoformat(),
                         str(exc)[:200])
                    )

        # 1% per-anchor-month error tolerance — same shape as the current-cycle SP.
        max_tolerated = max(10, (len(audience) * num_months) // 100)
        if len(errors) > max_tolerated:
            raise RuntimeError(
                f"row factory failed on {len(errors)}/"
                f"{len(audience) * num_months} (anchor, month) pairs "
                f"(tolerance {max_tolerated}); first: "
                f"{errors[0] if errors else 'n/a'}"
            )
        if errors:
            err = (
                f"row factory failed on {len(errors)}/"
                f"{len(audience) * num_months} (anchor, month) pairs; "
                f"first: {errors[0]}"
            )

        # 4. MERGE in batches. Each batch reuses the staging table (overwrite
        # truncates), so the table never holds more than MERGE_BATCH_ROWS at
        # once.
        rows_inserted = 0
        for batch_idx, batch in enumerate(_chunked(records, MERGE_BATCH_ROWS)):
            rows_inserted += _merge_batch(session, batch, batch_idx)

        # 5. Two-part coverage assertion:
        #   (a) anchor coverage — every audience anchor present at least once.
        #   (b) history coverage — at least num_months distinct PROFILE_MONTH
        #       values present (>= rather than == handles re-runs that touch
        #       a different starting month than a prior run).
        actual_anchor_sql = f"SELECT COUNT(DISTINCT ACCOUNT_ID) FROM {TABLE}"
        assert_anchor_count(session, COVERAGE_SQL, actual_anchor_sql)

        history_count = session.sql(
            f"SELECT COUNT(DISTINCT PROFILE_MONTH) FROM {TABLE}"
        ).collect()[0][0]
        if history_count < num_months:
            raise RuntimeError(
                f"history coverage failed: expected >= {num_months} distinct "
                f"PROFILE_MONTH values, got {history_count}"
            )

    except Exception as exc:
        status = "FAILED"
        err = str(exc)[:4000]
        raise

    finally:
        # 6. Always log — success or failure.
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


def assert_anchor_count(session: Any, expected_sql: str, actual_sql: str) -> None:
    """Assert COUNT(DISTINCT ACCOUNT_ID) FROM table >= audience size.

    Lightweight inline equivalent of cumulus_common.assert_coverage that
    accepts >= rather than ==. The backfill may run after the current-cycle
    SP has already populated current-month rows for the audience, so the
    table can carry MORE distinct anchors than the audience query reports
    (e.g. if an anchor was once in V_ACCOUNT_ANCHORS but has since been
    pruned). >= is the correct inequality.
    """
    expected = int(session.sql(expected_sql).collect()[0][0])
    actual = int(session.sql(actual_sql).collect()[0][0])
    if actual < expected:
        raise RuntimeError(
            f"anchor coverage failed: expected >= {expected} distinct "
            f"ACCOUNT_ID, got {actual}"
        )


# -------------------------------------------------------------------
# _merge_batch — one MERGE round-trip for up to MERGE_BATCH_ROWS records.
#
# Mirrors sp_generate_mgp_financial_plans._merge but uses a per-batch
# staging-table name to make concurrent re-runs visually distinguishable
# in QUERY_HISTORY (the staging table is overwritten each call regardless).
# -------------------------------------------------------------------

def _merge_batch(session: Any, records: list[dict], batch_idx: int) -> int:
    """MERGE one batch of records into TABLE. Returns rows MERGED.

    Same casts as sp_generate_mgp_financial_plans._merge — kept verbatim so
    the v1 schema-cast invariants apply to backfilled rows identically:
      - GENERATED_AT: TO_TIMESTAMP_NTZ(... / 1e9) cast
      - ADVISOR_NOTES_FLAG: ::BOOLEAN cast
      - DATE columns: pass through, NULLs preserved.
    """
    if not records:
        return 0

    import pandas as pd
    df = pd.DataFrame(records)
    staging = f"MGP_FINANCIAL_PLANS_BACKFILL_STAGING_{batch_idx}"

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
    # Drop the per-batch staging table to keep schema clean — overwrite=True
    # keeps it across re-runs otherwise.
    try:
        session.sql(f"DROP TABLE IF EXISTS FINS.PUBLIC.{staging}").collect()
    except Exception:
        # Non-fatal — the staging table will be overwritten next run.
        pass
    return int(rows[0][0]) if rows else len(records)
