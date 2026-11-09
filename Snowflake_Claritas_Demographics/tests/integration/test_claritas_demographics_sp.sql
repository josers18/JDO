-- =============================================================================
-- L2 integration test for SP_GENERATE_CLARITAS_DEMOGRAPHICS
-- =============================================================================
-- Plan:    docs/superpowers/plans/2026-05-28-cumulus-plan-1-claritas-demographics.md
-- Run:     snow sql -c SFDC_DC_TECH_ARCH_jwt --role ACCOUNTADMIN \
--            -f tests/integration/test_claritas_demographics_sp.sql
--          (ACCOUNTADMIN: the cloned SP is EXECUTE AS OWNER and write_pandas
--          creates its staging table, which needs CREATE TABLE.)
-- Pass:    Every assertion column returns TRUE. Any FALSE = test failure.
--
-- Strategy:
--   Clone the deployed SP into SP_GENERATE_CLARITAS_DEMOGRAPHICS_FIXTURE via
--   GET_DDL + REPLACE, redirecting the dataset table, staging table, task-log
--   name and V_ACCOUNT_ANCHORS to fixture-scoped names, then CALL it against
--   a 15-anchor fixture view (12 PERSON + 3 BUSINESS).
--   Sentinels avoid substring collisions: CLARITAS_DEMOGRAPHICS is a stem of
--   the SP, task and staging names, so those are parked first and expanded
--   after the table swap. The cloned SP writes only to
--   CLARITAS_DEMOGRAPHICS_FIXTURE, CLARITAS_DEMOGRAPHICS_FIXTURE_STAGING and
--   TASK_EXECUTION_LOG (rows named TASK_MONTHLY_CLARITAS_DEMOGRAPHICS_FIXTURE);
--   it reads only V_ACCOUNT_ANCHORS_CLARITAS_FIXTURE. Step 5 asserts no live
--   write target survives in the staged DDL's text before the first CALL.
--
-- What it covers (audience since 2026-10-24: PERSON, plus BUSINESS anchors with
-- a CLIENT_CATEGORY and an ACCOUNT_ID starting 001):
--   - Audience: 12 PERSON + 1 qualifying 001 BUSINESS enter (13 accounts);
--     a non-001 BUSINESS and a 001 BUSINESS with NULL CLIENT_CATEGORY stay out.
--   - One row per account, PROFILE_MONTH = first of the current UTC month,
--     15 columns NOT NULL, ORG_ID stamped from the anchor (TST vs JDO).
--   - Vocabularies and ranges: life stage, household, net worth band,
--     urbanicity, stress, PRIZM code, scores in [0, 100].
--   - Signals: Gen Z birthdate -> Gen Z; 78-year-old Wealth client -> Retirees
--     with a retiree PRIZM group; Wealth Management never below $250K-$1M;
--     business principals are aged 34-72 (never Gen Z).
--   - Same-month idempotency: a second CALL leaves the row count and
--     HASH_AGG unchanged (GENERATED_AT is month-bucketed).
--   - Log row: SUCCEEDED with ACCOUNTS_PROCESSED = 13.
--
-- Pre-requisites:
--   SP_GENERATE_CLARITAS_DEMOGRAPHICS deployed (python3 scripts/deploy_sp.py).
-- Side effects:
--   Fixture runs log to TASK_EXECUTION_LOG as
--   TASK_MONTHLY_CLARITAS_DEMOGRAPHICS_FIXTURE; the cleanup step deletes those
--   rows and drops every *_FIXTURE object. No live table is written.
-- =============================================================================

USE SCHEMA DATA_JEDAIS.FINS__PUBLIC;

-- ---------------------------------------------------------------------------
-- 1. Drop leftovers from a prior failed run.
-- ---------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_CLARITAS_DEMOGRAPHICS_FIXTURE();
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.CLARITAS_DEMOGRAPHICS_FIXTURE_STAGING;
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.CLARITAS_DEMOGRAPHICS_FIXTURE;
DROP VIEW      IF EXISTS DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS_CLARITAS_FIXTURE;
DELETE FROM DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG
 WHERE TASK_NAME = 'TASK_MONTHLY_CLARITAS_DEMOGRAPHICS_FIXTURE';

-- ---------------------------------------------------------------------------
-- 2. Fixture audience view, in the live V_ACCOUNT_ANCHORS column order.
--    P-01..P-12 PERSON (legacy TEST-PERSON-01..12 intent): 4 generations via
--    BIRTHDATE, 3 income bands, Retail/Wealth mix, one without a ZIP (P-06),
--    one stamped ORG_ID 'TST' (P-11, Gen Z).
--    BUSINESS: B-01 qualifies (001 id + category); B-02 has a non-001 id and
--    B-03 has a 001 id but NULL CLIENT_CATEGORY, so both are filtered out.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS_CLARITAS_FIXTURE AS
SELECT
    'JDO'::VARCHAR                   AS ORG_ID,
    'CLR-FIX-P-01'::VARCHAR          AS ACCOUNT_ID,
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
    'EXT-CLR-P-01'::VARCHAR          AS EXTERNAL_ID
UNION ALL SELECT 'JDO','CLR-FIX-P-02','Riley Tomas',     '2026-11-01','Retail',            'PERSON','1990-06-30'::TIMESTAMP_LTZ,  95000,720,NULL,NULL,NULL,'60614','IL','US','EXT-CLR-P-02'
UNION ALL SELECT 'JDO','CLR-FIX-P-03','Casey Whitehall', '2026-11-01','Retail',            'PERSON','1988-11-12'::TIMESTAMP_LTZ, 110000,745,NULL,NULL,NULL,'02134','MA','US','EXT-CLR-P-03'
UNION ALL SELECT 'JDO','CLR-FIX-P-04','Quinn Marlowe',   '2026-11-01','Wealth Management', 'PERSON','1972-04-08'::TIMESTAMP_LTZ, 285000,770,NULL,NULL,NULL,'94027','CA','US','EXT-CLR-P-04'
UNION ALL SELECT 'JDO','CLR-FIX-P-05','Harper Vance',    '2026-11-01','Wealth Management', 'PERSON','1965-09-21'::TIMESTAMP_LTZ, 525000,800,NULL,NULL,NULL,'10075','NY','US','EXT-CLR-P-05'
UNION ALL SELECT 'JDO','CLR-FIX-P-06','Sage Linder',     '2026-11-01','Retail',            'PERSON','2003-01-09'::TIMESTAMP_LTZ,  28000,640,NULL,NULL,NULL,NULL,   NULL,'US','EXT-CLR-P-06'
UNION ALL SELECT 'JDO','CLR-FIX-P-07','Morgan Davila',   '2026-11-01','Retail',            'PERSON','1998-07-15'::TIMESTAMP_LTZ,  38000,660,NULL,NULL,NULL,'78704','TX','US','EXT-CLR-P-07'
UNION ALL SELECT 'JDO','CLR-FIX-P-08','Taylor Brooks',   '2026-11-01','Retail',            'PERSON','1985-02-22'::TIMESTAMP_LTZ,  75000,700,NULL,NULL,NULL,'30309','GA','US','EXT-CLR-P-08'
UNION ALL SELECT 'JDO','CLR-FIX-P-09','Jordan Reeve',    '2026-11-01','Retail',            'PERSON','2001-08-22'::TIMESTAMP_LTZ,  38000,660,NULL,NULL,NULL,'10025','NY','US','EXT-CLR-P-09'
UNION ALL SELECT 'JDO','CLR-FIX-P-10','Eden Sterling',   '2026-11-01','Wealth Management', 'PERSON','1958-12-03'::TIMESTAMP_LTZ, 425000,785,NULL,NULL,NULL,'80211','CO','US','EXT-CLR-P-10'
UNION ALL SELECT 'TST','CLR-FIX-P-11','Phoenix Ortega',  '2026-11-01','Retail',            'PERSON','2005-05-19'::TIMESTAMP_LTZ,  22000,620,NULL,NULL,NULL,'11206','NY','US','EXT-CLR-P-11'
UNION ALL SELECT 'JDO','CLR-FIX-P-12','River Aldana',    '2026-11-01','Wealth Management', 'PERSON','1948-10-30'::TIMESTAMP_LTZ,1800000,815,NULL,NULL,NULL,'90210','CA','US','EXT-CLR-P-12'
UNION ALL SELECT 'JDO','001CLRFIX00000B1','Mariposa Cleaners LLC',        '2026-11-01','Small Business',    'BUSINESS',NULL,NULL,NULL,'Personal Services',480000,6,'94110','CA','US','EXT-CLR-B-01'
UNION ALL SELECT 'JDO','CLR-FIX-B-02',     'Northwood Manufacturing Inc.','2026-11-01','Commercial Banking','BUSINESS',NULL,NULL,NULL,'Manufacturing',28000000,240,'48226','MI','US','EXT-CLR-B-02'
UNION ALL SELECT 'JDO','001CLRFIX00000B3','Shell Holdings (no category)', '2026-11-01',NULL,               'BUSINESS',NULL,NULL,NULL,'Holding',NULL,NULL,'10001','NY','US','EXT-CLR-B-03';

-- ---------------------------------------------------------------------------
-- 3. Fixture target table: same DDL as CLARITAS_DEMOGRAPHICS.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE TABLE DATA_JEDAIS.FINS__PUBLIC.CLARITAS_DEMOGRAPHICS_FIXTURE
LIKE DATA_JEDAIS.FINS__PUBLIC.CLARITAS_DEMOGRAPHICS;

-- ---------------------------------------------------------------------------
-- 4. Clone the SP. The live SP takes no arguments.
-- ---------------------------------------------------------------------------
EXECUTE IMMEDIATE $$
DECLARE
    sp_ddl STRING;
BEGIN
    sp_ddl := (SELECT GET_DDL('PROCEDURE', 'DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_CLARITAS_DEMOGRAPHICS()'));
    -- Park the identifiers that contain CLARITAS_DEMOGRAPHICS as a stem.
    sp_ddl := REPLACE(sp_ddl, 'CLARITAS_DEMOGRAPHICS_STAGING',     '__CLR_STG__');
    sp_ddl := REPLACE(sp_ddl, 'SP_GENERATE_CLARITAS_DEMOGRAPHICS', '__CLR_SP__');
    sp_ddl := REPLACE(sp_ddl, 'TASK_MONTHLY_CLARITAS_DEMOGRAPHICS','__CLR_TASK__');
    -- The dataset table name is now unambiguous.
    sp_ddl := REPLACE(sp_ddl, 'CLARITAS_DEMOGRAPHICS',             'CLARITAS_DEMOGRAPHICS_FIXTURE');
    -- Expand the sentinels to fixture names.
    sp_ddl := REPLACE(sp_ddl, '__CLR_STG__',                       'CLARITAS_DEMOGRAPHICS_FIXTURE_STAGING');
    sp_ddl := REPLACE(sp_ddl, '__CLR_SP__',                        'SP_GENERATE_CLARITAS_DEMOGRAPHICS_FIXTURE');
    sp_ddl := REPLACE(sp_ddl, '__CLR_TASK__',                      'TASK_MONTHLY_CLARITAS_DEMOGRAPHICS_FIXTURE');
    -- Redirect the audience and coverage SQL to the fixture view.
    sp_ddl := REPLACE(sp_ddl, 'V_ACCOUNT_ANCHORS',                 'V_ACCOUNT_ANCHORS_CLARITAS_FIXTURE');
    -- Safety gate: abort before creating the SP if any live identifier survives.
    IF (CONTAINS(REPLACE(REPLACE(REPLACE(sp_ddl,
            'CLARITAS_DEMOGRAPHICS_FIXTURE_STAGING', ''),
            'CLARITAS_DEMOGRAPHICS_FIXTURE', ''),
            'V_ACCOUNT_ANCHORS_CLARITAS_FIXTURE', ''), 'CLARITAS_DEMOGRAPHICS')
        OR CONTAINS(REPLACE(sp_ddl, 'V_ACCOUNT_ANCHORS_CLARITAS_FIXTURE', ''), 'V_ACCOUNT_ANCHORS')
        OR CONTAINS(REPLACE(sp_ddl, 'TASK_MONTHLY_CLARITAS_DEMOGRAPHICS_FIXTURE', ''), 'TASK_MONTHLY_CLARITAS')) THEN
        RETURN 'ABORT: a live identifier survived the REPLACEs';
    END IF;
    EXECUTE IMMEDIATE :sp_ddl;
    RETURN 'fixture SP staged';
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Safety assertion: the fixture SP exists and its text names no live
--    dataset/staging/anchor identifier (only *_FIXTURE forms).
-- ---------------------------------------------------------------------------
SELECT
    COUNT(*) = 1
    AND MIN(IFF(
        NOT CONTAINS(REPLACE(REPLACE(REPLACE(DDL,
            'CLARITAS_DEMOGRAPHICS_FIXTURE_STAGING', ''),
            'CLARITAS_DEMOGRAPHICS_FIXTURE', ''),
            'V_ACCOUNT_ANCHORS_CLARITAS_FIXTURE', ''), 'CLARITAS_DEMOGRAPHICS')
        AND NOT CONTAINS(REPLACE(DDL, 'V_ACCOUNT_ANCHORS_CLARITAS_FIXTURE', ''), 'V_ACCOUNT_ANCHORS')
        AND CONTAINS(DDL, 'DATA_JEDAIS.FINS__PUBLIC.CLARITAS_DEMOGRAPHICS_FIXTURE'),
        1, 0)) = 1
    AS fixture_sp_has_no_live_write_target
FROM (
    SELECT GET_DDL('PROCEDURE',
        'DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_CLARITAS_DEMOGRAPHICS_FIXTURE()') AS DDL
);
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 6. CALL #1.
-- ---------------------------------------------------------------------------
CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_CLARITAS_DEMOGRAPHICS_FIXTURE();

-- ---------------------------------------------------------------------------
-- 7. Audience and coverage.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(DISTINCT ACCOUNT_ID) FROM DATA_JEDAIS.FINS__PUBLIC.CLARITAS_DEMOGRAPHICS_FIXTURE) = 13
    AS distinct_accounts_13;
-- Expected: TRUE

SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.CLARITAS_DEMOGRAPHICS_FIXTURE) = 13
    AS row_count_one_per_account;
-- Expected: TRUE

SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.CLARITAS_DEMOGRAPHICS_FIXTURE
      WHERE ACCOUNT_ID LIKE 'CLR-FIX-P-%') = 12
    AND (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.CLARITAS_DEMOGRAPHICS_FIXTURE
      WHERE ACCOUNT_ID = '001CLRFIX00000B1') = 1
    AS all_persons_and_qualifying_business_present;
-- Expected: TRUE

SELECT NOT EXISTS (
    SELECT 1 FROM DATA_JEDAIS.FINS__PUBLIC.CLARITAS_DEMOGRAPHICS_FIXTURE
    WHERE ACCOUNT_ID IN ('CLR-FIX-B-02', '001CLRFIX00000B3')
) AS non_qualifying_business_filtered;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 8. PROFILE_MONTH, ORG_ID stamping, NOT NULL shape.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(DISTINCT PROFILE_MONTH) FROM DATA_JEDAIS.FINS__PUBLIC.CLARITAS_DEMOGRAPHICS_FIXTURE) = 1
    AND (SELECT MIN(PROFILE_MONTH) FROM DATA_JEDAIS.FINS__PUBLIC.CLARITAS_DEMOGRAPHICS_FIXTURE)
        = DATE_TRUNC('MONTH', CONVERT_TIMEZONE('UTC', CURRENT_TIMESTAMP())::DATE)
    AS profile_month_is_current_utc_month;
-- Expected: TRUE

SELECT
    (SELECT ORG_ID FROM DATA_JEDAIS.FINS__PUBLIC.CLARITAS_DEMOGRAPHICS_FIXTURE
      WHERE ACCOUNT_ID = 'CLR-FIX-P-11') = 'TST'
    AND (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.CLARITAS_DEMOGRAPHICS_FIXTURE
          WHERE ORG_ID = 'JDO') = 12
    AS org_id_stamped_from_anchor;
-- Expected: TRUE

SELECT NOT EXISTS (
    SELECT 1 FROM DATA_JEDAIS.FINS__PUBLIC.CLARITAS_DEMOGRAPHICS_FIXTURE
    WHERE ORG_ID IS NULL
       OR ACCOUNT_ID IS NULL
       OR PROFILE_MONTH IS NULL
       OR PRIZM_SEGMENT_CODE IS NULL
       OR PRIZM_SEGMENT_NAME IS NULL
       OR PRIZM_LIFESTYLE_GROUP IS NULL
       OR LIFE_STAGE IS NULL
       OR HOUSEHOLD_COMPOSITION IS NULL
       OR ESTIMATED_NET_WORTH_BAND IS NULL
       OR WEALTH_PROPENSITY_SCORE IS NULL
       OR INVESTMENT_PROPENSITY_SCORE IS NULL
       OR MORTGAGE_PROPENSITY_SCORE IS NULL
       OR URBANICITY IS NULL
       OR FINANCIAL_STRESS_INDICATOR IS NULL
       OR GENERATED_AT IS NULL
) AS all_columns_populated;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 9. Vocabularies and ranges.
-- ---------------------------------------------------------------------------
SELECT NOT EXISTS (
    SELECT 1 FROM DATA_JEDAIS.FINS__PUBLIC.CLARITAS_DEMOGRAPHICS_FIXTURE
    WHERE LIFE_STAGE NOT IN ('Gen Z','Young Singles','Young Couples','Young Families',
                             'Established Families','Empty Nesters','Retirees')
       OR HOUSEHOLD_COMPOSITION NOT IN ('Single','Roommates','Couple','Family with Children','Multi-Generational')
       OR ESTIMATED_NET_WORTH_BAND NOT IN ('<$50K','$50K-$250K','$250K-$1M','$1M-$5M','$5M+')
       OR URBANICITY NOT IN ('Urban','Suburban','Town','Rural')
       OR FINANCIAL_STRESS_INDICATOR NOT IN ('Low','Moderate','High')
       OR PRIZM_SEGMENT_CODE NOT IN ('UC','MB','MS','YA','PP','BB','CR','CD','MT','SS','HR','FS')
) AS vocabularies_valid;
-- Expected: TRUE

SELECT NOT EXISTS (
    SELECT 1 FROM DATA_JEDAIS.FINS__PUBLIC.CLARITAS_DEMOGRAPHICS_FIXTURE
    WHERE WEALTH_PROPENSITY_SCORE     NOT BETWEEN 0 AND 100
       OR INVESTMENT_PROPENSITY_SCORE NOT BETWEEN 0 AND 100
       OR MORTGAGE_PROPENSITY_SCORE   NOT BETWEEN 0 AND 100
) AS scores_in_0_100;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 10. Signals.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT LIFE_STAGE FROM DATA_JEDAIS.FINS__PUBLIC.CLARITAS_DEMOGRAPHICS_FIXTURE
      WHERE ACCOUNT_ID = 'CLR-FIX-P-11') = 'Gen Z'
    AND (SELECT LIFE_STAGE FROM DATA_JEDAIS.FINS__PUBLIC.CLARITAS_DEMOGRAPHICS_FIXTURE
      WHERE ACCOUNT_ID = 'CLR-FIX-P-12') = 'Retirees'
    AS birthdate_drives_life_stage;
-- Expected: TRUE

SELECT
    (SELECT PRIZM_LIFESTYLE_GROUP FROM DATA_JEDAIS.FINS__PUBLIC.CLARITAS_DEMOGRAPHICS_FIXTURE
      WHERE ACCOUNT_ID = 'CLR-FIX-P-12')
        IN ('Affluent Empty Nests','Empty Nesters','Retirees','Town/Rural Families')
    AS retiree_gets_retiree_prizm_group;
-- Expected: TRUE

SELECT NOT EXISTS (
    SELECT 1 FROM DATA_JEDAIS.FINS__PUBLIC.CLARITAS_DEMOGRAPHICS_FIXTURE
    WHERE ACCOUNT_ID IN ('CLR-FIX-P-04','CLR-FIX-P-05','CLR-FIX-P-10','CLR-FIX-P-12')
      AND ESTIMATED_NET_WORTH_BAND IN ('<$50K','$50K-$250K')
) AS wealth_management_net_worth_floor;
-- Expected: TRUE

SELECT
    (SELECT LIFE_STAGE FROM DATA_JEDAIS.FINS__PUBLIC.CLARITAS_DEMOGRAPHICS_FIXTURE
      WHERE ACCOUNT_ID = '001CLRFIX00000B1') <> 'Gen Z'
    AS business_principal_aged_34_plus;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 11. Idempotency: a second same-month CALL leaves the row count unchanged.
-- ---------------------------------------------------------------------------
SET row_count_before = (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.CLARITAS_DEMOGRAPHICS_FIXTURE);
SET hash_before = (
    SELECT HASH_AGG(ORG_ID, ACCOUNT_ID, PROFILE_MONTH, PRIZM_SEGMENT_CODE, LIFE_STAGE,
                    HOUSEHOLD_COMPOSITION, ESTIMATED_NET_WORTH_BAND,
                    WEALTH_PROPENSITY_SCORE, INVESTMENT_PROPENSITY_SCORE,
                    MORTGAGE_PROPENSITY_SCORE, URBANICITY,
                    FINANCIAL_STRESS_INDICATOR, GENERATED_AT)
    FROM DATA_JEDAIS.FINS__PUBLIC.CLARITAS_DEMOGRAPHICS_FIXTURE
);
CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_CLARITAS_DEMOGRAPHICS_FIXTURE();
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.CLARITAS_DEMOGRAPHICS_FIXTURE) = $row_count_before
    AS idempotency_assertion_passes;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 12. Determinism: the re-run content is byte-equal (GENERATED_AT is bucketed
--     to the month start, so the MERGE rewrites identical values).
-- ---------------------------------------------------------------------------
SELECT
    (SELECT HASH_AGG(ORG_ID, ACCOUNT_ID, PROFILE_MONTH, PRIZM_SEGMENT_CODE, LIFE_STAGE,
                     HOUSEHOLD_COMPOSITION, ESTIMATED_NET_WORTH_BAND,
                     WEALTH_PROPENSITY_SCORE, INVESTMENT_PROPENSITY_SCORE,
                     MORTGAGE_PROPENSITY_SCORE, URBANICITY,
                     FINANCIAL_STRESS_INDICATOR, GENERATED_AT)
     FROM DATA_JEDAIS.FINS__PUBLIC.CLARITAS_DEMOGRAPHICS_FIXTURE) = $hash_before
    AS determinism_assertion_passes;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 13. Log rows: both CALLs logged SUCCEEDED with 13 accounts processed.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG
      WHERE TASK_NAME = 'TASK_MONTHLY_CLARITAS_DEMOGRAPHICS_FIXTURE'
        AND STATUS = 'SUCCEEDED' AND ACCOUNTS_PROCESSED = 13) = 2
    AS log_rows_succeeded_13_accounts;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 14. Cleanup.
-- ---------------------------------------------------------------------------
DELETE FROM DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG
 WHERE TASK_NAME = 'TASK_MONTHLY_CLARITAS_DEMOGRAPHICS_FIXTURE';
DROP PROCEDURE IF EXISTS DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_CLARITAS_DEMOGRAPHICS_FIXTURE();
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.CLARITAS_DEMOGRAPHICS_FIXTURE_STAGING;
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.CLARITAS_DEMOGRAPHICS_FIXTURE;
DROP VIEW      IF EXISTS DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS_CLARITAS_FIXTURE;
