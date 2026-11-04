-- =============================================================================
-- Task:      DAILY_TRADE_GENERATOR
-- Database:  DATA_JEDAIS.FINS__PUBLIC
-- Purpose:   Generates synthetic trades for all active accounts that are due
--            based on their configured frequency. Runs at 3:10 AM ET, ten
--            minutes after the account sync task, so any newly imported
--            accounts are included in the generation run.
-- Schedule:  Daily at 3:10 AM America/New_York
-- Warehouse: LARGE_LOAD (36K+ accounts per run outgrew TASK_WH)
-- Calls:     GENERATE_DAILY_TRADES() through SP_RETRY_WRAPPER (2 retries)
-- Live DDL:  matches GET_DDL('TASK', 'DATA_JEDAIS.FINS__PUBLIC.DAILY_TRADE_GENERATOR')
--            as of 2026-11-04. Check it before redeploying.
-- =============================================================================

CREATE OR REPLACE TASK DATA_JEDAIS.FINS__PUBLIC.DAILY_TRADE_GENERATOR
    WAREHOUSE                       = LARGE_LOAD
    SCHEDULE                        = 'USING CRON 10 3 * * * America/New_York'
    STATEMENT_TIMEOUT_IN_SECONDS    = 1800
    SUSPEND_TASK_AFTER_NUM_FAILURES = 0
    TASK_AUTO_RETRY_ATTEMPTS        = 2
    COMMENT                         = 'Generate synthetic trades for active accounts per TRADE_GENERATION_CONFIG'
AS
    CALL DATA_JEDAIS.FINS__PUBLIC.SP_RETRY_WRAPPER('DATA_JEDAIS.FINS__PUBLIC.GENERATE_DAILY_TRADES()', 2);

-- Enable the task after creation:
-- ALTER TASK DATA_JEDAIS.FINS__PUBLIC.DAILY_TRADE_GENERATOR RESUME;
