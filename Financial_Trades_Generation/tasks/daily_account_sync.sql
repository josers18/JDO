-- =============================================================================
-- Task:      DAILY_ACCOUNT_SYNC
-- Database:  DATA_JEDAIS.FINS__PUBLIC
-- Purpose:   Syncs new accounts from the Salesforce Data Cloud shared table
--            into TRADE_GENERATION_CONFIG. Runs at 3:00 AM ET, ten minutes
--            before DAILY_TRADE_GENERATOR, so newly imported accounts are
--            available when the generator fires.
-- Schedule:  Daily at 3:00 AM America/New_York
-- Warehouse: TASK_WH (X-Small)
-- Calls:     SYNC_NEW_ACCOUNTS() through SP_RETRY_WRAPPER (2 retries)
-- Live DDL:  matches GET_DDL('TASK', 'DATA_JEDAIS.FINS__PUBLIC.DAILY_ACCOUNT_SYNC')
--            as of 2026-11-04. Check it before redeploying.
-- =============================================================================

CREATE OR REPLACE TASK DATA_JEDAIS.FINS__PUBLIC.DAILY_ACCOUNT_SYNC
    WAREHOUSE                       = TASK_WH
    SCHEDULE                        = 'USING CRON 0 3 * * * America/New_York'
    STATEMENT_TIMEOUT_IN_SECONDS    = 300
    SUSPEND_TASK_AFTER_NUM_FAILURES = 0
    TASK_AUTO_RETRY_ATTEMPTS        = 2
    COMMENT                         = 'Sync new accounts from ssot__Account__dlm to TRADE_GENERATION_CONFIG daily'
AS
    CALL DATA_JEDAIS.FINS__PUBLIC.SP_RETRY_WRAPPER('DATA_JEDAIS.FINS__PUBLIC.SYNC_NEW_ACCOUNTS()', 2);

-- Enable the task after creation:
-- ALTER TASK DATA_JEDAIS.FINS__PUBLIC.DAILY_ACCOUNT_SYNC RESUME;
