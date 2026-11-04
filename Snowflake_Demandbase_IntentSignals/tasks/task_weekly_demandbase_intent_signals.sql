-- =============================================================================
-- DATA_JEDAIS.FINS__PUBLIC.TASK_WEEKLY_DEMANDBASE_INTENT_SIGNALS
-- Scheduled task wrapping SP_GENERATE_DEMANDBASE_INTENT_SIGNALS via SP_RETRY_WRAPPER.
-- =============================================================================
-- Plan:      docs/superpowers/plans/2026-11-02-cumulus-plan-14-demandbase-intent-signals.md
-- Task:      Plan 14 T6
-- Cadence:   WEEKLY, Monday 03:15 America/New_York
-- Schedule:  15 3 * * 1 America/New_York (plan section 1, amended 2026-11-02).
--            Live Cumulus TASKs share America/New_York 03:xx slots: Gong 03:00
--            (finishes in under a minute), Graph 03:05, WEEKLY_BALANCE_REPORT
--            03:10, MASTER_ACCOUNTS 03:25 daily. 03:15 ET reads the same-week
--            Gong row for the soft-dep competitor bias; a UTC cron would drift
--            against Gong across DST.
-- Wrapper:   SP_RETRY_WRAPPER('DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_DEMANDBASE_INTENT_SIGNALS()', 2)
--            -- the no-arg form = BACKFILL_WEEKS 0 = current week only.
-- Warehouse: MAIN_WH_XS
-- Backfill:  NOT via the task. Run once by hand after deploy:
--              CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_DEMANDBASE_INTENT_SIGNALS(25);
-- No ampersand anywhere in this file (snow sql template-render trap).
-- =============================================================================

CREATE OR REPLACE TASK DATA_JEDAIS.FINS__PUBLIC.TASK_WEEKLY_DEMANDBASE_INTENT_SIGNALS
    WAREHOUSE = MAIN_WH_XS
    SCHEDULE  = 'USING CRON 15 3 * * 1 America/New_York'
AS
    CALL DATA_JEDAIS.FINS__PUBLIC.SP_RETRY_WRAPPER(
        'DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_DEMANDBASE_INTENT_SIGNALS()',
        2
    );

ALTER TASK DATA_JEDAIS.FINS__PUBLIC.TASK_WEEKLY_DEMANDBASE_INTENT_SIGNALS RESUME;
