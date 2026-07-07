# Processes

Operational runbook for the Snowflake data pipelines in `DATA_JEDAIS.FINS__PUBLIC`.

> **Cumulus dataset family operations** (13 monthly/weekly/daily SPs covering ~6.4M rows) are documented in their own AGENTS.md files; the per-org rollout runbook lives at [`../../Snowflake_Cumulus_Common/docs/ROLLOUT.md`](../../Snowflake_Cumulus_Common/docs/ROLLOUT.md). Phase A multi-org migration landed 2026-05-29 (commit `c9119d32`).

---

## Daily Pipeline Schedule

All tasks run via Snowflake's built-in CRON scheduler. All schedules use `America/New_York` timezone.

| Task | Schedule (CRON) | Schedule (ET) | Warehouse | Procedure | Purpose |
|------|---------------|---------------|-----------|-----------|---------|
| DAILY_ACCOUNT_SYNC | `0 3 * * *` | 3:00 AM | TASK_WH | SYNC_NEW_ACCOUNTS() | Sync new DC accounts → trade config |
| DAILY_TRANSACTION_GENERATOR | `5 3 * * *` | 3:05 AM | TASK_WH | GENERATE_DAILY_TRANSACTIONS(10) | Generate daily bank transactions |
| DAILY_TRADE_GENERATOR | `10 3 * * *` | 3:10 AM | LARGE_LOAD | GENERATE_DAILY_TRADES() | Generate daily instrument trades |
| TASK_LOAD_MASTER_ACCOUNTS | `25 3 * * *` | 3:25 AM | MAIN_WH_XS | SP_LOAD_MASTER_ACCOUNTS() | Sync accounts → MASTER_ACCOUNTS |
| TASK_MONTHLY_CSAT | `10 3 1 * *` | 3:10 AM (1st only) | MAIN_WH_XS | SP_GENERATE_MONTHLY_CSAT() | Generate monthly CSAT/NPS scores |
| DAILY_JOB_REPORT_TASK | `0 4 * * *` | 4:00 AM | TASK_WH | SP_DAILY_JOB_REPORT() | Email execution summary |

**Execution order rationale:** Account sync runs first (3:00 AM) so new accounts are available for trade generation (3:10 AM). Master accounts sync runs at 3:25 AM to capture any Data Cloud stream updates from the prior day. Monthly CSAT runs on the 1st at 3:10 AM after master accounts would have synced. The daily report runs at 4:00 AM to capture all overnight executions.

### Cumulus dataset tasks

13 additional Cumulus pipelines run on monthly / weekly / daily cadences against `DATA_JEDAIS.FINS__PUBLIC`:

| Task | Schedule (CRON ET) | Procedure | Purpose |
|------|-------------------|-----------|---------|
| TASK_MONTHLY_CLARITAS_DEMOGRAPHICS | `5 3 1 * *` (1st of month) | SP_GENERATE_CLARITAS_DEMOGRAPHICS() | Plan 1 — PRIZM segment demographics |
| TASK_MONTHLY_MSCI_ESG_SCORES | `30 3 1 * *` | SP_GENERATE_MSCI_ESG_SCORES() | Plan 2 — BUSINESS ESG scores |
| TASK_MONTHLY_DNB_BUSINESS_CREDIT | `15 3 1 * *` | SP_GENERATE_DNB_BUSINESS_CREDIT() | Plan 3 — Business credit ratings |
| TASK_MONTHLY_ESRI_GEO_FOOTPRINT | `20 3 1 * *` | SP_GENERATE_ESRI_GEO_FOOTPRINT() | Plan 4 — Geo demographics by ZIP |
| TASK_QUARTERLY_CORELOGIC_PROPERTY | `45 3 1 1,4,7,10 *` | SP_GENERATE_CORELOGIC_PROPERTY() | Plan 5 — Property records (PERSON-only) |
| TASK_MONTHLY_PLAID_HELD_AWAY | `35 3 1 * *` | SP_GENERATE_PLAID_HELD_AWAY() | Plan 6 — Held-away accounts (1:N) |
| TASK_DAILY_WORLD_CHECK_AML | `20 3 * * *` | SP_GENERATE_WORLD_CHECK_AML() | Plan 7 — AML screening snapshots |
| TASK_MONTHLY_MGP_FINANCIAL_PLANS | `25 3 1 * *` | SP_GENERATE_MGP_FINANCIAL_PLANS(num_cycles) | Plan 8 — Financial plans |
| TASK_WEEKLY_SYNTH_RELATIONSHIP_GRAPH | `5 3 * * 1` | SP_GENERATE_SYNTH_RELATIONSHIP_GRAPH() | Plan 9 — Edge-scoped relationship graph |
| TASK_MONTHLY_BOARDEX_EXEC_INTEL | `0 3 1 * *` | SP_GENERATE_BOARDEX_EXEC_INTEL(num_cycles) | Plan 10 — BUSINESS exec intel |
| TASK_MONTHLY_ZOOMINFO_FIRMOGRAPHICS | `40 3 1 * *` | SP_GENERATE_ZOOMINFO_FIRMOGRAPHICS() | Plan 11 — Firmographics |
| TASK_WEEKLY_GONG_CALL_SENTIMENT | `0 3 * * 1` | SP_GENERATE_GONG_CALL_SENTIMENT(num_cycles) | Plan 12 — Call sentiment |
| TASK_DAILY_MOODYS_MARKET_CONTEXT | `15 3 * * *` | SP_GENERATE_MOODYS_MARKET_CONTEXT() | Plan 13 — Market context (90-day daily) |

All Cumulus SPs read audience from `V_ACCOUNT_ANCHORS` (which now exposes `ORG_ID`) and stamp ORG_ID on every emitted row. MERGE clauses use `ON tgt.ORG_ID = src.ORG_ID AND tgt.<existing-PK> = src.<existing-PK>`. UPDATE SET deliberately skips ORG_ID (PK component, immutable).

---

## Task Lifecycle

### States

| State | Meaning | Action |
|-------|---------|--------|
| `started` | Active; will fire on next CRON match | Normal operating state |
| `suspended` | Paused; will NOT fire until resumed | Manual pause or auto-suspend on repeated failure |

### Common Commands

```sql
-- Check task states
SHOW TASKS IN SCHEMA DATA_JEDAIS.FINS__PUBLIC;

-- Suspend a task (e.g., during maintenance)
ALTER TASK DATA_JEDAIS.FINS__PUBLIC.DAILY_TRADE_GENERATOR SUSPEND;

-- Resume a task
ALTER TASK DATA_JEDAIS.FINS__PUBLIC.DAILY_TRADE_GENERATOR RESUME;

-- Check recent task history (7-day window)
SELECT name, state, scheduled_time, completed_time, error_message
FROM TABLE(DATA_JEDAIS.INFORMATION_SCHEMA.TASK_HISTORY(
    RESULT_LIMIT => 50,
    SCHEDULED_TIME_RANGE_START => DATEADD('day', -7, CURRENT_TIMESTAMP())
))
ORDER BY scheduled_time DESC;
```

---

## Monitoring

### Execution Log

The primary monitoring mechanism. All procedures log to `TASK_EXECUTION_LOG`:

```sql
-- Last 24 hours of executions
SELECT TASK_NAME, STATUS, ROWS_INSERTED, DURATION_MS, ERROR_MESSAGE, EXECUTION_TIME
FROM DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG
WHERE EXECUTION_TIME > DATEADD('hour', -24, CURRENT_TIMESTAMP())
ORDER BY EXECUTION_TIME DESC;

-- Failed executions in the last week
SELECT *
FROM DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG
WHERE STATUS IN ('FAILED', 'FAILED_ALL_RETRIES')
  AND EXECUTION_TIME > DATEADD('day', -7, CURRENT_TIMESTAMP())
ORDER BY EXECUTION_TIME DESC;

-- Average duration by task (performance baseline)
SELECT TASK_NAME,
       COUNT(*) AS executions,
       AVG(DURATION_MS) AS avg_ms,
       MAX(DURATION_MS) AS max_ms,
       MIN(DURATION_MS) AS min_ms
FROM DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG
WHERE STATUS = 'SUCCEEDED'
GROUP BY TASK_NAME
ORDER BY avg_ms DESC;
```

### Daily Email Report

`SP_DAILY_JOB_REPORT()` sends an HTML email at 8 AM ET to `jsifontes@salesforce.com` via the `TASK_EMAIL_ALERTS` notification integration. The email includes:

- Color-coded header (green = all clear, red = failures detected, yellow = no data)
- Table of all task executions from the previous day
- Status badges (OK / FAILED / NO RUN)
- Duration, row counts, and error excerpts
- Missing expected tasks flagged as "NO RUN"

### Health Check Queries

```sql
-- Are all tasks running?
SELECT name, state, schedule
FROM TABLE(RESULT_SCAN(LAST_QUERY_ID()))  -- after SHOW TASKS
WHERE state != 'started';

-- Data freshness check
SELECT
    'MASTER_ACCOUNTS' AS table_name, MAX(SNAPSHOT_DATE) AS last_refresh FROM DATA_JEDAIS.FINS__PUBLIC.MASTER_ACCOUNTS
UNION ALL
SELECT 'FINANCIAL_TRADES', MAX(TRADE_DATE) FROM DATA_JEDAIS.FINS__PUBLIC.FINANCIAL_TRADES
UNION ALL
SELECT 'CSAT_NPS_DATA', MAX(SCORE_DATE) FROM DATA_JEDAIS.FINS__PUBLIC.CSAT_NPS_DATA;

-- Source duplicate monitoring (Data Cloud health)
SELECT
    COUNT(*) AS total_rows,
    COUNT(DISTINCT "ssot__Id__c") AS distinct_accounts,
    COUNT(*) - COUNT(DISTINCT "ssot__Id__c") AS duplicate_rows
FROM FINSDC3_DATASHARE."schema_Jedi_Snowflake"."ssot__Account__dlm";
```

---

## Error Handling

### Retry Wrapper Behavior

Every task calls its procedure through `SP_RETRY_WRAPPER(procedure_name, max_retries)`:

1. **Attempt 1** — Execute immediately
2. **On failure** — Wait 30 seconds, then retry
3. **On 2nd failure** — Wait 60 seconds, then retry
4. **On 3rd failure** — Log `FAILED_ALL_RETRIES` to `TASK_EXECUTION_LOG` with error details, then `RAISE` (task shows as FAILED in SHOW TASKS history)

### Common Failure Modes

| Error | Cause | Resolution |
|-------|-------|------------|
| "Duplicate row detected during DML action" | Source view has duplicates + MERGE without dedup | Fixed: ROW_NUMBER() dedup in SP_LOAD_MASTER_ACCOUNTS |
| Warehouse timeout | LARGE_LOAD (XL) not large enough for data growth | Monitor trade count growth; upgrade if avg > 60s |
| "Object does not exist" on datashare | FINSDC3_DATASHARE schema path changed | Run `SHOW SHARES INBOUND` and update procedure reference |
| "Insufficient privileges" | Task-runner role missing grants | Verify SYSADMIN owns the task and `EXECUTE AS OWNER` is set |

### Manual Recovery

If a task fails and doesn't self-recover:

```sql
-- 1. Check what failed
SELECT * FROM DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG
WHERE STATUS = 'FAILED' ORDER BY EXECUTION_TIME DESC LIMIT 5;

-- 2. Run the procedure directly (bypasses retry wrapper for debugging)
CALL DATA_JEDAIS.FINS__PUBLIC.SP_LOAD_MASTER_ACCOUNTS();

-- 3. Or run with retry wrapper
CALL DATA_JEDAIS.FINS__PUBLIC.SP_RETRY_WRAPPER('DATA_JEDAIS.FINS__PUBLIC.SP_LOAD_MASTER_ACCOUNTS()', 2);

-- 4. Verify success
SELECT COUNT(*), MAX(SNAPSHOT_DATE) FROM DATA_JEDAIS.FINS__PUBLIC.MASTER_ACCOUNTS;
```

---

## Manual Execution

All procedures are safe to call manually (idempotent via MERGE):

```sql
-- Account sync (CSAT pipeline)
CALL DATA_JEDAIS.FINS__PUBLIC.SP_LOAD_MASTER_ACCOUNTS();
-- Returns: "Merged 36816 rows on 2026-05-27"

-- Account sync (Trades pipeline)
CALL DATA_JEDAIS.FINS__PUBLIC.SYNC_NEW_ACCOUNTS();
-- Returns: "Synced X new accounts, Y total in config"

-- Trade generation (runs for today)
CALL DATA_JEDAIS.FINS__PUBLIC.GENERATE_DAILY_TRADES();
-- Returns: "Generated X trades for 2026-05-27"

-- CSAT/NPS generation (previous month)
CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_MONTHLY_CSAT();
-- Returns: "Generated X CSAT/NPS scores for 2026-04-01"

-- Historical trade backfill (specific date)
CALL DATA_JEDAIS.FINS__PUBLIC.SP_BACKFILL_TRADES('2026-01-15'::DATE);

-- Send email report for yesterday
CALL DATA_JEDAIS.FINS__PUBLIC.SP_DAILY_JOB_REPORT();
```

---

## Deployment Process

This project uses **manual deployment** — no CI/CD. SQL files are the source of truth; execute them in Snowsight to deploy.

### Steps

1. **Edit** the `.sql` file in the repo (procedures/, schemas/, or tasks/)
2. **Review** the change (especially idempotency and retry behavior)
3. **Deploy** by pasting the `CREATE OR REPLACE` statement into a Snowsight worksheet
4. **Verify** by running the procedure manually and checking `TASK_EXECUTION_LOG`
5. **Commit** the `.sql` change to git

### Deploy Commands

```sql
-- Deploy a procedure (paste full CREATE OR REPLACE from the .sql file)
-- Example: after editing sp_load_master_accounts.sql
CREATE OR REPLACE PROCEDURE DATA_JEDAIS.FINS__PUBLIC.SP_LOAD_MASTER_ACCOUNTS() ...;

-- Deploy a task (paste full CREATE OR REPLACE + ALTER RESUME)
CREATE OR REPLACE TASK DATA_JEDAIS.FINS__PUBLIC.TASK_LOAD_MASTER_ACCOUNTS ...;
ALTER TASK DATA_JEDAIS.FINS__PUBLIC.TASK_LOAD_MASTER_ACCOUNTS RESUME;

-- Deploy a table (WARNING: drops existing data!)
-- Only use for new tables or schema migrations with explicit data handling
CREATE OR REPLACE TABLE DATA_JEDAIS.FINS__PUBLIC.NEW_TABLE (...);
```

### Post-Deploy Checklist

- [ ] Procedure runs without error: `CALL DATA_JEDAIS.FINS__PUBLIC.<procedure>()`
- [ ] Task state is `started`: `SHOW TASKS LIKE '<task_name>' IN SCHEMA DATA_JEDAIS.FINS__PUBLIC`
- [ ] Execution log shows SUCCEEDED
- [ ] No regressions: run the daily job report manually

---

## Account Sync Flow

New Salesforce accounts propagate through the system in this order:

```
Salesforce CRM (Account records)
    ↓  [Data Cloud ingests via configured streams]
Data Cloud (ssot__Account__dlm)
    ↓  [Inbound datashare to Snowflake]
FINSDC3_DATASHARE."schema_Jedi_Snowflake"."ssot__Account__dlm"
    ↓  [DAILY_ACCOUNT_SYNC @ midnight ET]
DATA_JEDAIS.FINS__PUBLIC.TRADE_GENERATION_CONFIG  (with default trade params)
    ↓  [DAILY_TRADE_GENERATOR @ 1 AM ET]
DATA_JEDAIS.FINS__PUBLIC.FINANCIAL_TRADES  (trades for new account appear next day)

    ↓  [TASK_LOAD_MASTER_ACCOUNTS @ 6 AM UTC]
DATA_JEDAIS.FINS__PUBLIC.MASTER_ACCOUNTS  (single row per account)
    ↓  [TASK_MONTHLY_CSAT on 1st of month]
DATA_JEDAIS.FINS__PUBLIC.CSAT_NPS_DATA  (score appears in next month's generation)
```

**Lag:** A new account in Salesforce CRM takes approximately 24-48 hours to appear in trade generation (depending on Data Cloud stream refresh timing + daily CRON). CSAT scores appear in the next monthly generation cycle.
