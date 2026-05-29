-- =============================================================================
-- L2 integration test for SP_GENERATE_ZOOMINFO_FIRMOGRAPHICS
-- =============================================================================
-- Plan:    docs/superpowers/plans/2026-05-28-cumulus-plan-11-zoominfo-firmographics.md
-- Task:    Plan 11 T5
-- Run:     snow sql -f tests/integration/test_zoominfo_firmographics_sp.sql
-- Pass:    Every assertion column returns TRUE. Any FALSE = test failure.
--
-- Strategy:
--   Same fixture-cloning pattern as Plans 6, 7, 8: clone the deployed SP into
--   FINS.PUBLIC.SP_GENERATE_ZOOMINFO_FIRMOGRAPHICS_FIXTURE via GET_DDL plus
--   REPLACE, redirecting the audience view, dataset table, staging table,
--   and task-name FQNs to fixture-scoped names. Sentinel-based ordering
--   avoids substring collision when ZOOMINFO_FIRMOGRAPHICS expands to
--   ZOOMINFO_FIRMOGRAPHICS_FIXTURE (otherwise SP_GENERATE_ZOOMINFO_FIRMOGRAPHICS,
--   ZOOMINFO_FIRMOGRAPHICS_STAGING, and TASK_MONTHLY_ZOOMINFO_FIRMOGRAPHICS
--   would all gain a stray _FIXTURE suffix in the wrong slot during the
--   dataset-table swap).
--
-- Plan 11 differences from Plans 1-10:
--   - BUSINESS audience (12,021 anchors live; 5 in fixture). Plan 11 uses
--     the same audience predicate as Plans 2 (MSCI) and 3 (D+B).
--   - 15-column output contract: 13 NOT NULL plus 2 NULLable VARCHAR
--     (WEBSITE_DOMAIN, TECH_STACK_FLAGS) gated by data-availability
--     heuristics rather than enums.
--   - Defensive HQ-string projection per Plan 4 v1.5 findings: the SP
--     projects the literal HQ_COUNTRY_CODE='US' regardless of source value,
--     synth-fallbacks HQ_POSTAL_CODE to a deterministic 5-digit ZIP from
--     seed bytes when raw is empty, and fallbacks HQ_STATE_CODE via
--     _state_from_zip when raw is blank or shorter than 2 chars. The
--     load-bearing assertions for this Plan exercise those three defensive
--     paths via dirty fixture inputs (empty POSTAL_CODE, 'USA' COUNTRY_CODE,
--     empty STATE_CODE) and verify the projected output still satisfies
--     len=2 / len=5 / literal-'US' invariants.
--   - MONTHLY cadence (PROFILE_MONTH, not PROFILE_DATE). 1:1 emit per
--     BUSINESS anchor per month -- 5 in-audience fixture anchors -> 5 rows.
--
-- Pre-requisites:
--   1. SP_GENERATE_ZOOMINFO_FIRMOGRAPHICS deployed (run scripts/deploy_sp.py first).
-- =============================================================================

USE SCHEMA FINS.PUBLIC;

-- ---------------------------------------------------------------------------
-- 1. Drop any leftover objects from a prior failed run so the test is
--    idempotent end-to-end.
-- ---------------------------------------------------------------------------
DROP TABLE     IF EXISTS FINS.PUBLIC.ZOOMINFO_FIRMOGRAPHICS_FIXTURE;
DROP TABLE     IF EXISTS FINS.PUBLIC.ZOOMINFO_FIRMOGRAPHICS_FIXTURE_STAGING;
DROP PROCEDURE IF EXISTS FINS.PUBLIC.SP_GENERATE_ZOOMINFO_FIRMOGRAPHICS_FIXTURE();
DROP VIEW      IF EXISTS FINS.PUBLIC.V_ACCOUNT_ANCHORS_ZOOMINFO_FIXTURE;

-- ---------------------------------------------------------------------------
-- 2. Materialise the L2 fixture audience view: 14 anchors total.
--    -  5 BUSINESS anchors (in audience) covering the EMPLOYEE_BAND ladder
--       roughly one-per-band, with INDUSTRY variety (Banking, Tech,
--       Manufacturing, Retail, Energy):
--          ZI-FIX-BU-01: tiny shop  (5 emp)     band 1-10        Banking
--          ZI-FIX-BU-02: small      (35 emp)    band 11-50       Tech
--          ZI-FIX-BU-03: mid        (250 emp)   band 201-1000    Manufacturing
--          ZI-FIX-BU-04: large      (3000 emp)  band 1001-5000   Retail
--          ZI-FIX-BU-05: mega       (30000 emp) band 25001+      Energy
--       Three of these BUSINESS anchors carry intentionally-dirty input
--       to exercise the SP's defensive HQ-string projection paths:
--          BU-02 (Tech 35 emp):  POSTAL_CODE = ''        -> synth ZIP fallback
--          BU-03 (Mfg 250 emp):  COUNTRY_CODE = 'USA'    -> literal 'US' projection
--          BU-04 (Retail 3000):  STATE_CODE = ''         -> _state_from_zip fallback
--    -  9 non-BUSINESS anchors (out of audience -- 'ZOOMINFO-FIX-NW-' prefix
--       to make the audience-filter assertion trivially expressible):
--          4 Retail PERSON
--          2 Wealth Management PERSON
--          2 Household PERSON
--          1 Commercial Banking PERSON  (yes -- a Person row in CB drift)
--    The audience predicate ACCOUNT_TYPE_FLAG = 'BUSINESS' filters the 9
--    non-BUSINESS anchors out of the SP's row factory, so only 5 rows
--    land in the dataset table.
--
--    Column shape mirrors V_ACCOUNT_ANCHORS exactly (15 columns) so the
--    cloned SP's audience SELECT compiles unchanged.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW FINS.PUBLIC.V_ACCOUNT_ANCHORS_ZOOMINFO_FIXTURE AS
-- 5 BUSINESS anchors -- IN AUDIENCE.
SELECT
    'ZOOMINFO-FIX-BU-01'::VARCHAR     AS ACCOUNT_ID,
    'Pinewood Holdings LLC'::VARCHAR  AS ACCOUNT_NAME,
    '2026-05-28'::DATE                AS SNAPSHOT_DATE,
    'Commercial Banking'::VARCHAR     AS CLIENT_CATEGORY,
    'BUSINESS'::VARCHAR               AS ACCOUNT_TYPE_FLAG,
    NULL::TIMESTAMP_LTZ               AS BIRTHDATE,
    NULL::NUMBER                      AS ANNUAL_INCOME,
    NULL::NUMBER                      AS CREDIT_SCORE,
    'Banking'::VARCHAR                AS INDUSTRY,
    850000::NUMBER                    AS ANNUAL_REVENUE,
    5::NUMBER                         AS EMPLOYEE_COUNT,           -- band 1-10
    '94027'::VARCHAR                  AS POSTAL_CODE,
    'CA'::VARCHAR                     AS STATE_CODE,
    'US'::VARCHAR                     AS COUNTRY_CODE,
    'ZOOMINFO-FIX-001'::VARCHAR       AS EXTERNAL_ID
-- BU-02: Tech, 35 emp, EMPTY POSTAL_CODE -- exercises synth ZIP fallback.
UNION ALL SELECT 'ZOOMINFO-FIX-BU-02', 'Vertex Software Co',     '2026-05-28'::DATE, 'Small Business',     'BUSINESS', NULL::TIMESTAMP_LTZ, NULL, NULL, 'Tech',          7800000,    35, '',      'TX', 'US',  'ZOOMINFO-FIX-002'
-- BU-03: Manufacturing, 250 emp, dirty COUNTRY_CODE='USA' -- exercises literal 'US' projection.
UNION ALL SELECT 'ZOOMINFO-FIX-BU-03', 'Ironclad Industrial Inc','2026-05-28'::DATE, 'Commercial Banking', 'BUSINESS', NULL::TIMESTAMP_LTZ, NULL, NULL, 'Manufacturing', 47000000,   250, '60601', 'IL', 'USA', 'ZOOMINFO-FIX-003'
-- BU-04: Retail, 3000 emp, EMPTY STATE_CODE -- exercises _state_from_zip fallback.
UNION ALL SELECT 'ZOOMINFO-FIX-BU-04', 'Northstar Retail Group', '2026-05-28'::DATE, 'Commercial Banking', 'BUSINESS', NULL::TIMESTAMP_LTZ, NULL, NULL, 'Retail',       420000000,  3000, '10001', '',   'US',  'ZOOMINFO-FIX-004'
-- BU-05: Energy, 30000 emp -- mega-enterprise, clean inputs.
UNION ALL SELECT 'ZOOMINFO-FIX-BU-05', 'Helios Petroleum Corp',  '2026-05-28'::DATE, 'Commercial Banking', 'BUSINESS', NULL::TIMESTAMP_LTZ, NULL, NULL, 'Energy',     12500000000, 30000, '77002', 'TX', 'US',  'ZOOMINFO-FIX-005'
-- 9 non-BUSINESS anchors -- OUT OF AUDIENCE.
-- 4 Retail PERSON
UNION ALL SELECT 'ZOOMINFO-FIX-NW-R1', 'Riley Park',     '2026-05-28'::DATE, 'Retail',            'PERSON',  '1996-08-22'::TIMESTAMP_LTZ,  62000, 700, NULL, NULL, NULL, '10025', 'NY', 'US', 'ZOOMINFO-FIX-006'
UNION ALL SELECT 'ZOOMINFO-FIX-NW-R2', 'Casey Reed',     '2026-05-28'::DATE, 'Retail',            'PERSON',  '1971-11-05'::TIMESTAMP_LTZ,  95000, 720, NULL, NULL, NULL, '02115', 'MA', 'US', 'ZOOMINFO-FIX-007'
UNION ALL SELECT 'ZOOMINFO-FIX-NW-R3', 'Pat Donovan',    '2026-05-28'::DATE, 'Retail',            'PERSON',  '1958-12-03'::TIMESTAMP_LTZ,  72000, 720, NULL, NULL, NULL, '10001', 'NY', 'US', 'ZOOMINFO-FIX-008'
UNION ALL SELECT 'ZOOMINFO-FIX-NW-R4', 'Drew Mitchell',  '2026-05-28'::DATE, 'Retail',            'PERSON',  '2007-07-19'::TIMESTAMP_LTZ,  45000, 690, NULL, NULL, NULL, '02101', 'MA', 'US', 'ZOOMINFO-FIX-009'
-- 2 Wealth Management PERSON
UNION ALL SELECT 'ZOOMINFO-FIX-NW-W1', 'Quinn Marlowe',  '2026-05-28'::DATE, 'Wealth Management', 'PERSON',  '1981-06-12'::TIMESTAMP_LTZ, 390000, 790, NULL, NULL, NULL, '77002', 'TX', 'US', 'ZOOMINFO-FIX-010'
UNION ALL SELECT 'ZOOMINFO-FIX-NW-W2', 'Morgan Hayes',   '2026-05-28'::DATE, 'Wealth Management', 'PERSON',  '1961-09-30'::TIMESTAMP_LTZ, 720000, 800, NULL, NULL, NULL, '60601', 'IL', 'US', 'ZOOMINFO-FIX-011'
-- 2 Household PERSON
UNION ALL SELECT 'ZOOMINFO-FIX-NW-H1', 'Sam Walters',    '2026-05-28'::DATE, 'Household',         'PERSON',  '1984-02-18'::TIMESTAMP_LTZ,  88000, 730, NULL, NULL, NULL, '33139', 'FL', 'US', 'ZOOMINFO-FIX-012'
UNION ALL SELECT 'ZOOMINFO-FIX-NW-H2', 'Alex Brennan',   '2026-05-28'::DATE, 'Household',         'PERSON',  '1954-01-22'::TIMESTAMP_LTZ, 150000, 760, NULL, NULL, NULL, '90001', 'CA', 'US', 'ZOOMINFO-FIX-013'
-- 1 Commercial Banking PERSON (drift case -- a Person row inside the CB category)
UNION ALL SELECT 'ZOOMINFO-FIX-NW-C1', 'Jordan Vega',    '2026-05-28'::DATE, 'Commercial Banking','PERSON',  '1974-04-22'::TIMESTAMP_LTZ, 240000, 780, NULL, NULL, NULL, '10005', 'NY', 'US', 'ZOOMINFO-FIX-014';

-- ---------------------------------------------------------------------------
-- 3. Materialise the fixture-scoped target table: same DDL as
--    FINS.PUBLIC.ZOOMINFO_FIRMOGRAPHICS but renamed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE TABLE FINS.PUBLIC.ZOOMINFO_FIRMOGRAPHICS_FIXTURE
LIKE FINS.PUBLIC.ZOOMINFO_FIRMOGRAPHICS;

-- ---------------------------------------------------------------------------
-- 4. Clone SP_GENERATE_ZOOMINFO_FIRMOGRAPHICS into ..._FIXTURE with FQN swaps:
--      V_ACCOUNT_ANCHORS                       -> V_ACCOUNT_ANCHORS_ZOOMINFO_FIXTURE
--      ZOOMINFO_FIRMOGRAPHICS (table)          -> ZOOMINFO_FIRMOGRAPHICS_FIXTURE
--      ZOOMINFO_FIRMOGRAPHICS_STAGING          -> ZOOMINFO_FIRMOGRAPHICS_FIXTURE_STAGING
--      SP_GENERATE_ZOOMINFO_FIRMOGRAPHICS      -> SP_GENERATE_ZOOMINFO_FIRMOGRAPHICS_FIXTURE
--      TASK_MONTHLY_ZOOMINFO_FIRMOGRAPHICS     -> TASK_MONTHLY_ZOOMINFO_FIRMOGRAPHICS_FIXTURE
--    Sentinel-based ordering avoids substring-collision in repeated REPLACE
--    passes (e.g. replacing ZOOMINFO_FIRMOGRAPHICS first would catch the stem of
--    SP_GENERATE_ZOOMINFO_FIRMOGRAPHICS, ZOOMINFO_FIRMOGRAPHICS_STAGING, and
--    TASK_MONTHLY_ZOOMINFO_FIRMOGRAPHICS and double-suffix them).
-- ---------------------------------------------------------------------------
EXECUTE IMMEDIATE $$
DECLARE
    sp_ddl STRING;
BEGIN
    sp_ddl := (SELECT GET_DDL('PROCEDURE', 'FINS.PUBLIC.SP_GENERATE_ZOOMINFO_FIRMOGRAPHICS()'));
    -- Step 1: stash the suffix-bearing identifiers behind sentinels.
    sp_ddl := REPLACE(sp_ddl, 'ZOOMINFO_FIRMOGRAPHICS_STAGING',     '__ZI_STG__');
    sp_ddl := REPLACE(sp_ddl, 'SP_GENERATE_ZOOMINFO_FIRMOGRAPHICS', '__ZI_SP__');
    sp_ddl := REPLACE(sp_ddl, 'TASK_MONTHLY_ZOOMINFO_FIRMOGRAPHICS','__ZI_TASK__');
    -- Step 2: now ZOOMINFO_FIRMOGRAPHICS (the dataset table) is unambiguous.
    sp_ddl := REPLACE(sp_ddl, 'ZOOMINFO_FIRMOGRAPHICS',             'ZOOMINFO_FIRMOGRAPHICS_FIXTURE');
    -- Step 3: expand sentinels back to fixture-suffixed names.
    sp_ddl := REPLACE(sp_ddl, '__ZI_STG__',                         'ZOOMINFO_FIRMOGRAPHICS_FIXTURE_STAGING');
    sp_ddl := REPLACE(sp_ddl, '__ZI_SP__',                          'SP_GENERATE_ZOOMINFO_FIRMOGRAPHICS_FIXTURE');
    sp_ddl := REPLACE(sp_ddl, '__ZI_TASK__',                        'TASK_MONTHLY_ZOOMINFO_FIRMOGRAPHICS_FIXTURE');
    -- Step 4: redirect audience view.
    sp_ddl := REPLACE(sp_ddl, 'V_ACCOUNT_ANCHORS',                  'V_ACCOUNT_ANCHORS_ZOOMINFO_FIXTURE');
    EXECUTE IMMEDIATE :sp_ddl;
    RETURN 'fixture SP staged';
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. First run.
-- ---------------------------------------------------------------------------
CALL FINS.PUBLIC.SP_GENERATE_ZOOMINFO_FIRMOGRAPHICS_FIXTURE();

-- ---------------------------------------------------------------------------
-- 6. Coverage assertion #1: distinct ACCOUNT_ID == post-filter audience size.
-- 14 anchors in the view, audience predicate BUSINESS-only filters 9
-- non-BUSINESS out, leaving exactly 5 distinct accounts in the dataset.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(DISTINCT ACCOUNT_ID) FROM FINS.PUBLIC.ZOOMINFO_FIRMOGRAPHICS_FIXTURE) = 5
    AS distinct_accounts_assertion_passes;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 7. 1:1 emit assertion #2: COUNT(*) == post-filter audience size (5).
-- BUSINESS audience (5) + 1:1 emit per anchor per month -> row count = 5.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM FINS.PUBLIC.ZOOMINFO_FIRMOGRAPHICS_FIXTURE) = 5
    AS row_count_assertion_passes;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 8. Audience-filter assertion #3: zero rows have a non-BUSINESS fixture
-- prefix. Confirms the SP's WHERE ACCOUNT_TYPE_FLAG = 'BUSINESS' predicate
-- excluded the 9 'ZOOMINFO-FIX-NW-%' anchors.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM FINS.PUBLIC.ZOOMINFO_FIRMOGRAPHICS_FIXTURE
       WHERE ACCOUNT_ID LIKE 'ZOOMINFO-FIX-NW-%') = 0
    AS audience_filter_excludes_non_business;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 9. Column-population assertion #4: every NOT NULL column populated for
-- every row (no surprise NULLs in the 13 NOT NULL columns). The 2 NULLable
-- columns (WEBSITE_DOMAIN, TECH_STACK_FLAGS) are intentionally exempt --
-- they are gated by data-availability heuristics and tested distributionally
-- at L1 over a multi-month roll, not at L2.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM FINS.PUBLIC.ZOOMINFO_FIRMOGRAPHICS_FIXTURE
       WHERE ACCOUNT_ID                    IS NULL
          OR PROFILE_MONTH                 IS NULL
          OR EMPLOYEE_BAND                 IS NULL
          OR REVENUE_BAND                  IS NULL
          OR INDUSTRY_NAICS_CODE           IS NULL
          OR INDUSTRY_SIC_CODE             IS NULL
          OR FOUNDED_YEAR                  IS NULL
          OR HQ_COUNTRY_CODE               IS NULL
          OR HQ_STATE_CODE                 IS NULL
          OR HQ_POSTAL_CODE                IS NULL
          OR LINKEDIN_FOLLOWERS            IS NULL
          OR LAST_DATA_REFRESH_DATE        IS NULL
          OR GENERATED_AT                  IS NULL) = 0
    AS not_null_columns_populated;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 10. Defensive-string assertion #5a: HQ_COUNTRY_CODE is the literal 'US'
-- for every row, regardless of source COUNTRY_CODE. Row BU-03 carries the
-- dirty literal 'USA' in the fixture; the SP's literal 'US' projection
-- must convert it (and the VARCHAR(2) DDL would otherwise fail to insert).
-- This is the load-bearing assertion for v1.5 finding #5 in Plan 11.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM FINS.PUBLIC.ZOOMINFO_FIRMOGRAPHICS_FIXTURE
       WHERE HQ_COUNTRY_CODE NOT IN ('US')) = 0
    AS hq_country_code_literal_us;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 11. Defensive-string assertion #5b: HQ_POSTAL_CODE is exactly 5 chars for
-- every row. Row BU-02 carries POSTAL_CODE = '' in the fixture; the SP's
-- synth-fallback must produce a deterministic 5-digit ZIP from seed bytes.
-- This is the load-bearing assertion for v1.5 finding #4 in Plan 11.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM FINS.PUBLIC.ZOOMINFO_FIRMOGRAPHICS_FIXTURE
       WHERE LENGTH(HQ_POSTAL_CODE) <> 5) = 0
    AS hq_postal_code_length_5;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 12. Defensive-string assertion #5c: HQ_STATE_CODE is exactly 2 chars for
-- every row. Row BU-04 carries STATE_CODE = '' in the fixture; the SP's
-- _state_from_zip helper must fallback when raw is blank or shorter than 2.
-- This is the load-bearing assertion for the STATE_CODE empty-string drift
-- branch of v1.5 finding #4 in Plan 11.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM FINS.PUBLIC.ZOOMINFO_FIRMOGRAPHICS_FIXTURE
       WHERE LENGTH(HQ_STATE_CODE) <> 2) = 0
    AS hq_state_code_length_2;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 13. EMPLOYEE_BAND vocabulary assertion #6a: all values in the 7-bucket set.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM FINS.PUBLIC.ZOOMINFO_FIRMOGRAPHICS_FIXTURE
       WHERE EMPLOYEE_BAND NOT IN
           ('1-10','11-50','51-200','201-1000','1001-5000','5001-25000','25001+')) = 0
    AS employee_band_vocabulary_ok;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 14. REVENUE_BAND vocabulary assertion #6b: all values in the 6-bucket set.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM FINS.PUBLIC.ZOOMINFO_FIRMOGRAPHICS_FIXTURE
       WHERE REVENUE_BAND NOT IN
           ('<$1M','$1M-$10M','$10M-$50M','$50M-$200M','$200M-$1B','$1B+')) = 0
    AS revenue_band_vocabulary_ok;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 15. EMPLOYEE_BAND consistency assertion #7: per-row JOIN back to the
-- fixture view confirms each fixture EMPLOYEE_COUNT maps to its expected
-- band. Captures: 5 emp -> '1-10'; 35 emp -> '11-50'; 250 emp -> '201-1000';
-- 3000 emp -> '1001-5000'; 30000 emp -> '25001+'. CASE expression encodes
-- the rowspec band ladder; mismatches surface here before they leak to L3.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*)
     FROM   FINS.PUBLIC.ZOOMINFO_FIRMOGRAPHICS_FIXTURE             d
     JOIN   FINS.PUBLIC.V_ACCOUNT_ANCHORS_ZOOMINFO_FIXTURE          a
       ON   d.ACCOUNT_ID = a.ACCOUNT_ID
     WHERE  d.EMPLOYEE_BAND <> CASE
                WHEN a.EMPLOYEE_COUNT IS NULL OR a.EMPLOYEE_COUNT = 0 THEN '1-10'
                WHEN a.EMPLOYEE_COUNT BETWEEN 1     AND 10           THEN '1-10'
                WHEN a.EMPLOYEE_COUNT BETWEEN 11    AND 50           THEN '11-50'
                WHEN a.EMPLOYEE_COUNT BETWEEN 51    AND 200          THEN '51-200'
                WHEN a.EMPLOYEE_COUNT BETWEEN 201   AND 1000         THEN '201-1000'
                WHEN a.EMPLOYEE_COUNT BETWEEN 1001  AND 5000         THEN '1001-5000'
                WHEN a.EMPLOYEE_COUNT BETWEEN 5001  AND 25000        THEN '5001-25000'
                ELSE '25001+'
            END) = 0
    AS employee_band_matches_employee_count;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 16. Range invariant #8a: FOUNDED_YEAR <= EXTRACT(YEAR FROM CURRENT_DATE).
-- The SP hard-caps founded year at run_ts.year -- no future-founded
-- businesses leak through.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM FINS.PUBLIC.ZOOMINFO_FIRMOGRAPHICS_FIXTURE
       WHERE FOUNDED_YEAR > EXTRACT(YEAR FROM CURRENT_DATE())) = 0
    AS founded_year_not_future;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 17. Range invariant #8b: LINKEDIN_FOLLOWERS in [0, 5_000_000].
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM FINS.PUBLIC.ZOOMINFO_FIRMOGRAPHICS_FIXTURE
       WHERE LINKEDIN_FOLLOWERS NOT BETWEEN 0 AND 5000000) = 0
    AS linkedin_followers_in_range;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 18. Code-shape invariant #9a: INDUSTRY_NAICS_CODE is exactly 6 digits
-- for every row (no leading-zero loss; VARCHAR storage holds shape).
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM FINS.PUBLIC.ZOOMINFO_FIRMOGRAPHICS_FIXTURE
       WHERE NOT REGEXP_LIKE(INDUSTRY_NAICS_CODE, '^[0-9]{6}$')) = 0
    AS naics_code_six_digits;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 19. Code-shape invariant #9b: INDUSTRY_SIC_CODE is exactly 4 digits
-- for every row.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM FINS.PUBLIC.ZOOMINFO_FIRMOGRAPHICS_FIXTURE
       WHERE NOT REGEXP_LIKE(INDUSTRY_SIC_CODE, '^[0-9]{4}$')) = 0
    AS sic_code_four_digits;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 20. Date-coherence #10: LAST_DATA_REFRESH_DATE <= CURRENT_DATE().
-- The SP draws within [run_ts.date() - 90d, run_ts.date()] -- no future
-- refresh dates leak through.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM FINS.PUBLIC.ZOOMINFO_FIRMOGRAPHICS_FIXTURE
       WHERE LAST_DATA_REFRESH_DATE > CURRENT_DATE()) = 0
    AS last_data_refresh_not_future;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 21. Idempotency assertion #11a: a second run leaves the row count
-- unchanged (MERGE-not-INSERT) and produces byte-identical output
-- (deterministic seed bucketed on month_start).
-- ---------------------------------------------------------------------------
SET row_count_before = (SELECT COUNT(*) FROM FINS.PUBLIC.ZOOMINFO_FIRMOGRAPHICS_FIXTURE);
SET hash_before      = (SELECT HASH_AGG(*) FROM FINS.PUBLIC.ZOOMINFO_FIRMOGRAPHICS_FIXTURE);

CALL FINS.PUBLIC.SP_GENERATE_ZOOMINFO_FIRMOGRAPHICS_FIXTURE();

SELECT
    (SELECT COUNT(*) FROM FINS.PUBLIC.ZOOMINFO_FIRMOGRAPHICS_FIXTURE) = $row_count_before
    AS idempotency_row_count_unchanged;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 22. Idempotency assertion #11b: HASH_AGG of all columns unchanged
-- across the two runs -- same calendar month -> byte-identical output.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT HASH_AGG(*) FROM FINS.PUBLIC.ZOOMINFO_FIRMOGRAPHICS_FIXTURE) = $hash_before
    AS idempotency_hash_unchanged;
-- Expected: TRUE  (same calendar month -> byte-identical output)

-- ---------------------------------------------------------------------------
-- 23. Cleanup
-- ---------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS FINS.PUBLIC.SP_GENERATE_ZOOMINFO_FIRMOGRAPHICS_FIXTURE();
DROP TABLE     IF EXISTS FINS.PUBLIC.ZOOMINFO_FIRMOGRAPHICS_FIXTURE_STAGING;
DROP TABLE     IF EXISTS FINS.PUBLIC.ZOOMINFO_FIRMOGRAPHICS_FIXTURE;
DROP VIEW      IF EXISTS FINS.PUBLIC.V_ACCOUNT_ANCHORS_ZOOMINFO_FIXTURE;
DELETE FROM FINS.PUBLIC.TASK_EXECUTION_LOG WHERE TASK_NAME = 'TASK_MONTHLY_ZOOMINFO_FIRMOGRAPHICS_FIXTURE';
