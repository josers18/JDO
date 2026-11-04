-- =============================================================================
-- Task:      DAILY_TRADE_GENERATOR
-- Database:  DATA_JEDAIS.FINS__PUBLIC
-- Purpose:   Generates synthetic trades for all active accounts that are due
--            based on their configured frequency. Runs at 3:10 AM ET, ten
--            minutes after the account sync task, so any newly imported
--            accounts are included in the generation run.
-- Schedule:  Daily at 3:10 AM America/New_York
-- Warehouse: LARGE_LOAD (36K+ accounts per run outgrew TASK_WH)
-- Calls:     GENERATE_DAILY_TRADES() directly. TASK_AUTO_RETRY_ATTEMPTS is the
--            only retry layer; the statement timeout (3000 s) stays below the
--            task timeout (3600 s), so one attempt can always finish or fail
--            cleanly. Until migration 006 the body went through
--            SP_RETRY_WRAPPER(..., 2) with a 1800 s timeout, whose attempts
--            could not fit in the task run (see migrations/006).
-- Live DDL:  this file is the state AFTER migrations/006_task_timeout_layering.sql.
--            Before 006 is applied the live task still uses the wrapper.
--            Check GET_DDL('TASK', ...) before redeploying.
-- =============================================================================

CREATE OR REPLACE TASK DATA_JEDAIS.FINS__PUBLIC.DAILY_TRADE_GENERATOR
    WAREHOUSE                       = LARGE_LOAD
    SCHEDULE                        = 'USING CRON 10 3 * * * America/New_York'
    STATEMENT_TIMEOUT_IN_SECONDS    = 3000
    USER_TASK_TIMEOUT_MS            = 3600000
    SUSPEND_TASK_AFTER_NUM_FAILURES = 0
    TASK_AUTO_RETRY_ATTEMPTS        = 2
    COMMENT                         = 'Generate synthetic trades for active accounts per TRADE_GENERATION_CONFIG'
AS
    CALL DATA_JEDAIS.FINS__PUBLIC.GENERATE_DAILY_TRADES();

-- Enable the task after creation:
-- ALTER TASK DATA_JEDAIS.FINS__PUBLIC.DAILY_TRADE_GENERATOR RESUME;
