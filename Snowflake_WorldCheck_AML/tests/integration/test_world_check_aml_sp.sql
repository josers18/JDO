-- =============================================================================
-- L2 integration test for SP_GENERATE_WORLD_CHECK_AML
-- =============================================================================
-- Plan:    docs/superpowers/plans/2026-05-28-cumulus-plan-7-worldcheck-aml.md
-- Task:    Plan 7 T5
-- Run:     snow sql -f tests/integration/test_world_check_aml_sp.sql
-- Pass:    Every assertion column returns TRUE. Any FALSE = test failure.
--
-- Strategy:
--   Same fixture-cloning pattern as Plan 6: clone the deployed SP into
--   DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_WORLD_CHECK_AML_FIXTURE via GET_DDL + REPLACE,
--   redirecting the audience view, dataset table, and staging table FQNs
--   to fixture-scoped names. Sentinel-based ordering avoids substring
--   collision when WORLD_CHECK_AML expands to WORLD_CHECK_AML_FIXTURE
--   (otherwise SP_GENERATE_WORLD_CHECK_AML would gain a second _FIXTURE
--   suffix during the dataset-table swap).
--
-- Plan 7 differences from Plans 1-6:
--   - First DAILY-cadence dataset — PROFILE_DATE (not PROFILE_MONTH or
--     PROFILE_QUARTER). Mid-day re-runs MERGE-replace in place.
--   - All-accounts audience — no WHERE predicate. Every distinct ACCOUNT_ID
--     in the fixture view emits exactly one row. Fixture has 14 anchors
--     (10 PERSON + 4 BUSINESS, mixed CLIENT_CATEGORY) — all 14 in audience.
--   - Anchor-independent bias — the row factory reads ONLY ACCOUNT_ID. So
--     anchor demographics are not load-bearing for fixture coverage; they
--     exist solely to satisfy the V_ACCOUNT_ANCHORS column contract.
--   - 3 BOOLEAN columns (SANCTIONS_HIT, PEP_HIT, ADVERSE_MEDIA_HIT) — must
--     all be TRUE/FALSE (no junk casts on empty stage).
--   - 2 NULLable columns (ADVERSE_MEDIA_CATEGORIES, CASE_REFERENCE) —
--     conditional on ADVERSE_MEDIA_HIT / OVERALL_RISK_RATING.
--
-- Pre-requisites:
--   1. SP_GENERATE_WORLD_CHECK_AML deployed (run scripts/deploy_sp.py first).
-- =============================================================================

USE SCHEMA DATA_JEDAIS.FINS__PUBLIC;

-- ---------------------------------------------------------------------------
-- 1. Drop any leftover objects from a prior failed run so the test is
--    idempotent end-to-end.
-- ---------------------------------------------------------------------------
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.WORLD_CHECK_AML_FIXTURE;
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.WORLD_CHECK_AML_FIXTURE_STAGING;
DROP PROCEDURE IF EXISTS DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_WORLD_CHECK_AML_FIXTURE();
DROP VIEW      IF EXISTS DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS_WCAML_FIXTURE;

-- ---------------------------------------------------------------------------
-- 2. Materialise the L2 fixture audience view: 14 anchors total.
--    All 14 are in audience (Plan 7 has no audience predicate).
--    - 10 PERSON     (Retail / Wealth Management / Household — varied)
--    -  4 BUSINESS   (Small Business / Commercial Banking — varied)
--    Coverage of CLIENT_CATEGORY (probed via Plan 0): Retail, Wealth
--    Management, Small Business, Commercial Banking, Household.
--    The row factory ignores all anchor fields except ACCOUNT_ID, so demo
--    diversity is cosmetic — but kept for column-contract symmetry with
--    V_ACCOUNT_ANCHORS.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS_WCAML_FIXTURE AS
SELECT
    'WCAML-FIX-P-01'::VARCHAR AS ACCOUNT_ID,
    'Avery Stone'::VARCHAR     AS ACCOUNT_NAME,
    '2026-05-28'::DATE         AS SNAPSHOT_DATE,
    'Retail'::VARCHAR          AS CLIENT_CATEGORY,
    'PERSON'::VARCHAR          AS ACCOUNT_TYPE_FLAG,
    '2002-03-14'::TIMESTAMP_LTZ AS BIRTHDATE,
    35000::NUMBER              AS ANNUAL_INCOME,
    680::NUMBER                AS CREDIT_SCORE,
    NULL::VARCHAR              AS INDUSTRY,
    NULL::NUMBER               AS ANNUAL_REVENUE,
    NULL::NUMBER               AS EMPLOYEE_COUNT,
    '94110'::VARCHAR           AS POSTAL_CODE,
    'CA'::VARCHAR              AS STATE_CODE,
    'US'::VARCHAR              AS COUNTRY_CODE,
    'WCAML-FIX-P-001'::VARCHAR AS EXTERNAL_ID
UNION ALL SELECT 'WCAML-FIX-P-02', 'Riley Park',     '2026-05-28'::DATE, 'Retail',            'PERSON',   '1995-08-22'::TIMESTAMP_LTZ,  62000, 700, NULL, NULL, NULL, '10025', 'NY', 'US', 'WCAML-FIX-P-002'
UNION ALL SELECT 'WCAML-FIX-P-03', 'Casey Reed',     '2026-05-28'::DATE, 'Retail',            'PERSON',   '1990-11-05'::TIMESTAMP_LTZ,  95000, 720, NULL, NULL, NULL, '02115', 'MA', 'US', 'WCAML-FIX-P-003'
UNION ALL SELECT 'WCAML-FIX-P-04', 'Quinn Marlowe',  '2026-05-28'::DATE, 'Wealth Management', 'PERSON',   '1988-04-08'::TIMESTAMP_LTZ, 280000, 770, NULL, NULL, NULL, '94027', 'CA', 'US', 'WCAML-FIX-P-004'
UNION ALL SELECT 'WCAML-FIX-P-05', 'Jordan Vega',    '2026-05-28'::DATE, 'Wealth Management', 'PERSON',   '1975-06-12'::TIMESTAMP_LTZ, 410000, 790, NULL, NULL, NULL, '77002', 'TX', 'US', 'WCAML-FIX-P-005'
UNION ALL SELECT 'WCAML-FIX-P-06', 'Morgan Hayes',   '2026-05-28'::DATE, 'Household',         'PERSON',   '1972-09-30'::TIMESTAMP_LTZ, 110000, 740, NULL, NULL, NULL, '60601', 'IL', 'US', 'WCAML-FIX-P-006'
UNION ALL SELECT 'WCAML-FIX-P-07', 'Sam Walters',    '2026-05-28'::DATE, 'Retail',            'PERSON',   '1958-02-18'::TIMESTAMP_LTZ,  88000, 730, NULL, NULL, NULL, '33139', 'FL', 'US', 'WCAML-FIX-P-007'
UNION ALL SELECT 'WCAML-FIX-P-08', 'Pat Donovan',    '2026-05-28'::DATE, 'Retail',            'PERSON',   '1955-12-03'::TIMESTAMP_LTZ,  72000, 720, NULL, NULL, NULL, '10001', 'NY', 'US', 'WCAML-FIX-P-008'
UNION ALL SELECT 'WCAML-FIX-P-09', 'Drew Mitchell',  '2026-05-28'::DATE, 'Retail',            'PERSON',   '1992-07-19'::TIMESTAMP_LTZ,  45000, 690, NULL, NULL, NULL, '02101', 'MA', 'US', 'WCAML-FIX-P-009'
UNION ALL SELECT 'WCAML-FIX-P-10', 'Alex Brennan',   '2026-05-28'::DATE, 'Household',         'PERSON',   '1960-01-22'::TIMESTAMP_LTZ, 150000, 760, NULL, NULL, NULL, '90001', 'CA', 'US', 'WCAML-FIX-P-010'
-- BUSINESS anchors — all in audience (no CLIENT_CATEGORY filter).
UNION ALL SELECT 'WCAML-FIX-B-01', 'Pinewood Coffee Co.',     '2026-05-28'::DATE, 'Small Business',      'BUSINESS', NULL::TIMESTAMP_LTZ, NULL, NULL, 'Food & Beverage',        1200000, 18, '98101', 'WA', 'US', 'WCAML-FIX-B-001'
UNION ALL SELECT 'WCAML-FIX-B-02', 'Mariposa Cleaners LLC',   '2026-05-28'::DATE, 'Small Business',      'BUSINESS', NULL::TIMESTAMP_LTZ, NULL, NULL, 'Personal Services',       480000,  6, '94110', 'CA', 'US', 'WCAML-FIX-B-002'
UNION ALL SELECT 'WCAML-FIX-B-03', 'Atlas Logistics Inc.',    '2026-05-28'::DATE, 'Commercial Banking',  'BUSINESS', NULL::TIMESTAMP_LTZ, NULL, NULL, 'Logistics',             18500000, 220, '60601', 'IL', 'US', 'WCAML-FIX-B-003'
UNION ALL SELECT 'WCAML-FIX-B-04', 'Northwind Holdings LLC',  '2026-05-28'::DATE, 'Commercial Banking',  'BUSINESS', NULL::TIMESTAMP_LTZ, NULL, NULL, 'Investment Management', 42000000, 95,  '10005', 'NY', 'US', 'WCAML-FIX-B-004';

-- ---------------------------------------------------------------------------
-- 3. Materialise the fixture-scoped target table: same DDL as
--    DATA_JEDAIS.FINS__PUBLIC.WORLD_CHECK_AML but renamed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE TABLE DATA_JEDAIS.FINS__PUBLIC.WORLD_CHECK_AML_FIXTURE
LIKE DATA_JEDAIS.FINS__PUBLIC.WORLD_CHECK_AML;

-- ---------------------------------------------------------------------------
-- 4. Clone SP_GENERATE_WORLD_CHECK_AML into ..._FIXTURE with FQN swaps:
--      V_ACCOUNT_ANCHORS              -> V_ACCOUNT_ANCHORS_WCAML_FIXTURE
--      WORLD_CHECK_AML (table)        -> WORLD_CHECK_AML_FIXTURE
--      WORLD_CHECK_AML_STAGING        -> WORLD_CHECK_AML_FIXTURE_STAGING
--      SP_GENERATE_WORLD_CHECK_AML    -> SP_GENERATE_WORLD_CHECK_AML_FIXTURE
--      TASK_DAILY_WORLD_CHECK_AML     -> TASK_DAILY_WORLD_CHECK_AML_FIXTURE
--    Sentinel-based ordering avoids substring-collision in repeated REPLACE
--    passes (e.g. replacing WORLD_CHECK_AML first would catch the stem of
--    SP_GENERATE_WORLD_CHECK_AML and TASK_DAILY_WORLD_CHECK_AML and
--    double-suffix them).
-- ---------------------------------------------------------------------------
EXECUTE IMMEDIATE $$
DECLARE
    sp_ddl STRING;
BEGIN
    sp_ddl := (SELECT GET_DDL('PROCEDURE', 'DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_WORLD_CHECK_AML()'));
    -- Step 1: stash the suffix-bearing identifiers behind sentinels.
    sp_ddl := REPLACE(sp_ddl, 'WORLD_CHECK_AML_STAGING',     '__WCA_STG__');
    sp_ddl := REPLACE(sp_ddl, 'SP_GENERATE_WORLD_CHECK_AML', '__WCA_SP__');
    sp_ddl := REPLACE(sp_ddl, 'TASK_DAILY_WORLD_CHECK_AML',  '__WCA_TASK__');
    -- Step 2: now WORLD_CHECK_AML (the dataset table) is unambiguous.
    sp_ddl := REPLACE(sp_ddl, 'WORLD_CHECK_AML',             'WORLD_CHECK_AML_FIXTURE');
    -- Step 3: expand sentinels back to fixture-suffixed names.
    sp_ddl := REPLACE(sp_ddl, '__WCA_STG__',                 'WORLD_CHECK_AML_FIXTURE_STAGING');
    sp_ddl := REPLACE(sp_ddl, '__WCA_SP__',                  'SP_GENERATE_WORLD_CHECK_AML_FIXTURE');
    sp_ddl := REPLACE(sp_ddl, '__WCA_TASK__',                'TASK_DAILY_WORLD_CHECK_AML_FIXTURE');
    -- Step 4: redirect audience view.
    sp_ddl := REPLACE(sp_ddl, 'V_ACCOUNT_ANCHORS',           'V_ACCOUNT_ANCHORS_WCAML_FIXTURE');
    EXECUTE IMMEDIATE :sp_ddl;
    RETURN 'fixture SP staged';
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. First run.
-- ---------------------------------------------------------------------------
CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_WORLD_CHECK_AML_FIXTURE();

-- ---------------------------------------------------------------------------
-- 6. Coverage assertion #1: distinct ACCOUNT_ID == audience size (14).
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(DISTINCT ACCOUNT_ID) FROM DATA_JEDAIS.FINS__PUBLIC.WORLD_CHECK_AML_FIXTURE) = 14
    AS distinct_accounts_assertion_passes;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 7. 1:1 emit assertion #2: COUNT(*) == audience size (14).
-- All-accounts audience + 1:1 emit rate ⇒ row count = audience size.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.WORLD_CHECK_AML_FIXTURE) = 14
    AS row_count_assertion_passes;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 8. Column-population assertion #3: every required column populated for
-- every row (no surprise NULLs in NOT NULL columns).
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.WORLD_CHECK_AML_FIXTURE
       WHERE ACCOUNT_ID             IS NULL
          OR PROFILE_DATE            IS NULL
          OR OVERALL_RISK_RATING     IS NULL
          OR SANCTIONS_HIT           IS NULL
          OR PEP_HIT                 IS NULL
          OR ADVERSE_MEDIA_HIT       IS NULL
          OR RISK_JURISDICTION_CODE  IS NULL
          OR RISK_JURISDICTION_TIER  IS NULL
          OR LAST_SCREENED_AT        IS NULL
          OR CHANGE_SINCE_LAST_RUN   IS NULL
          OR GENERATED_AT            IS NULL) = 0
    AS not_null_columns_populated;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 9. Jurisdiction-code assertion #4: all 14 RISK_JURISDICTION_CODE values
-- are valid ISO-3166-1 alpha-2 codes from the rowspec's 30-jurisdiction pool.
-- (length=2 + in known set.)
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.WORLD_CHECK_AML_FIXTURE
       WHERE LENGTH(RISK_JURISDICTION_CODE) <> 2
          OR RISK_JURISDICTION_CODE NOT IN (
              -- Prohibited (4)
              'IR','KP','SY','CU',
              -- Enhanced (9)
              'RU','VE','BY','MM','AF','ZW','SD','PK','NG',
              -- Standard (17)
              'US','GB','CA','DE','FR','JP','AU','CH','SG','AE',
              'MX','BR','IN','CN','KR','IT','ES'
          )) = 0
    AS jurisdiction_code_in_known_set;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 10. Jurisdiction-tier assertion #5: all values in the 3-tier vocabulary.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.WORLD_CHECK_AML_FIXTURE
       WHERE RISK_JURISDICTION_TIER NOT IN ('Standard','Enhanced','Prohibited')) = 0
    AS jurisdiction_tier_vocabulary_ok;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 11. Overall-rating assertion #6: all values in the 4-rating vocabulary.
-- (Severe is ~0.3% — at 14 anchors, expected ~0.04 rows; we don't assert
-- presence of every value, just vocabulary-bounded membership.)
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.WORLD_CHECK_AML_FIXTURE
       WHERE OVERALL_RISK_RATING NOT IN ('Low','Medium','High','Severe')) = 0
    AS overall_rating_vocabulary_ok;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 12. Change-since-last-run assertion #7: all values in the 5-state
-- vocabulary {New, Unchanged, Risk Increased, Risk Decreased, Cleared}.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.WORLD_CHECK_AML_FIXTURE
       WHERE CHANGE_SINCE_LAST_RUN NOT IN
           ('New','Unchanged','Risk Increased','Risk Decreased','Cleared')) = 0
    AS change_since_last_run_vocabulary_ok;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 13. BOOLEAN-typing assertion #8: each of the 3 BOOLEAN columns must
-- contain only TRUE/FALSE (not int 0/1, not strings, not NULL — they're
-- declared NOT NULL in the table DDL). Casting the column to BOOLEAN and
-- checking it's still in the literal set protects against accidental
-- write_pandas int8 inference if the staging table is ever truncated.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.WORLD_CHECK_AML_FIXTURE
       WHERE SANCTIONS_HIT NOT IN (TRUE, FALSE)) = 0
    AS sanctions_hit_boolean_typed;
-- Expected: TRUE

SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.WORLD_CHECK_AML_FIXTURE
       WHERE PEP_HIT NOT IN (TRUE, FALSE)) = 0
    AS pep_hit_boolean_typed;
-- Expected: TRUE

SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.WORLD_CHECK_AML_FIXTURE
       WHERE ADVERSE_MEDIA_HIT NOT IN (TRUE, FALSE)) = 0
    AS adverse_media_hit_boolean_typed;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 14. NULL-semantics #9a: when ADVERSE_MEDIA_HIT is FALSE, the categories
-- column MUST be NULL (rowspec invariant).
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.WORLD_CHECK_AML_FIXTURE
       WHERE ADVERSE_MEDIA_HIT = FALSE
         AND ADVERSE_MEDIA_CATEGORIES IS NOT NULL) = 0
    AS adverse_media_categories_null_when_no_hit;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 15. NULL-semantics #9b: when OVERALL_RISK_RATING is Low or Medium, the
-- CASE_REFERENCE MUST be NULL (rowspec invariant — only High/Severe
-- accounts get a vendor case ID).
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.WORLD_CHECK_AML_FIXTURE
       WHERE OVERALL_RISK_RATING IN ('Low','Medium')
         AND CASE_REFERENCE IS NOT NULL) = 0
    AS case_reference_null_when_below_high;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 16. Idempotency assertion #10: a second run leaves the row count unchanged
-- (MERGE-not-INSERT) and produces byte-identical output (deterministic seed).
-- ---------------------------------------------------------------------------
SET row_count_before = (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.WORLD_CHECK_AML_FIXTURE);
SET hash_before      = (SELECT HASH_AGG(*) FROM DATA_JEDAIS.FINS__PUBLIC.WORLD_CHECK_AML_FIXTURE);

CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_WORLD_CHECK_AML_FIXTURE();

SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.WORLD_CHECK_AML_FIXTURE) = $row_count_before
    AS idempotency_row_count_unchanged;
-- Expected: TRUE

SELECT
    (SELECT HASH_AGG(*) FROM DATA_JEDAIS.FINS__PUBLIC.WORLD_CHECK_AML_FIXTURE) = $hash_before
    AS idempotency_hash_unchanged;
-- Expected: TRUE  (same calendar day → byte-identical output)

-- ---------------------------------------------------------------------------
-- 17. Cleanup
-- ---------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_WORLD_CHECK_AML_FIXTURE();
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.WORLD_CHECK_AML_FIXTURE_STAGING;
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.WORLD_CHECK_AML_FIXTURE;
DROP VIEW      IF EXISTS DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS_WCAML_FIXTURE;
DELETE FROM DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG WHERE TASK_NAME = 'TASK_DAILY_WORLD_CHECK_AML_FIXTURE';
