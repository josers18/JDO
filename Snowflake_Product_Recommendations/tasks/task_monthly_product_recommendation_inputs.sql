-- =============================================================================
-- DATA_JEDAIS.FINS__PUBLIC.TASK_MONTHLY_PRODUCT_RECOMMENDATION_INPUTS
-- Monthly refresh of the two product-recommendation INPUT tables, via
-- SP_RETRY_WRAPPER around SP_GENERATE_PRODUCT_RECOMMENDATION_INPUTS('INPUTS').
-- =============================================================================
-- Schedule:  04:00 on the 2nd of each month, America/New_York.
-- Warehouse: MAIN_WH_XS
-- Training is NEVER scheduled; it is run manually (MODE 'TRAINING').
--
-- This task is created SUSPENDED (Snowflake default for a new task). It is NOT
-- resumed here. Task 10, after the human gate, runs
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
