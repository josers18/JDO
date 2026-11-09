-- =============================================================================
-- L2 integration test for SP_GENERATE_MSCI_ESG_SCORES
-- =============================================================================
-- Run:     snow sql -c SFDC_DC_TECH_ARCH_jwt --role ACCOUNTADMIN \
--            -f tests/integration/test_msci_esg_sp.sql
--          (ACCOUNTADMIN: the cloned SP is EXECUTE AS OWNER and write_pandas
--          creates its staging table, which needs CREATE TABLE.)
-- Pass:    Every assertion column returns TRUE. Any FALSE = test failure.
--
-- Strategy:
--   Clone the deployed SP into SP_GENERATE_MSCI_ESG_SCORES_FIXTURE via
--   GET_DDL + REPLACE, redirecting the dataset table, staging table, task-log
--   name and V_ACCOUNT_ANCHORS to fixture-scoped names, then CALL it against
--   a 15-anchor fixture view (13 BUSINESS + 2 PERSON).
--   Sentinels avoid substring collisions: MSCI_ESG_SCORES is a stem of the SP,
--   task and staging names, so those are parked first and expanded after the
--   table swap. Before the clone is created, a guard re-scans the REPLACEd DDL
--   and raises if any live write target (MSCI_ESG_SCORES or
--   V_ACCOUNT_ANCHORS without the fixture suffix) survives. The only live
--   object the clone still touches is TASK_EXECUTION_LOG, and only under the
--   fixture TASK_NAME.
--
--   The SP's only inputs are V_ACCOUNT_ANCHORS (audience) and its own dataset
--   table (prior-month rows); there is no other upstream table.
--   The SP takes P_PROFILE_MONTH VARCHAR DEFAULT NULL: 'YYYY-MM-DD' (any day
--   of the month) regenerates that month, NULL = the current UTC month. Ratings
--   are sticky: each row evolves from the account's row for the month before.
--
-- What it covers:
--   - Audience: only BUSINESS anchors emit rows (PERSON ids absent), including
--     an anchor with NULL industry / revenue / employee count.
--   - Month 0 (CALL with no argument, no prior rows): one row per business
--     anchor dated the 1st of the current UTC month, 15 columns populated,
--     ORG_ID stamped, fresh draws flagged 'Unchanged'.
--   - Vocabularies and ranges: rating, industry class, direction, scores
--     [0, 10], carbon [0, 2000], controversy count/category invariant,
--     materiality tags, Laggard => at least one controversy.
--   - Industry anchor influence: heavy industries score lower on the
--     environmental pillar than clean industries.
--   - Idempotency: a second CALL leaves the row count and HASH_AGG unchanged.
--   - Sticky history: CALL for m-3, m-2, m-1 (oldest first) then the current
--     month again. Per consecutive pair: rating moves at most 2 notches, the
--     direction flag equals the actual move, the overall score follows the
--     rating, carbon moves within 8%, and materiality tags carry over.
--   - Past-month population: re-CALLing a past month only refreshes accounts
--     that already have a row for it.
--   - Log row: a SUCCEEDED row is written under the fixture task name.
--
-- Pre-requisites:
--   SP_GENERATE_MSCI_ESG_SCORES deployed (python3 scripts/deploy_sp.py).
-- Side effects:
--   Fixture runs log to TASK_EXECUTION_LOG as
--   TASK_MONTHLY_MSCI_ESG_SCORES_FIXTURE; the cleanup step deletes those rows.
-- =============================================================================

USE SCHEMA DATA_JEDAIS.FINS__PUBLIC;

-- ---------------------------------------------------------------------------
-- 1. Drop leftovers from a prior failed run.
-- ---------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_MSCI_ESG_SCORES_FIXTURE(VARCHAR);
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.MSCI_ESG_SCORES_FIXTURE_STAGING;
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.MSCI_ESG_SCORES_FIXTURE;
DROP VIEW      IF EXISTS DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS_MSCI_FIXTURE;
DELETE FROM DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG WHERE TASK_NAME = 'TASK_MONTHLY_MSCI_ESG_SCORES_FIXTURE';

-- ---------------------------------------------------------------------------
-- 2. Fixture audience view, in the live V_ACCOUNT_ANCHORS column order.
--    BUSINESS anchors B-01..B-13 (legacy B-01..B-12 plus B-13):
--      9 industries (Construction, Finance, Food & Beverage, Healthcare,
--      Manufacturing, Personal Services, Real Estate, Retail, Tech) plus
--      Energy, Mining, Software; 3 revenue bands; Small Business and
--      Commercial Banking mix; B-13 has NULL industry/revenue/employees.
--    PERSON anchors P-01..P-02 must be filtered out by the audience SQL.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS_MSCI_FIXTURE AS
SELECT
    'JDO'::VARCHAR                      AS ORG_ID,
    'MSC-FIX-B-01'::VARCHAR             AS ACCOUNT_ID,
    'Mariposa Cleaners LLC'::VARCHAR    AS ACCOUNT_NAME,
    '2026-11-01'::DATE                  AS SNAPSHOT_DATE,
    'Small Business'::VARCHAR           AS CLIENT_CATEGORY,
    'BUSINESS'::VARCHAR                 AS ACCOUNT_TYPE_FLAG,
    NULL::TIMESTAMP_LTZ                 AS BIRTHDATE,
    NULL::NUMBER                        AS ANNUAL_INCOME,
    NULL::NUMBER                        AS CREDIT_SCORE,
    'Personal Services'::VARCHAR        AS INDUSTRY,
    480000::NUMBER                      AS ANNUAL_REVENUE,
    6::NUMBER                           AS EMPLOYEE_COUNT,
    '94110'::VARCHAR                    AS POSTAL_CODE,
    'CA'::VARCHAR                       AS STATE_CODE,
    'US'::VARCHAR                       AS COUNTRY_CODE,
    'EXT-MSC-B-01'::VARCHAR             AS EXTERNAL_ID
UNION ALL SELECT 'JDO','MSC-FIX-B-02','Pinewood Coffee Co.','2026-11-01','Small Business','BUSINESS',NULL,NULL,NULL,'Food & Beverage',1200000,18,'98101','WA','US','EXT-MSC-B-02'
UNION ALL SELECT 'JDO','MSC-FIX-B-03','Northwood Manufacturing Inc.','2026-11-01','Commercial Banking','BUSINESS',NULL,NULL,NULL,'Manufacturing',28000000,240,'48226','MI','US','EXT-MSC-B-03'
UNION ALL SELECT 'JDO','MSC-FIX-B-04','Granite Energy Partners','2026-11-01','Commercial Banking','BUSINESS',NULL,NULL,NULL,'Energy',145000000,380,'77002','TX','US','EXT-MSC-B-04'
UNION ALL SELECT 'JDO','MSC-FIX-B-05','Atlas Tech Holdings','2026-11-01','Commercial Banking','BUSINESS',NULL,NULL,NULL,'Tech',320000000,1450,'94105','CA','US','EXT-MSC-B-05'
UNION ALL SELECT 'JDO','MSC-FIX-B-06','Heritage Wealth Advisors','2026-11-01','Commercial Banking','BUSINESS',NULL,NULL,NULL,'Finance',45000000,180,'60601','IL','US','EXT-MSC-B-06'
UNION ALL SELECT 'JDO','MSC-FIX-B-07','Cedar Healthcare Group','2026-11-01','Commercial Banking','BUSINESS',NULL,NULL,NULL,'Healthcare',88000000,520,'02115','MA','US','EXT-MSC-B-07'
UNION ALL SELECT 'JDO','MSC-FIX-B-08','Sterling Real Estate Trust','2026-11-01','Commercial Banking','BUSINESS',NULL,NULL,NULL,'Real Estate',12000000,32,'10017','NY','US','EXT-MSC-B-08'
UNION ALL SELECT 'JDO','MSC-FIX-B-09','Riverbend Construction LLC','2026-11-01','Small Business','BUSINESS',NULL,NULL,NULL,'Construction',4500000,38,'85003','AZ','US','EXT-MSC-B-09'
UNION ALL SELECT 'JDO','MSC-FIX-B-10','Maplewood Retail Co.','2026-11-01','Small Business','BUSINESS',NULL,NULL,NULL,'Retail',2800000,24,'30309','GA','US','EXT-MSC-B-10'
UNION ALL SELECT 'JDO','MSC-FIX-B-11','Cobalt Mining Corp','2026-11-01','Commercial Banking','BUSINESS',NULL,NULL,NULL,'Mining',220000000,950,'80205','CO','US','EXT-MSC-B-11'
UNION ALL SELECT 'JDO','MSC-FIX-B-12','Aurora Software Inc.','2026-11-01','Small Business','BUSINESS',NULL,NULL,NULL,'Software',750000,5,'78704','TX','US','EXT-MSC-B-12'
UNION ALL SELECT 'JDO','MSC-FIX-B-13','Fixture Unclassified LLC','2026-11-01','Small Business','BUSINESS',NULL,NULL,NULL,NULL,NULL,NULL,'73301','TX','US','EXT-MSC-B-13'
UNION ALL SELECT 'JDO','MSC-FIX-P-01','Avery Stone','2026-11-01','Retail','PERSON','2002-03-14'::TIMESTAMP_LTZ,42000,680,NULL,NULL,NULL,'94110','CA','US','EXT-MSC-P-01'
UNION ALL SELECT 'JDO','MSC-FIX-P-02','Quinn Marlowe','2026-11-01','Wealth Management','PERSON','1972-04-08'::TIMESTAMP_LTZ,285000,770,NULL,NULL,NULL,'94027','CA','US','EXT-MSC-P-02';

-- ---------------------------------------------------------------------------
-- 3. Fixture target table: same DDL as MSCI_ESG_SCORES.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE TABLE DATA_JEDAIS.FINS__PUBLIC.MSCI_ESG_SCORES_FIXTURE
LIKE DATA_JEDAIS.FINS__PUBLIC.MSCI_ESG_SCORES;

-- ---------------------------------------------------------------------------
-- 4. Clone the SP. The live signature is (P_PROFILE_MONTH VARCHAR DEFAULT
--    NULL), so GET_DDL needs the argument type. The guard raises before the
--    clone is created if any live write target survives the REPLACEs.
-- ---------------------------------------------------------------------------
EXECUTE IMMEDIATE $$
DECLARE
    sp_ddl STRING;
    leftover STRING;
    live_target_survives EXCEPTION (-20001, 'live write target survives in fixture SP DDL');
BEGIN
    sp_ddl := (SELECT GET_DDL('PROCEDURE', 'DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_MSCI_ESG_SCORES(VARCHAR)'));
    -- Park the identifiers that contain MSCI_ESG_SCORES as a stem.
    sp_ddl := REPLACE(sp_ddl, 'MSCI_ESG_SCORES_STAGING',     '__MSCI_STG__');
    sp_ddl := REPLACE(sp_ddl, 'SP_GENERATE_MSCI_ESG_SCORES',  '__MSCI_SP__');
    sp_ddl := REPLACE(sp_ddl, 'TASK_MONTHLY_MSCI_ESG_SCORES', '__MSCI_TASK__');
    -- The dataset table name is now unambiguous.
    sp_ddl := REPLACE(sp_ddl, 'MSCI_ESG_SCORES',              'MSCI_ESG_SCORES_FIXTURE');
    -- Expand the sentinels to fixture names.
    sp_ddl := REPLACE(sp_ddl, '__MSCI_STG__',                 'MSCI_ESG_SCORES_FIXTURE_STAGING');
    sp_ddl := REPLACE(sp_ddl, '__MSCI_SP__',                  'SP_GENERATE_MSCI_ESG_SCORES_FIXTURE');
    sp_ddl := REPLACE(sp_ddl, '__MSCI_TASK__',                'TASK_MONTHLY_MSCI_ESG_SCORES_FIXTURE');
    -- Redirect the audience to the fixture view.
    sp_ddl := REPLACE(sp_ddl, 'V_ACCOUNT_ANCHORS',            'V_ACCOUNT_ANCHORS_MSCI_FIXTURE');
    -- Guard: strip every legitimate fixture name; no live name may remain.
    leftover := REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(sp_ddl,
        'MSCI_ESG_SCORES_FIXTURE_STAGING', ''),
        'SP_GENERATE_MSCI_ESG_SCORES_FIXTURE', ''),
        'TASK_MONTHLY_MSCI_ESG_SCORES_FIXTURE', ''),
        'MSCI_ESG_SCORES_FIXTURE', ''),
        'V_ACCOUNT_ANCHORS_MSCI_FIXTURE', '');
    IF (CONTAINS(leftover, 'MSCI_ESG_SCORES') OR CONTAINS(leftover, 'V_ACCOUNT_ANCHORS')) THEN
        RAISE live_target_survives;
    END IF;
    EXECUTE IMMEDIATE :sp_ddl;
    RETURN 'fixture SP staged';
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Month anchors (UTC, as the SP computes them) and CALL #1 (no argument,
--    as the task runs it). The fixture table is empty, so there are no prior
--    rows and every row is a fresh draw.
-- ---------------------------------------------------------------------------
SET m0 = (SELECT DATE_TRUNC('month', CONVERT_TIMEZONE('UTC', CURRENT_TIMESTAMP())::DATE));
SET m1 = (SELECT DATEADD(month, -1, $m0));
SET m2 = (SELECT DATEADD(month, -2, $m0));
SET m3 = (SELECT DATEADD(month, -3, $m0));

CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_MSCI_ESG_SCORES_FIXTURE();

-- ---------------------------------------------------------------------------
-- 6. Audience and coverage.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(DISTINCT ACCOUNT_ID) FROM DATA_JEDAIS.FINS__PUBLIC.MSCI_ESG_SCORES_FIXTURE) = 13
    AS distinct_business_accounts_13;
-- Expected: TRUE

SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MSCI_ESG_SCORES_FIXTURE) = 13
    AS row_count_one_per_account;
-- Expected: TRUE

SELECT
    (SELECT COUNT(DISTINCT ACCOUNT_ID) FROM DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS_MSCI_FIXTURE
       WHERE ACCOUNT_TYPE_FLAG = 'BUSINESS') =
    (SELECT COUNT(DISTINCT ACCOUNT_ID) FROM DATA_JEDAIS.FINS__PUBLIC.MSCI_ESG_SCORES_FIXTURE)
    AS coverage_matches_business_audience;
-- Expected: TRUE

SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MSCI_ESG_SCORES_FIXTURE
       WHERE ACCOUNT_ID LIKE 'MSC-FIX-P-%') = 0
    AS person_anchors_excluded;
-- Expected: TRUE

SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MSCI_ESG_SCORES_FIXTURE
       WHERE PROFILE_MONTH <> $m0) = 0
    AS profile_month_is_current_utc_month;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 7. Required columns populated; ORG_ID stamped from the anchor.
--    TOP_CONTROVERSY_CATEGORY is the only nullable output column.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MSCI_ESG_SCORES_FIXTURE
       WHERE ORG_ID                              IS NULL
          OR ACCOUNT_ID                          IS NULL
          OR PROFILE_MONTH                       IS NULL
          OR MSCI_ESG_RATING                     IS NULL
          OR INDUSTRY_CLASSIFICATION             IS NULL
          OR ESG_SCORE_OVERALL                   IS NULL
          OR ENVIRONMENTAL_SCORE                 IS NULL
          OR SOCIAL_SCORE                        IS NULL
          OR GOVERNANCE_SCORE                    IS NULL
          OR CARBON_INTENSITY_TONS_PER_M_REVENUE IS NULL
          OR CONTROVERSY_FLAG_COUNT              IS NULL
          OR MATERIALITY_TAGS                    IS NULL
          OR LAST_RATING_CHANGE_DIRECTION        IS NULL
          OR GENERATED_AT                        IS NULL
          OR RECORD_ID                           IS NULL) = 0
    AS required_columns_populated;
-- Expected: TRUE

SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MSCI_ESG_SCORES_FIXTURE
       WHERE ORG_ID IS DISTINCT FROM 'JDO') = 0
    AS org_id_stamped_jdo;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 8. Vocabularies and ranges (month 0 = fresh draws, no prior rows).
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MSCI_ESG_SCORES_FIXTURE
       WHERE MSCI_ESG_RATING NOT IN ('AAA','AA','A','BBB','BB','B','CCC')
          OR INDUSTRY_CLASSIFICATION NOT IN ('Leader','Average','Laggard')
          OR LAST_RATING_CHANGE_DIRECTION NOT IN ('Upgrade','Downgrade','Unchanged')) = 0
    AS vocabularies_in_range;
-- Expected: TRUE

SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MSCI_ESG_SCORES_FIXTURE
       WHERE ESG_SCORE_OVERALL     NOT BETWEEN 0 AND 10
          OR ENVIRONMENTAL_SCORE   NOT BETWEEN 0 AND 10
          OR SOCIAL_SCORE          NOT BETWEEN 0 AND 10
          OR GOVERNANCE_SCORE      NOT BETWEEN 0 AND 10
          OR CARBON_INTENSITY_TONS_PER_M_REVENUE NOT BETWEEN 0 AND 2000
          OR CONTROVERSY_FLAG_COUNT < 0) = 0
    AS numeric_ranges_hold;
-- Expected: TRUE

-- No prior month exists, so a fresh draw is flagged 'Unchanged'.
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MSCI_ESG_SCORES_FIXTURE
       WHERE LAST_RATING_CHANGE_DIRECTION <> 'Unchanged') = 0
    AS fresh_draw_is_unchanged;
-- Expected: TRUE

SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MSCI_ESG_SCORES_FIXTURE
       WHERE GENERATED_AT <> PROFILE_MONTH::TIMESTAMP_NTZ) = 0
    AS generated_at_is_month_start_midnight;
-- Expected: TRUE

-- Materiality tags: 2-4 comma-separated tags, sorted.
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MSCI_ESG_SCORES_FIXTURE
       WHERE ARRAY_SIZE(SPLIT(MATERIALITY_TAGS, ',')) NOT BETWEEN 2 AND 4) = 0
    AS materiality_tag_count_2_to_4;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 9. Controversy invariants: TOP_CONTROVERSY_CATEGORY is NULL iff
--    CONTROVERSY_FLAG_COUNT = 0, and Laggards always carry >= 1 controversy.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MSCI_ESG_SCORES_FIXTURE
       WHERE (CONTROVERSY_FLAG_COUNT = 0 AND TOP_CONTROVERSY_CATEGORY IS NOT NULL)
          OR (CONTROVERSY_FLAG_COUNT > 0 AND TOP_CONTROVERSY_CATEGORY IS NULL)) = 0
    AS controversy_null_invariant;
-- Expected: TRUE

SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MSCI_ESG_SCORES_FIXTURE
       WHERE INDUSTRY_CLASSIFICATION = 'Laggard' AND CONTROVERSY_FLAG_COUNT < 1) = 0
    AS laggards_have_controversies;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 10. Industry-vs-environmental-score sanity: heavy industries (Energy,
--     Mining, Manufacturing; base 3.5-4.5) have a lower mean E score than
--     clean industries (Tech, Software, Finance; base 7-7.5).
-- ---------------------------------------------------------------------------
SELECT
    (SELECT AVG(m.ENVIRONMENTAL_SCORE)
       FROM DATA_JEDAIS.FINS__PUBLIC.MSCI_ESG_SCORES_FIXTURE m
       JOIN DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS_MSCI_FIXTURE a ON a.ACCOUNT_ID = m.ACCOUNT_ID
      WHERE a.INDUSTRY IN ('Energy', 'Mining', 'Manufacturing')) <
    (SELECT AVG(m.ENVIRONMENTAL_SCORE)
       FROM DATA_JEDAIS.FINS__PUBLIC.MSCI_ESG_SCORES_FIXTURE m
       JOIN DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS_MSCI_FIXTURE a ON a.ACCOUNT_ID = m.ACCOUNT_ID
      WHERE a.INDUSTRY IN ('Tech', 'Software', 'Finance'))
    AS industry_e_score_correlates;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 11. Log row: CALL #1 logged SUCCEEDED under the fixture task name.
-- ---------------------------------------------------------------------------
SELECT EXISTS (
    SELECT 1 FROM DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG
     WHERE TASK_NAME = 'TASK_MONTHLY_MSCI_ESG_SCORES_FIXTURE'
       AND STATUS = 'SUCCEEDED'
       AND ACCOUNTS_PROCESSED = 13
) AS log_row_present;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 12. Idempotency: CALL #2 MERGE-updates in place, byte-identical (the seed
--     is account|salt|month and GENERATED_AT is month-start, not wall clock).
-- ---------------------------------------------------------------------------
SET row_count_before = (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MSCI_ESG_SCORES_FIXTURE);
SET hash_before      = (SELECT HASH_AGG(ORG_ID, ACCOUNT_ID, PROFILE_MONTH, MSCI_ESG_RATING, INDUSTRY_CLASSIFICATION,
                                        ESG_SCORE_OVERALL, ENVIRONMENTAL_SCORE, SOCIAL_SCORE, GOVERNANCE_SCORE,
                                        CARBON_INTENSITY_TONS_PER_M_REVENUE, CONTROVERSY_FLAG_COUNT,
                                        COALESCE(TOP_CONTROVERSY_CATEGORY, '__NULL__'),
                                        MATERIALITY_TAGS, LAST_RATING_CHANGE_DIRECTION, GENERATED_AT)::VARCHAR
                          FROM DATA_JEDAIS.FINS__PUBLIC.MSCI_ESG_SCORES_FIXTURE);

CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_MSCI_ESG_SCORES_FIXTURE();

SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MSCI_ESG_SCORES_FIXTURE) = $row_count_before
    AS idempotency_row_count_unchanged;
-- Expected: TRUE

SELECT
    (SELECT HASH_AGG(ORG_ID, ACCOUNT_ID, PROFILE_MONTH, MSCI_ESG_RATING, INDUSTRY_CLASSIFICATION,
                     ESG_SCORE_OVERALL, ENVIRONMENTAL_SCORE, SOCIAL_SCORE, GOVERNANCE_SCORE,
                     CARBON_INTENSITY_TONS_PER_M_REVENUE, CONTROVERSY_FLAG_COUNT,
                     COALESCE(TOP_CONTROVERSY_CATEGORY, '__NULL__'),
                     MATERIALITY_TAGS, LAST_RATING_CHANGE_DIRECTION, GENERATED_AT)::VARCHAR
       FROM DATA_JEDAIS.FINS__PUBLIC.MSCI_ESG_SCORES_FIXTURE) = $hash_before
    AS determinism_hash_unchanged;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 13. Sticky history. Rebuild m-3, m-2, m-1 OLDEST FIRST, then re-run the
--     current month, which now evolves from m-1 instead of a fresh draw.
--     m-3 has no prior and no existing rows, so it is a fresh draw for the
--     full audience; each later month evolves from the month before.
-- ---------------------------------------------------------------------------
CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_MSCI_ESG_SCORES_FIXTURE(TO_VARCHAR($m3));
CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_MSCI_ESG_SCORES_FIXTURE(TO_VARCHAR($m2));
CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_MSCI_ESG_SCORES_FIXTURE(TO_VARCHAR($m1));
CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_MSCI_ESG_SCORES_FIXTURE();

SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MSCI_ESG_SCORES_FIXTURE) = 4 * 13
    AS history_row_count_4_months_x_13;
-- Expected: TRUE

SELECT
    (SELECT COUNT(DISTINCT PROFILE_MONTH) = 4
        AND MIN(PROFILE_MONTH) = $m3 AND MAX(PROFILE_MONTH) = $m0
       FROM DATA_JEDAIS.FINS__PUBLIC.MSCI_ESG_SCORES_FIXTURE)
    AS history_months_m3_to_m0;
-- Expected: TRUE

SELECT
    (SELECT COUNT(*) FROM (
        SELECT ORG_ID, ACCOUNT_ID, PROFILE_MONTH
          FROM DATA_JEDAIS.FINS__PUBLIC.MSCI_ESG_SCORES_FIXTURE
         GROUP BY 1, 2, 3 HAVING COUNT(*) > 1)) = 0
    AS one_row_per_account_per_month;
-- Expected: TRUE

-- Consecutive-month pairs for the chain assertions below.
CREATE OR REPLACE TEMPORARY TABLE MSCI_FIXTURE_PAIRS AS
SELECT
    c.ACCOUNT_ID,
    c.LAST_RATING_CHANGE_DIRECTION AS cur_dir,
    DECODE(p.MSCI_ESG_RATING, 'AAA',7,'AA',6,'A',5,'BBB',4,'BB',3,'B',2,'CCC',1) AS prev_level,
    DECODE(c.MSCI_ESG_RATING, 'AAA',7,'AA',6,'A',5,'BBB',4,'BB',3,'B',2,'CCC',1) AS cur_level,
    p.ESG_SCORE_OVERALL AS prev_overall,
    c.ESG_SCORE_OVERALL AS cur_overall,
    p.CARBON_INTENSITY_TONS_PER_M_REVENUE AS prev_carbon,
    c.CARBON_INTENSITY_TONS_PER_M_REVENUE AS cur_carbon,
    p.MATERIALITY_TAGS AS prev_tags,
    c.MATERIALITY_TAGS AS cur_tags
FROM DATA_JEDAIS.FINS__PUBLIC.MSCI_ESG_SCORES_FIXTURE c
JOIN DATA_JEDAIS.FINS__PUBLIC.MSCI_ESG_SCORES_FIXTURE p
  ON p.ACCOUNT_ID = c.ACCOUNT_ID AND p.PROFILE_MONTH = DATEADD(month, -1, c.PROFILE_MONTH);

SELECT
    (SELECT COUNT(*) FROM MSCI_FIXTURE_PAIRS) = 3 * 13
    AS chain_pairs_39;
-- Expected: TRUE

-- At most 2 notches per month.
SELECT
    (SELECT COUNT(*) FROM MSCI_FIXTURE_PAIRS WHERE ABS(cur_level - prev_level) > 2) = 0
    AS chain_moves_at_most_two_notches;
-- Expected: TRUE

-- The direction flag equals the actual rating move.
SELECT
    (SELECT COUNT(*) FROM MSCI_FIXTURE_PAIRS
       WHERE cur_dir <> CASE WHEN cur_level > prev_level THEN 'Upgrade'
                             WHEN cur_level < prev_level THEN 'Downgrade'
                             ELSE 'Unchanged' END) = 0
    AS chain_flag_equals_actual_move;
-- Expected: TRUE

-- The overall score follows the rating: up on an upgrade, down on a downgrade.
SELECT
    (SELECT COUNT(*) FROM MSCI_FIXTURE_PAIRS
       WHERE (cur_level > prev_level AND cur_overall <= prev_overall)
          OR (cur_level < prev_level AND cur_overall >= prev_overall)) = 0
    AS chain_score_follows_rating;
-- Expected: TRUE

-- Carbon intensity drifts at most 8% a month (1.08 on a downgrade, 0.92 on an
-- upgrade); allow +/-0.01 for 2-decimal rounding.
SELECT
    (SELECT COUNT(*) FROM MSCI_FIXTURE_PAIRS
       WHERE cur_carbon NOT BETWEEN prev_carbon * 0.92 - 0.01 AND prev_carbon * 1.08 + 0.01) = 0
    AS chain_carbon_within_8_pct;
-- Expected: TRUE

-- Materiality tags are inherited from the prior month.
SELECT
    (SELECT COUNT(*) FROM MSCI_FIXTURE_PAIRS WHERE cur_tags <> prev_tags) = 0
    AS chain_materiality_tags_carry_over;
-- Expected: TRUE

-- Every month of history still satisfies the controversy invariant.
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MSCI_ESG_SCORES_FIXTURE
       WHERE (CONTROVERSY_FLAG_COUNT = 0 AND TOP_CONTROVERSY_CATEGORY IS NOT NULL)
          OR (CONTROVERSY_FLAG_COUNT > 0 AND TOP_CONTROVERSY_CATEGORY IS NULL)
          OR (INDUSTRY_CLASSIFICATION = 'Laggard' AND CONTROVERSY_FLAG_COUNT < 1)
          OR CONTROVERSY_FLAG_COUNT > 15) = 0
    AS history_controversy_invariants;
-- Expected: TRUE

-- Idempotency holds on the evolved chain too: re-running the current month
-- (same priors) is byte-identical.
SET hash_chain = (SELECT HASH_AGG(ORG_ID, ACCOUNT_ID, PROFILE_MONTH, MSCI_ESG_RATING, INDUSTRY_CLASSIFICATION,
                                  ESG_SCORE_OVERALL, ENVIRONMENTAL_SCORE, SOCIAL_SCORE, GOVERNANCE_SCORE,
                                  CARBON_INTENSITY_TONS_PER_M_REVENUE, CONTROVERSY_FLAG_COUNT,
                                  COALESCE(TOP_CONTROVERSY_CATEGORY, '__NULL__'),
                                  MATERIALITY_TAGS, LAST_RATING_CHANGE_DIRECTION, GENERATED_AT)::VARCHAR
                    FROM DATA_JEDAIS.FINS__PUBLIC.MSCI_ESG_SCORES_FIXTURE);
CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_MSCI_ESG_SCORES_FIXTURE();
SELECT
    (SELECT HASH_AGG(ORG_ID, ACCOUNT_ID, PROFILE_MONTH, MSCI_ESG_RATING, INDUSTRY_CLASSIFICATION,
                     ESG_SCORE_OVERALL, ENVIRONMENTAL_SCORE, SOCIAL_SCORE, GOVERNANCE_SCORE,
                     CARBON_INTENSITY_TONS_PER_M_REVENUE, CONTROVERSY_FLAG_COUNT,
                     COALESCE(TOP_CONTROVERSY_CATEGORY, '__NULL__'),
                     MATERIALITY_TAGS, LAST_RATING_CHANGE_DIRECTION, GENERATED_AT)::VARCHAR
       FROM DATA_JEDAIS.FINS__PUBLIC.MSCI_ESG_SCORES_FIXTURE) = $hash_chain
    AS chain_rerun_hash_unchanged;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 14. Past-month population: with one account's m-1 row removed, re-CALLing
--     m-1 refreshes only the 12 accounts that already have a row for it, so
--     the removed account stays absent (a past month keeps its population).
-- ---------------------------------------------------------------------------
DELETE FROM DATA_JEDAIS.FINS__PUBLIC.MSCI_ESG_SCORES_FIXTURE
 WHERE ACCOUNT_ID = 'MSC-FIX-B-05' AND PROFILE_MONTH = $m1;
CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_MSCI_ESG_SCORES_FIXTURE(TO_VARCHAR($m1));

SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.MSCI_ESG_SCORES_FIXTURE WHERE PROFILE_MONTH = $m1) = 12
    AND NOT EXISTS (SELECT 1 FROM DATA_JEDAIS.FINS__PUBLIC.MSCI_ESG_SCORES_FIXTURE
                     WHERE ACCOUNT_ID = 'MSC-FIX-B-05' AND PROFILE_MONTH = $m1)
    AS past_month_keeps_population;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 15. Cleanup.
-- ---------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_MSCI_ESG_SCORES_FIXTURE(VARCHAR);
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.MSCI_ESG_SCORES_FIXTURE_STAGING;
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.MSCI_ESG_SCORES_FIXTURE;
DROP VIEW      IF EXISTS DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS_MSCI_FIXTURE;
DROP TABLE     IF EXISTS MSCI_FIXTURE_PAIRS;
DELETE FROM DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG WHERE TASK_NAME = 'TASK_MONTHLY_MSCI_ESG_SCORES_FIXTURE';
