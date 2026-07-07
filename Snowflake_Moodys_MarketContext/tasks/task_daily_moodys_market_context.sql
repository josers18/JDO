-- =============================================================================
-- DATA_JEDAIS.FINS__PUBLIC.TASK_DAILY_MOODYS_MARKET_CONTEXT
-- Scheduled task wrapping SP_GENERATE_MOODYS_MARKET_CONTEXT via SP_RETRY_WRAPPER.
-- =============================================================================
-- Plan:     docs/superpowers/plans/2026-05-28-cumulus-plan-13-moodys-market-context.md
-- Task:     Plan 13 T6  (FINAL Cumulus plan in the rollout — 13 of 13)
-- Cadence:  DAILY (every day at 01:00 UTC, pre-Asia-open). Synthetic data, but
--           the timing models the real-world Moody's publishing schedule.
-- Schedule: 0 1 * * * UTC  (5-field cron: minute hour day-of-month month day-of-week)
-- Wrapper:  DATA_JEDAIS.FINS__PUBLIC.SP_RETRY_WRAPPER('DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_MOODYS_MARKET_CONTEXT()', 2)
-- Warehouse: MAIN_WH_XS
--
-- Pattern parity:
--   SECOND DAILY-cadence Cumulus task — Plan 7 / WorldCheck established the
--   daily precedent at 06:00 UTC; Plan 13 / Moody's adopts it at 01:00 UTC.
--   Plans 1-4 / Plan 6 / Plan 8 are MONTHLY (`0 7 1 * * UTC`); Plan 5 is
--   QUARTERLY (`0 8 1 1,4,7,10 * UTC`). Same warehouse (MAIN_WH_XS), same
--   SP_RETRY_WRAPPER call shape, same retry count (2). Only the cron differs
--   from prior tasks.
--
-- Plan 7 + Plan 13 are the two daily-cadence Cumulus plans. They do NOT
-- contend for the shared MAIN_WH_XS warehouse because their cron times are
-- five hours apart: Plan 7 runs at 06:00 UTC (after the LSEG overnight feed
-- publishes at ~02:00 GMT, with a 4-hour buffer for ETL backfills), Plan 13
-- runs at 01:00 UTC (pre-Asia-open). The XS warehouse spins up briefly,
-- runs the ~2,004-row MERGE, and suspends well before the Plan 7 window
-- opens.
--
-- Why 01:00 UTC?
--   Moody's Investors Service publishes its market-context bulletin pre-open
--   in Tokyo. Tokyo cash equities open at 00:00 UTC (09:00 JST); 01:00 UTC
--   gives a 30-minute buffer after the (synthetic) data publication AND
--   keeps Plan 13 clear of Plan 7's 06:00 UTC window on the shared warehouse.
--   (Synthetic data here, but the timing models the real-world dependency
--   shape for downstream-team education — Asian market participants want
--   the day's credit-rating + market-context refresh available before
--   their open, the same way Plan 7's LSEG feed is timed for the European
--   open.)
-- =============================================================================

CREATE OR REPLACE TASK DATA_JEDAIS.FINS__PUBLIC.TASK_DAILY_MOODYS_MARKET_CONTEXT
    WAREHOUSE = MAIN_WH_XS
    SCHEDULE  = 'USING CRON 0 1 * * * UTC'
AS
    CALL DATA_JEDAIS.FINS__PUBLIC.SP_RETRY_WRAPPER(
        'DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_MOODYS_MARKET_CONTEXT()',
        2
    );

ALTER TASK DATA_JEDAIS.FINS__PUBLIC.TASK_DAILY_MOODYS_MARKET_CONTEXT RESUME;
