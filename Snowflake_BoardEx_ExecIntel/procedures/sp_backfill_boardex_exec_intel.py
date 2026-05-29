"""BoardEx Exec Intel — 24-month history backfill stored procedure.

Snowpark Python stored procedure registered as
FINS.PUBLIC.SP_BACKFILL_BOARDEX_EXEC_INTEL. **One-shot rebroadcast
companion** to sp_generate_boardex_exec_intel.py (the monthly current-
cycle SP). Iterates the all-accounts audience x 24 months of history
to seed roughly 883K rows (~36,813 anchors x 24 months) into
FINS.PUBLIC.BOARDEX_EXEC_INTEL.

Cadence:  one-shot (run on demand from a worksheet or task; no CRON).
Audience: all accounts (1=1 predicate; same as the current-cycle SP).
Salt:     "boardex" (inherited via _rows_for from sp_generate_boardex_exec_intel).
History:  24 calendar months ending at the current month (inclusive).
          Month N = first-of-month UTC; per-month re-runs are byte-identical.
Batching: rows are MERGEd in 100,000-row batches via a write_pandas /
          MERGE pair against a single staging table (overwrite=True per
          batch). At ~36,813 rows/month one batch covers roughly 2-3
          months of output; 24 months -> roughly 9-10 staged MERGEs.
Logging:  one TASK_EXECUTION_LOG row per invocation with
          TASK_NAME='SP_BACKFILL_BOARDEX_EXEC_INTEL'. ROWS_INSERTED is the
          aggregate across all batches; ACCOUNTS_PROCESSED is len(audience)
          (not len(audience) x num_months — same shape as the current-cycle
          SP's accounts_processed semantics).

Contract for the L1 sibling tests (Plan 10 T3) — re-uses the generator's
row factory and audience predicate so PERSON-vs-BUSINESS routing,
seed derivation, and 15-column shape are bit-identical to the monthly
SP. The backfill SP has NO row-builder of its own; only the iteration,
batching, MERGE, and logging are local to this file.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta
from typing import Any

from sp_generate_boardex_exec_intel import (
    AUDIENCE_SQL,
    COVERAGE_SQL,
    EXPECTED_OUTPUT_COLUMNS,
    TABLE,
    _anchor_in_audience,
    _anchor_to_dict,
    _rows_for,
)


# -------------------------------------------------------------------
# Constants — backfill-local. The generator owns table + dataset + salt.
# -------------------------------------------------------------------

TASK_NAME    = "SP_BACKFILL_BOARDEX_EXEC_INTEL"
BATCH_SIZE   = 100_000  # rows per MERGE batch — see module docstring
DEFAULT_NUM_MONTHS = 24

# 15-column output contract — re-asserted here so a future drift in
# the generator's contract is caught at backfill import time.
assert len(EXPECTED_OUTPUT_COLUMNS) == 15, (
    f"BoardEx EXPECTED_OUTPUT_COLUMNS expected 15 columns, "
    f"got {len(EXPECTED_OUTPUT_COLUMNS)}"
)


# -------------------------------------------------------------------
# Month-iteration helper. Yields first-of-month datetime values from
# (current_month - num_months + 1) through current_month, inclusive,
# in chronological order. The current calendar month is the LAST
# month emitted (so a same-month re-run of the monthly SP MERGE-
# replaces the backfill's last-month rows in place).
# -------------------------------------------------------------------

def _month_floor(dt: datetime) -> datetime:
    """Floor a datetime to first-of-month 00:00:00 UTC."""
    return dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _iter_history_months(reference: datetime, num_months: int) -> list[datetime]:
    """Return num_months first-of-month datetimes ending at reference's month.

    The list is chronological (oldest first). For num_months=24 and
    reference=2026-05-28, the list is 2024-06-01 through 2026-05-01,
    inclusive, length 24.
    """
    if num_months <= 0:
        raise ValueError(f"num_months must be positive, got {num_months}")
    end_month = _month_floor(reference)
    months: list[datetime] = []
    cursor = end_month
    for _ in range(num_months):
        months.append(cursor)
        # Step backward one month — handles year boundaries naturally
        # because cursor.day == 1 always.
        prev_last_day = cursor - timedelta(days=1)
        cursor = _month_floor(prev_last_day)
    months.reverse()
    return months


# -------------------------------------------------------------------
# Entry point — invoked manually or via SP_RUN_WITH_RETRY ->
# SP_BACKFILL_BOARDEX_EXEC_INTEL. Idempotent: re-runs MERGE-replace
# on composite PK (ACCOUNT_ID, PROFILE_MONTH).
# -------------------------------------------------------------------

def main(session: Any, num_months: int = DEFAULT_NUM_MONTHS) -> str:
    """Backfill num_months of history into FINS.PUBLIC.BOARDEX_EXEC_INTEL.

    The 5-step canonical pattern, adapted for cross-month iteration:
      1. read audience (once — same SQL as the monthly SP).
      2. for each of num_months calendar months: build per-anchor rows
         via _rows_for(anchor, month_start), accumulate into a buffer,
         MERGE every BATCH_SIZE rows.
      3. final-flush MERGE for any leftover rows in the buffer.
      4. assert coverage (distinct ACCOUNT_ID count >= audience size).
      5. log to TASK_EXECUTION_LOG with TASK_NAME=SP_BACKFILL_BOARDEX_EXEC_INTEL.

    Per-anchor row-factory failures are tolerated up to 1% of audience
    AGGREGATED across all months — same tolerance shape as the monthly
    SP. Above tolerance, the SP fails and the FAILED row is logged.

    Args:
        session: Snowpark Session injected by the SP runtime.
        num_months: number of history months to backfill (default 24).
            Must be positive. The current calendar month is the LAST
            month emitted (so chronological order ends at "now").

    Returns:
        Status string — same shape as the current-cycle SP:
        f"{TASK_NAME}: {status} rows={rows_inserted} accounts={accounts_processed}".
    """
    log_id = str(uuid.uuid4())
    started = datetime.utcnow()
    rows_inserted, accounts_processed, status, err = 0, 0, "SUCCEEDED", None

    try:
        # 1. Read audience once — every month re-uses the same anchor list.
        raw_audience = session.sql(AUDIENCE_SQL).collect()
        audience = [_anchor_to_dict(r) for r in raw_audience]
        accounts_processed = len(audience)

        # Defense in depth — drop anchors that fail the audience predicate
        # before iteration (saves num_months x audience predicate calls).
        in_audience = [a for a in audience if _anchor_in_audience(a)]

        history_months = _iter_history_months(started, num_months)

        buffer: list[dict] = []
        errors: list[tuple[Any, str]] = []
        total_rows_factory_attempted = 0

        for month_start in history_months:
            for anchor in in_audience:
                total_rows_factory_attempted += 1
                try:
                    buffer.extend(_rows_for(anchor, month_start))
                except Exception as exc:
                    errors.append((anchor.get("ACCOUNT_ID"), str(exc)[:200]))
                # Flush in BATCH_SIZE-row chunks to bound staging-table size.
                if len(buffer) >= BATCH_SIZE:
                    rows_inserted += _merge(session, buffer)
                    buffer = []

        # 3. Final flush for any leftover rows under BATCH_SIZE.
        if buffer:
            rows_inserted += _merge(session, buffer)

        # Tolerate up to 1% per-anchor-month factory failures across
        # the entire backfill window. At 24 months x ~36,813 anchors
        # this is ~8.8K tolerated failures — same fractional tolerance
        # as the monthly SP applied across the full backfill.
        max_tolerated = max(10, total_rows_factory_attempted // 100)
        if len(errors) > max_tolerated:
            raise RuntimeError(
                f"row factory failed on {len(errors)}/{total_rows_factory_attempted} "
                f"(anchor, month) pairs (tolerance {max_tolerated}); "
                f"first: {errors[0] if errors else 'n/a'}"
            )
        if errors:
            err = (
                f"row factory failed on {len(errors)}/{total_rows_factory_attempted} "
                f"(anchor, month) pairs; first: {errors[0]}"
            )

        # 4. Coverage check — distinct anchor count in TABLE matches
        # audience size. Backfill emits every audience anchor at least
        # once (across num_months), so the assertion holds.
        actual_sql = f"SELECT COUNT(DISTINCT ACCOUNT_ID) FROM {TABLE}"
        assert_coverage_local(session, COVERAGE_SQL, actual_sql)

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


# -------------------------------------------------------------------
# assert_coverage_local — local re-import shim so the backfill SP
# does not pull cumulus_common into module-load time twice. Keeps the
# import surface of this file minimal (only the generator + stdlib)
# while still using the shared coverage helper.
# -------------------------------------------------------------------

def assert_coverage_local(session: Any, expected_sql: str, actual_sql: str) -> None:
    """Lazy-load the shared coverage helper so module import is cheap."""
    from cumulus_common import assert_coverage
    assert_coverage(session, expected_sql, actual_sql)


# -------------------------------------------------------------------
# _merge — same shape as the generator's _merge. Kept local (not
# imported) so the backfill can be deployed as a standalone SP without
# pulling the generator's MERGE state into Snowflake's procedure
# registration zip on a partial deploy.
# -------------------------------------------------------------------

def _merge(session: Any, records: list[dict]) -> int:
    """MERGE records into BOARDEX_EXEC_INTEL. Returns rows MERGED.

    Same cast strategy as the generator's _merge (mirrored verbatim
    so the staging-table types match across SPs):
      - GENERATED_AT cast back via TO_TIMESTAMP_NTZ.
      - EXEC_TURNOVER_FLAG explicit ::BOOLEAN.
      - 3 DATE columns pass through; the single NULLable date column
        serialises Python None -> SQL NULL transparently.
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
