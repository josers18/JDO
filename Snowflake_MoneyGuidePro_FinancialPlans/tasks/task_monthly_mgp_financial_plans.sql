-- =============================================================================
-- DATA_JEDAIS.FINS__PUBLIC.TASK_MONTHLY_MGP_FINANCIAL_PLANS
-- Scheduled task wrapping SP_GENERATE_MGP_FINANCIAL_PLANS via SP_RETRY_WRAPPER.
-- =============================================================================
-- Plan:     docs/superpowers/plans/2026-05-28-cumulus-plan-8-mgp-financial-plans.md
-- Task:     Plan 8 T6
-- Cadence:  MONTHLY (first of month at 07:00 UTC).
-- Schedule: 0 7 1 * * UTC  (5-field cron: minute hour day-of-month month day-of-week)
-- Wrapper:  DATA_JEDAIS.FINS__PUBLIC.SP_RETRY_WRAPPER('DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_MGP_FINANCIAL_PLANS()', 2)
-- Warehouse: MAIN_WH_XS
--
-- Pattern parity:
--   Plan 8 reverts to MONTHLY after Plan 7's daily-cadence first. Cron string
--   `0 7 1 * * UTC` matches Plans 1-3 / Plan 6 PRECISELY — same minute, hour,
--   day-of-month. Plan 5 was QUARTERLY (`0 8 1 1,4,7,10 * UTC`); Plan 7
--   established the daily precedent (`0 6 * * * UTC`) for Plan 13 (Moody's).
--   Same warehouse (MAIN_WH_XS), same SP_RETRY_WRAPPER call shape, same
--   retry count (2). Only the SP target differs from prior monthly tasks.
--
-- Why first of month at 07:00 UTC?
--   Trail of Wealth advisors review their book monthly; the 1st-of-month
--   timing models the cadence Wealth Management teams actually use to
--   refresh financial-plan snapshots. The 07:00 UTC slot gives 7h of buffer
--   after midnight UTC for any in-org schedules that touch the same
--   anchors earlier in the day. (Synthetic data here, but the timing
--   models the real-world cadence for downstream-team education.)
-- =============================================================================

CREATE OR REPLACE TASK DATA_JEDAIS.FINS__PUBLIC.TASK_MONTHLY_MGP_FINANCIAL_PLANS
    WAREHOUSE = MAIN_WH_XS
    SCHEDULE  = 'USING CRON 0 7 1 * * UTC'
AS
    CALL DATA_JEDAIS.FINS__PUBLIC.SP_RETRY_WRAPPER(
        'DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_MGP_FINANCIAL_PLANS()',
        2
    );

ALTER TASK DATA_JEDAIS.FINS__PUBLIC.TASK_MONTHLY_MGP_FINANCIAL_PLANS RESUME;
