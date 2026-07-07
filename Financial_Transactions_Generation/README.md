# Financial Transactions Generation System

<div align="center">

[![Snowflake](https://img.shields.io/badge/Snowflake-Native-29B5E8?style=for-the-badge&logo=snowflake&logoColor=white)](https://www.snowflake.com/)
[![Python](https://img.shields.io/badge/Python-3.11-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![Snowpark](https://img.shields.io/badge/Snowpark-Stored_Procedures-29B5E8?style=for-the-badge)](https://docs.snowflake.com/en/developer-guide/snowpark/python/index)

[![Scheduled Tasks](https://img.shields.io/badge/Tasks-CRON_Scheduled-5865F2?style=for-the-badge)](https://docs.snowflake.com/en/user-guide/tasks-intro)
[![Transactions](https://img.shields.io/badge/Transactions-16,819-04844B?style=for-the-badge)](schemas/financial_transactions.sql)
[![Accounts](https://img.shields.io/badge/Accounts-2_Active-032D60?style=for-the-badge)](schemas/financial_transaction_accounts.sql)
[![MCC Codes](https://img.shields.io/badge/MCC_Codes-324-111111?style=for-the-badge)](schemas/mcc.sql)

[![GitHub](https://img.shields.io/badge/Monorepo-JDO-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/josers18/JDO)

**Snowflake-native** · **Automated pipeline** · **Synthetic transaction data**

</div>

A Snowflake-native automated transaction generation pipeline that produces realistic synthetic bank transactions (debits and credits) for active accounts, using MCC-based merchant categorization with category-aware amount ranges.

## Data at a Glance

| Metric | Value |
|---|---|
| Total transactions | 16,819 |
| Active accounts | 2 (1 Personal, 1 Business) |
| MCC codes | 324 |
| Credits | Direct deposits (bi-monthly) + quarterly bonuses |
| Debits | MCC-categorized purchases, category-aware amounts |
| Balance tracking | Daily + monthly aggregation |

## Architecture

```mermaid
graph LR
    subgraph "Configuration"
        A["FINANCIAL_TRANSACTION_ACCOUNTS<br/>(2 active accounts)"]
        B["ACCOUNT_CREDIT_CONFIG<br/>(DD + bonus settings)"]
        C["MCC<br/>(324 merchant codes)"]
    end

    subgraph "Scheduled Task"
        T1["DAILY_TRANSACTION_GENERATOR<br/>3:05 AM ET"]
    end

    subgraph "Procedures"
        RW["SP_RETRY_WRAPPER"]
        P1["GENERATE_DAILY_TRANSACTIONS(10)"]
    end

    subgraph "Output Tables"
        D["FINANCIAL_TRANSACTIONS<br/>(16,819 rows)"]
        E["ACCOUNT_DAILY_BALANCE<br/>(2,127 rows)"]
        F["ACCOUNT_BALANCE_TRACKER<br/>(10 rows)"]
        G["TASK_EXECUTION_LOG"]
    end

    subgraph "Views"
        V1["VW_ACCOUNT_SUMMARY"]
        V2["VW_CURRENT_MONTH_BALANCES"]
        V3["V_YTD_FINANCIAL_TRANSACTIONS"]
    end

    T1 --> RW --> P1
    A --> P1
    B --> P1
    C --> P1
    P1 --> D
    P1 --> E
    D --> V1 & V2 & V3
    E --> V2
    F --> V1
    P1 --> G
```

## Daily Pipeline Schedule

| Time (ET) | Task | Procedure | Purpose |
|---|---|---|---|
| 3:05 AM | `DAILY_TRANSACTION_GENERATOR` | `GENERATE_DAILY_TRANSACTIONS(10)` | Generate ~10 transactions per active account |

The task runs through `SP_RETRY_WRAPPER` with 2 retries. It is idempotent — if transactions already exist for today, it skips execution.

## Database Objects

### Tables

| Table | Rows | Purpose |
|---|---|---|
| [`FINANCIAL_TRANSACTIONS`](schemas/financial_transactions.sql) | 16,819 | Primary output — all generated transactions (17 columns) |
| [`FINANCIAL_TRANSACTION_ACCOUNTS`](schemas/financial_transaction_accounts.sql) | 2 | Active accounts for transaction generation |
| [`ACCOUNT_CREDIT_CONFIG`](schemas/account_credit_config.sql) | 2 | Direct deposit amounts, bonus config, DD days |
| [`ACCOUNT_BALANCE_TRACKER`](schemas/account_balance_tracker.sql) | 10 | Monthly balance aggregation per account |
| [`ACCOUNT_DAILY_BALANCE`](schemas/account_daily_balance.sql) | 2,127 | Daily balance snapshots (rebuilt each run) |
| [`MCC`](schemas/mcc.sql) | 324 | Merchant Category Codes reference |

### Views

| View | Purpose |
|---|---|
| [`VW_ACCOUNT_SUMMARY`](views/vw_account_summary.sql) | Lifetime summary stats for all active accounts |
| [`VW_CURRENT_MONTH_BALANCES`](views/vw_current_month_balances.sql) | Current month balance with status flags (GOOD_STANDING, HIGH_UTILIZATION, etc.) |
| [`V_YTD_FINANCIAL_TRANSACTIONS`](views/v_ytd_financial_transactions.sql) | Year-to-date transaction filter |

### Stored Procedures

| Procedure | Purpose |
|---|---|
| [`GENERATE_DAILY_TRANSACTIONS(n)`](procedures/generate_daily_transactions.sql) | Generate n transactions per account for today |
| [`GENERATE_DAILY_TRANSACTIONS_DEBUG(n)`](procedures/generate_daily_transactions_debug.sql) | Verbose debug version with step-by-step output |

### Scheduled Tasks

| Task | Schedule | Definition |
|---|---|---|
| [`DAILY_TRANSACTION_GENERATOR`](tasks/daily_transaction_generator.sql) | 3:05 AM ET daily | `CALL SP_RETRY_WRAPPER('GENERATE_DAILY_TRANSACTIONS(10)', 2)` |
| WEEKLY_BALANCE_REPORT | 3:10 AM ET Mondays | `SELECT * FROM VW_ACCOUNT_SUMMARY` |

## Account Configuration

| Account ID | SF Account ID | Type | Direct Deposit | Bonus | Active |
|---|---|---|---|---|---|
| CC-123456789 | 001am00000qvjsAAAQ | Personal | $9,340.54 | $12,700.00 | Yes |
| BC-4421335 | 001am00000qvjs6AAA | Business | $36,500.00 | $18,000.00 | Yes |

### Credit Schedule

| Event | Trigger | Accounts |
|---|---|---|
| Direct Deposit | Day 15 of each month | All active |
| Quarterly Bonus | Day 1 of Jan, Apr, Jul, Oct | All active |

## Quick Start

```sql
-- Generate today's transactions (10 per account)
CALL DATA_JEDAIS.FINS__PUBLIC.GENERATE_DAILY_TRANSACTIONS(10);

-- Debug version with verbose output
CALL DATA_JEDAIS.FINS__PUBLIC.GENERATE_DAILY_TRANSACTIONS_DEBUG(5);

-- Check execution history
SELECT * FROM DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG
WHERE TASK_NAME = 'DAILY_TRANSACTION_GENERATOR'
ORDER BY EXECUTION_TIME DESC LIMIT 10;

-- Account summary
SELECT * FROM DATA_JEDAIS.FINS__PUBLIC.VW_ACCOUNT_SUMMARY;

-- Current month balances with status
SELECT * FROM DATA_JEDAIS.FINS__PUBLIC.VW_CURRENT_MONTH_BALANCES;

-- YTD transactions
SELECT * FROM DATA_JEDAIS.FINS__PUBLIC.V_YTD_FINANCIAL_TRANSACTIONS LIMIT 100;
```

## Detailed Documentation

- [Architecture and Data Flow](docs/architecture.md) — ER diagrams, data flow, balance rebuild logic
- [Transaction Generation Logic](docs/transaction_generation_logic.md) — MCC selection, amount ranges, credit/debit logic

## Snowflake Environment

| Setting | Value |
|---|---|
| Database | `DATA_JEDAIS` |
| Schema | `FINS__PUBLIC` |
| Task Warehouse | `TASK_WH` (X-Small) |
| Role | `SYSADMIN` |
