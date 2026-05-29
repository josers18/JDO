"""One-shot historical backfill for FINS.PUBLIC.GONG_CALL_SENTIMENT.

Snowpark Python stored procedure registered as
FINS.PUBLIC.SP_BACKFILL_GONG_CALL_SENTIMENT. Companion to the weekly-cadence
SP_GENERATE_GONG_CALL_SENTIMENT — this SP iterates the same row factory
(`_rows_for`) across the prior `num_weeks` Mondays so the table is hydrated
with realistic call-sentiment history before the live weekly task takes over.

Default scope: 24 weeks x 36,813 anchors = ~883,512 rows. Run once and never
again — the weekly task picks up the current cycle from there.

Cadence:  ONE-SHOT (manual invocation; not scheduled)
Audience: All-accounts (mirrors the weekly SP after rebroadcast)
Salts:    Same `gong` / `gong_rm` / `gong_trend` model as the weekly SP —
          determinism per-(anchor, profile_week) is byte-identical.

Strategy (canonical 5-step adapted for backfill):
  1. Read audience from V_ACCOUNT_ANCHORS once.
  2. Iterate weeks newest-first (this Monday backwards `num_weeks` steps).
     For each week, build all anchor rows in memory then flush to
     a per-batch MERGE when the in-flight buffer hits BATCH_SIZE rows.
  3. Each MERGE goes through `_merge` from the weekly SP (DRY) using a
     unique staging-table suffix per batch so concurrent invocations
     don't collide.
  4. Coverage assertion at the end: COUNT(DISTINCT ACCOUNT_ID) >=
     audience size (backfill writes one row per anchor for every week,
     so distinct ACCOUNT_IDs match audience).
  5. Always log to TASK_EXECUTION_LOG with TASK_NAME=
     'SP_BACKFILL_GONG_CALL_SENTIMENT', success or failure.

Batching:
  Records flush to MERGE every BATCH_SIZE rows (default 100,000). At
  ~36,813 anchors / week, one full week is ~37K rows -> we accumulate
  about 2.7 weeks per batch -> ~9 MERGE calls for the default 24-week
  backfill. Per-batch staging tables are named
  `GONG_CALL_SENTIMENT_STAGING_BATCH<n>` so each MERGE has a clean,
  dedicated staging surface.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta
from typing import Any

# Reuse the row factory + MERGE from the weekly SP — DRY and guarantees
# byte-identical determinism between the weekly task and the backfill.
from sp_generate_gong_call_sentiment import (
    AUDIENCE_SQL,
    COVERAGE_SQL,
    TABLE,
    _anchor_to_dict,
    _merge,
    _profile_week_from,
    _rows_for,
)
from cumulus_common import assert_coverage


# -------------------------------------------------------------------
# Constants
# -------------------------------------------------------------------

TASK_NAME = "SP_BACKFILL_GONG_CALL_SENTIMENT"
DEFAULT_NUM_WEEKS = 24
BATCH_SIZE = 100_000  # MERGE flush threshold


# -------------------------------------------------------------------
# Backfill week-list helper
# -------------------------------------------------------------------

def _backfill_weeks(anchor_dt: datetime, num_weeks: int) -> list[date]:
    """Return `num_weeks` Monday-of-week dates ending at the Monday of
    `anchor_dt`, ordered oldest -> newest.

    Oldest-first ordering means MERGE order matches calendar order so
    range queries on PROFILE_WEEK behave naturally during/after the
    backfill.
    """
    if num_weeks < 1:
        raise ValueError(f"num_weeks must be >= 1; got {num_weeks!r}")
    end_week = _profile_week_from(anchor_dt)
    weeks = [end_week - timedelta(weeks=i) for i in range(num_weeks)]
    weeks.sort()  # oldest first
    return weeks


# -------------------------------------------------------------------
# Entry point
# -------------------------------------------------------------------

def main(session: Any, num_weeks: int = DEFAULT_NUM_WEEKS) -> str:
    """Backfill `num_weeks` historical weeks of GONG_CALL_SENTIMENT.

    Args:
        session: Snowpark session (injected by Snowflake).
        num_weeks: Number of weeks of history to backfill, ending at the
            Monday of `started`. Default 24 (~883K rows for 36,813 anchors).

    Returns:
        Status summary string. Side effect: TASK_EXECUTION_LOG row is
        always written, success or failure.
    """
    log_id = str(uuid.uuid4())
    started = datetime.utcnow()
    rows_inserted, accounts_processed = 0, 0
    status, err = "SUCCEEDED", None
    weeks_processed = 0
    batches_flushed = 0

    try:
        if num_weeks < 1:
            raise ValueError(f"num_weeks must be >= 1; got {num_weeks!r}")

        # 1. Read audience once.
        raw_audience = session.sql(AUDIENCE_SQL).collect()
        audience = [_anchor_to_dict(r) for r in raw_audience]
        accounts_processed = len(audience)
        if accounts_processed == 0:
            raise RuntimeError("audience is empty; aborting backfill")

        # Compute the calendar of weeks to hydrate (oldest -> newest).
        weeks = _backfill_weeks(started, num_weeks)

        # 2. Iterate weeks; buffer rows; flush every BATCH_SIZE rows.
        buffer: list[dict] = []
        errors: list[tuple[Any, date, str]] = []
        max_tolerated = max(50, (accounts_processed * num_weeks) // 100)

        for profile_week in weeks:
            for anchor in audience:
                try:
                    buffer.extend(_rows_for(anchor, profile_week))
                except Exception as exc:
                    errors.append(
                        (anchor.get("ACCOUNT_ID"), profile_week, str(exc)[:200])
                    )
                if len(buffer) >= BATCH_SIZE:
                    flushed = _merge(
                        session, buffer,
                        staging_suffix=f"BATCH{batches_flushed}",
                    )
                    rows_inserted += flushed
                    batches_flushed += 1
                    buffer = []
            weeks_processed += 1

        # Final partial flush.
        if buffer:
            flushed = _merge(
                session, buffer,
                staging_suffix=f"BATCH{batches_flushed}",
            )
            rows_inserted += flushed
            batches_flushed += 1
            buffer = []

        # Tolerance guard — same 1% threshold as the weekly SP, scaled
        # by num_weeks since each anchor contributes num_weeks attempts.
        if len(errors) > max_tolerated:
            first = errors[0] if errors else "n/a"
            raise RuntimeError(
                f"row factory failed on {len(errors)} "
                f"(anchor, week) tuples (tolerance {max_tolerated}); "
                f"first: {first}"
            )
        if errors:
            err = (
                f"row factory failed on {len(errors)} (anchor, week) "
                f"tuples; first: {errors[0]}"
            )

        # 3. Coverage assertion. Backfill writes one row per anchor for
        # every week, so DISTINCT ACCOUNT_ID across the table must match
        # audience size.
        actual_sql = f"SELECT COUNT(DISTINCT ACCOUNT_ID) FROM {TABLE}"
        assert_coverage(session, COVERAGE_SQL, actual_sql)

    except Exception as exc:
        status = "FAILED"
        err = str(exc)[:4000]
        raise

    finally:
        # 4. Always log — success or failure. Encode batch / week progress
        # into ERROR_MESSAGE on success so operators can see the run shape.
        progress = (
            f"weeks={weeks_processed}/{num_weeks} "
            f"batches={batches_flushed} "
            f"batch_size={BATCH_SIZE}"
        )
        if status == "SUCCEEDED":
            err = progress if err is None else f"{progress}; {err}"

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
        f"accounts={accounts_processed} weeks={weeks_processed} "
        f"batches={batches_flushed}"
    )
