# AGENTS.md — Financial_Trades_Generation

Context for AI coding agents working on the **Snowflake-native synthetic financial-trades pipeline**. Generates ~1.5M trades for 645 accounts across 2,004 instruments, with daily account sync from Salesforce Data Cloud and CRON-scheduled trade generation.

For user-facing install / quick-start / row counts, see [README.md](README.md). This file is the agent-orientation primer.

# Tech stack

- **Snowflake** — `FINS.PUBLIC` schema. SQL stored procedures (`procedures/*.sql`), scheduled tasks (`tasks/*.sql`), and table DDL (`schemas/*.sql`).
- **Snowpark Python** — used inside the procedures for trade-generation logic where pure SQL would be awkward (e.g., per-account stochastic price walks).
- **Salesforce Data Cloud** — accounts are sourced from the inbound datashare `FINSDC3_DATASHARE."schema_Jedi_Snowflake"."ssot__Account__dlm"`, mapped to trade-generation config rows by account type.
- **No Salesforce DX, no Apex, no LWC.** This project is `force-app/`-free; everything lives in `.sql` files organized by purpose.
- **No CI/CD pipeline.** Deploys are manual — execute the relevant `.sql` files in a Snowsight worksheet against the `FINS` database with `SYSADMIN`.

# Project structure

```
Financial_Trades_Generation/
├── docs/                                  ← architecture, generation logic, backfill guide
│   ├── architecture.md
│   ├── trade_generation_logic.md
│   ├── account_sync.md
│   └── historical_backfill.md
├── schemas/                               ← table DDL
│   ├── financial_trades.sql               ← FINANCIAL_TRADES (1.5M+ rows, 25 cols)
│   ├── trade_generation_config.sql        ← per-account settings (frequency, risk, max value)
│   ├── instrument_universe.sql            ← 2,004 tickers across 8 sectors
│   └── task_execution_log.sql             ← audit trail
├── procedures/                            ← stored procedure definitions
│   ├── generate_daily_trades.sql          ← GENERATE_DAILY_TRADES()
│   ├── sync_new_accounts.sql              ← SYNC_NEW_ACCOUNTS() — DC datashare ingest
│   └── generate_historical_trades.sql     ← GENERATE_HISTORICAL_TRADES(start, end)
├── tasks/                                 ← scheduled CRON tasks
│   ├── daily_account_sync.sql             ← Midnight ET daily
│   └── daily_trade_generator.sql          ← 1:00 AM ET daily
└── README.md
```

# Commands

All Snowflake commands run via Snowsight worksheet against `FINS.PUBLIC` as `SYSADMIN`.

```sql
-- Daily / one-shot operations
CALL FINS.PUBLIC.GENERATE_DAILY_TRADES();
CALL FINS.PUBLIC.SYNC_NEW_ACCOUNTS();
CALL FINS.PUBLIC.GENERATE_HISTORICAL_TRADES('2024-06-01'::DATE, '2024-12-31'::DATE);

-- Audit / verification
SELECT * FROM FINS.PUBLIC.TASK_EXECUTION_LOG ORDER BY EXECUTION_TIME DESC LIMIT 10;
SHOW TASKS IN SCHEMA FINS.PUBLIC;
```

To re-deploy a procedure or task after editing the `.sql`, execute the file's CREATE OR REPLACE in Snowsight against `FINS.PUBLIC`. There's no migration tool — last-write-wins.

# Architecture

See [README.md § Architecture](README.md#architecture) for the data-flow Mermaid diagram. In short:

1. `DAILY_ACCOUNT_SYNC` (midnight ET) → `SYNC_NEW_ACCOUNTS()` reads `ssot__Account__dlm` from the inbound datashare, maps account type → trade-generation config row (frequency / risk / volume), and inserts new accounts into `TRADE_GENERATION_CONFIG`.
2. `DAILY_TRADE_GENERATOR` (1:00 AM ET) → `GENERATE_DAILY_TRADES()` iterates active accounts, gates by frequency (DAILY / WEEKLY / MONTHLY), and writes rows to `FINANCIAL_TRADES`.
3. The 1-hour gap between the two tasks is **deliberate** — it ensures newly synced accounts are visible to the trade generator before it runs.

The historical-backfill procedure (`GENERATE_HISTORICAL_TRADES`) is a separate, manually-invoked path used to seed the system from June 2024 forward. It uses a **larger warehouse** (`LARGE_LOAD`, X-Large) because the backfill volume blows past `TASK_WH`'s X-Small budget.

# Conventions

## SQL style

- Snowflake SQL only. No PostgreSQL or BigQuery dialect features that would silently break (`USING` syntax for joins varies; stick to explicit `ON`).
- Stored procedures are `LANGUAGE SQL` for the simple CRUD ones and `LANGUAGE PYTHON` (Snowpark) for `GENERATE_DAILY_TRADES` and `GENERATE_HISTORICAL_TRADES` where stochastic generation lives.
- Use `EXECUTE AS CALLER` for procedures that need to inherit the running user's privileges, `EXECUTE AS OWNER` for procedures that do privileged datashare reads. Verify before changing.

## Idempotency

- `SYNC_NEW_ACCOUNTS()` is idempotent — uses `MERGE INTO TRADE_GENERATION_CONFIG` with the Salesforce `ACCOUNT_ID` as the natural key. Re-running on the same datashare snapshot is a no-op.
- `GENERATE_DAILY_TRADES()` is idempotent **per (account, date)** — uses a `WHERE NOT EXISTS` gate against `FINANCIAL_TRADES` for the current trade date. Re-running mid-day after a partial failure resumes cleanly.
- `GENERATE_HISTORICAL_TRADES(start, end)` is idempotent the same way — but is **CPU-heavy at scale**. Backfill in chunks (week-by-week or month-by-month) to keep individual procedure runs under the warehouse's auto-suspend timeout.

## Logging

- Every procedure writes one row to `TASK_EXECUTION_LOG` with `EXECUTION_TIME`, `PROCEDURE_NAME`, `ROWS_AFFECTED`, and `STATUS`. The scheduled tasks rely on this for next-run gating and for after-the-fact debugging.
- When adding a new procedure, **always include a `TASK_EXECUTION_LOG` write at the end** (success path) and inside the `EXCEPTION` block (failure path). Without this, scheduled-task failures are silent.

## Account-type mapping

The mapping from Salesforce account type → trade frequency / risk / volume is hard-coded in `SYNC_NEW_ACCOUNTS()` (see [README.md § Account Configuration](README.md#account-configuration) for the full table). When the demo introduces a new account type, **edit `SYNC_NEW_ACCOUNTS()` first** so newly-synced accounts get a sensible default — otherwise they fall through to the `Other/NULL` default (Retail, Weekly, 5 trades, $150K cap).

# Common mistakes

- **Forgetting the 1-hour gap between tasks.** The `DAILY_TRADE_GENERATOR` runs at 1:00 AM ET specifically because `DAILY_ACCOUNT_SYNC` runs at midnight ET. Don't compress the schedule — newly-synced accounts won't be in `TRADE_GENERATION_CONFIG` when the generator queries it.
- **Running historical backfill on `TASK_WH`.** It's an X-Small warehouse sized for daily generation. Backfills should run on `LARGE_LOAD` (X-Large). Failing to switch causes long-running queries that cost more than they should and may hit auto-suspend.
- **Adding a new procedure without `TASK_EXECUTION_LOG` writes.** Silent failures in a scheduled task look like "the task ran, nothing happened" — actually-failed runs are indistinguishable from "no work to do" without the log.
- **Editing `procedures/*.sql` without re-deploying.** The repo file is the source of truth, but Snowflake holds the deployed object. Always `CREATE OR REPLACE` against `FINS.PUBLIC` after editing — there's no automatic sync.
- **Hard-coding date ranges in the daily generator.** It reads `CURRENT_DATE()` for the trade date. If you want to generate trades for a specific date, use `GENERATE_HISTORICAL_TRADES` (which takes explicit start/end), not a temporary edit to the daily generator.
- **Dropping the inbound datashare reference (`FINSDC3_DATASHARE.schema_Jedi_Snowflake.ssot__Account__dlm`).** That's the canonical link to the Salesforce demo org's account list. If the datashare is recreated, the schema-name segment may change — verify with `SHOW SHARES INBOUND` before assuming it's stable.
- **Treating `TRADE_GENERATION_CONFIG` as configuration that humans edit.** It's machine-managed by `SYNC_NEW_ACCOUNTS()`. Manual edits get overwritten on the next daily sync. To override per-account behavior, add a column with `IS_OVERRIDE` semantics rather than mutating the auto-managed columns.

# Sibling project

`Snowflake_CSAT_NPS` shares the **identical project shape** (docs/, schemas/, procedures/, tasks/) and uses the **same Snowflake environment** (`FINS.PUBLIC`, `SYSADMIN`, `FINSDC3_DATASHARE` inbound). Conventions, idempotency rules, and logging discipline transfer 1:1. When adding a new feature here that has obvious analogs there, sync both projects in the same change.

# Related docs

- @README.md — quick start, row counts, scheduled-task overview, account-type mapping
- @docs/architecture.md — system design, ER diagrams, data flow
- @docs/trade_generation_logic.md — algorithm deep dive (pricing, risk, frequency gating)
- @docs/account_sync.md — Salesforce Data Cloud integration details
- @docs/historical_backfill.md — backfilling, chunking strategy, volume estimates
- @../Snowflake_CSAT_NPS/AGENTS.md — sibling Snowflake pipeline; identical shape
