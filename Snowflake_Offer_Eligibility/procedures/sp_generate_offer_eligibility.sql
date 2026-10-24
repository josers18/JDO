-- =============================================================================
-- DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_OFFER_ELIGIBILITY  (SQL SP)
-- =============================================================================
-- Scores every BUSINESS account against 9 treasury + lending action codes and
-- replaces OFFER_ELIGIBILITY with the run (INSERT OVERWRITE — one scoring run
-- kept, like the Databricks model it sits beside).
--
-- Inputs:  V_ACCOUNT_ANCHORS (revenue, industry) + the latest month of
--          DNB_BUSINESS_CREDIT (composite risk, PAYDEX, failure risk).
-- Random:  HASH(account, code, run month, salt) → [0,1); re-runs in the same
--          month are byte-identical.
--
-- Eligibility (rank NULL when not met; ~12% of otherwise-eligible pairs are
-- also suppressed so not every client gets every product):
--   BIZ-TM-ACH  revenue >= $500K          BIZ-LOC  composite <= 3, PAYDEX >= 60, revenue >= $250K
--   BIZ-TM-RDC  revenue <  $25M           BIZ-TL   composite <= 3, failure risk >= 30, revenue >= $1M
--   BIZ-TM-PP   revenue >= $1M            BIZ-EQF  composite <= 3, equipment-heavy industry
--   BIZ-TM-SWP  revenue >= $5M            BIZ-CRE  composite <= 2 and revenue >= $5M, or real estate with composite <= 3
--                                         BIZ-SBA  composite <= 3, revenue $100K–$8M
-- Accounts without a D&B row are treasury-only.
--
-- Scores: conversion = base x (0.7–1.3) + a size (treasury) or credit
-- (lending) bonus; no-action 2–6%; uplift = (conv - no-action) / 100 x
-- clamp(rate x revenue, floor, cap). Larger firms lean to an RM call (CC),
-- smaller ones to email (EM). Rank 1 = highest uplift per account.
-- =============================================================================

CREATE OR REPLACE PROCEDURE DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_OFFER_ELIGIBILITY(RUN_DATE DATE DEFAULT NULL)
RETURNS STRING
LANGUAGE SQL
EXECUTE AS OWNER
AS
$$
DECLARE
    run_month DATE DEFAULT DATE_TRUNC('month', COALESCE(:RUN_DATE, CURRENT_DATE()));
    started TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP();
    audience INTEGER;
    rows_written INTEGER;
    accts_offered INTEGER;
BEGIN
    INSERT OVERWRITE INTO DATA_JEDAIS.FINS__PUBLIC.OFFER_ELIGIBILITY (
        ORG_ID, RECORD_ID, ACCOUNT_ID, ACTION_CODE, PRODUCT_FAMILY, RECOMMENDED_ACTION_RANK,
        CONVERSION_PROBABILITY, NOACTION_CONVERSION, EXPECTED_VALUE_UPLIFT,
        RECOMMENDED_CHANNELS, EM_PROBABILITY, CC_PROBABILITY, START_DATE, GENERATED_AT
    )
    WITH a AS (
        SELECT v.ORG_ID, v.ACCOUNT_ID, COALESCE(v.ANNUAL_REVENUE, 0) AS rev, v.INDUSTRY AS ind,
               d.COMPOSITE_RISK_SCORE AS comp, d.PAYDEX_SCORE AS paydex, d.FAILURE_RISK_SCORE AS fail,
               -- 0 at $250K revenue, 1 at $25M+.
               LEAST(1, GREATEST(0, LOG(10, GREATEST(COALESCE(v.ANNUAL_REVENUE, 0), 1) / 250000) / 2)) AS size
        FROM DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS v
        LEFT JOIN DATA_JEDAIS.FINS__PUBLIC.DNB_BUSINESS_CREDIT d
               ON d.ORG_ID = v.ORG_ID AND d.ACCOUNT_ID = v.ACCOUNT_ID
              AND d.PROFILE_MONTH = (SELECT MAX(PROFILE_MONTH) FROM DATA_JEDAIS.FINS__PUBLIC.DNB_BUSINESS_CREDIT)
        WHERE v.ACCOUNT_TYPE_FLAG = 'BUSINESS'
          AND v.ACCOUNT_ID LIKE '001%' AND LENGTH(v.ACCOUNT_ID) = 18
        QUALIFY ROW_NUMBER() OVER (PARTITION BY v.ORG_ID, v.ACCOUNT_ID ORDER BY v.SNAPSHOT_DATE DESC NULLS LAST) = 1
    ),
    c (code, family, base_conv, value_rate, value_floor, value_cap) AS (
        SELECT * FROM VALUES
            ('BIZ-TM-ACH', 'Treasury', 22, 0.0006,  600,  30000),
            ('BIZ-TM-RDC', 'Treasury', 26, 0.0004,  900,   6000),
            ('BIZ-TM-PP',  'Treasury', 18, 0.0003,  500,  20000),
            ('BIZ-TM-SWP', 'Treasury', 14, 0.0012, 4000,  60000),
            ('BIZ-LOC',    'Lending',  20, 0.0030, 1500,  90000),
            ('BIZ-TL',     'Lending',  12, 0.0025, 2500,  75000),
            ('BIZ-EQF',    'Lending',  15, 0.0020, 2000,  50000),
            ('BIZ-CRE',    'Lending',   9, 0.0035, 8000, 120000),
            ('BIZ-SBA',    'Lending',  17, 0.0040, 3000,  40000)
    ),
    x AS (
        SELECT a.*, c.*,
               (ABS(HASH(a.ACCOUNT_ID, c.code, :run_month, 'conv')) % 10000) / 10000.0 AS u_conv,
               (ABS(HASH(a.ACCOUNT_ID, c.code, :run_month, 'base')) % 10000) / 10000.0 AS u_base,
               (ABS(HASH(a.ACCOUNT_ID, c.code, :run_month, 'keep')) % 10000) / 10000.0 AS u_keep,
               CASE c.code
                   WHEN 'BIZ-TM-ACH' THEN a.rev >= 500000
                   WHEN 'BIZ-TM-RDC' THEN a.rev < 25000000
                   WHEN 'BIZ-TM-PP'  THEN a.rev >= 1000000
                   WHEN 'BIZ-TM-SWP' THEN a.rev >= 5000000
                   WHEN 'BIZ-LOC'    THEN a.comp <= 3 AND a.paydex >= 60 AND a.rev >= 250000
                   WHEN 'BIZ-TL'     THEN a.comp <= 3 AND a.fail >= 30 AND a.rev >= 1000000
                   WHEN 'BIZ-EQF'    THEN a.comp <= 3 AND a.ind IN ('Construction', 'Manufacturing', 'Logistics', 'Restaurant',
                                                                    'Healthcare', 'Healthcare Systems', 'Wholesale', 'Wholesale Distribution')
                   WHEN 'BIZ-CRE'    THEN (a.comp <= 2 AND a.rev >= 5000000) OR (a.comp <= 3 AND a.ind LIKE 'Real Estate%')
                   WHEN 'BIZ-SBA'    THEN a.comp <= 3 AND a.rev BETWEEN 100000 AND 8000000
               END AS rule_ok
        FROM a CROSS JOIN c
    ),
    s AS (
        SELECT x.*,
               ROUND(LEAST(60, base_conv * (0.7 + 0.6 * u_conv)
                     + IFF(family = 'Treasury', size * 6, (4 - COALESCE(comp, 4)) * 2.5)), 2) AS conv,
               ROUND(2 + 4 * u_base, 2) AS noaction,
               LEAST(value_cap, GREATEST(value_floor, value_rate * rev)) AS product_value,
               COALESCE(rule_ok, FALSE) AND u_keep >= 0.12 AS eligible
        FROM x
    ),
    e AS (
        SELECT s.*, ROUND((conv - noaction) / 100 * product_value, 2) AS ev
        FROM s
    )
    SELECT ORG_ID, ACCOUNT_ID || '|' || code, ACCOUNT_ID, code, family,
           IFF(eligible, ROW_NUMBER() OVER (PARTITION BY ORG_ID, ACCOUNT_ID, eligible ORDER BY ev DESC, code), NULL),
           conv, noaction, ev,
           'CC,EM',
           ROUND(conv * (0.9 - 0.5 * size), 2),
           ROUND(conv * (0.5 + 0.5 * size), 2),
           :run_month, :run_month::TIMESTAMP_NTZ
    FROM e;

    rows_written := SQLROWCOUNT;
    SELECT COUNT(DISTINCT ACCOUNT_ID) INTO :audience FROM DATA_JEDAIS.FINS__PUBLIC.OFFER_ELIGIBILITY;
    SELECT COUNT(DISTINCT ACCOUNT_ID) INTO :accts_offered FROM DATA_JEDAIS.FINS__PUBLIC.OFFER_ELIGIBILITY
     WHERE RECOMMENDED_ACTION_RANK IS NOT NULL;

    INSERT INTO DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG
        (TASK_NAME, STATUS, ROWS_INSERTED, ACCOUNTS_PROCESSED, ERROR_MESSAGE, DURATION_MS)
    SELECT 'TASK_MONTHLY_OFFER_ELIGIBILITY', 'SUCCESS', :rows_written, :audience, NULL,
           DATEDIFF('millisecond', :started, CURRENT_TIMESTAMP());

    RETURN 'OFFER_ELIGIBILITY ' || run_month || ': ' || rows_written || ' rows, ' || audience
        || ' accounts, ' || accts_offered || ' with at least one eligible offer';
END;
$$;
