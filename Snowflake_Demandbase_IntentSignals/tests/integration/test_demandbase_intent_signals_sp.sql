-- =============================================================================
-- L2 integration test for SP_GENERATE_DEMANDBASE_INTENT_SIGNALS (Plan 14 T5)
-- =============================================================================
-- Plan:    docs/superpowers/plans/2026-11-02-cumulus-plan-14-demandbase-intent-signals.md
-- Run:     snow sql -f tests/integration/test_demandbase_intent_signals_sp.sql
-- Pass:    Every assertion column returns TRUE. Any FALSE = test failure.
-- Prereqs: schemas/demandbase_intent_signals.sql applied (the fixture table is
--          CREATE ... LIKE the real one) and the SP deployed
--          (python scripts/deploy_sp.py).
--
-- Strategy (Plan 12 fixture-clone pattern): GET_DDL the deployed SP, REPLACE
-- its FQNs with fixture names, EXECUTE IMMEDIATE the clone. Sentinels stop
-- the table-name REPLACE from double-suffixing the _STAGING / SP_ / TASK_
-- identifiers that contain it.
--
-- Passes:
--   A. No Gong: the clone's Gong FQN points at GONG_CALL_SENTIMENT_DB_FIXTURE,
--      which does not exist yet, so the probe returns 0 and the bias is
--      skipped. CALL fixture() = current week. Coverage, one top row per
--      anchor, audience scoping, PK / RECORD_ID uniqueness, NOT NULLs,
--      vocab / ranges, surge semantics.
--   B. Idempotent re-run: row count and HASH_AGG checksum unchanged.
--   C. Backfill: CALL fixture(4) -> 5 distinct PROFILE_WEEKs; current week
--      byte-identical to pass A's standalone run; then CALL fixture(1) and
--      week W-1 must be byte-identical to the CALL(4) version (backfill
--      window does not change a week's rows = trajectory recomputation proof).
--   D. Gong: create the Gong fixture flagging Competitor for anchors 1-6 in
--      all 5 weeks (plus a duplicate row for one anchor-week), re-run
--      CALL fixture(4). Per week: >=3 of the 6 flagged anchors' top rows carry
--      RESEARCHING_COMPETITOR and <=3 of the other 6 do; require >=4 of 5
--      weeks (a single calendar week fails ~3 pct of the time; plan T5).
--      PK still unique despite the duplicate Gong row; the run log shows
--      gong_rows_joined=6 for every week.
--   E. Timing: a second clone reads the REAL audience view into a separate
--      _TIMING table and runs the full 26-week backfill CALL (25). Asserts
--      26 weeks, 6,435-anchor coverage per week, rows in the 9K-15K/week band,
--      and DURATION_MS under 30 minutes. Local estimate (memoized row factory,
--      Apple Silicon): ~34 s of Python for 6,435 x 26 anchor-weeks.
--
-- PROFILE_WEEK is the UTC Monday (the SP uses utcnow()), so the fixture week
-- math below converts CURRENT_TIMESTAMP to UTC first.
-- No ampersand anywhere in this file (snow sql template-render trap).
-- =============================================================================

USE SCHEMA DATA_JEDAIS.FINS__PUBLIC;

-- ---------------------------------------------------------------------------
-- 0. Clean up leftovers from a prior failed run.
-- ---------------------------------------------------------------------------
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.DEMANDBASE_INTENT_SIGNALS_FIXTURE;
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.DEMANDBASE_INTENT_SIGNALS_FIXTURE_STAGING;
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.DEMANDBASE_INTENT_SIGNALS_TIMING;
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.DEMANDBASE_INTENT_SIGNALS_TIMING_STAGING;
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.GONG_CALL_SENTIMENT_DB_FIXTURE;
DROP PROCEDURE IF EXISTS DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_DEMANDBASE_INTENT_SIGNALS_FIXTURE(NUMBER);
DROP PROCEDURE IF EXISTS DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_DEMANDBASE_INTENT_SIGNALS_TIMING(NUMBER);
DROP VIEW      IF EXISTS DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS_FIXTURE;

SET fx_week = (SELECT DATEADD('day', 1 - DAYOFWEEKISO(CONVERT_TIMEZONE('UTC', CURRENT_TIMESTAMP())::DATE),
                              CONVERT_TIMEZONE('UTC', CURRENT_TIMESTAMP())::DATE));

-- ---------------------------------------------------------------------------
-- 1. Fixture audience: the 12 L1 conftest anchors (same IDs, industries,
--    revenue, employees) + 2 out-of-audience anchors (Household container,
--    PERSON) that the audience predicate must exclude. Column shape mirrors
--    V_ACCOUNT_ANCHORS (16 columns).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS_FIXTURE AS
SELECT
    'JDO'::VARCHAR                AS ORG_ID,
    '001DB0000000001AAA'::VARCHAR AS ACCOUNT_ID,
    'Fixture Business 1'::VARCHAR AS ACCOUNT_NAME,
    '2026-11-02'::DATE            AS SNAPSHOT_DATE,
    'Small Business'::VARCHAR     AS CLIENT_CATEGORY,
    'BUSINESS'::VARCHAR           AS ACCOUNT_TYPE_FLAG,
    NULL::TIMESTAMP_LTZ           AS BIRTHDATE,
    NULL::NUMBER                  AS ANNUAL_INCOME,
    NULL::NUMBER                  AS CREDIT_SCORE,
    'Restaurant'::VARCHAR         AS INDUSTRY,
    720000::NUMBER                AS ANNUAL_REVENUE,
    6::NUMBER                     AS EMPLOYEE_COUNT,
    '10001'::VARCHAR              AS POSTAL_CODE,
    'NY'::VARCHAR                 AS STATE_CODE,
    'US'::VARCHAR                 AS COUNTRY_CODE,
    'DB-FIX-001'::VARCHAR         AS EXTERNAL_ID
UNION ALL SELECT 'JDO', '001DB0000000002AAA', 'Fixture Business 2',  '2026-11-02'::DATE, 'Small Business',     'BUSINESS', NULL, NULL, NULL, 'Construction',           710000,   5,    '10001', 'NY', 'US', 'DB-FIX-002'
UNION ALL SELECT 'JDO', '001DB0000000003AAA', 'Fixture Business 3',  '2026-11-02'::DATE, 'Small Business',     'BUSINESS', NULL, NULL, NULL, 'Real Estate',            800000,   4,    '10001', 'NY', 'US', 'DB-FIX-003'
UNION ALL SELECT 'JDO', '001DB0000000004AAA', 'Fixture Business 4',  '2026-11-02'::DATE, 'Small Business',     'BUSINESS', NULL, NULL, NULL, 'Wholesale',              730000,   7,    '10001', 'NY', 'US', 'DB-FIX-004'
UNION ALL SELECT 'JDO', '001DB0000000005AAA', 'Fixture Business 5',  '2026-11-02'::DATE, 'Commercial Banking', 'BUSINESS', NULL, NULL, NULL, 'Logistics',              24000000, 140,  '60601', 'IL', 'US', 'DB-FIX-005'
UNION ALL SELECT 'JDO', '001DB0000000006AAA', 'Fixture Business 6',  '2026-11-02'::DATE, 'Small Business',     'BUSINESS', NULL, NULL, NULL, 'Healthcare',             770000,   9,    '10001', 'NY', 'US', 'DB-FIX-006'
UNION ALL SELECT 'JDO', '001DB0000000007AAA', 'Fixture Business 7',  '2026-11-02'::DATE, NULL,                 'BUSINESS', NULL, NULL, NULL, 'Technology',             4500000,  45,   '94105', 'CA', 'US', 'DB-FIX-007'
UNION ALL SELECT 'JDO', '001DB0000000008AAA', 'Fixture Business 8',  '2026-11-02'::DATE, 'Small Business',     'BUSINESS', NULL, NULL, NULL, 'Manufacturing',          2000000,  30,   '48201', 'MI', 'US', 'DB-FIX-008'
UNION ALL SELECT 'JDO', '001DB0000000009AAA', 'Fixture Business 9',  '2026-11-02'::DATE, 'Small Business',     'BUSINESS', NULL, NULL, NULL, NULL,                     650000,   5,    '10001', 'NY', 'US', 'DB-FIX-009'
UNION ALL SELECT 'JDO', '001DB0000000010AAA', 'Fixture Business 10', '2026-11-02'::DATE, 'Commercial Banking', 'BUSINESS', NULL, NULL, NULL, 'Wholesale Distribution', 29000000, 620,  '75201', 'TX', 'US', 'DB-FIX-010'
UNION ALL SELECT 'JDO', '001DB0000000011AAA', 'Fixture Business 11', '2026-11-02'::DATE, 'Gold',               'BUSINESS', NULL, NULL, NULL, 'Professional Services',  NULL,     12,   '10001', 'NY', 'US', 'DB-FIX-011'
UNION ALL SELECT 'JDO', '001DB0000000012AAA', 'Fixture Business 12', '2026-11-02'::DATE, NULL,                 'BUSINESS', NULL, NULL, NULL, NULL,                     NULL,     NULL, '10001', 'NY', 'US', 'DB-FIX-012'
-- out of audience
UNION ALL SELECT 'JDO', '001DB0000000901AAA', 'Fixture Household',   '2026-11-02'::DATE, 'Household',          'BUSINESS', NULL, NULL, NULL, NULL,                     NULL,     NULL, '10001', 'NY', 'US', 'DB-FIX-901'
UNION ALL SELECT 'JDO', '001DB0000000902AAA', 'Fixture Person',      '2026-11-02'::DATE, 'Retail',             'PERSON',   '1980-01-01'::TIMESTAMP_LTZ, 90000, 720, NULL, NULL, NULL, '10001', 'NY', 'US', 'DB-FIX-902';

-- ---------------------------------------------------------------------------
-- 2. Fixture target table (same DDL as the real one).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE TABLE DATA_JEDAIS.FINS__PUBLIC.DEMANDBASE_INTENT_SIGNALS_FIXTURE
    LIKE DATA_JEDAIS.FINS__PUBLIC.DEMANDBASE_INTENT_SIGNALS;

-- ---------------------------------------------------------------------------
-- 3. Clone the SP with FQN swaps (sentinel ordering, Plan 12 pattern):
--      DEMANDBASE_INTENT_SIGNALS_STAGING     -> DEMANDBASE_INTENT_SIGNALS_FIXTURE_STAGING
--      SP_GENERATE_DEMANDBASE_INTENT_SIGNALS -> SP_GENERATE_DEMANDBASE_INTENT_SIGNALS_FIXTURE
--      TASK_WEEKLY_DEMANDBASE_INTENT_SIGNALS -> TASK_WEEKLY_DEMANDBASE_INTENT_SIGNALS_FIXTURE
--      DEMANDBASE_INTENT_SIGNALS (table)     -> DEMANDBASE_INTENT_SIGNALS_FIXTURE
--      V_ACCOUNT_ANCHORS                     -> V_ACCOUNT_ANCHORS_FIXTURE
--      GONG_CALL_SENTIMENT (table + probe)   -> GONG_CALL_SENTIMENT_DB_FIXTURE
-- ---------------------------------------------------------------------------
EXECUTE IMMEDIATE $$
DECLARE
    sp_ddl STRING;
BEGIN
    sp_ddl := (SELECT GET_DDL('PROCEDURE', 'DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_DEMANDBASE_INTENT_SIGNALS(NUMBER)'));
    sp_ddl := REPLACE(sp_ddl, 'DEMANDBASE_INTENT_SIGNALS_STAGING',     '__DB_STG__');
    sp_ddl := REPLACE(sp_ddl, 'SP_GENERATE_DEMANDBASE_INTENT_SIGNALS', '__DB_SP__');
    sp_ddl := REPLACE(sp_ddl, 'TASK_WEEKLY_DEMANDBASE_INTENT_SIGNALS', '__DB_TASK__');
    sp_ddl := REPLACE(sp_ddl, 'DEMANDBASE_INTENT_SIGNALS',             'DEMANDBASE_INTENT_SIGNALS_FIXTURE');
    sp_ddl := REPLACE(sp_ddl, '__DB_STG__',  'DEMANDBASE_INTENT_SIGNALS_FIXTURE_STAGING');
    sp_ddl := REPLACE(sp_ddl, '__DB_SP__',   'SP_GENERATE_DEMANDBASE_INTENT_SIGNALS_FIXTURE');
    sp_ddl := REPLACE(sp_ddl, '__DB_TASK__', 'TASK_WEEKLY_DEMANDBASE_INTENT_SIGNALS_FIXTURE');
    sp_ddl := REPLACE(sp_ddl, 'V_ACCOUNT_ANCHORS',   'V_ACCOUNT_ANCHORS_FIXTURE');
    sp_ddl := REPLACE(sp_ddl, 'GONG_CALL_SENTIMENT', 'GONG_CALL_SENTIMENT_DB_FIXTURE');
    EXECUTE IMMEDIATE :sp_ddl;
    RETURN 'fixture SP staged';
END;
$$;

-- =============================================================================
-- PASS A -- no Gong, current week
-- =============================================================================
CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_DEMANDBASE_INTENT_SIGNALS_FIXTURE();

SELECT
    (SELECT COUNT(DISTINCT ACCOUNT_ID) FROM DEMANDBASE_INTENT_SIGNALS_FIXTURE) = 12
    AS a01_distinct_accounts_eq_12,
    (SELECT COUNT(*) FROM DEMANDBASE_INTENT_SIGNALS_FIXTURE
       WHERE ACCOUNT_ID IN ('001DB0000000901AAA', '001DB0000000902AAA')) = 0
    AS a02_household_and_person_excluded,
    (SELECT COUNT(DISTINCT PROFILE_WEEK) = 1 AND MIN(PROFILE_WEEK) = $fx_week
       FROM DEMANDBASE_INTENT_SIGNALS_FIXTURE)
    AS a03_single_current_utc_monday,
    (SELECT COUNT(*) FROM (SELECT ACCOUNT_ID FROM DEMANDBASE_INTENT_SIGNALS_FIXTURE
       GROUP BY ACCOUNT_ID HAVING COUNT_IF(IS_TOP_TOPIC) <> 1)) = 0
    AS a04_exactly_one_top_row_per_anchor,
    (SELECT COUNT(*) FROM (SELECT ACCOUNT_ID FROM DEMANDBASE_INTENT_SIGNALS_FIXTURE
       GROUP BY ACCOUNT_ID, PROFILE_WEEK HAVING COUNT(*) NOT BETWEEN 1 AND 4)) = 0
    AS a05_fan_out_1_to_4,
    (SELECT COUNT(*) - COUNT(DISTINCT ORG_ID, ACCOUNT_ID, PROFILE_WEEK, INTENT_TOPIC)
       FROM DEMANDBASE_INTENT_SIGNALS_FIXTURE) = 0
    AS a06_pk_unique,
    (SELECT COUNT(*) - COUNT(DISTINCT RECORD_ID) FROM DEMANDBASE_INTENT_SIGNALS_FIXTURE) = 0
    AS a07_record_id_unique,
    (SELECT COUNT(*) FROM DEMANDBASE_INTENT_SIGNALS_FIXTURE
       WHERE RECORD_ID <> REGEXP_REPLACE(LEFT(SHA2(CONCAT_WS('|', ORG_ID, ACCOUNT_ID, PROFILE_WEEK,
                                INTENT_TOPIC, 'record_id'), 256), 32),
                          '(.{8})(.{4})(.{4})(.{4})(.{12})', '\\1-\\2-\\3-\\4-\\5')) = 0
    AS a08_record_id_matches_sql_formula;

SELECT
    (SELECT COUNT(*) FROM DEMANDBASE_INTENT_SIGNALS_FIXTURE
       WHERE ORG_ID IS NULL OR RECORD_ID IS NULL OR ACCOUNT_ID IS NULL OR PROFILE_WEEK IS NULL
          OR INTENT_TOPIC IS NULL OR TOPIC_CATEGORY IS NULL OR IS_TOP_TOPIC IS NULL
          OR INTENT_SCORE IS NULL OR SURGE_FLAG IS NULL OR WEEKS_SURGING IS NULL
          OR SCORE_DELTA_WOW IS NULL OR JOURNEY_STAGE IS NULL OR UNIQUE_RESEARCHERS IS NULL
          OR KEYWORD_SAMPLE IS NULL OR SIGNAL_SOURCE IS NULL OR LAST_SIGNAL_DATE IS NULL
          OR GENERATED_AT IS NULL) = 0
    AS a09_not_null_columns_populated,
    (SELECT COUNT(*) FROM DEMANDBASE_INTENT_SIGNALS_FIXTURE
       WHERE INTENT_TOPIC NOT IN ('Treasury Management', 'Commercial Lending', 'Equipment Finance',
             'Merchant Services', 'International Payments and FX', 'Payroll Services',
             'Commercial Real Estate Lending', 'SBA Lending', 'AP Automation', 'Business Credit Cards')
          OR TOPIC_CATEGORY NOT IN ('Lending', 'Payments', 'Cash Management', 'Cards')
          OR JOURNEY_STAGE NOT IN ('Awareness', 'Consideration', 'Decision', 'Purchase')
          OR SIGNAL_SOURCE NOT IN ('Demandbase', 'Bombora', 'G2')) = 0
    AS a10_vocabularies,
    (SELECT COUNT(*) FROM DEMANDBASE_INTENT_SIGNALS_FIXTURE
       WHERE INTENT_SCORE NOT BETWEEN 0 AND 100 OR WEEKS_SURGING NOT BETWEEN 0 AND 12
          OR SCORE_DELTA_WOW NOT BETWEEN -100 AND 100 OR UNIQUE_RESEARCHERS NOT BETWEEN 1 AND 40) = 0
    AS a11_ranges,
    (SELECT COUNT(*) FROM DEMANDBASE_INTENT_SIGNALS_FIXTURE
       WHERE SURGE_FLAG <> (INTENT_SCORE >= 70)
          OR (NOT SURGE_FLAG AND WEEKS_SURGING <> 0)
          OR (SURGE_FLAG AND WEEKS_SURGING < 1)
          OR (NOT SURGE_FLAG AND INTENT_NOTE IS NOT NULL)) = 0
    AS a12_surge_semantics,
    (SELECT COUNT(*) FROM DEMANDBASE_INTENT_SIGNALS_FIXTURE
       WHERE NOT IS_TOP_TOPIC AND INTENT_SCORE < 40) = 0
    AS a13_non_top_rows_clear_threshold,
    (SELECT COUNT(*) FROM DEMANDBASE_INTENT_SIGNALS_FIXTURE
       WHERE LAST_SIGNAL_DATE NOT BETWEEN DATEADD('day', -6, PROFILE_WEEK) AND PROFILE_WEEK
          OR GENERATED_AT <> PROFILE_WEEK::TIMESTAMP_NTZ) = 0
    AS a14_dates_week_bucketed,
    (SELECT COUNT(*) FROM DEMANDBASE_INTENT_SIGNALS_FIXTURE
       WHERE RESEARCHING_COMPETITOR IS NOT NULL AND SIGNAL_SOURCE <> 'G2') = 0
    AS a15_competitor_forces_g2;

SELECT
    STATUS = 'SUCCEEDED' AND ERROR_MESSAGE ILIKE '%gong=absent(skipped)%'
    AS a16_log_succeeded_gong_skipped
FROM DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG
WHERE TASK_NAME = 'TASK_WEEKLY_DEMANDBASE_INTENT_SIGNALS_FIXTURE'
ORDER BY EXECUTION_TIME DESC LIMIT 1;

-- =============================================================================
-- PASS B -- idempotent re-run
-- =============================================================================
SET a_rows = (SELECT COUNT(*) FROM DEMANDBASE_INTENT_SIGNALS_FIXTURE);
SET a_hash = (SELECT HASH_AGG(*) FROM DEMANDBASE_INTENT_SIGNALS_FIXTURE);

CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_DEMANDBASE_INTENT_SIGNALS_FIXTURE();

SELECT
    (SELECT COUNT(*) FROM DEMANDBASE_INTENT_SIGNALS_FIXTURE) = $a_rows   AS b01_row_count_unchanged,
    (SELECT HASH_AGG(*) FROM DEMANDBASE_INTENT_SIGNALS_FIXTURE) = $a_hash AS b02_checksum_unchanged;

-- =============================================================================
-- PASS C -- backfill CALL (4) = 5 weeks; byte-identical to standalone runs
-- =============================================================================
CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_DEMANDBASE_INTENT_SIGNALS_FIXTURE(4);

SELECT
    (SELECT COUNT(DISTINCT PROFILE_WEEK) FROM DEMANDBASE_INTENT_SIGNALS_FIXTURE) = 5
    AS c01_five_distinct_weeks,
    (SELECT MIN(PROFILE_WEEK) FROM DEMANDBASE_INTENT_SIGNALS_FIXTURE) = DATEADD('week', -4, $fx_week)
    AS c02_oldest_week_is_w_minus_4,
    (SELECT COUNT(*) FROM (SELECT PROFILE_WEEK FROM DEMANDBASE_INTENT_SIGNALS_FIXTURE
       GROUP BY PROFILE_WEEK HAVING COUNT(DISTINCT ACCOUNT_ID) <> 12 OR COUNT_IF(IS_TOP_TOPIC) <> 12)) = 0
    AS c03_every_week_full_coverage_one_top_each,
    (SELECT HASH_AGG(*) FROM DEMANDBASE_INTENT_SIGNALS_FIXTURE WHERE PROFILE_WEEK = $fx_week) = $a_hash
    AS c04_current_week_equals_standalone_run,
    (SELECT COUNT(*) - COUNT(DISTINCT RECORD_ID) FROM DEMANDBASE_INTENT_SIGNALS_FIXTURE) = 0
    AS c05_record_id_unique_across_weeks;

SET c_hash_w1 = (SELECT HASH_AGG(*) FROM DEMANDBASE_INTENT_SIGNALS_FIXTURE
                 WHERE PROFILE_WEEK = DATEADD('week', -1, $fx_week));
SET c_hash_w4 = (SELECT HASH_AGG(*) FROM DEMANDBASE_INTENT_SIGNALS_FIXTURE
                 WHERE PROFILE_WEEK = DATEADD('week', -4, $fx_week));

CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_DEMANDBASE_INTENT_SIGNALS_FIXTURE(1);

SELECT
    (SELECT HASH_AGG(*) FROM DEMANDBASE_INTENT_SIGNALS_FIXTURE
       WHERE PROFILE_WEEK = DATEADD('week', -1, $fx_week)) = $c_hash_w1
    AS c06_week_minus_1_identical_across_backfill_windows,
    (SELECT HASH_AGG(*) FROM DEMANDBASE_INTENT_SIGNALS_FIXTURE
       WHERE PROFILE_WEEK = DATEADD('week', -4, $fx_week)) = $c_hash_w4
    AS c07_untouched_week_preserved,
    (SELECT HASH_AGG(*) FROM DEMANDBASE_INTENT_SIGNALS_FIXTURE WHERE PROFILE_WEEK = $fx_week) = $a_hash
    AS c08_current_week_still_identical;

-- Trajectory: WEEKS_SURGING equals the consecutive surge run visible in the
-- table (only checkable where the run fits inside the 5 stored weeks).
SELECT COUNT(*) = 0 AS c09_weeks_surging_matches_table_run
FROM DEMANDBASE_INTENT_SIGNALS_FIXTURE cur
WHERE cur.SURGE_FLAG AND cur.WEEKS_SURGING < 5
  AND cur.PROFILE_WEEK >= DATEADD('week', -4 + cur.WEEKS_SURGING, $fx_week)
  AND (
      -- every week in the claimed run must surge (where the topic emitted)
      EXISTS (SELECT 1 FROM DEMANDBASE_INTENT_SIGNALS_FIXTURE p
              WHERE p.ACCOUNT_ID = cur.ACCOUNT_ID AND p.INTENT_TOPIC = cur.INTENT_TOPIC
                AND p.PROFILE_WEEK BETWEEN DATEADD('week', 1 - cur.WEEKS_SURGING, cur.PROFILE_WEEK)
                                       AND cur.PROFILE_WEEK
                AND NOT p.SURGE_FLAG)
      -- and the week before the run must not
      OR EXISTS (SELECT 1 FROM DEMANDBASE_INTENT_SIGNALS_FIXTURE p
                 WHERE p.ACCOUNT_ID = cur.ACCOUNT_ID AND p.INTENT_TOPIC = cur.INTENT_TOPIC
                   AND p.PROFILE_WEEK = DATEADD('week', -cur.WEEKS_SURGING, cur.PROFILE_WEEK)
                   AND p.SURGE_FLAG)
  );

-- =============================================================================
-- PASS D -- Gong soft-dep: Competitor for anchors 1-6 in all 5 weeks
-- =============================================================================
CREATE OR REPLACE TABLE DATA_JEDAIS.FINS__PUBLIC.GONG_CALL_SENTIMENT_DB_FIXTURE (
    ACCOUNT_ID       VARCHAR,
    PROFILE_WEEK     DATE,
    KEY_TOPICS_FLAGS VARCHAR
);
INSERT INTO DATA_JEDAIS.FINS__PUBLIC.GONG_CALL_SENTIMENT_DB_FIXTURE
SELECT a.ACCOUNT_ID, DATEADD('week', -w.n, $fx_week), 'Competitor|Pricing'
FROM (SELECT column1 AS ACCOUNT_ID FROM VALUES
        ('001DB0000000001AAA'), ('001DB0000000002AAA'), ('001DB0000000003AAA'),
        ('001DB0000000004AAA'), ('001DB0000000005AAA'), ('001DB0000000006AAA')) a
CROSS JOIN (SELECT column1 AS n FROM VALUES (0), (1), (2), (3), (4)) w;
-- Duplicate account-week (the live Gong defect): must not duplicate PKs.
INSERT INTO DATA_JEDAIS.FINS__PUBLIC.GONG_CALL_SENTIMENT_DB_FIXTURE
VALUES ('001DB0000000001AAA', $fx_week, 'Renewal'),
       ('001DB0000000007AAA', $fx_week, NULL);

CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_DEMANDBASE_INTENT_SIGNALS_FIXTURE(4);

WITH per_week AS (
    SELECT PROFILE_WEEK,
           COUNT_IF(IS_TOP_TOPIC AND RESEARCHING_COMPETITOR IS NOT NULL
                    AND ACCOUNT_ID <= '001DB0000000006AAA') AS flagged_hits,
           COUNT_IF(IS_TOP_TOPIC AND RESEARCHING_COMPETITOR IS NOT NULL
                    AND ACCOUNT_ID >  '001DB0000000006AAA') AS unflagged_hits
    FROM DEMANDBASE_INTENT_SIGNALS_FIXTURE
    GROUP BY PROFILE_WEEK
)
SELECT
    COUNT(*) = 5                                                AS d01_five_weeks_scored,
    COUNT_IF(flagged_hits >= 3 AND unflagged_hits <= 3) >= 4    AS d02_gong_split_holds_4_of_5_weeks,
    LISTAGG(PROFILE_WEEK || ':' || flagged_hits || '/' || unflagged_hits, ', ')
        WITHIN GROUP (ORDER BY PROFILE_WEEK)                    AS d02_detail_flagged_vs_unflagged
FROM per_week;

SELECT
    (SELECT COUNT(*) - COUNT(DISTINCT ORG_ID, ACCOUNT_ID, PROFILE_WEEK, INTENT_TOPIC)
       FROM DEMANDBASE_INTENT_SIGNALS_FIXTURE) = 0
    AS d03_pk_unique_despite_duplicate_gong_row,
    (SELECT COUNT(*) - COUNT(DISTINCT RECORD_ID) FROM DEMANDBASE_INTENT_SIGNALS_FIXTURE) = 0
    AS d04_record_id_unique,
    (SELECT COUNT(*) FROM (SELECT PROFILE_WEEK FROM DEMANDBASE_INTENT_SIGNALS_FIXTURE
       GROUP BY PROFILE_WEEK HAVING COUNT(DISTINCT ACCOUNT_ID) <> 12)) = 0
    AS d05_coverage_unchanged;

SELECT
    STATUS = 'SUCCEEDED'
    AND ERROR_MESSAGE ILIKE '%gong=present%'
    AND REGEXP_COUNT(ERROR_MESSAGE, 'gong_rows_joined=6,gong_competitor_accounts=6') = 5
    AND ERROR_MESSAGE NOT ILIKE '%WARN%'
    AS d06_log_shows_gong_rows_joined_every_week,
    ERROR_MESSAGE AS d06_detail
FROM DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG
WHERE TASK_NAME = 'TASK_WEEKLY_DEMANDBASE_INTENT_SIGNALS_FIXTURE'
ORDER BY EXECUTION_TIME DESC LIMIT 1;

-- =============================================================================
-- PASS E -- 26-week backfill timing check on the REAL audience
-- =============================================================================
CREATE OR REPLACE TABLE DATA_JEDAIS.FINS__PUBLIC.DEMANDBASE_INTENT_SIGNALS_TIMING
    LIKE DATA_JEDAIS.FINS__PUBLIC.DEMANDBASE_INTENT_SIGNALS;

EXECUTE IMMEDIATE $$
DECLARE
    sp_ddl STRING;
BEGIN
    sp_ddl := (SELECT GET_DDL('PROCEDURE', 'DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_DEMANDBASE_INTENT_SIGNALS(NUMBER)'));
    sp_ddl := REPLACE(sp_ddl, 'DEMANDBASE_INTENT_SIGNALS_STAGING',     '__DB_STG__');
    sp_ddl := REPLACE(sp_ddl, 'SP_GENERATE_DEMANDBASE_INTENT_SIGNALS', '__DB_SP__');
    sp_ddl := REPLACE(sp_ddl, 'TASK_WEEKLY_DEMANDBASE_INTENT_SIGNALS', '__DB_TASK__');
    sp_ddl := REPLACE(sp_ddl, 'DEMANDBASE_INTENT_SIGNALS',             'DEMANDBASE_INTENT_SIGNALS_TIMING');
    sp_ddl := REPLACE(sp_ddl, '__DB_STG__',  'DEMANDBASE_INTENT_SIGNALS_TIMING_STAGING');
    sp_ddl := REPLACE(sp_ddl, '__DB_SP__',   'SP_GENERATE_DEMANDBASE_INTENT_SIGNALS_TIMING');
    sp_ddl := REPLACE(sp_ddl, '__DB_TASK__', 'TASK_WEEKLY_DEMANDBASE_INTENT_SIGNALS_TIMING');
    EXECUTE IMMEDIATE :sp_ddl;
    RETURN 'timing SP staged';
END;
$$;

SET aud = (SELECT COUNT(DISTINCT ACCOUNT_ID) FROM DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS
            WHERE ACCOUNT_TYPE_FLAG = 'BUSINESS' AND COALESCE(CLIENT_CATEGORY, '') <> 'Household');

CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_DEMANDBASE_INTENT_SIGNALS_TIMING(25);

WITH wk AS (
    SELECT PROFILE_WEEK, COUNT(*) AS n_rows, COUNT(DISTINCT ACCOUNT_ID) AS n_accts,
           COUNT_IF(IS_TOP_TOPIC) AS n_top
    FROM DEMANDBASE_INTENT_SIGNALS_TIMING GROUP BY PROFILE_WEEK
)
SELECT
    COUNT(*) = 26                                     AS e01_26_weeks,
    COUNT_IF(n_accts = $aud AND n_top = $aud) = 26    AS e02_full_coverage_every_week,
    $aud                                              AS e02_detail_audience,
    COUNT_IF(n_rows BETWEEN 9000 AND 15000) = 26      AS e03_rows_per_week_in_band,
    SUM(n_rows)                                       AS e03_detail_total_rows
FROM wk;

SELECT
    STATUS = 'SUCCEEDED' AND DURATION_MS < 30 * 60 * 1000 AS e04_backfill_under_30_min,
    DURATION_MS                                          AS e04_detail_duration_ms
FROM DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG
WHERE TASK_NAME = 'TASK_WEEKLY_DEMANDBASE_INTENT_SIGNALS_TIMING'
ORDER BY EXECUTION_TIME DESC LIMIT 1;

-- ---------------------------------------------------------------------------
-- Teardown (leave TASK_EXECUTION_LOG rows; they carry the fixture task names).
-- ---------------------------------------------------------------------------
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.DEMANDBASE_INTENT_SIGNALS_FIXTURE;
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.DEMANDBASE_INTENT_SIGNALS_FIXTURE_STAGING;
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.DEMANDBASE_INTENT_SIGNALS_TIMING;
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.DEMANDBASE_INTENT_SIGNALS_TIMING_STAGING;
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.GONG_CALL_SENTIMENT_DB_FIXTURE;
DROP PROCEDURE IF EXISTS DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_DEMANDBASE_INTENT_SIGNALS_FIXTURE(NUMBER);
DROP PROCEDURE IF EXISTS DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_DEMANDBASE_INTENT_SIGNALS_TIMING(NUMBER);
DROP VIEW      IF EXISTS DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS_FIXTURE;
