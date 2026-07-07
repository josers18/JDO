# Transaction Generation Logic

Deep dive into how `GENERATE_DAILY_TRANSACTIONS(n)` produces synthetic bank transactions.

---

## Overview

The procedure generates realistic debit transactions using MCC (Merchant Category Code) sampling, with category-aware amount ranges and business account multipliers. Credits (direct deposits and bonuses) are generated on schedule-driven trigger days.

---

## Idempotency

The first check in every run:

```sql
SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.FINANCIAL_TRANSACTIONS 
WHERE DATE(TRANSACTIONDATE) = CURRENT_DATE()
```

If any transactions exist for today, the SP logs `SKIPPED` and returns immediately. This makes the procedure safe to re-run or retry without duplicate data.

---

## Debit Generation

### MCC Sampling

For each account, the SP samples `n ± 3` random MCC codes from the `MCC` table:

- **Personal accounts** — sample from all 324 MCCs
- **Business accounts** — filtered to business-relevant categories (excludes entertainment, fast food; prioritizes business services, contracted services, utilities)

### Amount Ranges by Category

Amounts are generated using category-specific ranges:

| Category | Min | Max | Business Multiplier |
|---|---|---|---|
| Retail outlets | $10 | $500 | 1.3x |
| Restaurants | $15 | $150 | 1.3x |
| Fast Food | $5 | $30 | — (excluded for business) |
| Hotels | $80 | $500 | 1.8x |
| Airlines | $150 | $1,500 | 1.8x |
| Gas Stations | $20 | $100 | 1.3x |
| Utilities | $50 | $300 | 1.8x |
| Transportation | $5 | $200 | 1.5x |
| Entertainment | $10 | $200 | — (excluded for business) |
| Professional services | $50 | $500 | 2.5x |
| Business services | $30 | $400 | 2.5x |
| Repair services | $40 | $300 | 1.5x |
| Government services | $20 | $500 | 1.3x |
| Agricultural services | $50 | $300 | 1.3x |
| Contracted services | $100 | $1,000 | 2.5x |
| Default (other) | $10 | $300 | 1.3x |

### Transaction Fields

Each generated debit transaction includes:

| Field | Value |
|---|---|
| TRANSACTIONID | UUID v4 |
| POSTINGDATE | Today's date |
| TRANSACTIONDATE | Today's date |
| AMOUNT | Random within category range |
| DESCRIPTION | MCC description |
| TRANSACTION_CATEGORY | MCC `TRAN_CATEGORY` |
| MCC | Numeric MCC code |
| TRANSACTION_STATUS | 'Posted' |
| CURRENCY | 'USD' |
| TRANSACTION_TYPE | 'Debit' |
| SOURCE_TRANSACTION_TYPE | 'Purchase' |

---

## Credit Generation

### Direct Deposits

| Trigger | Day 15 of each month (from `DD_DAY_2` in `ACCOUNT_CREDIT_CONFIG`) |
|---|---|
| Amount | `DIRECT_DEPOSIT_AMOUNT` from config |
| Description | 'Direct Deposit' (Personal) or 'Business Revenue Deposit' (Business) |
| SOURCE_TRANSACTION_TYPE | 'Direct Deposit' |

### Quarterly Bonuses

| Trigger | Day 1 of January, April, July, October |
|---|---|
| Amount | `BONUS_AMOUNT` from config |
| Description | 'Quarterly Bonus Credit' |
| SOURCE_TRANSACTION_TYPE | 'Bonus' |

---

## Balance Rebuild

After inserting transactions, `rebuild_daily_balance()` executes:

```sql
TRUNCATE TABLE DATA_JEDAIS.FINS__PUBLIC.ACCOUNT_DAILY_BALANCE;

INSERT INTO DATA_JEDAIS.FINS__PUBLIC.ACCOUNT_DAILY_BALANCE 
(ACCOUNTID, BALANCE_DATE, OPENING_BALANCE, DAILY_CREDITS, DAILY_DEBITS, CLOSING_BALANCE, TRANSACTION_COUNT)
WITH daily_totals AS (
    SELECT ACCOUNTID, DATE(TRANSACTIONDATE) as BALANCE_DATE,
        SUM(CASE WHEN TRANSACTION_TYPE = 'Credit' THEN AMOUNT ELSE 0 END) as DAILY_CREDITS,
        SUM(CASE WHEN TRANSACTION_TYPE = 'Debit' THEN AMOUNT ELSE 0 END) as DAILY_DEBITS,
        COUNT(*) as TRANSACTION_COUNT
    FROM DATA_JEDAIS.FINS__PUBLIC.FINANCIAL_TRANSACTIONS 
    GROUP BY ACCOUNTID, DATE(TRANSACTIONDATE)
),
running_balance AS (
    SELECT ACCOUNTID, BALANCE_DATE, DAILY_CREDITS, DAILY_DEBITS, TRANSACTION_COUNT,
        SUM(DAILY_CREDITS - DAILY_DEBITS) OVER (
            PARTITION BY ACCOUNTID ORDER BY BALANCE_DATE 
            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ) as OPENING_BALANCE,
        SUM(DAILY_CREDITS - DAILY_DEBITS) OVER (
            PARTITION BY ACCOUNTID ORDER BY BALANCE_DATE 
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) as CLOSING_BALANCE
    FROM daily_totals
)
SELECT ACCOUNTID, BALANCE_DATE, COALESCE(OPENING_BALANCE, 0), 
       DAILY_CREDITS, DAILY_DEBITS, CLOSING_BALANCE, TRANSACTION_COUNT
FROM running_balance;
```

This is a full rebuild — safe because it's deterministic from `FINANCIAL_TRANSACTIONS`.

---

## Execution Logging

Every run logs to `TASK_EXECUTION_LOG`:

| Status | Meaning |
|---|---|
| SUCCEEDED | Transactions generated and balance rebuilt |
| SKIPPED | Transactions already exist for today |
| FAILED | Exception caught; error message stored |

---

## Debug Procedure

`GENERATE_DAILY_TRANSACTIONS_DEBUG(n)` runs the same logic but:
- Collects step-by-step messages instead of raising on error
- Returns a semicolon-separated string of all steps
- Uses Python 3.9 runtime (legacy, kept for compatibility)
- Does NOT call `rebuild_daily_balance()` (simpler logic)
- Does NOT do idempotency check (always generates)

Use it to diagnose issues like missing MCC data, empty account tables, or config problems.
