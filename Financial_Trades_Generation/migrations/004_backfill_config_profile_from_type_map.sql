-- =============================================================================
-- Migration 004 (applied 2026-11-04): backfill the trading profile (FREQUENCY,
-- TRADES_PER_PERIOD, RISK_PROFILE, MAX_TRADE_VALUE) on rows whose ACCOUNT_TYPE
-- already matches the source but whose profile doesn't match the type map.
--
-- Why: after migration 003, 25,379 rows still had a profile that disagreed with
-- the SYNC_NEW_ACCOUNTS() type_map. All are Salesforce_Home accounts with source
-- type 'Person', stored on the default WEEKLY / 5 / Moderate / 150000 profile;
-- the type map puts Person on MONTHLY / 3 / Conservative / 50000. Effect: these
-- accounts trade monthly at a lower cap from the next GENERATE_DAILY_TRADES run.
-- Existing FINANCIAL_TRADES rows are not rewritten.
--
-- Not changed: ACCOUNT_NAME / ACCOUNT_TYPE (done by 003), PREFERRED_*, ACTIVE,
-- LAST_GENERATED_DATE, rows whose type differs (none after 003), and the 5 TRD- rows.
-- Dedupe and type_map must match procedures/sync_new_accounts.sql. Run as
-- ACCOUNTADMIN outside the 03:00-03:10 ET task window.
-- Rollback: TRADE_GENERATION_CONFIG_BAK_20261104_M004 (state after migration 003).
-- =============================================================================

USE SCHEMA DATA_JEDAIS.FINS__PUBLIC;

CREATE TABLE IF NOT EXISTS TRADE_GENERATION_CONFIG_BAK_20261104_M004 CLONE TRADE_GENERATION_CONFIG;

UPDATE TRADE_GENERATION_CONFIG c SET
  FREQUENCY         = e.E_FREQ,
  TRADES_PER_PERIOD = e.E_TPP,
  RISK_PROFILE      = e.E_RISK,
  MAX_TRADE_VALUE   = e.E_MAX,
  LAST_UPDATED      = CURRENT_TIMESTAMP(),
  NOTES             = c.NOTES || ' | profile backfilled from type map 2026-11-04 (migration 004)'
FROM (
WITH src AS (
  SELECT "ssot__Id__c" ACCOUNT_ID, "ssot__Name__c" SRC_NAME, "ssot__AccountTypeId__c" SRC_TYPE
  FROM (SELECT s.*, HASH(s.*) "_row_hash" FROM FINSDC3_DATASHARE."schema_Jedi_Snowflake"."ssot__Account__dlm" s)
  WHERE "ssot__Id__c" LIKE '001%' AND "ssot__Name__c" IS NOT NULL AND TRIM("ssot__Name__c") != ''
  QUALIFY ROW_NUMBER() OVER (PARTITION BY "ssot__Id__c" ORDER BY IFF("ssot__DataSourceObjectId__c"='Account',0,1), "ssot__LastModifiedDate__c" DESC NULLS LAST, "_row_hash")=1),
m AS (SELECT * FROM VALUES
  ('Enterprise','Institutional','DAILY',12,'Moderate',500000),('Mid-Market','Institutional','DAILY',8,'Moderate',300000),
  ('Small Business','Retail','WEEKLY',4,'Conservative',100000),('Client','Retail','DAILY',6,'Moderate',200000),
  ('Person','Retail','MONTHLY',3,'Conservative',50000),('Partner','Institutional','WEEKLY',10,'Aggressive',400000),
  ('Investor','Institutional','DAILY',15,'Aggressive',750000),('Consultant','Retail','MONTHLY',2,'Conservative',75000)
  AS m(SRC_TYPE,E_TYPE,E_FREQ,E_TPP,E_RISK,E_MAX))
SELECT s.ACCOUNT_ID, s.SRC_NAME, s.SRC_TYPE,
  COALESCE(m.E_TYPE,'Retail') E_TYPE, COALESCE(m.E_FREQ,'WEEKLY') E_FREQ, COALESCE(m.E_TPP,5) E_TPP,
  COALESCE(m.E_RISK,'Moderate') E_RISK, COALESCE(m.E_MAX,150000) E_MAX
FROM src s LEFT JOIN m ON m.SRC_TYPE = s.SRC_TYPE
) e
WHERE c.ACCOUNT_ID = e.ACCOUNT_ID
  AND c.ACCOUNT_TYPE = e.E_TYPE
  AND (c.FREQUENCY IS DISTINCT FROM e.E_FREQ OR c.TRADES_PER_PERIOD IS DISTINCT FROM e.E_TPP
       OR c.RISK_PROFILE IS DISTINCT FROM e.E_RISK OR c.MAX_TRADE_VALUE IS DISTINCT FROM e.E_MAX);
