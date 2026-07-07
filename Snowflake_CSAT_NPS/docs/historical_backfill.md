# Historical Backfill

## Overview

The historical backfill was a one-time operation that populated `CSAT_NPS_DATA` with realistic monthly CSAT and NPS scores for all 741 accounts in `MASTER_ACCOUNTS`, spanning January 2023 through March 2026 (39 months).

## Execution Summary

| Metric | Value |
|--------|-------|
| Accounts processed | 741 |
| Months generated | 39 (Jan 2023 - Mar 2026) |
| Total rows inserted | 28,892 |
| Pre-existing rows preserved | 7 (account `001al00000cWIyXAAW`) |
| Final table row count | 28,899 |

## Pre-Existing Data

One account (`001al00000cWIyXAAW`) had 7 rows of real CSAT/NPS data already in the table. The backfill script used a `NOT EXISTS` filter to skip those specific account + month combinations, then generated scores for the remaining 32 months. This preserved the original data while filling gaps.

## Archetype Distribution

The backfill assigned each account to one of five trajectory archetypes using `HASH(ACCOUNT_ID) % 100`:

| Archetype | Bucket Range | Percentage | Approx. Accounts |
|-----------|-------------|------------|-------------------|
| Positive | 0 - 29 | 30% | ~222 |
| Negative | 30 - 49 | 20% | ~148 |
| Neutral | 50 - 79 | 30% | ~222 |
| Recovery | 80 - 89 | 10% | ~74 |
| Volatile | 90 - 99 | 10% | ~74 |

## Data Quality

### Score Distributions (Post-Backfill)

| Metric | Value |
|--------|-------|
| Average CSAT | 70.1 |
| Average NPS | 6.5 |
| CSAT range | 20 - 100 |
| NPS range | 0 - 10 |

### NPS Category Breakdown

| Category | Count | Percentage |
|----------|-------|------------|
| Detractor (0-6) | 13,507 | 46.7% |
| Passives (7-8) | 12,720 | 44.0% |
| Promoter (9-10) | 2,672 | 9.2% |

## Methodology

1. **Month generation**: Used Snowflake `GENERATOR(ROWCOUNT => 39)` to create 39 monthly date records from `2023-01-01`
2. **Account enumeration**: Selected distinct `ACCOUNT_ID` values from `MASTER_ACCOUNTS`
3. **Cross join**: Every account x every month = 28,899 potential rows
4. **Archetype assignment**: `HASH(ACCOUNT_ID) % 100` determined each account's trajectory type
5. **Score computation**: Archetype-specific formulas with per-month noise from `HASH(ACCOUNT_ID || SCORE_DATE)`
6. **NPS derivation**: Piecewise linear mapping from CSAT to NPS
7. **Existing data filter**: `NOT EXISTS` clause excluded the 7 pre-existing rows
8. **ROWID assignment**: `ROW_NUMBER()` offset from `MAX(ROWID)` to continue the sequence

## Reproducibility

The backfill is fully deterministic. Running the same query against the same accounts and date range will produce identical scores because:

- Archetype assignment uses `HASH(ACCOUNT_ID)` (stable for a given ID)
- Monthly noise uses `HASH(ACCOUNT_ID || SCORE_DATE)` (stable for a given ID + month pair)
- No random functions (`RANDOM()`, `UNIFORM()`) were used

## Verification Queries

### Check total rows
```sql
SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.CSAT_NPS_DATA;
-- Expected: 28,899
```

### Verify archetype distribution
```sql
SELECT
    CASE
        WHEN ABS(HASH(ACCOUNTID)) % 100 < 30  THEN 'Positive'
        WHEN ABS(HASH(ACCOUNTID)) % 100 < 50  THEN 'Negative'
        WHEN ABS(HASH(ACCOUNTID)) % 100 < 80  THEN 'Neutral'
        WHEN ABS(HASH(ACCOUNTID)) % 100 < 90  THEN 'Recovery'
        ELSE 'Volatile'
    END AS archetype,
    COUNT(DISTINCT ACCOUNTID) AS accounts
FROM DATA_JEDAIS.FINS__PUBLIC.CSAT_NPS_DATA
GROUP BY 1
ORDER BY 2 DESC;
```

### Confirm preserved original data
```sql
SELECT * FROM DATA_JEDAIS.FINS__PUBLIC.CSAT_NPS_DATA
WHERE ACCOUNTID = '001al00000cWIyXAAW'
ORDER BY SCORE_DATE;
-- Should include 7 original rows alongside backfilled rows
```

### Sample a positive trajectory
```sql
SELECT ACCOUNTID, SCORE_DATE, CSAT_SCORE, NPS_SCORE
FROM DATA_JEDAIS.FINS__PUBLIC.CSAT_NPS_DATA
WHERE ACCOUNTID IN (
    SELECT DISTINCT ACCOUNTID FROM DATA_JEDAIS.FINS__PUBLIC.CSAT_NPS_DATA
    WHERE ABS(HASH(ACCOUNTID)) % 100 < 30
    LIMIT 1
)
ORDER BY SCORE_DATE;
```
