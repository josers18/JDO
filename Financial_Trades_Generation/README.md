# Financial Trades Generation System

<div align="center">

[![Snowflake](https://img.shields.io/badge/Snowflake-Native-29B5E8?style=for-the-badge&logo=snowflake&logoColor=white)](https://www.snowflake.com/)
[![Python](https://img.shields.io/badge/Python-3.11-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![Snowpark](https://img.shields.io/badge/Snowpark-Stored_Procedures-29B5E8?style=for-the-badge)](https://docs.snowflake.com/en/developer-guide/snowpark/python/index)
[![Data Cloud](https://img.shields.io/badge/Data_Cloud-Account_Sync-7F56D9?style=for-the-badge)](https://developer.salesforce.com/docs/data/data-cloud-query-guide/guide/query-guide-get-started.html)

[![Scheduled Tasks](https://img.shields.io/badge/Tasks-CRON_Scheduled-5865F2?style=for-the-badge)](https://docs.snowflake.com/en/user-guide/tasks-intro)
[![Trades](https://img.shields.io/badge/Trades-10.6M+-04844B?style=for-the-badge)](schemas/financial_trades.sql)
[![Accounts](https://img.shields.io/badge/Accounts-36,239-032D60?style=for-the-badge)](schemas/trade_generation_config.sql)
[![Instruments](https://img.shields.io/badge/Instruments-2%2C004-111111?style=for-the-badge)](schemas/instrument_universe.sql)

[![GitHub](https://img.shields.io/badge/Monorepo-JDO-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/josers18/JDO)

**Snowflake-native** · **Automated pipeline** · **Synthetic trade data**

</div>

A Snowflake-native automated trade generation pipeline that produces realistic synthetic financial trade data for 36,239 active accounts across 2,004 instruments, with configurable frequency, risk profiles, and volume controls.

## Data at a Glance

| Metric | Value |
|---|---|
| Total trades | 10,619,762 (as of 2026-11-04) |
| Active accounts | 36,239 (Salesforce_Home only, since migration 005) |
| Instrument universe | 2,004 tickers |
| Date range | June 2024 -- present |
| Avg trade value | ~$95,000 |

## Architecture

```mermaid
graph LR
    subgraph "Data Sources"
        A["ssot__Account__dlm<br/>(Salesforce Data Cloud)"]
        B["INSTRUMENT_UNIVERSE<br/>(2,004 tickers)"]
    end

    subgraph "Configuration"
        C["TRADE_GENERATION_CONFIG<br/>(36,773 rows, 36,239 active)"]
    end

    subgraph "Scheduled Tasks"
        T1["DAILY_ACCOUNT_SYNC<br/>3:00 AM ET"]
        T2["DAILY_TRADE_GENERATOR<br/>3:10 AM ET"]
    end

    subgraph "Procedures"
        P1["SYNC_NEW_ACCOUNTS()"]
        P2["GENERATE_DAILY_TRADES()"]
        P3["GENERATE_HISTORICAL_TRADES()"]
    end

    subgraph "Output"
        D["FINANCIAL_TRADES<br/>(10.6M+ rows)"]
        E["TASK_EXECUTION_LOG"]
    end

    A -->|"001% IDs"| P1
    T1 --> P1
    P1 -->|"new accounts"| C
    C --> P2
    B --> P2
    T2 --> P2
    P2 --> D
    P3 --> D
    P1 --> E
    P2 --> E
    P3 --> E
```

## Daily Pipeline Schedule

| Time (ET) | Task | Procedure | Purpose |
|---|---|---|---|
| 3:00 AM | `DAILY_ACCOUNT_SYNC` | `SYNC_NEW_ACCOUNTS()` | Check for new org accounts, add to config |
| 3:10 AM | `DAILY_TRADE_GENERATOR` | `GENERATE_DAILY_TRADES()` | Generate trades for all active accounts |

The 10-minute gap ensures newly synced accounts are available before trade generation runs.

## Database Objects

### Tables

| Table | Rows | Purpose |
|---|---|---|
| [`FINANCIAL_TRADES`](schemas/financial_trades.sql) | 10,619,762 | Primary output -- all generated trades (25 columns) |
| [`TRADE_GENERATION_CONFIG`](schemas/trade_generation_config.sql) | 36,773 | Per-account generation settings (frequency, risk, volume) |
| [`INSTRUMENT_UNIVERSE`](schemas/instrument_universe.sql) | 2,004 | Reference table of tradeable instruments |
| [`TASK_EXECUTION_LOG`](schemas/task_execution_log.sql) | 1,500+ | Execution audit trail for all procedures |

### Stored Procedures

| Procedure | Purpose |
|---|---|
| [`GENERATE_DAILY_TRADES()`](procedures/generate_daily_trades.sql) | Generate today's trades for all due accounts |
| [`SYNC_NEW_ACCOUNTS()`](procedures/sync_new_accounts.sql) | Import new org accounts from Salesforce Data Cloud |
| [`GENERATE_HISTORICAL_TRADES(START_DATE, END_DATE)`](procedures/generate_historical_trades.sql) | Backfill trades for a date range |

### Scheduled Tasks

| Task | Schedule | Definition |
|---|---|---|
| [`DAILY_ACCOUNT_SYNC`](tasks/daily_account_sync.sql) | 3:00 AM ET daily | `CALL SYNC_NEW_ACCOUNTS()` |
| [`DAILY_TRADE_GENERATOR`](tasks/daily_trade_generator.sql) | 3:10 AM ET daily | `CALL GENERATE_DAILY_TRADES()` |

## Account Configuration

Accounts are sourced from the Salesforce Data Cloud shared table `FINSDC3_DATASHARE."schema_Jedi_Snowflake"."ssot__Account__dlm"` and mapped by type:

| Source Type | Account Type | Frequency | Trades/Period | Risk Profile | Max Trade Value |
|---|---|---|---|---|---|
| Enterprise | Institutional | DAILY | 12 | Moderate | $500,000 |
| Mid-Market | Institutional | DAILY | 8 | Moderate | $300,000 |
| Small Business | Retail | WEEKLY | 4 | Conservative | $100,000 |
| Client | Retail | DAILY | 6 | Moderate | $200,000 |
| Person | Retail | MONTHLY | 3 | Conservative | $50,000 |
| Partner | Institutional | WEEKLY | 10 | Aggressive | $400,000 |
| Investor | Institutional | DAILY | 15 | Aggressive | $750,000 |
| Consultant | Retail | MONTHLY | 2 | Conservative | $75,000 |
| Other/NULL | Retail | WEEKLY | 5 | Moderate | $150,000 |

The mapping applies when an account is first inserted. `SYNC_NEW_ACCOUNTS()` never updates existing rows, so a Salesforce rename, a type change or a mapping edit doesn't reach accounts already in the table. Those are fixed with a one-off migration (see [Migrations](#migrations)). As of 2026-11-04 every source-matched row agrees with this table. See [Account Sync Pipeline](docs/account_sync.md#existing-rows-are-never-updated).

## Instrument Universe

2,004 instruments across 8 sectors:

| Sector | Count |
|---|---|
| General | 1,358 |
| Financials | 264 |
| Energy | 152 |
| Technology | 75 |
| Healthcare | 53 |
| Consumer | 53 |
| Industrials | 32 |
| Communication | 17 |

## Migrations

One-off data and schema fixes live in [`migrations/`](migrations/). Each one clones the table it changes first; the clone is the rollback.

| Migration | Applied | What it did | Rollback clone |
|---|---|---|---|
| [`001`](migrations/001_restore_timestamp_dates_null_trd_keys.sql) | 2026-10-24 | Trade date columns to `TIMESTAMP_TZ` (reverted by 002); deactivated the 5 `TRD-` placeholder accounts and NULLed their trades' `ACCOUNT_ID` | `FINANCIAL_TRADES_BAK_20261024`, `TRADE_GENERATION_CONFIG_BAK_20261024` |
| [`002`](migrations/002_revert_trade_dates_to_date.sql) | 2026-10-24 | Trade date columns back to `DATE` for the Data Cloud stream's date format | `FINANCIAL_TRADES_BAK_20261024_TZ` |
| [`003`](migrations/003_backfill_config_name_type_from_source.sql) | 2026-11-04 | Backfilled `ACCOUNT_NAME` and `ACCOUNT_TYPE` from the deduped source on 31,053 rows: 25,425 names (mostly a middle initial added in Salesforce), and 5,628 `Partner` rows moved from Retail to Institutional with the Partner trading settings | `TRADE_GENERATION_CONFIG_BAK_20261104` |
| [`004`](migrations/004_backfill_config_profile_from_type_map.sql) | 2026-11-04 | Backfilled the trading settings on 25,379 `Person` rows still on the WEEKLY/5/$150K default: now MONTHLY/3/Conservative/$50K | `TRADE_GENERATION_CONFIG_BAK_20261104_M004` |
| [`005`](migrations/005_deactivate_non_home_org_accounts.sql) | 2026-11-04 | Deactivated the 529 accounts from the four non-`Salesforce_Home` orgs (InsuranceAFDC 167, FinsDC4 146, FinsDC1 127, DCCDO1 89). Their 1,663,666 trades stay in `FINANCIAL_TRADES` | `TRADE_GENERATION_CONFIG_BAK_20261104_M005` |

Migrations 003-005 change trade volume from the next daily run: Partner accounts trade more, Person accounts much less, and the non-Home accounts stop trading. Existing trades aren't rewritten. Run new migrations as `ACCOUNTADMIN` outside the 03:00-03:10 ET task window.

## Quick Start

```sql
-- Generate today's trades
CALL DATA_JEDAIS.FINS__PUBLIC.GENERATE_DAILY_TRADES();

-- Sync new accounts from org
CALL DATA_JEDAIS.FINS__PUBLIC.SYNC_NEW_ACCOUNTS();

-- Backfill historical trades for a date range
CALL DATA_JEDAIS.FINS__PUBLIC.GENERATE_HISTORICAL_TRADES('2024-06-01'::DATE, '2024-12-31'::DATE);

-- Check execution history
SELECT * FROM DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG ORDER BY EXECUTION_TIME DESC LIMIT 10;

-- Verify task schedules
SHOW TASKS IN SCHEMA DATA_JEDAIS.FINS__PUBLIC;
```

## Detailed Documentation

- [Architecture and Data Flow](docs/architecture.md) -- System design, ER diagrams, data flow
- [Trade Generation Logic](docs/trade_generation_logic.md) -- Algorithm deep dive: pricing, risk, frequency gating
- [Account Sync Pipeline](docs/account_sync.md) -- Salesforce Data Cloud integration, type mapping
- [Historical Backfill Guide](docs/historical_backfill.md) -- Backfilling trades, chunking strategy, volume estimates

## Snowflake Environment

| Setting | Value |
|---|---|
| Database | `DATA_JEDAIS` |
| Schema | `FINS__PUBLIC` |
| Task Warehouses | `TASK_WH` (X-Small) for the account sync; `LARGE_LOAD` for the trade generator |
| Backfill Warehouse | `LARGE_LOAD` (X-Large, recommended) |
| Role | `SYSADMIN` |
| Source Database | `FINSDC3_DATASHARE` (shared/secure) |
