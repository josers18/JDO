-- =============================================================================
-- Table:    TASK_EXECUTION_LOG
-- Database: FINS.PUBLIC
-- Purpose:  Audit trail for all procedure executions. Every call to
--           GENERATE_DAILY_TRADES, GENERATE_HISTORICAL_TRADES, or
--           SYNC_NEW_ACCOUNTS writes a log entry with status, row counts,
--           and duration. Historical backfill also writes IN_PROGRESS
--           entries every 50 business days for progress tracking.
-- PK:       LOG_ID (UUID, auto-generated)
-- =============================================================================

CREATE OR REPLACE TABLE FINS.PUBLIC.TASK_EXECUTION_LOG (
    LOG_ID              VARCHAR(16777216) NOT NULL DEFAULT UUID_STRING(),  -- Auto-generated UUID
    TASK_NAME           VARCHAR(16777216) NOT NULL,    -- DAILY_TRADE_GENERATION, HISTORICAL_BACKFILL, ACCOUNT_SYNC
    EXECUTION_TIME      TIMESTAMP_NTZ(9)  DEFAULT CURRENT_TIMESTAMP(),   -- When the entry was written
    STATUS              VARCHAR(16777216) NOT NULL,    -- SUCCEEDED, FAILED, IN_PROGRESS
    ROWS_INSERTED       NUMBER(38,0),                  -- Number of trade rows inserted
    ACCOUNTS_PROCESSED  NUMBER(38,0),                  -- Number of accounts evaluated
    ERROR_MESSAGE       VARCHAR(16777216),              -- Error details on failure, info on success
    DURATION_MS         NUMBER(38,0),                  -- Execution time in milliseconds

    PRIMARY KEY (LOG_ID)
);
