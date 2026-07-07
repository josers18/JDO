# AGENTS.md — Snowflake_CSAT_NPS

Context for AI coding agents working on the **Snowflake-native synthetic CSAT/NPS pipeline**. Generates ~28,899 monthly score records for 741 accounts sourced from Salesforce Data Cloud, with a daily account snapshot and a monthly score-generation cadence.

For user-facing install / quick-start / data shape, see [README.md](README.md). This file is the agent-orientation primer.

# Tech stack

- **Snowflake** — `DATA_JEDAIS.FINS__PUBLIC` schema. SQL stored procedures (`procedures/*.sql`), scheduled tasks (`tasks/*.sql`), table DDL (`schemas/*.sql`).
- **SQL only** — unlike the sibling `Financial_Trades_Generation` (which uses Snowpark Python for stochastic generation), this project's score logic is pure SQL with deterministic-pseudo-random hashing (`HASH(ACCOUNT_ID || month)`). No Snowpark dependency.
- **Salesforce Data Cloud** — accounts sourced from the inbound datashare `FINSDC3_DATASHARE."schema_Jedi_Snowflake"."ssot__Account__dlm"`, snapshotted daily into `MASTER_ACCOUNTS`.
- **No Salesforce DX, no Apex, no LWC.** This project is `force-app/`-free; everything lives in `.sql` files organized by purpose.
- **No CI/CD pipeline.** Deploys are manual — execute the relevant `.sql` files in a Snowsight worksheet against the `FINS` database with `SYSADMIN`.

# Project structure

```
Snowflake_CSAT_NPS/
├── docs/                                  ← architecture, generation logic, backfill
│   ├── architecture.md
│   ├── score_generation_logic.md
│   └── historical_backfill.md
├── schemas/                               ← table DDL
│   ├── csat_nps_data.sql                  ← CSAT_NPS_DATA (28,899+ rows, 8 cols)
│   ├── master_accounts.sql                ← one row per account, MERGE-maintained
│   └── task_execution_log.sql             ← execution history for scheduled tasks
├── procedures/                            ← stored procedure definitions
│   ├── sp_generate_monthly_csat.sql       ← SP_GENERATE_MONTHLY_CSAT()
│   ├── sp_load_master_accounts.sql        ← SP_LOAD_MASTER_ACCOUNTS()
│   └── historical_backfill.sql            ← one-time backfill (Jan 2023 – Mar 2026; reference only)
├── tasks/                                 ← scheduled CRON tasks
│   ├── task_load_master_accounts.sql      ← Daily 6 AM UTC
│   └── task_monthly_csat.sql              ← 1st of month, 7 AM UTC
└── README.md
```

# Commands

All Snowflake commands run via Snowsight worksheet against `DATA_JEDAIS.FINS__PUBLIC` as `SYSADMIN`.

```sql
-- Score generation (monthly, idempotent)
CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_MONTHLY_CSAT();

-- Refresh account list from Data Cloud
CALL DATA_JEDAIS.FINS__PUBLIC.SP_LOAD_MASTER_ACCOUNTS();

-- Verification
SELECT * FROM DATA_JEDAIS.FINS__PUBLIC.CSAT_NPS_DATA ORDER BY SCORE_DATE DESC LIMIT 20;
SHOW TASKS IN SCHEMA DATA_JEDAIS.FINS__PUBLIC;
```

To re-deploy a procedure or task after editing the `.sql`, execute the file's CREATE OR REPLACE in Snowsight against `DATA_JEDAIS.FINS__PUBLIC`. There's no migration tool — last-write-wins.

# Architecture

See [README.md § Architecture](README.md#architecture) for the data-flow Mermaid diagram. In short:

1. `TASK_LOAD_MASTER_ACCOUNTS` (daily 6 AM UTC) → `SP_LOAD_MASTER_ACCOUNTS()` MERGEs all accounts from the DC datashare into `MASTER_ACCOUNTS` (one row per account, updated in place). Source duplicates from Data Cloud replication are collapsed via `ROW_NUMBER() OVER (PARTITION BY ssot__Id__c)` before the MERGE.
2. `TASK_MONTHLY_CSAT` (1st of month, 7 AM UTC) → `SP_GENERATE_MONTHLY_CSAT()` reads the active accounts from `MASTER_ACCOUNTS`, computes each account's score for the **previous** month using a 3-month rolling baseline + event-injection model, and writes one row per (account, month) to `CSAT_NPS_DATA`.
3. The 1-hour gap between the daily account sync and the monthly score generation is intentional — newly-synced accounts must be visible to the score generator on day 1.

The historical-backfill script (`procedures/historical_backfill.sql`) is **reference-only**. It was the one-time seed that populated Jan 2023 – Mar 2026 with archetype-based trajectories (Positive / Negative / Neutral / Recovery / Volatile). Don't re-run it without checking — re-running would create duplicate rows since the backfill doesn't gate on existing data.

# Conventions

## SQL style

- Snowflake SQL only.
- Stored procedures are `LANGUAGE SQL` — pure SQL, no Snowpark Python dependency. Deterministic-pseudo-random behavior comes from `HASH(ACCOUNT_ID || month)` rather than Python's `random` module.
- Use `EXECUTE AS OWNER` on procedures that read the inbound datashare (so the schedule-runner doesn't need datashare grants); verify before changing.

## Idempotency

- `SP_LOAD_MASTER_ACCOUNTS()` uses `MERGE INTO` with source deduplication (`ROW_NUMBER() OVER (PARTITION BY ssot__Id__c)`). The target table holds exactly one row per `ACCOUNT_ID`. Re-running is a true no-op — existing accounts get their `SNAPSHOT_DATE` updated, new accounts are inserted, and duplicate source rows never reach the MERGE.
- `SP_GENERATE_MONTHLY_CSAT()` is idempotent per (account, score_date) — uses `MERGE INTO CSAT_NPS_DATA` with `(ACCOUNTID, SCORE_DATE)` as the natural key. Re-running on the same month is a true no-op.
- `historical_backfill.sql` is **NOT idempotent**. It's a reference of how the seed was created; re-running creates duplicates. Don't re-run.

## Logging

Both `SP_LOAD_MASTER_ACCOUNTS()` and `SP_GENERATE_MONTHLY_CSAT()` write execution outcomes (status, row counts, duration, errors) to `DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG`. Query this table for recent failures:

```sql
SELECT * FROM DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG ORDER BY EXECUTION_TIME DESC LIMIT 20;
```

## Score model

The score generation has two concerns that need to stay aligned:

1. **CSAT range 0–100** with three event states (negative 15%, positive 15%, normal drift 70%) keyed on `HASH(ACCOUNT_ID || month)`. Edit thresholds with intention — they affect every account globally on the next monthly run.
2. **NPS derivation from CSAT** via the piecewise linear mapping table in [README.md § Score Generation Model](README.md#score-generation-model). The mapping is the source of truth for the demo's promoter / passives / detractor ratio (~9 / 44 / 47% in the current data).

When changing the model, regenerate a single month first (`MERGE`-style) and inspect the distribution shift before letting the next scheduled run apply it broadly.

# Common mistakes

- **Data Cloud source duplicates.** The inbound datashare `ssot__Account__dlm` can contain multiple rows per `ssot__Id__c` due to multi-source ingestion or DC replication. The MERGE + ROW_NUMBER dedup in `SP_LOAD_MASTER_ACCOUNTS()` handles this automatically. If you ever rewrite the procedure, always deduplicate the source before the MERGE — omitting this causes "Duplicate row detected during DML action" failures.
- **Re-running `historical_backfill.sql`.** It creates duplicate rows in `CSAT_NPS_DATA` — there's no gate. Treat the file as reference-only after the initial seed.
- **Editing the score model without regenerating one month first.** Distribution shifts can happen instantly across all accounts on the next monthly run. Always preview against one month before letting the schedule pick up the change.
- **Dropping the inbound datashare reference (`FINSDC3_DATASHARE.schema_Jedi_Snowflake.ssot__Account__dlm`).** That's the canonical link to the Salesforce demo org's account list. If the datashare is recreated, the schema-name segment may change — verify with `SHOW SHARES INBOUND` before assuming it's stable.
- **Editing `procedures/*.sql` without re-deploying.** The repo file is the source of truth, but Snowflake holds the deployed object. Always `CREATE OR REPLACE` against `DATA_JEDAIS.FINS__PUBLIC` after editing.
- **Treating `MASTER_ACCOUNTS` as the score table.** The score table is `CSAT_NPS_DATA` — `MASTER_ACCOUNTS` is just the daily account-list snapshot the score generator reads from.

# Sibling project

`Financial_Trades_Generation` shares the **identical project shape** (docs/, schemas/, procedures/, tasks/) and uses the **same Snowflake environment** (`DATA_JEDAIS.FINS__PUBLIC`, `SYSADMIN`, `FINSDC3_DATASHARE` inbound). Conventions, idempotency rules, and SQL style transfer 1:1. **Notable differences:**

| Aspect | This project | `Financial_Trades_Generation` |
|---|---|---|
| Language | Pure SQL procedures | SQL + Snowpark Python |
| Cadence | Monthly score generation | Daily trade generation |
| Logging | `TASK_EXECUTION_LOG` table | `TASK_EXECUTION_LOG` table |
| Idempotency | MERGE-based | NOT EXISTS-based |

When adding a new feature here that has obvious analogs there (or vice-versa), sync both projects in the same change.

# Related docs

- @README.md — quick start, score model overview, source breakdown
- @docs/architecture.md — ER diagrams, data flow, sequence diagrams, design decisions
- @docs/score_generation_logic.md — archetype formulas, CSAT-NPS correlation, event probability model
- @docs/historical_backfill.md — backfill methodology, row counts, verification queries
- @../Financial_Trades_Generation/AGENTS.md — sibling Snowflake pipeline; identical shape
