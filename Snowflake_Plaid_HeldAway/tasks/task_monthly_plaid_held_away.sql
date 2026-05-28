-- =============================================================================
-- FINS.PUBLIC.TASK_MONTHLY_PLAID_HELD_AWAY
-- Scheduled task wrapping SP_GENERATE_PLAID_HELD_AWAY via SP_RETRY_WRAPPER.
-- =============================================================================
-- Plan:     docs/superpowers/plans/2026-05-28-cumulus-plan-6-plaid-held-away.md
-- Task:     Plan 6 T6
-- Cadence:  MONTHLY (1st of every month at 07:00 UTC)
-- Schedule: 0 7 1 * * UTC
-- Wrapper:  FINS.PUBLIC.SP_RETRY_WRAPPER('FINS.PUBLIC.SP_GENERATE_PLAID_HELD_AWAY()', 2)
-- Warehouse: MAIN_WH_XS
--
-- Pattern parity:
--   Plans 1-4 are MONTHLY at the same cron (`0 7 1 * * UTC`); Plan 5 introduced
--   the QUARTERLY cadence; Plan 6 returns to monthly. Same warehouse
--   (MAIN_WH_XS), same SP_RETRY_WRAPPER call shape, same retry count (2).
--   Only the cron differs from Plan 5.
-- =============================================================================

CREATE OR REPLACE TASK FINS.PUBLIC.TASK_MONTHLY_PLAID_HELD_AWAY
    WAREHOUSE = MAIN_WH_XS
    SCHEDULE  = 'USING CRON 0 7 1 * * UTC'
AS
    CALL FINS.PUBLIC.SP_RETRY_WRAPPER(
        'FINS.PUBLIC.SP_GENERATE_PLAID_HELD_AWAY()',
        2
    );

ALTER TASK FINS.PUBLIC.TASK_MONTHLY_PLAID_HELD_AWAY RESUME;
