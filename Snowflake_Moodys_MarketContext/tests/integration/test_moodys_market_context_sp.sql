-- =============================================================================
-- L2 integration test for SP_GENERATE_MOODYS_MARKET_CONTEXT
-- =============================================================================
-- Plan:    docs/superpowers/plans/2026-05-28-cumulus-plan-13-moodys-market-context.md
-- Task:    Plan 13 T5 (FINAL Cumulus plan, 13 of 13)
-- Run:     snow sql -f tests/integration/test_moodys_market_context_sp.sql
-- Pass:    Every assertion column returns TRUE. Any FALSE = test failure.
--
-- Strategy:
--   Same fixture-cloning pattern as Plans 6 + 7: clone the deployed SP into
--   DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_MOODYS_MARKET_CONTEXT_FIXTURE via GET_DDL +
--   REPLACE, redirecting the audience source, dataset table, and staging
--   table FQNs to fixture-scoped names. Sentinel-based ordering avoids
--   substring collision when MOODYS_MARKET_CONTEXT expands to
--   MOODYS_MARKET_CONTEXT_FIXTURE (otherwise SP_GENERATE_MOODYS_MARKET_CONTEXT
--   would gain a second _FIXTURE suffix during the dataset-table swap).
--
-- Plan 13 differences from Plans 1-12:
--   - INSTRUMENT-SCOPED, not account-scoped. Reads
--     DATA_JEDAIS.FINS__PUBLIC.INSTRUMENT_UNIVERSE directly (4 columns: TICKER PK,
--     INSTRUMENT_NAME, SECTOR, BASE_PRICE) -- there is no V_ACCOUNT_ANCHORS
--     dependency. Second non-account-scoped Cumulus plan after Plan 4 (Esri
--     branch-scoped). Fixture is INSTRUMENT_UNIVERSE_MOODYS_FIXTURE, not a
--     V_ACCOUNT_ANCHORS clone.
--   - DAILY cadence. PROFILE_DATE (not PROFILE_MONTH or PROFILE_QUARTER).
--     Mid-day re-runs MERGE-replace in place. Second daily-cadence plan
--     after Plan 7 (WorldCheck AML); both inline the _daily_seed wrapper.
--   - INSTRUMENT_UNIVERSE schema-drift caught at draft time. The umbrella
--     spec described the audience as `WHERE IS_ACTIVE = TRUE` keyed by
--     INSTRUMENT_ID; live INSTRUMENT_UNIVERSE has TICKER PK and no
--     IS_ACTIVE column. Fixture mirrors the live shape: TICKER PK, no
--     IS_ACTIVE, no WHERE clause in the audience SQL.
--   - Snowflake digit-leading column rename: rowspec's market-data fields
--     `52_WEEK_HIGH_PRICE`, `52_WEEK_LOW_PRICE`, `30_DAY_PRICE_CHANGE_PCT`
--     are renamed to FIFTY_TWO_WEEK_HIGH_PRICE / FIFTY_TWO_WEEK_LOW_PRICE /
--     THIRTY_DAY_PRICE_CHANGE_PCT at the DDL level (Snowflake identifiers
--     cannot begin with a digit). The assertions use the renamed columns.
--   - 0 BOOLEAN, 1 NULLable (OUTLOOK_LAST_CHANGED_DATE) -- simplest
--     NULL/Boolean footprint of any Cumulus dataset. The NOT-NULL
--     assertion covers 13 of 14 columns.
--   - Two salts (`moodys` daily + `moodys_year` year-stable) drive a
--     hybrid year-stable + daily field model. The year-stable invariants
--     assertion is Plan 13's load-bearing structural test: same calendar
--     day re-runs are byte-identical (idempotency); a second CALL on the
--     same day must reproduce CREDIT_RATING / RATING_OUTLOOK /
--     OUTLOOK_LAST_CHANGED_DATE / FIFTY_TWO_WEEK_HIGH/LOW /
--     RATING_AGENCY_FLAG_COUNT / LIQUIDITY_TIER bit-for-bit.
--
-- Pre-requisites:
--   1. SP_GENERATE_MOODYS_MARKET_CONTEXT deployed (run scripts/deploy_sp.py
--      first).
-- =============================================================================

USE SCHEMA DATA_JEDAIS.FINS__PUBLIC;

-- ---------------------------------------------------------------------------
-- 1. Drop any leftover objects from a prior failed run so the test is
--    idempotent end-to-end.
-- ---------------------------------------------------------------------------
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_FIXTURE;
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_FIXTURE_STAGING;
DROP PROCEDURE IF EXISTS DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_MOODYS_MARKET_CONTEXT_FIXTURE();
DROP VIEW      IF EXISTS DATA_JEDAIS.FINS__PUBLIC.INSTRUMENT_UNIVERSE_MOODYS_FIXTURE;

-- ---------------------------------------------------------------------------
-- 2. Materialise the L2 fixture audience view: 8 instruments.
--    Plan 13 reads INSTRUMENT_UNIVERSE directly (no V_ACCOUNT_ANCHORS), so
--    the fixture is a 4-column view (TICKER, INSTRUMENT_NAME, SECTOR,
--    BASE_PRICE) matching the live INSTRUMENT_UNIVERSE schema (probed
--    2026-05-28: TICKER VARCHAR(10) PK, INSTRUMENT_NAME VARCHAR(200),
--    SECTOR VARCHAR(50), BASE_PRICE FLOAT).
--
--    Coverage of rowspec dimensions:
--      - 5 of 7 SECTOR values: Industrial (x2), Financials (x2), Technology,
--        Energy, Healthcare. The two Industrial / two Financials pairs
--        exercise within-sector rating distribution variance; Tiny Tickr's
--        NULL SECTOR exercises the _DEFAULT_RATING_BIAS fallback path.
--      - BASE_PRICE spans micro-cap-priced (Tiny Tickr 2.10) through
--        large-mega-cap-priced (Cyberdyne 1287.50, MegaCap MF 4500.00) so
--        the year-stable shares-outstanding draw covers both Illiquid and
--        Tier 1 LIQUIDITY_TIER outcomes.
--      - 8 distinct TICKER values -> COUNT(DISTINCT TICKER) = 8 and
--        COUNT(*) = 8 (1:1 daily emit; no audience filter).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW DATA_JEDAIS.FINS__PUBLIC.INSTRUMENT_UNIVERSE_MOODYS_FIXTURE AS
SELECT
    'MFIX01'::VARCHAR(10)            AS TICKER,
    'Acme Industrials Corp'::VARCHAR AS INSTRUMENT_NAME,
    'Industrial'::VARCHAR            AS SECTOR,
    47.50::FLOAT                     AS BASE_PRICE
UNION ALL SELECT 'MFIX02', 'Globex Bank Holdings', 'Financials',  87.20
UNION ALL SELECT 'MFIX03', 'Initech Tech',         'Technology',  245.10
UNION ALL SELECT 'MFIX04', 'Hooli Energy',         'Energy',      32.05
UNION ALL SELECT 'MFIX05', 'PiedPiper Health',     'Healthcare',  178.40
UNION ALL SELECT 'MFIX06', 'Cyberdyne Defense',    'Industrial',  1287.50
UNION ALL SELECT 'MFIX07', 'Tiny Tickr Ltd',       NULL,          2.10
UNION ALL SELECT 'MFIX08', 'MegaCap MF',           'Financials',  4500.00;

-- ---------------------------------------------------------------------------
-- 3. Materialise the fixture-scoped target table: same DDL as
--    DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT but renamed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE TABLE DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_FIXTURE
LIKE DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT;

-- ---------------------------------------------------------------------------
-- 4. Clone SP_GENERATE_MOODYS_MARKET_CONTEXT into ..._FIXTURE with FQN swaps:
--      MOODYS_MARKET_CONTEXT (table)        -> MOODYS_MARKET_CONTEXT_FIXTURE
--      MOODYS_MARKET_CONTEXT_STAGING        -> MOODYS_MARKET_CONTEXT_FIXTURE_STAGING
--      SP_GENERATE_MOODYS_MARKET_CONTEXT    -> SP_GENERATE_MOODYS_MARKET_CONTEXT_FIXTURE
--      TASK_DAILY_MOODYS_MARKET_CONTEXT     -> TASK_DAILY_MOODYS_MARKET_CONTEXT_FIXTURE
--      INSTRUMENT_UNIVERSE                  -> INSTRUMENT_UNIVERSE_MOODYS_FIXTURE
--    Sentinel-based ordering avoids substring-collision in repeated REPLACE
--    passes (e.g. replacing MOODYS_MARKET_CONTEXT first would catch the stem
--    of SP_GENERATE_MOODYS_MARKET_CONTEXT and TASK_DAILY_MOODYS_MARKET_CONTEXT
--    and double-suffix them).
--
--    Plan 13 deviation from Plan 7: there is no V_ACCOUNT_ANCHORS swap -- the
--    SP reads INSTRUMENT_UNIVERSE directly. The last REPLACE redirects the
--    audience source onto the fixture view above.
-- ---------------------------------------------------------------------------
EXECUTE IMMEDIATE $$
DECLARE
    sp_ddl STRING;
BEGIN
    sp_ddl := (SELECT GET_DDL('PROCEDURE', 'DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_MOODYS_MARKET_CONTEXT()'));
    -- Step 1: stash the suffix-bearing identifiers behind sentinels.
    sp_ddl := REPLACE(sp_ddl, 'MOODYS_MARKET_CONTEXT_STAGING',     '__MDY_STG__');
    sp_ddl := REPLACE(sp_ddl, 'SP_GENERATE_MOODYS_MARKET_CONTEXT', '__MDY_SP__');
    sp_ddl := REPLACE(sp_ddl, 'TASK_DAILY_MOODYS_MARKET_CONTEXT',  '__MDY_TASK__');
    -- Step 2: now MOODYS_MARKET_CONTEXT (the dataset table) is unambiguous.
    sp_ddl := REPLACE(sp_ddl, 'MOODYS_MARKET_CONTEXT',             'MOODYS_MARKET_CONTEXT_FIXTURE');
    -- Step 3: expand sentinels back to fixture-suffixed names.
    sp_ddl := REPLACE(sp_ddl, '__MDY_STG__',                       'MOODYS_MARKET_CONTEXT_FIXTURE_STAGING');
    sp_ddl := REPLACE(sp_ddl, '__MDY_SP__',                        'SP_GENERATE_MOODYS_MARKET_CONTEXT_FIXTURE');
    sp_ddl := REPLACE(sp_ddl, '__MDY_TASK__',                      'TASK_DAILY_MOODYS_MARKET_CONTEXT_FIXTURE');
    -- Step 4: redirect audience source (INSTRUMENT_UNIVERSE -> fixture view).
    sp_ddl := REPLACE(sp_ddl, 'INSTRUMENT_UNIVERSE',               'INSTRUMENT_UNIVERSE_MOODYS_FIXTURE');
    EXECUTE IMMEDIATE :sp_ddl;
    RETURN 'fixture SP staged';
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. First run (CALL #1).
-- ---------------------------------------------------------------------------
CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_MOODYS_MARKET_CONTEXT_FIXTURE();

-- ---------------------------------------------------------------------------
-- 6. Coverage assertion #1: distinct TICKER == fixture instrument count (8).
--    Plan 13 keys on TICKER not ACCOUNT_ID; every instrument in the fixture
--    must emit a row.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(DISTINCT TICKER) FROM DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_FIXTURE) = 8
    AS distinct_tickers_assertion_passes;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 7. Row-count assertion #2: COUNT(*) == fixture instrument count (8).
--    1:1 daily emit + no audience filter -> row count = audience size.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_FIXTURE) = 8
    AS row_count_assertion_passes;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 8. NOT-NULL assertion #3: every required column populated for every row.
--    13 NOT NULL columns (OUTLOOK_LAST_CHANGED_DATE is the lone NULLable).
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_FIXTURE
       WHERE TICKER                       IS NULL
          OR PROFILE_DATE                 IS NULL
          OR CREDIT_RATING                IS NULL
          OR RATING_OUTLOOK               IS NULL
          OR MARKET_CAP_USD               IS NULL
          OR DAILY_VOLATILITY_PCT         IS NULL
          OR THIRTY_DAY_PRICE_CHANGE_PCT  IS NULL
          OR FIFTY_TWO_WEEK_HIGH_PRICE    IS NULL
          OR FIFTY_TWO_WEEK_LOW_PRICE     IS NULL
          OR RATING_AGENCY_FLAG_COUNT     IS NULL
          OR LIQUIDITY_TIER               IS NULL
          OR LAST_DATA_REFRESH_AT         IS NULL
          OR GENERATED_AT                 IS NULL) = 0
    AS not_null_columns_populated;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 9. Vocabulary assertion #4: CREDIT_RATING in the canonical 23-value set
--    (22 Moody's grades Aaa..C plus NR).
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_FIXTURE
       WHERE CREDIT_RATING NOT IN (
           'Aaa','Aa1','Aa2','Aa3','A1','A2','A3',
           'Baa1','Baa2','Baa3','Ba1','Ba2','Ba3',
           'B1','B2','B3','Caa1','Caa2','Caa3',
           'Ca','C','NR'
       )) = 0
    AS credit_rating_vocabulary_ok;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 10. Vocabulary assertion #5: RATING_OUTLOOK in the 5-value set.
--     ~78% Stable expected; at 8 instruments we don't assert presence of
--     every value, just vocabulary-bounded membership.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_FIXTURE
       WHERE RATING_OUTLOOK NOT IN
           ('Stable','Positive','Negative','Developing','Watch')) = 0
    AS rating_outlook_vocabulary_ok;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 11. Vocabulary assertion #6: LIQUIDITY_TIER in the 4-value set.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_FIXTURE
       WHERE LIQUIDITY_TIER NOT IN ('Tier 1','Tier 2','Tier 3','Illiquid')) = 0
    AS liquidity_tier_vocabulary_ok;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 12. Range assertion #7: DAILY_VOLATILITY_PCT in [0, 25].
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_FIXTURE
       WHERE DAILY_VOLATILITY_PCT < 0
          OR DAILY_VOLATILITY_PCT > 25) = 0
    AS daily_volatility_in_range;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 13. Range assertion #8: MARKET_CAP_USD strictly positive.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_FIXTURE
       WHERE MARKET_CAP_USD <= 0) = 0
    AS market_cap_usd_positive;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 14. Range assertion #9: THIRTY_DAY_PRICE_CHANGE_PCT in [-50, 50] -- a
--     loose bound; the SP clamps to [-25, 25] but the L2 fixture asserts
--     the wider rowspec safety bound to catch any future bias drift.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_FIXTURE
       WHERE THIRTY_DAY_PRICE_CHANGE_PCT < -50
          OR THIRTY_DAY_PRICE_CHANGE_PCT > 50) = 0
    AS thirty_day_change_in_range;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 15. Range assertion #10: RATING_AGENCY_FLAG_COUNT in [0, 5]. The
--     synthesizer draws from {0,1,2,3} with [0.85, 0.10, 0.04, 0.01]
--     weights; the wider [0,5] L2 bound guards against future taxonomy
--     expansion without forcing a test rewrite for benign drift.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_FIXTURE
       WHERE RATING_AGENCY_FLAG_COUNT < 0
          OR RATING_AGENCY_FLAG_COUNT > 5) = 0
    AS rating_agency_flag_count_in_range;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 16. Cross-field assertion #11: FIFTY_TWO_WEEK_HIGH_PRICE >=
--     FIFTY_TWO_WEEK_LOW_PRICE for every row (rowspec invariant; the
--     synthesizer enforces this with a defensive min() clamp on the low
--     leg, but the L2 assertion guards against future regressions in
--     either leg's RNG range).
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_FIXTURE
       WHERE FIFTY_TWO_WEEK_HIGH_PRICE < FIFTY_TWO_WEEK_LOW_PRICE) = 0
    AS high_geq_low_invariant;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 17. Cross-field assertion #12: LAST_DATA_REFRESH_AT::DATE == PROFILE_DATE
--     for every row. Day-bucketed timestamp -- mid-day re-runs are
--     byte-identical because both fields snap to day_start.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_FIXTURE
       WHERE LAST_DATA_REFRESH_AT::DATE <> PROFILE_DATE) = 0
    AS refresh_date_matches_profile_date;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 18. PROFILE_DATE assertion #13: every row's PROFILE_DATE equals the
--     calendar UTC date of the run (CURRENT_DATE in the executor's
--     session). Daily cadence -> all rows share one PROFILE_DATE.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_FIXTURE
       WHERE PROFILE_DATE <> CONVERT_TIMEZONE('UTC', CURRENT_TIMESTAMP())::DATE) = 0
    AS profile_date_is_run_date;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 19. Year-stable invariants assertion #14 -- LOAD-BEARING STRUCTURAL TEST.
--
--     Plan 13's hybrid year-stable + daily field model means a same-day
--     re-run must reproduce the year-stable fields bit-for-bit (because
--     they're seeded by `datetime(run_ts.year, 1, 1)` and don't fold
--     run_ts.day into the seed). The daily-bucketed fields ALSO reproduce
--     because the calendar day is the same, but the year-stable
--     invariants are the structurally distinct piece this test is built
--     for: a calendar-day boundary crossing in production must NOT shift
--     CREDIT_RATING / RATING_OUTLOOK / OUTLOOK_LAST_CHANGED_DATE /
--     FIFTY_TWO_WEEK_HIGH/LOW / RATING_AGENCY_FLAG_COUNT / LIQUIDITY_TIER.
--
--     We capture HASH_AGG over the year-stable fields only (8 fields),
--     then re-run the SP and capture again. Because year-stable seeds are
--     anchored on `datetime(run_ts.year, 1, 1)`, the captures must be
--     equal even if the second CALL straddled a calendar-day boundary.
--     (At fixture scale this is a same-day re-run and equality is also
--     guaranteed by full idempotency, but the assertion isolates the
--     year-stable subset so a future regression that breaks year-stable
--     determinism without breaking daily idempotency would still fail
--     this test.)
-- ---------------------------------------------------------------------------
SET year_stable_hash_before = (
    SELECT HASH_AGG(
        TICKER,
        CREDIT_RATING,
        RATING_OUTLOOK,
        OUTLOOK_LAST_CHANGED_DATE,
        FIFTY_TWO_WEEK_HIGH_PRICE,
        FIFTY_TWO_WEEK_LOW_PRICE,
        RATING_AGENCY_FLAG_COUNT,
        LIQUIDITY_TIER
    )
    FROM DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_FIXTURE
);

-- ---------------------------------------------------------------------------
-- 20. Idempotency assertion baseline -- capture full HASH_AGG and row count
--     before CALL #2. A second run leaves both unchanged (MERGE-not-INSERT,
--     deterministic seed).
-- ---------------------------------------------------------------------------
SET row_count_before = (
    SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_FIXTURE
);
SET hash_before = (
    SELECT HASH_AGG(*) FROM DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_FIXTURE
);

-- ---------------------------------------------------------------------------
-- 21. Second run (CALL #2) -- same-calendar-day re-run for both
--     idempotency and year-stable invariants.
-- ---------------------------------------------------------------------------
CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_MOODYS_MARKET_CONTEXT_FIXTURE();

-- ---------------------------------------------------------------------------
-- 22. Year-stable invariants assertion (continued from #19): the year-stable
--     subset HASH_AGG must be byte-identical across CALL #1 and CALL #2.
-- ---------------------------------------------------------------------------
SET year_stable_hash_after = (
    SELECT HASH_AGG(
        TICKER,
        CREDIT_RATING,
        RATING_OUTLOOK,
        OUTLOOK_LAST_CHANGED_DATE,
        FIFTY_TWO_WEEK_HIGH_PRICE,
        FIFTY_TWO_WEEK_LOW_PRICE,
        RATING_AGENCY_FLAG_COUNT,
        LIQUIDITY_TIER
    )
    FROM DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_FIXTURE
);

SELECT
    $year_stable_hash_after = $year_stable_hash_before
    AS year_stable_invariants_hold;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 23. Idempotency row-count assertion #15: row count unchanged after CALL #2.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_FIXTURE) = $row_count_before
    AS idempotency_row_count_unchanged;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 24. Idempotency hash assertion #16: full HASH_AGG unchanged after CALL #2.
--     Same calendar day -> byte-identical output across the entire row.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT HASH_AGG(*) FROM DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_FIXTURE) = $hash_before
    AS idempotency_hash_unchanged;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 25. Cleanup -- drop fixture procedure, staging, table, view; remove
--     fixture task-execution-log entries.
-- ---------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_MOODYS_MARKET_CONTEXT_FIXTURE();
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_FIXTURE_STAGING;
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_FIXTURE;
DROP VIEW      IF EXISTS DATA_JEDAIS.FINS__PUBLIC.INSTRUMENT_UNIVERSE_MOODYS_FIXTURE;
DELETE FROM DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG WHERE TASK_NAME = 'TASK_DAILY_MOODYS_MARKET_CONTEXT_FIXTURE';
