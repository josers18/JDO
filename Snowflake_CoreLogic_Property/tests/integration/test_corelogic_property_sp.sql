-- =============================================================================
-- L2 integration test for SP_GENERATE_CORELOGIC_PROPERTY
-- =============================================================================
-- Plan:    docs/superpowers/plans/2026-05-28-cumulus-plan-5-corelogic-property.md
-- Task:    Plan 5 T5
-- Run:     snow sql -f tests/integration/test_corelogic_property_sp.sql
-- Pass:    Every assertion column returns TRUE. Any FALSE = test failure.
--
-- Pre-requisites (all one-time ops, NOT performed by this script):
--   1. CREATE SCHEMA FINS.TEST;                                                 -- ops
--   2. CREATE TABLE FINS.TEST.CORELOGIC_PROPERTY (run schemas/corelogic_property.sql
--      after rewriting the FQN from FINS.PUBLIC.CORELOGIC_PROPERTY to FINS.TEST.*).
--   3. CREATE TABLE FINS.TEST.TASK_EXECUTION_LOG (carbon copy of FINS.PUBLIC.TASK_EXECUTION_LOG).
--   4. SP_GENERATE_CORELOGIC_PROPERTY deployed into FINS.TEST.
--      NOTE: the SP body in procedures/sp_generate_corelogic_property.py hardcodes
--      `FINS.PUBLIC.V_ACCOUNT_ANCHORS`, `FINS.PUBLIC.CORELOGIC_PROPERTY`, and
--      `FINS.PUBLIC.TASK_EXECUTION_LOG`. To run the SP in FINS.TEST against a fixture
--      audience, either:
--        (a) Parameterise those FQNs via env var or session.get_current_schema(); OR
--        (b) Build a separate `_test` build of the SP that points at FINS.TEST.* by
--            rewriting the constants at deploy-time.
--      Until one of those is done, this L2 file is the canonical acceptance contract
--      but cannot be executed against the live SP.
--
-- Plan 5 differences from Plans 1-4:
--   - Audience is account-scoped PERSON-only, with v1.5 defensive POSTAL_CODE filter
--     (`POSTAL_CODE IS NOT NULL AND POSTAL_CODE <> ''`). Empty-string ZIP is filtered
--     out so the audience predicate is bytewise stable across re-runs.
--   - Cadence is QUARTERLY — PROFILE_QUARTER is bucketed to first-of-quarter. The
--     test re-runs are still within the same quarter so determinism holds.
--   - 8 NULLable property columns when IS_OWNER=false: PRIMARY_PROPERTY_TYPE,
--     ESTIMATED_PROPERTY_VALUE, OUTSTANDING_MORTGAGE_BALANCE, LOAN_TO_VALUE_PCT,
--     EQUITY_USD, MORTGAGE_RATE_PCT, LAST_TRANSFER_YEAR, HELOC_OPPORTUNITY_SCORE.
--     Determinism HASH_AGG MUST `COALESCE(field, '__NULL__')` these (also LTV when
--     mortgage=0). LIEN_COUNT is NOT NULL (defaults to 0 for non-owners) so no
--     COALESCE there.
--   - Fixture is 14 anchors (12 PERSON + 2 BUSINESS): 2 of the 12 PERSON anchors
--     have empty/NULL POSTAL_CODE so the audience-eligible PERSON count is 10.
--     The 2 BUSINESS anchors prove the PERSON filter; the 2 zip-less PERSONs prove
--     the v1.5 defensive ZIP filter.
-- =============================================================================

USE SCHEMA FINS.TEST;

-- ---------------------------------------------------------------------------
-- 1. Materialize the L2 fixture audience (12 PERSON + 2 BUSINESS = 14 anchors).
-- ---------------------------------------------------------------------------
-- Coverage of the rowspec dimensions:
--   - Generations: Gen Z (<30), Millennials (30-44), Gen X (45-59), Boomers (60+)
--     [4 cohorts]
--   - Income bands: <$50K, $50K-$150K, $150K-$250K, >=$250K [3+ bands]
--   - State risk profiles:
--       High-flood       : FL, LA  (high-flood weights via _flood_zone)
--       High-wildfire    : CA      (also a Mid-flood state)
--       Low both         : NY, MA  (Mid-flood, low wildfire)
--       Mid              : TX      (high-flood + mid-wildfire)
--   - Empty-ZIP and NULL-ZIP edge cases — must NOT appear in the dataset.
--   - 2 BUSINESS anchors — must NOT appear in the dataset (PERSON filter).
--
-- Required edge anchors:
--   - >=1 anchor age 65+ (likely owner)
--   - >=1 anchor age <30 (likely renter)
--   - >=1 anchor income >=$250K
--   - >=1 anchor income <$50K
--   - >=1 FL or LA anchor (high-flood)
--   - >=1 CA anchor (high-wildfire)
--   - >=1 NY or MA anchor (low-flood, low-wildfire)
--   - >=1 PERSON anchor with POSTAL_CODE = '' (empty string) — filtered out
--   - >=1 PERSON anchor with POSTAL_CODE = NULL — filtered out
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
    '2002-03-14'::TIMESTAMP_LTZ AS BIRTHDATE,    -- age ~24, Gen Z
    42000::NUMBER AS ANNUAL_INCOME,              -- low income (<$50K)
    680::NUMBER AS CREDIT_SCORE,
    NULL::VARCHAR AS INDUSTRY,
    NULL::NUMBER AS ANNUAL_REVENUE,
    NULL::NUMBER AS EMPLOYEE_COUNT,
    '94110'::VARCHAR AS POSTAL_CODE,             -- CA (high-wildfire, mid-flood)
    'CA'::VARCHAR AS STATE_CODE,
    'US'::VARCHAR AS COUNTRY_CODE,
    'HYDRATE-P-001'::VARCHAR AS EXTERNAL_ID
-- Gen Z, low income, FL (high-flood)
UNION ALL SELECT 'TEST-PERSON-02', 'Riley Park', '2026-05-28'::DATE, 'Retail', 'PERSON', '2003-08-22'::TIMESTAMP_LTZ, 38000, 670, NULL, NULL, NULL, '33101', 'FL', 'US', 'HYDRATE-P-002'
-- Millennial, mid income, NY (low-flood, low-wildfire)
UNION ALL SELECT 'TEST-PERSON-03', 'Casey Reed', '2026-05-28'::DATE, 'Retail', 'PERSON', '1990-11-05'::TIMESTAMP_LTZ, 95000, 720, NULL, NULL, NULL, '10025', 'NY', 'US', 'HYDRATE-P-003'
-- Millennial, high income, CA (high-wildfire)
UNION ALL SELECT 'TEST-PERSON-04', 'Quinn Marlowe', '2026-05-28'::DATE, 'Wealth Management', 'PERSON', '1988-04-08'::TIMESTAMP_LTZ, 285000, 770, NULL, NULL, NULL, '94027', 'CA', 'US', 'HYDRATE-P-004'
-- Gen X, mid income, MA (low-flood, low-wildfire)
UNION ALL SELECT 'TEST-PERSON-05', 'Jordan Vega', '2026-05-28'::DATE, 'Retail', 'PERSON', '1975-06-12'::TIMESTAMP_LTZ, 130000, 740, NULL, NULL, NULL, '02115', 'MA', 'US', 'HYDRATE-P-005'
-- Gen X, high income, LA (high-flood)
UNION ALL SELECT 'TEST-PERSON-06', 'Morgan Hayes', '2026-05-28'::DATE, 'Wealth Management', 'PERSON', '1972-09-30'::TIMESTAMP_LTZ, 310000, 780, NULL, NULL, NULL, '70112', 'LA', 'US', 'HYDRATE-P-006'
-- Boomer, mid income, TX (high-flood, mid-wildfire)
UNION ALL SELECT 'TEST-PERSON-07', 'Sam Walters', '2026-05-28'::DATE, 'Retail', 'PERSON', '1958-02-18'::TIMESTAMP_LTZ, 88000, 730, NULL, NULL, NULL, '77002', 'TX', 'US', 'HYDRATE-P-007'
-- Boomer (65+), high income, CA (high-wildfire)
UNION ALL SELECT 'TEST-PERSON-08', 'Pat Donovan', '2026-05-28'::DATE, 'Wealth Management', 'PERSON', '1955-12-03'::TIMESTAMP_LTZ, 265000, 790, NULL, NULL, NULL, '90001', 'CA', 'US', 'HYDRATE-P-008'
-- Millennial, low income, MA (low-flood, low-wildfire)
UNION ALL SELECT 'TEST-PERSON-09', 'Drew Mitchell', '2026-05-28'::DATE, 'Retail', 'PERSON', '1992-07-19'::TIMESTAMP_LTZ, 45000, 690, NULL, NULL, NULL, '02101', 'MA', 'US', 'HYDRATE-P-009'
-- Boomer, mid income, FL (high-flood)
UNION ALL SELECT 'TEST-PERSON-10', 'Alex Brennan', '2026-05-28'::DATE, 'Retail', 'PERSON', '1960-01-22'::TIMESTAMP_LTZ, 110000, 750, NULL, NULL, NULL, '33139', 'FL', 'US', 'HYDRATE-P-010'
-- Edge: PERSON with empty-string POSTAL_CODE — must be filtered out
UNION ALL SELECT 'TEST-PERSON-11-EMPTYZIP', 'Edge EmptyZip', '2026-05-28'::DATE, 'Retail', 'PERSON', '1985-05-05'::TIMESTAMP_LTZ, 75000, 700, NULL, NULL, NULL, '', 'CA', 'US', 'HYDRATE-P-011'
-- Edge: PERSON with NULL POSTAL_CODE — must be filtered out
UNION ALL SELECT 'TEST-PERSON-12-NULLZIP', 'Edge NullZip', '2026-05-28'::DATE, 'Retail', 'PERSON', '1980-10-10'::TIMESTAMP_LTZ, 82000, 710, NULL, NULL, NULL, NULL, 'CA', 'US', 'HYDRATE-P-012'
-- Edge: BUSINESS anchor — must be filtered out (audience is PERSON-only)
UNION ALL SELECT 'TEST-BIZ-01', 'Mariposa Cleaners LLC', '2026-05-28'::DATE, 'Small Business', 'BUSINESS', NULL::TIMESTAMP_LTZ, NULL, NULL, 'Personal Services', 480000, 6, '94110', 'CA', 'US', 'HYDRATE-B-001'
-- Edge: BUSINESS anchor — must be filtered out (audience is PERSON-only)
UNION ALL SELECT 'TEST-BIZ-02', 'Pinewood Coffee Co.', '2026-05-28'::DATE, 'Small Business', 'BUSINESS', NULL::TIMESTAMP_LTZ, NULL, NULL, 'Food & Beverage', 1200000, 18, '98101', 'WA', 'US', 'HYDRATE-B-002';

-- Override V_ACCOUNT_ANCHORS in this schema to point at the fixture.
-- (The SP must be deployed against THIS view — see header note about FQN hardcoding.)
CREATE OR REPLACE VIEW FINS.TEST.V_ACCOUNT_ANCHORS AS
    SELECT * FROM FINS.TEST.TEST_V_ACCOUNT_ANCHORS_FIXTURE;

-- ---------------------------------------------------------------------------
-- 2. Empty the dataset and log tables for a clean test run.
-- ---------------------------------------------------------------------------
DELETE FROM FINS.TEST.CORELOGIC_PROPERTY;
DELETE FROM FINS.TEST.TASK_EXECUTION_LOG WHERE TASK_NAME = 'TASK_QUARTERLY_CORELOGIC_PROPERTY';

-- ---------------------------------------------------------------------------
-- 3. First run.
-- ---------------------------------------------------------------------------
CALL FINS.TEST.SP_GENERATE_CORELOGIC_PROPERTY();

-- ---------------------------------------------------------------------------
-- 4. Coverage assertion #1: distinct ACCOUNT_ID in dataset == audience size.
-- Audience size = 10 (12 PERSON anchors minus 2 with empty/NULL POSTAL_CODE).
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(DISTINCT ACCOUNT_ID) FROM FINS.TEST.V_ACCOUNT_ANCHORS
     WHERE ACCOUNT_TYPE_FLAG = 'PERSON'
       AND POSTAL_CODE IS NOT NULL
       AND POSTAL_CODE <> '') =
    (SELECT COUNT(DISTINCT ACCOUNT_ID) FROM FINS.TEST.CORELOGIC_PROPERTY)
    AS coverage_assertion_passes;
-- Expected: TRUE  (10 = 10)

-- ---------------------------------------------------------------------------
-- 5. Row-count assertion #2: COUNT(*) == 10 (one row per audience-eligible PERSON).
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM FINS.TEST.CORELOGIC_PROPERTY) = 10
    AS row_count_assertion_passes;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 6. Audience-filter assertion #3: PERSON-without-ZIP and BUSINESS anchors must
-- NOT leak into the dataset.
-- ---------------------------------------------------------------------------
SELECT NOT EXISTS (
    SELECT 1 FROM FINS.TEST.CORELOGIC_PROPERTY
    WHERE ACCOUNT_ID IN (
        'TEST-PERSON-11-EMPTYZIP',
        'TEST-PERSON-12-NULLZIP',
        'TEST-BIZ-01',
        'TEST-BIZ-02'
    )
) AS audience_filter_passes;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 7. Idempotency assertion #4: a second run leaves the row count unchanged.
-- ---------------------------------------------------------------------------
SET row_count_before = (SELECT COUNT(*) FROM FINS.TEST.CORELOGIC_PROPERTY);
CALL FINS.TEST.SP_GENERATE_CORELOGIC_PROPERTY();
SELECT
    (SELECT COUNT(*) FROM FINS.TEST.CORELOGIC_PROPERTY) = $row_count_before
    AS idempotency_assertion_passes;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 8. Determinism assertion #5: a re-run produces byte-equal rows.
-- The MERGE replaces, so row content must match the previous content exactly.
-- HASH_AGG of NULL is NULL, so wrap the 8 NULLable columns with
-- COALESCE(..., '__NULL__') to keep the hash stable.
--   NULLable when IS_OWNER=false: PRIMARY_PROPERTY_TYPE, ESTIMATED_PROPERTY_VALUE,
--     OUTSTANDING_MORTGAGE_BALANCE, LOAN_TO_VALUE_PCT, EQUITY_USD,
--     MORTGAGE_RATE_PCT, LAST_TRANSFER_YEAR, HELOC_OPPORTUNITY_SCORE
--   LOAN_TO_VALUE_PCT and MORTGAGE_RATE_PCT are also NULLable when mortgage=0.
-- LIEN_COUNT is NOT NULL (defaults to 0) so it does not need COALESCE.
-- ---------------------------------------------------------------------------
SET hash_before = (
    SELECT HASH_AGG(ACCOUNT_ID, PROFILE_QUARTER, IS_OWNER,
                    COALESCE(PRIMARY_PROPERTY_TYPE, '__NULL__'),
                    COALESCE(ESTIMATED_PROPERTY_VALUE::VARCHAR, '__NULL__'),
                    COALESCE(OUTSTANDING_MORTGAGE_BALANCE::VARCHAR, '__NULL__'),
                    COALESCE(LOAN_TO_VALUE_PCT::VARCHAR, '__NULL__'),
                    COALESCE(EQUITY_USD::VARCHAR, '__NULL__'),
                    COALESCE(MORTGAGE_RATE_PCT::VARCHAR, '__NULL__'),
                    LIEN_COUNT,
                    FLOOD_ZONE_CODE,
                    WILDFIRE_RISK_SCORE,
                    COALESCE(LAST_TRANSFER_YEAR::VARCHAR, '__NULL__'),
                    COALESCE(HELOC_OPPORTUNITY_SCORE::VARCHAR, '__NULL__'),
                    GENERATED_AT)::VARCHAR
    FROM FINS.TEST.CORELOGIC_PROPERTY
);
CALL FINS.TEST.SP_GENERATE_CORELOGIC_PROPERTY();
SELECT
    (SELECT HASH_AGG(ACCOUNT_ID, PROFILE_QUARTER, IS_OWNER,
                     COALESCE(PRIMARY_PROPERTY_TYPE, '__NULL__'),
                     COALESCE(ESTIMATED_PROPERTY_VALUE::VARCHAR, '__NULL__'),
                     COALESCE(OUTSTANDING_MORTGAGE_BALANCE::VARCHAR, '__NULL__'),
                     COALESCE(LOAN_TO_VALUE_PCT::VARCHAR, '__NULL__'),
                     COALESCE(EQUITY_USD::VARCHAR, '__NULL__'),
                     COALESCE(MORTGAGE_RATE_PCT::VARCHAR, '__NULL__'),
                     LIEN_COUNT,
                     FLOOD_ZONE_CODE,
                     WILDFIRE_RISK_SCORE,
                     COALESCE(LAST_TRANSFER_YEAR::VARCHAR, '__NULL__'),
                     COALESCE(HELOC_OPPORTUNITY_SCORE::VARCHAR, '__NULL__'),
                     GENERATED_AT)::VARCHAR
     FROM FINS.TEST.CORELOGIC_PROPERTY) = $hash_before
    AS determinism_assertion_passes;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 9. Log-row assertion #6: at least one SUCCEEDED row exists for this task name.
-- ---------------------------------------------------------------------------
SELECT EXISTS (
    SELECT 1 FROM FINS.TEST.TASK_EXECUTION_LOG
    WHERE TASK_NAME = 'TASK_QUARTERLY_CORELOGIC_PROPERTY'
      AND STATUS = 'SUCCEEDED'
) AS log_row_present;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 10. Required-columns assertion #7: every NOT NULL column populated.
-- 7 NOT NULL columns: ACCOUNT_ID, PROFILE_QUARTER, IS_OWNER, LIEN_COUNT,
-- FLOOD_ZONE_CODE, WILDFIRE_RISK_SCORE, GENERATED_AT.
-- (The table NOT NULL constraint enforces this, but assert here for clarity.)
-- ---------------------------------------------------------------------------
SELECT NOT EXISTS (
    SELECT 1 FROM FINS.TEST.CORELOGIC_PROPERTY
    WHERE ACCOUNT_ID IS NULL
       OR PROFILE_QUARTER IS NULL
       OR IS_OWNER IS NULL
       OR LIEN_COUNT IS NULL
       OR FLOOD_ZONE_CODE IS NULL
       OR WILDFIRE_RISK_SCORE IS NULL
       OR GENERATED_AT IS NULL
) AS required_columns_populated;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 11. Non-owner shape invariant #8: rows with IS_OWNER=false have all 8 NULLable
-- property columns NULL AND LIEN_COUNT=0.
-- ---------------------------------------------------------------------------
SELECT NOT EXISTS (
    SELECT 1 FROM FINS.TEST.CORELOGIC_PROPERTY
    WHERE IS_OWNER = FALSE
      AND (
          PRIMARY_PROPERTY_TYPE IS NOT NULL
          OR ESTIMATED_PROPERTY_VALUE IS NOT NULL
          OR OUTSTANDING_MORTGAGE_BALANCE IS NOT NULL
          OR LOAN_TO_VALUE_PCT IS NOT NULL
          OR EQUITY_USD IS NOT NULL
          OR MORTGAGE_RATE_PCT IS NOT NULL
          OR LAST_TRANSFER_YEAR IS NOT NULL
          OR HELOC_OPPORTUNITY_SCORE IS NOT NULL
          OR LIEN_COUNT <> 0
      )
) AS non_owner_shape_invariant;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 12. Owner shape invariant #9: rows with IS_OWNER=true have PRIMARY_PROPERTY_TYPE,
-- ESTIMATED_PROPERTY_VALUE, and EQUITY_USD all non-NULL.
-- (LOAN_TO_VALUE_PCT, OUTSTANDING_MORTGAGE_BALANCE, MORTGAGE_RATE_PCT can still
-- be NULL/0 for paid-off owners; LAST_TRANSFER_YEAR and HELOC_OPPORTUNITY_SCORE
-- are always populated for owners per the SP.)
-- ---------------------------------------------------------------------------
SELECT NOT EXISTS (
    SELECT 1 FROM FINS.TEST.CORELOGIC_PROPERTY
    WHERE IS_OWNER = TRUE
      AND (
          PRIMARY_PROPERTY_TYPE IS NULL
          OR ESTIMATED_PROPERTY_VALUE IS NULL
          OR EQUITY_USD IS NULL
      )
) AS owner_shape_invariant;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 13. Equity invariant #10: EQUITY_USD = ESTIMATED_PROPERTY_VALUE -
-- OUTSTANDING_MORTGAGE_BALANCE for IS_OWNER=true rows; never negative.
-- ---------------------------------------------------------------------------
SELECT NOT EXISTS (
    SELECT 1 FROM FINS.TEST.CORELOGIC_PROPERTY
    WHERE IS_OWNER = TRUE
      AND (
          EQUITY_USD < 0
          OR EQUITY_USD <> ESTIMATED_PROPERTY_VALUE - COALESCE(OUTSTANDING_MORTGAGE_BALANCE, 0)
      )
) AS equity_invariant;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 14. LTV invariant #11: when IS_OWNER=true AND OUTSTANDING_MORTGAGE_BALANCE > 0,
-- LOAN_TO_VALUE_PCT BETWEEN 0 AND 95.
-- ---------------------------------------------------------------------------
SELECT NOT EXISTS (
    SELECT 1 FROM FINS.TEST.CORELOGIC_PROPERTY
    WHERE IS_OWNER = TRUE
      AND OUTSTANDING_MORTGAGE_BALANCE > 0
      AND (LOAN_TO_VALUE_PCT IS NULL OR LOAN_TO_VALUE_PCT NOT BETWEEN 0 AND 95)
) AS ltv_invariant;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 15. Flood-zone canonical assertion #12: every FLOOD_ZONE_CODE is a FEMA-canonical
-- code from the 7-value pool.
-- ---------------------------------------------------------------------------
SELECT NOT EXISTS (
    SELECT 1 FROM FINS.TEST.CORELOGIC_PROPERTY
    WHERE FLOOD_ZONE_CODE NOT IN ('X', 'B', 'C', 'AE', 'A', 'VE', 'V')
) AS flood_zone_canonical;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 16. Cleanup
-- ---------------------------------------------------------------------------
DELETE FROM FINS.TEST.CORELOGIC_PROPERTY;
DELETE FROM FINS.TEST.TASK_EXECUTION_LOG WHERE TASK_NAME = 'TASK_QUARTERLY_CORELOGIC_PROPERTY';
DROP VIEW IF EXISTS FINS.TEST.V_ACCOUNT_ANCHORS;
DROP TABLE IF EXISTS FINS.TEST.TEST_V_ACCOUNT_ANCHORS_FIXTURE;
DROP TABLE IF EXISTS FINS.TEST.CORELOGIC_PROPERTY_STAGING;
