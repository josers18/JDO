-- =============================================================================
-- DATA_JEDAIS.FINS__PUBLIC.TASK_MONTHLY_BOARDEX_EXEC_INTEL
-- Scheduled task wrapping SP_GENERATE_BOARDEX_EXEC_INTEL via SP_RETRY_WRAPPER.
-- =============================================================================
-- Plan:     docs/superpowers/plans/2026-05-28-cumulus-plan-10-boardex-exec-intel.md
-- Task:     Plan 10 T6
-- Cadence:  MONTHLY (first of month at 07:00 UTC).
-- Schedule: 0 7 1 * * UTC  (5-field cron: minute hour day-of-month month day-of-week)
-- Wrapper:  DATA_JEDAIS.FINS__PUBLIC.SP_RETRY_WRAPPER('DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_BOARDEX_EXEC_INTEL()', 2)
-- Warehouse: MAIN_WH_XS
--
-- Pattern parity:
--   Plan 10 keeps the MONTHLY cadence Plan 8 reverted to after Plan 7's
--   daily-cadence first. Cron string `0 7 1 * * UTC` matches Plans 1-3 /
--   Plan 6 / Plan 8 PRECISELY — same minute, hour, day-of-month. Plan 5
--   was QUARTERLY (`0 8 1 1,4,7,10 * UTC`); Plan 7 established the daily
--   precedent (`0 6 * * * UTC`) for Plan 13 (Moody's). Same warehouse
--   (MAIN_WH_XS), same SP_RETRY_WRAPPER call shape, same retry count (2).
--   Only the SP target differs from prior monthly tasks.
--
-- Why first of month at 07:00 UTC?
--   Board / governance refresh data from BoardEx / Equilar / ISS-style
--   vendors lands on a monthly cadence — proxy filings, 10-K board
--   composition disclosures, and director interlock graphs are all
--   updated on a monthly review cycle by the data providers. The
--   1st-of-month timing models the cadence Commercial Banking
--   relationship managers actually use to refresh executive intel
--   snapshots before client-meeting prep. The 07:00 UTC slot gives 7h
--   of buffer after midnight UTC for any in-org schedules that touch
--   the same anchors earlier in the day. (Synthetic data here, but the
--   timing models the real-world cadence for downstream-team education.)
--
-- Volume note:
--   ~960 rows/month — smallest Cumulus dataset by 4.1× (next-smallest is
--   Plan 8 MGP at 3,920). SP runtime expected <1s; warehouse spin-up
--   dominates wall time. Re-runs same calendar month are byte-identical
--   (idempotent MERGE on composite PK ACCOUNT_ID, PROFILE_MONTH).
-- =============================================================================

CREATE OR REPLACE TASK DATA_JEDAIS.FINS__PUBLIC.TASK_MONTHLY_BOARDEX_EXEC_INTEL
    WAREHOUSE = MAIN_WH_XS
    SCHEDULE  = 'USING CRON 0 7 1 * * UTC'
AS
    CALL DATA_JEDAIS.FINS__PUBLIC.SP_RETRY_WRAPPER(
        'DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_BOARDEX_EXEC_INTEL()',
        2
    );

ALTER TASK DATA_JEDAIS.FINS__PUBLIC.TASK_MONTHLY_BOARDEX_EXEC_INTEL RESUME;
