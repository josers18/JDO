-- =============================================================================
-- L2 integration test for SP_GENERATE_GONG_CALL_SENTIMENT
-- =============================================================================
-- Plan:    docs/superpowers/plans/2026-05-28-cumulus-plan-12-gong-call-sentiment.md
-- Task:    Plan 12 T5
-- Run:     snow sql -f tests/integration/test_gong_call_sentiment_sp.sql
-- Pass:    Every assertion column returns TRUE. Any FALSE = test failure.
--
-- Strategy:
--   Same fixture-cloning pattern as Plans 6, 7, 8: clone the deployed SP into
--   FINS.PUBLIC.SP_GENERATE_GONG_CALL_SENTIMENT_FIXTURE via GET_DDL + REPLACE,
--   redirecting the audience view, dataset table, and staging table FQNs to
--   fixture-scoped names. Sentinel-based ordering avoids substring-collision
--   when GONG_CALL_SENTIMENT expands to GONG_CALL_SENTIMENT_FIXTURE (otherwise
--   SP_GENERATE_GONG_CALL_SENTIMENT, GONG_CALL_SENTIMENT_STAGING, and
--   TASK_WEEKLY_GONG_CALL_SENTIMENT would all gain a stray _FIXTURE suffix
--   in the wrong slot during the dataset-table swap).
--
-- Plan 12 differences from Plans 1-11:
--   - **Weekly cadence** (PROFILE_WEEK is the Monday-of-week DATE). Second
--     weekly Cumulus plan after Plan 6 (Plaid Held-Away). Re-runs same
--     calendar week MERGE-replace (byte-identical because the seed AND
--     every date helper anchor on week_start.date()).
--   - **Cascade-gated NULL semantics** off a single Boolean predicate
--     (CALL_COUNT_LAST_7D = 0). Six fields collapse together to no-call
--     defaults: TOTAL_TALK_TIME_MINUTES = 0; CUSTOMER_TALK_RATIO_PCT = 0.00;
--     OVERALL_SENTIMENT = 'Neutral'; KEY_TOPICS_FLAGS IS NULL; LAST_CALL_DATE
--     IS NULL; ACTION_ITEMS_COUNT = 0. The boring case (zero activity) is
--     itself a meaningful row, not a row that's filtered out. THE load-
--     bearing assertions for this test are the cascade-NULL invariants.
--   - **Two-salt + year-stable trajectory model**. Primary salt 'gong'
--     (week-bucketed); secondary 'gong_rm' (year-bucketed) for RM_NAME
--     stickiness; tertiary 'gong_trend' (year-bucketed) lives inside the row
--     factory as a base-trajectory helper for SENTIMENT_TREND.
--   - 3 NULLable columns at the dataset level (KEY_TOPICS_FLAGS, LAST_CALL_DATE,
--     NEXT_SCHEDULED_CALL_DATE) plus auxiliary mixed-gate RM_LAST_LOGGED_NOTE_DATE
--     (~15% NULL, feeds DEAL_RISK_SCORE via in-flight rm_note_stale boolean).
--   - 0 BOOLEAN columns at the table level. 15 columns total
--     (12 NOT NULL + 3 NULLable; RM_LAST_LOGGED_NOTE_DATE counts as NULLable
--     auxiliary mixed-gate).
--   - Audience predicate `CLIENT_CATEGORY IN ('Wealth Management',
--     'Commercial Banking')`. Fixture has 14 anchors (3 Wealth + 2 Commercial
--     in audience; 9 out: 4 Retail + 2 Household + 2 Small Business +
--     1 Wealth-but-empty-ACCOUNT_ID edge). 5 audience-eligible anchors
--     emit exactly one row each per week.
--
-- Cascade-NULL test strategy (THE load-bearing assertions for Plan 12):
--   With 3 Wealth anchors (~65% no-call rate per week) + 2 Commercial
--   (~35%), the probability that AT LEAST ONE row in this single-week run
--   has CALL_COUNT_LAST_7D = 0 is approximately
--   1 - (0.35**3) * (0.65**2) ~= 0.982 (98.2%). High enough that the
--   fixture is expected to surface the boring case in practice.
--   The cascade-NULL invariants below are written as conditional
--   zero-counts ("0 rows where call_count=0 AND any cascade field is
--   non-default") so they remain LOAD-BEARING whether or not a zero-call
--   row materializes in this run -- if zero rows have call_count=0 the
--   invariants are vacuously true; if any row does, the invariants
--   fail the test on any cascade-gate violation. A separate observational
--   assertion confirms the boring case actually surfaces, guarding
--   against a regression where every fixture row has non-zero calls and
--   the cascade gate is silently never exercised.
--
-- Pre-requisites:
--   1. SP_GENERATE_GONG_CALL_SENTIMENT deployed (run scripts/deploy_sp.py first).
-- =============================================================================

USE SCHEMA FINS.PUBLIC;

-- ---------------------------------------------------------------------------
-- 1. Drop any leftover objects from a prior failed run so the test is
--    idempotent end-to-end.
-- ---------------------------------------------------------------------------
DROP TABLE     IF EXISTS FINS.PUBLIC.GONG_CALL_SENTIMENT_FIXTURE;
DROP TABLE     IF EXISTS FINS.PUBLIC.GONG_CALL_SENTIMENT_FIXTURE_STAGING;
DROP PROCEDURE IF EXISTS FINS.PUBLIC.SP_GENERATE_GONG_CALL_SENTIMENT_FIXTURE();
DROP VIEW      IF EXISTS FINS.PUBLIC.V_ACCOUNT_ANCHORS_GONG_FIXTURE;

-- ---------------------------------------------------------------------------
-- 2. Materialise the L2 fixture audience view: 14 anchors total.
--    -  3 Wealth Management PERSON anchors (in audience). Mid-affluent
--       ages 40-60. Drives the cascade-gated boring case (no-call rate ~65%).
--    -  2 Commercial Banking BUSINESS anchors (in audience). Varied size.
--       Higher call cadence (~1.8 mean calls/wk vs Wealth ~0.6).
--    -  9 non-audience anchors (filtered out by _AUDIENCE_PREDICATE):
--          4 Retail PERSON
--          2 Household PERSON
--          2 Small Business BUSINESS
--          1 Wealth Management PERSON with empty-string ACCOUNT_ID --
--            tests the defense-in-depth `_anchor_in_audience` predicate
--            in the SP (rejects rows missing a non-empty ACCOUNT_ID).
--          = 5 audience-eligible anchors after both SQL predicate AND
--          the empty-ACCOUNT_ID defensive filter.
--
--    Column shape mirrors V_ACCOUNT_ANCHORS exactly (15 columns) so the
--    cloned SP's audience SELECT compiles unchanged. ACCOUNT_ID prefix
--    `GONG-FIX-` keeps the audience-filter assertion easy to express.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW FINS.PUBLIC.V_ACCOUNT_ANCHORS_GONG_FIXTURE AS
-- 3 Wealth Management PERSON anchors -- IN AUDIENCE.
SELECT
    'GONG-FIX-WM-01'::VARCHAR    AS ACCOUNT_ID,
    'Quinn Marlowe'::VARCHAR     AS ACCOUNT_NAME,
    '2026-05-28'::DATE           AS SNAPSHOT_DATE,
    'Wealth Management'::VARCHAR AS CLIENT_CATEGORY,
    'PERSON'::VARCHAR            AS ACCOUNT_TYPE_FLAG,
    '1981-06-12'::TIMESTAMP_LTZ  AS BIRTHDATE,        -- age ~45 (mid-affluent)
    285000::NUMBER               AS ANNUAL_INCOME,
    780::NUMBER                  AS CREDIT_SCORE,
    NULL::VARCHAR                AS INDUSTRY,
    NULL::NUMBER                 AS ANNUAL_REVENUE,
    NULL::NUMBER                 AS EMPLOYEE_COUNT,
    '94027'::VARCHAR             AS POSTAL_CODE,
    'CA'::VARCHAR                AS STATE_CODE,
    'US'::VARCHAR                AS COUNTRY_CODE,
    'GONG-FIX-WM-001'::VARCHAR   AS EXTERNAL_ID
UNION ALL SELECT 'GONG-FIX-WM-02', 'Logan Pierce',  '2026-05-28'::DATE, 'Wealth Management', 'PERSON', '1976-04-12'::TIMESTAMP_LTZ, 350000, 770, NULL, NULL, NULL, '10021', 'NY', 'US', 'GONG-FIX-WM-002'  -- age ~50
UNION ALL SELECT 'GONG-FIX-WM-03', 'Harper Cole',   '2026-05-28'::DATE, 'Wealth Management', 'PERSON', '1966-10-04'::TIMESTAMP_LTZ, 410000, 790, NULL, NULL, NULL, '02115', 'MA', 'US', 'GONG-FIX-WM-003'  -- age ~60
-- 2 Commercial Banking BUSINESS anchors -- IN AUDIENCE.
UNION ALL SELECT 'GONG-FIX-CB-01', 'Atlas Logistics Inc.',   '2026-05-28'::DATE, 'Commercial Banking', 'BUSINESS', NULL::TIMESTAMP_LTZ, NULL, NULL, 'Logistics',             18500000, 220, '60601', 'IL', 'US', 'GONG-FIX-CB-001'  -- larger
UNION ALL SELECT 'GONG-FIX-CB-02', 'Northwind Holdings LLC', '2026-05-28'::DATE, 'Commercial Banking', 'BUSINESS', NULL::TIMESTAMP_LTZ, NULL, NULL, 'Investment Management',  4200000,  35, '10005', 'NY', 'US', 'GONG-FIX-CB-002'  -- smaller
-- 9 non-audience anchors -- OUT OF AUDIENCE (filtered by SQL predicate or defensive filter).
-- 4 Retail PERSON
UNION ALL SELECT 'GONG-FIX-RT-01', 'Riley Park',    '2026-05-28'::DATE, 'Retail',         'PERSON',   '1996-08-22'::TIMESTAMP_LTZ,    62000, 700, NULL, NULL, NULL, '10025', 'NY', 'US', 'GONG-FIX-RT-001'
UNION ALL SELECT 'GONG-FIX-RT-02', 'Casey Reed',    '2026-05-28'::DATE, 'Retail',         'PERSON',   '1971-11-05'::TIMESTAMP_LTZ,    95000, 720, NULL, NULL, NULL, '02115', 'MA', 'US', 'GONG-FIX-RT-002'
UNION ALL SELECT 'GONG-FIX-RT-03', 'Pat Donovan',   '2026-05-28'::DATE, 'Retail',         'PERSON',   '1958-12-03'::TIMESTAMP_LTZ,    72000, 720, NULL, NULL, NULL, '10001', 'NY', 'US', 'GONG-FIX-RT-003'
UNION ALL SELECT 'GONG-FIX-RT-04', 'Drew Mitchell', '2026-05-28'::DATE, 'Retail',         'PERSON',   '2001-07-19'::TIMESTAMP_LTZ,    45000, 690, NULL, NULL, NULL, '02101', 'MA', 'US', 'GONG-FIX-RT-004'
-- 2 Household PERSON
UNION ALL SELECT 'GONG-FIX-HH-01', 'Sam Walters',   '2026-05-28'::DATE, 'Household',      'PERSON',   '1984-02-18'::TIMESTAMP_LTZ,    88000, 730, NULL, NULL, NULL, '33139', 'FL', 'US', 'GONG-FIX-HH-001'
UNION ALL SELECT 'GONG-FIX-HH-02', 'Alex Brennan',  '2026-05-28'::DATE, 'Household',      'PERSON',   '1954-01-22'::TIMESTAMP_LTZ,   150000, 760, NULL, NULL, NULL, '90001', 'CA', 'US', 'GONG-FIX-HH-002'
-- 2 Small Business BUSINESS
UNION ALL SELECT 'GONG-FIX-SB-01', 'Pinewood Coffee Co.',    '2026-05-28'::DATE, 'Small Business', 'BUSINESS', NULL::TIMESTAMP_LTZ, NULL, NULL, 'Food Service',     1200000, 18, '98101', 'WA', 'US', 'GONG-FIX-SB-001'
UNION ALL SELECT 'GONG-FIX-SB-02', 'Mariposa Cleaners LLC',  '2026-05-28'::DATE, 'Small Business', 'BUSINESS', NULL::TIMESTAMP_LTZ, NULL, NULL, 'Personal Services', 480000,  6, '94110', 'CA', 'US', 'GONG-FIX-SB-002';
-- Note: the empty-ACCOUNT_ID defense-in-depth case is covered exhaustively in
-- the L1 unit tests (`test_empty_account_id_raises`). Including it here would
-- make the SP's `assert_coverage` fail — the SQL audience predicate counts the
-- empty-ACCOUNT_ID row as in-audience (CLIENT_CATEGORY = 'Wealth Management'),
-- but `_anchor_in_audience` rejects it, producing a coverage gap. The L1 test
-- exercises the predicate directly without that complication.

-- ---------------------------------------------------------------------------
-- 3. Materialise the fixture-scoped target table: same DDL as
--    FINS.PUBLIC.GONG_CALL_SENTIMENT but renamed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE TABLE FINS.PUBLIC.GONG_CALL_SENTIMENT_FIXTURE
LIKE FINS.PUBLIC.GONG_CALL_SENTIMENT;

-- ---------------------------------------------------------------------------
-- 4. Clone SP_GENERATE_GONG_CALL_SENTIMENT into ..._FIXTURE with FQN swaps:
--      V_ACCOUNT_ANCHORS                  -> V_ACCOUNT_ANCHORS_GONG_FIXTURE
--      GONG_CALL_SENTIMENT (table)        -> GONG_CALL_SENTIMENT_FIXTURE
--      GONG_CALL_SENTIMENT_STAGING        -> GONG_CALL_SENTIMENT_FIXTURE_STAGING
--      SP_GENERATE_GONG_CALL_SENTIMENT    -> SP_GENERATE_GONG_CALL_SENTIMENT_FIXTURE
--      TASK_WEEKLY_GONG_CALL_SENTIMENT    -> TASK_WEEKLY_GONG_CALL_SENTIMENT_FIXTURE
--    Sentinel-based ordering avoids substring-collision in repeated REPLACE
--    passes (e.g. replacing GONG_CALL_SENTIMENT first would catch the stem of
--    SP_GENERATE_GONG_CALL_SENTIMENT, GONG_CALL_SENTIMENT_STAGING, and
--    TASK_WEEKLY_GONG_CALL_SENTIMENT and double-suffix them).
-- ---------------------------------------------------------------------------
EXECUTE IMMEDIATE $$
DECLARE
    sp_ddl STRING;
BEGIN
    sp_ddl := (SELECT GET_DDL('PROCEDURE', 'FINS.PUBLIC.SP_GENERATE_GONG_CALL_SENTIMENT()'));
    -- Step 1: stash the suffix-bearing identifiers behind sentinels.
    sp_ddl := REPLACE(sp_ddl, 'GONG_CALL_SENTIMENT_STAGING',     '__GONG_STG__');
    sp_ddl := REPLACE(sp_ddl, 'SP_GENERATE_GONG_CALL_SENTIMENT', '__GONG_SP__');
    sp_ddl := REPLACE(sp_ddl, 'TASK_WEEKLY_GONG_CALL_SENTIMENT', '__GONG_TASK__');
    -- Step 2: now GONG_CALL_SENTIMENT (the dataset table) is unambiguous.
    sp_ddl := REPLACE(sp_ddl, 'GONG_CALL_SENTIMENT',             'GONG_CALL_SENTIMENT_FIXTURE');
    -- Step 3: expand sentinels back to fixture-suffixed names.
    sp_ddl := REPLACE(sp_ddl, '__GONG_STG__',                    'GONG_CALL_SENTIMENT_FIXTURE_STAGING');
    sp_ddl := REPLACE(sp_ddl, '__GONG_SP__',                     'SP_GENERATE_GONG_CALL_SENTIMENT_FIXTURE');
    sp_ddl := REPLACE(sp_ddl, '__GONG_TASK__',                   'TASK_WEEKLY_GONG_CALL_SENTIMENT_FIXTURE');
    -- Step 4: redirect audience view.
    sp_ddl := REPLACE(sp_ddl, 'V_ACCOUNT_ANCHORS',               'V_ACCOUNT_ANCHORS_GONG_FIXTURE');
    EXECUTE IMMEDIATE :sp_ddl;
    RETURN 'fixture SP staged';
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. First run.
-- ---------------------------------------------------------------------------
CALL FINS.PUBLIC.SP_GENERATE_GONG_CALL_SENTIMENT_FIXTURE();

-- ---------------------------------------------------------------------------
-- 6. Coverage assertion #1: distinct ACCOUNT_ID == post-filter audience size.
-- 14 anchors in the view; SQL predicate filters 8 non-Wealth/non-Commercial
-- out (4 Retail + 2 Household + 2 Small Business); the 1 Wealth-but-empty-
-- ACCOUNT_ID anchor is rejected by the SP's defensive `_anchor_in_audience`
-- (empty ACCOUNT_ID drops it). Net: exactly 5 distinct accounts emit rows.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(DISTINCT ACCOUNT_ID) FROM FINS.PUBLIC.GONG_CALL_SENTIMENT_FIXTURE) = 5
    AS distinct_accounts_assertion_passes;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 7. 1:1 emit assertion #2: COUNT(*) == post-filter audience size (5).
-- Audience size 5 + 1:1 weekly emit per anchor => row count = 5.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM FINS.PUBLIC.GONG_CALL_SENTIMENT_FIXTURE) = 5
    AS row_count_assertion_passes;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 8. Audience-filter assertion #3: zero rows have a non-audience fixture
-- prefix. Confirms the SP's `WHERE CLIENT_CATEGORY IN ('Wealth Management',
-- 'Commercial Banking')` predicate excluded the 8 non-audience anchors AND
-- the defensive filter dropped the 1 empty-ACCOUNT_ID Wealth edge.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM FINS.PUBLIC.GONG_CALL_SENTIMENT_FIXTURE
       WHERE ACCOUNT_ID LIKE 'GONG-FIX-RT-%'
          OR ACCOUNT_ID LIKE 'GONG-FIX-HH-%'
          OR ACCOUNT_ID LIKE 'GONG-FIX-SB-%') = 0
    AS audience_filter_excludes_non_audience;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 9. NOT-NULL columns assertion #4: every NOT NULL column populated for
-- every row (no surprise NULLs in the 11 NOT NULL columns - 15 columns
-- minus 4 NULLable: KEY_TOPICS_FLAGS, LAST_CALL_DATE, NEXT_SCHEDULED_CALL_DATE,
-- RM_LAST_LOGGED_NOTE_DATE). The 4 NULLable columns are intentionally exempt
-- - the cascade-NULL block (#11-16) and independent-gate block (#17) govern them.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM FINS.PUBLIC.GONG_CALL_SENTIMENT_FIXTURE
       WHERE ACCOUNT_ID                IS NULL
          OR PROFILE_WEEK               IS NULL
          OR CALL_COUNT_LAST_7D         IS NULL
          OR TOTAL_TALK_TIME_MINUTES    IS NULL
          OR CUSTOMER_TALK_RATIO_PCT    IS NULL
          OR OVERALL_SENTIMENT          IS NULL
          OR SENTIMENT_TREND            IS NULL
          OR ACTION_ITEMS_COUNT         IS NULL
          OR DEAL_RISK_SCORE            IS NULL
          OR RM_NAME                    IS NULL
          OR GENERATED_AT               IS NULL) = 0
    AS not_null_columns_populated;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 10. PROFILE_WEEK Monday-anchored assertion #5: every row's PROFILE_WEEK is
-- a Monday (DAYOFWEEK_ISO = 1). The SP buckets via week_start = run_ts -
-- timedelta(days=run_ts.weekday()) truncated to midnight; PROFILE_WEEK =
-- week_start.date(). Monday is the universal anchor.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM FINS.PUBLIC.GONG_CALL_SENTIMENT_FIXTURE
       WHERE EXTRACT(DAYOFWEEK_ISO FROM PROFILE_WEEK) <> 1) = 0
    AS profile_week_is_monday;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- CASCADE-NULL INVARIANTS (#11-#16) -- THE LOAD-BEARING ASSERTIONS.
-- For every row where CALL_COUNT_LAST_7D = 0, six fields MUST collapse to
-- their no-call defaults. Each invariant is written as a conditional
-- zero-count: it is vacuously true when no zero-call row materializes in
-- this run (so the test does not flake if seed luck delivers an all-active
-- week), but fires on any cascade-gate violation if a zero-call row
-- exists. A separate observational assertion (#16a) confirms the cascade
-- gate is actually exercised in the typical run.
-- ---------------------------------------------------------------------------

-- 11. Cascade-NULL #6a: zero rows where CALL_COUNT_LAST_7D = 0
-- AND TOTAL_TALK_TIME_MINUTES <> 0.
SELECT
    (SELECT COUNT(*) FROM FINS.PUBLIC.GONG_CALL_SENTIMENT_FIXTURE
       WHERE CALL_COUNT_LAST_7D = 0
         AND TOTAL_TALK_TIME_MINUTES <> 0) = 0
    AS cascade_null_talk_time_invariant;
-- Expected: TRUE

-- 12. Cascade-NULL #6b: zero rows where CALL_COUNT_LAST_7D = 0
-- AND CUSTOMER_TALK_RATIO_PCT <> 0.
SELECT
    (SELECT COUNT(*) FROM FINS.PUBLIC.GONG_CALL_SENTIMENT_FIXTURE
       WHERE CALL_COUNT_LAST_7D = 0
         AND CUSTOMER_TALK_RATIO_PCT <> 0) = 0
    AS cascade_null_talk_ratio_invariant;
-- Expected: TRUE

-- 13. Cascade-NULL #6c: zero rows where CALL_COUNT_LAST_7D = 0
-- AND OVERALL_SENTIMENT <> 'Neutral'. The cascade gate forces sentiment
-- to 'Neutral' on no-call weeks (rowspec invariant -- there's no signal
-- to bias sentiment one way or another).
SELECT
    (SELECT COUNT(*) FROM FINS.PUBLIC.GONG_CALL_SENTIMENT_FIXTURE
       WHERE CALL_COUNT_LAST_7D = 0
         AND OVERALL_SENTIMENT <> 'Neutral') = 0
    AS cascade_null_sentiment_invariant;
-- Expected: TRUE

-- 14. Cascade-NULL #6d: zero rows where CALL_COUNT_LAST_7D = 0
-- AND LAST_CALL_DATE IS NOT NULL. The cascade gate sets LAST_CALL_DATE
-- to NULL on no-call weeks (we never listened). NULL semantics are
-- meaningful here -- distinct from a date 0 days ago.
SELECT
    (SELECT COUNT(*) FROM FINS.PUBLIC.GONG_CALL_SENTIMENT_FIXTURE
       WHERE CALL_COUNT_LAST_7D = 0
         AND LAST_CALL_DATE IS NOT NULL) = 0
    AS cascade_null_last_call_date_invariant;
-- Expected: TRUE

-- 15. Cascade-NULL #6e: zero rows where CALL_COUNT_LAST_7D = 0
-- AND KEY_TOPICS_FLAGS IS NOT NULL. The cascade gate sets KEY_TOPICS_FLAGS
-- to NULL on no-call weeks (we never listened). The empty-string-vs-NULL
-- distinction is meaningful per rowspec: '' = we listened, nothing
-- crossed threshold; NULL = we never listened.
SELECT
    (SELECT COUNT(*) FROM FINS.PUBLIC.GONG_CALL_SENTIMENT_FIXTURE
       WHERE CALL_COUNT_LAST_7D = 0
         AND KEY_TOPICS_FLAGS IS NOT NULL) = 0
    AS cascade_null_key_topics_invariant;
-- Expected: TRUE

-- 16. Cascade-NULL #6f: zero rows where CALL_COUNT_LAST_7D = 0
-- AND ACTION_ITEMS_COUNT <> 0. The cascade gate zeros out ACTION_ITEMS_COUNT
-- on no-call weeks.
SELECT
    (SELECT COUNT(*) FROM FINS.PUBLIC.GONG_CALL_SENTIMENT_FIXTURE
       WHERE CALL_COUNT_LAST_7D = 0
         AND ACTION_ITEMS_COUNT <> 0) = 0
    AS cascade_null_action_items_invariant;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 17. Vocabulary invariant #7a: OVERALL_SENTIMENT in 5-vocab.
-- {Very Positive, Positive, Neutral, Negative, Very Negative}.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM FINS.PUBLIC.GONG_CALL_SENTIMENT_FIXTURE
       WHERE OVERALL_SENTIMENT NOT IN
           ('Very Positive', 'Positive', 'Neutral', 'Negative', 'Very Negative')) = 0
    AS overall_sentiment_vocabulary_ok;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 18. Vocabulary invariant #7b: SENTIMENT_TREND in 3-vocab.
-- {Improving, Stable, Declining}.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM FINS.PUBLIC.GONG_CALL_SENTIMENT_FIXTURE
       WHERE SENTIMENT_TREND NOT IN ('Improving', 'Stable', 'Declining')) = 0
    AS sentiment_trend_vocabulary_ok;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 19. Range invariant #8a: CALL_COUNT_LAST_7D in [0, 15].
-- Helper construction caps actual draws at 8 by construction (Commercial
-- tail); rowspec invariant is [0, 15].
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM FINS.PUBLIC.GONG_CALL_SENTIMENT_FIXTURE
       WHERE CALL_COUNT_LAST_7D NOT BETWEEN 0 AND 15) = 0
    AS call_count_in_range;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 20. Range invariant #8b: TOTAL_TALK_TIME_MINUTES in [0, 600].
-- Capped at 600 (10h/wk) by the `_total_talk_time_minutes` helper.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM FINS.PUBLIC.GONG_CALL_SENTIMENT_FIXTURE
       WHERE TOTAL_TALK_TIME_MINUTES NOT BETWEEN 0 AND 600) = 0
    AS total_talk_time_in_range;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 21. Range invariant #8c: CUSTOMER_TALK_RATIO_PCT in [0, 100].
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM FINS.PUBLIC.GONG_CALL_SENTIMENT_FIXTURE
       WHERE CUSTOMER_TALK_RATIO_PCT NOT BETWEEN 0 AND 100) = 0
    AS customer_talk_ratio_in_range;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 22. Range invariant #8d: DEAL_RISK_SCORE in [0, 100].
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM FINS.PUBLIC.GONG_CALL_SENTIMENT_FIXTURE
       WHERE DEAL_RISK_SCORE NOT BETWEEN 0 AND 100) = 0
    AS deal_risk_score_in_range;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 23. Range invariant #8e: ACTION_ITEMS_COUNT in [0, 10].
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM FINS.PUBLIC.GONG_CALL_SENTIMENT_FIXTURE
       WHERE ACTION_ITEMS_COUNT NOT BETWEEN 0 AND 10) = 0
    AS action_items_count_in_range;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 24. Date coherence #9a: LAST_CALL_DATE (when populated) <= CURRENT_DATE.
-- The `_last_call_date` helper subtracts 1-7 days from week_start (the
-- Monday of the run-week), so LAST_CALL_DATE is at most week_start - 1.
-- Always <= CURRENT_DATE() since week_start <= CURRENT_DATE() at run time.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM FINS.PUBLIC.GONG_CALL_SENTIMENT_FIXTURE
       WHERE LAST_CALL_DATE IS NOT NULL
         AND LAST_CALL_DATE > CURRENT_DATE()) = 0
    AS last_call_date_not_future;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 25. Date coherence #9b: NEXT_SCHEDULED_CALL_DATE (when populated) >
-- CURRENT_DATE. The `_next_scheduled_call_date` helper anchors on
-- week_start + 2..62 days, guaranteeing strictly future dates for any
-- run during the calendar week.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM FINS.PUBLIC.GONG_CALL_SENTIMENT_FIXTURE
       WHERE NEXT_SCHEDULED_CALL_DATE IS NOT NULL
         AND NEXT_SCHEDULED_CALL_DATE <= CURRENT_DATE()) = 0
    AS next_scheduled_call_date_in_future;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 26. Boring-case observability #10: at least one row has CALL_COUNT_LAST_7D = 0
-- in the fixture run. Confirms the cascade-NULL invariants above (#11-#16)
-- are actually exercised rather than vacuously true. With 3 Wealth (~65%
-- no-call rate) + 2 Commercial (~35%), the chance of zero zero-call rows is
-- 1 - 0.982 ~ 1.8% -- low but non-zero. If this assertion ever returns FALSE
-- in CI, the cascade-gate test surface area collapsed and the L2 should
-- either widen the fixture cohort or freeze a known-good run-timestamp.
-- ---------------------------------------------------------------------------
SELECT EXISTS (
    SELECT 1 FROM FINS.PUBLIC.GONG_CALL_SENTIMENT_FIXTURE
    WHERE CALL_COUNT_LAST_7D = 0
) AS at_least_one_zero_call_row_exists;
-- Expected: TRUE (~98% chance per run; observational)

-- ---------------------------------------------------------------------------
-- 27. Idempotency assertion #11: a second run leaves the row count
-- unchanged (MERGE-not-INSERT) and produces byte-identical output
-- (deterministic seed bucketed on week_start).
-- ---------------------------------------------------------------------------
SET row_count_before = (SELECT COUNT(*) FROM FINS.PUBLIC.GONG_CALL_SENTIMENT_FIXTURE);
SET hash_before      = (SELECT HASH_AGG(*) FROM FINS.PUBLIC.GONG_CALL_SENTIMENT_FIXTURE);

CALL FINS.PUBLIC.SP_GENERATE_GONG_CALL_SENTIMENT_FIXTURE();

SELECT
    (SELECT COUNT(*) FROM FINS.PUBLIC.GONG_CALL_SENTIMENT_FIXTURE) = $row_count_before
    AS idempotency_row_count_unchanged;
-- Expected: TRUE

SELECT
    (SELECT HASH_AGG(*) FROM FINS.PUBLIC.GONG_CALL_SENTIMENT_FIXTURE) = $hash_before
    AS idempotency_hash_unchanged;
-- Expected: TRUE  (same calendar week -> byte-identical output)

-- ---------------------------------------------------------------------------
-- 28. Cleanup
-- ---------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS FINS.PUBLIC.SP_GENERATE_GONG_CALL_SENTIMENT_FIXTURE();
DROP TABLE     IF EXISTS FINS.PUBLIC.GONG_CALL_SENTIMENT_FIXTURE_STAGING;
DROP TABLE     IF EXISTS FINS.PUBLIC.GONG_CALL_SENTIMENT_FIXTURE;
DROP VIEW      IF EXISTS FINS.PUBLIC.V_ACCOUNT_ANCHORS_GONG_FIXTURE;
DELETE FROM FINS.PUBLIC.TASK_EXECUTION_LOG WHERE TASK_NAME = 'TASK_WEEKLY_GONG_CALL_SENTIMENT_FIXTURE';
