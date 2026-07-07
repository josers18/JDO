# AGENTS.md — Financial_Transactions_Generation

Context for AI coding agents working on the **Snowflake-native synthetic financial-transactions pipeline**. Generates daily bank transactions (debits + credits) for 2 active accounts using 324 MCC merchant codes, with bi-monthly direct deposits and quarterly bonuses.

For user-facing install / quick-start / row counts, see [README.md](README.md). This file is the agent-orientation primer.

# Tech stack

- **Snowflake** — `DATA_JEDAIS.FINS__PUBLIC` schema. SQL table DDL (`schemas/*.sql`), view DDL (`views/*.sql`), scheduled tasks (`tasks/*.sql`).
- **Snowpark Python 3.11** — used inside the procedures for transaction generation logic (MCC sampling, amount generation, balance rebuild).
- **No Salesforce DX, no Apex, no LWC.** This project is `force-app/`-free; everything lives in `.sql` files organized by purpose.
- **No CI/CD pipeline.** Deploys are manual — execute the relevant `.sql` files in a Snowsight worksheet against `DATA_JEDAIS.FINS__PUBLIC` with `SYSADMIN`.

# Project structure

```
Financial_Transactions_Generation/
├── docs/                                  ← architecture, generation logic
│   ├── architecture.md
│   └── transaction_generation_logic.md
├── schemas/                               ← table DDL
│   ├── financial_transactions.sql         ← FINANCIAL_TRANSACTIONS (16,819 rows, 17 cols)
│   ├── financial_transaction_accounts.sql ← 2 active accounts
│   ├── account_credit_config.sql          ← DD/bonus configuration
│   ├── account_balance_tracker.sql        ← Monthly balance aggregation
│   ├── account_daily_balance.sql          ← Daily balance snapshots
│   └── mcc.sql                            ← 324 merchant category codes
├── procedures/                            ← stored procedure definitions
│   ├── generate_daily_transactions.sql    ← GENERATE_DAILY_TRANSACTIONS(n)
│   └── generate_daily_transactions_debug.sql ← Debug version with verbose output
├── tasks/                                 ← scheduled CRON tasks
│   └── daily_transaction_generator.sql    ← 3:05 AM ET daily
├── views/                                 ← view definitions
│   ├── vw_account_summary.sql             ← Lifetime stats
│   ├── vw_current_month_balances.sql      ← Current month with status flags
│   └── v_ytd_financial_transactions.sql   ← YTD filter
└── README.md
```

# Commands

All Snowflake commands run via Snowsight worksheet against `DATA_JEDAIS.FINS__PUBLIC` as `SYSADMIN`.

```sql
-- Daily / one-shot operations
CALL DATA_JEDAIS.FINS__PUBLIC.GENERATE_DAILY_TRANSACTIONS(10);
CALL DATA_JEDAIS.FINS__PUBLIC.GENERATE_DAILY_TRANSACTIONS_DEBUG(5);

-- Audit / verification
SELECT * FROM DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG
WHERE TASK_NAME = 'DAILY_TRANSACTION_GENERATOR'
ORDER BY EXECUTION_TIME DESC LIMIT 10;

-- Balance checks
SELECT * FROM DATA_JEDAIS.FINS__PUBLIC.VW_ACCOUNT_SUMMARY;
SELECT * FROM DATA_JEDAIS.FINS__PUBLIC.VW_CURRENT_MONTH_BALANCES;

-- Task status
SHOW TASKS LIKE '%TRANSACTION%' IN SCHEMA DATA_JEDAIS.FINS__PUBLIC;
```

To re-deploy a procedure or task after editing the `.sql`, execute the file's CREATE OR REPLACE in Snowsight against `DATA_JEDAIS.FINS__PUBLIC`. There's no automatic sync.

# Conventions

| Convention | Rule |
|---|---|
| Idempotency | SP skips if transactions already exist for today (checks `DATE(TRANSACTIONDATE) = CURRENT_DATE()`) |
| Logging | Every execution logs to `TASK_EXECUTION_LOG` (SUCCEEDED, SKIPPED, or FAILED) |
| Retry | Task uses `SP_RETRY_WRAPPER` with max 2 retries + exponential backoff |
| Balance rebuild | After inserting transactions, the SP truncates and rebuilds `ACCOUNT_DAILY_BALANCE` from all historical data |
| Amount generation | Category-aware ranges (e.g., Fast Food $5-$30, Airlines $150-$1500). Business accounts get multipliers (1.3x-2.5x). |
| Credits | Direct deposits on DD_DAY_1/DD_DAY_2 (default 1st and 15th). Quarterly bonuses on Jan/Apr/Jul/Oct 1st. |
| MCC filtering | Business accounts use a filtered MCC set (excludes entertainment/fast food, prioritizes business services). |
| Column naming | Uses quoted identifiers in views for Salesforce-compatible column names (e.g., `"AccountID"`, `"Amount"`) |

# Key relationships

- `FINANCIAL_TRANSACTION_ACCOUNTS` → driver table for which accounts generate transactions
- `ACCOUNT_CREDIT_CONFIG` → JOIN on ACCOUNTID; provides DD amounts, bonus amounts, schedule
- `MCC` → reference table sampled during generation for merchant codes and categories
- `FINANCIAL_TRANSACTIONS` → output table; all generated transactions land here
- `ACCOUNT_DAILY_BALANCE` → derived table; rebuilt from FINANCIAL_TRANSACTIONS each run
- `ACCOUNT_BALANCE_TRACKER` → monthly rollup; used by VW_ACCOUNT_SUMMARY

# Gotchas

- **Balance rebuild is destructive.** `rebuild_daily_balance()` does `TRUNCATE TABLE ACCOUNT_DAILY_BALANCE` then re-derives from all historical transactions. Safe because it's deterministic, but if the table is very large it could be slow.
- **Only 2 active accounts.** Unlike the trades pipeline (36K+ accounts), this pipeline generates transactions for just 2 manually-configured accounts. Adding accounts requires INSERT into both `FINANCIAL_TRANSACTION_ACCOUNTS` and `ACCOUNT_CREDIT_CONFIG`.
- **No datashare dependency.** Unlike trades/CSAT, this pipeline does NOT read from FINSDC3_DATASHARE. Accounts are manually configured.
- **Debug procedure exists.** `GENERATE_DAILY_TRANSACTIONS_DEBUG` is a verbose version that returns step-by-step messages instead of raising on error. Use it to troubleshoot issues.
- **FINANCIAL_TRANSACTIONS_XL is separate.** The 100M-row `FINANCIAL_TRANSACTIONS_XL` table is a pre-loaded demo dataset, NOT generated by this pipeline. `V_YTD_FINANCIAL_TRANSACTIONS` reads from XL, not the daily-generated table.

# Related projects

- **Financial_Trades_Generation** — Sibling pipeline generating synthetic trades (different data, same infra pattern)
- **Snowflake_CSAT_NPS** — Monthly CSAT/NPS generation (shared `TASK_EXECUTION_LOG` and `SP_RETRY_WRAPPER`)
- **Snowflake/** — Hub documentation with architecture diagrams covering all pipelines
