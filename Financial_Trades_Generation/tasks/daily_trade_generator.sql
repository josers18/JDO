-- =============================================================================
-- Task:      DAILY_TRADE_GENERATOR
-- Database:  FINS.PUBLIC
-- Purpose:   Generates synthetic trades for all active accounts that are due
--            based on their configured frequency. Runs at 1:00 AM ET -- one
--            hour after the account sync task -- to ensure any newly imported
--            accounts are included in the generation run.
-- Schedule:  Daily at 1:00 AM America/New_York
-- Warehouse: TASK_WH (X-Small)
-- Calls:     GENERATE_DAILY_TRADES()
-- =============================================================================

CREATE OR REPLACE TASK FINS.PUBLIC.DAILY_TRADE_GENERATOR
    WAREHOUSE = TASK_WH
    SCHEDULE  = 'USING CRON 0 1 * * * America/New_York'
    COMMENT   = 'Generate synthetic trades for active accounts per TRADE_GENERATION_CONFIG'
AS
    CALL FINS.PUBLIC.GENERATE_DAILY_TRADES();

-- Enable the task after creation:
-- ALTER TASK FINS.PUBLIC.DAILY_TRADE_GENERATOR RESUME;
