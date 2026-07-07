-- =============================================================================
-- DATA_JEDAIS.FINS__PUBLIC.TASK_WEEKLY_GONG_CALL_SENTIMENT
-- Scheduled task wrapping SP_GENERATE_GONG_CALL_SENTIMENT via SP_RETRY_WRAPPER.
-- =============================================================================
-- Plan:     docs/superpowers/plans/2026-05-28-cumulus-plan-12-gong-call-sentiment.md
-- Task:     Plan 12 T6
-- Cadence:  WEEKLY (every Monday at 05:00 UTC)
-- Schedule: 0 5 * * 1 UTC
-- Wrapper:  DATA_JEDAIS.FINS__PUBLIC.SP_RETRY_WRAPPER('DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_GONG_CALL_SENTIMENT()', 2)
-- Warehouse: MAIN_WH_XS
--
-- Pattern parity:
--   Plan 12 is the second weekly Cumulus plan in the rollout (Plan 6 Plaid
--   Held-Away was monthly; the in-flight Plan 9 Synth Relationship Graph is
--   being drafted against this same Monday-05:00-UTC weekly cron). Same
--   warehouse (MAIN_WH_XS), same SP_RETRY_WRAPPER call shape, same retry
--   count (2). Cron differs from the monthly plans (1-4, 6, 8) which use
--   `0 7 1 * * UTC` and from Plan 5's quarterly cadence.
-- =============================================================================

CREATE OR REPLACE TASK DATA_JEDAIS.FINS__PUBLIC.TASK_WEEKLY_GONG_CALL_SENTIMENT
    WAREHOUSE = MAIN_WH_XS
    SCHEDULE  = 'USING CRON 0 5 * * 1 UTC'
AS
    CALL DATA_JEDAIS.FINS__PUBLIC.SP_RETRY_WRAPPER(
        'DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_GONG_CALL_SENTIMENT()',
        2
    );

ALTER TASK DATA_JEDAIS.FINS__PUBLIC.TASK_WEEKLY_GONG_CALL_SENTIMENT RESUME;
