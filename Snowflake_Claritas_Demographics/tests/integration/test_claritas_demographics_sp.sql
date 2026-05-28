-- =============================================================================
-- L2 integration test for SP_GENERATE_CLARITAS_DEMOGRAPHICS
-- =============================================================================
-- Plan:    docs/superpowers/plans/2026-05-28-cumulus-plan-1-claritas-demographics.md
-- Task:    Plan 1 T5
-- Run:     snow sql -c GSB13421 -f tests/integration/test_claritas_demographics_sp.sql
-- Pass:    Every assertion column returns TRUE. Any FALSE = test failure.
--
-- Pre-requisites (all one-time ops, NOT performed by this script):
--   1. CREATE SCHEMA FINS.TEST;                                                 -- ops
--   2. CREATE TABLE FINS.TEST.CLARITAS_DEMOGRAPHICS  (run schemas/claritas_demographics.sql
--      after rewriting the FQN from FINS.PUBLIC.CLARITAS_DEMOGRAPHICS to FINS.TEST.*).
--   3. CREATE TABLE FINS.TEST.TASK_EXECUTION_LOG (carbon copy of FINS.PUBLIC.TASK_EXECUTION_LOG).
--   4. SP_GENERATE_CLARITAS_DEMOGRAPHICS deployed into FINS.TEST.
--      NOTE: the SP body in procedures/sp_generate_claritas_demographics.py hardcodes
--      `FINS.PUBLIC.V_ACCOUNT_ANCHORS`, `FINS.PUBLIC.CLARITAS_DEMOGRAPHICS`, and
--      `FINS.PUBLIC.TASK_EXECUTION_LOG`. To run the SP in FINS.TEST against a fixture
--      audience, either:
--        (a) Parameterise those FQNs via env var or session.get_current_schema(); OR
--        (b) Build a separate `_test` build of the SP that points at FINS.TEST.* by
--            rewriting the constants at deploy-time.
--      Until one of those is done, this L2 file is the canonical acceptance contract
--      but cannot be executed against the live SP.
-- =============================================================================

USE SCHEMA FINS.TEST;

-- ---------------------------------------------------------------------------
-- 1. Materialize the L2 fixture audience (12 PERSON + 2 BUSINESS = 14 anchors).
-- ---------------------------------------------------------------------------
-- Coverage of the rowspec dimensions:
--   - 4 generations (Gen Z / Young / Mid / Retiree) via BIRTHDATE spread
--   - 3 income bands (<$50K / $50K-$250K / $250K+) via ANNUAL_INCOME spread
--   - Wealth Management + Retail CLIENT_CATEGORY mix
--   - With-ZIP and without-ZIP cases (urbanicity heuristic + fallback)
--   - 2 BUSINESS anchors so the audience-filter assertion has something to filter
--
-- Snowflake VALUES() can't construct mixed-type rows directly with NULL columns,
-- so this materializes via SELECT UNION ALL with explicit casts in the first row.
CREATE OR REPLACE TABLE FINS.TEST.TEST_V_ACCOUNT_ANCHORS_FIXTURE AS
SELECT
    'TEST-PERSON-01'::VARCHAR AS ACCOUNT_ID,
    'Avery Stone'::VARCHAR AS ACCOUNT_NAME,
    '2026-05-28'::DATE AS SNAPSHOT_DATE,
    'Retail'::VARCHAR AS CLIENT_CATEGORY,
    'PERSON'::VARCHAR AS ACCOUNT_TYPE_FLAG,
    '2002-03-14'::TIMESTAMP_LTZ AS BIRTHDATE,
    42000::NUMBER AS ANNUAL_INCOME,
    680::NUMBER AS CREDIT_SCORE,
    NULL::VARCHAR AS INDUSTRY,
    NULL::NUMBER AS ANNUAL_REVENUE,
    NULL::NUMBER AS EMPLOYEE_COUNT,
    '94110'::VARCHAR AS POSTAL_CODE,
    'CA'::VARCHAR AS STATE_CODE,
    'US'::VARCHAR AS COUNTRY_CODE,
    'HYDRATE-001'::VARCHAR AS EXTERNAL_ID
UNION ALL SELECT 'TEST-PERSON-02', 'Riley Tomas',     '2026-05-28'::DATE, 'Retail',            'PERSON', '1990-06-30'::TIMESTAMP_LTZ,  95000, 720, NULL, NULL, NULL, '60614', 'IL', 'US', 'HYDRATE-002'
UNION ALL SELECT 'TEST-PERSON-03', 'Casey Whitehall', '2026-05-28'::DATE, 'Retail',            'PERSON', '1988-11-12'::TIMESTAMP_LTZ, 110000, 745, NULL, NULL, NULL, '02134', 'MA', 'US', 'HYDRATE-003'
UNION ALL SELECT 'TEST-PERSON-04', 'Quinn Marlowe',   '2026-05-28'::DATE, 'Wealth Management', 'PERSON', '1972-04-08'::TIMESTAMP_LTZ, 285000, 770, NULL, NULL, NULL, '94027', 'CA', 'US', 'HYDRATE-004'
UNION ALL SELECT 'TEST-PERSON-05', 'Harper Vance',    '2026-05-28'::DATE, 'Wealth Management', 'PERSON', '1965-09-21'::TIMESTAMP_LTZ, 525000, 800, NULL, NULL, NULL, '10075', 'NY', 'US', 'HYDRATE-005'
UNION ALL SELECT 'TEST-PERSON-06', 'Sage Linder',     '2026-05-28'::DATE, 'Retail',            'PERSON', '2003-01-09'::TIMESTAMP_LTZ,  28000, 640, NULL, NULL, NULL, NULL,    NULL, 'US', 'HYDRATE-006'
UNION ALL SELECT 'TEST-PERSON-07', 'Morgan Davila',   '2026-05-28'::DATE, 'Retail',            'PERSON', '1998-07-15'::TIMESTAMP_LTZ,  38000, 660, NULL, NULL, NULL, '78704', 'TX', 'US', 'HYDRATE-007'
UNION ALL SELECT 'TEST-PERSON-08', 'Taylor Brooks',   '2026-05-28'::DATE, 'Retail',            'PERSON', '1985-02-22'::TIMESTAMP_LTZ,  75000, 700, NULL, NULL, NULL, '30309', 'GA', 'US', 'HYDRATE-008'
UNION ALL SELECT 'TEST-PERSON-09', 'Jordan Reeve',    '2026-05-28'::DATE, 'Retail',            'PERSON', '2001-08-22'::TIMESTAMP_LTZ,  38000, 660, NULL, NULL, NULL, '10025', 'NY', 'US', 'HYDRATE-009'
UNION ALL SELECT 'TEST-PERSON-10', 'Eden Sterling',   '2026-05-28'::DATE, 'Wealth Management', 'PERSON', '1958-12-03'::TIMESTAMP_LTZ, 425000, 785, NULL, NULL, NULL, '80211', 'CO', 'US', 'HYDRATE-010'
UNION ALL SELECT 'TEST-PERSON-11', 'Phoenix Ortega',  '2026-05-28'::DATE, 'Retail',            'PERSON', '2005-05-19'::TIMESTAMP_LTZ,  22000, 620, NULL, NULL, NULL, '11206', 'NY', 'US', 'HYDRATE-011'
UNION ALL SELECT 'TEST-PERSON-12', 'River Aldana',    '2026-05-28'::DATE, 'Wealth Management', 'PERSON', '1948-10-30'::TIMESTAMP_LTZ, 1800000, 815, NULL, NULL, NULL, '90210', 'CA', 'US', 'HYDRATE-012'
-- 2 BUSINESS anchors so the audience-filter is exercised
UNION ALL SELECT 'TEST-BIZ-01', 'Mariposa Cleaners LLC',         '2026-05-28'::DATE, 'Small Business',      'BUSINESS', NULL::TIMESTAMP_LTZ, NULL, NULL, 'Personal Services', 480000,    6, '94110', 'CA', 'US', 'HYDRATE-B-001'
UNION ALL SELECT 'TEST-BIZ-02', 'Northwood Manufacturing Inc.',  '2026-05-28'::DATE, 'Commercial Banking',  'BUSINESS', NULL::TIMESTAMP_LTZ, NULL, NULL, 'Manufacturing',     28000000, 240, '48226', 'MI', 'US', 'HYDRATE-B-002';

-- Override V_ACCOUNT_ANCHORS in this schema to point at the fixture.
-- (The SP must be deployed against THIS view — see header note about FQN hardcoding.)
CREATE OR REPLACE VIEW FINS.TEST.V_ACCOUNT_ANCHORS AS
    SELECT * FROM FINS.TEST.TEST_V_ACCOUNT_ANCHORS_FIXTURE;

-- ---------------------------------------------------------------------------
-- 2. Empty the dataset and log tables for a clean test run.
-- ---------------------------------------------------------------------------
DELETE FROM FINS.TEST.CLARITAS_DEMOGRAPHICS;
DELETE FROM FINS.TEST.TASK_EXECUTION_LOG WHERE TASK_NAME = 'TASK_MONTHLY_CLARITAS_DEMOGRAPHICS';

-- ---------------------------------------------------------------------------
-- 3. First run.
-- ---------------------------------------------------------------------------
CALL FINS.TEST.SP_GENERATE_CLARITAS_DEMOGRAPHICS();

-- ---------------------------------------------------------------------------
-- 4. Coverage assertion: distinct accounts in dataset == audience cardinality (12 PERSON).
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(DISTINCT ACCOUNT_ID) FROM FINS.TEST.V_ACCOUNT_ANCHORS WHERE ACCOUNT_TYPE_FLAG = 'PERSON') =
    (SELECT COUNT(DISTINCT ACCOUNT_ID) FROM FINS.TEST.CLARITAS_DEMOGRAPHICS)
    AS coverage_assertion_passes;
-- Expected: TRUE  (12 = 12)

-- ---------------------------------------------------------------------------
-- 5. Audience-filter assertion: BUSINESS anchors must NOT leak into the table.
-- ---------------------------------------------------------------------------
SELECT NOT EXISTS (
    SELECT 1 FROM FINS.TEST.CLARITAS_DEMOGRAPHICS
    WHERE ACCOUNT_ID LIKE 'TEST-BIZ-%'
) AS audience_filter_passes;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 6. Idempotency assertion: a second run leaves the row count unchanged.
-- ---------------------------------------------------------------------------
SET row_count_before = (SELECT COUNT(*) FROM FINS.TEST.CLARITAS_DEMOGRAPHICS);
CALL FINS.TEST.SP_GENERATE_CLARITAS_DEMOGRAPHICS();
SELECT
    (SELECT COUNT(*) FROM FINS.TEST.CLARITAS_DEMOGRAPHICS) = $row_count_before
    AS idempotency_assertion_passes;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 7. Determinism assertion: a re-run produces byte-equal rows.
-- The MERGE replaces, so row content must match the previous content exactly.
-- ---------------------------------------------------------------------------
SET hash_before = (
    SELECT HASH_AGG(ACCOUNT_ID, PROFILE_MONTH, PRIZM_SEGMENT_CODE, LIFE_STAGE,
                    HOUSEHOLD_COMPOSITION, ESTIMATED_NET_WORTH_BAND,
                    WEALTH_PROPENSITY_SCORE, INVESTMENT_PROPENSITY_SCORE,
                    MORTGAGE_PROPENSITY_SCORE, URBANICITY,
                    FINANCIAL_STRESS_INDICATOR, GENERATED_AT)
    FROM FINS.TEST.CLARITAS_DEMOGRAPHICS
);
CALL FINS.TEST.SP_GENERATE_CLARITAS_DEMOGRAPHICS();
SELECT
    (SELECT HASH_AGG(ACCOUNT_ID, PROFILE_MONTH, PRIZM_SEGMENT_CODE, LIFE_STAGE,
                     HOUSEHOLD_COMPOSITION, ESTIMATED_NET_WORTH_BAND,
                     WEALTH_PROPENSITY_SCORE, INVESTMENT_PROPENSITY_SCORE,
                     MORTGAGE_PROPENSITY_SCORE, URBANICITY,
                     FINANCIAL_STRESS_INDICATOR, GENERATED_AT)
     FROM FINS.TEST.CLARITAS_DEMOGRAPHICS) = $hash_before
    AS determinism_assertion_passes;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 8. Log-row assertion: at least one SUCCEEDED row exists for this task name.
-- ---------------------------------------------------------------------------
SELECT EXISTS (
    SELECT 1 FROM FINS.TEST.TASK_EXECUTION_LOG
    WHERE TASK_NAME = 'TASK_MONTHLY_CLARITAS_DEMOGRAPHICS'
      AND STATUS = 'SUCCEEDED'
) AS log_row_present;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 9. Output-shape assertion: every row has all 14 NOT NULL columns populated.
-- (The table NOT NULL constraint enforces this, but assert here for clarity.)
-- ---------------------------------------------------------------------------
SELECT NOT EXISTS (
    SELECT 1 FROM FINS.TEST.CLARITAS_DEMOGRAPHICS
    WHERE ACCOUNT_ID IS NULL
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
-- 10. Cleanup
-- ---------------------------------------------------------------------------
DELETE FROM FINS.TEST.CLARITAS_DEMOGRAPHICS;
DELETE FROM FINS.TEST.TASK_EXECUTION_LOG WHERE TASK_NAME = 'TASK_MONTHLY_CLARITAS_DEMOGRAPHICS';
DROP VIEW IF EXISTS FINS.TEST.V_ACCOUNT_ANCHORS;
DROP TABLE IF EXISTS FINS.TEST.TEST_V_ACCOUNT_ANCHORS_FIXTURE;
DROP TABLE IF EXISTS FINS.TEST.CLARITAS_DEMOGRAPHICS_STAGING;
