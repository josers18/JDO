-- =============================================================================
-- Migration 005 (applied 2026-11-04): deactivate the config rows for accounts
-- that come from Salesforce orgs other than Salesforce_Home.
--
-- Why: the ssot__Account__dlm share holds accounts from five orgs
-- (ssot__DataSourceId__c), and SYNC_NEW_ACCOUNTS() imports all of them. The
-- cockpits read the Home org only, so the 529 accounts from
-- Salesforce_InsuranceAFDC (167), Salesforce_FinsDC4 (146), Salesforce_FinsDC1
-- (127) and Salesforce_DCCDO1 (89) never join to anything. Effect: both
-- generators skip them (they read ACTIVE = TRUE) from the next run.
--
-- An account is non-Home when it is in the share and has no Salesforce_Home
-- row. Counting per ID (not the deduped pick) keeps the predicate independent
-- of the dedupe ordering; no ID is in more than one org today anyway.
--
-- Not changed: their FINANCIAL_TRADES rows (~1.66M, left in place, ACCOUNT_ID
-- intact), every other config column, Home accounts, and the 5 TRD- rows
-- (already inactive, migration 001). The sync is insert-only, so it won't
-- re-activate these rows; but it still imports NEW non-Home accounts until it
-- gets an org filter. Run as ACCOUNTADMIN outside the 03:00-03:10 ET task window.
-- Rollback: TRADE_GENERATION_CONFIG_BAK_20261104_M005 (state after migration 004).
-- =============================================================================

USE SCHEMA DATA_JEDAIS.FINS__PUBLIC;

CREATE TABLE IF NOT EXISTS TRADE_GENERATION_CONFIG_BAK_20261104_M005 CLONE TRADE_GENERATION_CONFIG;

UPDATE TRADE_GENERATION_CONFIG c SET
  ACTIVE       = FALSE,
  LAST_UPDATED = CURRENT_TIMESTAMP(),
  NOTES        = COALESCE(c.NOTES, '') || ' | deactivated 2026-11-04: non-Salesforce_Home org ' || o.SRC_ORGS || ' (migration 005)'
FROM (
  SELECT "ssot__Id__c" ACCOUNT_ID,
         LISTAGG(DISTINCT "ssot__DataSourceId__c", ',') WITHIN GROUP (ORDER BY "ssot__DataSourceId__c") SRC_ORGS
  FROM FINSDC3_DATASHARE."schema_Jedi_Snowflake"."ssot__Account__dlm"
  WHERE "ssot__Id__c" LIKE '001%'
  GROUP BY 1
  HAVING COUNT_IF("ssot__DataSourceId__c" = 'Salesforce_Home') = 0
) o
WHERE c.ACCOUNT_ID = o.ACCOUNT_ID
  AND c.ACTIVE = TRUE;
