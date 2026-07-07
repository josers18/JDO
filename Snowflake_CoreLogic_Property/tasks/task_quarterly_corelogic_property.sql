-- =============================================================================
-- DATA_JEDAIS.FINS__PUBLIC.TASK_QUARTERLY_CORELOGIC_PROPERTY
-- Scheduled task wrapping SP_GENERATE_CORELOGIC_PROPERTY via SP_RETRY_WRAPPER.
-- =============================================================================
-- Plan:     docs/superpowers/plans/2026-05-28-cumulus-plan-5-corelogic-property.md
-- Task:     Plan 5 T6
-- Cadence:  QUARTERLY (1st of Jan/Apr/Jul/Oct at 08:00 UTC)
-- Schedule: 0 8 1 1,4,7,10 * UTC
-- Wrapper:  DATA_JEDAIS.FINS__PUBLIC.SP_RETRY_WRAPPER('DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_CORELOGIC_PROPERTY()', 2)
-- Warehouse: MAIN_WH_XS
--
-- Pattern parity:
--   First QUARTERLY-cadence Cumulus dataset. Plans 1-4 are MONTHLY; Plan 5 marks
--   the cadence introduction. Same warehouse (MAIN_WH_XS), same SP_RETRY_WRAPPER
--   call shape, same retry count (2). Only the cron differs.
-- =============================================================================

CREATE OR REPLACE TASK DATA_JEDAIS.FINS__PUBLIC.TASK_QUARTERLY_CORELOGIC_PROPERTY
    WAREHOUSE = MAIN_WH_XS
    SCHEDULE  = 'USING CRON 0 8 1 1,4,7,10 * UTC'
AS
    CALL DATA_JEDAIS.FINS__PUBLIC.SP_RETRY_WRAPPER(
        'DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_CORELOGIC_PROPERTY()',
        2
    );

ALTER TASK DATA_JEDAIS.FINS__PUBLIC.TASK_QUARTERLY_CORELOGIC_PROPERTY RESUME;
