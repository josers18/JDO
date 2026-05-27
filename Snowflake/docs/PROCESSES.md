# Processes

Operational runbook for the Snowflake data pipelines in `FINS.PUBLIC`.

---

## Daily Pipeline Schedule

All tasks run via Snowflake's built-in CRON scheduler. Times shown in both UTC and US Eastern.

| Task | Schedule (UTC) | Schedule (ET) | Warehouse | Procedure | Purpose |
|------|---------------|---------------|-----------|-----------|---------|
| DAILY_ACCOUNT_SYNC | 04:00 (summer) / 05:00 (winter) | midnight | TASK_WH | SYNC_NEW_ACCOUNTS() | Sync new DC accounts → trade config |
| DAILY_TRANSACTION_GENERATOR | 04:00 / 05:00 | midnight | TASK_WH | GENERATE_DAILY_TRANSACTIONS(10) | Generate daily bank transactions |
| DAILY_TRADE_GENERATOR | 05:00 / 06:00 | 1 AM | LARGE_LOAD | GENERATE_DAILY_TRADES() | Generate daily instrument trades |
| TASK_LOAD_MASTER_ACCOUNTS | 06:00 | 2 AM / 1 AM | MAIN_WH_XS | SP_LOAD_MASTER_ACCOUNTS() | Sync accounts → MASTER_ACCOUNTS |
| TASK_MONTHLY_CSAT | 07:00 (1st only) | 3 AM / 2 AM (1st only) | MAIN_WH_XS | SP_GENERATE_MONTHLY_CSAT() | Generate monthly CSAT/NPS scores |
| DAILY_JOB_REPORT_TASK | 12:00 / 13:00 | 8 AM | TASK_WH | SP_DAILY_JOB_REPORT() | Email execution summary |

**Execution order rationale:** Account sync runs first (midnight) so new accounts are available for trade generation (1 AM). Master accounts sync runs at 6 AM UTC to capture any Data Cloud stream updates from the prior day. Monthly CSAT runs 1 hour after master accounts so newly-synced accounts are visible. The daily report runs last (8 AM ET) to capture all overnight executions.

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
SHOW TASKS IN SCHEMA FINS.PUBLIC;

-- Suspend a task (e.g., during maintenance)
ALTER TASK FINS.PUBLIC.DAILY_TRADE_GENERATOR SUSPEND;

-- Resume a task
ALTER TASK FINS.PUBLIC.DAILY_TRADE_GENERATOR RESUME;

-- Check recent task history (7-day window)
SELECT name, state, scheduled_time, completed_time, error_message
FROM TABLE(FINS.INFORMATION_SCHEMA.TASK_HISTORY(
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
FROM FINS.PUBLIC.TASK_EXECUTION_LOG
WHERE EXECUTION_TIME > DATEADD('hour', -24, CURRENT_TIMESTAMP())
ORDER BY EXECUTION_TIME DESC;

-- Failed executions in the last week
SELECT *
FROM FINS.PUBLIC.TASK_EXECUTION_LOG
WHERE STATUS IN ('FAILED', 'FAILED_ALL_RETRIES')
  AND EXECUTION_TIME > DATEADD('day', -7, CURRENT_TIMESTAMP())
ORDER BY EXECUTION_TIME DESC;

-- Average duration by task (performance baseline)
SELECT TASK_NAME,
       COUNT(*) AS executions,
       AVG(DURATION_MS) AS avg_ms,
       MAX(DURATION_MS) AS max_ms,
       MIN(DURATION_MS) AS min_ms
FROM FINS.PUBLIC.TASK_EXECUTION_LOG
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
    'MASTER_ACCOUNTS' AS table_name, MAX(SNAPSHOT_DATE) AS last_refresh FROM FINS.PUBLIC.MASTER_ACCOUNTS
UNION ALL
SELECT 'FINANCIAL_TRADES', MAX(TRADE_DATE) FROM FINS.PUBLIC.FINANCIAL_TRADES
UNION ALL
SELECT 'CSAT_NPS_DATA', MAX(SCORE_DATE) FROM FINS.PUBLIC.CSAT_NPS_DATA;

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
SELECT * FROM FINS.PUBLIC.TASK_EXECUTION_LOG
WHERE STATUS = 'FAILED' ORDER BY EXECUTION_TIME DESC LIMIT 5;

-- 2. Run the procedure directly (bypasses retry wrapper for debugging)
CALL FINS.PUBLIC.SP_LOAD_MASTER_ACCOUNTS();

-- 3. Or run with retry wrapper
CALL FINS.PUBLIC.SP_RETRY_WRAPPER('FINS.PUBLIC.SP_LOAD_MASTER_ACCOUNTS()', 2);

-- 4. Verify success
SELECT COUNT(*), MAX(SNAPSHOT_DATE) FROM FINS.PUBLIC.MASTER_ACCOUNTS;
```

---

## Manual Execution

All procedures are safe to call manually (idempotent via MERGE):

```sql
-- Account sync (CSAT pipeline)
CALL FINS.PUBLIC.SP_LOAD_MASTER_ACCOUNTS();
-- Returns: "Merged 36813 rows on 2026-05-27"

-- Account sync (Trades pipeline)
CALL FINS.PUBLIC.SYNC_NEW_ACCOUNTS();
-- Returns: "Synced X new accounts, Y total in config"

-- Trade generation (runs for today)
CALL FINS.PUBLIC.GENERATE_DAILY_TRADES();
-- Returns: "Generated X trades for 2026-05-27"

-- CSAT/NPS generation (previous month)
CALL FINS.PUBLIC.SP_GENERATE_MONTHLY_CSAT();
-- Returns: "Generated X CSAT/NPS scores for 2026-04-01"

-- Historical trade backfill (specific date)
CALL FINS.PUBLIC.SP_BACKFILL_TRADES('2026-01-15'::DATE);

-- Send email report for yesterday
CALL FINS.PUBLIC.SP_DAILY_JOB_REPORT();
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
CREATE OR REPLACE PROCEDURE FINS.PUBLIC.SP_LOAD_MASTER_ACCOUNTS() ...;

-- Deploy a task (paste full CREATE OR REPLACE + ALTER RESUME)
CREATE OR REPLACE TASK FINS.PUBLIC.TASK_LOAD_MASTER_ACCOUNTS ...;
ALTER TASK FINS.PUBLIC.TASK_LOAD_MASTER_ACCOUNTS RESUME;

-- Deploy a table (WARNING: drops existing data!)
-- Only use for new tables or schema migrations with explicit data handling
CREATE OR REPLACE TABLE FINS.PUBLIC.NEW_TABLE (...);
```

### Post-Deploy Checklist

- [ ] Procedure runs without error: `CALL FINS.PUBLIC.<procedure>()`
- [ ] Task state is `started`: `SHOW TASKS LIKE '<task_name>' IN SCHEMA FINS.PUBLIC`
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
FINS.PUBLIC.TRADE_GENERATION_CONFIG  (with default trade params)
    ↓  [DAILY_TRADE_GENERATOR @ 1 AM ET]
FINS.PUBLIC.FINANCIAL_TRADES  (trades for new account appear next day)

    ↓  [TASK_LOAD_MASTER_ACCOUNTS @ 6 AM UTC]
FINS.PUBLIC.MASTER_ACCOUNTS  (single row per account)
    ↓  [TASK_MONTHLY_CSAT on 1st of month]
FINS.PUBLIC.CSAT_NPS_DATA  (score appears in next month's generation)
```

**Lag:** A new account in Salesforce CRM takes approximately 24-48 hours to appear in trade generation (depending on Data Cloud stream refresh timing + daily CRON). CSAT scores appear in the next monthly generation cycle.
