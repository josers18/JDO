-- =============================================================================
-- FINS.PUBLIC.TASK_MONTHLY_DNB_BUSINESS_CREDIT
-- Scheduled task wrapping SP_GENERATE_DNB_BUSINESS_CREDIT via
-- SP_RETRY_WRAPPER (2 attempts, the org-canonical default).
-- =============================================================================
-- Plan:     docs/superpowers/plans/2026-05-28-cumulus-plan-3-dnb-business-credit.md
-- Task:     Plan 3 T6
-- Cadence:  MONTHLY
-- Schedule: 0 7 1 * * UTC  (1st of month, 07:00 UTC)
-- Wrapper:  FINS.PUBLIC.SP_RETRY_WRAPPER('FINS.PUBLIC.SP_GENERATE_DNB_BUSINESS_CREDIT()', 2)
--
-- Pattern parity:
--   Mirrors TASK_MONTHLY_MSCI_ESG_SCORES + TASK_MONTHLY_CLARITAS_DEMOGRAPHICS
--   (FINS.PUBLIC) — same warehouse (MAIN_WH_XS), same cron, same SP_RETRY_WRAPPER
--   call shape. The org-canonical retry wrapper is SP_RETRY_WRAPPER (NOT
--   SP_RUN_WITH_RETRY — the spec name); its default retry count is 2.
-- =============================================================================

CREATE OR REPLACE TASK FINS.PUBLIC.TASK_MONTHLY_DNB_BUSINESS_CREDIT
    WAREHOUSE = MAIN_WH_XS
    SCHEDULE  = 'USING CRON 0 7 1 * * UTC'
AS
    CALL FINS.PUBLIC.SP_RETRY_WRAPPER(
        'FINS.PUBLIC.SP_GENERATE_DNB_BUSINESS_CREDIT()',
        2
    );

ALTER TASK FINS.PUBLIC.TASK_MONTHLY_DNB_BUSINESS_CREDIT RESUME;
