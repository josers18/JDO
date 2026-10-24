-- =============================================================================
-- DATA_JEDAIS.FINS__PUBLIC.TASK_MONTHLY_PLAID_HELD_AWAY
-- Scheduled task wrapping SP_GENERATE_PLAID_HELD_AWAY via SP_RETRY_WRAPPER.
-- =============================================================================
-- Plan:     docs/superpowers/plans/2026-05-28-cumulus-plan-6-plaid-held-away.md
-- Task:     Plan 6 T6
-- Cadence:  MONTHLY (1st of every month at 03:35 ET)
-- Schedule: 35 3 1 * * America/New_York
-- Wrapper:  DATA_JEDAIS.FINS__PUBLIC.SP_RETRY_WRAPPER('DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_PLAID_HELD_AWAY()', 2)
-- Warehouse: MAIN_WH_XS
--
-- Pattern parity:
--   Same warehouse (MAIN_WH_XS), SP_RETRY_WRAPPER call shape and retry count (2)
--   as Plans 1-5. The live schedule was staggered off the shared 07:00 UTC slot.
-- =============================================================================

CREATE OR REPLACE TASK DATA_JEDAIS.FINS__PUBLIC.TASK_MONTHLY_PLAID_HELD_AWAY
    WAREHOUSE = MAIN_WH_XS
    SCHEDULE  = 'USING CRON 35 3 1 * * America/New_York'
AS
    CALL DATA_JEDAIS.FINS__PUBLIC.SP_RETRY_WRAPPER(
        'DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_PLAID_HELD_AWAY()',
        2
    );

ALTER TASK DATA_JEDAIS.FINS__PUBLIC.TASK_MONTHLY_PLAID_HELD_AWAY RESUME;
