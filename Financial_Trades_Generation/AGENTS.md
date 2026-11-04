# AGENTS.md — Financial_Trades_Generation

Context for AI coding agents working on the **Snowflake-native synthetic financial-trades pipeline**. Holds ~6.4M trades (as of 2026-11-04, after migration 007) for 36,239 active accounts across 2,004 instruments, with daily account sync from Salesforce Data Cloud and CRON-scheduled trade generation.

For user-facing install / quick-start / row counts, see [README.md](README.md). This file is the agent-orientation primer.

# Tech stack

- **Snowflake** — `DATA_JEDAIS.FINS__PUBLIC` schema. SQL stored procedures (`procedures/*.sql`), scheduled tasks (`tasks/*.sql`), and table DDL (`schemas/*.sql`).
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
│   ├── financial_trades.sql               ← FINANCIAL_TRADES (6.4M+ rows, 25 cols)
│   ├── trade_generation_config.sql        ← per-account settings (frequency, risk, max value)
│   ├── instrument_universe.sql            ← 2,004 tickers across 8 sectors
│   └── task_execution_log.sql             ← audit trail
├── procedures/                            ← stored procedure definitions
│   ├── generate_daily_trades.sql          ← GENERATE_DAILY_TRADES()
│   ├── sync_new_accounts.sql              ← SYNC_NEW_ACCOUNTS() — DC datashare ingest
│   └── generate_historical_trades.sql     ← GENERATE_HISTORICAL_TRADES(start, end)
├── tasks/                                 ← scheduled CRON tasks
│   ├── daily_account_sync.sql             ← 3:00 AM ET daily
│   └── daily_trade_generator.sql          ← 3:10 AM ET daily
└── README.md
```

# Commands

All Snowflake commands run via Snowsight worksheet against `DATA_JEDAIS.FINS__PUBLIC` as `SYSADMIN`.

```sql
-- Daily / one-shot operations
CALL DATA_JEDAIS.FINS__PUBLIC.GENERATE_DAILY_TRADES();
CALL DATA_JEDAIS.FINS__PUBLIC.SYNC_NEW_ACCOUNTS();
CALL DATA_JEDAIS.FINS__PUBLIC.GENERATE_HISTORICAL_TRADES('2024-06-01'::DATE, '2024-12-31'::DATE);

-- Audit / verification
SELECT * FROM DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG ORDER BY EXECUTION_TIME DESC LIMIT 10;
SHOW TASKS IN SCHEMA DATA_JEDAIS.FINS__PUBLIC;
```

To re-deploy a procedure or task after editing the `.sql`, execute the file's CREATE OR REPLACE in Snowsight against `DATA_JEDAIS.FINS__PUBLIC`. There's no migration tool — last-write-wins.

# Architecture

See [README.md § Architecture](README.md#architecture) for the data-flow Mermaid diagram. In short:

1. `DAILY_ACCOUNT_SYNC` (3:00 AM ET, `TASK_WH`) → `SYNC_NEW_ACCOUNTS()` reads `ssot__Account__dlm` from the inbound datashare, maps account type → trade-generation config row (frequency / risk / volume), and inserts new accounts into `TRADE_GENERATION_CONFIG`.
2. `DAILY_TRADE_GENERATOR` (3:10 AM ET, `LARGE_LOAD`) → `GENERATE_DAILY_TRADES()` iterates active accounts, gates by frequency (DAILY / WEEKLY / MONTHLY), and writes rows to `FINANCIAL_TRADES`.
3. The 10-minute gap between the two tasks is **deliberate**: newly synced accounts must be in the config table before the generator reads it. Live, both tasks still call their procedure through `SP_RETRY_WRAPPER(…, 2)` and also set `TASK_AUTO_RETRY_ATTEMPTS = 2`. Those layers don't nest: the generator's three 1,800 s wrapper attempts can't fit in its 3,600 s task run. [Migration 006](migrations/006_task_timeout_layering.sql) (written 2026-11-04, **not yet applied**) makes both tasks call the procedure directly and raises the generator's statement timeout to 3,000 s. The `tasks/*.sql` files already show that state. The sync took 34 s and the generator 42 s on the 2026-11-04 run, and the sync's 300 s statement timeout keeps a slow run inside the gap.

The historical-backfill procedure (`GENERATE_HISTORICAL_TRADES`) is a separate, manually-invoked path used to seed the system from June 2024 forward. It uses a **larger warehouse** (`LARGE_LOAD`, X-Large) because the backfill volume blows past `TASK_WH`'s X-Small budget. The daily generator now runs on `LARGE_LOAD` too; only the account sync stays on `TASK_WH`.

# Conventions

## SQL style

- Snowflake SQL only. No PostgreSQL or BigQuery dialect features that would silently break (`USING` syntax for joins varies; stick to explicit `ON`).
- Stored procedures are `LANGUAGE SQL` for the simple CRUD ones and `LANGUAGE PYTHON` (Snowpark) for `GENERATE_DAILY_TRADES` and `GENERATE_HISTORICAL_TRADES` where stochastic generation lives.
- Use `EXECUTE AS CALLER` for procedures that need to inherit the running user's privileges, `EXECUTE AS OWNER` for procedures that do privileged datashare reads. Verify before changing.

## Idempotency

- `SYNC_NEW_ACCOUNTS()` is idempotent and insert-only. It reads the share, drops IDs already in `TRADE_GENERATION_CONFIG`, and batch-INSERTs the rest (500 per batch), keyed on the Salesforce `ACCOUNT_ID`. Re-running on the same datashare snapshot is a no-op.
- **The source read dedupes `ssot__Id__c` with a total ordering** (since 2026-11-04): Account DSO first, then newest `ssot__LastModifiedDate__c`, then `HASH(s.*)`. The share carries duplicate copies per ID (e.g. Omega `001am00000qvjs6AAA`: an Account copy and a PartyRelationshipGroup copy). Without the `QUALIFY`, a duplicated new ID would be inserted twice with an arbitrary name/type. The body is a single-quoted string, so quotes inside it are doubled (`''Account''`). Deploy with `--database DATA_JEDAIS --schema FINS__PUBLIC`, because the `CREATE` uses an unqualified name.
- `GENERATE_DAILY_TRADES()` is idempotent **per (account, day) through `LAST_GENERATED_DATE`**, not through any check against `FINANCIAL_TRADES` (there is no `NOT EXISTS` gate). `_is_due` returns False when `LAST_GENERATED_DATE >= today`, and each 500-account `UPDATE` of that column is preceded by a flush of the pending trade batch, so a rerun after a timeout resumes at the first unfinished account. Both rules were added on 2026-11-04. Before then the Monday / 1st-of-month rules ignored `LAST_GENERATED_DATE`, and Monday runs that hit the 1,800 s procedure timeout were rerun by `SP_RETRY_WRAPPER` and the task's retries, each pass re-trading every WEEKLY account. That left about 4.2M extra rows (whole extra trade sets, up to 6 per account) on 12 Mondays from 2026-06-15 to 2026-11-02. [Migration 007](migrations/007_dedupe_monday_retry_trades.sql) deleted them on 2026-11-04 (4,195,785 rows). It splits each (account, day) into runs where `CREATED_AT` jumps by more than 600 s, and keeps the earliest run with the most rows.
- `GENERATE_HISTORICAL_TRADES(start, end)` is idempotent **per (account, day) through `FINANCIAL_TRADES`** (since 2026-11-04). Before the loop it loads every pair already in the table between `start` and `end` and skips them, and it flushes only between accounts, so each COPY holds whole account-days. Re-running a chunk after a timeout fills in only the missing pairs, and re-running a finished chunk writes 0. It doesn't touch `LAST_GENERATED_DATE`. It is **CPU-heavy at scale**, so backfill in chunks (week-by-week or month-by-month).

## Logging

- Every procedure writes one row to `TASK_EXECUTION_LOG` with `EXECUTION_TIME`, `PROCEDURE_NAME`, `ROWS_AFFECTED`, and `STATUS`. The scheduled tasks rely on this for next-run gating and for after-the-fact debugging.
- When adding a new procedure, **always include a `TASK_EXECUTION_LOG` write at the end** (success path) and inside the `EXCEPTION` block (failure path). Without this, scheduled-task failures are silent.

## Account-type mapping

The mapping from Salesforce account type → trade frequency / risk / volume is hard-coded in `SYNC_NEW_ACCOUNTS()` (see [README.md § Account Configuration](README.md#account-configuration) for the full table). When the demo introduces a new account type, **edit `SYNC_NEW_ACCOUNTS()` first** so newly-synced accounts get a sensible default — otherwise they fall through to the `Other/NULL` default (Retail, Weekly, 5 trades, $150K cap).

# Common mistakes

- **Breaking the ordering between tasks.** `DAILY_TRADE_GENERATOR` runs at 3:10 AM ET specifically because `DAILY_ACCOUNT_SYNC` runs at 3:00 AM ET. Don't move the generator ahead of the sync or shrink the gap below the sync's 300 s timeout: newly-synced accounts won't be in `TRADE_GENERATION_CONFIG` when the generator queries it. The `tasks/*.sql` files show the state after migration 006 (direct CALL, no wrapper). Until 006 is applied the live tasks still use `SP_RETRY_WRAPPER`, so diff against `GET_DDL('TASK', …)` before any `CREATE OR REPLACE TASK`. Don't edit `SP_RETRY_WRAPPER` itself: about 35 tasks across `FINS__PUBLIC`, `LIFE_SCIENCES__PUBLIC` and `MEDTECH__PUBLIC` share it.
- **Running historical backfill on `TASK_WH`.** It's an X-Small warehouse sized for the account sync. Backfills should run on `LARGE_LOAD` (X-Large). Failing to switch causes long-running queries that cost more than they should and may hit auto-suspend.
- **Adding a new procedure without `TASK_EXECUTION_LOG` writes.** Silent failures in a scheduled task look like "the task ran, nothing happened" — actually-failed runs are indistinguishable from "no work to do" without the log.
- **Editing `procedures/*.sql` without re-deploying.** The repo file is the source of truth, but Snowflake holds the deployed object. Always `CREATE OR REPLACE` against `DATA_JEDAIS.FINS__PUBLIC` after editing — there's no automatic sync.
- **Hard-coding date ranges in the daily generator.** It reads `CURRENT_DATE()` for the trade date. If you want to generate trades for a specific date, use `GENERATE_HISTORICAL_TRADES` (which takes explicit start/end), not a temporary edit to the daily generator.
- **Dropping the inbound datashare reference (`FINSDC3_DATASHARE.schema_Jedi_Snowflake.ssot__Account__dlm`).** That's the canonical link to the Salesforce demo org's account list. If the datashare is recreated, the schema-name segment may change — verify with `SHOW SHARES INBOUND` before assuming it's stable.
- **Changing `TRADE_DATE` / `SETTLEMENT_DATE` / `SNAPSHOT_DATE` away from `DATE`.** The Data Cloud stream `BT_Financial_Trades` registered all three with format `MM/dd/yyyy HH:mm:ss.SSS zzz`, which can't be changed on the existing stream. As `TIMESTAMP_TZ` the connector unloads them as `'2025-01-01 00:00:00.000'` strings that this format misreads (they land as year 0006–0020). That's why they were converted to `DATE` on 2026-08-21. Migration `001` tried `TIMESTAMP_TZ` again on 2026-10-24, and migration `002` reverted it. The cost of `DATE`: the stream's nightly INCREMENTAL run (watermark `TRADE_DATE`) fails, so new days only land with a manual Full Refresh (DC Setup UI). The real fix is a rebuilt stream with the right format. After any column change to this table, run one Full Refresh.
- **Putting non-Account keys in `TRADE_GENERATION_CONFIG.ACCOUNT_ID`.** Only Salesforce Account Ids (`001…`) join to anything in the cockpits. The old manual `TRD-001…TRD-005` placeholders are deactivated and their trades have a NULL `ACCOUNT_ID`. Both generators also read only `ACCOUNT_ID LIKE '001%'`, so a placeholder added by hand gets no trades.
- **Deploying `procedures/*.sql` without checking the live object first.** In 2026-10 the repo copies had fallen behind (the daily generator lacked 5,000-row batching and `CREATED_AT`) and had every `"` doubled, which doesn't compile as Python. Diff against `GET_DDL('PROCEDURE', …)` before a `CREATE OR REPLACE`, and pass `--database DATA_JEDAIS --schema FINS__PUBLIC` to `snow sql -f` (the procedure names are unqualified).
- **Assuming the sync will repair or overwrite `TRADE_GENERATION_CONFIG` rows.** Only two procedures write to it. Checked 2026-11-04 against the repo, live procedure bodies and 90 days of `ACCOUNT_USAGE.QUERY_HISTORY`:
  - `SYNC_NEW_ACCOUNTS()` **INSERTs** IDs it hasn't seen before and never touches existing rows.
  - `GENERATE_DAILY_TRADES()` **UPDATEs** only `LAST_GENERATED_DATE` and `LAST_UPDATED`, in batches of 500 IDs.

  `GENERATE_HISTORICAL_TRADES` and `SP_BACKFILL_TRADES` only read it. Manual edits to `ACCOUNT_NAME`, `ACCOUNT_TYPE`, `FREQUENCY`, `TRADES_PER_PERIOD`, `PREFERRED_SECTORS`, `PREFERRED_EXCHANGES`, `RISK_PROFILE`, `MAX_TRADE_VALUE`, `ACTIVE` or `NOTES` therefore **persist**. Migration `001` relied on this when it deactivated the `TRD-` rows. The flip side: a renamed account in Salesforce, or a changed account type, is **never** re-synced, and a mapping change in `SYNC_NEW_ACCOUNTS()` reaches new accounts only. Backfill existing rows with a one-off UPDATE, cloning the table first, as migration `001` does. Migration `003` (2026-11-04) did this for names and types: 31,053 rows, most of them names that gained a middle initial in Salesforce, plus 5,628 `Partner` rows moved from Retail to Institutional. Migration `004` then fixed the 25,379 rows whose type already matched but whose frequency and caps didn't. All were `Person` rows on the WEEKLY/5 default, and they now trade MONTHLY/3 with a $50K cap. After both migrations every source-matched row agrees with the type map.

# Sibling project

`Snowflake_CSAT_NPS` shares the **identical project shape** (docs/, schemas/, procedures/, tasks/) and uses the **same Snowflake environment** (`DATA_JEDAIS.FINS__PUBLIC`, `SYSADMIN`, `FINSDC3_DATASHARE` inbound). Conventions, idempotency rules, and logging discipline transfer 1:1. When adding a new feature here that has obvious analogs there, sync both projects in the same change.

# Related docs

- @README.md — quick start, row counts, scheduled-task overview, account-type mapping
- @docs/architecture.md — system design, ER diagrams, data flow
- @docs/trade_generation_logic.md — algorithm deep dive (pricing, risk, frequency gating)
- @docs/account_sync.md — Salesforce Data Cloud integration details
- @docs/historical_backfill.md — backfilling, chunking strategy, volume estimates
- @../Snowflake_CSAT_NPS/AGENTS.md — sibling Snowflake pipeline; identical shape
