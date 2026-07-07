-- =============================================================================
-- L2 integration test for SP_GENERATE_SYNTH_RELATIONSHIP_GRAPH
-- =============================================================================
-- Plan:    docs/superpowers/plans/2026-05-28-cumulus-plan-9-synth-relationship-graph.md
-- Task:    Plan 9 T5
-- Run:     snow sql -f tests/integration/test_synth_relationship_graph_sp.sql
-- Pass:    Every assertion column returns TRUE. Any FALSE = test failure.
--
-- Strategy:
--   Same fixture-cloning pattern as Plans 6, 7, 8: clone the deployed SP into
--   DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_SYNTH_RELATIONSHIP_GRAPH_FIXTURE via GET_DDL +
--   sentinel-ordered REPLACE, redirecting the audience view, dataset table,
--   staging table, and task name to fixture-scoped names. Sentinel-based
--   ordering avoids substring collision when SYNTH_RELATIONSHIP_GRAPH expands
--   to SYNTH_RELATIONSHIP_GRAPH_FIXTURE (otherwise SP_GENERATE_..., ..._STAGING,
--   and TASK_WEEKLY_... would all gain a stray _FIXTURE suffix in the wrong
--   slot during the dataset-table swap).
--
-- Plan 9 differences from Plans 1-8:
--   - First edge-scoped 1:N row factory. Row identity is the directed-edge
--     tuple (SRC_ACCOUNT_ID, DST_ACCOUNT_ID, EDGE_TYPE), NOT an account-anchored
--     single key. Each anchor emits 1-N rows per run.
--   - All-accounts audience (1=1 predicate) -- every anchor in the fixture is
--     in audience. 14 anchors -> 14 distinct SRC_ACCOUNT_ID values.
--   - First Cumulus dataset with cross-plan SOFT dependencies. The SP probes
--     CLARITAS_DEMOGRAPHICS, DNB_BUSINESS_CREDIT, BOARDEX_EXEC_INTEL via
--     try/except. In this L2 run the probes may succeed (if those tables
--     exist from prior plans) but the lookup builders return entries keyed by
--     the LIVE anchor IDs, NOT the fixture's SYNTH-FIX- IDs -- so HOUSEHOLD,
--     CORPORATE_PARENT, BOARD_MEMBER all short-circuit to [] for fixture
--     anchors. Plus V_ACCOUNT_ANCHORS has no CLARITAS_HOUSEHOLD_COMPOSITION
--     column, so _household_edges short-circuits even harder.
--   - SELF-fallback contract is the load-bearing coverage guarantee. Every
--     anchor whose other generators return [] emits exactly one SELF row.
--     This is asserted explicitly below.
--   - ADVISOR_BOOK / REFERRAL / BUSINESS_OWNER are "always-on" (no upstream
--     table required) but each is sparse: ADVISOR_BOOK requires Wealth +
--     30 percent dice + a non-self peer in the same hash-bucket (unlikely
--     with 6 PERSON anchors hashed into 200 buckets); REFERRAL is 5 percent
--     dice; BUSINESS_OWNER is high-income PERSON + capped 10 percent dice.
--     Expected count: ~0-2 sparse edges across 14 anchors. Most anchors
--     will SELF-fall-back. Assertions are bounded (ranges) not exact.
--
-- Pre-requisites:
--   1. SP_GENERATE_SYNTH_RELATIONSHIP_GRAPH deployed (run scripts/deploy_sp.py first).
-- =============================================================================

USE SCHEMA DATA_JEDAIS.FINS__PUBLIC;

-- ---------------------------------------------------------------------------
-- 1. Drop any leftover objects from a prior failed run so the test is
--    idempotent end-to-end.
-- ---------------------------------------------------------------------------
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.SYNTH_RELATIONSHIP_GRAPH_FIXTURE;
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.SYNTH_RELATIONSHIP_GRAPH_FIXTURE_STAGING;
DROP PROCEDURE IF EXISTS DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_SYNTH_RELATIONSHIP_GRAPH_FIXTURE();
DROP VIEW      IF EXISTS DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS_SYNTH_FIXTURE;

-- ---------------------------------------------------------------------------
-- 2. Materialise the L2 fixture audience view: 14 anchors total.
--    All 14 are in audience (Plan 9 has 1=1 predicate -- all-accounts).
--    Mix:
--      6 PERSON anchors (3 Retail + 2 Wealth Management + 1 Household)
--        Of these, 4 PERSONs have ANNUAL_INCOME >= 200000 to enable
--        BUSINESS_OWNER edge eligibility (capped 10 percent dice probability).
--      4 BUSINESS anchors (2 Small Business + 2 Commercial Banking)
--        These satisfy ACCOUNT_TYPE_FLAG='BUSINESS' for CORPORATE_PARENT
--        and provide destinations for BUSINESS_OWNER edges.
--      4 additional PERSON anchors (1 Wealth, 3 Retail) for variety.
--    ACCOUNT_ID prefix `SYNTH-FIX-` (unique across Cumulus).
--    Column shape mirrors V_ACCOUNT_ANCHORS exactly (15 columns) so the
--    cloned SP's audience SELECT compiles unchanged.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS_SYNTH_FIXTURE AS
-- 6 base PERSON anchors -- mix of Retail / Wealth / Household.
SELECT
    'SYNTH-FIX-P-01'::VARCHAR     AS ACCOUNT_ID,
    'Quinn Marlowe'::VARCHAR      AS ACCOUNT_NAME,
    '2026-05-28'::DATE            AS SNAPSHOT_DATE,
    'Wealth Management'::VARCHAR  AS CLIENT_CATEGORY,
    'PERSON'::VARCHAR             AS ACCOUNT_TYPE_FLAG,
    '1981-03-14'::TIMESTAMP_LTZ   AS BIRTHDATE,
    250000::NUMBER                AS ANNUAL_INCOME,    -- >= 200K -> BUSINESS_OWNER eligible
    780::NUMBER                   AS CREDIT_SCORE,
    NULL::VARCHAR                 AS INDUSTRY,
    NULL::NUMBER                  AS ANNUAL_REVENUE,
    NULL::NUMBER                  AS EMPLOYEE_COUNT,
    '94027'::VARCHAR              AS POSTAL_CODE,
    'CA'::VARCHAR                 AS STATE_CODE,
    'US'::VARCHAR                 AS COUNTRY_CODE,
    'SYNTH-FIX-EXT-001'::VARCHAR  AS EXTERNAL_ID
UNION ALL SELECT 'SYNTH-FIX-P-02', 'Jordan Vega',     '2026-05-28'::DATE, 'Wealth Management', 'PERSON',  '1976-06-12'::TIMESTAMP_LTZ,   420000, 790, NULL, NULL, NULL, '77002', 'TX', 'US', 'SYNTH-FIX-EXT-002'  -- BUSINESS_OWNER eligible
UNION ALL SELECT 'SYNTH-FIX-P-03', 'Morgan Hayes',    '2026-05-28'::DATE, 'Wealth Management', 'PERSON',  '1961-09-30'::TIMESTAMP_LTZ,   720000, 800, NULL, NULL, NULL, '60601', 'IL', 'US', 'SYNTH-FIX-EXT-003'  -- BUSINESS_OWNER eligible
UNION ALL SELECT 'SYNTH-FIX-P-04', 'Avery Stone',     '2026-05-28'::DATE, 'Retail',            'PERSON',  '1955-02-18'::TIMESTAMP_LTZ,   210000, 810, NULL, NULL, NULL, '33139', 'FL', 'US', 'SYNTH-FIX-EXT-004'  -- BUSINESS_OWNER eligible (Retail still eligible -- only ACCOUNT_TYPE_FLAG=PERSON gates)
UNION ALL SELECT 'SYNTH-FIX-P-05', 'Riley Park',      '2026-05-28'::DATE, 'Retail',            'PERSON',  '1996-08-22'::TIMESTAMP_LTZ,    62000, 700, NULL, NULL, NULL, '10025', 'NY', 'US', 'SYNTH-FIX-EXT-005'  -- below 200K, BUSINESS_OWNER ineligible
UNION ALL SELECT 'SYNTH-FIX-P-06', 'Casey Reed',      '2026-05-28'::DATE, 'Household',         'PERSON',  '1971-11-05'::TIMESTAMP_LTZ,    95000, 720, NULL, NULL, NULL, '02115', 'MA', 'US', 'SYNTH-FIX-EXT-006'  -- below 200K
-- 4 BUSINESS anchors -- targets for BUSINESS_OWNER, eligible for CORPORATE_PARENT.
UNION ALL SELECT 'SYNTH-FIX-B-01', 'Pinewood Coffee Co.',    '2026-05-28'::DATE, 'Small Business',     'BUSINESS', NULL::TIMESTAMP_LTZ, NULL, NULL, 'Food Services',         1200000,  18, '98101', 'WA', 'US', 'SYNTH-FIX-EXT-007'
UNION ALL SELECT 'SYNTH-FIX-B-02', 'Mariposa Cleaners LLC',  '2026-05-28'::DATE, 'Small Business',     'BUSINESS', NULL::TIMESTAMP_LTZ, NULL, NULL, 'Personal Services',      480000,   6, '94110', 'CA', 'US', 'SYNTH-FIX-EXT-008'
UNION ALL SELECT 'SYNTH-FIX-B-03', 'Atlas Logistics Inc.',   '2026-05-28'::DATE, 'Commercial Banking', 'BUSINESS', NULL::TIMESTAMP_LTZ, NULL, NULL, 'Logistics',            18500000, 220, '60601', 'IL', 'US', 'SYNTH-FIX-EXT-009'
UNION ALL SELECT 'SYNTH-FIX-B-04', 'Northwind Holdings LLC', '2026-05-28'::DATE, 'Commercial Banking', 'BUSINESS', NULL::TIMESTAMP_LTZ, NULL, NULL, 'Investment Management',42000000,  95, '10005', 'NY', 'US', 'SYNTH-FIX-EXT-010'
-- 4 additional PERSON anchors for variety (Retail / Wealth / Household).
UNION ALL SELECT 'SYNTH-FIX-P-07', 'Pat Donovan',     '2026-05-28'::DATE, 'Retail',            'PERSON',  '1958-12-03'::TIMESTAMP_LTZ,    72000, 720, NULL, NULL, NULL, '10001', 'NY', 'US', 'SYNTH-FIX-EXT-011'
UNION ALL SELECT 'SYNTH-FIX-P-08', 'Drew Mitchell',   '2026-05-28'::DATE, 'Retail',            'PERSON',  '1990-07-19'::TIMESTAMP_LTZ,    85000, 690, NULL, NULL, NULL, '02101', 'MA', 'US', 'SYNTH-FIX-EXT-012'
UNION ALL SELECT 'SYNTH-FIX-P-09', 'Sam Walters',     '2026-05-28'::DATE, 'Wealth Management', 'PERSON',  '1984-02-18'::TIMESTAMP_LTZ,    330000, 760, NULL, NULL, NULL, '33139', 'FL', 'US', 'SYNTH-FIX-EXT-013'  -- BUSINESS_OWNER eligible
UNION ALL SELECT 'SYNTH-FIX-P-10', 'Alex Brennan',    '2026-05-28'::DATE, 'Household',         'PERSON',  '1954-01-22'::TIMESTAMP_LTZ,   150000, 760, NULL, NULL, NULL, '90001', 'CA', 'US', 'SYNTH-FIX-EXT-014';

-- ---------------------------------------------------------------------------
-- 3. Materialise the fixture-scoped target table: same DDL as
--    DATA_JEDAIS.FINS__PUBLIC.SYNTH_RELATIONSHIP_GRAPH but renamed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE TABLE DATA_JEDAIS.FINS__PUBLIC.SYNTH_RELATIONSHIP_GRAPH_FIXTURE
LIKE DATA_JEDAIS.FINS__PUBLIC.SYNTH_RELATIONSHIP_GRAPH;

-- ---------------------------------------------------------------------------
-- 4. Clone SP_GENERATE_SYNTH_RELATIONSHIP_GRAPH into ..._FIXTURE with FQN swaps:
--      V_ACCOUNT_ANCHORS                       -> V_ACCOUNT_ANCHORS_SYNTH_FIXTURE
--      SYNTH_RELATIONSHIP_GRAPH (table)        -> SYNTH_RELATIONSHIP_GRAPH_FIXTURE
--      SYNTH_RELATIONSHIP_GRAPH_STAGING        -> SYNTH_RELATIONSHIP_GRAPH_FIXTURE_STAGING
--      SP_GENERATE_SYNTH_RELATIONSHIP_GRAPH    -> SP_GENERATE_SYNTH_RELATIONSHIP_GRAPH_FIXTURE
--      TASK_WEEKLY_SYNTH_RELATIONSHIP_GRAPH    -> TASK_WEEKLY_SYNTH_RELATIONSHIP_GRAPH_FIXTURE
--    Sentinel-based ordering avoids substring-collision in repeated REPLACE
--    passes (e.g. replacing SYNTH_RELATIONSHIP_GRAPH first would catch the stem
--    of SP_GENERATE_..., ..._STAGING, and TASK_WEEKLY_... and double-suffix them).
-- ---------------------------------------------------------------------------
EXECUTE IMMEDIATE $$
DECLARE
    sp_ddl STRING;
BEGIN
    sp_ddl := (SELECT GET_DDL('PROCEDURE', 'DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_SYNTH_RELATIONSHIP_GRAPH()'));
    -- Step 1: stash the suffix-bearing identifiers behind sentinels.
    sp_ddl := REPLACE(sp_ddl, 'SYNTH_RELATIONSHIP_GRAPH_STAGING',     '__SRG_STG__');
    sp_ddl := REPLACE(sp_ddl, 'SP_GENERATE_SYNTH_RELATIONSHIP_GRAPH', '__SRG_SP__');
    sp_ddl := REPLACE(sp_ddl, 'TASK_WEEKLY_SYNTH_RELATIONSHIP_GRAPH', '__SRG_TASK__');
    -- Step 2: now SYNTH_RELATIONSHIP_GRAPH (the dataset table) is unambiguous.
    sp_ddl := REPLACE(sp_ddl, 'SYNTH_RELATIONSHIP_GRAPH',             'SYNTH_RELATIONSHIP_GRAPH_FIXTURE');
    -- Step 3: expand sentinels back to fixture-suffixed names.
    sp_ddl := REPLACE(sp_ddl, '__SRG_STG__',                          'SYNTH_RELATIONSHIP_GRAPH_FIXTURE_STAGING');
    sp_ddl := REPLACE(sp_ddl, '__SRG_SP__',                           'SP_GENERATE_SYNTH_RELATIONSHIP_GRAPH_FIXTURE');
    sp_ddl := REPLACE(sp_ddl, '__SRG_TASK__',                         'TASK_WEEKLY_SYNTH_RELATIONSHIP_GRAPH_FIXTURE');
    -- Step 4: redirect audience view.
    sp_ddl := REPLACE(sp_ddl, 'V_ACCOUNT_ANCHORS',                    'V_ACCOUNT_ANCHORS_SYNTH_FIXTURE');
    EXECUTE IMMEDIATE :sp_ddl;
    RETURN 'fixture SP staged';
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. First run.
-- ---------------------------------------------------------------------------
CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_SYNTH_RELATIONSHIP_GRAPH_FIXTURE();

-- ---------------------------------------------------------------------------
-- 6. Coverage assertion #1: distinct SRC_ACCOUNT_ID == 14.
-- All-accounts audience -- every fixture anchor must contribute at least
-- one row (SELF-fallback guarantees this regardless of cross-plan tables).
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(DISTINCT SRC_ACCOUNT_ID) FROM DATA_JEDAIS.FINS__PUBLIC.SYNTH_RELATIONSHIP_GRAPH_FIXTURE) = 14
    AS distinct_src_accounts_assertion_passes;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 7. Row-count floor assertion #2: total rows >= 14. Every anchor emits at
-- least one row by SELF-fallback. Sparse synthesized edges (ADVISOR_BOOK /
-- REFERRAL / BUSINESS_OWNER) may add a handful but cannot reduce below 14.
-- Upper bound is unbounded but in practice ~15-20 with this fixture.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.SYNTH_RELATIONSHIP_GRAPH_FIXTURE) >= 14
    AS row_count_floor_assertion_passes;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 8. Per-anchor coverage assertion #3: every fixture anchor has at least
-- one row. SELF-fallback is the load-bearing guarantee here -- this is the
-- test that would FAIL if the SP ever stopped emitting SELF rows.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(DISTINCT a.ACCOUNT_ID)
       FROM DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS_SYNTH_FIXTURE a
       LEFT JOIN DATA_JEDAIS.FINS__PUBLIC.SYNTH_RELATIONSHIP_GRAPH_FIXTURE g
              ON g.SRC_ACCOUNT_ID = a.ACCOUNT_ID
       WHERE g.SRC_ACCOUNT_ID IS NULL) = 0
    AS every_anchor_has_at_least_one_row;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 9. EDGE_TYPE vocabulary assertion #4: every row's EDGE_TYPE is in the
-- 7-value canonical set. With cross-plan lookups effectively empty for
-- the fixture (live cross-plan tables don't index SYNTH-FIX- IDs), the
-- typical L2 outcome is mostly SELF + possibly a few ADVISOR_BOOK /
-- REFERRAL / BUSINESS_OWNER edges. None of HOUSEHOLD / CORPORATE_PARENT /
-- BOARD_MEMBER are expected to fire because the fixture's anchor IDs
-- have no entries in the cross-plan tables.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.SYNTH_RELATIONSHIP_GRAPH_FIXTURE
       WHERE EDGE_TYPE NOT IN
           ('HOUSEHOLD','CORPORATE_PARENT','BOARD_MEMBER',
            'ADVISOR_BOOK','REFERRAL','BUSINESS_OWNER','SELF')) = 0
    AS edge_type_vocabulary_ok;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 10. SELF-fallback floor assertion #5: at least one SELF row exists.
-- With this fixture, in practice all 14 anchors will SELF-fall-back
-- (cross-plan lookups don't index fixture IDs; ADVISOR_BOOK requires a
-- non-self peer in same hash bucket -- unlikely with 3 Wealth anchors
-- spread across 200 buckets; REFERRAL is 5 percent dice; BUSINESS_OWNER
-- is capped 10 percent dice). Asserting >= 1 is robust to seed variance.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.SYNTH_RELATIONSHIP_GRAPH_FIXTURE
       WHERE EDGE_TYPE = 'SELF') >= 1
    AS self_fallback_present;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 11. SELF edge invariants assertion #6: for every SELF row,
-- SRC_ACCOUNT_ID == DST_ACCOUNT_ID, EDGE_WEIGHT == 1.000,
-- CONFIDENCE_PCT == 100.00. The rowspec fixed-value contract.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.SYNTH_RELATIONSHIP_GRAPH_FIXTURE
       WHERE EDGE_TYPE = 'SELF'
         AND (SRC_ACCOUNT_ID <> DST_ACCOUNT_ID
              OR EDGE_WEIGHT <> 1.000
              OR CONFIDENCE_PCT <> 100.00)) = 0
    AS self_edge_invariants_hold;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 12. Non-SELF edge invariants assertion #7: for every non-SELF row,
-- SRC_ACCOUNT_ID != DST_ACCOUNT_ID, EDGE_WEIGHT in [0.000, 1.000],
-- CONFIDENCE_PCT in [30.00, 99.99] (clamp range from _confidence_pct).
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.SYNTH_RELATIONSHIP_GRAPH_FIXTURE
       WHERE EDGE_TYPE <> 'SELF'
         AND (SRC_ACCOUNT_ID = DST_ACCOUNT_ID
              OR EDGE_WEIGHT NOT BETWEEN 0.000 AND 1.000
              OR CONFIDENCE_PCT NOT BETWEEN 30.00 AND 99.99)) = 0
    AS non_self_edge_invariants_hold;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 13. Date-coherence assertion #8a: EDGE_DISCOVERED_DATE <= EDGE_LAST_SEEN_DATE
-- for every row. Chronological coherence across the discovered/last-seen pair.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.SYNTH_RELATIONSHIP_GRAPH_FIXTURE
       WHERE EDGE_DISCOVERED_DATE > EDGE_LAST_SEEN_DATE) = 0
    AS discovered_le_last_seen;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 14. Date-coherence assertion #8b: EDGE_LAST_SEEN_DATE <= CURRENT_DATE() for
-- every row. No future-dated last-seen.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.SYNTH_RELATIONSHIP_GRAPH_FIXTURE
       WHERE EDGE_LAST_SEEN_DATE > CURRENT_DATE()) = 0
    AS last_seen_not_future;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 15. NOT-NULL columns populated assertion #9: every NOT NULL column is
-- populated for every row. METADATA is the only NULLable column and is
-- intentionally exempt (NULL for SELF and for edge types that don't add
-- context).
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.SYNTH_RELATIONSHIP_GRAPH_FIXTURE
       WHERE SRC_ACCOUNT_ID       IS NULL
          OR DST_ACCOUNT_ID       IS NULL
          OR EDGE_TYPE            IS NULL
          OR EDGE_WEIGHT          IS NULL
          OR CONFIDENCE_PCT       IS NULL
          OR EDGE_DISCOVERED_DATE IS NULL
          OR EDGE_LAST_SEEN_DATE  IS NULL
          OR GENERATED_AT         IS NULL) = 0
    AS not_null_columns_populated;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 16. SELF-edge dates assertion #10: for SELF rows, both
-- EDGE_DISCOVERED_DATE and EDGE_LAST_SEEN_DATE equal week_start.date()
-- (Monday of the run week). Not asserting an exact date here -- comparing
-- the two dates equal is sufficient to catch the SELF-specific contract
-- without coupling to the test runner's calendar.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.SYNTH_RELATIONSHIP_GRAPH_FIXTURE
       WHERE EDGE_TYPE = 'SELF'
         AND EDGE_DISCOVERED_DATE <> EDGE_LAST_SEEN_DATE) = 0
    AS self_dates_collapsed_to_week_start;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 17. Idempotency assertion #11a: a second run leaves the row count
-- unchanged (MERGE-not-INSERT) and produces byte-identical output
-- (deterministic seed bucketed on week_start).
-- ---------------------------------------------------------------------------
SET row_count_before = (SELECT COUNT(*)     FROM DATA_JEDAIS.FINS__PUBLIC.SYNTH_RELATIONSHIP_GRAPH_FIXTURE);
SET hash_before      = (SELECT HASH_AGG(*)  FROM DATA_JEDAIS.FINS__PUBLIC.SYNTH_RELATIONSHIP_GRAPH_FIXTURE);

CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_SYNTH_RELATIONSHIP_GRAPH_FIXTURE();

SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.SYNTH_RELATIONSHIP_GRAPH_FIXTURE) = $row_count_before
    AS idempotency_row_count_unchanged;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 18. Idempotency assertion #11b: HASH_AGG byte-identical across re-runs.
-- Same week -> same week_start -> same seed -> byte-identical edge dicts.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT HASH_AGG(*) FROM DATA_JEDAIS.FINS__PUBLIC.SYNTH_RELATIONSHIP_GRAPH_FIXTURE) = $hash_before
    AS idempotency_hash_unchanged;
-- Expected: TRUE  (same calendar week -> byte-identical output)

-- ---------------------------------------------------------------------------
-- 19. Cleanup
-- ---------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_SYNTH_RELATIONSHIP_GRAPH_FIXTURE();
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.SYNTH_RELATIONSHIP_GRAPH_FIXTURE_STAGING;
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.SYNTH_RELATIONSHIP_GRAPH_FIXTURE;
DROP VIEW      IF EXISTS DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS_SYNTH_FIXTURE;
DELETE FROM DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG WHERE TASK_NAME = 'TASK_WEEKLY_SYNTH_RELATIONSHIP_GRAPH_FIXTURE';
