-- =============================================================================
-- Task:      DAILY_ACCOUNT_SYNC
-- Database:  FINS.PUBLIC
-- Purpose:   Syncs new accounts from the Salesforce Data Cloud shared table
--            into TRADE_GENERATION_CONFIG. Runs at midnight ET so newly
--            imported accounts are available before the trade generator fires.
-- Schedule:  Daily at 12:00 AM America/New_York
-- Warehouse: TASK_WH (X-Small)
-- Calls:     SYNC_NEW_ACCOUNTS()
-- =============================================================================

CREATE OR REPLACE TASK FINS.PUBLIC.DAILY_ACCOUNT_SYNC
    WAREHOUSE = TASK_WH
    SCHEDULE  = 'USING CRON 0 0 * * * America/New_York'
    COMMENT   = 'Sync new accounts from ssot__Account__dlm to TRADE_GENERATION_CONFIG daily'
AS
    CALL FINS.PUBLIC.SYNC_NEW_ACCOUNTS();

-- Enable the task after creation:
-- ALTER TASK FINS.PUBLIC.DAILY_ACCOUNT_SYNC RESUME;
