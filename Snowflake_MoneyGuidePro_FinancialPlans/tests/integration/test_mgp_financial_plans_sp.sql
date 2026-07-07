-- =============================================================================
-- L2 integration test for SP_GENERATE_MGP_FINANCIAL_PLANS
-- =============================================================================
-- Plan:    docs/superpowers/plans/2026-05-28-cumulus-plan-8-mgp-financial-plans.md
-- Task:    Plan 8 T5
-- Run:     snow sql -f tests/integration/test_mgp_financial_plans_sp.sql
-- Pass:    Every assertion column returns TRUE. Any FALSE = test failure.
--
-- Strategy:
--   Same fixture-cloning pattern as Plans 6 & 7: clone the deployed SP into
--   DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_MGP_FINANCIAL_PLANS_FIXTURE via GET_DDL + REPLACE,
--   redirecting the audience view, dataset table, and staging table FQNs to
--   fixture-scoped names. Sentinel-based ordering avoids substring collision
--   when MGP_FINANCIAL_PLANS expands to MGP_FINANCIAL_PLANS_FIXTURE (otherwise
--   SP_GENERATE_MGP_FINANCIAL_PLANS, MGP_FINANCIAL_PLANS_STAGING, and
--   TASK_MONTHLY_MGP_FINANCIAL_PLANS would all gain a stray _FIXTURE suffix
--   in the wrong slot during the dataset-table swap).
--
-- Plan 8 differences from Plans 1-7:
--   - SMALLEST Cumulus audience by 2.9× (Wealth Management only). Fixture
--     has 14 anchors total: 4 Wealth (in audience) + 10 non-Wealth (filtered
--     out). The 4-anchor cohort drives a per-anchor invariant approach
--     rather than distributional rate convergence.
--   - First Cumulus dataset whose NULL semantics are gated by a non-Boolean
--     enum: PLAN_STATUS = 'Draft' → LAST_REVIEW_DATE NULL; 'Stale' →
--     NEXT_REVIEW_DATE NULL; 'Active' → both populated. These NULL-semantic
--     invariants are the load-bearing assertions for this test.
--   - 1 BOOLEAN column (ADVISOR_NOTES_FLAG) and 2 NULLable date columns
--     (LAST_REVIEW_DATE, NEXT_REVIEW_DATE).
--   - MONTHLY cadence (PROFILE_MONTH, not PROFILE_DATE). 1:1 emit per
--     Wealth anchor per month → 4 rows expected.
--
-- Pre-requisites:
--   1. SP_GENERATE_MGP_FINANCIAL_PLANS deployed (run scripts/deploy_sp.py first).
-- =============================================================================

USE SCHEMA DATA_JEDAIS.FINS__PUBLIC;

-- ---------------------------------------------------------------------------
-- 1. Drop any leftover objects from a prior failed run so the test is
--    idempotent end-to-end.
-- ---------------------------------------------------------------------------
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.MGP_FINANCIAL_PLANS_FIXTURE;
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.MGP_FINANCIAL_PLANS_FIXTURE_STAGING;
DROP PROCEDURE IF EXISTS DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_MGP_FINANCIAL_PLANS_FIXTURE();
DROP VIEW      IF EXISTS DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS_MGPFP_FIXTURE;

-- ---------------------------------------------------------------------------
-- 2. Materialise the L2 fixture audience view: 14 anchors total.
--    -  4 Wealth Management PERSON anchors (in audience). Mix of ages
--       (25, 45, 65, 78) and incomes ($230K, $390K, $720K, $1.2M) so all
--       5 RECOMMENDED_ASSET_ALLOCATION bands are reachable across the age
--       glide AND a wide range of MONTHLY_INCOME_TARGET values gets tested.
--       BIRTHDATE and ANNUAL_INCOME are 100% populated for these 4 — that's
--       the audience contract (probed live: both fields 100% populated for
--       Wealth Management).
--    - 10 non-Wealth anchors (out of audience — `NW-` prefix to make the
--       audience-filter assertion trivially expressible):
--          4 Retail PERSON   (ages 30/55/68/19)
--          2 Household PERSON (ages 42/72)
--          2 Small Business BUSINESS (NULL BIRTHDATE / ANNUAL_INCOME)
--          2 Commercial Banking BUSINESS (NULL BIRTHDATE / ANNUAL_INCOME)
--    The audience predicate `CLIENT_CATEGORY = 'Wealth Management'` filters
--    the 10 non-Wealth anchors out of the SP's row factory, so only 4 rows
--    land in the dataset table.
--
--    Column shape mirrors V_ACCOUNT_ANCHORS exactly (15 columns) so the
--    cloned SP's audience SELECT compiles unchanged.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS_MGPFP_FIXTURE AS
-- 4 Wealth Management anchors — IN AUDIENCE.
SELECT
    'MGPFP-FIX-WM-01'::VARCHAR  AS ACCOUNT_ID,
    'Quinn Marlowe'::VARCHAR    AS ACCOUNT_NAME,
    '2026-05-28'::DATE          AS SNAPSHOT_DATE,
    'Wealth Management'::VARCHAR AS CLIENT_CATEGORY,
    'PERSON'::VARCHAR           AS ACCOUNT_TYPE_FLAG,
    '2001-03-14'::TIMESTAMP_LTZ AS BIRTHDATE,        -- age ~25 → Aggressive/Moderate Aggressive
    230000::NUMBER              AS ANNUAL_INCOME,
    780::NUMBER                 AS CREDIT_SCORE,
    NULL::VARCHAR               AS INDUSTRY,
    NULL::NUMBER                AS ANNUAL_REVENUE,
    NULL::NUMBER                AS EMPLOYEE_COUNT,
    '94027'::VARCHAR            AS POSTAL_CODE,
    'CA'::VARCHAR               AS STATE_CODE,
    'US'::VARCHAR               AS COUNTRY_CODE,
    'MGPFP-FIX-WM-001'::VARCHAR AS EXTERNAL_ID
UNION ALL SELECT 'MGPFP-FIX-WM-02', 'Jordan Vega',     '2026-05-28'::DATE, 'Wealth Management', 'PERSON',  '1981-06-12'::TIMESTAMP_LTZ,   390000, 790, NULL, NULL, NULL, '77002', 'TX', 'US', 'MGPFP-FIX-WM-002'  -- age ~45
UNION ALL SELECT 'MGPFP-FIX-WM-03', 'Morgan Hayes',    '2026-05-28'::DATE, 'Wealth Management', 'PERSON',  '1961-09-30'::TIMESTAMP_LTZ,   720000, 800, NULL, NULL, NULL, '60601', 'IL', 'US', 'MGPFP-FIX-WM-003'  -- age ~65
UNION ALL SELECT 'MGPFP-FIX-WM-04', 'Avery Stone',     '2026-05-28'::DATE, 'Wealth Management', 'PERSON',  '1948-02-18'::TIMESTAMP_LTZ,  1200000, 810, NULL, NULL, NULL, '33139', 'FL', 'US', 'MGPFP-FIX-WM-004'  -- age ~78
-- 10 non-Wealth anchors — OUT OF AUDIENCE.
UNION ALL SELECT 'MGPFP-FIX-NW-R1', 'Riley Park',      '2026-05-28'::DATE, 'Retail',            'PERSON',  '1996-08-22'::TIMESTAMP_LTZ,    62000, 700, NULL, NULL, NULL, '10025', 'NY', 'US', 'MGPFP-FIX-NW-005'  -- age ~30
UNION ALL SELECT 'MGPFP-FIX-NW-R2', 'Casey Reed',      '2026-05-28'::DATE, 'Retail',            'PERSON',  '1971-11-05'::TIMESTAMP_LTZ,    95000, 720, NULL, NULL, NULL, '02115', 'MA', 'US', 'MGPFP-FIX-NW-006'  -- age ~55
UNION ALL SELECT 'MGPFP-FIX-NW-R3', 'Pat Donovan',     '2026-05-28'::DATE, 'Retail',            'PERSON',  '1958-12-03'::TIMESTAMP_LTZ,    72000, 720, NULL, NULL, NULL, '10001', 'NY', 'US', 'MGPFP-FIX-NW-007'  -- age ~68
UNION ALL SELECT 'MGPFP-FIX-NW-R4', 'Drew Mitchell',   '2026-05-28'::DATE, 'Retail',            'PERSON',  '2007-07-19'::TIMESTAMP_LTZ,    45000, 690, NULL, NULL, NULL, '02101', 'MA', 'US', 'MGPFP-FIX-NW-008'  -- age ~19
UNION ALL SELECT 'MGPFP-FIX-NW-H1', 'Sam Walters',     '2026-05-28'::DATE, 'Household',         'PERSON',  '1984-02-18'::TIMESTAMP_LTZ,    88000, 730, NULL, NULL, NULL, '33139', 'FL', 'US', 'MGPFP-FIX-NW-009'  -- age ~42
UNION ALL SELECT 'MGPFP-FIX-NW-H2', 'Alex Brennan',    '2026-05-28'::DATE, 'Household',         'PERSON',  '1954-01-22'::TIMESTAMP_LTZ,   150000, 760, NULL, NULL, NULL, '90001', 'CA', 'US', 'MGPFP-FIX-NW-010'  -- age ~72
UNION ALL SELECT 'MGPFP-FIX-NW-S1', 'Pinewood Coffee Co.',    '2026-05-28'::DATE, 'Small Business',     'BUSINESS', NULL::TIMESTAMP_LTZ, NULL, NULL, 'Food & Beverage',        1200000,  18, '98101', 'WA', 'US', 'MGPFP-FIX-NW-011'
UNION ALL SELECT 'MGPFP-FIX-NW-S2', 'Mariposa Cleaners LLC',  '2026-05-28'::DATE, 'Small Business',     'BUSINESS', NULL::TIMESTAMP_LTZ, NULL, NULL, 'Personal Services',       480000,   6, '94110', 'CA', 'US', 'MGPFP-FIX-NW-012'
UNION ALL SELECT 'MGPFP-FIX-NW-C1', 'Atlas Logistics Inc.',   '2026-05-28'::DATE, 'Commercial Banking', 'BUSINESS', NULL::TIMESTAMP_LTZ, NULL, NULL, 'Logistics',             18500000, 220, '60601', 'IL', 'US', 'MGPFP-FIX-NW-013'
UNION ALL SELECT 'MGPFP-FIX-NW-C2', 'Northwind Holdings LLC', '2026-05-28'::DATE, 'Commercial Banking', 'BUSINESS', NULL::TIMESTAMP_LTZ, NULL, NULL, 'Investment Management', 42000000,  95, '10005', 'NY', 'US', 'MGPFP-FIX-NW-014';

-- ---------------------------------------------------------------------------
-- 3. Materialise the fixture-scoped target table: same DDL as
--    DATA_JEDAIS.FINS__PUBLIC.MGP_FINANCIAL_PLANS but renamed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE TABLE DATA_JEDAIS.FINS__PUBLIC.MGP_FINANCIAL_PLANS_FIXTURE
LIKE DATA_JEDAIS.FINS__PUBLIC.MGP_FINANCIAL_PLANS;

-- ---------------------------------------------------------------------------
-- 4. Clone SP_GENERATE_MGP_FINANCIAL_PLANS into ..._FIXTURE with FQN swaps:
--      V_ACCOUNT_ANCHORS                  -> V_ACCOUNT_ANCHORS_MGPFP_FIXTURE
--      MGP_FINANCIAL_PLANS (table)        -> MGP_FINANCIAL_PLANS_FIXTURE
--      MGP_FINANCIAL_PLANS_STAGING        -> MGP_FINANCIAL_PLANS_FIXTURE_STAGING
--      SP_GENERATE_MGP_FINANCIAL_PLANS    -> SP_GENERATE_MGP_FINANCIAL_PLANS_FIXTURE
--      TASK_MONTHLY_MGP_FINANCIAL_PLANS   -> TASK_MONTHLY_MGP_FINANCIAL_PLANS_FIXTURE
--    Sentinel-based ordering avoids substring-collision in repeated REPLACE
--    passes (e.g. replacing MGP_FINANCIAL_PLANS first would catch the stem of
--    SP_GENERATE_MGP_FINANCIAL_PLANS, MGP_FINANCIAL_PLANS_STAGING, and
--    TASK_MONTHLY_MGP_FINANCIAL_PLANS and double-suffix them).
-- ---------------------------------------------------------------------------
EXECUTE IMMEDIATE $$
DECLARE
    sp_ddl STRING;
BEGIN
    sp_ddl := (SELECT GET_DDL('PROCEDURE', 'DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_MGP_FINANCIAL_PLANS()'));
    -- Step 1: stash the suffix-bearing identifiers behind sentinels.
    sp_ddl := REPLACE(sp_ddl, 'MGP_FINANCIAL_PLANS_STAGING',     '__MGP_STG__');
    sp_ddl := REPLACE(sp_ddl, 'SP_GENERATE_MGP_FINANCIAL_PLANS', '__MGP_SP__');
    sp_ddl := REPLACE(sp_ddl, 'TASK_MONTHLY_MGP_FINANCIAL_PLANS','__MGP_TASK__');
    -- Step 2: now MGP_FINANCIAL_PLANS (the dataset table) is unambiguous.
    sp_ddl := REPLACE(sp_ddl, 'MGP_FINANCIAL_PLANS',             'MGP_FINANCIAL_PLANS_FIXTURE');
    -- Step 3: expand sentinels back to fixture-suffixed names.
    sp_ddl := REPLACE(sp_ddl, '__MGP_STG__',                     'MGP_FINANCIAL_PLANS_FIXTURE_STAGING');
    sp_ddl := REPLACE(sp_ddl, '__MGP_SP__',                      'SP_GENERATE_MGP_FINANCIAL_PLANS_FIXTURE');
    sp_ddl := REPLACE(sp_ddl, '__MGP_TASK__',                    'TASK_MONTHLY_MGP_FINANCIAL_PLANS_FIXTURE');
    -- Step 4: redirect audience view.
    sp_ddl := REPLACE(sp_ddl, 'V_ACCOUNT_ANCHORS',               'V_ACCOUNT_ANCHORS_MGPFP_FIXTURE');
    EXECUTE IMMEDIATE :sp_ddl;
    RETURN 'fixture SP staged';
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. First run.
-- ---------------------------------------------------------------------------
CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_MGP_FINANCIAL_PLANS_FIXTURE();

-- ---------------------------------------------------------------------------
-- 6. Coverage assertion #1: distinct ACCOUNT_ID == post-filter audience size.
-- 14 anchors in the view, audience predicate Wealth-Management-only filters
-- 10 non-Wealth out, leaving exactly 4 distinct accounts in the dataset.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(DISTINCT ACCOUNT_ID) FROM DATA_JEDAIS.FINS__PUBLIC.MGP_FINANCIAL_PLANS_FIXTURE) = 4
    AS distinct_accounts_assertion_passes;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 7. 1:1 emit assertion #2: COUNT(*) == post-filter audience size (4).
-- Wealth audience (4) + 1:1 emit per anchor per month ⇒ row count = 4.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MGP_FINANCIAL_PLANS_FIXTURE) = 4
    AS row_count_assertion_passes;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 8. Audience-filter assertion #3: zero rows have a non-Wealth fixture
-- prefix. Confirms the SP's `WHERE CLIENT_CATEGORY = 'Wealth Management'`
-- predicate excluded the 10 `MGPFP-FIX-NW-%` anchors.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MGP_FINANCIAL_PLANS_FIXTURE
       WHERE ACCOUNT_ID LIKE 'MGPFP-FIX-NW-%') = 0
    AS audience_filter_excludes_non_wealth;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 9. Column-population assertion #4: every NOT NULL column populated for
-- every row (no surprise NULLs in the 12 NOT NULL columns). The 2 NULLable
-- columns (LAST_REVIEW_DATE, NEXT_REVIEW_DATE) are intentionally exempt —
-- the NULL-semantics block (#11a-c) governs them.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MGP_FINANCIAL_PLANS_FIXTURE
       WHERE ACCOUNT_ID                    IS NULL
          OR PROFILE_MONTH                  IS NULL
          OR PLAN_STATUS                    IS NULL
          OR PLAN_LAST_UPDATED_DATE         IS NULL
          OR RETIREMENT_TARGET_AGE          IS NULL
          OR MONTHLY_INCOME_TARGET_USD      IS NULL
          OR TOTAL_GOAL_AMOUNT_USD          IS NULL
          OR GOAL_COUNT                     IS NULL
          OR MONTE_CARLO_SUCCESS_PCT        IS NULL
          OR RECOMMENDED_ASSET_ALLOCATION   IS NULL
          OR ADVISOR_NOTES_FLAG             IS NULL
          OR GENERATED_AT                   IS NULL) = 0
    AS not_null_columns_populated;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 10. PLAN_STATUS vocabulary assertion #5: all values in {Active, Draft, Stale}.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MGP_FINANCIAL_PLANS_FIXTURE
       WHERE PLAN_STATUS NOT IN ('Active','Draft','Stale')) = 0
    AS plan_status_vocabulary_ok;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 11. PLAN_STATUS variety assertion #6: at least 1 of the 3 values present.
-- With 4 anchors and an 80/12/8 distribution, the expected status mix is
-- 3.2/0.5/0.3 — Active dominant. Asserting all 3 values present would flake;
-- asserting ≥1 just confirms the column is producing recognised values.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(DISTINCT PLAN_STATUS) FROM DATA_JEDAIS.FINS__PUBLIC.MGP_FINANCIAL_PLANS_FIXTURE) >= 1
    AS plan_status_variety_ok;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 12. NULL-semantics #7a: when PLAN_STATUS = 'Draft', LAST_REVIEW_DATE
-- MUST be NULL (rowspec invariant — advisor hasn't reviewed yet).
-- The most load-bearing Plan 8 assertion: this is the first Cumulus
-- dataset where NULL semantics depend on a non-Boolean enum.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MGP_FINANCIAL_PLANS_FIXTURE
       WHERE PLAN_STATUS = 'Draft'
         AND LAST_REVIEW_DATE IS NOT NULL) = 0
    AS draft_has_null_last_review;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 13. NULL-semantics #7b: when PLAN_STATUS = 'Stale', NEXT_REVIEW_DATE
-- MUST be NULL (rowspec invariant — no review scheduled).
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MGP_FINANCIAL_PLANS_FIXTURE
       WHERE PLAN_STATUS = 'Stale'
         AND NEXT_REVIEW_DATE IS NOT NULL) = 0
    AS stale_has_null_next_review;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 14. NULL-semantics #7c: when PLAN_STATUS = 'Active', BOTH review dates
-- MUST be populated (rowspec invariant — Active plans have both review
-- dates set).
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MGP_FINANCIAL_PLANS_FIXTURE
       WHERE PLAN_STATUS = 'Active'
         AND (LAST_REVIEW_DATE IS NULL OR NEXT_REVIEW_DATE IS NULL)) = 0
    AS active_has_both_reviews_populated;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 15. Date-coherence #8a: PLAN_LAST_UPDATED_DATE must not be future-dated.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MGP_FINANCIAL_PLANS_FIXTURE
       WHERE PLAN_LAST_UPDATED_DATE > CURRENT_DATE()) = 0
    AS plan_last_updated_not_future;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 16. Date-coherence #8b: LAST_REVIEW_DATE (when populated) must not be
-- future-dated. The SP's _review_dates clamps a stray future draw back
-- to month_start - randint(7, 90).
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MGP_FINANCIAL_PLANS_FIXTURE
       WHERE LAST_REVIEW_DATE IS NOT NULL
         AND LAST_REVIEW_DATE > CURRENT_DATE()) = 0
    AS last_review_not_future;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 17. Date-coherence #8c: NEXT_REVIEW_DATE (when populated) must be in
-- the future (> today). The SP draws 30-540 days ahead of month_start.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MGP_FINANCIAL_PLANS_FIXTURE
       WHERE NEXT_REVIEW_DATE IS NOT NULL
         AND NEXT_REVIEW_DATE <= CURRENT_DATE()) = 0
    AS next_review_in_future;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 18. Range invariant #9a: RETIREMENT_TARGET_AGE in [55, 80].
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MGP_FINANCIAL_PLANS_FIXTURE
       WHERE RETIREMENT_TARGET_AGE NOT BETWEEN 55 AND 80) = 0
    AS retirement_target_age_in_range;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 19. Range invariant #9b: MONTHLY_INCOME_TARGET_USD in [10000, 200000].
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MGP_FINANCIAL_PLANS_FIXTURE
       WHERE MONTHLY_INCOME_TARGET_USD NOT BETWEEN 10000 AND 200000) = 0
    AS monthly_income_target_in_range;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 20. Range invariant #9c: TOTAL_GOAL_AMOUNT_USD in [500000, 50000000].
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MGP_FINANCIAL_PLANS_FIXTURE
       WHERE TOTAL_GOAL_AMOUNT_USD NOT BETWEEN 500000 AND 50000000) = 0
    AS total_goal_amount_in_range;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 21. Range invariant #9d: GOAL_COUNT in [1, 6].
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MGP_FINANCIAL_PLANS_FIXTURE
       WHERE GOAL_COUNT NOT BETWEEN 1 AND 6) = 0
    AS goal_count_in_range;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 22. Range invariant #9e: MONTE_CARLO_SUCCESS_PCT in [30.00, 99.00].
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MGP_FINANCIAL_PLANS_FIXTURE
       WHERE MONTE_CARLO_SUCCESS_PCT NOT BETWEEN 30.00 AND 99.00) = 0
    AS monte_carlo_success_pct_in_range;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 23. RECOMMENDED_ASSET_ALLOCATION vocabulary assertion #10: all values in
-- the 5-tier glide-path set.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MGP_FINANCIAL_PLANS_FIXTURE
       WHERE RECOMMENDED_ASSET_ALLOCATION NOT IN
           ('Conservative','Moderate Conservative','Moderate','Moderate Aggressive','Aggressive')) = 0
    AS recommended_asset_allocation_vocabulary_ok;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 24. BOOLEAN-typing assertion #11: ADVISOR_NOTES_FLAG must contain only
-- TRUE/FALSE (declared NOT NULL in the table DDL). Casting the column to
-- BOOLEAN and checking it's still in the literal set protects against
-- accidental write_pandas int8 inference if the staging table is ever
-- truncated (Plan 5 finding).
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MGP_FINANCIAL_PLANS_FIXTURE
       WHERE ADVISOR_NOTES_FLAG NOT IN (TRUE, FALSE)) = 0
    AS advisor_notes_flag_boolean_typed;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 25. Idempotency assertion #12: a second run leaves the row count
-- unchanged (MERGE-not-INSERT) and produces byte-identical output
-- (deterministic seed bucketed on month_start).
-- ---------------------------------------------------------------------------
SET row_count_before = (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MGP_FINANCIAL_PLANS_FIXTURE);
SET hash_before      = (SELECT HASH_AGG(*) FROM DATA_JEDAIS.FINS__PUBLIC.MGP_FINANCIAL_PLANS_FIXTURE);

CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_MGP_FINANCIAL_PLANS_FIXTURE();

SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MGP_FINANCIAL_PLANS_FIXTURE) = $row_count_before
    AS idempotency_row_count_unchanged;
-- Expected: TRUE

SELECT
    (SELECT HASH_AGG(*) FROM DATA_JEDAIS.FINS__PUBLIC.MGP_FINANCIAL_PLANS_FIXTURE) = $hash_before
    AS idempotency_hash_unchanged;
-- Expected: TRUE  (same calendar month → byte-identical output)

-- ---------------------------------------------------------------------------
-- 26. Cleanup
-- ---------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_MGP_FINANCIAL_PLANS_FIXTURE();
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.MGP_FINANCIAL_PLANS_FIXTURE_STAGING;
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.MGP_FINANCIAL_PLANS_FIXTURE;
DROP VIEW      IF EXISTS DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS_MGPFP_FIXTURE;
DELETE FROM DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG WHERE TASK_NAME = 'TASK_MONTHLY_MGP_FINANCIAL_PLANS_FIXTURE';
