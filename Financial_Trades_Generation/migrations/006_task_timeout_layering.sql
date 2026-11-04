-- =============================================================================
-- Migration 006 (NOT YET APPLIED): drop SP_RETRY_WRAPPER from the two daily
-- tasks and fit the generator's timeout inside the task run.
--
-- Why: both tasks called their procedure through SP_RETRY_WRAPPER(..., 2) AND
-- set TASK_AUTO_RETRY_ATTEMPTS = 2, and the timeouts didn't nest. On
-- 2026-11-02 (ACCOUNT_USAGE.QUERY_HISTORY) DAILY_TRADE_GENERATOR's inner
-- GENERATE_DAILY_TRADES() CALL hit the 1,800 s statement timeout, the
-- wrapper's second attempt was cancelled at 1,764 s when the outer CALL hit
-- the 3,600 s task timeout (USER_TASK_TIMEOUT_MS default), and the task
-- retried the whole thing twice: 6 attempts, 03:10 to 06:10 ET, each writing
-- trades. Three wrapper attempts x 1,800 s can never fit in 3,600 s.
--
-- After: each task CALLs its procedure directly, and TASK_AUTO_RETRY_ATTEMPTS
-- (2) is the only retry layer.
--   DAILY_TRADE_GENERATOR: STATEMENT_TIMEOUT_IN_SECONDS 1800 -> 3000, below
--     USER_TASK_TIMEOUT_MS 3600000 (now set explicitly). A normal run takes
--     22-40 s with write_pandas; a retry resumes at the first unfinished
--     account (LAST_GENERATED_DATE gate).
--   DAILY_ACCOUNT_SYNC: keeps the 300 s statement timeout; USER_TASK_TIMEOUT_MS
--     360000. One attempt now always ends before the generator fires at 03:10.
-- Cost: a run killed by a timeout writes no FAILED row to TASK_EXECUTION_LOG
-- (the wrapper used to log FAILED_ALL_RETRIES); check TASK_HISTORY instead.
-- SP_RETRY_WRAPPER itself is unchanged; about 35 other tasks still use it.
--
-- Run as ACCOUNTADMIN outside the 03:00-03:10 ET task window. ALTER TASK needs
-- the task suspended; this script resumes both.
-- Rollback: the previous bodies are in git history of tasks/*.sql
-- (SP_RETRY_WRAPPER(..., 2), generator STATEMENT_TIMEOUT_IN_SECONDS = 1800).
-- =============================================================================

ALTER TASK DATA_JEDAIS.FINS__PUBLIC.DAILY_TRADE_GENERATOR SUSPEND;
ALTER TASK DATA_JEDAIS.FINS__PUBLIC.DAILY_TRADE_GENERATOR SET
    STATEMENT_TIMEOUT_IN_SECONDS = 3000
    USER_TASK_TIMEOUT_MS         = 3600000;
ALTER TASK DATA_JEDAIS.FINS__PUBLIC.DAILY_TRADE_GENERATOR MODIFY AS
    CALL DATA_JEDAIS.FINS__PUBLIC.GENERATE_DAILY_TRADES();
ALTER TASK DATA_JEDAIS.FINS__PUBLIC.DAILY_TRADE_GENERATOR RESUME;

ALTER TASK DATA_JEDAIS.FINS__PUBLIC.DAILY_ACCOUNT_SYNC SUSPEND;
ALTER TASK DATA_JEDAIS.FINS__PUBLIC.DAILY_ACCOUNT_SYNC SET
    USER_TASK_TIMEOUT_MS = 360000;
ALTER TASK DATA_JEDAIS.FINS__PUBLIC.DAILY_ACCOUNT_SYNC MODIFY AS
    CALL DATA_JEDAIS.FINS__PUBLIC.SYNC_NEW_ACCOUNTS();
ALTER TASK DATA_JEDAIS.FINS__PUBLIC.DAILY_ACCOUNT_SYNC RESUME;

-- Verify: both bodies call the procedure directly, both tasks 'started'.
SELECT GET_DDL('TASK', 'DATA_JEDAIS.FINS__PUBLIC.DAILY_TRADE_GENERATOR');
SELECT GET_DDL('TASK', 'DATA_JEDAIS.FINS__PUBLIC.DAILY_ACCOUNT_SYNC');
SHOW TASKS LIKE 'DAILY_%' IN SCHEMA DATA_JEDAIS.FINS__PUBLIC;
