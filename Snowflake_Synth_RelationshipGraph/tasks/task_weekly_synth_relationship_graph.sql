-- =============================================================================
-- FINS.PUBLIC.TASK_WEEKLY_SYNTH_RELATIONSHIP_GRAPH
-- Scheduled task wrapping SP_GENERATE_SYNTH_RELATIONSHIP_GRAPH via SP_RETRY_WRAPPER.
-- =============================================================================
-- Plan:     docs/superpowers/plans/2026-05-28-cumulus-plan-9-synth-relationship-graph.md
-- Task:     Plan 9 T6
-- Cadence:  WEEKLY (every Monday at 05:00 UTC)
-- Schedule: 0 5 * * 1 UTC
-- Wrapper:  FINS.PUBLIC.SP_RETRY_WRAPPER('FINS.PUBLIC.SP_GENERATE_SYNTH_RELATIONSHIP_GRAPH()', 2)
-- Warehouse: MAIN_WH_XS
--
-- Pattern parity:
--   Mirrors Plan 6's structural shape (1:N composite-PK MERGE, write_pandas
--   staging table, idempotent same-window re-run). Same warehouse
--   (MAIN_WH_XS), same SP_RETRY_WRAPPER call shape, same retry count (2).
--   Cron differs from Plan 6 (which is monthly at 0 7 1 * * UTC) — Plan 9
--   adopts the weekly Monday 05:00 UTC slot per the per-plan spec.
--
-- Why Mon 05:00 UTC:
--   Start of business week — produces a fresh edge-graph snapshot before
--   advisor / analyst workflows kick off Monday morning across regions.
--   05:00 UTC follows the weekend's stale-data refresh window so the SP
--   reads the latest cross-plan upstream state (Claritas / DnB / BoardEx).
--   Tasks across plans run sequentially in alphabetical-ish task-name order,
--   not concurrently, so no warehouse contention concern with any other
--   weekly tasks landing on the same slot.
-- =============================================================================

CREATE OR REPLACE TASK FINS.PUBLIC.TASK_WEEKLY_SYNTH_RELATIONSHIP_GRAPH
    WAREHOUSE = MAIN_WH_XS
    SCHEDULE  = 'USING CRON 0 5 * * 1 UTC'
AS
    CALL FINS.PUBLIC.SP_RETRY_WRAPPER(
        'FINS.PUBLIC.SP_GENERATE_SYNTH_RELATIONSHIP_GRAPH()',
        2
    );

ALTER TASK FINS.PUBLIC.TASK_WEEKLY_SYNTH_RELATIONSHIP_GRAPH RESUME;
