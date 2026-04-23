-- =============================================================================
-- FINS.PUBLIC.SP_LOAD_MASTER_ACCOUNTS
-- Daily master accounts snapshot procedure
-- =============================================================================
-- Schedule: Runs daily at 6 AM UTC via TASK_LOAD_MASTER_ACCOUNTS.
-- Reads all accounts from the Salesforce Data Cloud inbound datashare and
-- inserts a daily snapshot into MASTER_ACCOUNTS with today's date.
--
-- Idempotency: Deletes any existing rows for today before inserting.
-- =============================================================================

CREATE OR REPLACE PROCEDURE FINS.PUBLIC.SP_LOAD_MASTER_ACCOUNTS()
RETURNS STRING
LANGUAGE SQL
EXECUTE AS CALLER
AS
$$
BEGIN
    LET today DATE := (SELECT CURRENT_DATE);

    -- Idempotent: remove today's snapshot if it already exists
    DELETE FROM FINS.PUBLIC.MASTER_ACCOUNTS WHERE SNAPSHOT_DATE = :today;

    -- Load from Salesforce Data Cloud secure view
    INSERT INTO FINS.PUBLIC.MASTER_ACCOUNTS (ACCOUNT_ID, ACCOUNT_NAME, DATA_SOURCE, SNAPSHOT_DATE)
    SELECT
        "ssot__Id__c",
        "ssot__Name__c",
        "ssot__DataSourceId__c",
        :today
    FROM FINSDC3_DATASHARE."schema_Jedi_Snowflake"."ssot__Account__dlm";

    LET row_ct INTEGER := SQLROWCOUNT;
    RETURN 'Loaded ' || :row_ct || ' rows for ' || :today::STRING;
END;
$$;
