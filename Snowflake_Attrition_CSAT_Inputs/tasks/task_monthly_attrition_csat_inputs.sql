-- =============================================================================
-- DATA_JEDAIS.FINS__PUBLIC.TASK_MONTHLY_ATTRITION_CSAT_INPUTS
-- Monthly refresh of the three tables ATTRITION_INPUTS, CSAT_ATTRITION_INPUTS and
-- ENROLLMENTS, via SP_RETRY_WRAPPER around SP_GENERATE_ATTRITION_CSAT_INPUTS('INPUTS').
-- =============================================================================
-- Schedule:  05:00 on the 2nd of each month, America/New_York.
-- Warehouse: MAIN_WH_XS
--
-- Running this file recreates the task SUSPENDED (Snowflake default for a new
-- task); it is not resumed here. Resume it after the first verified live run:
--     ALTER TASK DATA_JEDAIS.FINS__PUBLIC.TASK_MONTHLY_ATTRITION_CSAT_INPUTS RESUME;
-- =============================================================================

CREATE OR REPLACE TASK DATA_JEDAIS.FINS__PUBLIC.TASK_MONTHLY_ATTRITION_CSAT_INPUTS
    WAREHOUSE = MAIN_WH_XS
    SCHEDULE  = 'USING CRON 0 5 2 * * America/New_York'
AS
    CALL DATA_JEDAIS.FINS__PUBLIC.SP_RETRY_WRAPPER(
        'DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_ATTRITION_CSAT_INPUTS(''INPUTS'')',
        2
    );
