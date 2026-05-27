-- =============================================================================
-- FINS.PUBLIC.MASTER_ACCOUNTS
-- Current state of Salesforce Data Cloud accounts (one row per account)
-- =============================================================================
-- Maintained by SP_LOAD_MASTER_ACCOUNTS() via daily MERGE from the inbound
-- datashare: FINSDC3_DATASHARE."schema_Jedi_Snowflake"."ssot__Account__dlm"
--
-- ACCOUNT_ID is the natural key (unique). SNAPSHOT_DATE records when the row
-- was last refreshed. The MERGE pattern ensures exactly one row per account —
-- new accounts are inserted, existing accounts have their name/source/date
-- updated in place.
-- =============================================================================

CREATE OR REPLACE TABLE FINS.PUBLIC.MASTER_ACCOUNTS (
    ACCOUNT_ID     VARCHAR(16777216) NOT NULL  COMMENT 'Salesforce Account ID (ssot__Id__c). Natural key — one row per account.',
    ACCOUNT_NAME   VARCHAR(16777216)           COMMENT 'Account display name (ssot__Name__c)',
    DATA_SOURCE    VARCHAR(16777216)           COMMENT 'Originating data source (ssot__DataSourceId__c)',
    SNAPSHOT_DATE  DATE              NOT NULL  COMMENT 'Date this row was last refreshed by the daily sync',
    CONSTRAINT uq_master_accounts_id UNIQUE (ACCOUNT_ID)
)
COMMENT = 'Current Salesforce Data Cloud account master list (one row per account). Source: FINSDC3_DATASHARE secure view. Refreshed daily by SP_LOAD_MASTER_ACCOUNTS().';
