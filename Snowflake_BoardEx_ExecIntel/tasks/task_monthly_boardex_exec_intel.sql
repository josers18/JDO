-- =============================================================================
-- DATA_JEDAIS.FINS__PUBLIC.TASK_MONTHLY_BOARDEX_EXEC_INTEL
-- Scheduled task wrapping SP_GENERATE_BOARDEX_EXEC_INTEL via SP_RETRY_WRAPPER.
-- =============================================================================
-- Plan:     docs/superpowers/plans/2026-05-28-cumulus-plan-10-boardex-exec-intel.md
-- Task:     Plan 10 T6
-- Cadence:  MONTHLY (first of month at 03:00 America/New_York).
-- Schedule: 0 3 1 * * America/New_York  (5-field cron: minute hour day-of-month month day-of-week)
--           Synced to the live task 2026-11-02 (the repo previously said
--           `0 7 1 * * UTC`; the live task had been re-created with the ET
--           schedule and the repo never caught up).
-- Wrapper:  DATA_JEDAIS.FINS__PUBLIC.SP_RETRY_WRAPPER('DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_BOARDEX_EXEC_INTEL()', 2)
-- Warehouse: MAIN_WH_XS
--
-- Pattern parity:
--   Plan 10 keeps the MONTHLY cadence Plan 8 reverted to after Plan 7's
--   daily-cadence first. Same warehouse (MAIN_WH_XS), same SP_RETRY_WRAPPER
--   call shape, same retry count (2) as the other monthly Cumulus tasks.
--   The live schedule is `0 3 1 * * America/New_York` (the original Plan 10
--   design said `0 7 1 * * UTC`; the live task was re-created on ET).
--
-- Why first of month at 03:00 America/New_York?
--   Board / governance refresh data from BoardEx / Equilar / ISS-style
--   vendors lands on a monthly cadence (proxy filings, 10-K board
--   composition disclosures, director interlock graphs). The 1st-of-month
--   timing models the cadence Commercial Banking relationship managers use
--   to refresh executive intel snapshots before client-meeting prep. 03:00
--   ET runs before the US business day starts, so the new month is in place
--   before anyone opens a cockpit. (Synthetic data, but the timing models
--   the real-world cadence.)
--
-- Volume note:
--   ~36.8K rows/month: the all-accounts audience (~36,821 anchors, PERSON +
--   BUSINESS, 1:1 anchor:row). The v1 Commercial-Banking-only design was
--   ~960 rows/month. Re-runs in the same calendar month are byte-identical
--   (idempotent MERGE on composite PK ORG_ID, ACCOUNT_ID, PROFILE_MONTH).
-- =============================================================================

CREATE OR REPLACE TASK DATA_JEDAIS.FINS__PUBLIC.TASK_MONTHLY_BOARDEX_EXEC_INTEL
    WAREHOUSE = MAIN_WH_XS
    SCHEDULE  = 'USING CRON 0 3 1 * * America/New_York'
AS
    CALL DATA_JEDAIS.FINS__PUBLIC.SP_RETRY_WRAPPER(
        'DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_BOARDEX_EXEC_INTEL()',
        2
    );

ALTER TASK DATA_JEDAIS.FINS__PUBLIC.TASK_MONTHLY_BOARDEX_EXEC_INTEL RESUME;
