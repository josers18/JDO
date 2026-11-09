-- =============================================================================
-- L2 integration test for SP_GENERATE_ESRI_GEO_FOOTPRINT
-- =============================================================================
-- Run:     snow sql -c SFDC_DC_TECH_ARCH_jwt --role ACCOUNTADMIN \
--            -f tests/integration/test_esri_geo_footprint_sp.sql
--          (ACCOUNTADMIN: the cloned SP is EXECUTE AS OWNER and write_pandas
--          creates its staging table, which needs CREATE TABLE.)
-- Pass:    Every assertion column returns TRUE. Any FALSE = test failure.
--
-- Strategy:
--   Clone the deployed SP into SP_GENERATE_ESRI_GEO_FOOTPRINT_FIXTURE via
--   GET_DDL + REPLACE, redirecting the dataset table, staging table, task-log
--   name and V_ACCOUNT_ANCHORS to fixture-scoped names, then CALL it against
--   a 32-anchor fixture view. ESRI_GEO_FOOTPRINT is a stem of the SP, task
--   and staging names, so those are parked behind sentinels first and
--   expanded after the table swap.
--
--   Write targets in the live SP: the dataset table (TABLE constant and the
--   MERGE target), the write_pandas staging table, and the
--   TASK_EXECUTION_LOG insert (kept, but under the fixture TASK_NAME). A
--   guard step (4b) inspects the REPLACEd DDL and aborts before the first
--   CALL if any live write target survives.
--
--   The audience is BRANCH-scoped: one row per (ORG_ID, POSTAL_CODE), with no
--   account-id predicate, so any ids enter it. Empty-string and NULL
--   ZIPs are filtered out (AUDIENCE_SQL).
--
-- What it covers:
--   - Audience: 11 (ORG_ID, ZIP) rows from 32 anchors: 10 JDO ZIPs over 4
--     urbanicity-leaning state groups, 1 TST-org row sharing ZIP 10025 (org
--     isolation), 1 empty-ZIP and 1 NULL-ZIP anchor (dropped).
--   - Coverage (ORG_ID|ZIP cardinality), uniqueness, ORG_ID stamped, COUNTRY_CODE
--     normalised to US (a 'USA' anchor), 16 NOT NULL columns.
--   - PROFILE_MONTH / GENERATED_AT = first of the current UTC month.
--   - Vocabularies (Tapestry codes, urbanicity, recommendation) and numeric
--     ranges; per-tier foot-traffic / density / branch-distance bands; state
--     forcing (MT/WY never Urban Core, NY/CA/MA/IL never Rural); the
--     recommendation decision tree recomputed from the row's own metrics.
--   - Idempotency and determinism across re-runs (MERGE, byte-equal rows).
--   - Log rows: 2 SUCCEEDED, ROWS_INSERTED 11 then 0 (MERGE inserted count),
--     ACCOUNTS_PROCESSED = 30.
--
-- Pre-requisites:
--   SP_GENERATE_ESRI_GEO_FOOTPRINT deployed (procedures/sp_create_procedure.sql).
-- Side effects:
--   Fixture runs log to TASK_EXECUTION_LOG as
--   TASK_MONTHLY_ESRI_GEO_FOOTPRINT_FIXTURE; the cleanup step deletes those rows.
--   Objects created and dropped: *_ESRI_*_FIXTURE view/table/staging/SP.
-- =============================================================================

USE SCHEMA DATA_JEDAIS.FINS__PUBLIC;

-- ---------------------------------------------------------------------------
-- 1. Drop leftovers from a prior failed run.
-- ---------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_ESRI_GEO_FOOTPRINT_FIXTURE();
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.ESRI_GEO_FOOTPRINT_FIXTURE_STAGING;
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.ESRI_GEO_FOOTPRINT_FIXTURE;
DROP VIEW      IF EXISTS DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS_ESRI_FIXTURE;
DELETE FROM DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG WHERE TASK_NAME = 'TASK_MONTHLY_ESRI_GEO_FOOTPRINT_FIXTURE';

-- ---------------------------------------------------------------------------
-- 2. Fixture audience view, in the live V_ACCOUNT_ANCHORS column order.
--    JDO ZIPs (anchors): 10025/NY=5, 94110/CA=8, 02134/MA=3, 60614/IL=4,
--    07030/NJ=2 (one with COUNTRY_CODE 'USA'), 30309/GA=2, 78704/TX=2,
--    85003/AZ=1, 59001/MT=1, 83001/WY=1  (29 anchors, 10 ZIPs).
--    Plus: TST-org anchor in 10025 (same ZIP, other org -> its own row),
--    an empty-string ZIP and a NULL ZIP (both excluded). Total 32 anchors,
--    11 audience rows, 30 counted customers.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS_ESRI_FIXTURE AS
SELECT
    'JDO'::VARCHAR AS ORG_ID, 'ESRI-FIX-NY-01'::VARCHAR AS ACCOUNT_ID, 'NY Customer 1'::VARCHAR AS ACCOUNT_NAME,
    '2026-11-01'::DATE AS SNAPSHOT_DATE, 'Retail'::VARCHAR AS CLIENT_CATEGORY, 'PERSON'::VARCHAR AS ACCOUNT_TYPE_FLAG,
    NULL::TIMESTAMP_LTZ AS BIRTHDATE, NULL::NUMBER AS ANNUAL_INCOME, NULL::NUMBER AS CREDIT_SCORE,
    NULL::VARCHAR AS INDUSTRY, NULL::NUMBER AS ANNUAL_REVENUE, NULL::NUMBER AS EMPLOYEE_COUNT,
    '10025'::VARCHAR AS POSTAL_CODE, 'NY'::VARCHAR AS STATE_CODE, 'US'::VARCHAR AS COUNTRY_CODE,
    'EXT-ESRI-FIX-NY-01'::VARCHAR AS EXTERNAL_ID
UNION ALL SELECT 'JDO','ESRI-FIX-NY-02','NY Customer 2','2026-11-01'::DATE,'Retail','PERSON',NULL::TIMESTAMP_LTZ,NULL::NUMBER,NULL::NUMBER,NULL::VARCHAR,NULL::NUMBER,NULL::NUMBER,'10025','NY','US','EXT-ESRI-FIX-NY-02'
UNION ALL SELECT 'JDO','ESRI-FIX-NY-03','NY Customer 3','2026-11-01'::DATE,'Retail','PERSON',NULL::TIMESTAMP_LTZ,NULL::NUMBER,NULL::NUMBER,NULL::VARCHAR,NULL::NUMBER,NULL::NUMBER,'10025','NY','US','EXT-ESRI-FIX-NY-03'
UNION ALL SELECT 'JDO','ESRI-FIX-NY-04','NY Customer 4','2026-11-01'::DATE,'Retail','PERSON',NULL::TIMESTAMP_LTZ,NULL::NUMBER,NULL::NUMBER,NULL::VARCHAR,NULL::NUMBER,NULL::NUMBER,'10025','NY','US','EXT-ESRI-FIX-NY-04'
UNION ALL SELECT 'JDO','ESRI-FIX-NY-05','NY Customer 5','2026-11-01'::DATE,'Retail','PERSON',NULL::TIMESTAMP_LTZ,NULL::NUMBER,NULL::NUMBER,NULL::VARCHAR,NULL::NUMBER,NULL::NUMBER,'10025','NY','US','EXT-ESRI-FIX-NY-05'
UNION ALL SELECT 'JDO','ESRI-FIX-CA-01','CA Customer 1','2026-11-01'::DATE,'Retail','PERSON',NULL::TIMESTAMP_LTZ,NULL::NUMBER,NULL::NUMBER,NULL::VARCHAR,NULL::NUMBER,NULL::NUMBER,'94110','CA','US','EXT-ESRI-FIX-CA-01'
UNION ALL SELECT 'JDO','ESRI-FIX-CA-02','CA Customer 2','2026-11-01'::DATE,'Retail','PERSON',NULL::TIMESTAMP_LTZ,NULL::NUMBER,NULL::NUMBER,NULL::VARCHAR,NULL::NUMBER,NULL::NUMBER,'94110','CA','US','EXT-ESRI-FIX-CA-02'
UNION ALL SELECT 'JDO','ESRI-FIX-CA-03','CA Customer 3','2026-11-01'::DATE,'Retail','PERSON',NULL::TIMESTAMP_LTZ,NULL::NUMBER,NULL::NUMBER,NULL::VARCHAR,NULL::NUMBER,NULL::NUMBER,'94110','CA','US','EXT-ESRI-FIX-CA-03'
UNION ALL SELECT 'JDO','ESRI-FIX-CA-04','CA Customer 4','2026-11-01'::DATE,'Retail','PERSON',NULL::TIMESTAMP_LTZ,NULL::NUMBER,NULL::NUMBER,NULL::VARCHAR,NULL::NUMBER,NULL::NUMBER,'94110','CA','US','EXT-ESRI-FIX-CA-04'
UNION ALL SELECT 'JDO','ESRI-FIX-CA-05','CA Customer 5','2026-11-01'::DATE,'Retail','PERSON',NULL::TIMESTAMP_LTZ,NULL::NUMBER,NULL::NUMBER,NULL::VARCHAR,NULL::NUMBER,NULL::NUMBER,'94110','CA','US','EXT-ESRI-FIX-CA-05'
UNION ALL SELECT 'JDO','ESRI-FIX-CA-06','CA Customer 6','2026-11-01'::DATE,'Retail','PERSON',NULL::TIMESTAMP_LTZ,NULL::NUMBER,NULL::NUMBER,NULL::VARCHAR,NULL::NUMBER,NULL::NUMBER,'94110','CA','US','EXT-ESRI-FIX-CA-06'
UNION ALL SELECT 'JDO','ESRI-FIX-CA-07','CA Customer 7','2026-11-01'::DATE,'Retail','PERSON',NULL::TIMESTAMP_LTZ,NULL::NUMBER,NULL::NUMBER,NULL::VARCHAR,NULL::NUMBER,NULL::NUMBER,'94110','CA','US','EXT-ESRI-FIX-CA-07'
UNION ALL SELECT 'JDO','ESRI-FIX-CA-08','CA Customer 8','2026-11-01'::DATE,'Retail','PERSON',NULL::TIMESTAMP_LTZ,NULL::NUMBER,NULL::NUMBER,NULL::VARCHAR,NULL::NUMBER,NULL::NUMBER,'94110','CA','US','EXT-ESRI-FIX-CA-08'
UNION ALL SELECT 'JDO','ESRI-FIX-MA-01','MA Customer 1','2026-11-01'::DATE,'Retail','PERSON',NULL::TIMESTAMP_LTZ,NULL::NUMBER,NULL::NUMBER,NULL::VARCHAR,NULL::NUMBER,NULL::NUMBER,'02134','MA','US','EXT-ESRI-FIX-MA-01'
UNION ALL SELECT 'JDO','ESRI-FIX-MA-02','MA Customer 2','2026-11-01'::DATE,'Retail','PERSON',NULL::TIMESTAMP_LTZ,NULL::NUMBER,NULL::NUMBER,NULL::VARCHAR,NULL::NUMBER,NULL::NUMBER,'02134','MA','US','EXT-ESRI-FIX-MA-02'
UNION ALL SELECT 'JDO','ESRI-FIX-MA-03','MA Customer 3','2026-11-01'::DATE,'Retail','PERSON',NULL::TIMESTAMP_LTZ,NULL::NUMBER,NULL::NUMBER,NULL::VARCHAR,NULL::NUMBER,NULL::NUMBER,'02134','MA','US','EXT-ESRI-FIX-MA-03'
UNION ALL SELECT 'JDO','ESRI-FIX-IL-01','IL Customer 1','2026-11-01'::DATE,'Retail','PERSON',NULL::TIMESTAMP_LTZ,NULL::NUMBER,NULL::NUMBER,NULL::VARCHAR,NULL::NUMBER,NULL::NUMBER,'60614','IL','US','EXT-ESRI-FIX-IL-01'
UNION ALL SELECT 'JDO','ESRI-FIX-IL-02','IL Customer 2','2026-11-01'::DATE,'Retail','PERSON',NULL::TIMESTAMP_LTZ,NULL::NUMBER,NULL::NUMBER,NULL::VARCHAR,NULL::NUMBER,NULL::NUMBER,'60614','IL','US','EXT-ESRI-FIX-IL-02'
UNION ALL SELECT 'JDO','ESRI-FIX-IL-03','IL Customer 3','2026-11-01'::DATE,'Retail','PERSON',NULL::TIMESTAMP_LTZ,NULL::NUMBER,NULL::NUMBER,NULL::VARCHAR,NULL::NUMBER,NULL::NUMBER,'60614','IL','US','EXT-ESRI-FIX-IL-03'
UNION ALL SELECT 'JDO','ESRI-FIX-IL-04','IL Customer 4','2026-11-01'::DATE,'Retail','PERSON',NULL::TIMESTAMP_LTZ,NULL::NUMBER,NULL::NUMBER,NULL::VARCHAR,NULL::NUMBER,NULL::NUMBER,'60614','IL','US','EXT-ESRI-FIX-IL-04'
UNION ALL SELECT 'JDO','ESRI-FIX-NJ-01','NJ Customer 1','2026-11-01'::DATE,'Retail','PERSON',NULL::TIMESTAMP_LTZ,NULL::NUMBER,NULL::NUMBER,NULL::VARCHAR,NULL::NUMBER,NULL::NUMBER,'07030','NJ','US','EXT-ESRI-FIX-NJ-01'
UNION ALL SELECT 'JDO','ESRI-FIX-NJ-02','NJ Customer 2','2026-11-01'::DATE,'Retail','PERSON',NULL::TIMESTAMP_LTZ,NULL::NUMBER,NULL::NUMBER,NULL::VARCHAR,NULL::NUMBER,NULL::NUMBER,'07030','NJ','USA','EXT-ESRI-FIX-NJ-02'
UNION ALL SELECT 'JDO','ESRI-FIX-GA-01','GA Customer 1','2026-11-01'::DATE,'Retail','PERSON',NULL::TIMESTAMP_LTZ,NULL::NUMBER,NULL::NUMBER,NULL::VARCHAR,NULL::NUMBER,NULL::NUMBER,'30309','GA','US','EXT-ESRI-FIX-GA-01'
UNION ALL SELECT 'JDO','ESRI-FIX-GA-02','GA Customer 2','2026-11-01'::DATE,'Retail','PERSON',NULL::TIMESTAMP_LTZ,NULL::NUMBER,NULL::NUMBER,NULL::VARCHAR,NULL::NUMBER,NULL::NUMBER,'30309','GA','US','EXT-ESRI-FIX-GA-02'
UNION ALL SELECT 'JDO','ESRI-FIX-TX-01','TX Customer 1','2026-11-01'::DATE,'Retail','PERSON',NULL::TIMESTAMP_LTZ,NULL::NUMBER,NULL::NUMBER,NULL::VARCHAR,NULL::NUMBER,NULL::NUMBER,'78704','TX','US','EXT-ESRI-FIX-TX-01'
UNION ALL SELECT 'JDO','ESRI-FIX-TX-02','TX Customer 2','2026-11-01'::DATE,'Retail','PERSON',NULL::TIMESTAMP_LTZ,NULL::NUMBER,NULL::NUMBER,NULL::VARCHAR,NULL::NUMBER,NULL::NUMBER,'78704','TX','US','EXT-ESRI-FIX-TX-02'
UNION ALL SELECT 'JDO','ESRI-FIX-AZ-01','AZ Customer 1','2026-11-01'::DATE,'Retail','PERSON',NULL::TIMESTAMP_LTZ,NULL::NUMBER,NULL::NUMBER,NULL::VARCHAR,NULL::NUMBER,NULL::NUMBER,'85003','AZ','US','EXT-ESRI-FIX-AZ-01'
UNION ALL SELECT 'JDO','ESRI-FIX-MT-01','MT Customer 1','2026-11-01'::DATE,'Retail','PERSON',NULL::TIMESTAMP_LTZ,NULL::NUMBER,NULL::NUMBER,NULL::VARCHAR,NULL::NUMBER,NULL::NUMBER,'59001','MT','US','EXT-ESRI-FIX-MT-01'
UNION ALL SELECT 'JDO','ESRI-FIX-WY-01','WY Customer 1','2026-11-01'::DATE,'Retail','PERSON',NULL::TIMESTAMP_LTZ,NULL::NUMBER,NULL::NUMBER,NULL::VARCHAR,NULL::NUMBER,NULL::NUMBER,'83001','WY','US','EXT-ESRI-FIX-WY-01'
UNION ALL SELECT 'TST','ESRI-FIX-TST-01','Other-org NY Customer','2026-11-01'::DATE,'Retail','PERSON',NULL::TIMESTAMP_LTZ,NULL::NUMBER,NULL::NUMBER,NULL::VARCHAR,NULL::NUMBER,NULL::NUMBER,'10025','NY','US','EXT-ESRI-FIX-TST-01'
UNION ALL SELECT 'JDO','ESRI-FIX-EMPTY-01','Empty ZIP Customer','2026-11-01'::DATE,'Retail','PERSON',NULL::TIMESTAMP_LTZ,NULL::NUMBER,NULL::NUMBER,NULL::VARCHAR,NULL::NUMBER,NULL::NUMBER,'','NY','US','EXT-ESRI-FIX-EMPTY-01'
UNION ALL SELECT 'JDO','ESRI-FIX-NULL-01','Null ZIP Customer','2026-11-01'::DATE,'Retail','PERSON',NULL::TIMESTAMP_LTZ,NULL::NUMBER,NULL::NUMBER,NULL::VARCHAR,NULL::NUMBER,NULL::NUMBER,NULL,'NY','US','EXT-ESRI-FIX-NULL-01';

-- ---------------------------------------------------------------------------
-- 3. Fixture target table: same DDL as ESRI_GEO_FOOTPRINT.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE TABLE DATA_JEDAIS.FINS__PUBLIC.ESRI_GEO_FOOTPRINT_FIXTURE
LIKE DATA_JEDAIS.FINS__PUBLIC.ESRI_GEO_FOOTPRINT;

-- ---------------------------------------------------------------------------
-- 4. Clone the SP (live signature takes no arguments) and abort if any live
--    write target survives the REPLACEs.
-- ---------------------------------------------------------------------------
EXECUTE IMMEDIATE $$
DECLARE
    sp_ddl STRING;
BEGIN
    sp_ddl := (SELECT GET_DDL('PROCEDURE', 'DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_ESRI_GEO_FOOTPRINT()'));
    -- Park the identifiers that contain ESRI_GEO_FOOTPRINT as a stem.
    sp_ddl := REPLACE(sp_ddl, 'ESRI_GEO_FOOTPRINT_STAGING',     '__ESRI_STG__');
    sp_ddl := REPLACE(sp_ddl, 'SP_GENERATE_ESRI_GEO_FOOTPRINT', '__ESRI_SP__');
    sp_ddl := REPLACE(sp_ddl, 'TASK_MONTHLY_ESRI_GEO_FOOTPRINT','__ESRI_TASK__');
    -- The dataset table name is now unambiguous.
    sp_ddl := REPLACE(sp_ddl, 'ESRI_GEO_FOOTPRINT',             'ESRI_GEO_FOOTPRINT_FIXTURE');
    -- Expand the sentinels to fixture names.
    sp_ddl := REPLACE(sp_ddl, '__ESRI_STG__',                   'ESRI_GEO_FOOTPRINT_FIXTURE_STAGING');
    sp_ddl := REPLACE(sp_ddl, '__ESRI_SP__',                    'SP_GENERATE_ESRI_GEO_FOOTPRINT_FIXTURE');
    sp_ddl := REPLACE(sp_ddl, '__ESRI_TASK__',                  'TASK_MONTHLY_ESRI_GEO_FOOTPRINT_FIXTURE');
    -- Redirect the audience and coverage SQL to the fixture view.
    sp_ddl := REPLACE(sp_ddl, 'V_ACCOUNT_ANCHORS',              'V_ACCOUNT_ANCHORS_ESRI_FIXTURE');
    -- SAFETY GUARD: strip every fixture-scoped name; any ESRI_GEO_FOOTPRINT
    -- (live table / staging / SP / task) or live anchor view left over aborts
    -- before the SP is even created, so the first CALL cannot run.
    IF (REGEXP_COUNT(
            REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(sp_ddl,
                'ESRI_GEO_FOOTPRINT_FIXTURE_STAGING', ''),
                'SP_GENERATE_ESRI_GEO_FOOTPRINT_FIXTURE', ''),
                'TASK_MONTHLY_ESRI_GEO_FOOTPRINT_FIXTURE', ''),
                'ESRI_GEO_FOOTPRINT_FIXTURE', ''),
                'V_ACCOUNT_ANCHORS_ESRI_FIXTURE', ''),
            'ESRI_GEO_FOOTPRINT|V_ACCOUNT_ANCHORS') > 0) THEN
        RETURN 'ABORT: live write target survived REPLACE';
    END IF;
    EXECUTE IMMEDIATE :sp_ddl;
    RETURN 'fixture SP staged';
END;
$$;

-- Guard proof: re-read the staged fixture SP and confirm no live name remains
-- and the MERGE / staging / log targets are the fixture ones.
SELECT
    REGEXP_COUNT(
        REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
            GET_DDL('PROCEDURE', 'DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_ESRI_GEO_FOOTPRINT_FIXTURE()'),
            'ESRI_GEO_FOOTPRINT_FIXTURE_STAGING', ''),
            'SP_GENERATE_ESRI_GEO_FOOTPRINT_FIXTURE', ''),
            'TASK_MONTHLY_ESRI_GEO_FOOTPRINT_FIXTURE', ''),
            'ESRI_GEO_FOOTPRINT_FIXTURE', ''),
            'V_ACCOUNT_ANCHORS_ESRI_FIXTURE', ''),
        'ESRI_GEO_FOOTPRINT|V_ACCOUNT_ANCHORS') = 0
    AND CONTAINS(GET_DDL('PROCEDURE', 'DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_ESRI_GEO_FOOTPRINT_FIXTURE()'),
                 'MERGE INTO DATA_JEDAIS.FINS__PUBLIC.ESRI_GEO_FOOTPRINT_FIXTURE tgt')
    AND CONTAINS(GET_DDL('PROCEDURE', 'DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_ESRI_GEO_FOOTPRINT_FIXTURE()'),
                 'TASK_NAME    = "TASK_MONTHLY_ESRI_GEO_FOOTPRINT_FIXTURE"')
    AND CONTAINS(GET_DDL('PROCEDURE', 'DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_ESRI_GEO_FOOTPRINT_FIXTURE()'),
                 'staging = "ESRI_GEO_FOOTPRINT_FIXTURE_STAGING"')
    AS cloned_sp_writes_fixture_only;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 5. CALL #1 (no arguments, as the monthly task runs it).
-- ---------------------------------------------------------------------------
CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_ESRI_GEO_FOOTPRINT_FIXTURE();

-- ---------------------------------------------------------------------------
-- 6. Row count and coverage. Audience = distinct (ORG_ID, ZIP) with a
--    non-empty ZIP: 10 JDO ZIPs + 1 TST row = 11. Empty/NULL ZIPs dropped.
-- ---------------------------------------------------------------------------
SELECT (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.ESRI_GEO_FOOTPRINT_FIXTURE) = 11 AS row_count_one_per_org_zip;
-- Expected: TRUE

SELECT
    (SELECT COUNT(DISTINCT (ORG_ID || '|' || POSTAL_CODE)) FROM DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS_ESRI_FIXTURE
      WHERE POSTAL_CODE IS NOT NULL AND POSTAL_CODE <> '') =
    (SELECT COUNT(DISTINCT (ORG_ID || '|' || BRANCH_ZIP)) FROM DATA_JEDAIS.FINS__PUBLIC.ESRI_GEO_FOOTPRINT_FIXTURE)
    AS coverage_matches_audience;
-- Expected: TRUE

SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.ESRI_GEO_FOOTPRINT_FIXTURE WHERE BRANCH_ZIP IS NULL OR BRANCH_ZIP = '') = 0
    AND (SELECT COUNT(DISTINCT BRANCH_ZIP) FROM DATA_JEDAIS.FINS__PUBLIC.ESRI_GEO_FOOTPRINT_FIXTURE) = 10
    AS empty_and_null_zips_excluded;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 7. Uniqueness on the natural key (ORG_ID, BRANCH_ZIP, PROFILE_MONTH).
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM (
        SELECT ORG_ID, BRANCH_ZIP, PROFILE_MONTH FROM DATA_JEDAIS.FINS__PUBLIC.ESRI_GEO_FOOTPRINT_FIXTURE
         GROUP BY 1, 2, 3 HAVING COUNT(*) > 1)) = 0
    AS org_zip_month_unique;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 8. Multi-org: ZIP 10025 appears once for JDO and once for TST (ORG_ID is
--    part of the GROUP BY), and every row is stamped with a fixture org.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.ESRI_GEO_FOOTPRINT_FIXTURE WHERE BRANCH_ZIP = '10025' AND ORG_ID = 'JDO') = 1
    AND (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.ESRI_GEO_FOOTPRINT_FIXTURE WHERE BRANCH_ZIP = '10025' AND ORG_ID = 'TST') = 1
    AND (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.ESRI_GEO_FOOTPRINT_FIXTURE WHERE ORG_ID = 'TST') = 1
    AS org_isolation_same_zip_two_orgs;
-- Expected: TRUE

SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.ESRI_GEO_FOOTPRINT_FIXTURE WHERE ORG_ID IS NULL OR ORG_ID NOT IN ('JDO', 'TST')) = 0
    AS org_id_stamped;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 9. COUNTRY_CODE is normalised to 'US' even for the 'USA' fixture anchor
--    (AUDIENCE_SQL emits the literal 'US').
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.ESRI_GEO_FOOTPRINT_FIXTURE WHERE COUNTRY_CODE <> 'US') = 0
    AND EXISTS (SELECT 1 FROM DATA_JEDAIS.FINS__PUBLIC.ESRI_GEO_FOOTPRINT_FIXTURE WHERE BRANCH_ZIP = '07030')
    AS country_code_normalised;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 10. All 16 columns populated.
-- ---------------------------------------------------------------------------
SELECT NOT EXISTS (
    SELECT 1 FROM DATA_JEDAIS.FINS__PUBLIC.ESRI_GEO_FOOTPRINT_FIXTURE
    WHERE ORG_ID IS NULL OR BRANCH_ZIP IS NULL OR STATE_CODE IS NULL
       OR COUNTRY_CODE IS NULL OR PROFILE_MONTH IS NULL
       OR TAPESTRY_SEGMENT_CODE IS NULL OR TAPESTRY_SEGMENT_NAME IS NULL
       OR URBANICITY_TIER IS NULL OR MEDIAN_HOUSEHOLD_INCOME IS NULL
       OR WEALTH_INDEX IS NULL OR FOOT_TRAFFIC_INDEX IS NULL
       OR COMMERCIAL_DENSITY_PER_SQ_MI IS NULL OR DISTANCE_TO_NEAREST_BRANCH_MI IS NULL
       OR MARKET_PENETRATION_PCT IS NULL OR BRANCH_RECOMMENDATION IS NULL
       OR GENERATED_AT IS NULL
) AS all_columns_populated;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 11. PROFILE_MONTH is the first of the current UTC month and GENERATED_AT is
--     that month's midnight (month-bucketed so same-month re-runs are
--     byte-identical).
-- ---------------------------------------------------------------------------
SELECT NOT EXISTS (
    SELECT 1 FROM DATA_JEDAIS.FINS__PUBLIC.ESRI_GEO_FOOTPRINT_FIXTURE
    WHERE PROFILE_MONTH <> DATE_TRUNC('MONTH', CONVERT_TIMEZONE('UTC', CURRENT_TIMESTAMP())::DATE)
       OR GENERATED_AT <> PROFILE_MONTH::TIMESTAMP_NTZ
) AS profile_month_is_current_utc_month;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 12. Idempotency: a second run leaves the row count unchanged.
-- ---------------------------------------------------------------------------
SET row_count_before = (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.ESRI_GEO_FOOTPRINT_FIXTURE);
-- Hash is computed here, before CALL #2, for the determinism check below.
SET hash_before = (
    SELECT HASH_AGG(ORG_ID, BRANCH_ZIP, STATE_CODE, COUNTRY_CODE, PROFILE_MONTH,
                    TAPESTRY_SEGMENT_CODE, TAPESTRY_SEGMENT_NAME, URBANICITY_TIER,
                    MEDIAN_HOUSEHOLD_INCOME, WEALTH_INDEX,
                    FOOT_TRAFFIC_INDEX, COMMERCIAL_DENSITY_PER_SQ_MI,
                    DISTANCE_TO_NEAREST_BRANCH_MI, MARKET_PENETRATION_PCT,
                    BRANCH_RECOMMENDATION, GENERATED_AT)::VARCHAR
    FROM DATA_JEDAIS.FINS__PUBLIC.ESRI_GEO_FOOTPRINT_FIXTURE
);
CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_ESRI_GEO_FOOTPRINT_FIXTURE();
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.ESRI_GEO_FOOTPRINT_FIXTURE) = $row_count_before
    AS idempotency_row_count_unchanged;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 13. Determinism: the re-run MERGE-replaced every row with byte-equal values
--     (all 16 columns are NOT NULL, so no COALESCE is needed in the hash).
-- ---------------------------------------------------------------------------
SELECT
    (SELECT HASH_AGG(ORG_ID, BRANCH_ZIP, STATE_CODE, COUNTRY_CODE, PROFILE_MONTH,
                    TAPESTRY_SEGMENT_CODE, TAPESTRY_SEGMENT_NAME, URBANICITY_TIER,
                    MEDIAN_HOUSEHOLD_INCOME, WEALTH_INDEX,
                    FOOT_TRAFFIC_INDEX, COMMERCIAL_DENSITY_PER_SQ_MI,
                    DISTANCE_TO_NEAREST_BRANCH_MI, MARKET_PENETRATION_PCT,
                    BRANCH_RECOMMENDATION, GENERATED_AT)::VARCHAR
     FROM DATA_JEDAIS.FINS__PUBLIC.ESRI_GEO_FOOTPRINT_FIXTURE) = $hash_before
    AS determinism_rows_byte_equal;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 14. Log rows: two SUCCEEDED runs under the fixture task name. ROWS_INSERTED
--     is the MERGE's inserted count (first element of its result row): 11 on
--     the first run, 0 on the idempotent re-run. ACCOUNTS_PROCESSED = 30 on
--     both (distinct accounts per audience row summed: 29 JDO + 1 TST;
--     empty/NULL ZIP anchors excluded).
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG
      WHERE TASK_NAME = 'TASK_MONTHLY_ESRI_GEO_FOOTPRINT_FIXTURE') = 2
    AND (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG
          WHERE TASK_NAME = 'TASK_MONTHLY_ESRI_GEO_FOOTPRINT_FIXTURE'
            AND STATUS = 'SUCCEEDED' AND ACCOUNTS_PROCESSED = 30) = 2
    AND (SELECT SUM(ROWS_INSERTED) FROM DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG
          WHERE TASK_NAME = 'TASK_MONTHLY_ESRI_GEO_FOOTPRINT_FIXTURE') = 11
    AND (SELECT MAX(ROWS_INSERTED) FROM DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG
          WHERE TASK_NAME = 'TASK_MONTHLY_ESRI_GEO_FOOTPRINT_FIXTURE') = 11
    AS log_rows_succeeded;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 15. Vocabularies.
-- ---------------------------------------------------------------------------
SELECT NOT EXISTS (
    SELECT 1 FROM DATA_JEDAIS.FINS__PUBLIC.ESRI_GEO_FOOTPRINT_FIXTURE
    WHERE TAPESTRY_SEGMENT_CODE NOT IN
        ('TC','EE','ND','BS','SF','MD','SH','RD','RC','HM','MS','RH')
) AS tapestry_code_canonical;
-- Expected: TRUE

SELECT NOT EXISTS (
    SELECT 1 FROM DATA_JEDAIS.FINS__PUBLIC.ESRI_GEO_FOOTPRINT_FIXTURE
    WHERE URBANICITY_TIER NOT IN ('Urban Core','Suburban','Small Town','Rural')
) AS urbanicity_canonical;
-- Expected: TRUE

SELECT NOT EXISTS (
    SELECT 1 FROM DATA_JEDAIS.FINS__PUBLIC.ESRI_GEO_FOOTPRINT_FIXTURE
    WHERE BRANCH_RECOMMENDATION NOT IN ('Expand','Maintain','Optimize','Consolidate')
) AS branch_recommendation_canonical;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 16. Numeric ranges: income [20K, 350K], wealth index [50, 200] and equal to
--     the clamped income/75K*100, foot traffic [0, 300], penetration [0, 100].
-- ---------------------------------------------------------------------------
SELECT NOT EXISTS (
    SELECT 1 FROM DATA_JEDAIS.FINS__PUBLIC.ESRI_GEO_FOOTPRINT_FIXTURE
    WHERE MEDIAN_HOUSEHOLD_INCOME NOT BETWEEN 20000 AND 350000
       OR WEALTH_INDEX NOT BETWEEN 50 AND 200
       OR ABS(WEALTH_INDEX - LEAST(200, GREATEST(50, MEDIAN_HOUSEHOLD_INCOME / 75000 * 100))) > 0.01
       OR FOOT_TRAFFIC_INDEX NOT BETWEEN 0 AND 300
       OR MARKET_PENETRATION_PCT NOT BETWEEN 0 AND 100
) AS numeric_ranges_and_wealth_derivation;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 17. Per-tier bands (foot traffic = base + U(-30,50); density, branch
--     distance per _commercial_density / _branch_distance).
-- ---------------------------------------------------------------------------
SELECT NOT EXISTS (
    SELECT 1 FROM DATA_JEDAIS.FINS__PUBLIC.ESRI_GEO_FOOTPRINT_FIXTURE
    WHERE NOT (CASE URBANICITY_TIER
        WHEN 'Urban Core' THEN FOOT_TRAFFIC_INDEX BETWEEN 150 AND 230
                           AND COMMERCIAL_DENSITY_PER_SQ_MI BETWEEN 500 AND 2000
                           AND DISTANCE_TO_NEAREST_BRANCH_MI BETWEEN 0.3 AND 2.5
        WHEN 'Suburban'   THEN FOOT_TRAFFIC_INDEX BETWEEN 60 AND 140
                           AND COMMERCIAL_DENSITY_PER_SQ_MI BETWEEN 80 AND 500
                           AND DISTANCE_TO_NEAREST_BRANCH_MI BETWEEN 1 AND 6
        WHEN 'Small Town' THEN FOOT_TRAFFIC_INDEX BETWEEN 20 AND 100
                           AND COMMERCIAL_DENSITY_PER_SQ_MI BETWEEN 15 AND 100
                           AND DISTANCE_TO_NEAREST_BRANCH_MI BETWEEN 2 AND 15
        WHEN 'Rural'      THEN FOOT_TRAFFIC_INDEX BETWEEN 0 AND 70
                           AND COMMERCIAL_DENSITY_PER_SQ_MI BETWEEN 0 AND 30
                           AND DISTANCE_TO_NEAREST_BRANCH_MI BETWEEN 8 AND 50
        ELSE FALSE END)
) AS tier_bands_respected;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 18. State forcing (_urbanicity_tier): MT/WY are never Urban Core;
--     NY/CA/MA/IL are never Rural.
-- ---------------------------------------------------------------------------
SELECT NOT EXISTS (
    SELECT 1 FROM DATA_JEDAIS.FINS__PUBLIC.ESRI_GEO_FOOTPRINT_FIXTURE
    WHERE (STATE_CODE IN ('MT','WY','AK','ND','SD') AND URBANICITY_TIER = 'Urban Core')
       OR (STATE_CODE IN ('NY','CA','MA','IL','DC') AND URBANICITY_TIER = 'Rural')
) AS state_forcing_respected;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 19. Decision tree (_branch_recommendation) recomputed from each row's own
--     metrics must equal the stored BRANCH_RECOMMENDATION.
-- ---------------------------------------------------------------------------
SELECT NOT EXISTS (
    SELECT 1 FROM DATA_JEDAIS.FINS__PUBLIC.ESRI_GEO_FOOTPRINT_FIXTURE
    WHERE BRANCH_RECOMMENDATION <> CASE
        WHEN DISTANCE_TO_NEAREST_BRANCH_MI > 15 AND MARKET_PENETRATION_PCT > 5 THEN 'Expand'
        WHEN MARKET_PENETRATION_PCT > 8 AND FOOT_TRAFFIC_INDEX > 100 THEN 'Maintain'
        WHEN MARKET_PENETRATION_PCT < 1 AND FOOT_TRAFFIC_INDEX < 50 THEN 'Consolidate'
        ELSE 'Optimize' END
) AS recommendation_matches_decision_tree;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 20. Cleanup.
-- ---------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_ESRI_GEO_FOOTPRINT_FIXTURE();
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.ESRI_GEO_FOOTPRINT_FIXTURE_STAGING;
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.ESRI_GEO_FOOTPRINT_FIXTURE;
DROP VIEW      IF EXISTS DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS_ESRI_FIXTURE;
DELETE FROM DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG WHERE TASK_NAME = 'TASK_MONTHLY_ESRI_GEO_FOOTPRINT_FIXTURE';
