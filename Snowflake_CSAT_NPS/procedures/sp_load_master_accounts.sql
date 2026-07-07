-- =============================================================================
-- DATA_JEDAIS.FINS__PUBLIC.SP_LOAD_MASTER_ACCOUNTS
-- Daily master accounts sync from Salesforce Data Cloud
-- =============================================================================
-- Schedule: Runs daily at 6 AM UTC via TASK_LOAD_MASTER_ACCOUNTS.
-- Reads all accounts from the Salesforce Data Cloud inbound datashare, deduplicates
-- by ssot__Id__c (the source can contain multiple rows per account from DC
-- replication), and MERGEs into MASTER_ACCOUNTS — one row per account.
--
-- Idempotency: MERGE-based. Re-running on the same day updates SNAPSHOT_DATE
-- for existing accounts and inserts any new ones. Duplicate source rows are
-- collapsed via ROW_NUMBER() before reaching the MERGE.
--
-- Logging: Writes execution outcome to DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG.
-- =============================================================================

CREATE OR REPLACE PROCEDURE DATA_JEDAIS.FINS__PUBLIC.SP_LOAD_MASTER_ACCOUNTS()
RETURNS VARCHAR
LANGUAGE SQL
EXECUTE AS CALLER
AS
$$
BEGIN
    LET start_ts TIMESTAMP := (SELECT CURRENT_TIMESTAMP());
    LET today DATE := (SELECT CURRENT_DATE);
    LET row_ct INTEGER := 0;

    BEGIN
        -- MERGE with source deduplication: ROW_NUMBER collapses duplicate
        -- ssot__Id__c rows that appear in the Data Cloud secure view due to
        -- multi-source ingestion or replication lag.
        MERGE INTO DATA_JEDAIS.FINS__PUBLIC.MASTER_ACCOUNTS AS tgt
        USING (
            SELECT ACCOUNT_ID, ACCOUNT_NAME, DATA_SOURCE
            FROM (
                SELECT
                    "ssot__Id__c"           AS ACCOUNT_ID,
                    "ssot__Name__c"         AS ACCOUNT_NAME,
                    "ssot__DataSourceId__c" AS DATA_SOURCE,
                    ROW_NUMBER() OVER (
                        PARTITION BY "ssot__Id__c"
                        ORDER BY "ssot__DataSourceId__c"
                    ) AS rn
                FROM FINSDC3_DATASHARE."schema_Jedi_Snowflake"."ssot__Account__dlm"
            )
            WHERE rn = 1
        ) AS src
        ON tgt.ACCOUNT_ID = src.ACCOUNT_ID
        WHEN MATCHED THEN UPDATE SET
            tgt.ACCOUNT_NAME  = src.ACCOUNT_NAME,
            tgt.DATA_SOURCE   = src.DATA_SOURCE,
            tgt.SNAPSHOT_DATE = :today
        WHEN NOT MATCHED THEN INSERT (ACCOUNT_ID, ACCOUNT_NAME, DATA_SOURCE, SNAPSHOT_DATE)
            VALUES (src.ACCOUNT_ID, src.ACCOUNT_NAME, src.DATA_SOURCE, :today);

        row_ct := SQLROWCOUNT;

        LET duration_ms INTEGER := (SELECT DATEDIFF('millisecond', :start_ts, CURRENT_TIMESTAMP()));

        INSERT INTO DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG
            (TASK_NAME, STATUS, ROWS_INSERTED, ACCOUNTS_PROCESSED, ERROR_MESSAGE, DURATION_MS)
        VALUES ('LOAD_MASTER_ACCOUNTS', 'SUCCEEDED', :row_ct, :row_ct, NULL, :duration_ms);

        RETURN 'Merged ' || :row_ct || ' rows on ' || :today::STRING;

    EXCEPTION
        WHEN OTHER THEN
            LET err_msg VARCHAR := SQLERRM;
            LET duration_ms INTEGER := (SELECT DATEDIFF('millisecond', :start_ts, CURRENT_TIMESTAMP()));
            INSERT INTO DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG
                (TASK_NAME, STATUS, ROWS_INSERTED, ACCOUNTS_PROCESSED, ERROR_MESSAGE, DURATION_MS)
            VALUES ('LOAD_MASTER_ACCOUNTS', 'FAILED', 0, 0, :err_msg, :duration_ms);
            RAISE;
    END;
END;
$$;
