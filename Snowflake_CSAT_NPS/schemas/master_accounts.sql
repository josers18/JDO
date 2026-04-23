-- =============================================================================
-- FINS.PUBLIC.MASTER_ACCOUNTS
-- Daily snapshot of Salesforce Data Cloud accounts
-- =============================================================================
-- Populated daily by SP_LOAD_MASTER_ACCOUNTS() from the inbound datashare:
--   FINSDC3_DATASHARE."schema_Jedi_Snowflake"."ssot__Account__dlm"
-- Each day's snapshot is identified by SNAPSHOT_DATE, enabling historical
-- tracking of account additions/removals over time.
-- =============================================================================

CREATE OR REPLACE TABLE FINS.PUBLIC.MASTER_ACCOUNTS (
    ACCOUNT_ID     VARCHAR(16777216)    COMMENT 'Salesforce Account ID (ssot__Id__c)',
    ACCOUNT_NAME   VARCHAR(16777216)    COMMENT 'Account display name (ssot__Name__c)',
    DATA_SOURCE    VARCHAR(16777216)    COMMENT 'Originating data source (ssot__DataSourceId__c)',
    SNAPSHOT_DATE  DATE                 COMMENT 'Date this snapshot was captured'
)
COMMENT = 'Daily snapshot of Salesforce Data Cloud account master list. Source: FINSDC3_DATASHARE secure view.';
