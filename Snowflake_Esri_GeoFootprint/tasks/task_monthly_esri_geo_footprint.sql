-- =============================================================================
-- DATA_JEDAIS.FINS__PUBLIC.TASK_MONTHLY_ESRI_GEO_FOOTPRINT
-- Scheduled task wrapping SP_GENERATE_ESRI_GEO_FOOTPRINT via
-- SP_RETRY_WRAPPER (2 attempts, the org-canonical default).
-- =============================================================================
-- Plan:     docs/superpowers/plans/2026-05-28-cumulus-plan-4-esri-geo-footprint.md
-- Task:     Plan 4 T6
-- Cadence:  MONTHLY
-- Schedule: 0 7 1 * * UTC  (1st of month, 07:00 UTC)
-- Wrapper:  DATA_JEDAIS.FINS__PUBLIC.SP_RETRY_WRAPPER('DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_ESRI_GEO_FOOTPRINT()', 2)
--
-- Pattern parity:
--   Mirrors TASK_MONTHLY_MSCI_ESG_SCORES + TASK_MONTHLY_CLARITAS_DEMOGRAPHICS
--   + TASK_MONTHLY_DNB_BUSINESS_CREDIT (DATA_JEDAIS.FINS__PUBLIC) — same warehouse
--   (MAIN_WH_XS), same cron, same SP_RETRY_WRAPPER call shape. The
--   org-canonical retry wrapper is SP_RETRY_WRAPPER (NOT SP_RUN_WITH_RETRY —
--   the spec name); its default retry count is 2.
-- =============================================================================

CREATE OR REPLACE TASK DATA_JEDAIS.FINS__PUBLIC.TASK_MONTHLY_ESRI_GEO_FOOTPRINT
    WAREHOUSE = MAIN_WH_XS
    SCHEDULE  = 'USING CRON 0 7 1 * * UTC'
AS
    CALL DATA_JEDAIS.FINS__PUBLIC.SP_RETRY_WRAPPER(
        'DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_ESRI_GEO_FOOTPRINT()',
        2
    );

ALTER TASK DATA_JEDAIS.FINS__PUBLIC.TASK_MONTHLY_ESRI_GEO_FOOTPRINT RESUME;
