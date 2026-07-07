-- =============================================================================
-- DATA_JEDAIS.FINS__PUBLIC.TASK_DAILY_WORLD_CHECK_AML
-- Scheduled task wrapping SP_GENERATE_WORLD_CHECK_AML via SP_RETRY_WRAPPER.
-- =============================================================================
-- Plan:     docs/superpowers/plans/2026-05-28-cumulus-plan-7-worldcheck-aml.md
-- Task:     Plan 7 T6
-- Cadence:  DAILY (every day at 06:00 UTC, after LSEG's overnight feed publishes
--           at ~02:00 GMT)
-- Schedule: 0 6 * * * UTC  (5-field cron: minute hour day-of-month month day-of-week)
-- Wrapper:  DATA_JEDAIS.FINS__PUBLIC.SP_RETRY_WRAPPER('DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_WORLD_CHECK_AML()', 2)
-- Warehouse: MAIN_WH_XS
--
-- Pattern parity:
--   FIRST DAILY-cadence Cumulus task. Plans 1-4 / Plan 6 are MONTHLY
--   (`0 7 1 * * UTC`); Plan 5 is QUARTERLY (`0 8 1 1,4,7,10 * UTC`); Plan 7
--   establishes the daily precedent that Plan 13 (Moody's) will reuse.
--   Same warehouse (MAIN_WH_XS), same SP_RETRY_WRAPPER call shape, same
--   retry count (2). Only the cron differs from prior tasks.
--
-- Why 06:00 UTC?
--   LSEG World-Check publishes its overnight feed at ~02:00 GMT. We give
--   four hours of buffer for upstream variance and any ETL backfills
--   before screening Cumulus accounts against the day's freshly-rebuilt
--   reference data. (Synthetic data here, but the timing models the
--   real-world dependency for downstream-team education.)
-- =============================================================================

CREATE OR REPLACE TASK DATA_JEDAIS.FINS__PUBLIC.TASK_DAILY_WORLD_CHECK_AML
    WAREHOUSE = MAIN_WH_XS
    SCHEDULE  = 'USING CRON 0 6 * * * UTC'
AS
    CALL DATA_JEDAIS.FINS__PUBLIC.SP_RETRY_WRAPPER(
        'DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_WORLD_CHECK_AML()',
        2
    );

ALTER TASK DATA_JEDAIS.FINS__PUBLIC.TASK_DAILY_WORLD_CHECK_AML RESUME;
