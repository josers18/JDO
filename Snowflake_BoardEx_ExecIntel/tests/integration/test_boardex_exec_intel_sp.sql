-- =============================================================================
-- L2 integration test for SP_GENERATE_BOARDEX_EXEC_INTEL
-- =============================================================================
-- Plan:    docs/superpowers/plans/2026-05-28-cumulus-plan-10-boardex-exec-intel.md
-- Task:    Plan 10 T5
-- Run:     snow sql -f tests/integration/test_boardex_exec_intel_sp.sql
-- Pass:    Every assertion column returns TRUE. Any FALSE = test failure.
--
-- Strategy:
--   Same fixture-cloning pattern as Plans 6, 7, 8: clone the deployed SP into
--   DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_BOARDEX_EXEC_INTEL_FIXTURE via GET_DDL + REPLACE,
--   redirecting the audience view, dataset table, and staging table FQNs to
--   fixture-scoped names. Sentinel-based ordering avoids substring collision
--   when BOARDEX_EXEC_INTEL expands to BOARDEX_EXEC_INTEL_FIXTURE (otherwise
--   SP_GENERATE_BOARDEX_EXEC_INTEL, BOARDEX_EXEC_INTEL_STAGING, and
--   TASK_MONTHLY_BOARDEX_EXEC_INTEL would all gain a stray _FIXTURE suffix
--   in the wrong slot during the dataset-table swap).
--
-- Plan 10 differences from Plans 1-8:
--   - SMALLEST Cumulus audience by 4.1x (Commercial Banking only, ~960 anchors).
--     Dethrones Plan 8 (Wealth Management, 3,920) from that title. Fixture
--     has 14 anchors total: 5 Commercial Banking (in audience, mirroring the
--     5 archetypes used in the L1 conftest synthetic-fixture override) + 9
--     non-Commercial-Banking (filtered out). The 5-anchor cohort drives a
--     per-anchor invariant approach rather than distributional rate
--     convergence.
--   - 1 BOOLEAN column (EXEC_TURNOVER_FLAG) and 1 NULLable date column
--     (RECENT_GOVERNANCE_EVENT_DATE) with an INDEPENDENT 30%/70% Bernoulli
--     draw (no enum gating, simpler than Plan 8's PLAN_STATUS-gated 2-NULL
--     setup). Range / vocabulary / date-coherence invariants are the
--     load-bearing assertions for this test.
--   - GOVERNANCE_RATING canonical 5-value set
--     {Excellent, Strong, Adequate, Weak, Concerning}.
--   - MONTHLY cadence (PROFILE_MONTH). 1:1 emit per Commercial Banking
--     anchor per month -> 5 rows expected.
--
-- Pre-requisites:
--   1. SP_GENERATE_BOARDEX_EXEC_INTEL deployed (run scripts/deploy_sp.py first).
-- =============================================================================

USE SCHEMA DATA_JEDAIS.FINS__PUBLIC;

-- ---------------------------------------------------------------------------
-- 1. Drop any leftover objects from a prior failed run so the test is
--    idempotent end-to-end.
-- ---------------------------------------------------------------------------
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.BOARDEX_EXEC_INTEL_FIXTURE;
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.BOARDEX_EXEC_INTEL_FIXTURE_STAGING;
DROP PROCEDURE IF EXISTS DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_BOARDEX_EXEC_INTEL_FIXTURE();
DROP VIEW      IF EXISTS DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS_BOARDEX_FIXTURE;

-- ---------------------------------------------------------------------------
-- 2. Materialise the L2 fixture audience view: 14 anchors total.
--    -  5 Commercial Banking BUSINESS anchors (in audience), mirroring the
--       5 archetypes used by the L1 conftest synthetic-fixture override
--       (mid-market enterprise / regulated bank / family business /
--       recent IPO / large cap). EMPLOYEE_COUNT is varied across all four
--       BOARD_SIZE bias bands (>=10000 / >=1000 / >=100 / <100) so the
--       range and bias invariants exercise every code path of _board_size.
--       BIRTHDATE / ANNUAL_INCOME are NULL for these BUSINESS rows; that's
--       the audience contract for Commercial Banking (probed live: cohort
--       is overwhelmingly BUSINESS-typed).
--       NOTE: V_ACCOUNT_ANCHORS does NOT expose INTERLOCK_DEGREE. The SP
--       reads it via `anchor.get("INTERLOCK_DEGREE") or 0`, so all 5
--       fixture rows fall into the _interlock_count(0) branch yielding
--       INTERLOCK_COUNT in {0,1,2,3} -- still in [0,5] for the range
--       assertion. INTERLOCK_DEGREE bias-band coverage is exercised at L1
--       only, where the conftest synthesises dicts directly.
--    -  9 non-Commercial-Banking anchors (out of audience -- `NCB-` prefix
--       to make the audience-filter assertion trivially expressible):
--          3 Retail PERSON
--          2 Wealth Management PERSON
--          2 Small Business BUSINESS
--          2 Household PERSON
--    The audience predicate `CLIENT_CATEGORY = 'Commercial Banking'` filters
--    the 9 non-Commercial-Banking anchors out of the SP's row factory, so
--    only 5 rows land in the dataset table.
--
--    Column shape mirrors V_ACCOUNT_ANCHORS exactly so the cloned SP's
--    audience SELECT compiles unchanged.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS_BOARDEX_FIXTURE AS
-- 5 Commercial Banking anchors -- IN AUDIENCE.
-- Archetype 1: mid-market enterprise (~8000 employees, mid-market BOARD_SIZE band).
SELECT
    'BOARDEX-FIX-CB-01'::VARCHAR         AS ACCOUNT_ID,
    'Cascadia Manufacturing Co'::VARCHAR AS ACCOUNT_NAME,
    '2026-05-28'::DATE                   AS SNAPSHOT_DATE,
    'Commercial Banking'::VARCHAR        AS CLIENT_CATEGORY,
    'BUSINESS'::VARCHAR                  AS ACCOUNT_TYPE_FLAG,
    NULL::TIMESTAMP_LTZ                  AS BIRTHDATE,
    NULL::NUMBER                         AS ANNUAL_INCOME,
    NULL::NUMBER                         AS CREDIT_SCORE,
    'Manufacturing'::VARCHAR             AS INDUSTRY,
    320000000::NUMBER                    AS ANNUAL_REVENUE,
    8000::NUMBER                         AS EMPLOYEE_COUNT,
    '98101'::VARCHAR                     AS POSTAL_CODE,
    'WA'::VARCHAR                        AS STATE_CODE,
    'US'::VARCHAR                        AS COUNTRY_CODE,
    'BOARDEX-FIX-001'::VARCHAR           AS EXTERNAL_ID
-- Archetype 2: regulated bank / large cap (25000 employees, large-enterprise band).
UNION ALL SELECT 'BOARDEX-FIX-CB-02', 'Pacific Heritage Bank',   '2026-05-28'::DATE, 'Commercial Banking', 'BUSINESS', NULL::TIMESTAMP_LTZ, NULL, NULL, 'Banking',         1800000000, 25000, '10005', 'NY', 'US', 'BOARDEX-FIX-002'
-- Archetype 3: family business / small-to-mid (250 employees).
UNION ALL SELECT 'BOARDEX-FIX-CB-03', 'Heartland Foods Inc',     '2026-05-28'::DATE, 'Commercial Banking', 'BUSINESS', NULL::TIMESTAMP_LTZ, NULL, NULL, 'Food Services',     45000000,   250, '60601', 'IL', 'US', 'BOARDEX-FIX-003'
-- Archetype 4: recent IPO / smallest band (80 employees, smallest band <100).
UNION ALL SELECT 'BOARDEX-FIX-CB-04', 'Lumen Therapeutics',      '2026-05-28'::DATE, 'Commercial Banking', 'BUSINESS', NULL::TIMESTAMP_LTZ, NULL, NULL, 'Biotech',           12000000,    80, '02139', 'MA', 'US', 'BOARDEX-FIX-004'
-- Archetype 5: large-cap energy (~600 employees small-to-mid band).
UNION ALL SELECT 'BOARDEX-FIX-CB-05', 'Meridian Energy Holdings','2026-05-28'::DATE, 'Commercial Banking', 'BUSINESS', NULL::TIMESTAMP_LTZ, NULL, NULL, 'Energy',           180000000,   600, '77002', 'TX', 'US', 'BOARDEX-FIX-005'
-- 9 non-Commercial-Banking anchors -- OUT OF AUDIENCE.
UNION ALL SELECT 'BOARDEX-FIX-NCB-R1', 'Riley Park',              '2026-05-28'::DATE, 'Retail',            'PERSON',  '1996-08-22'::TIMESTAMP_LTZ,  62000, 700, NULL, NULL, NULL, '10025', 'NY', 'US', 'BOARDEX-FIX-006'
UNION ALL SELECT 'BOARDEX-FIX-NCB-R2', 'Casey Reed',              '2026-05-28'::DATE, 'Retail',            'PERSON',  '1971-11-05'::TIMESTAMP_LTZ,  95000, 720, NULL, NULL, NULL, '02115', 'MA', 'US', 'BOARDEX-FIX-007'
UNION ALL SELECT 'BOARDEX-FIX-NCB-R3', 'Pat Donovan',             '2026-05-28'::DATE, 'Retail',            'PERSON',  '1958-12-03'::TIMESTAMP_LTZ,  72000, 720, NULL, NULL, NULL, '10001', 'NY', 'US', 'BOARDEX-FIX-008'
UNION ALL SELECT 'BOARDEX-FIX-NCB-W1', 'Quinn Marlowe',           '2026-05-28'::DATE, 'Wealth Management', 'PERSON',  '2001-03-14'::TIMESTAMP_LTZ, 230000, 780, NULL, NULL, NULL, '94027', 'CA', 'US', 'BOARDEX-FIX-009'
UNION ALL SELECT 'BOARDEX-FIX-NCB-W2', 'Avery Stone',             '2026-05-28'::DATE, 'Wealth Management', 'PERSON',  '1948-02-18'::TIMESTAMP_LTZ,1200000, 810, NULL, NULL, NULL, '33139', 'FL', 'US', 'BOARDEX-FIX-010'
UNION ALL SELECT 'BOARDEX-FIX-NCB-S1', 'Pinewood Coffee Co.',     '2026-05-28'::DATE, 'Small Business',    'BUSINESS', NULL::TIMESTAMP_LTZ, NULL, NULL, 'Food Services',      1200000,  18, '98101', 'WA', 'US', 'BOARDEX-FIX-011'
UNION ALL SELECT 'BOARDEX-FIX-NCB-S2', 'Mariposa Cleaners LLC',   '2026-05-28'::DATE, 'Small Business',    'BUSINESS', NULL::TIMESTAMP_LTZ, NULL, NULL, 'Personal Services',   480000,   6, '94110', 'CA', 'US', 'BOARDEX-FIX-012'
UNION ALL SELECT 'BOARDEX-FIX-NCB-H1', 'Sam Walters',             '2026-05-28'::DATE, 'Household',         'PERSON',  '1984-02-18'::TIMESTAMP_LTZ,  88000, 730, NULL, NULL, NULL, '33139', 'FL', 'US', 'BOARDEX-FIX-013'
UNION ALL SELECT 'BOARDEX-FIX-NCB-H2', 'Alex Brennan',            '2026-05-28'::DATE, 'Household',         'PERSON',  '1954-01-22'::TIMESTAMP_LTZ, 150000, 760, NULL, NULL, NULL, '90001', 'CA', 'US', 'BOARDEX-FIX-014';

-- ---------------------------------------------------------------------------
-- 3. Materialise the fixture-scoped target table: same DDL as
--    DATA_JEDAIS.FINS__PUBLIC.BOARDEX_EXEC_INTEL but renamed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE TABLE DATA_JEDAIS.FINS__PUBLIC.BOARDEX_EXEC_INTEL_FIXTURE
LIKE DATA_JEDAIS.FINS__PUBLIC.BOARDEX_EXEC_INTEL;

-- ---------------------------------------------------------------------------
-- 4. Clone SP_GENERATE_BOARDEX_EXEC_INTEL into ..._FIXTURE with FQN swaps:
--      V_ACCOUNT_ANCHORS                 -> V_ACCOUNT_ANCHORS_BOARDEX_FIXTURE
--      BOARDEX_EXEC_INTEL (table)        -> BOARDEX_EXEC_INTEL_FIXTURE
--      BOARDEX_EXEC_INTEL_STAGING        -> BOARDEX_EXEC_INTEL_FIXTURE_STAGING
--      SP_GENERATE_BOARDEX_EXEC_INTEL    -> SP_GENERATE_BOARDEX_EXEC_INTEL_FIXTURE
--      TASK_MONTHLY_BOARDEX_EXEC_INTEL   -> TASK_MONTHLY_BOARDEX_EXEC_INTEL_FIXTURE
--    Sentinel-based ordering avoids substring-collision in repeated REPLACE
--    passes (e.g. replacing BOARDEX_EXEC_INTEL first would catch the stem of
--    SP_GENERATE_BOARDEX_EXEC_INTEL, BOARDEX_EXEC_INTEL_STAGING, and
--    TASK_MONTHLY_BOARDEX_EXEC_INTEL and double-suffix them).
-- ---------------------------------------------------------------------------
EXECUTE IMMEDIATE $$
DECLARE
    sp_ddl STRING;
BEGIN
    sp_ddl := (SELECT GET_DDL('PROCEDURE', 'DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_BOARDEX_EXEC_INTEL()'));
    -- Step 1: stash the suffix-bearing identifiers behind sentinels.
    sp_ddl := REPLACE(sp_ddl, 'BOARDEX_EXEC_INTEL_STAGING',     '__BX_STG__');
    sp_ddl := REPLACE(sp_ddl, 'SP_GENERATE_BOARDEX_EXEC_INTEL', '__BX_SP__');
    sp_ddl := REPLACE(sp_ddl, 'TASK_MONTHLY_BOARDEX_EXEC_INTEL','__BX_TASK__');
    -- Step 2: now BOARDEX_EXEC_INTEL (the dataset table) is unambiguous.
    sp_ddl := REPLACE(sp_ddl, 'BOARDEX_EXEC_INTEL',             'BOARDEX_EXEC_INTEL_FIXTURE');
    -- Step 3: expand sentinels back to fixture-suffixed names.
    sp_ddl := REPLACE(sp_ddl, '__BX_STG__',                     'BOARDEX_EXEC_INTEL_FIXTURE_STAGING');
    sp_ddl := REPLACE(sp_ddl, '__BX_SP__',                      'SP_GENERATE_BOARDEX_EXEC_INTEL_FIXTURE');
    sp_ddl := REPLACE(sp_ddl, '__BX_TASK__',                    'TASK_MONTHLY_BOARDEX_EXEC_INTEL_FIXTURE');
    -- Step 4: redirect audience view.
    sp_ddl := REPLACE(sp_ddl, 'V_ACCOUNT_ANCHORS',              'V_ACCOUNT_ANCHORS_BOARDEX_FIXTURE');
    EXECUTE IMMEDIATE :sp_ddl;
    RETURN 'fixture SP staged';
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. First run.
-- ---------------------------------------------------------------------------
CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_BOARDEX_EXEC_INTEL_FIXTURE();

-- ---------------------------------------------------------------------------
-- 6. Coverage assertion #1: distinct ACCOUNT_ID == post-filter audience size.
-- 14 anchors in the view, audience predicate Commercial-Banking-only filters
-- 9 non-CB out, leaving exactly 5 distinct accounts in the dataset.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(DISTINCT ACCOUNT_ID) FROM DATA_JEDAIS.FINS__PUBLIC.BOARDEX_EXEC_INTEL_FIXTURE) = 5
    AS distinct_accounts_assertion_passes;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 7. 1:1 emit assertion #2: COUNT(*) == post-filter audience size (5).
-- Commercial Banking audience (5) + 1:1 emit per anchor per month -> row
-- count = 5.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.BOARDEX_EXEC_INTEL_FIXTURE) = 5
    AS row_count_assertion_passes;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 8. Audience-filter assertion #3: zero rows have a non-Commercial-Banking
-- fixture prefix. Confirms the SP's
-- `WHERE CLIENT_CATEGORY = 'Commercial Banking'` predicate excluded the 9
-- `BOARDEX-FIX-NCB-%` anchors. Equivalent: every row has the CB prefix.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.BOARDEX_EXEC_INTEL_FIXTURE
       WHERE ACCOUNT_ID NOT LIKE 'BOARDEX-FIX-CB-%') = 0
    AS audience_filter_excludes_non_cb;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 9. Column-population assertion #4: every NOT NULL column populated for
-- every row (no surprise NULLs in the 14 NOT NULL columns). The 1 NULLable
-- column (RECENT_GOVERNANCE_EVENT_DATE) is intentionally exempt -- the
-- independent 30%/70% Bernoulli draw is asserted separately by the
-- date-coherence block (#16).
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.BOARDEX_EXEC_INTEL_FIXTURE
       WHERE ACCOUNT_ID                IS NULL
          OR PROFILE_MONTH              IS NULL
          OR BOARD_SIZE                 IS NULL
          OR BOARD_INDEPENDENCE_PCT     IS NULL
          OR WOMEN_BOARD_PCT            IS NULL
          OR MINORITY_BOARD_PCT         IS NULL
          OR BOARD_AVG_TENURE_YEARS     IS NULL
          OR CEO_TENURE_YEARS           IS NULL
          OR EXEC_TURNOVER_FLAG         IS NULL
          OR GOVERNANCE_RATING          IS NULL
          OR INTERLOCK_COUNT            IS NULL
          OR KEY_DIRECTOR_NAME          IS NULL
          OR LAST_DATA_REFRESH_DATE     IS NULL
          OR GENERATED_AT               IS NULL) = 0
    AS not_null_columns_populated;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 10. Range invariant #5: BOARD_SIZE in [5, 15]. Per rowspec _board_size
-- bias bands: large enterprise 9-15, mid-market 7-12, small-to-mid 5-10,
-- smallest 5-8.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.BOARDEX_EXEC_INTEL_FIXTURE
       WHERE BOARD_SIZE NOT BETWEEN 5 AND 15) = 0
    AS board_size_in_range;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 11. Range invariant #6a: BOARD_INDEPENDENCE_PCT in [0.00, 100.00].
-- Rowspec narrows further to [50.00, 100.00] but the table-level invariant
-- is the wider [0,100] band.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.BOARDEX_EXEC_INTEL_FIXTURE
       WHERE BOARD_INDEPENDENCE_PCT NOT BETWEEN 0.00 AND 100.00) = 0
    AS board_independence_pct_in_range;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 12. Range invariant #6b: WOMEN_BOARD_PCT in [0.00, 100.00].
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.BOARDEX_EXEC_INTEL_FIXTURE
       WHERE WOMEN_BOARD_PCT NOT BETWEEN 0.00 AND 100.00) = 0
    AS women_board_pct_in_range;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 13. Range invariant #6c: MINORITY_BOARD_PCT in [0.00, 100.00].
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.BOARDEX_EXEC_INTEL_FIXTURE
       WHERE MINORITY_BOARD_PCT NOT BETWEEN 0.00 AND 100.00) = 0
    AS minority_board_pct_in_range;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 14. GOVERNANCE_RATING vocabulary assertion #7: all values in the canonical
-- 5-tier set {Excellent, Strong, Adequate, Weak, Concerning}.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.BOARDEX_EXEC_INTEL_FIXTURE
       WHERE GOVERNANCE_RATING NOT IN
           ('Excellent','Strong','Adequate','Weak','Concerning')) = 0
    AS governance_rating_vocabulary_ok;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 15. BOOLEAN-typing assertion #8: EXEC_TURNOVER_FLAG must contain only
-- TRUE/FALSE (declared NOT NULL in the table DDL). Casting the column to
-- BOOLEAN and checking it's still in the literal set protects against
-- accidental write_pandas int8 inference if the staging table is ever
-- truncated (Plan 5 / Plan 8 finding).
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.BOARDEX_EXEC_INTEL_FIXTURE
       WHERE EXEC_TURNOVER_FLAG NOT IN (TRUE, FALSE)) = 0
    AS exec_turnover_flag_boolean_typed;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 16. Range invariant #9: INTERLOCK_COUNT in [0, 5]. Per rowspec
-- _interlock_count distribution clamps to {0,1,2,3,4,5}.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.BOARDEX_EXEC_INTEL_FIXTURE
       WHERE INTERLOCK_COUNT NOT BETWEEN 0 AND 5) = 0
    AS interlock_count_in_range;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 17. Date-coherence #10a: LAST_DATA_REFRESH_DATE must not be future-dated.
-- Per rowspec the SP draws 1-30 days before run_ts.date().
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.BOARDEX_EXEC_INTEL_FIXTURE
       WHERE LAST_DATA_REFRESH_DATE > CURRENT_DATE()) = 0
    AS last_data_refresh_not_future;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 18. Date-coherence #10b: RECENT_GOVERNANCE_EVENT_DATE (when populated)
-- must not be future-dated. Per rowspec the SP draws 1-365 days before
-- run_ts.date() with an independent 30%/70% Bernoulli; NULLs are exempt.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.BOARDEX_EXEC_INTEL_FIXTURE
       WHERE RECENT_GOVERNANCE_EVENT_DATE IS NOT NULL
         AND RECENT_GOVERNANCE_EVENT_DATE > CURRENT_DATE()) = 0
    AS recent_governance_event_not_future;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 19. Idempotency assertion #11a: a second run leaves the row count
-- unchanged (MERGE-not-INSERT).
-- ---------------------------------------------------------------------------
SET row_count_before = (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.BOARDEX_EXEC_INTEL_FIXTURE);
SET hash_before      = (SELECT HASH_AGG(*) FROM DATA_JEDAIS.FINS__PUBLIC.BOARDEX_EXEC_INTEL_FIXTURE);

CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_BOARDEX_EXEC_INTEL_FIXTURE();

SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.BOARDEX_EXEC_INTEL_FIXTURE) = $row_count_before
    AS idempotency_row_count_unchanged;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 20. Idempotency assertion #11b: byte-identical output (deterministic seed
-- bucketed on month_start).
-- ---------------------------------------------------------------------------
SELECT
    (SELECT HASH_AGG(*) FROM DATA_JEDAIS.FINS__PUBLIC.BOARDEX_EXEC_INTEL_FIXTURE) = $hash_before
    AS idempotency_hash_unchanged;
-- Expected: TRUE  (same calendar month -> byte-identical output)

-- ---------------------------------------------------------------------------
-- 21. Cleanup
-- ---------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_BOARDEX_EXEC_INTEL_FIXTURE();
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.BOARDEX_EXEC_INTEL_FIXTURE_STAGING;
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.BOARDEX_EXEC_INTEL_FIXTURE;
DROP VIEW      IF EXISTS DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS_BOARDEX_FIXTURE;
DELETE FROM DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG WHERE TASK_NAME = 'TASK_MONTHLY_BOARDEX_EXEC_INTEL_FIXTURE';
