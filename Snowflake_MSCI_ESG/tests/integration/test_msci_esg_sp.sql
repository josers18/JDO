-- =============================================================================
-- L2 integration test for SP_GENERATE_MSCI_ESG_SCORES
-- =============================================================================
-- Plan:    docs/superpowers/plans/2026-05-28-cumulus-plan-2-msci-esg.md
-- Task:    Plan 2 T5
-- Run:     snow sql -c GSB13421 -f tests/integration/test_msci_esg_sp.sql
-- Pass:    Every assertion column returns TRUE. Any FALSE = test failure.
--
-- Pre-requisites (all one-time ops, NOT performed by this script):
--   1. CREATE SCHEMA FINS.TEST;                                                 -- ops
--   2. CREATE TABLE FINS.TEST.MSCI_ESG_SCORES (run schemas/msci_esg_scores.sql
--      after rewriting the FQN from DATA_JEDAIS.FINS__PUBLIC.MSCI_ESG_SCORES to FINS.TEST.*).
--   3. CREATE TABLE FINS.TEST.TASK_EXECUTION_LOG (carbon copy of DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG).
--   4. SP_GENERATE_MSCI_ESG_SCORES deployed into FINS.TEST.
--      NOTE: the SP body in procedures/sp_generate_msci_esg_scores.py hardcodes
--      `DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS`, `DATA_JEDAIS.FINS__PUBLIC.MSCI_ESG_SCORES`, and
--      `DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG`. To run the SP in FINS.TEST against a fixture
--      audience, either:
--        (a) Parameterise those FQNs via env var or session.get_current_schema(); OR
--        (b) Build a separate `_test` build of the SP that points at FINS.TEST.* by
--            rewriting the constants at deploy-time.
--      Until one of those is done, this L2 file is the canonical acceptance contract
--      but cannot be executed against the live SP.
-- =============================================================================

USE SCHEMA FINS.TEST;

-- ---------------------------------------------------------------------------
-- 1. Materialize the L2 fixture audience (12 BUSINESS + 2 PERSON = 14 anchors).
-- ---------------------------------------------------------------------------
-- Coverage of the rowspec dimensions:
--   - 9 industries (Construction, Finance, Food & Beverage, Healthcare,
--     Manufacturing, Personal Services, Real Estate, Retail, Tech)
--   - 3 revenue bands (<$1M / $1M-$100M / ≥$100M)
--   - Small Business + Commercial Banking CLIENT_CATEGORY mix
--   - 2 PERSON anchors so the audience-filter assertion has something to filter
--
-- Snowflake VALUES() can't construct mixed-type rows directly with NULL columns,
-- so this materializes via SELECT UNION ALL with explicit casts in the first row.
CREATE OR REPLACE TABLE FINS.TEST.TEST_V_ACCOUNT_ANCHORS_FIXTURE AS
SELECT
    'TEST-BIZ-01'::VARCHAR AS ACCOUNT_ID,
    'Mariposa Cleaners LLC'::VARCHAR AS ACCOUNT_NAME,
    '2026-05-28'::DATE AS SNAPSHOT_DATE,
    'Small Business'::VARCHAR AS CLIENT_CATEGORY,
    'BUSINESS'::VARCHAR AS ACCOUNT_TYPE_FLAG,
    NULL::TIMESTAMP_LTZ AS BIRTHDATE,
    NULL::NUMBER AS ANNUAL_INCOME,
    NULL::NUMBER AS CREDIT_SCORE,
    'Personal Services'::VARCHAR AS INDUSTRY,
    480000::NUMBER AS ANNUAL_REVENUE,
    6::NUMBER AS EMPLOYEE_COUNT,
    '94110'::VARCHAR AS POSTAL_CODE,
    'CA'::VARCHAR AS STATE_CODE,
    'US'::VARCHAR AS COUNTRY_CODE,
    'HYDRATE-B-001'::VARCHAR AS EXTERNAL_ID
UNION ALL SELECT 'TEST-BIZ-02', 'Pinewood Coffee Co.', '2026-05-28'::DATE, 'Small Business', 'BUSINESS', NULL::TIMESTAMP_LTZ, NULL, NULL, 'Food & Beverage', 1200000, 18, '98101', 'WA', 'US', 'HYDRATE-B-002'
UNION ALL SELECT 'TEST-BIZ-03', 'Northwood Manufacturing Inc.', '2026-05-28'::DATE, 'Commercial Banking', 'BUSINESS', NULL::TIMESTAMP_LTZ, NULL, NULL, 'Manufacturing', 28000000, 240, '48226', 'MI', 'US', 'HYDRATE-B-003'
UNION ALL SELECT 'TEST-BIZ-04', 'Granite Energy Partners', '2026-05-28'::DATE, 'Commercial Banking', 'BUSINESS', NULL::TIMESTAMP_LTZ, NULL, NULL, 'Energy', 145000000, 380, '77002', 'TX', 'US', 'HYDRATE-B-004'
UNION ALL SELECT 'TEST-BIZ-05', 'Atlas Tech Holdings', '2026-05-28'::DATE, 'Commercial Banking', 'BUSINESS', NULL::TIMESTAMP_LTZ, NULL, NULL, 'Tech', 320000000, 1450, '94105', 'CA', 'US', 'HYDRATE-B-005'
UNION ALL SELECT 'TEST-BIZ-06', 'Heritage Wealth Advisors', '2026-05-28'::DATE, 'Commercial Banking', 'BUSINESS', NULL::TIMESTAMP_LTZ, NULL, NULL, 'Finance', 45000000, 180, '60601', 'IL', 'US', 'HYDRATE-B-006'
UNION ALL SELECT 'TEST-BIZ-07', 'Cedar Healthcare Group', '2026-05-28'::DATE, 'Commercial Banking', 'BUSINESS', NULL::TIMESTAMP_LTZ, NULL, NULL, 'Healthcare', 88000000, 520, '02115', 'MA', 'US', 'HYDRATE-B-007'
UNION ALL SELECT 'TEST-BIZ-08', 'Sterling Real Estate Trust', '2026-05-28'::DATE, 'Commercial Banking', 'BUSINESS', NULL::TIMESTAMP_LTZ, NULL, NULL, 'Real Estate', 12000000, 32, '10017', 'NY', 'US', 'HYDRATE-B-008'
UNION ALL SELECT 'TEST-BIZ-09', 'Riverbend Construction LLC', '2026-05-28'::DATE, 'Small Business', 'BUSINESS', NULL::TIMESTAMP_LTZ, NULL, NULL, 'Construction', 4500000, 38, '85003', 'AZ', 'US', 'HYDRATE-B-009'
UNION ALL SELECT 'TEST-BIZ-10', 'Maplewood Retail Co.', '2026-05-28'::DATE, 'Small Business', 'BUSINESS', NULL::TIMESTAMP_LTZ, NULL, NULL, 'Retail', 2800000, 24, '30309', 'GA', 'US', 'HYDRATE-B-010'
UNION ALL SELECT 'TEST-BIZ-11', 'Cobalt Mining Corp', '2026-05-28'::DATE, 'Commercial Banking', 'BUSINESS', NULL::TIMESTAMP_LTZ, NULL, NULL, 'Mining', 220000000, 950, '80205', 'CO', 'US', 'HYDRATE-B-011'
UNION ALL SELECT 'TEST-BIZ-12', 'Aurora Software Inc.', '2026-05-28'::DATE, 'Small Business', 'BUSINESS', NULL::TIMESTAMP_LTZ, NULL, NULL, 'Software', 750000, 5, '78704', 'TX', 'US', 'HYDRATE-B-012'
-- 2 PERSON anchors so the audience-filter is exercised
UNION ALL SELECT 'TEST-PERSON-01', 'Avery Stone', '2026-05-28'::DATE, 'Retail', 'PERSON', '2002-03-14'::TIMESTAMP_LTZ, 42000, 680, NULL, NULL, NULL, '94110', 'CA', 'US', 'HYDRATE-001'
UNION ALL SELECT 'TEST-PERSON-02', 'Quinn Marlowe', '2026-05-28'::DATE, 'Wealth Management', 'PERSON', '1972-04-08'::TIMESTAMP_LTZ, 285000, 770, NULL, NULL, NULL, '94027', 'CA', 'US', 'HYDRATE-004';

-- Override V_ACCOUNT_ANCHORS in this schema to point at the fixture.
-- (The SP must be deployed against THIS view — see header note about FQN hardcoding.)
CREATE OR REPLACE VIEW FINS.TEST.V_ACCOUNT_ANCHORS AS
    SELECT * FROM FINS.TEST.TEST_V_ACCOUNT_ANCHORS_FIXTURE;

-- ---------------------------------------------------------------------------
-- 2. Empty the dataset and log tables for a clean test run.
-- ---------------------------------------------------------------------------
DELETE FROM FINS.TEST.MSCI_ESG_SCORES;
DELETE FROM FINS.TEST.TASK_EXECUTION_LOG WHERE TASK_NAME = 'TASK_MONTHLY_MSCI_ESG_SCORES';

-- ---------------------------------------------------------------------------
-- 3. First run.
-- ---------------------------------------------------------------------------
CALL FINS.TEST.SP_GENERATE_MSCI_ESG_SCORES();

-- ---------------------------------------------------------------------------
-- 4. Coverage assertion: distinct accounts in dataset == audience cardinality (12 BUSINESS).
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(DISTINCT ACCOUNT_ID) FROM FINS.TEST.V_ACCOUNT_ANCHORS WHERE ACCOUNT_TYPE_FLAG = 'BUSINESS') =
    (SELECT COUNT(DISTINCT ACCOUNT_ID) FROM FINS.TEST.MSCI_ESG_SCORES)
    AS coverage_assertion_passes;
-- Expected: TRUE  (12 = 12)

-- ---------------------------------------------------------------------------
-- 5. Audience-filter assertion: PERSON anchors must NOT leak into the table.
-- ---------------------------------------------------------------------------
SELECT NOT EXISTS (
    SELECT 1 FROM FINS.TEST.MSCI_ESG_SCORES
    WHERE ACCOUNT_ID LIKE 'TEST-PERSON-%'
) AS audience_filter_passes;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 6. Idempotency assertion: a second run leaves the row count unchanged.
-- ---------------------------------------------------------------------------
SET row_count_before = (SELECT COUNT(*) FROM FINS.TEST.MSCI_ESG_SCORES);
CALL FINS.TEST.SP_GENERATE_MSCI_ESG_SCORES();
SELECT
    (SELECT COUNT(*) FROM FINS.TEST.MSCI_ESG_SCORES) = $row_count_before
    AS idempotency_assertion_passes;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 7. Determinism assertion: a re-run produces byte-equal rows.
-- The MERGE replaces, so row content must match the previous content exactly.
-- ---------------------------------------------------------------------------
SET hash_before = (
    SELECT HASH_AGG(ACCOUNT_ID, PROFILE_MONTH, MSCI_ESG_RATING, INDUSTRY_CLASSIFICATION,
                    ESG_SCORE_OVERALL, ENVIRONMENTAL_SCORE, SOCIAL_SCORE, GOVERNANCE_SCORE,
                    CARBON_INTENSITY_TONS_PER_M_REVENUE,
                    CONTROVERSY_FLAG_COUNT, COALESCE(TOP_CONTROVERSY_CATEGORY, '__NULL__'),
                    MATERIALITY_TAGS, LAST_RATING_CHANGE_DIRECTION, GENERATED_AT)::VARCHAR
    FROM FINS.TEST.MSCI_ESG_SCORES
);
CALL FINS.TEST.SP_GENERATE_MSCI_ESG_SCORES();
SELECT
    (SELECT HASH_AGG(ACCOUNT_ID, PROFILE_MONTH, MSCI_ESG_RATING, INDUSTRY_CLASSIFICATION,
                     ESG_SCORE_OVERALL, ENVIRONMENTAL_SCORE, SOCIAL_SCORE, GOVERNANCE_SCORE,
                     CARBON_INTENSITY_TONS_PER_M_REVENUE,
                     CONTROVERSY_FLAG_COUNT, COALESCE(TOP_CONTROVERSY_CATEGORY, '__NULL__'),
                     MATERIALITY_TAGS, LAST_RATING_CHANGE_DIRECTION, GENERATED_AT)::VARCHAR
     FROM FINS.TEST.MSCI_ESG_SCORES) = $hash_before
    AS determinism_assertion_passes;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 8. Log-row assertion: at least one SUCCEEDED row exists for this task name.
-- ---------------------------------------------------------------------------
SELECT EXISTS (
    SELECT 1 FROM FINS.TEST.TASK_EXECUTION_LOG
    WHERE TASK_NAME = 'TASK_MONTHLY_MSCI_ESG_SCORES'
      AND STATUS = 'SUCCEEDED'
) AS log_row_present;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 9. Output-shape assertion: every row has all required NOT NULL columns populated.
-- (The table NOT NULL constraint enforces this, but assert here for clarity.)
-- All columns are NOT NULL except TOP_CONTROVERSY_CATEGORY.
-- ---------------------------------------------------------------------------
SELECT NOT EXISTS (
    SELECT 1 FROM FINS.TEST.MSCI_ESG_SCORES
    WHERE ACCOUNT_ID IS NULL
       OR PROFILE_MONTH IS NULL
       OR MSCI_ESG_RATING IS NULL
       OR INDUSTRY_CLASSIFICATION IS NULL
       OR ESG_SCORE_OVERALL IS NULL
       OR ENVIRONMENTAL_SCORE IS NULL
       OR SOCIAL_SCORE IS NULL
       OR GOVERNANCE_SCORE IS NULL
       OR CARBON_INTENSITY_TONS_PER_M_REVENUE IS NULL
       OR CONTROVERSY_FLAG_COUNT IS NULL
       OR MATERIALITY_TAGS IS NULL
       OR LAST_RATING_CHANGE_DIRECTION IS NULL
       OR GENERATED_AT IS NULL
) AS all_columns_populated;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 10. Industry-vs-environmental-score sanity: heavy industries (Energy, Mining,
-- Manufacturing) have lower mean E_score than clean industries (Tech, Software, Finance).
-- This exercises the industry classification logic end-to-end.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT AVG(ENVIRONMENTAL_SCORE) FROM FINS.TEST.MSCI_ESG_SCORES m
     JOIN FINS.TEST.V_ACCOUNT_ANCHORS a ON a.ACCOUNT_ID = m.ACCOUNT_ID
     WHERE a.INDUSTRY IN ('Energy', 'Mining', 'Manufacturing')) <
    (SELECT AVG(ENVIRONMENTAL_SCORE) FROM FINS.TEST.MSCI_ESG_SCORES m
     JOIN FINS.TEST.V_ACCOUNT_ANCHORS a ON a.ACCOUNT_ID = m.ACCOUNT_ID
     WHERE a.INDUSTRY IN ('Tech', 'Software', 'Finance'))
    AS industry_e_score_correlates;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 11. Controversy-null invariant: TOP_CONTROVERSY_CATEGORY is NULL iff
-- CONTROVERSY_FLAG_COUNT = 0 (data integrity safeguard).
-- ---------------------------------------------------------------------------
SELECT NOT EXISTS (
    SELECT 1 FROM FINS.TEST.MSCI_ESG_SCORES
    WHERE (CONTROVERSY_FLAG_COUNT = 0 AND TOP_CONTROVERSY_CATEGORY IS NOT NULL)
       OR (CONTROVERSY_FLAG_COUNT > 0 AND TOP_CONTROVERSY_CATEGORY IS NULL)
) AS controversy_null_invariant;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 12. Cleanup
-- ---------------------------------------------------------------------------
DELETE FROM FINS.TEST.MSCI_ESG_SCORES;
DELETE FROM FINS.TEST.TASK_EXECUTION_LOG WHERE TASK_NAME = 'TASK_MONTHLY_MSCI_ESG_SCORES';
DROP VIEW IF EXISTS FINS.TEST.V_ACCOUNT_ANCHORS;
DROP TABLE IF EXISTS FINS.TEST.TEST_V_ACCOUNT_ANCHORS_FIXTURE;
DROP TABLE IF EXISTS FINS.TEST.MSCI_ESG_SCORES_STAGING;
