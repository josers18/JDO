-- =============================================================================
-- DATA_JEDAIS.FINS__PUBLIC.TASK_WEEKLY_USERGEMS_JOB_CHANGES
-- Scheduled task wrapping SP_GENERATE_USERGEMS_JOB_CHANGES via SP_RETRY_WRAPPER.
-- =============================================================================
-- Plan:      docs/superpowers/plans/2026-11-02-cumulus-plan-15-usergems-job-changes.md
-- Task:      Plan 15 T5 (file); applied live in T6
-- Cadence:   WEEKLY, Monday 09:00 UTC.
-- Schedule:  0 9 * * 1 UTC  (5-field cron: minute hour day-of-month month day-of-week)
-- Wrapper:   DATA_JEDAIS.FINS__PUBLIC.SP_RETRY_WRAPPER('DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_USERGEMS_JOB_CHANGES()', 2)
-- Warehouse: MAIN_WH_XS
--
-- What one run writes:
--   CALL ...() uses BACKFILL_WEEKS = 0: the previous complete week plus the
--   current partial week (Monday only, at fire time). The overlap re-derives
--   last week's rows with the same EVENT_IDs, so the MERGE ON (ORG_ID,
--   EVENT_ID) updates them byte-identically and fills in the days the
--   previous run had not reached. Events never delete.
--
-- Preconditions (do NOT create or resume this task before all three):
--   1. schemas/usergems_job_changes.sql applied (target + staging tables).
--   2. BoardEx (Plan 10) history re-run with the sticky EXEC_TURNOVER_FLAG,
--      so a C-suite rise is a real FALSE to TRUE transition. Under the old
--      iid flag the SP's contract (a) fails (about 300 rows a week, band
--      [30, 200]); that failure is the intended guard.
--   3. One-shot backfill: CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_USERGEMS_JOB_CHANGES(104);
--
-- Volume: about 86 rows per complete week under the sticky BoardEx flag
-- (plan section 2 volume table); contract (a) enforces [30, 200].
-- =============================================================================

CREATE OR REPLACE TASK DATA_JEDAIS.FINS__PUBLIC.TASK_WEEKLY_USERGEMS_JOB_CHANGES
    WAREHOUSE = MAIN_WH_XS
    SCHEDULE  = 'USING CRON 0 9 * * 1 UTC'
AS
    CALL DATA_JEDAIS.FINS__PUBLIC.SP_RETRY_WRAPPER(
        'DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_USERGEMS_JOB_CHANGES()',
        2
    );

ALTER TASK DATA_JEDAIS.FINS__PUBLIC.TASK_WEEKLY_USERGEMS_JOB_CHANGES RESUME;
