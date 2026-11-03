-- =============================================================================
-- DATA_JEDAIS.FINS__PUBLIC.TASK_MONTHLY_ZOOMINFO_FIRMOGRAPHICS
-- Scheduled task wrapping SP_GENERATE_ZOOMINFO_FIRMOGRAPHICS via SP_RETRY_WRAPPER.
-- =============================================================================
-- Plan:     docs/superpowers/plans/2026-05-28-cumulus-plan-11-zoominfo-firmographics.md
-- Task:     Plan 11 T6
-- Cadence:  MONTHLY (first of month at 03:40 America/New_York).
-- Schedule: 40 3 1 * * America/New_York  (5-field cron: minute hour day-of-month month day-of-week)
--
-- LIVE SCHEDULE IS THE SOURCE OF TRUTH (aligned 2026-11-02). The live TASK
-- had been re-created on the account-wide ET stagger (monthly tasks at
-- 03:00-03:45 America/New_York, 5 min apart). The Plan 11 draft below said
-- 0 7 1 * * UTC. Plan 16 Harmonic (0 5 1 * * America/New_York) runs 80 min
-- after this task and hard-depends on its current-month rows.
-- Wrapper:  DATA_JEDAIS.FINS__PUBLIC.SP_RETRY_WRAPPER('DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_ZOOMINFO_FIRMOGRAPHICS()', 2)
-- Warehouse: MAIN_WH_XS
--
-- Pattern parity:
--   Plan 11 is the most "boring" Plan structurally in the rollout -- same
--   audience predicate (BUSINESS), same monthly cadence, same 1:1 row shape,
--   same MERGE pattern as Plans 2 (MSCI ESG) and 3 (DnB Business Credit).
--   Cron string `0 7 1 * * UTC` matches Plans 1-3 / Plan 6 / Plan 8 PRECISELY
--   -- same minute, hour, day-of-month. Plan 5 was QUARTERLY
--   (`0 8 1 1,4,7,10 * UTC`); Plan 7 established the daily precedent
--   (`0 6 * * * UTC`) for Plan 13 (Moody's). Same warehouse (MAIN_WH_XS),
--   same SP_RETRY_WRAPPER call shape, same retry count (2). Only the SP
--   target differs from prior monthly tasks.
--
-- Why first of month at 07:00 UTC?
--   ZoomInfo / DiscoverOrg / Crunchbase-style firmographics platforms refresh
--   company-level snapshots on a monthly cadence; the 1st-of-month timing
--   models the cadence B2B sales / marketing teams actually use to refresh
--   account intelligence. The 07:00 UTC slot gives 7h of buffer after
--   midnight UTC for any in-org schedules that touch the same anchors
--   earlier in the day. (Synthetic data here, but the timing models the
--   real-world cadence for downstream-team education.)
-- =============================================================================

CREATE OR REPLACE TASK DATA_JEDAIS.FINS__PUBLIC.TASK_MONTHLY_ZOOMINFO_FIRMOGRAPHICS
    WAREHOUSE = MAIN_WH_XS
    SCHEDULE  = 'USING CRON 40 3 1 * * America/New_York'
AS
    CALL DATA_JEDAIS.FINS__PUBLIC.SP_RETRY_WRAPPER(
        'DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_ZOOMINFO_FIRMOGRAPHICS()',
        2
    );

ALTER TASK DATA_JEDAIS.FINS__PUBLIC.TASK_MONTHLY_ZOOMINFO_FIRMOGRAPHICS RESUME;
