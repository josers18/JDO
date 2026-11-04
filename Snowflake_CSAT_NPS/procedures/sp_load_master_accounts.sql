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
-- Dedupe ordering (2026-11-04): mirrors V_ACCOUNT_ANCHORS v1.4 so MASTER_ACCOUNTS
-- .ACCOUNT_NAME comes from the same copy the view takes its attributes from:
-- most-populated row, then the Account DSO over PartyRelationshipGroup, then
-- newest LastModifiedDate, then a full-row hash as the total tiebreak. The old
-- ORDER BY "ssot__DataSourceId__c" tied on Omega (001am00000qvjs6AAA — both
-- copies are Salesforce_Home) and nondeterministically picked "Omega Group".
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
        -- multi-source ingestion or replication lag. Ordering is total
        -- (ends on a row hash) so every run picks the same copy; keep it in
        -- lockstep with V_ACCOUNT_ANCHORS v1.4. HASH(s.*) is computed in the
        -- inner SELECT because HASH(*) is not allowed in a window ORDER BY.
        MERGE INTO DATA_JEDAIS.FINS__PUBLIC.MASTER_ACCOUNTS AS tgt
        USING (
            SELECT
                "ssot__Id__c"           AS ACCOUNT_ID,
                "ssot__Name__c"         AS ACCOUNT_NAME,
                "ssot__DataSourceId__c" AS DATA_SOURCE
            FROM (
                SELECT s.*, HASH(s.*) AS "_row_hash"
                FROM FINSDC3_DATASHARE."schema_Jedi_Snowflake"."ssot__Account__dlm" s
            )
            QUALIFY ROW_NUMBER() OVER (
                PARTITION BY "ssot__Id__c"
                ORDER BY
                    ( IFF("FinServ_ClientCategory_c__c"   IS NULL, 0, 1)
                    + IFF("PersonBirthdate__c"            IS NULL, 0, 1)
                    + IFF("FinServ_AnnualIncome_pc__c"    IS NULL, 0, 1)
                    + IFF("FinServ_CreditScore_c__c"      IS NULL, 0, 1)
                    + IFF("ssot__PrimaryIndustry__c"      IS NULL, 0, 1)
                    + IFF("ssot__AnnualRevenueAmount__c"  IS NULL, 0, 1)
                    + IFF("ssot__EmployeeCount__c"        IS NULL, 0, 1)
                    + IFF(COALESCE("PersonMailingPostalCode__c", "BillingPostalCode__c") IS NULL, 0, 1)
                    + IFF(COALESCE("PersonMailingState__c",      "BillingState__c")      IS NULL, 0, 1)
                    + IFF(COALESCE("PersonMailingCountry__c",    "BillingCountry__c")    IS NULL, 0, 1)
                    + IFF("External_ID_c__c"              IS NULL, 0, 1) ) DESC,
                    IFF("ssot__DataSourceObjectId__c" = 'Account', 0, 1),
                    "ssot__LastModifiedDate__c" DESC NULLS LAST,
                    "_row_hash"
            ) = 1
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
