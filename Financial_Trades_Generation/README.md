# Financial Trades Generation System

<div align="center">

[![Snowflake](https://img.shields.io/badge/Snowflake-Native-29B5E8?style=for-the-badge&logo=snowflake&logoColor=white)](https://www.snowflake.com/)
[![Python](https://img.shields.io/badge/Python-3.11-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![Snowpark](https://img.shields.io/badge/Snowpark-Stored_Procedures-29B5E8?style=for-the-badge)](https://docs.snowflake.com/en/developer-guide/snowpark/python/index)
[![Data Cloud](https://img.shields.io/badge/Data_Cloud-Account_Sync-7F56D9?style=for-the-badge)](https://developer.salesforce.com/docs/data/data-cloud-query-guide/guide/query-guide-get-started.html)

[![Scheduled Tasks](https://img.shields.io/badge/Tasks-CRON_Scheduled-5865F2?style=for-the-badge)](https://docs.snowflake.com/en/user-guide/tasks-intro)
[![Trades](https://img.shields.io/badge/Trades-6.4M+-04844B?style=for-the-badge)](schemas/financial_trades.sql)
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
        D["FINANCIAL_TRADES<br/>(6.4M+ rows)"]
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
| [`006`](migrations/006_task_timeout_layering.sql) | 2026-11-04 | Makes `DAILY_TRADE_GENERATOR` and `DAILY_ACCOUNT_SYNC` call their procedure directly (no `SP_RETRY_WRAPPER`), with a 3,000 s statement timeout on the generator, so the retry layers fit inside the task timeout | none (task DDL; the old definitions are in the file header) |
| [`007`](migrations/007_dedupe_monday_retry_trades.sql) | 2026-11-04 | Deleted 4,195,785 duplicate trades that retried Monday runs wrote on 12 Mondays, 2026-06-15 to 2026-11-02. Per (account, day) it keeps the earliest complete run. `FINANCIAL_TRADES` went from 10,619,762 to 6,423,977 rows | `FINANCIAL_TRADES_BAK_20261104_M007` (dropped 2026-11-04) |
| [`008`](migrations/008_backfill_0928_shortfall.sql) | 2026-11-09 | Backfilled Monday 2026-09-28, which two manual dedupe DELETEs on 2026-09-30 cut to 1 trade per account. Tops every 09-28 account up to `TRADES_PER_PERIOD` and gives the 501 WEEKLY accounts with no trade on 09-28 or 09-29 their full set: 133,242 new trades (09-28 goes from 32,317 to 165,559), all with `CREATED_AT = 2026-09-28 12:00:00` | `DELETE … WHERE TRADE_DATE = '2026-09-28' AND CREATED_AT = '2026-09-28 12:00:00'` |
| [`009`](migrations/009_delete_trd_placeholder_trades.sql) | 2026-11-09 | Deleted the 35,116 NULL-`ACCOUNT_ID` trades of the five old `TRD-` placeholders (see Known data gaps). `FINANCIAL_TRADES` went from 6,642,761 to 6,607,645 rows. The inactive `TRD-` config rows stay | `FINANCIAL_TRADES_TRD_BAK_20261109` (only the deleted rows): `INSERT INTO FINANCIAL_TRADES SELECT * FROM …` |
| [`010`](migrations/010_backfill_1012_weekly_tail.sql) | 2026-11-09 | Backfilled the week of Monday 2026-10-12 for the 501 WEEKLY accounts with no trade in 10-12 to 10-18 (the timeout's stranded tail): 2,505 trades on 10-12, now 180,552 rows (after 009 removed its 98 TRD rows), all with `CREATED_AT = 2026-10-12 12:00:00` | `DELETE … WHERE TRADE_DATE = '2026-10-12' AND CREATED_AT = '2026-10-12 12:00:00'` |
| [`011`](migrations/011_backfill_0629_0701_daily.sql) | 2026-11-09 | Backfilled the 315 DAILY accounts for 2026-06-29 and 2026-07-01, the two days with no generator run: 3,055 trades per day (6,110 total), `CREATED_AT` = that day at 12:00:00 | `DELETE …` on each day's marker (in the file header) |

Migrations 003-005 change trade volume from the next daily run: Partner accounts trade more, Person accounts much less, and the non-Home accounts stop trading. Existing trades aren't rewritten. The `BT_Financial_Trades` stream is zero copy (`DIRECT_ACCESS`), so Data Cloud reads `FINANCIAL_TRADES` live and changes such as 007's delete show up without a refresh. Run new migrations as `ACCOUNTADMIN` outside the 03:00-03:10 ET task window.

### Known data gaps (checked 2026-11-09; 009-011 applied the same day)

- **35,116 NULL-`ACCOUNT_ID` trades (deleted by 009)** (trade dates 2024-06-03 to 2026-10-23). These are the trades of the five `TRD-` placeholder configs created by hand on 2026-04-16: TRD-001 DAILY/15, TRD-002 WEEKLY/8, TRD-003 MONTHLY/3, TRD-004 DAILY/25, TRD-005 DAILY/10. Migration 001 NULLed their `ACCOUNT_ID` on 2026-10-23, and nothing has written a NULL row since. A normal day has 50 (+8 on Mondays, +3 on monthly run days). Because 007 was scoped to `'001%'`, they still carry retry duplicates on 10 Mondays: 66 on 06-15, 07-06, 07-13, 08-17 and 09-14; 74 on 09-07, 09-21 and 10-05; 90 on 10-19; 98 on 10-12. On 09-28 only 4 are left. The map from row to TRD id is gone because `FINANCIAL_TRADES_BAK_20261024` was dropped. **No reader uses them:**
  - every cockpit query on `BT_Financial_Trades__dlm` filters `account_id__c`;
  - the `Accounts_with_recent_trade_activity` segment targets Account, which a NULL key can't join;
  - none of the 106 calculated insights reference trades;
  - no Snowflake view depends on `FINANCIAL_TRADES`.

  They only show up in unfiltered totals: Data Cloud sees 6,642,761 rows, 35,116 of them NULL. Migration 009 deleted them on 2026-11-09; the rows are kept in `FINANCIAL_TRADES_TRD_BAK_20261109`.
- **No trades at all on 2026-06-29 (Mon) and 2026-07-01 (Wed) (backfilled by 011).** `TASK_HISTORY` has no `DAILY_TRADE_GENERATOR` run for either day: the task moved from 22:00 to 00:10 PT around then. The 06-29 weekly sets landed on 06-30, because the run on that day was the first one where they were due. `GENERATE_DAILY_TRADES` was also redeployed twice on 06-29. The 315 DAILY accounts have no trades for those two days (3,055 per day); migration 011 backfilled them on 2026-11-09. Apart from these two days, every date since 2024-06-03 has trades; the history skips weekends by design until 2026-04-16.
- **2026-10-12 was short by 501 WEEKLY accounts (backfilled by 010)** (35,313 accounts against 36,707 on the Mondays around it). All three runs hit the 3,600 s timeout. 893 of the 1,394 missing accounts caught up on 10-13. The other 501, all created 2026-05-26 with `TRADES_PER_PERIOD` 5, have no trades for that week, the same stranded tail as 09-28. They are a different set from 008's 501. All of them traded again on 10-19. Migration 010 backfilled them on 2026-11-09.
- **Marked generated, but no trades:** only `001am00002AYPmwAAH` (`LAST_GENERATED_DATE` 2026-11-02, now MONTHLY). Every other active `'001%'` config has trades on its `LAST_GENERATED_DATE`. The 2026-11-09 run is complete: all 10,745 active WEEKLY accounts traded, plus 77 DAILY, which is 82,598 rows as expected.

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
