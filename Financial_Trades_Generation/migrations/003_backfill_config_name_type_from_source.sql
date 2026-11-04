-- =============================================================================
-- Migration 003 (applied 2026-11-04): backfill TRADE_GENERATION_CONFIG ACCOUNT_NAME
-- and ACCOUNT_TYPE from the deduped ssot__Account__dlm source.
--
-- Why: SYNC_NEW_ACCOUNTS() is insert-only, so a Salesforce rename or a type change
-- never reaches existing config rows. Probe on 2026-11-04 (36,768 joined rows):
--   * 25,425 ACCOUNT_NAME diffs, mostly a middle initial added in Salesforce
--     ("Harry Gray" -> "Harry P Gray"), plus "Unknown Customer" placeholders.
--   * 5,628 ACCOUNT_TYPE diffs, all source type 'Partner' stored as Retail
--     (the sync maps Partner -> Institutional).
--   * Every joined row still had the auto-import NOTES, so no manual edits are lost.
--
-- What changes:
--   * ACCOUNT_NAME := deduped source name, where it differs.
--   * Where the mapped ACCOUNT_TYPE differs, ACCOUNT_TYPE and its profile
--     (FREQUENCY, TRADES_PER_PERIOD, RISK_PROFILE, MAX_TRADE_VALUE) := the
--     SYNC_NEW_ACCOUNTS() type_map values, so type and profile stay consistent.
--   * LAST_UPDATED := now. NOTES gets a marker on touched rows.
-- Not changed: profile-only drift on rows whose type already matches (left as is;
-- the generators use those values), PREFERRED_*, ACTIVE, LAST_GENERATED_DATE, and the
-- 5 TRD- rows (not in the source). Existing FINANCIAL_TRADES rows are not rewritten.
--
-- Dedupe and type_map must match procedures/sync_new_accounts.sql. Run as
-- ACCOUNTADMIN outside the 00:00-01:10 ET task window.
-- Rollback: TRADE_GENERATION_CONFIG_BAK_20261104.
-- =============================================================================

USE SCHEMA DATA_JEDAIS.FINS__PUBLIC;

CREATE TABLE IF NOT EXISTS TRADE_GENERATION_CONFIG_BAK_20261104 CLONE TRADE_GENERATION_CONFIG;

UPDATE TRADE_GENERATION_CONFIG c SET
  ACCOUNT_NAME      = e.SRC_NAME,
  ACCOUNT_TYPE      = e.E_TYPE,
  FREQUENCY         = IFF(c.ACCOUNT_TYPE IS DISTINCT FROM e.E_TYPE, e.E_FREQ, c.FREQUENCY),
  TRADES_PER_PERIOD = IFF(c.ACCOUNT_TYPE IS DISTINCT FROM e.E_TYPE, e.E_TPP,  c.TRADES_PER_PERIOD),
  RISK_PROFILE      = IFF(c.ACCOUNT_TYPE IS DISTINCT FROM e.E_TYPE, e.E_RISK, c.RISK_PROFILE),
  MAX_TRADE_VALUE   = IFF(c.ACCOUNT_TYPE IS DISTINCT FROM e.E_TYPE, e.E_MAX,  c.MAX_TRADE_VALUE),
  LAST_UPDATED      = CURRENT_TIMESTAMP(),
  NOTES             = c.NOTES || ' | name/type backfilled from source 2026-11-04 (migration 003)'
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
  AND (c.ACCOUNT_NAME IS DISTINCT FROM e.SRC_NAME OR c.ACCOUNT_TYPE IS DISTINCT FROM e.E_TYPE);
