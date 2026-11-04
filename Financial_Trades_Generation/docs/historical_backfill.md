# Historical Backfill Guide

## Overview

The `GENERATE_HISTORICAL_TRADES` procedure fills in past trade data for all active accounts over a specified date range. It was designed for the initial backfill of ~1.5M trades from June 2024 to present, but can be used for any date range.

## Usage

```sql
-- Basic call
CALL DATA_JEDAIS.FINS__PUBLIC.GENERATE_HISTORICAL_TRADES('2024-06-01'::DATE, '2024-12-31'::DATE);

-- Recommended: use the LARGE_LOAD warehouse for bulk operations
USE WAREHOUSE LARGE_LOAD;
CALL DATA_JEDAIS.FINS__PUBLIC.GENERATE_HISTORICAL_TRADES('2024-06-01'::DATE, '2024-12-31'::DATE);
```

## Chunking Strategy

For large date ranges (more than ~4 months), the procedure should be called in chunks to avoid query timeouts. Chunks can be run back to back, and a chunk can be re-run safely: (account, day) pairs it already wrote are skipped (see [Resume Capability](#resume-capability)).

### Recommended Chunk Sizes

| Warehouse Size | Recommended Chunk | Approx Duration |
|---|---|---|
| X-Small (`TASK_WH`) | 2 months | Varies |
| X-Large (`LARGE_LOAD`) | 4 months | Varies |

### Example: Full Backfill (Jun 2024 -- Apr 2026)

The original backfill was executed in 5 chunks on the `LARGE_LOAD` (X-Large) warehouse:

```sql
USE WAREHOUSE LARGE_LOAD;

-- Chunk 1: Jun 2024 - Dec 2024
CALL GENERATE_HISTORICAL_TRADES('2024-06-01'::DATE, '2024-12-31'::DATE);
-- Result: ~436,000 trades

-- Chunk 2: Jan 2025 - Mar 2025
CALL GENERATE_HISTORICAL_TRADES('2025-01-01'::DATE, '2025-03-31'::DATE);
-- Result: ~239,000 trades

-- Chunk 3: Apr 2025 - Jul 2025
CALL GENERATE_HISTORICAL_TRADES('2025-04-01'::DATE, '2025-07-31'::DATE);
-- Result: ~275,000 trades

-- Chunk 4: Aug 2025 - Nov 2025
CALL GENERATE_HISTORICAL_TRADES('2025-08-01'::DATE, '2025-11-30'::DATE);
-- Result: ~269,000 trades

-- Chunk 5: Dec 2025 - Apr 2026
CALL GENERATE_HISTORICAL_TRADES('2025-12-01'::DATE, '2026-04-16'::DATE);
-- Result: ~308,000 trades

-- Total: 1,531,879 trades
```

## Resume Capability

The procedure reads `FINANCIAL_TRADES` twice before it iterates through the date range:

1. **Chunk boundaries**: each account's last trade *before* `START_DATE` seeds the per-account `last_gen` dictionary, so WEEKLY and MONTHLY gating carries across chunk transitions. Without it, every account would appear "due" on day 1 of each new chunk.

2. **Re-run safety** (since 2026-11-04): every (account, day) pair already in the table *between* `START_DATE` and `END_DATE` goes into a `done` set. In the loop a pair in `done` is skipped before `_is_due()`, and it still advances `last_gen`, so the gating after it matches what the earlier run did. Re-running a chunk after a timeout therefore writes only the pairs that are missing, and re-running a finished chunk writes nothing.

3. **Whole account-days per batch**: the 5,000-row flush happens between accounts, never inside one account's trades, so each `write_pandas` COPY commits complete account-days. A run cut off by a timeout can't leave a partial day that the next run would then skip.

### Resume Logic

```python
# 1. Seed the gating state from the last trade before the chunk
resume_rows = session.sql(
    f"SELECT ACCOUNT_ID, MAX(TRADE_DATE)::DATE AS LAST_DATE "
    f"FROM DATA_JEDAIS.FINS__PUBLIC.FINANCIAL_TRADES "
    f"WHERE TRADE_DATE < '{start_d.isoformat()}'::TIMESTAMP_TZ "
    f"GROUP BY ACCOUNT_ID").collect()

# 2. Pairs already written inside the chunk
done = {(r["ACCOUNT_ID"], r["TRADE_DATE"]) for r in session.sql(
    f"SELECT DISTINCT ACCOUNT_ID, TRADE_DATE "
    f"FROM DATA_JEDAIS.FINS__PUBLIC.FINANCIAL_TRADES "
    f"WHERE TRADE_DATE BETWEEN '{start_d.isoformat()}'::DATE "
    f"AND '{end_d.isoformat()}'::DATE AND ACCOUNT_ID LIKE '001%'").collect()}

# 3. In the loop, before _is_due()
if (acct["id"], trade_day) in done:
    last_gen[acct["id"]] = trade_day
    skipped += 1
    continue
```

The count of skipped pairs is in the return string and in the `ERROR_MESSAGE` column of the `IN_PROGRESS` and `SUCCEEDED` log rows (for example `Chunk 2026-09-01-2026-10-30: skipped 952 existing (account, day) pairs`).

Tested 2026-11-04 on scratch copies of the three tables (400 sampled accounts, 2026-09-01 to 2026-10-30). A clean run wrote 11,245 trades. After 6,421 of them were deleted (every day from 10-01, plus a third of the accounts from 09-15), a re-run wrote exactly 6,421 and skipped 952 pairs. A third run wrote 0 and skipped all 2,235. The final table matched the clean run on every (account, day) row count.

The skip works per (account, day), not per trade. A pair with fewer rows than `TRADES_PER_PERIOD`, left by a pre-2026-11-04 run that was cut off mid-account, is skipped as is. Pairs written by something other than this procedure (for example the daily generator on the same day) are skipped too.

## Progress Tracking

The procedure logs an `IN_PROGRESS` entry to `TASK_EXECUTION_LOG` every 50 business days:

```sql
-- Monitor backfill progress during execution
SELECT TASK_NAME, STATUS, ROWS_INSERTED, ACCOUNTS_PROCESSED, ERROR_MESSAGE, DURATION_MS
FROM DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG
WHERE TASK_NAME = 'HISTORICAL_BACKFILL'
ORDER BY EXECUTION_TIME DESC
LIMIT 20;
```

Each progress entry shows:
- `ROWS_INSERTED`: Running total of trades inserted so far
- `ACCOUNTS_PROCESSED`: Number of business days processed so far
- `ERROR_MESSAGE`: "Progress: processed N of M business days"
- `DURATION_MS`: Elapsed time in milliseconds

## Volume Estimates

Expected trade volumes by account frequency (per business day):

| Frequency | Accounts | Fire Frequency | Est. Trades/Business Day |
|---|---|---|---|
| DAILY | 287 | Every business day | ~2,582 |
| WEEKLY | 313 | ~1 in 5 business days | ~313 |
| MONTHLY | 45 | ~1 in 21 business days | ~6 |
| **Total** | | | **~2,900** |

For a full year (~252 business days), expect approximately 730,000 trades.

### Actual Results (Jun 2024 -- Apr 2026)

| Metric | Value |
|---|---|
| Total trades | 1,531,879 |
| Trading days | 489 |
| Avg trades/day | ~3,133 |
| Avg trade value | $95,226 |
| Price range | $8.65 -- $802.69 |

## Differences from Daily Generation

| Aspect | Daily (`GENERATE_DAILY_TRADES`) | Historical (`GENERATE_HISTORICAL_TRADES`) |
|---|---|---|
| Date range | Today only | Arbitrary START_DATE to END_DATE |
| Resume / re-run | Through `LAST_GENERATED_DATE` (`_is_due` gate) | Seeds gating from trades before the chunk; skips (account, day) pairs already in the chunk |
| Progress logging | Single log entry on completion | Every 50 business days + completion |
| LAST_GENERATED_DATE update | Yes (per account) | No (avoids overwriting daily task state) |
| Recommended warehouse | `LARGE_LOAD` (X-Large; the task uses it) | `LARGE_LOAD` (X-Large) |
| Invocation | Automated (3:10 AM ET task) | Manual |

## Troubleshooting

### Timeout errors

If the procedure times out, the batches loaded so far stay committed (each `write_pandas` COPY commits on its own, and each holds whole account-days). Re-run the same chunk with the same parameters: it skips the pairs already written and fills in the rest. Manual CALLs aren't limited by a statement timeout in practice (account, user and warehouse `STATEMENT_TIMEOUT_IN_SECONDS` are 172,800 s), so a timeout usually means the session or client gave up.

### Checking for gaps

```sql
-- Find business days with no trades (potential gaps)
WITH all_dates AS (
    SELECT DATEADD(DAY, SEQ4(), '2024-06-01')::DATE AS d
    FROM TABLE(GENERATOR(ROWCOUNT => 1000))
),
biz_days AS (
    SELECT d FROM all_dates
    WHERE DAYOFWEEK(d) NOT IN (0, 6)  -- Exclude weekends
      AND d <= CURRENT_DATE()
)
SELECT bd.d AS missing_date
FROM biz_days bd
LEFT JOIN (
    SELECT DISTINCT TRADE_DATE::DATE AS td
    FROM FINANCIAL_TRADES
) ft ON bd.d = ft.td
WHERE ft.td IS NULL
ORDER BY bd.d;
```

### Verifying frequency patterns

```sql
-- Check that WEEKLY accounts have ~52 trade weeks per year
SELECT ACCOUNT_ID, COUNT(DISTINCT TRADE_DATE::DATE) AS trade_days
FROM FINANCIAL_TRADES ft
JOIN TRADE_GENERATION_CONFIG cfg ON ft.ACCOUNT_ID = cfg.ACCOUNT_ID
WHERE cfg.FREQUENCY = 'WEEKLY'
GROUP BY ft.ACCOUNT_ID
ORDER BY trade_days;
```
