-- =============================================================================
-- DATA_JEDAIS.FINS__PUBLIC.TASK_MONTHLY_HARMONIC_COMPANY_SIGNALS
-- Scheduled task wrapping SP_GENERATE_HARMONIC_COMPANY_SIGNALS via SP_RETRY_WRAPPER.
-- =============================================================================
-- Plan:      docs/superpowers/plans/2026-11-02-cumulus-plan-16-harmonic-company-signals.md
-- Task:      Plan 16 T5 (created live in T6)
-- Cadence:   MONTHLY, 1st of month at 05:00 America/New_York.
-- Schedule:  0 5 1 * * America/New_York
-- Wrapper:   DATA_JEDAIS.FINS__PUBLIC.SP_RETRY_WRAPPER('DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_HARMONIC_COMPANY_SIGNALS()', 2)
-- Warehouse: MAIN_WH_XS
--
-- Why 05:00 America/New_York? The SP hard-depends on the current month's
-- ZoomInfo rows. The LIVE TASK_MONTHLY_ZOOMINFO_FIRMOGRAPHICS runs
-- 'USING CRON 40 3 1 * * America/New_York' (03:40 ET; it logged 08:40 UTC
-- on 2026-11-01), not the 0 7 1 * * UTC its repo SQL used to say. Using the
-- same time zone keeps the gap at 80 minutes all year (DST moves both
-- tasks together); ZoomInfo's own run takes 7-23 s. It also follows the
-- live convention of every other Cumulus monthly task (America/New_York).
-- If ZoomInfo has still not landed (it failed all 3 attempts on
-- 2026-07-01), the SP raises "...has no rows for PROFILE_MONTH..." and the
-- wrapper's retries (~90 s of backoff) will not cover it: re-run by hand
-- with CALL ...SP_GENERATE_HARMONIC_COMPANY_SIGNALS() after ZoomInfo lands.
-- The no-argument call resolves to BACKFILL_MONTHS DEFAULT 0 (current
-- month only).
-- =============================================================================

CREATE OR REPLACE TASK DATA_JEDAIS.FINS__PUBLIC.TASK_MONTHLY_HARMONIC_COMPANY_SIGNALS
    WAREHOUSE = MAIN_WH_XS
    SCHEDULE  = 'USING CRON 0 5 1 * * America/New_York'
AS
    CALL DATA_JEDAIS.FINS__PUBLIC.SP_RETRY_WRAPPER(
        'DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_HARMONIC_COMPANY_SIGNALS()',
        2
    );

ALTER TASK DATA_JEDAIS.FINS__PUBLIC.TASK_MONTHLY_HARMONIC_COMPANY_SIGNALS RESUME;
