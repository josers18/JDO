-- =============================================================================
-- DATA_JEDAIS.FINS__PUBLIC.TASK_MONTHLY_PRODUCT_RECOMMENDATION_INPUTS
-- Monthly refresh of the two product-recommendation INPUT tables, via
-- SP_RETRY_WRAPPER around SP_GENERATE_PRODUCT_RECOMMENDATION_INPUTS('INPUTS').
-- =============================================================================
-- Schedule:  04:00 on the 2nd of each month, America/New_York.
-- Warehouse: MAIN_WH_XS
-- Training is NEVER scheduled; it is run manually (MODE 'TRAINING').
--
-- Running this file recreates the task SUSPENDED (Snowflake default for a new
-- task); it is not resumed here. Plan Task 10 resumed the live task on 2026-10-23
-- (first scheduled run 2026-11-02 04:00 ET). After re-running this file, run
--     ALTER TASK DATA_JEDAIS.FINS__PUBLIC.TASK_MONTHLY_PRODUCT_RECOMMENDATION_INPUTS RESUME;
-- =============================================================================

CREATE OR REPLACE TASK DATA_JEDAIS.FINS__PUBLIC.TASK_MONTHLY_PRODUCT_RECOMMENDATION_INPUTS
    WAREHOUSE = MAIN_WH_XS
    SCHEDULE  = 'USING CRON 0 4 2 * * America/New_York'
AS
    CALL DATA_JEDAIS.FINS__PUBLIC.SP_RETRY_WRAPPER(
        'DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_PRODUCT_RECOMMENDATION_INPUTS(''INPUTS'')',
        2
    );
