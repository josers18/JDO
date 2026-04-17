# Historical Backfill Guide

## Overview

The `GENERATE_HISTORICAL_TRADES` procedure fills in past trade data for all active accounts over a specified date range. It was designed for the initial backfill of ~1.5M trades from June 2024 to present, but can be used for any date range.

## Usage

```sql
-- Basic call
CALL FINS.PUBLIC.GENERATE_HISTORICAL_TRADES('2024-06-01'::DATE, '2024-12-31'::DATE);

-- Recommended: use the LARGE_LOAD warehouse for bulk operations
USE WAREHOUSE LARGE_LOAD;
CALL FINS.PUBLIC.GENERATE_HISTORICAL_TRADES('2024-06-01'::DATE, '2024-12-31'::DATE);
```

## Chunking Strategy

For large date ranges (more than ~4 months), the procedure should be called in chunks to avoid query timeouts. The procedure has built-in resume capability, so chunks can be run sequentially without data issues.

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

The procedure reads existing trades from `FINANCIAL_TRADES` to initialize the per-account `last_gen` dictionary before iterating through the date range. This enables:

1. **Chunk boundaries**: WEEKLY and MONTHLY frequency gating works correctly across chunk transitions. Without this, every account would appear "due" on Day 1 of each new chunk.

2. **Failure recovery**: If a chunk fails partway through, re-running it with the same parameters will skip already-generated days (per account) and continue from where it left off.

3. **Idempotency within frequency**: Because `_is_due()` checks `last_gen`, re-running a chunk won't create duplicate trigger points for WEEKLY/MONTHLY accounts. However, DAILY accounts will generate new (different) trades for the same day if the existing trades aren't detected -- the resume reads `MAX(TRADE_DATE)` per account.

### Resume Logic

```python
# Query existing trades to initialize state
existing = session.sql("""
    SELECT ACCOUNT_ID, MAX(TRADE_DATE)::DATE AS last_date
    FROM FINANCIAL_TRADES
    WHERE TRADE_DATE >= ? AND TRADE_DATE <= ?
    GROUP BY ACCOUNT_ID
""", params=[start_date_str, end_date_str]).collect()

for row in existing:
    last_gen[row["ACCOUNT_ID"]] = row["LAST_DATE"]
```

## Progress Tracking

The procedure logs an `IN_PROGRESS` entry to `TASK_EXECUTION_LOG` every 50 business days:

```sql
-- Monitor backfill progress during execution
SELECT TASK_NAME, STATUS, ROWS_INSERTED, ACCOUNTS_PROCESSED, ERROR_MESSAGE, DURATION_MS
FROM FINS.PUBLIC.TASK_EXECUTION_LOG
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
| Resume support | Not needed (single day) | Yes -- reads existing trades to init state |
| Progress logging | Single log entry on completion | Every 50 business days + completion |
| LAST_GENERATED_DATE update | Yes (per account) | No (avoids overwriting daily task state) |
| Recommended warehouse | `TASK_WH` (X-Small) | `LARGE_LOAD` (X-Large) |
| Invocation | Automated (1 AM ET task) | Manual |

## Troubleshooting

### Timeout errors

If the procedure times out, the trades inserted so far are committed (each batch INSERT is auto-committed). Re-run the same chunk and the resume capability will handle continuity.

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
