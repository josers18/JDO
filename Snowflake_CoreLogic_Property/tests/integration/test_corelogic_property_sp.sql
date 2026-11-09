-- =============================================================================
-- L2 integration test for SP_GENERATE_CORELOGIC_PROPERTY
-- =============================================================================
-- Run:     snow sql -c SFDC_DC_TECH_ARCH_jwt --role ACCOUNTADMIN \
--            -f tests/integration/test_corelogic_property_sp.sql
--          (ACCOUNTADMIN: the cloned SP is EXECUTE AS OWNER and write_pandas
--          creates its staging table, which needs CREATE TABLE.)
-- Pass:    Every assertion column returns TRUE. Any FALSE = test failure.
--
-- Strategy:
--   Clone the deployed SP into SP_GENERATE_CORELOGIC_PROPERTY_FIXTURE via
--   GET_DDL + REPLACE, redirecting the dataset table, staging table, task-log
--   name and V_ACCOUNT_ANCHORS to fixture-scoped names, then CALL it against
--   a 14-anchor fixture view (12 PERSON + 2 BUSINESS).
--   Sentinels avoid substring collisions: CORELOGIC_PROPERTY is a stem of the
--   SP, task and staging names, so those are parked first and expanded after
--   the table swap. Before the first CALL the REPLACEd DDL is checked: if any
--   live write target (CORELOGIC_PROPERTY, CORELOGIC_PROPERTY_STAGING) or the
--   live V_ACCOUNT_ANCHORS survives, the script raises and nothing is created.
--   The only live object the clone still touches is TASK_EXECUTION_LOG (insert
--   of rows under the fixture TASK_NAME, deleted in the cleanup step).
--
-- What it covers:
--   - Audience: PERSON anchors with a non-NULL, non-empty POSTAL_CODE only;
--     BUSINESS anchors and PERSON anchors with '' / NULL ZIP are excluded
--     (10 of 14 anchors enter).
--   - Day 1 (CALL): one row per audience account, PROFILE_QUARTER =
--     first-of-quarter (UTC), GENERATED_AT = PROFILE_QUARTER midnight,
--     required columns populated, ORG_ID stamped from the anchor.
--   - Shape: renters have the 8 property columns NULL and LIEN_COUNT = 0;
--     owners have type/value/equity populated; EQUITY = VALUE - MORTGAGE;
--     LTV in [0, 95] and MORTGAGE_RATE_PCT present only when a mortgage > 0.
--   - Vocabularies/ranges: FEMA flood zones, wildfire score [0, 95], HELOC
--     score [0, 100], property types, LAST_TRANSFER_YEAR [1980, this year].
--   - Same-quarter idempotency and determinism: re-runs leave the row count
--     and a NULL-safe HASH_AGG unchanged.
--   - Safety: no fixture ids reach the live CORELOGIC_PROPERTY table.
--
-- Pre-requisites:
--   SP_GENERATE_CORELOGIC_PROPERTY deployed (python3 scripts/deploy_sp.py).
-- Side effects:
--   Fixture runs log to TASK_EXECUTION_LOG as
--   TASK_QUARTERLY_CORELOGIC_PROPERTY_FIXTURE; the cleanup step deletes those
--   rows. All fixture tables/views/procedures are dropped at the end.
-- =============================================================================

USE SCHEMA DATA_JEDAIS.FINS__PUBLIC;

-- ---------------------------------------------------------------------------
-- 1. Drop leftovers from a prior failed run.
-- ---------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_CORELOGIC_PROPERTY_FIXTURE();
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.CORELOGIC_PROPERTY_FIXTURE_STAGING;
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.CORELOGIC_PROPERTY_FIXTURE;
DROP VIEW      IF EXISTS DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS_CORELOGIC_FIXTURE;

-- ---------------------------------------------------------------------------
-- 2. Fixture audience view, in the live V_ACCOUNT_ANCHORS column order.
--    PERSON anchors CLP-FIX-P-01..P-10 enter the audience:
--      P-01 Gen Z, low income, CA        P-02 Gen Z, low income, FL
--      P-03 Millennial, mid, NY          P-04 Millennial, high, CA (Wealth)
--      P-05 Gen X, mid, MA               P-06 Gen X, high, LA (Wealth)
--      P-07 Boomer, mid, TX              P-08 Boomer 65+, high, CA (Wealth)
--      P-09 Millennial, low, MA          P-10 Boomer, mid, FL
--    Excluded edge anchors:
--      P-11 PERSON with '' POSTAL_CODE   P-12 PERSON with NULL POSTAL_CODE
--      B-01, B-02 BUSINESS (audience is PERSON-only)
--    P-03 carries ORG_ID 'CLPTEST' to prove ORG_ID is stamped from the anchor.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS_CORELOGIC_FIXTURE AS
SELECT
    'JDO'::VARCHAR                   AS ORG_ID,
    'CLP-FIX-P-01'::VARCHAR          AS ACCOUNT_ID,
    'Avery Stone'::VARCHAR           AS ACCOUNT_NAME,
    '2026-11-01'::DATE               AS SNAPSHOT_DATE,
    'Retail'::VARCHAR                AS CLIENT_CATEGORY,
    'PERSON'::VARCHAR                AS ACCOUNT_TYPE_FLAG,
    '2002-03-14'::TIMESTAMP_LTZ      AS BIRTHDATE,
    42000::NUMBER                    AS ANNUAL_INCOME,
    680::NUMBER                      AS CREDIT_SCORE,
    NULL::VARCHAR                    AS INDUSTRY,
    NULL::NUMBER                     AS ANNUAL_REVENUE,
    NULL::NUMBER                     AS EMPLOYEE_COUNT,
    '94110'::VARCHAR                 AS POSTAL_CODE,
    'CA'::VARCHAR                    AS STATE_CODE,
    'US'::VARCHAR                    AS COUNTRY_CODE,
    'EXT-CLP-P-01'::VARCHAR          AS EXTERNAL_ID
UNION ALL SELECT 'JDO','CLP-FIX-P-02','Riley Park','2026-11-01','Retail','PERSON','2003-08-22'::TIMESTAMP_LTZ,38000,670,NULL,NULL,NULL,'33101','FL','US','EXT-CLP-P-02'
UNION ALL SELECT 'CLPTEST','CLP-FIX-P-03','Casey Reed','2026-11-01','Retail','PERSON','1990-11-05'::TIMESTAMP_LTZ,95000,720,NULL,NULL,NULL,'10025','NY','US','EXT-CLP-P-03'
UNION ALL SELECT 'JDO','CLP-FIX-P-04','Quinn Marlowe','2026-11-01','Wealth Management','PERSON','1988-04-08'::TIMESTAMP_LTZ,285000,770,NULL,NULL,NULL,'94027','CA','US','EXT-CLP-P-04'
UNION ALL SELECT 'JDO','CLP-FIX-P-05','Jordan Vega','2026-11-01','Retail','PERSON','1975-06-12'::TIMESTAMP_LTZ,130000,740,NULL,NULL,NULL,'02115','MA','US','EXT-CLP-P-05'
UNION ALL SELECT 'JDO','CLP-FIX-P-06','Morgan Hayes','2026-11-01','Wealth Management','PERSON','1972-09-30'::TIMESTAMP_LTZ,310000,780,NULL,NULL,NULL,'70112','LA','US','EXT-CLP-P-06'
UNION ALL SELECT 'JDO','CLP-FIX-P-07','Sam Walters','2026-11-01','Retail','PERSON','1958-02-18'::TIMESTAMP_LTZ,88000,730,NULL,NULL,NULL,'77002','TX','US','EXT-CLP-P-07'
UNION ALL SELECT 'JDO','CLP-FIX-P-08','Pat Donovan','2026-11-01','Wealth Management','PERSON','1955-12-03'::TIMESTAMP_LTZ,265000,790,NULL,NULL,NULL,'90001','CA','US','EXT-CLP-P-08'
UNION ALL SELECT 'JDO','CLP-FIX-P-09','Drew Mitchell','2026-11-01','Retail','PERSON','1992-07-19'::TIMESTAMP_LTZ,45000,690,NULL,NULL,NULL,'02101','MA','US','EXT-CLP-P-09'
UNION ALL SELECT 'JDO','CLP-FIX-P-10','Alex Brennan','2026-11-01','Retail','PERSON','1960-01-22'::TIMESTAMP_LTZ,110000,750,NULL,NULL,NULL,'33139','FL','US','EXT-CLP-P-10'
UNION ALL SELECT 'JDO','CLP-FIX-P-11','Edge EmptyZip','2026-11-01','Retail','PERSON','1985-05-05'::TIMESTAMP_LTZ,75000,700,NULL,NULL,NULL,'','CA','US','EXT-CLP-P-11'
UNION ALL SELECT 'JDO','CLP-FIX-P-12','Edge NullZip','2026-11-01','Retail','PERSON','1980-10-10'::TIMESTAMP_LTZ,82000,710,NULL,NULL,NULL,NULL,'CA','US','EXT-CLP-P-12'
UNION ALL SELECT 'JDO','CLP-FIX-B-01','Mariposa Cleaners LLC','2026-11-01','Small Business','BUSINESS',NULL,NULL,NULL,'Personal Services',480000,6,'94110','CA','US','EXT-CLP-B-01'
UNION ALL SELECT 'JDO','CLP-FIX-B-02','Pinewood Coffee Co.','2026-11-01','Small Business','BUSINESS',NULL,NULL,NULL,'Food & Beverage',1200000,18,'98101','WA','US','EXT-CLP-B-02';

-- ---------------------------------------------------------------------------
-- 3. Fixture target table: same DDL as CORELOGIC_PROPERTY.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE TABLE DATA_JEDAIS.FINS__PUBLIC.CORELOGIC_PROPERTY_FIXTURE
LIKE DATA_JEDAIS.FINS__PUBLIC.CORELOGIC_PROPERTY;

-- ---------------------------------------------------------------------------
-- 4. Clone the SP (live signature takes no arguments), with a safety gate:
--    raise before creating anything if a live write target survives.
-- ---------------------------------------------------------------------------
EXECUTE IMMEDIATE $$
DECLARE
    sp_ddl STRING;
    probe  STRING;
    live_target_survived EXCEPTION (-20001, 'Live write target survived REPLACE; aborting.');
BEGIN
    sp_ddl := (SELECT GET_DDL('PROCEDURE', 'DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_CORELOGIC_PROPERTY()'));
    -- Park the identifiers that contain CORELOGIC_PROPERTY as a stem.
    sp_ddl := REPLACE(sp_ddl, 'CORELOGIC_PROPERTY_STAGING',     '__CLP_STG__');
    sp_ddl := REPLACE(sp_ddl, 'SP_GENERATE_CORELOGIC_PROPERTY', '__CLP_SP__');
    sp_ddl := REPLACE(sp_ddl, 'TASK_QUARTERLY_CORELOGIC_PROPERTY', '__CLP_TASK__');
    -- The dataset table name is now unambiguous.
    sp_ddl := REPLACE(sp_ddl, 'CORELOGIC_PROPERTY',             'CORELOGIC_PROPERTY_FIXTURE');
    -- Expand the sentinels to fixture names.
    sp_ddl := REPLACE(sp_ddl, '__CLP_STG__',                    'CORELOGIC_PROPERTY_FIXTURE_STAGING');
    sp_ddl := REPLACE(sp_ddl, '__CLP_SP__',                     'SP_GENERATE_CORELOGIC_PROPERTY_FIXTURE');
    sp_ddl := REPLACE(sp_ddl, '__CLP_TASK__',                   'TASK_QUARTERLY_CORELOGIC_PROPERTY_FIXTURE');
    -- Redirect the audience to the fixture view.
    sp_ddl := REPLACE(sp_ddl, 'V_ACCOUNT_ANCHORS',              'V_ACCOUNT_ANCHORS_CORELOGIC_FIXTURE');
    -- Safety gate: strip every fixture name; nothing live may remain.
    probe := sp_ddl;
    probe := REPLACE(probe, 'CORELOGIC_PROPERTY_FIXTURE_STAGING',            '');
    probe := REPLACE(probe, 'SP_GENERATE_CORELOGIC_PROPERTY_FIXTURE',        '');
    probe := REPLACE(probe, 'TASK_QUARTERLY_CORELOGIC_PROPERTY_FIXTURE',     '');
    probe := REPLACE(probe, 'CORELOGIC_PROPERTY_FIXTURE',                    '');
    probe := REPLACE(probe, 'V_ACCOUNT_ANCHORS_CORELOGIC_FIXTURE',           '');
    IF (CONTAINS(probe, 'CORELOGIC_PROPERTY') OR CONTAINS(probe, 'V_ACCOUNT_ANCHORS')) THEN
        RAISE live_target_survived;
    END IF;
    EXECUTE IMMEDIATE :sp_ddl;
    RETURN 'fixture SP staged';
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. CALL #1.
-- ---------------------------------------------------------------------------
CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_CORELOGIC_PROPERTY_FIXTURE();

-- ---------------------------------------------------------------------------
-- 6. Audience and coverage (10 audience-eligible PERSON anchors).
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(DISTINCT ACCOUNT_ID) FROM DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS_CORELOGIC_FIXTURE
      WHERE ACCOUNT_TYPE_FLAG = 'PERSON' AND POSTAL_CODE IS NOT NULL AND POSTAL_CODE <> '') =
    (SELECT COUNT(DISTINCT ACCOUNT_ID) FROM DATA_JEDAIS.FINS__PUBLIC.CORELOGIC_PROPERTY_FIXTURE)
    AS coverage_matches_audience;
-- Expected: TRUE

SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.CORELOGIC_PROPERTY_FIXTURE) = 10
    AS row_count_one_per_audience_account;
-- Expected: TRUE

SELECT NOT EXISTS (
    SELECT 1 FROM DATA_JEDAIS.FINS__PUBLIC.CORELOGIC_PROPERTY_FIXTURE
    WHERE ACCOUNT_ID IN ('CLP-FIX-P-11', 'CLP-FIX-P-12', 'CLP-FIX-B-01', 'CLP-FIX-B-02')
) AS zipless_person_and_business_excluded;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 7. Quarter bucketing, required columns, ORG_ID.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.CORELOGIC_PROPERTY_FIXTURE
      WHERE PROFILE_QUARTER <> DATE_TRUNC('quarter', CONVERT_TIMEZONE('UTC', CURRENT_TIMESTAMP())::DATE)
         OR GENERATED_AT    <> PROFILE_QUARTER::TIMESTAMP_NTZ) = 0
    AS profile_quarter_is_first_of_quarter;
-- Expected: TRUE

SELECT NOT EXISTS (
    SELECT 1 FROM DATA_JEDAIS.FINS__PUBLIC.CORELOGIC_PROPERTY_FIXTURE
    WHERE ACCOUNT_ID IS NULL
       OR PROFILE_QUARTER IS NULL
       OR IS_OWNER IS NULL
       OR LIEN_COUNT IS NULL
       OR FLOOD_ZONE_CODE IS NULL
       OR WILDFIRE_RISK_SCORE IS NULL
       OR GENERATED_AT IS NULL
       OR ORG_ID IS NULL
) AS required_columns_populated;
-- Expected: TRUE

SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.CORELOGIC_PROPERTY_FIXTURE f
       JOIN DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS_CORELOGIC_FIXTURE a ON a.ACCOUNT_ID = f.ACCOUNT_ID
      WHERE f.ORG_ID IS DISTINCT FROM a.ORG_ID) = 0
    AND (SELECT ORG_ID FROM DATA_JEDAIS.FINS__PUBLIC.CORELOGIC_PROPERTY_FIXTURE
          WHERE ACCOUNT_ID = 'CLP-FIX-P-03') = 'CLPTEST'
    AS org_id_stamped_from_anchor;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 8. Owner / renter shape. Both kinds must occur in the fixture output.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT_IF(IS_OWNER) FROM DATA_JEDAIS.FINS__PUBLIC.CORELOGIC_PROPERTY_FIXTURE) > 0
    AND (SELECT COUNT_IF(NOT IS_OWNER) FROM DATA_JEDAIS.FINS__PUBLIC.CORELOGIC_PROPERTY_FIXTURE) > 0
    AS owners_and_renters_both_present;
-- Expected: TRUE

SELECT NOT EXISTS (
    SELECT 1 FROM DATA_JEDAIS.FINS__PUBLIC.CORELOGIC_PROPERTY_FIXTURE
    WHERE IS_OWNER = FALSE
      AND (PRIMARY_PROPERTY_TYPE IS NOT NULL
        OR ESTIMATED_PROPERTY_VALUE IS NOT NULL
        OR OUTSTANDING_MORTGAGE_BALANCE IS NOT NULL
        OR LOAN_TO_VALUE_PCT IS NOT NULL
        OR EQUITY_USD IS NOT NULL
        OR MORTGAGE_RATE_PCT IS NOT NULL
        OR LAST_TRANSFER_YEAR IS NOT NULL
        OR HELOC_OPPORTUNITY_SCORE IS NOT NULL
        OR LIEN_COUNT <> 0)
) AS non_owner_shape_invariant;
-- Expected: TRUE

SELECT NOT EXISTS (
    SELECT 1 FROM DATA_JEDAIS.FINS__PUBLIC.CORELOGIC_PROPERTY_FIXTURE
    WHERE IS_OWNER = TRUE
      AND (PRIMARY_PROPERTY_TYPE IS NULL
        OR ESTIMATED_PROPERTY_VALUE IS NULL
        OR OUTSTANDING_MORTGAGE_BALANCE IS NULL
        OR EQUITY_USD IS NULL
        OR LAST_TRANSFER_YEAR IS NULL
        OR HELOC_OPPORTUNITY_SCORE IS NULL)
) AS owner_shape_invariant;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 9. Owner money invariants.
-- ---------------------------------------------------------------------------
SELECT NOT EXISTS (
    SELECT 1 FROM DATA_JEDAIS.FINS__PUBLIC.CORELOGIC_PROPERTY_FIXTURE
    WHERE IS_OWNER = TRUE
      AND (EQUITY_USD < 0
        OR EQUITY_USD <> ESTIMATED_PROPERTY_VALUE - OUTSTANDING_MORTGAGE_BALANCE
        OR ESTIMATED_PROPERTY_VALUE NOT BETWEEN 50000 AND 10000000)
) AS equity_invariant;
-- Expected: TRUE

-- Mortgage > 0: LTV in [0, 95] and a rate in the pre-2022 or post-2022 band.
-- Mortgage = 0 (paid off): LTV and rate both NULL.
SELECT NOT EXISTS (
    SELECT 1 FROM DATA_JEDAIS.FINS__PUBLIC.CORELOGIC_PROPERTY_FIXTURE
    WHERE IS_OWNER = TRUE
      AND ((OUTSTANDING_MORTGAGE_BALANCE > 0
            AND (LOAN_TO_VALUE_PCT IS NULL OR LOAN_TO_VALUE_PCT NOT BETWEEN 0 AND 95
                 OR MORTGAGE_RATE_PCT IS NULL
                 OR NOT (MORTGAGE_RATE_PCT BETWEEN 2.5 AND 4.75
                      OR MORTGAGE_RATE_PCT BETWEEN 6.0 AND 8.5)))
        OR (OUTSTANDING_MORTGAGE_BALANCE = 0
            AND (LOAN_TO_VALUE_PCT IS NOT NULL OR MORTGAGE_RATE_PCT IS NOT NULL)))
) AS ltv_and_rate_invariant;
-- Expected: TRUE

SELECT NOT EXISTS (
    SELECT 1 FROM DATA_JEDAIS.FINS__PUBLIC.CORELOGIC_PROPERTY_FIXTURE
    WHERE IS_OWNER = TRUE
      AND (HELOC_OPPORTUNITY_SCORE NOT BETWEEN 0 AND 100
        OR LAST_TRANSFER_YEAR NOT BETWEEN 1980 AND YEAR(CONVERT_TIMEZONE('UTC', CURRENT_TIMESTAMP())))
) AS heloc_and_transfer_year_in_range;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 10. Vocabularies and ranges.
-- ---------------------------------------------------------------------------
SELECT NOT EXISTS (
    SELECT 1 FROM DATA_JEDAIS.FINS__PUBLIC.CORELOGIC_PROPERTY_FIXTURE
    WHERE FLOOD_ZONE_CODE NOT IN ('X', 'B', 'C', 'AE', 'A', 'VE', 'V')
) AS flood_zone_canonical;
-- Expected: TRUE

SELECT NOT EXISTS (
    SELECT 1 FROM DATA_JEDAIS.FINS__PUBLIC.CORELOGIC_PROPERTY_FIXTURE
    WHERE WILDFIRE_RISK_SCORE NOT BETWEEN 0 AND 95
       OR LIEN_COUNT NOT BETWEEN 0 AND 5
) AS wildfire_and_lien_in_range;
-- Expected: TRUE

SELECT NOT EXISTS (
    SELECT 1 FROM DATA_JEDAIS.FINS__PUBLIC.CORELOGIC_PROPERTY_FIXTURE
    WHERE IS_OWNER = TRUE
      AND PRIMARY_PROPERTY_TYPE NOT IN
          ('Condo', 'Townhouse', 'Single Family', 'Multi-Family', 'Manufactured Home', 'Vacant Land')
) AS property_type_in_vocabulary;
-- Expected: TRUE

-- State bias: CA is a high-wildfire state (>= 50); NY / MA are low (<= 30).
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.CORELOGIC_PROPERTY_FIXTURE f
       JOIN DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS_CORELOGIC_FIXTURE a ON a.ACCOUNT_ID = f.ACCOUNT_ID
      WHERE (a.STATE_CODE = 'CA' AND f.WILDFIRE_RISK_SCORE < 50)
         OR (a.STATE_CODE IN ('NY', 'MA') AND f.WILDFIRE_RISK_SCORE > 30)) = 0
    AS wildfire_follows_state_bias;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 11. Same-quarter idempotency and determinism (CALL #2, CALL #3).
--     HASH_AGG skips NULL-only arguments, so the nullable columns are
--     COALESCEd to keep the hash sensitive to NULL vs value.
-- ---------------------------------------------------------------------------
SET row_count_before = (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.CORELOGIC_PROPERTY_FIXTURE);
SET hash_before = (
    SELECT HASH_AGG(ORG_ID, ACCOUNT_ID, PROFILE_QUARTER, IS_OWNER,
                    COALESCE(PRIMARY_PROPERTY_TYPE, '__NULL__'),
                    COALESCE(ESTIMATED_PROPERTY_VALUE::VARCHAR, '__NULL__'),
                    COALESCE(OUTSTANDING_MORTGAGE_BALANCE::VARCHAR, '__NULL__'),
                    COALESCE(LOAN_TO_VALUE_PCT::VARCHAR, '__NULL__'),
                    COALESCE(EQUITY_USD::VARCHAR, '__NULL__'),
                    COALESCE(MORTGAGE_RATE_PCT::VARCHAR, '__NULL__'),
                    LIEN_COUNT, FLOOD_ZONE_CODE, WILDFIRE_RISK_SCORE,
                    COALESCE(LAST_TRANSFER_YEAR::VARCHAR, '__NULL__'),
                    COALESCE(HELOC_OPPORTUNITY_SCORE::VARCHAR, '__NULL__'),
                    GENERATED_AT)::VARCHAR
    FROM DATA_JEDAIS.FINS__PUBLIC.CORELOGIC_PROPERTY_FIXTURE
);

CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_CORELOGIC_PROPERTY_FIXTURE();

SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.CORELOGIC_PROPERTY_FIXTURE) = $row_count_before
    AS idempotency_row_count_unchanged;
-- Expected: TRUE

SELECT
    (SELECT HASH_AGG(ORG_ID, ACCOUNT_ID, PROFILE_QUARTER, IS_OWNER,
                     COALESCE(PRIMARY_PROPERTY_TYPE, '__NULL__'),
                     COALESCE(ESTIMATED_PROPERTY_VALUE::VARCHAR, '__NULL__'),
                     COALESCE(OUTSTANDING_MORTGAGE_BALANCE::VARCHAR, '__NULL__'),
                     COALESCE(LOAN_TO_VALUE_PCT::VARCHAR, '__NULL__'),
                     COALESCE(EQUITY_USD::VARCHAR, '__NULL__'),
                     COALESCE(MORTGAGE_RATE_PCT::VARCHAR, '__NULL__'),
                     LIEN_COUNT, FLOOD_ZONE_CODE, WILDFIRE_RISK_SCORE,
                     COALESCE(LAST_TRANSFER_YEAR::VARCHAR, '__NULL__'),
                     COALESCE(HELOC_OPPORTUNITY_SCORE::VARCHAR, '__NULL__'),
                     GENERATED_AT)::VARCHAR
     FROM DATA_JEDAIS.FINS__PUBLIC.CORELOGIC_PROPERTY_FIXTURE) = $hash_before
    AS determinism_hash_unchanged;
-- Expected: TRUE

SELECT
    (SELECT COUNT(*) FROM (
        SELECT ORG_ID, ACCOUNT_ID, PROFILE_QUARTER
          FROM DATA_JEDAIS.FINS__PUBLIC.CORELOGIC_PROPERTY_FIXTURE
         GROUP BY 1, 2, 3 HAVING COUNT(*) > 1)) = 0
    AS one_row_per_account_per_quarter;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 12. Logging and live-table safety.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG
      WHERE TASK_NAME = 'TASK_QUARTERLY_CORELOGIC_PROPERTY_FIXTURE'
        AND STATUS = 'SUCCEEDED'
        AND ACCOUNTS_PROCESSED = 10) = 2
    AND (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG
          WHERE TASK_NAME = 'TASK_QUARTERLY_CORELOGIC_PROPERTY_FIXTURE'
            AND ROWS_INSERTED = 10) = 1  -- MERGE counts inserts: CALL #1 inserts 10, CALL #2 updates in place
    AS log_rows_succeeded_for_fixture_task;
-- Expected: TRUE

SELECT NOT EXISTS (
    SELECT 1 FROM DATA_JEDAIS.FINS__PUBLIC.CORELOGIC_PROPERTY
    WHERE ACCOUNT_ID LIKE 'CLP-FIX-%'
) AS no_fixture_rows_in_live_table;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 13. Cleanup.
-- ---------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_CORELOGIC_PROPERTY_FIXTURE();
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.CORELOGIC_PROPERTY_FIXTURE_STAGING;
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.CORELOGIC_PROPERTY_FIXTURE;
DROP VIEW      IF EXISTS DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS_CORELOGIC_FIXTURE;
DELETE FROM DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG WHERE TASK_NAME = 'TASK_QUARTERLY_CORELOGIC_PROPERTY_FIXTURE';
