-- =============================================================================
-- FINS.PUBLIC.TASK_LOAD_MASTER_ACCOUNTS
-- Daily account snapshot from Salesforce Data Cloud
-- =============================================================================
-- Runs every day at 6 AM UTC.
-- Calls SP_LOAD_MASTER_ACCOUNTS() to capture a daily snapshot of all accounts
-- from the FINSDC3_DATASHARE inbound datashare.
-- =============================================================================

CREATE OR REPLACE TASK FINS.PUBLIC.TASK_LOAD_MASTER_ACCOUNTS
    WAREHOUSE = MAIN_WH_XS
    SCHEDULE  = 'USING CRON 0 6 * * * UTC'
AS CALL FINS.PUBLIC.SP_LOAD_MASTER_ACCOUNTS();

-- Enable the task
ALTER TASK FINS.PUBLIC.TASK_LOAD_MASTER_ACCOUNTS RESUME;
