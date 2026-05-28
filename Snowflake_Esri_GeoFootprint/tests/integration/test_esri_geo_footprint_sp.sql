-- =============================================================================
-- L2 integration test for SP_GENERATE_ESRI_GEO_FOOTPRINT
-- =============================================================================
-- Plan:    docs/superpowers/plans/2026-05-28-cumulus-plan-4-esri-geo-footprint.md
-- Task:    Plan 4 T5
-- Run:     snow sql -f tests/integration/test_esri_geo_footprint_sp.sql
-- Pass:    Every assertion column returns TRUE. Any FALSE = test failure.
--
-- Pre-requisites (all one-time ops, NOT performed by this script):
--   1. CREATE SCHEMA FINS.TEST;                                                 -- ops
--   2. CREATE TABLE FINS.TEST.ESRI_GEO_FOOTPRINT (run schemas/esri_geo_footprint.sql
--      after rewriting the FQN from FINS.PUBLIC.ESRI_GEO_FOOTPRINT to FINS.TEST.*).
--   3. CREATE TABLE FINS.TEST.TASK_EXECUTION_LOG (carbon copy of FINS.PUBLIC.TASK_EXECUTION_LOG).
--   4. SP_GENERATE_ESRI_GEO_FOOTPRINT deployed into FINS.TEST.
--      NOTE: the SP body in procedures/sp_generate_esri_geo_footprint.py hardcodes
--      `FINS.PUBLIC.V_ACCOUNT_ANCHORS`, `FINS.PUBLIC.ESRI_GEO_FOOTPRINT`, and
--      `FINS.PUBLIC.TASK_EXECUTION_LOG`. To run the SP in FINS.TEST against a fixture
--      audience, either:
--        (a) Parameterise those FQNs via env var or session.get_current_schema(); OR
--        (b) Build a separate `_test` build of the SP that points at FINS.TEST.* by
--            rewriting the constants at deploy-time.
--      Until one of those is done, this L2 file is the canonical acceptance contract
--      but cannot be executed against the live SP.
--
-- Plan 4 differences from Plans 1-3:
--   - Audience is BRANCH-scoped (one row per distinct ZIP), not account-scoped.
--   - Fixture has ~10 distinct ZIPs across 4 states, urbanicity-mixed.
--   - Coverage assertion uses ZIP cardinality, not account cardinality.
--   - Per-row factory invocation is once per distinct ZIP (NOT once per anchor).
--   - All 15 columns are NOT NULL — no COALESCE needed in the determinism HASH_AGG.
-- =============================================================================

USE SCHEMA FINS.TEST;

-- ---------------------------------------------------------------------------
-- 1. Materialize the L2 fixture audience (29 anchors across 10 distinct ZIPs).
-- ---------------------------------------------------------------------------
-- Coverage of the rowspec dimensions:
--   - 4 urbanicity tiers via STATE_CODE + ZIP-first-digit overrides:
--       Urban Core (forced): NY/CA/MA/IL — ZIPs 10025, 94110, 02134, 60614
--       Suburban           : NJ/GA       — ZIPs 07030, 30309
--       Small Town         : TX/AZ       — ZIPs 78704, 85003
--       Rural   (forced)   : MT/WY       — ZIPs 59001, 83001
--   - Multiple anchors per ZIP so the audience GROUP BY actually aggregates:
--       10025 = 5, 94110 = 8, 02134 = 3, 60614 = 4
--       07030 = 2, 30309 = 2
--       78704 = 2, 85003 = 1
--       59001 = 1, 83001 = 1
--     Total = 29 anchors, 10 distinct ZIPs.
--
-- Snowflake VALUES() can't construct mixed-type rows directly with NULL columns,
-- so this materializes via SELECT UNION ALL with explicit casts in the first row.
-- Anchor rows are heterogeneous (BUSINESS + PERSON) — Plan 4's audience SQL doesn't
-- filter by ACCOUNT_TYPE_FLAG; ZIP aggregation is universal.
CREATE OR REPLACE TABLE FINS.TEST.TEST_V_ACCOUNT_ANCHORS_FIXTURE AS
SELECT
    'TEST-NY-01'::VARCHAR AS ACCOUNT_ID,
    'NY Customer 1'::VARCHAR AS ACCOUNT_NAME,
    '2026-05-28'::DATE AS SNAPSHOT_DATE,
    'Retail'::VARCHAR AS CLIENT_CATEGORY,
    'PERSON'::VARCHAR AS ACCOUNT_TYPE_FLAG,
    NULL::TIMESTAMP_LTZ AS BIRTHDATE,
    NULL::NUMBER AS ANNUAL_INCOME,
    NULL::NUMBER AS CREDIT_SCORE,
    NULL::VARCHAR AS INDUSTRY,
    NULL::NUMBER AS ANNUAL_REVENUE,
    NULL::NUMBER AS EMPLOYEE_COUNT,
    '10025'::VARCHAR AS POSTAL_CODE,
    'NY'::VARCHAR AS STATE_CODE,
    'US'::VARCHAR AS COUNTRY_CODE,
    'HYDRATE-NY-01'::VARCHAR AS EXTERNAL_ID
-- Urban Core: 10025 (NY) — 5 anchors
UNION ALL SELECT 'TEST-NY-02', 'NY Customer 2', '2026-05-28'::DATE, 'Retail', 'PERSON', NULL::TIMESTAMP_LTZ, NULL, NULL, NULL, NULL, NULL, '10025', 'NY', 'US', 'HYDRATE-NY-02'
UNION ALL SELECT 'TEST-NY-03', 'NY Customer 3', '2026-05-28'::DATE, 'Retail', 'PERSON', NULL::TIMESTAMP_LTZ, NULL, NULL, NULL, NULL, NULL, '10025', 'NY', 'US', 'HYDRATE-NY-03'
UNION ALL SELECT 'TEST-NY-04', 'NY Customer 4', '2026-05-28'::DATE, 'Retail', 'PERSON', NULL::TIMESTAMP_LTZ, NULL, NULL, NULL, NULL, NULL, '10025', 'NY', 'US', 'HYDRATE-NY-04'
UNION ALL SELECT 'TEST-NY-05', 'NY Customer 5', '2026-05-28'::DATE, 'Retail', 'PERSON', NULL::TIMESTAMP_LTZ, NULL, NULL, NULL, NULL, NULL, '10025', 'NY', 'US', 'HYDRATE-NY-05'
-- Urban Core: 94110 (CA) — 8 anchors
UNION ALL SELECT 'TEST-CA-01', 'CA Customer 1', '2026-05-28'::DATE, 'Retail', 'PERSON', NULL::TIMESTAMP_LTZ, NULL, NULL, NULL, NULL, NULL, '94110', 'CA', 'US', 'HYDRATE-CA-01'
UNION ALL SELECT 'TEST-CA-02', 'CA Customer 2', '2026-05-28'::DATE, 'Retail', 'PERSON', NULL::TIMESTAMP_LTZ, NULL, NULL, NULL, NULL, NULL, '94110', 'CA', 'US', 'HYDRATE-CA-02'
UNION ALL SELECT 'TEST-CA-03', 'CA Customer 3', '2026-05-28'::DATE, 'Retail', 'PERSON', NULL::TIMESTAMP_LTZ, NULL, NULL, NULL, NULL, NULL, '94110', 'CA', 'US', 'HYDRATE-CA-03'
UNION ALL SELECT 'TEST-CA-04', 'CA Customer 4', '2026-05-28'::DATE, 'Retail', 'PERSON', NULL::TIMESTAMP_LTZ, NULL, NULL, NULL, NULL, NULL, '94110', 'CA', 'US', 'HYDRATE-CA-04'
UNION ALL SELECT 'TEST-CA-05', 'CA Customer 5', '2026-05-28'::DATE, 'Retail', 'PERSON', NULL::TIMESTAMP_LTZ, NULL, NULL, NULL, NULL, NULL, '94110', 'CA', 'US', 'HYDRATE-CA-05'
UNION ALL SELECT 'TEST-CA-06', 'CA Customer 6', '2026-05-28'::DATE, 'Retail', 'PERSON', NULL::TIMESTAMP_LTZ, NULL, NULL, NULL, NULL, NULL, '94110', 'CA', 'US', 'HYDRATE-CA-06'
UNION ALL SELECT 'TEST-CA-07', 'CA Customer 7', '2026-05-28'::DATE, 'Retail', 'PERSON', NULL::TIMESTAMP_LTZ, NULL, NULL, NULL, NULL, NULL, '94110', 'CA', 'US', 'HYDRATE-CA-07'
UNION ALL SELECT 'TEST-CA-08', 'CA Customer 8', '2026-05-28'::DATE, 'Retail', 'PERSON', NULL::TIMESTAMP_LTZ, NULL, NULL, NULL, NULL, NULL, '94110', 'CA', 'US', 'HYDRATE-CA-08'
-- Urban Core: 02134 (MA) — 3 anchors
UNION ALL SELECT 'TEST-MA-01', 'MA Customer 1', '2026-05-28'::DATE, 'Retail', 'PERSON', NULL::TIMESTAMP_LTZ, NULL, NULL, NULL, NULL, NULL, '02134', 'MA', 'US', 'HYDRATE-MA-01'
UNION ALL SELECT 'TEST-MA-02', 'MA Customer 2', '2026-05-28'::DATE, 'Retail', 'PERSON', NULL::TIMESTAMP_LTZ, NULL, NULL, NULL, NULL, NULL, '02134', 'MA', 'US', 'HYDRATE-MA-02'
UNION ALL SELECT 'TEST-MA-03', 'MA Customer 3', '2026-05-28'::DATE, 'Retail', 'PERSON', NULL::TIMESTAMP_LTZ, NULL, NULL, NULL, NULL, NULL, '02134', 'MA', 'US', 'HYDRATE-MA-03'
-- Urban Core: 60614 (IL) — 4 anchors
UNION ALL SELECT 'TEST-IL-01', 'IL Customer 1', '2026-05-28'::DATE, 'Retail', 'PERSON', NULL::TIMESTAMP_LTZ, NULL, NULL, NULL, NULL, NULL, '60614', 'IL', 'US', 'HYDRATE-IL-01'
UNION ALL SELECT 'TEST-IL-02', 'IL Customer 2', '2026-05-28'::DATE, 'Retail', 'PERSON', NULL::TIMESTAMP_LTZ, NULL, NULL, NULL, NULL, NULL, '60614', 'IL', 'US', 'HYDRATE-IL-02'
UNION ALL SELECT 'TEST-IL-03', 'IL Customer 3', '2026-05-28'::DATE, 'Retail', 'PERSON', NULL::TIMESTAMP_LTZ, NULL, NULL, NULL, NULL, NULL, '60614', 'IL', 'US', 'HYDRATE-IL-03'
UNION ALL SELECT 'TEST-IL-04', 'IL Customer 4', '2026-05-28'::DATE, 'Retail', 'PERSON', NULL::TIMESTAMP_LTZ, NULL, NULL, NULL, NULL, NULL, '60614', 'IL', 'US', 'HYDRATE-IL-04'
-- Suburban: 07030 (NJ) — 2 anchors
UNION ALL SELECT 'TEST-NJ-01', 'NJ Customer 1', '2026-05-28'::DATE, 'Retail', 'PERSON', NULL::TIMESTAMP_LTZ, NULL, NULL, NULL, NULL, NULL, '07030', 'NJ', 'US', 'HYDRATE-NJ-01'
UNION ALL SELECT 'TEST-NJ-02', 'NJ Customer 2', '2026-05-28'::DATE, 'Retail', 'PERSON', NULL::TIMESTAMP_LTZ, NULL, NULL, NULL, NULL, NULL, '07030', 'NJ', 'US', 'HYDRATE-NJ-02'
-- Suburban: 30309 (GA) — 2 anchors
UNION ALL SELECT 'TEST-GA-01', 'GA Customer 1', '2026-05-28'::DATE, 'Retail', 'PERSON', NULL::TIMESTAMP_LTZ, NULL, NULL, NULL, NULL, NULL, '30309', 'GA', 'US', 'HYDRATE-GA-01'
UNION ALL SELECT 'TEST-GA-02', 'GA Customer 2', '2026-05-28'::DATE, 'Retail', 'PERSON', NULL::TIMESTAMP_LTZ, NULL, NULL, NULL, NULL, NULL, '30309', 'GA', 'US', 'HYDRATE-GA-02'
-- Small Town: 78704 (TX) — 2 anchors
UNION ALL SELECT 'TEST-TX-01', 'TX Customer 1', '2026-05-28'::DATE, 'Retail', 'PERSON', NULL::TIMESTAMP_LTZ, NULL, NULL, NULL, NULL, NULL, '78704', 'TX', 'US', 'HYDRATE-TX-01'
UNION ALL SELECT 'TEST-TX-02', 'TX Customer 2', '2026-05-28'::DATE, 'Retail', 'PERSON', NULL::TIMESTAMP_LTZ, NULL, NULL, NULL, NULL, NULL, '78704', 'TX', 'US', 'HYDRATE-TX-02'
-- Small Town: 85003 (AZ) — 1 anchor
UNION ALL SELECT 'TEST-AZ-01', 'AZ Customer 1', '2026-05-28'::DATE, 'Retail', 'PERSON', NULL::TIMESTAMP_LTZ, NULL, NULL, NULL, NULL, NULL, '85003', 'AZ', 'US', 'HYDRATE-AZ-01'
-- Rural: 59001 (MT) — 1 anchor
UNION ALL SELECT 'TEST-MT-01', 'MT Customer 1', '2026-05-28'::DATE, 'Retail', 'PERSON', NULL::TIMESTAMP_LTZ, NULL, NULL, NULL, NULL, NULL, '59001', 'MT', 'US', 'HYDRATE-MT-01'
-- Rural: 83001 (WY) — 1 anchor
UNION ALL SELECT 'TEST-WY-01', 'WY Customer 1', '2026-05-28'::DATE, 'Retail', 'PERSON', NULL::TIMESTAMP_LTZ, NULL, NULL, NULL, NULL, NULL, '83001', 'WY', 'US', 'HYDRATE-WY-01';

-- Override V_ACCOUNT_ANCHORS in this schema to point at the fixture.
-- (The SP must be deployed against THIS view — see header note about FQN hardcoding.)
CREATE OR REPLACE VIEW FINS.TEST.V_ACCOUNT_ANCHORS AS
    SELECT * FROM FINS.TEST.TEST_V_ACCOUNT_ANCHORS_FIXTURE;

-- ---------------------------------------------------------------------------
-- 2. Empty the dataset and log tables for a clean test run.
-- ---------------------------------------------------------------------------
DELETE FROM FINS.TEST.ESRI_GEO_FOOTPRINT;
DELETE FROM FINS.TEST.TASK_EXECUTION_LOG WHERE TASK_NAME = 'TASK_MONTHLY_ESRI_GEO_FOOTPRINT';

-- ---------------------------------------------------------------------------
-- 3. First run.
-- ---------------------------------------------------------------------------
CALL FINS.TEST.SP_GENERATE_ESRI_GEO_FOOTPRINT();

-- ---------------------------------------------------------------------------
-- 4. Coverage assertion #1: distinct ZIPs in dataset == distinct ZIPs in audience.
-- Plan 4 uses ZIP cardinality, NOT account cardinality (Plans 1-3 used the latter).
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(DISTINCT POSTAL_CODE) FROM FINS.TEST.V_ACCOUNT_ANCHORS WHERE POSTAL_CODE IS NOT NULL) =
    (SELECT COUNT(DISTINCT BRANCH_ZIP) FROM FINS.TEST.ESRI_GEO_FOOTPRINT)
    AS coverage_assertion_passes;
-- Expected: TRUE  (10 = 10)

-- ---------------------------------------------------------------------------
-- 5. Row-count assertion #2: exactly 10 rows (one per distinct ZIP).
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM FINS.TEST.ESRI_GEO_FOOTPRINT) = 10
    AS row_count_assertion_passes;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 6. Idempotency assertion #3: a second run leaves the row count unchanged.
-- ---------------------------------------------------------------------------
SET row_count_before = (SELECT COUNT(*) FROM FINS.TEST.ESRI_GEO_FOOTPRINT);
CALL FINS.TEST.SP_GENERATE_ESRI_GEO_FOOTPRINT();
SELECT
    (SELECT COUNT(*) FROM FINS.TEST.ESRI_GEO_FOOTPRINT) = $row_count_before
    AS idempotency_assertion_passes;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 7. Determinism assertion #4: a re-run produces byte-equal rows.
-- The MERGE replaces, so row content must match the previous content exactly.
-- Plan 4 has NO NULLable columns (all 15 are NOT NULL), so no COALESCE needed.
-- ---------------------------------------------------------------------------
SET hash_before = (
    SELECT HASH_AGG(BRANCH_ZIP, STATE_CODE, COUNTRY_CODE, PROFILE_MONTH,
                    TAPESTRY_SEGMENT_CODE, TAPESTRY_SEGMENT_NAME, URBANICITY_TIER,
                    MEDIAN_HOUSEHOLD_INCOME, WEALTH_INDEX,
                    FOOT_TRAFFIC_INDEX, COMMERCIAL_DENSITY_PER_SQ_MI,
                    DISTANCE_TO_NEAREST_BRANCH_MI, MARKET_PENETRATION_PCT,
                    BRANCH_RECOMMENDATION, GENERATED_AT)::VARCHAR
    FROM FINS.TEST.ESRI_GEO_FOOTPRINT
);
CALL FINS.TEST.SP_GENERATE_ESRI_GEO_FOOTPRINT();
SELECT
    (SELECT HASH_AGG(BRANCH_ZIP, STATE_CODE, COUNTRY_CODE, PROFILE_MONTH,
                     TAPESTRY_SEGMENT_CODE, TAPESTRY_SEGMENT_NAME, URBANICITY_TIER,
                     MEDIAN_HOUSEHOLD_INCOME, WEALTH_INDEX,
                     FOOT_TRAFFIC_INDEX, COMMERCIAL_DENSITY_PER_SQ_MI,
                     DISTANCE_TO_NEAREST_BRANCH_MI, MARKET_PENETRATION_PCT,
                     BRANCH_RECOMMENDATION, GENERATED_AT)::VARCHAR
     FROM FINS.TEST.ESRI_GEO_FOOTPRINT) = $hash_before
    AS determinism_assertion_passes;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 8. Log-row assertion #5: at least one SUCCEEDED row exists for this task name.
-- ---------------------------------------------------------------------------
SELECT EXISTS (
    SELECT 1 FROM FINS.TEST.TASK_EXECUTION_LOG
    WHERE TASK_NAME = 'TASK_MONTHLY_ESRI_GEO_FOOTPRINT'
      AND STATUS = 'SUCCEEDED'
) AS log_row_present;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 9. Output-shape assertion #6: every required column populated.
-- All 15 columns are NOT NULL (the table constraint enforces this, but assert
-- here for documentation and to catch silent inserts that bypass the table).
-- ---------------------------------------------------------------------------
SELECT NOT EXISTS (
    SELECT 1 FROM FINS.TEST.ESRI_GEO_FOOTPRINT
    WHERE BRANCH_ZIP IS NULL
       OR STATE_CODE IS NULL
       OR COUNTRY_CODE IS NULL
       OR PROFILE_MONTH IS NULL
       OR TAPESTRY_SEGMENT_CODE IS NULL
       OR TAPESTRY_SEGMENT_NAME IS NULL
       OR URBANICITY_TIER IS NULL
       OR MEDIAN_HOUSEHOLD_INCOME IS NULL
       OR WEALTH_INDEX IS NULL
       OR FOOT_TRAFFIC_INDEX IS NULL
       OR COMMERCIAL_DENSITY_PER_SQ_MI IS NULL
       OR DISTANCE_TO_NEAREST_BRANCH_MI IS NULL
       OR MARKET_PENETRATION_PCT IS NULL
       OR BRANCH_RECOMMENDATION IS NULL
       OR GENERATED_AT IS NULL
) AS all_columns_populated;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 10. ZIP uniqueness assertion #7: every ZIP appears exactly once.
-- Plan 4's PK is (BRANCH_ZIP, PROFILE_MONTH); within a single PROFILE_MONTH,
-- BRANCH_ZIP must be unique on its own.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(DISTINCT BRANCH_ZIP) FROM FINS.TEST.ESRI_GEO_FOOTPRINT) =
    (SELECT COUNT(*) FROM FINS.TEST.ESRI_GEO_FOOTPRINT)
    AS zip_uniqueness_passes;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 11. Tapestry-code canonical assertion #8: every TAPESTRY_SEGMENT_CODE is in
-- the 12-code Esri Tapestry-style pool.
-- ---------------------------------------------------------------------------
SELECT NOT EXISTS (
    SELECT 1 FROM FINS.TEST.ESRI_GEO_FOOTPRINT
    WHERE TAPESTRY_SEGMENT_CODE NOT IN
        ('TC','EE','ND','BS','SF','MD','SH','RD','RC','HM','MS','RH')
) AS tapestry_code_canonical;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 12. Urbanicity canonical assertion #9: every URBANICITY_TIER is one of the
-- 4 declared values.
-- ---------------------------------------------------------------------------
SELECT NOT EXISTS (
    SELECT 1 FROM FINS.TEST.ESRI_GEO_FOOTPRINT
    WHERE URBANICITY_TIER NOT IN
        ('Urban Core','Suburban','Small Town','Rural')
) AS urbanicity_canonical;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 13. Branch-recommendation canonical assertion #10: every BRANCH_RECOMMENDATION
-- is one of the 4 declared decision-tree outputs.
-- ---------------------------------------------------------------------------
SELECT NOT EXISTS (
    SELECT 1 FROM FINS.TEST.ESRI_GEO_FOOTPRINT
    WHERE BRANCH_RECOMMENDATION NOT IN
        ('Expand','Maintain','Optimize','Consolidate')
) AS branch_recommendation_canonical;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 14. Urbanicity-vs-foot-traffic correlation assertion #11: Urban Core ZIPs
-- have a higher mean FOOT_TRAFFIC_INDEX than Rural ZIPs.
--   Bases per rowspec: Urban Core = 180, Suburban = 90, Small Town = 50, Rural = 20
-- Forced by state overrides:
--   Urban Core (no Rural)  : 10025/NY, 94110/CA, 02134/MA, 60614/IL
--   Rural      (no Urban)  : 59001/MT, 83001/WY
-- ---------------------------------------------------------------------------
SELECT
    (SELECT AVG(FOOT_TRAFFIC_INDEX) FROM FINS.TEST.ESRI_GEO_FOOTPRINT
     WHERE BRANCH_ZIP IN ('10025','94110','02134','60614')) >
    (SELECT AVG(FOOT_TRAFFIC_INDEX) FROM FINS.TEST.ESRI_GEO_FOOTPRINT
     WHERE BRANCH_ZIP IN ('59001','83001'))
    AS urbanicity_foot_traffic_correlates;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 15. Cleanup
-- ---------------------------------------------------------------------------
DELETE FROM FINS.TEST.ESRI_GEO_FOOTPRINT;
DELETE FROM FINS.TEST.TASK_EXECUTION_LOG WHERE TASK_NAME = 'TASK_MONTHLY_ESRI_GEO_FOOTPRINT';
DROP VIEW IF EXISTS FINS.TEST.V_ACCOUNT_ANCHORS;
DROP TABLE IF EXISTS FINS.TEST.TEST_V_ACCOUNT_ANCHORS_FIXTURE;
DROP TABLE IF EXISTS FINS.TEST.ESRI_GEO_FOOTPRINT_STAGING;
