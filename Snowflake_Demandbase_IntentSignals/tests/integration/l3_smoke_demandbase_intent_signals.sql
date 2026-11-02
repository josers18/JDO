-- =============================================================================
-- L3 smoke for DEMANDBASE_INTENT_SIGNALS (Plan 14 Task 8)
-- =============================================================================
-- Plan:  docs/superpowers/plans/2026-11-02-cumulus-plan-14-demandbase-intent-signals.md
-- Run:   after the one-time backfill
--          CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_DEMANDBASE_INTENT_SIGNALS(25);
--        then
--          snow sql -f tests/integration/l3_smoke_demandbase_intent_signals.sql
-- Pass:  every column named l3_* returns TRUE; *_detail columns are the
--        measured numbers to paste into AGENTS.md and plan section 7.
-- Target: the two SET lines below. To dry-run against the L2 Pass E clone,
--        point them at DEMANDBASE_INTENT_SIGNALS_TIMING and
--        TASK_WEEKLY_DEMANDBASE_INTENT_SIGNALS_TIMING.
-- Read-only: SELECTs only.
-- Not covered here: "the first scheduled TASK run is byte-identical to a
--        re-run of the same week". After the first 03:15 ET Monday run, save
--        HASH_AGG(*) for that PROFILE_WEEK, CALL the SP with no argument, and
--        compare.
-- No ampersand anywhere in this file (snow sql template-render trap).
-- =============================================================================

USE SCHEMA DATA_JEDAIS.FINS__PUBLIC;

SET tbl  = 'DATA_JEDAIS.FINS__PUBLIC.DEMANDBASE_INTENT_SIGNALS';
SET task = 'TASK_WEEKLY_DEMANDBASE_INTENT_SIGNALS';

SET aud = (SELECT COUNT(DISTINCT ACCOUNT_ID) FROM DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS
            WHERE ACCOUNT_TYPE_FLAG = 'BUSINESS' AND COALESCE(CLIENT_CATEGORY, '') <> 'Household');

-- 1. Shape: 26 weeks, full coverage, one top row per account-week, volume band.
WITH wk AS (
    SELECT PROFILE_WEEK, COUNT(*) AS n_rows, COUNT(DISTINCT ACCOUNT_ID) AS n_accts,
           COUNT_IF(IS_TOP_TOPIC) AS n_top
    FROM IDENTIFIER($tbl) GROUP BY PROFILE_WEEK
)
SELECT
    COUNT(*) = 26                                    AS l3_01_26_weeks,
    COUNT_IF(n_accts = $aud AND n_top = $aud) = 26   AS l3_02_full_coverage_one_top_every_week,
    $aud                                             AS l3_02_detail_audience,
    COUNT_IF(n_rows BETWEEN 9000 AND 15000) = 26     AS l3_03_rows_per_week_9k_15k,
    MIN(n_rows) || ' .. ' || MAX(n_rows) || ' (avg ' || ROUND(AVG(n_rows)) || ')'
                                                     AS l3_03_detail_rows_per_week,
    SUM(n_rows)                                      AS l3_03_detail_total_rows
FROM wk;

-- 2. Keys and audience scoping.
SELECT
    (SELECT COUNT(*) - COUNT(DISTINCT RECORD_ID) FROM IDENTIFIER($tbl)) = 0
        AS l3_04_no_duplicate_record_id,
    (SELECT COUNT(*) - COUNT(DISTINCT ORG_ID, ACCOUNT_ID, PROFILE_WEEK, INTENT_TOPIC)
       FROM IDENTIFIER($tbl)) = 0
        AS l3_05_no_duplicate_pk,
    (SELECT COUNT(*) FROM IDENTIFIER($tbl) t
       LEFT JOIN DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS a ON a.ACCOUNT_ID = t.ACCOUNT_ID
      WHERE a.ACCOUNT_ID IS NULL OR a.ACCOUNT_TYPE_FLAG <> 'BUSINESS'
         OR COALESCE(a.CLIENT_CATEGORY, '') = 'Household') = 0
        AS l3_06_no_household_or_non_business_rows,
    (SELECT COUNT(*) FROM IDENTIFIER($tbl) WHERE NOT SURGE_FLAG AND WEEKS_SURGING > 0) = 0
        AS l3_07_no_weeks_surging_without_surge;

-- 3. Surge rate: SURGE_FLAG on 8-15 pct of rows; 15-25 pct of accounts surging each week.
WITH wk AS (
    SELECT PROFILE_WEEK,
           COUNT_IF(SURGE_FLAG) / COUNT(*)                                     AS surge_row_rate,
           COUNT(DISTINCT IFF(SURGE_FLAG, ACCOUNT_ID, NULL)) / COUNT(DISTINCT ACCOUNT_ID) AS surge_acct_rate
    FROM IDENTIFIER($tbl) GROUP BY PROFILE_WEEK
)
SELECT
    COUNT_IF(surge_row_rate BETWEEN 0.08 AND 0.15) = COUNT(*)   AS l3_08_surge_rows_8_15_pct_every_week,
    ROUND(MIN(surge_row_rate) * 100, 1) || ' .. ' || ROUND(MAX(surge_row_rate) * 100, 1)
                                                                AS l3_08_detail_pct,
    COUNT_IF(surge_acct_rate BETWEEN 0.15 AND 0.25) = COUNT(*)  AS l3_09_surging_accounts_15_25_pct_every_week,
    ROUND(MIN(surge_acct_rate) * 100, 1) || ' .. ' || ROUND(MAX(surge_acct_rate) * 100, 1)
                                                                AS l3_09_detail_pct
FROM wk;

-- 4. Industry bias.
WITH t AS (
    SELECT t.*, a.INDUSTRY, a.ANNUAL_REVENUE, a.CLIENT_CATEGORY,
           RANK() OVER (PARTITION BY t.ACCOUNT_ID, t.PROFILE_WEEK
                        ORDER BY t.INTENT_SCORE DESC) AS score_rank
    FROM IDENTIFIER($tbl) t
    JOIN DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS a ON a.ACCOUNT_ID = t.ACCOUNT_ID
),
re AS (   -- per account-week: is CRE the top topic or in the top 2 by score?
    SELECT ACCOUNT_ID, PROFILE_WEEK,
           MAX(IFF(INTENT_TOPIC = 'Commercial Real Estate Lending'
                   AND (IS_TOP_TOPIC OR score_rank <= 2), 1, 0)) AS cre_top2
    FROM t WHERE INDUSTRY IN ('Real Estate', 'Real Estate Holdings')
    GROUP BY ACCOUNT_ID, PROFILE_WEEK
)
SELECT
    (SELECT COUNT_IF(INTENT_TOPIC IN ('Merchant Services', 'Payroll Services', 'Equipment Finance',
                                      'Business Credit Cards')) / COUNT(*)
       FROM t WHERE INDUSTRY = 'Restaurant' AND IS_TOP_TOPIC) >= 0.75
        AS l3_10_restaurant_top_topic_ge_75_pct,
    (SELECT ROUND(COUNT_IF(INTENT_TOPIC IN ('Merchant Services', 'Payroll Services', 'Equipment Finance',
                                            'Business Credit Cards')) / COUNT(*) * 100, 1)
       FROM t WHERE INDUSTRY = 'Restaurant' AND IS_TOP_TOPIC)
        AS l3_10_detail_pct,
    (SELECT AVG(cre_top2) FROM re) >= 0.70                       AS l3_11_real_estate_cre_top2_ge_70_pct,
    (SELECT ROUND(AVG(cre_top2) * 100, 1) FROM re)               AS l3_11_detail_pct,
    (SELECT COUNT_IF(INTENT_TOPIC IN ('International Payments and FX', 'AP Automation')) / COUNT(*)
       FROM t WHERE INDUSTRY IN ('Logistics', 'Wholesale Distribution')) >= 0.50
        AS l3_12_logistics_wd_fx_or_ap_ge_50_pct,
    (SELECT ROUND(COUNT_IF(INTENT_TOPIC IN ('International Payments and FX', 'AP Automation'))
                  / COUNT(*) * 100, 1)
       FROM t WHERE INDUSTRY IN ('Logistics', 'Wholesale Distribution'))
        AS l3_12_detail_pct;

-- 5. Revenue tilt: Treasury rows per anchor-week at >= 2x for >= $10M vs < $1M;
--    SBA Lending the inverse (>= 2x for < $1M vs >= $10M).
WITH t AS (
    SELECT t.ACCOUNT_ID, t.PROFILE_WEEK, t.INTENT_TOPIC,
           CASE WHEN a.ANNUAL_REVENUE >= 10000000 THEN 'mid'
                WHEN COALESCE(a.ANNUAL_REVENUE, 0) < 1000000 THEN 'main' END AS band
    FROM IDENTIFIER($tbl) t
    JOIN DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS a ON a.ACCOUNT_ID = t.ACCOUNT_ID
),
r AS (
    SELECT band,
           COUNT_IF(INTENT_TOPIC = 'Treasury Management') / COUNT(DISTINCT ACCOUNT_ID, PROFILE_WEEK) AS tm_rate,
           COUNT_IF(INTENT_TOPIC = 'SBA Lending')         / COUNT(DISTINCT ACCOUNT_ID, PROFILE_WEEK) AS sba_rate
    FROM t WHERE band IS NOT NULL GROUP BY band
)
SELECT
    (SELECT tm_rate FROM r WHERE band = 'mid') >= 2 * (SELECT tm_rate FROM r WHERE band = 'main')
        AS l3_13_treasury_mid_ge_2x_main,
    (SELECT ROUND(tm_rate, 3) FROM r WHERE band = 'mid') || ' vs '
        || (SELECT ROUND(tm_rate, 3) FROM r WHERE band = 'main')   AS l3_13_detail_rows_per_anchor_week,
    (SELECT sba_rate FROM r WHERE band = 'main') >= 2 * (SELECT sba_rate FROM r WHERE band = 'mid')
        AS l3_14_sba_main_ge_2x_mid,
    (SELECT ROUND(sba_rate, 3) FROM r WHERE band = 'main') || ' vs '
        || (SELECT ROUND(sba_rate, 3) FROM r WHERE band = 'mid')   AS l3_14_detail_rows_per_anchor_week;

-- 6. Trajectory: WEEKS_SURGING equals the consecutive surge run in the table,
--    for EVERY surging row whose run (plus the week before it) fits inside the
--    stored window. A week with no row for the topic counts as not surging
--    (non-top topics below 40 are not emitted). JOIN + HAVING form; see the
--    c09 note in the L2 file for why not OR-of-EXISTS.
SET min_wk = (SELECT MIN(PROFILE_WEEK) FROM IDENTIFIER($tbl));
WITH cur AS (
    SELECT ACCOUNT_ID, INTENT_TOPIC, PROFILE_WEEK, WEEKS_SURGING
    FROM IDENTIFIER($tbl)
    WHERE SURGE_FLAG AND DATEADD('week', -WEEKS_SURGING, PROFILE_WEEK) >= $min_wk
),
chk AS (
    SELECT cur.ACCOUNT_ID, cur.INTENT_TOPIC, cur.PROFILE_WEEK, cur.WEEKS_SURGING,
           COUNT_IF(p.SURGE_FLAG AND p.PROFILE_WEEK BETWEEN
                    DATEADD('week', 1 - cur.WEEKS_SURGING, cur.PROFILE_WEEK) AND cur.PROFILE_WEEK) AS run_surging,
           COUNT_IF(p.SURGE_FLAG AND p.PROFILE_WEEK = DATEADD('week', -cur.WEEKS_SURGING, cur.PROFILE_WEEK)) AS before_surging
    FROM cur
    LEFT JOIN IDENTIFIER($tbl) p
      ON p.ACCOUNT_ID = cur.ACCOUNT_ID AND p.INTENT_TOPIC = cur.INTENT_TOPIC
     AND p.PROFILE_WEEK BETWEEN DATEADD('week', -cur.WEEKS_SURGING, cur.PROFILE_WEEK) AND cur.PROFILE_WEEK
    GROUP BY cur.ACCOUNT_ID, cur.INTENT_TOPIC, cur.PROFILE_WEEK, cur.WEEKS_SURGING
)
SELECT
    COUNT_IF(run_surging <> WEEKS_SURGING
             OR (WEEKS_SURGING < 12 AND before_surging > 0)) = 0   AS l3_15_weeks_surging_matches_table,
    COUNT(*)                                                        AS l3_15_detail_rows_checked,
    COUNT_IF(WEEKS_SURGING >= 2)                                    AS l3_15_detail_multi_week_rows_checked
FROM chk;

-- 7. Gong coherence: top rows in Gong-Competitor account-weeks have a
--    competitor >= 55 pct; all other top rows <= 30 pct. Gong is reduced to
--    one flag per account-week first (live Gong has a duplicate account-week).
WITH g AS (
    SELECT ACCOUNT_ID, PROFILE_WEEK,
           MAX(IFF(KEY_TOPICS_FLAGS ILIKE '%Competitor%', 1, 0)) AS competitor
    FROM DATA_JEDAIS.FINS__PUBLIC.GONG_CALL_SENTIMENT
    GROUP BY ACCOUNT_ID, PROFILE_WEEK
),
t AS (
    SELECT COALESCE(g.competitor, 0) AS competitor, t.RESEARCHING_COMPETITOR
    FROM IDENTIFIER($tbl) t
    LEFT JOIN g ON g.ACCOUNT_ID = t.ACCOUNT_ID AND g.PROFILE_WEEK = t.PROFILE_WEEK
    WHERE t.IS_TOP_TOPIC
)
SELECT
    COUNT_IF(competitor = 1 AND RESEARCHING_COMPETITOR IS NOT NULL) / NULLIF(COUNT_IF(competitor = 1), 0) >= 0.55
        AS l3_16_gong_flagged_top_rows_ge_55_pct,
    ROUND(COUNT_IF(competitor = 1 AND RESEARCHING_COMPETITOR IS NOT NULL)
          / NULLIF(COUNT_IF(competitor = 1), 0) * 100, 1) || ' pct of ' || COUNT_IF(competitor = 1)
        AS l3_16_detail,
    COUNT_IF(competitor = 0 AND RESEARCHING_COMPETITOR IS NOT NULL) / NULLIF(COUNT_IF(competitor = 0), 0) <= 0.30
        AS l3_17_unflagged_top_rows_le_30_pct,
    ROUND(COUNT_IF(competitor = 0 AND RESEARCHING_COMPETITOR IS NOT NULL)
          / NULLIF(COUNT_IF(competitor = 0), 0) * 100, 1) || ' pct of ' || COUNT_IF(competitor = 0)
        AS l3_17_detail
FROM t;

-- 8. Run log: the latest successful run of the target task logged
--    gong_rows_joined > 0 for every one of its weeks, with no WARN.
SELECT
    STATUS = 'SUCCEEDED'
    AND ERROR_MESSAGE ILIKE '%gong=present%'
    AND REGEXP_COUNT(ERROR_MESSAGE, 'gong_rows_joined=[1-9]') = REGEXP_COUNT(ERROR_MESSAGE, 'gong_rows_joined=')
    AND REGEXP_COUNT(ERROR_MESSAGE, 'gong_rows_joined=') > 0
    AND ERROR_MESSAGE NOT ILIKE '%WARN%'                  AS l3_18_log_gong_rows_joined_gt_0_every_week,
    REGEXP_COUNT(ERROR_MESSAGE, 'gong_rows_joined=')      AS l3_18_detail_weeks_logged,
    ROWS_INSERTED, ACCOUNTS_PROCESSED, DURATION_MS, EXECUTION_TIME
FROM DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG
WHERE TASK_NAME = $task
ORDER BY EXECUTION_TIME DESC LIMIT 1;

-- 9. Demo pick: the 10 Commercial Banking accounts with the longest current
--    (latest-week) Treasury Management surge.
SELECT t.ACCOUNT_ID, a.ACCOUNT_NAME, a.INDUSTRY, a.ANNUAL_REVENUE,
       t.INTENT_SCORE, t.WEEKS_SURGING, t.JOURNEY_STAGE, t.RESEARCHING_COMPETITOR
FROM IDENTIFIER($tbl) t
JOIN DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS a ON a.ACCOUNT_ID = t.ACCOUNT_ID
WHERE t.PROFILE_WEEK = (SELECT MAX(PROFILE_WEEK) FROM IDENTIFIER($tbl))
  AND t.INTENT_TOPIC = 'Treasury Management' AND t.SURGE_FLAG
  AND a.CLIENT_CATEGORY = 'Commercial Banking'
ORDER BY t.WEEKS_SURGING DESC, t.INTENT_SCORE DESC, t.ACCOUNT_ID
LIMIT 10;
