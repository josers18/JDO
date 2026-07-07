-- =============================================================================
-- DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG
-- Execution history for scheduled tasks
-- =============================================================================
-- Written to by SP_LOAD_MASTER_ACCOUNTS() (and potentially other task
-- procedures). Captures success/failure status, row counts, error messages,
-- and execution duration for observability and alerting.
-- =============================================================================

CREATE OR REPLACE TABLE DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG (
    LOG_ID              VARCHAR(16777216) NOT NULL DEFAULT UUID_STRING()  COMMENT 'Unique log entry ID (auto-generated UUID)',
    TASK_NAME           VARCHAR(16777216) NOT NULL                       COMMENT 'Name of the task/procedure that ran',
    EXECUTION_TIME      TIMESTAMP_NTZ(9)          DEFAULT CURRENT_TIMESTAMP() COMMENT 'When the execution started',
    STATUS              VARCHAR(16777216) NOT NULL                       COMMENT 'Outcome: SUCCEEDED or FAILED',
    ROWS_INSERTED       NUMBER(38,0)                                    COMMENT 'Number of rows affected by the DML',
    ACCOUNTS_PROCESSED  NUMBER(38,0)                                    COMMENT 'Number of distinct accounts processed',
    ERROR_MESSAGE       VARCHAR(16777216)                                COMMENT 'Error details on failure (NULL on success)',
    DURATION_MS         NUMBER(38,0)                                    COMMENT 'Wall-clock execution time in milliseconds',
    PRIMARY KEY (LOG_ID)
)
COMMENT = 'Execution log for scheduled Snowflake tasks. Used for monitoring, alerting, and debugging failures.';
