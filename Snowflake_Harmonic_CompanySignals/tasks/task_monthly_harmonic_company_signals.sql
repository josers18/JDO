-- =============================================================================
-- DATA_JEDAIS.FINS__PUBLIC.TASK_MONTHLY_HARMONIC_COMPANY_SIGNALS
-- Scheduled task wrapping SP_GENERATE_HARMONIC_COMPANY_SIGNALS via SP_RETRY_WRAPPER.
-- =============================================================================
-- Plan:      docs/superpowers/plans/2026-11-02-cumulus-plan-16-harmonic-company-signals.md
-- Task:      Plan 16 T5 (created live in T6)
-- Cadence:   MONTHLY, 1st of month at 09:00 UTC.
-- Schedule:  0 9 1 * * UTC
-- Wrapper:   DATA_JEDAIS.FINS__PUBLIC.SP_RETRY_WRAPPER('DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_HARMONIC_COMPANY_SIGNALS()', 2)
-- Warehouse: MAIN_WH_XS
--
-- Why 09:00 UTC? The SP hard-depends on the current month's ZoomInfo rows
-- (TASK_MONTHLY_ZOOMINFO_FIRMOGRAPHICS, 07:00 UTC). The 2h gap covers
-- ZoomInfo's run plus its retries. If ZoomInfo has still not landed, the SP
-- raises "...has no rows for PROFILE_MONTH..." and the wrapper retries.
-- The no-argument call resolves to BACKFILL_MONTHS DEFAULT 0 (current
-- month only).
-- =============================================================================

CREATE OR REPLACE TASK DATA_JEDAIS.FINS__PUBLIC.TASK_MONTHLY_HARMONIC_COMPANY_SIGNALS
    WAREHOUSE = MAIN_WH_XS
    SCHEDULE  = 'USING CRON 0 9 1 * * UTC'
AS
    CALL DATA_JEDAIS.FINS__PUBLIC.SP_RETRY_WRAPPER(
        'DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_HARMONIC_COMPANY_SIGNALS()',
        2
    );

ALTER TASK DATA_JEDAIS.FINS__PUBLIC.TASK_MONTHLY_HARMONIC_COMPANY_SIGNALS RESUME;
