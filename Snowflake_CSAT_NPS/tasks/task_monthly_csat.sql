-- =============================================================================
-- FINS.PUBLIC.TASK_MONTHLY_CSAT
-- Automated monthly CSAT/NPS score generation
-- =============================================================================
-- Runs on the 1st of every month at 7 AM UTC.
-- Calls SP_GENERATE_MONTHLY_CSAT() to produce scores for the previous month.
-- Depends on MASTER_ACCOUNTS being current (TASK_LOAD_MASTER_ACCOUNTS runs daily).
-- =============================================================================

CREATE OR REPLACE TASK FINS.PUBLIC.TASK_MONTHLY_CSAT
    WAREHOUSE = MAIN_WH_XS
    SCHEDULE  = 'USING CRON 0 7 1 * * UTC'
AS CALL FINS.PUBLIC.SP_GENERATE_MONTHLY_CSAT();

-- Enable the task
ALTER TASK FINS.PUBLIC.TASK_MONTHLY_CSAT RESUME;
