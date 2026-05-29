"""Backfill SP for FINS.PUBLIC.MOODYS_MARKET_CONTEXT.

Snowpark Python stored procedure registered as
FINS.PUBLIC.SP_BACKFILL_MOODYS_MARKET_CONTEXT. Fans the daily generator
out across the prior `num_days` calendar days so every BUSINESS account
has a 90-day Moody''s-style history available at demo time.

Why a separate SP:
  - The daily generator (`SP_GENERATE_MOODYS_MARKET_CONTEXT`) emits one
    row per BUSINESS anchor for the current PROFILE_DATE only (~11,389 rows).
  - The customer-profile tile needs a 90-day window of history to render
    sparklines / trend charts at demo time, so we backfill 90 days of
    PROFILE_DATEs in one shot before the daily SP takes over.
  - Volume: 11,389 anchors * 90 days = ~1,025,010 rows. We batch the
    MERGE in 100K-row chunks so a single failure doesn''t cost the whole
    run, and so write_pandas + the staging table stay within reasonable
    memory bounds.

The row factory and MERGE helper are imported from the daily SP module
so the backfilled rows are byte-identical to what the daily SP would
emit on each historical date — no code drift between the two procedures.

Backfill is IDEMPOTENT: re-running with the same `num_days` re-MERGEs
the same (ACCOUNT_ID, PROFILE_DATE) PK rows and produces no row-count
change. The daily SP can run in parallel without conflict (it writes a
new PROFILE_DATE the backfill never produces — today''s date is excluded
from the backfill window by design).

Plan:    docs/superpowers/plans/2026-05-28-cumulus-plan-13-moodys-market-context.md
Rowspec: docs/superpowers/plans/attachments/cumulus-plan-13-moodys-market-context-rowspec.md
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from typing import Any

# Reuse the daily SP''s row factory + MERGE helper so backfill rows are
# byte-identical to what the daily SP would produce on each historical date.
from sp_generate_moodys_market_context import (
    AUDIENCE_SQL,
    _anchor_to_dict,
    _day_start,
    _merge,
    _rows_for,
)


# -------------------------------------------------------------------
# Constants
# -------------------------------------------------------------------

TASK_NAME = "SP_BACKFILL_MOODYS_MARKET_CONTEXT"

# Default backfill window — Plan 13 v2 demo target. The customer-profile
# tile renders a 90-day sparkline; anything shorter feels stubby on demo.
_DEFAULT_NUM_DAYS = 90

# MERGE batch size. write_pandas + the staging-table MERGE pattern from
# the daily SP comfortably handles ~100K-row batches; smaller batches add
# round-trip overhead, larger batches risk memory spikes on the worker.
_BATCH_SIZE = 100_000


# -------------------------------------------------------------------
# Entry point
# -------------------------------------------------------------------

def main(session: Any, num_days: int = _DEFAULT_NUM_DAYS) -> str:
    """Backfill `num_days` of PROFILE_DATEs into MOODYS_MARKET_CONTEXT.

    Steps:
      1. Read BUSINESS audience (~11,389 anchors).
      2. For each PROFILE_DATE in (today - num_days .. today - 1):
           - build rows for every anchor on that date
           - flush to MERGE in 100K-row batches
      3. Final flush of any remainder batch.
      4. Always log to TASK_EXECUTION_LOG (success or failure).

    Today''s PROFILE_DATE is intentionally excluded — the daily SP owns
    today''s slice. Backfill = strictly historical.

    Idempotent: re-running with the same num_days MERGEs the same PK rows
    so total row count in MOODYS_MARKET_CONTEXT stays stable.
    """
    if num_days < 1:
        raise ValueError(f"num_days must be >= 1, got {num_days}")

    log_id = str(uuid.uuid4())
    started = datetime.utcnow()
    rows_inserted, accounts_processed = 0, 0
    status, err = "SUCCEEDED", None

    try:
        # 1. Read audience once. Reused across every PROFILE_DATE — the
        # anchor view is "today''s roster" so all 90 days of backfill use
        # the same anchor set (intentional: customers added later don''t
        # get retroactively filled).
        audience = session.sql(AUDIENCE_SQL).collect()
        accounts_processed = len(audience)
        anchors = [_anchor_to_dict(row) for row in audience]

        # 2. Iterate calendar dates oldest -> newest. End date is yesterday
        # so today is left to the daily SP.
        today = _day_start(started).date()
        end_date = today - timedelta(days=1)
        start_date = today - timedelta(days=num_days)

        batch: list[dict] = []
        days_processed = 0
        per_row_errors = 0
        max_errors_total = max(1000, (accounts_processed * num_days) // 100)

        cursor = start_date
        while cursor <= end_date:
            for anchor in anchors:
                try:
                    batch.extend(_rows_for(anchor, cursor))
                except Exception:
                    # Tolerate per-row errors at <=1% of total fan-out.
                    per_row_errors += 1
                    if per_row_errors > max_errors_total:
                        raise RuntimeError(
                            f"backfill row factory failed on {per_row_errors} rows "
                            f"(tolerance {max_errors_total})"
                        )

                if len(batch) >= _BATCH_SIZE:
                    rows_inserted += _merge(session, batch)
                    batch = []

            days_processed += 1
            cursor = cursor + timedelta(days=1)

        # 3. Flush remainder.
        if batch:
            rows_inserted += _merge(session, batch)
            batch = []

        if per_row_errors:
            err = (
                f"backfill tolerated {per_row_errors} per-row errors "
                f"(tolerance {max_errors_total})"
            )

    except Exception as exc:
        status = "FAILED"
        err = str(exc)[:4000]
        raise

    finally:
        # 4. Always log. accounts_processed = anchor count (NOT row count);
        # row count is captured in ROWS_INSERTED.
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

    return (
        f"{TASK_NAME}: {status} rows={rows_inserted} "
        f"anchors={accounts_processed} days={num_days}"
    )
