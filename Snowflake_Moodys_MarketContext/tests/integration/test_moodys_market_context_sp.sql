-- =============================================================================
-- L2 integration test for SP_GENERATE_MOODYS_MARKET_CONTEXT
-- =============================================================================
-- Run:     snow sql -c SFDC_DC_TECH_ARCH_jwt --role ACCOUNTADMIN \
--            -f tests/integration/test_moodys_market_context_sp.sql
--          (ACCOUNTADMIN: the cloned SP is EXECUTE AS OWNER and write_pandas
--          creates its staging table, which needs CREATE TABLE.)
-- Pass:    Every assertion column returns TRUE. Any FALSE = test failure.
--
-- Strategy:
--   Clone the deployed SP into SP_GENERATE_MOODYS_MARKET_CONTEXT_FIXTURE via
--   GET_DDL + REPLACE, redirecting the dataset table, staging table, task-log
--   name and V_ACCOUNT_ANCHORS to fixture-scoped names, then CALL it against
--   a 12-anchor fixture view (9 BUSINESS + 3 PERSON).
--   Sentinels avoid substring collisions: MOODYS_MARKET_CONTEXT is a stem of
--   the SP, task and staging names, so those are parked first and expanded
--   after the table swap.
--
--   The V_ACCOUNT_ANCHORS swap also redirects OWNER_BOOK_SQL. The fixture ids
--   are not in the FINSDC3_DATASHARE Account share, so the join finds nothing
--   and every fixture account gets the base outlook-move rate. The ids don't
--   start with 001am either, so outlook moves never apply and the outlook is
--   the year-stable baseline.
--
-- What it covers:
--   - Audience: only BUSINESS anchors emit rows (PERSON ids absent).
--   - Day 1 (CALL with no argument): one row per business anchor, dated
--     today (UTC), 14 NOT NULL columns populated, ORG_ID stamped.
--   - Vocabularies and ranges: rating, outlook, tier, volatility [0, 25],
--     30-day change [-25, 25], market cap [$5M, $500B], flags [0, 5],
--     52-week high >= low, refresh/generated at = PROFILE_DATE midnight.
--   - Passthrough: ANNUAL_REVENUE_USD / EMPLOYEE_COUNT equal the anchor
--     (NULL revenue stays NULL; NULL employee count stays NULL).
--   - Valuation: the $60B anchor is Tier 1 or Tier 2; the $50K anchor is
--     clamped to the $5M floor and Illiquid.
--   - Same-day idempotency: a second CALL leaves the row count and
--     HASH_AGG(*) unchanged.
--   - Backfill: CALL(3) yields 3 PROFILE_DATEs x 9 accounts = 27 rows,
--     year-stable fields constant per (account, year), daily fields varying.
--
-- Pre-requisites:
--   SP_GENERATE_MOODYS_MARKET_CONTEXT deployed (python3 scripts/deploy_sp.py).
-- Side effects:
--   Fixture runs log to TASK_EXECUTION_LOG as
--   TASK_DAILY_MOODYS_MARKET_CONTEXT_FIXTURE; step 15 deletes those rows.
-- =============================================================================

USE SCHEMA DATA_JEDAIS.FINS__PUBLIC;

-- ---------------------------------------------------------------------------
-- 1. Drop leftovers from a prior failed run.
-- ---------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_MOODYS_MARKET_CONTEXT_FIXTURE(NUMBER);
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_FIXTURE_STAGING;
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_FIXTURE;
DROP VIEW      IF EXISTS DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS_MOODYS_FIXTURE;

-- ---------------------------------------------------------------------------
-- 2. Fixture audience view, in the live V_ACCOUNT_ANCHORS column order.
--    BUSINESS anchors B-01..B-09:
--      B-01 Banking (bias key)        $2.4B revenue
--      B-02 Healthcare                $180M
--      B-03 Construction              $12M, NULL EMPLOYEE_COUNT
--      B-04 Real Estate               NULL ANNUAL_REVENUE ($5M valuation path)
--      B-05 Manufacturing             $60B (Tier 1/2)
--      B-06 Retail Trade              $50K (clamped to $5M floor, Illiquid)
--      B-07 NULL INDUSTRY             $8M  (default bias)
--      B-08 Professional Services     $3.1M (no bias key -> default)
--      B-09 Logistics                 $45M
--    PERSON anchors P-01..P-03 must be filtered out by the audience SQL.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS_MOODYS_FIXTURE AS
SELECT
    'JDO'::VARCHAR                   AS ORG_ID,
    'MDY-FIX-B-01'::VARCHAR          AS ACCOUNT_ID,
    'Fixture First Federal'::VARCHAR AS ACCOUNT_NAME,
    '2026-11-01'::DATE               AS SNAPSHOT_DATE,
    'Commercial Banking'::VARCHAR    AS CLIENT_CATEGORY,
    'BUSINESS'::VARCHAR              AS ACCOUNT_TYPE_FLAG,
    NULL::TIMESTAMP_LTZ              AS BIRTHDATE,
    NULL::NUMBER                     AS ANNUAL_INCOME,
    NULL::NUMBER                     AS CREDIT_SCORE,
    'Banking'::VARCHAR               AS INDUSTRY,
    2400000000::NUMBER               AS ANNUAL_REVENUE,
    5200::NUMBER                     AS EMPLOYEE_COUNT,
    '10001'::VARCHAR                 AS POSTAL_CODE,
    'NY'::VARCHAR                    AS STATE_CODE,
    'US'::VARCHAR                    AS COUNTRY_CODE,
    'EXT-MDY-B-01'::VARCHAR          AS EXTERNAL_ID
UNION ALL SELECT 'JDO','MDY-FIX-B-02','Fixture Health Partners','2026-11-01','Commercial Banking','BUSINESS',NULL,NULL,NULL,'Healthcare',180000000,950,'60601','IL','US','EXT-MDY-B-02'
UNION ALL SELECT 'JDO','MDY-FIX-B-03','Fixture Build Co','2026-11-01','Small Business','BUSINESS',NULL,NULL,NULL,'Construction',12000000,NULL,'85001','AZ','US','EXT-MDY-B-03'
UNION ALL SELECT 'JDO','MDY-FIX-B-04','Fixture Realty Group','2026-11-01','Small Business','BUSINESS',NULL,NULL,NULL,'Real Estate',NULL,40,'33101','FL','US','EXT-MDY-B-04'
UNION ALL SELECT 'JDO','MDY-FIX-B-05','Fixture Global Industries','2026-11-01','Commercial Banking','BUSINESS',NULL,NULL,NULL,'Manufacturing',60000000000,120000,'48201','MI','US','EXT-MDY-B-05'
UNION ALL SELECT 'JDO','MDY-FIX-B-06','Fixture Corner Shop','2026-11-01','Small Business','BUSINESS',NULL,NULL,NULL,'Retail Trade',50000,2,'97201','OR','US','EXT-MDY-B-06'
UNION ALL SELECT 'JDO','MDY-FIX-B-07','Fixture Unclassified LLC','2026-11-01','Small Business','BUSINESS',NULL,NULL,NULL,NULL,8000000,60,'78701','TX','US','EXT-MDY-B-07'
UNION ALL SELECT 'JDO','MDY-FIX-B-08','Fixture Advisory LLP','2026-11-01','Small Business','BUSINESS',NULL,NULL,NULL,'Professional Services',3100000,18,'02108','MA','US','EXT-MDY-B-08'
UNION ALL SELECT 'JDO','MDY-FIX-B-09','Fixture Freight Lines','2026-11-01','Commercial Banking','BUSINESS',NULL,NULL,NULL,'Logistics',45000000,310,'30301','GA','US','EXT-MDY-B-09'
UNION ALL SELECT 'JDO','MDY-FIX-P-01','Fixture Person One','2026-11-01','Retail','PERSON','1980-04-12'::TIMESTAMP_LTZ,85000,720,NULL,NULL,NULL,'94105','CA','US','EXT-MDY-P-01'
UNION ALL SELECT 'JDO','MDY-FIX-P-02','Fixture Person Two','2026-11-01','Wealth Management','PERSON','1965-09-30'::TIMESTAMP_LTZ,410000,790,NULL,NULL,NULL,'10022','NY','US','EXT-MDY-P-02'
UNION ALL SELECT 'JDO','MDY-FIX-P-03','Fixture Person Three','2026-11-01','Retail','PERSON','1992-01-05'::TIMESTAMP_LTZ,52000,655,'Personal',NULL,NULL,'60614','IL','US','EXT-MDY-P-03';

-- ---------------------------------------------------------------------------
-- 3. Fixture target table: same DDL as MOODYS_MARKET_CONTEXT.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE TABLE DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_FIXTURE
LIKE DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT;

-- ---------------------------------------------------------------------------
-- 4. Clone the SP. The live signature is (NUM_DAYS NUMBER), so GET_DDL needs
--    the argument type.
-- ---------------------------------------------------------------------------
EXECUTE IMMEDIATE $$
DECLARE
    sp_ddl STRING;
BEGIN
    sp_ddl := (SELECT GET_DDL('PROCEDURE', 'DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_MOODYS_MARKET_CONTEXT(NUMBER)'));
    -- Park the identifiers that contain MOODYS_MARKET_CONTEXT as a stem.
    sp_ddl := REPLACE(sp_ddl, 'MOODYS_MARKET_CONTEXT_STAGING',     '__MDY_STG__');
    sp_ddl := REPLACE(sp_ddl, 'SP_GENERATE_MOODYS_MARKET_CONTEXT', '__MDY_SP__');
    sp_ddl := REPLACE(sp_ddl, 'TASK_DAILY_MOODYS_MARKET_CONTEXT',  '__MDY_TASK__');
    -- The dataset table name is now unambiguous.
    sp_ddl := REPLACE(sp_ddl, 'MOODYS_MARKET_CONTEXT',             'MOODYS_MARKET_CONTEXT_FIXTURE');
    -- Expand the sentinels to fixture names.
    sp_ddl := REPLACE(sp_ddl, '__MDY_STG__',                       'MOODYS_MARKET_CONTEXT_FIXTURE_STAGING');
    sp_ddl := REPLACE(sp_ddl, '__MDY_SP__',                        'SP_GENERATE_MOODYS_MARKET_CONTEXT_FIXTURE');
    sp_ddl := REPLACE(sp_ddl, '__MDY_TASK__',                      'TASK_DAILY_MOODYS_MARKET_CONTEXT_FIXTURE');
    -- Redirect the audience (and OWNER_BOOK_SQL) to the fixture view.
    sp_ddl := REPLACE(sp_ddl, 'V_ACCOUNT_ANCHORS',                 'V_ACCOUNT_ANCHORS_MOODYS_FIXTURE');
    EXECUTE IMMEDIATE :sp_ddl;
    RETURN 'fixture SP staged';
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. CALL #1 (default NUM_DAYS = 1, as the task runs it).
-- ---------------------------------------------------------------------------
CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_MOODYS_MARKET_CONTEXT_FIXTURE();

-- ---------------------------------------------------------------------------
-- 6. Audience and coverage.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(DISTINCT ACCOUNT_ID) FROM DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_FIXTURE) = 9
    AS distinct_business_accounts_9;
-- Expected: TRUE

SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_FIXTURE) = 9
    AS row_count_one_per_account;
-- Expected: TRUE

SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_FIXTURE
       WHERE ACCOUNT_ID LIKE 'MDY-FIX-P-%') = 0
    AS person_anchors_excluded;
-- Expected: TRUE

SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_FIXTURE
       WHERE PROFILE_DATE <> CONVERT_TIMEZONE('UTC', CURRENT_TIMESTAMP())::DATE) = 0
    AS profile_date_is_today_utc;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 7. Required columns populated; ORG_ID stamped from the anchor.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_FIXTURE
       WHERE ACCOUNT_ID                  IS NULL
          OR PROFILE_DATE                IS NULL
          OR CREDIT_RATING               IS NULL
          OR RATING_OUTLOOK              IS NULL
          OR MARKET_CAP_USD              IS NULL
          OR DAILY_VOLATILITY_PCT        IS NULL
          OR THIRTY_DAY_PRICE_CHANGE_PCT IS NULL
          OR FIFTY_TWO_WEEK_HIGH_USD     IS NULL
          OR FIFTY_TWO_WEEK_LOW_USD      IS NULL
          OR RATING_AGENCY_FLAG_COUNT    IS NULL
          OR LIQUIDITY_TIER              IS NULL
          OR LAST_DATA_REFRESH_AT        IS NULL
          OR GENERATED_AT                IS NULL
          OR RECORD_ID                   IS NULL) = 0
    AS required_columns_populated;
-- Expected: TRUE

SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_FIXTURE
       WHERE ORG_ID IS DISTINCT FROM 'JDO') = 0
    AS org_id_stamped_jdo;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 8. Vocabularies.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_FIXTURE
       WHERE CREDIT_RATING NOT IN (
           'Aaa','Aa1','Aa2','Aa3','A1','A2','A3','Baa1','Baa2','Baa3',
           'Ba1','Ba2','Ba3','B1','B2','B3','Caa1','Caa2','Caa3','Ca','C','NR')) = 0
    AS credit_rating_in_vocabulary;
-- Expected: TRUE

SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_FIXTURE
       WHERE RATING_OUTLOOK NOT IN ('Stable','Positive','Negative','Developing','Watch')) = 0
    AS rating_outlook_in_vocabulary;
-- Expected: TRUE

SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_FIXTURE
       WHERE LIQUIDITY_TIER NOT IN ('Tier 1','Tier 2','Tier 3','Illiquid')) = 0
    AS liquidity_tier_in_vocabulary;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 9. Numeric ranges, the 52-week band, and the day-midnight timestamps.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_FIXTURE
       WHERE DAILY_VOLATILITY_PCT        NOT BETWEEN 0   AND 25
          OR THIRTY_DAY_PRICE_CHANGE_PCT NOT BETWEEN -25 AND 25
          OR MARKET_CAP_USD              NOT BETWEEN 5000000 AND 500000000000
          OR RATING_AGENCY_FLAG_COUNT    NOT BETWEEN 0   AND 5) = 0
    AS numeric_ranges_hold;
-- Expected: TRUE

SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_FIXTURE
       WHERE FIFTY_TWO_WEEK_HIGH_USD < FIFTY_TWO_WEEK_LOW_USD
          OR FIFTY_TWO_WEEK_LOW_USD <= 0) = 0
    AS fifty_two_week_high_ge_low;
-- Expected: TRUE

SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_FIXTURE
       WHERE LAST_DATA_REFRESH_AT <> PROFILE_DATE::TIMESTAMP_NTZ
          OR GENERATED_AT         <> PROFILE_DATE::TIMESTAMP_NTZ) = 0
    AS timestamps_are_profile_date_midnight;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 10. Anchor passthrough and valuation edges.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*)
       FROM DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_FIXTURE m
       JOIN DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS_MOODYS_FIXTURE a
         ON a.ACCOUNT_ID = m.ACCOUNT_ID
      WHERE m.ANNUAL_REVENUE_USD IS DISTINCT FROM a.ANNUAL_REVENUE
         OR m.EMPLOYEE_COUNT     IS DISTINCT FROM a.EMPLOYEE_COUNT) = 0
    AS revenue_and_employees_pass_through;
-- Expected: TRUE

SELECT
    (SELECT ANNUAL_REVENUE_USD IS NULL AND EMPLOYEE_COUNT = 40
       FROM DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_FIXTURE
      WHERE ACCOUNT_ID = 'MDY-FIX-B-04')
    AS null_revenue_stays_null;
-- Expected: TRUE

SELECT
    (SELECT EMPLOYEE_COUNT IS NULL
       FROM DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_FIXTURE
      WHERE ACCOUNT_ID = 'MDY-FIX-B-03')
    AS null_employee_count_stays_null;
-- Expected: TRUE

SELECT
    (SELECT LIQUIDITY_TIER IN ('Tier 1','Tier 2')
       FROM DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_FIXTURE
      WHERE ACCOUNT_ID = 'MDY-FIX-B-05')
    AS sixty_billion_revenue_is_tier_1_or_2;
-- Expected: TRUE

SELECT
    (SELECT MARKET_CAP_USD = 5000000 AND LIQUIDITY_TIER = 'Illiquid'
       FROM DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_FIXTURE
      WHERE ACCOUNT_ID = 'MDY-FIX-B-06')
    AS fifty_k_revenue_clamped_to_floor;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 11. Same-day idempotency: CALL #2 MERGE-updates in place, byte-identical.
-- ---------------------------------------------------------------------------
SET row_count_before = (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_FIXTURE);
SET hash_before      = (SELECT HASH_AGG(*) FROM DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_FIXTURE);

CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_MOODYS_MARKET_CONTEXT_FIXTURE();

SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_FIXTURE) = $row_count_before
    AS idempotency_row_count_unchanged;
-- Expected: TRUE

SELECT
    (SELECT HASH_AGG(*) FROM DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_FIXTURE) = $hash_before
    AS idempotency_hash_unchanged;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 12. Backfill: CALL(3) keeps today and inserts the two days before it.
-- ---------------------------------------------------------------------------
CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_MOODYS_MARKET_CONTEXT_FIXTURE(3);

SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_FIXTURE) = 27
    AS backfill_row_count_27;
-- Expected: TRUE

SELECT
    (SELECT COUNT(DISTINCT PROFILE_DATE) = 3
        AND MIN(PROFILE_DATE) = DATEADD(day, -2, CONVERT_TIMEZONE('UTC', CURRENT_TIMESTAMP())::DATE)
        AND MAX(PROFILE_DATE) = CONVERT_TIMEZONE('UTC', CURRENT_TIMESTAMP())::DATE
       FROM DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_FIXTURE)
    AS backfill_dates_today_minus_0_to_2;
-- Expected: TRUE

SELECT
    (SELECT COUNT(*) FROM (
        SELECT ACCOUNT_ID, PROFILE_DATE
          FROM DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_FIXTURE
         GROUP BY 1, 2 HAVING COUNT(*) > 1)) = 0
    AS one_row_per_account_per_day;
-- Expected: TRUE

-- Today's rows were MERGE-updated with identical values: still the day-1 hash.
SELECT
    (SELECT HASH_AGG(*) FROM DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_FIXTURE
      WHERE PROFILE_DATE = CONVERT_TIMEZONE('UTC', CURRENT_TIMESTAMP())::DATE) = $hash_before
    AS backfill_leaves_today_unchanged;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 13. Year-stable fields are constant per (account, calendar year). Grouping
--     by YEAR(PROFILE_DATE) keeps this valid when the window crosses Jan 1.
--     Fixture ids are not 001am, so the outlook baseline never moves either.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM (
        SELECT ACCOUNT_ID, YEAR(PROFILE_DATE)
          FROM DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_FIXTURE
         GROUP BY 1, 2
        HAVING COUNT(DISTINCT CREDIT_RATING)                   > 1
            OR COUNT(DISTINCT RATING_OUTLOOK)                  > 1
            OR COUNT(DISTINCT HASH(OUTLOOK_LAST_CHANGED_DATE)) > 1
            OR COUNT(DISTINCT FIFTY_TWO_WEEK_HIGH_USD)         > 1
            OR COUNT(DISTINCT FIFTY_TWO_WEEK_LOW_USD)          > 1
            OR COUNT(DISTINCT RATING_AGENCY_FLAG_COUNT)        > 1
            OR COUNT(DISTINCT LIQUIDITY_TIER)                  > 1)) = 0
    AS year_stable_fields_constant;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 14. Daily fields move: at least 8 of 9 accounts see more than one
--     volatility and 30-day change value across the 3 days. The draws are
--     continuous, so the same value on all 3 days would mean the daily seed
--     is not bucketed by day.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM (
        SELECT ACCOUNT_ID
          FROM DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_FIXTURE
         GROUP BY 1
        HAVING COUNT(DISTINCT DAILY_VOLATILITY_PCT) > 1
           AND COUNT(DISTINCT THIRTY_DAY_PRICE_CHANGE_PCT) > 1)) >= 8
    AS daily_fields_vary_across_days;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 15. Cleanup.
-- ---------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_MOODYS_MARKET_CONTEXT_FIXTURE(NUMBER);
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_FIXTURE_STAGING;
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_FIXTURE;
DROP VIEW      IF EXISTS DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS_MOODYS_FIXTURE;
DELETE FROM DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG WHERE TASK_NAME = 'TASK_DAILY_MOODYS_MARKET_CONTEXT_FIXTURE';
