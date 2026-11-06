-- =============================================================================
-- DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_OFFER_ELIGIBILITY  (SQL SP)
-- =============================================================================
-- Scores every BUSINESS and PERSON account against the bank's product shelf for
-- one run month (RUN_DATE's month, default this month):
--   * replaces that month in OFFER_ELIGIBILITY_HISTORY (DELETE + INSERT), and
--   * when that month is the newest in the history, replaces OFFER_ELIGIBILITY
--     with it (INSERT OVERWRITE — one scoring run, the current one).
-- So CALL ...('2026-05-01') backfills a past month without touching the
-- current table.
--
-- As-of inputs: every vendor feed is read at its newest month on or before the
-- run month, and holdings count only accounts opened before the run month ends,
-- so a backfilled month scores what was known then.
--
-- Holdings-aware: a product the client already holds at Cumulus (per the
-- FINANCIAL_TRANSACTION_ACCOUNTS mirror of FSC FinancialAccounts, matched on
-- the product name) is not scored at all — no row is written for it.
--
-- Inputs
--   BUSINESS  V_ACCOUNT_ANCHORS (revenue, industry) + latest DNB_BUSINESS_CREDIT
--             (composite risk, PAYDEX, failure risk) + latest PLAID_HELD_AWAY
--             (business checking / commercial card / loan / sweep held elsewhere).
--   PERSON    V_ACCOUNT_ANCHORS (income, credit, birthdate, client category)
--             + PERSONAL_PRODUCT_RECOMMENDATION_SUBSET (DTI, home ownership,
--             life event) + latest PLAID_HELD_AWAY (balances held at other
--             institutions, by account type) + latest CORELOGIC_PROPERTY
--             (ownership, equity, HELOC score) + latest CLARITAS_DEMOGRAPHICS
--             (wealth / investment / mortgage propensity).
-- Random:  HASH(account, code, salt) → [0,1), stable across months, plus a ±3%
--          monthly jitter HASH(account, code, run month). Month-to-month score
--          movement therefore comes from the inputs (held-away balances,
--          propensities, credit, equity, new holdings), not from re-rolling.
--          Re-runs of a month are byte-identical.
--
-- Families: Treasury, Lending, Deposits, Cards (business, BIZ-*);
--           Retail and Wealth (person). The retail and wealth cockpits read the
--           codes their white-space columns map to.
--
-- Eligibility (rank NULL when not met; ~12% of otherwise-eligible pairs are
-- also suppressed so not every client gets every product). Person rules live
-- in the `pr` CTE; business rules in `bx`.
--
-- Scores: conversion = base x (0.7–1.3) + signal bonus (held-away product of
-- the same type, matching life event, Claritas propensity, credit / size);
-- no-action 2–6%; uplift = (conv - no-action) / 100 x clamp(rate x basis,
-- floor, cap) where basis is the held-away balance when there is one, else an
-- income / revenue proxy. Rank 1 = highest uplift per account.
-- =============================================================================

CREATE OR REPLACE PROCEDURE DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_OFFER_ELIGIBILITY(RUN_DATE DATE DEFAULT NULL)
RETURNS STRING
LANGUAGE SQL
EXECUTE AS OWNER
AS
$$
DECLARE
    run_month DATE DEFAULT DATE_TRUNC('month', COALESCE(:RUN_DATE, CURRENT_DATE()));
    next_month DATE DEFAULT DATEADD('month', 1, DATE_TRUNC('month', COALESCE(:RUN_DATE, CURRENT_DATE())));
    newest DATE;
    is_current BOOLEAN;
    started TIMESTAMP_LTZ DEFAULT CURRENT_TIMESTAMP();
    audience INTEGER;
    rows_written INTEGER;
    accts_offered INTEGER;
BEGIN
    DELETE FROM DATA_JEDAIS.FINS__PUBLIC.OFFER_ELIGIBILITY_HISTORY WHERE START_DATE = :run_month;

    INSERT INTO DATA_JEDAIS.FINS__PUBLIC.OFFER_ELIGIBILITY_HISTORY (
        ORG_ID, RECORD_ID, ACCOUNT_ID, ACTION_CODE, PRODUCT_FAMILY, RECOMMENDED_ACTION_RANK,
        CONVERSION_PROBABILITY, NOACTION_CONVERSION, EXPECTED_VALUE_UPLIFT,
        RECOMMENDED_CHANNELS, EM_PROBABILITY, CC_PROBABILITY, START_DATE, GENERATED_AT
    )
    WITH
    -- ---------------------------------------------------------------- holdings
    h AS (
        SELECT SFACCOUNTID AS ACCOUNT_ID,
               BOOLOR_AGG(ACCOUNT_NAME ILIKE ANY ('%Everyday Checking%', '%Classic Checking%', '%Joint Checking%', '%Stratus Checking%')) AS h_chk,
               BOOLOR_AGG(ACCOUNT_NAME ILIKE '%Premier Checking%') AS h_pchk,
               BOOLOR_AGG(ACCOUNT_NAME ILIKE ANY ('%Savings%', '%Money Market%', '% CD%')) AS h_sav,
               BOOLOR_AGG(ACCOUNT_NAME ILIKE ANY ('%High-Yield Savings%', '%Money Market%', '% CD%')) AS h_cash,
               BOOLOR_AGG(ACCOUNT_NAME ILIKE '%Card%' AND NOT (ACCOUNT_NAME ILIKE ANY ('%Corporate Card%', '%Commercial Card%'))) AS h_card,
               BOOLOR_AGG(ACCOUNT_NAME ILIKE '%Auto Loan%') AS h_auto,
               BOOLOR_AGG(ACCOUNT_NAME ILIKE ANY ('%Mortgage%', '%ARM%')) AS h_mtg,
               BOOLOR_AGG(ACCOUNT_NAME ILIKE '%HELOC%') AS h_heloc,
               BOOLOR_AGG(ACCOUNT_NAME ILIKE '%Personal Loan%') AS h_pl,
               BOOLOR_AGG(ACCOUNT_NAME ILIKE ANY ('%Brokerage%', '%IRA%', '%Managed%', '%529%')) AS h_inv,
               BOOLOR_AGG(ACCOUNT_NAME ILIKE '%Managed%') AS h_mas,
               BOOLOR_AGG(ACCOUNT_NAME ILIKE '%Roth%') AS h_roth,
               BOOLOR_AGG(ACCOUNT_NAME ILIKE ANY ('%Traditional IRA%', '%Rollover%')) AS h_rollover,
               BOOLOR_AGG(ACCOUNT_NAME ILIKE '%Business%Checking%') AS h_bchk,
               BOOLOR_AGG(ACCOUNT_NAME ILIKE ANY ('%Corporate Card%', '%Commercial Card%')) AS h_bcard,
               BOOLOR_AGG(ACCOUNT_NAME ILIKE '%Line of Credit%') AS h_loc,
               BOOLOR_AGG(ACCOUNT_NAME ILIKE '%Term Loan%') AS h_tl,
               BOOLOR_AGG(ACCOUNT_NAME ILIKE ANY ('%CRE Loan%', '%Commercial Real Estate%')) AS h_cre,
               BOOLOR_AGG(ACCOUNT_NAME ILIKE '%SBA%') AS h_sba,
               BOOLOR_AGG(ACCOUNT_NAME ILIKE '%Equipment%') AS h_eqf
        FROM DATA_JEDAIS.FINS__PUBLIC.FINANCIAL_TRANSACTION_ACCOUNTS
        WHERE ACTIVE = TRUE AND SFACCOUNTID LIKE '001%'
          AND (OPEN_DATE IS NULL OR OPEN_DATE < :next_month)
        GROUP BY 1
    ),
    -- --------------------------------------- held-away (as of the run month)
    p AS (
        SELECT ACCOUNT_ID,
               SUM(IFF(ACCOUNT_TYPE = 'Checking', BALANCE_USD, 0)) AS ha_chk,
               SUM(IFF(ACCOUNT_TYPE IN ('Savings', 'Money Market'), BALANCE_USD, 0)) AS ha_sav,
               SUM(IFF(ACCOUNT_TYPE = 'Credit Card', BALANCE_USD, 0)) AS ha_card,
               SUM(IFF(ACCOUNT_TYPE = 'Auto Loan', BALANCE_USD, 0)) AS ha_auto,
               SUM(IFF(ACCOUNT_TYPE = 'Mortgage', BALANCE_USD, 0)) AS ha_mtg,
               SUM(IFF(ACCOUNT_TYPE IN ('Brokerage', 'Managed Portfolio'), BALANCE_USD, 0)) AS ha_brk,
               SUM(IFF(ACCOUNT_TYPE = 'IRA', BALANCE_USD, 0)) AS ha_ira,
               SUM(IFF(ACCOUNT_TYPE = '401k', BALANCE_USD, 0)) AS ha_401k,
               SUM(IFF(ACCOUNT_TYPE = 'Business Checking', BALANCE_USD, 0)) AS ha_bchk,
               SUM(IFF(ACCOUNT_TYPE = 'Commercial Card', BALANCE_USD, 0)) AS ha_bcard,
               SUM(IFF(ACCOUNT_TYPE = 'Commercial Loan', BALANCE_USD, 0)) AS ha_bloan,
               SUM(IFF(ACCOUNT_TYPE = 'Sweep Account', BALANCE_USD, 0)) AS ha_sweep
        FROM DATA_JEDAIS.FINS__PUBLIC.PLAID_HELD_AWAY
        WHERE PROFILE_MONTH = (SELECT MAX(PROFILE_MONTH) FROM DATA_JEDAIS.FINS__PUBLIC.PLAID_HELD_AWAY WHERE PROFILE_MONTH <= :run_month)
        GROUP BY 1
    ),
    -- ================================================================ BUSINESS
    a AS (
        SELECT v.ORG_ID, v.ACCOUNT_ID, COALESCE(v.ANNUAL_REVENUE, 0) AS rev, v.INDUSTRY AS ind,
               d.COMPOSITE_RISK_SCORE AS comp, d.PAYDEX_SCORE AS paydex, d.FAILURE_RISK_SCORE AS fail,
               -- 0 at $250K revenue, 1 at $25M+.
               LEAST(1, GREATEST(0, LOG(10, GREATEST(COALESCE(v.ANNUAL_REVENUE, 0), 1) / 250000) / 2)) AS size
        FROM DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS v
        LEFT JOIN DATA_JEDAIS.FINS__PUBLIC.DNB_BUSINESS_CREDIT d
               ON d.ORG_ID = v.ORG_ID AND d.ACCOUNT_ID = v.ACCOUNT_ID
              AND d.PROFILE_MONTH = (SELECT MAX(PROFILE_MONTH) FROM DATA_JEDAIS.FINS__PUBLIC.DNB_BUSINESS_CREDIT WHERE PROFILE_MONTH <= :run_month)
        WHERE v.ACCOUNT_TYPE_FLAG = 'BUSINESS'
          AND v.ACCOUNT_ID LIKE '001%' AND LENGTH(v.ACCOUNT_ID) = 18
        QUALIFY ROW_NUMBER() OVER (PARTITION BY v.ORG_ID, v.ACCOUNT_ID ORDER BY v.SNAPSHOT_DATE DESC NULLS LAST) = 1
    ),
    bc (code, family, base_conv, value_rate, value_floor, value_cap) AS (
        SELECT * FROM VALUES
            ('BIZ-CHK',    'Deposits', 24, 0.0020,  600,  20000),
            ('BIZ-TM-ACH', 'Treasury', 22, 0.0006,  600,  30000),
            ('BIZ-TM-RDC', 'Treasury', 26, 0.0004,  900,   6000),
            ('BIZ-TM-PP',  'Treasury', 18, 0.0003,  500,  20000),
            ('BIZ-TM-SWP', 'Treasury', 14, 0.0012, 4000,  60000),
            ('BIZ-CARD',   'Cards',    16, 0.0030,  800,  40000),
            ('BIZ-LOC',    'Lending',  20, 0.0030, 1500,  90000),
            ('BIZ-TL',     'Lending',  12, 0.0025, 2500,  75000),
            ('BIZ-EQF',    'Lending',  15, 0.0020, 2000,  50000),
            ('BIZ-CRE',    'Lending',   9, 0.0035, 8000, 120000),
            ('BIZ-SBA',    'Lending',  17, 0.0040, 3000,  40000)
    ),
    bx AS (
        SELECT a.*, bc.*,
               COALESCE(p.ha_bchk, 0) AS ha_bchk, COALESCE(p.ha_bcard, 0) AS ha_bcard,
               COALESCE(p.ha_bloan, 0) AS ha_bloan, COALESCE(p.ha_sweep, 0) AS ha_sweep,
               (ABS(HASH(a.ACCOUNT_ID, bc.code, 'conv')) % 10000) / 10000.0 AS u_conv,
               (ABS(HASH(a.ACCOUNT_ID, bc.code, 'base')) % 10000) / 10000.0 AS u_base,
               (ABS(HASH(a.ACCOUNT_ID, bc.code, 'keep')) % 10000) / 10000.0 AS u_keep,
               (ABS(HASH(a.ACCOUNT_ID, bc.code, :run_month, 'jit')) % 10000) / 10000.0 AS u_jit,
               CASE bc.code
                   WHEN 'BIZ-CHK'    THEN COALESCE(h.h_bchk, FALSE)
                   WHEN 'BIZ-CARD'   THEN COALESCE(h.h_bcard, FALSE)
                   WHEN 'BIZ-LOC'    THEN COALESCE(h.h_loc, FALSE)
                   WHEN 'BIZ-TL'     THEN COALESCE(h.h_tl, FALSE)
                   WHEN 'BIZ-CRE'    THEN COALESCE(h.h_cre, FALSE)
                   WHEN 'BIZ-SBA'    THEN COALESCE(h.h_sba, FALSE)
                   WHEN 'BIZ-EQF'    THEN COALESCE(h.h_eqf, FALSE)
                   ELSE FALSE
               END AS owned,
               CASE bc.code
                   WHEN 'BIZ-CHK'    THEN TRUE
                   WHEN 'BIZ-TM-ACH' THEN a.rev >= 500000
                   WHEN 'BIZ-TM-RDC' THEN a.rev < 25000000
                   WHEN 'BIZ-TM-PP'  THEN a.rev >= 1000000
                   WHEN 'BIZ-TM-SWP' THEN a.rev >= 5000000 OR COALESCE(p.ha_sweep, 0) > 0
                   WHEN 'BIZ-CARD'   THEN COALESCE(a.comp, 3) <= 3 AND a.rev >= 250000
                   WHEN 'BIZ-LOC'    THEN a.comp <= 3 AND a.paydex >= 60 AND a.rev >= 250000
                   WHEN 'BIZ-TL'     THEN a.comp <= 3 AND a.fail >= 30 AND a.rev >= 1000000
                   WHEN 'BIZ-EQF'    THEN a.comp <= 3 AND a.ind IN ('Construction', 'Manufacturing', 'Logistics', 'Restaurant',
                                                                    'Healthcare', 'Healthcare Systems', 'Wholesale', 'Wholesale Distribution')
                   WHEN 'BIZ-CRE'    THEN (a.comp <= 2 AND a.rev >= 5000000) OR (a.comp <= 3 AND a.ind LIKE 'Real Estate%')
                   WHEN 'BIZ-SBA'    THEN a.comp <= 3 AND a.rev BETWEEN 100000 AND 8000000
               END AS rule_ok,
               -- Same product already held at another institution: strongest signal.
               CASE bc.code
                   WHEN 'BIZ-CHK'    THEN IFF(COALESCE(p.ha_bchk, 0) > 0, 12, 0)
                   WHEN 'BIZ-CARD'   THEN IFF(COALESCE(p.ha_bcard, 0) > 0, 12, 0)
                   WHEN 'BIZ-TM-SWP' THEN IFF(COALESCE(p.ha_sweep, 0) > 0, 10, 0)
                   WHEN 'BIZ-TL'     THEN IFF(COALESCE(p.ha_bloan, 0) > 0, 8, 0)
                   WHEN 'BIZ-CRE'    THEN IFF(COALESCE(p.ha_bloan, 0) > 0, 6, 0)
                   ELSE 0
               END AS held_bonus
        FROM a CROSS JOIN bc
        LEFT JOIN h ON h.ACCOUNT_ID = a.ACCOUNT_ID
        LEFT JOIN p ON p.ACCOUNT_ID = a.ACCOUNT_ID
    ),
    be AS (
        SELECT ORG_ID, ACCOUNT_ID, code, family, size,
               conv, noaction,
               ROUND((conv - noaction) / 100 * product_value, 2) AS ev,
               COALESCE(rule_ok, FALSE) AND u_keep >= 0.12 AS eligible
        FROM (
            SELECT bx.*,
                   ROUND(LEAST(60, base_conv * (0.7 + 0.6 * u_conv) * (0.97 + 0.06 * u_jit) + held_bonus
                         + IFF(family IN ('Treasury', 'Deposits'), size * 6, (4 - COALESCE(comp, 4)) * 2.5)), 2) AS conv,
                   ROUND(2 + 4 * u_base, 2) AS noaction,
                   LEAST(value_cap, GREATEST(value_floor, value_rate *
                         CASE code
                             WHEN 'BIZ-CHK'  THEN GREATEST(rev, ha_bchk * 10)
                             WHEN 'BIZ-CARD' THEN GREATEST(rev, ha_bcard * 20)
                             ELSE rev
                         END)) AS product_value
            FROM bx
            WHERE NOT owned
        )
    ),
    -- ================================================================== PERSON
    q AS (
        SELECT v.ORG_ID, v.ACCOUNT_ID,
               COALESCE(v.ANNUAL_INCOME, r.ANNUAL_INCOME, 0) AS inc,
               COALESCE(v.CREDIT_SCORE, r.CREDIT_SCORE, 650) AS fico,
               COALESCE(DATEDIFF('year', v.BIRTHDATE, :run_month), r.AGE, 45) AS age,
               v.CLIENT_CATEGORY AS cat,
               COALESCE(r.DEBT_TO_INCOME_RATIO, 0.3) AS dti,
               COALESCE(r.RECENT_LIFE_EVENT, 'None') AS evt,
               COALESCE(cl.IS_OWNER, r.HOME_OWNERSHIP IN ('Own', 'Mortgage'), FALSE) AS owner,
               COALESCE(cl.EQUITY_USD, 0) AS equity,
               COALESCE(cl.HELOC_OPPORTUNITY_SCORE, 0) AS heloc_score,
               COALESCE(cd.WEALTH_PROPENSITY_SCORE, 0) AS wealth_prop,
               COALESCE(cd.INVESTMENT_PROPENSITY_SCORE, 0) AS inv_prop,
               COALESCE(cd.MORTGAGE_PROPENSITY_SCORE, 0) AS mtg_prop
        FROM DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS v
        LEFT JOIN DATA_JEDAIS.FINS__PUBLIC.PERSONAL_PRODUCT_RECOMMENDATION_SUBSET r ON r.ACCOUNTID = v.ACCOUNT_ID
        LEFT JOIN DATA_JEDAIS.FINS__PUBLIC.CORELOGIC_PROPERTY cl
               ON cl.ACCOUNT_ID = v.ACCOUNT_ID
              AND cl.PROFILE_QUARTER = (SELECT MAX(PROFILE_QUARTER) FROM DATA_JEDAIS.FINS__PUBLIC.CORELOGIC_PROPERTY WHERE PROFILE_QUARTER <= :run_month)
        LEFT JOIN DATA_JEDAIS.FINS__PUBLIC.CLARITAS_DEMOGRAPHICS cd
               ON cd.ACCOUNT_ID = v.ACCOUNT_ID
              AND cd.PROFILE_MONTH = (SELECT MAX(PROFILE_MONTH) FROM DATA_JEDAIS.FINS__PUBLIC.CLARITAS_DEMOGRAPHICS WHERE PROFILE_MONTH <= :run_month)
        WHERE v.ACCOUNT_TYPE_FLAG = 'PERSON'
          AND v.ACCOUNT_ID LIKE '001%' AND LENGTH(v.ACCOUNT_ID) = 18
        QUALIFY ROW_NUMBER() OVER (PARTITION BY v.ORG_ID, v.ACCOUNT_ID ORDER BY v.SNAPSHOT_DATE DESC NULLS LAST) = 1
    ),
    pc (code, family, base_conv, value_rate, value_floor, value_cap) AS (
        SELECT * FROM VALUES
            ('CHK-ACQ',  'Retail', 18, 0.0200,  120,  1500),
            ('HYS-ACQ',  'Retail', 16, 0.0150,  150,  8000),
            ('CRC-ACQ',  'Retail', 20, 0.0040,  150,  2500),
            ('AUTO-ACQ', 'Retail', 10, 0.0250,  400,  3000),
            ('MTG-30',   'Retail',  6, 0.0080, 1500, 12000),
            ('HEL-ACQ',  'Retail', 11, 0.0200,  800, 15000),
            ('PL-ACQ',   'Retail',  9, 0.0500,  500,  4000),
            ('INV-ACQ',  'Retail', 12, 0.0080,  300, 20000),
            ('PCHK-ACQ', 'Wealth', 15, 0.0150,  400,  6000),
            ('WM-CASH',  'Wealth', 17, 0.0120,  600, 20000),
            ('WM-MAS',   'Wealth', 11, 0.0090, 2500, 60000),
            ('IRA-RTH',  'Wealth', 13, 0.0080,  150,  8000),
            ('IRA-ROL',  'Wealth', 14, 0.0080,  800, 40000),
            ('MTG-JMB',  'Wealth',  7, 0.0060, 5000, 30000)
    ),
    px AS (
        SELECT q.*, pc.*,
               COALESCE(p.ha_chk, 0) AS ha_chk, COALESCE(p.ha_sav, 0) AS ha_sav, COALESCE(p.ha_card, 0) AS ha_card,
               COALESCE(p.ha_auto, 0) AS ha_auto, COALESCE(p.ha_mtg, 0) AS ha_mtg, COALESCE(p.ha_brk, 0) AS ha_brk,
               COALESCE(p.ha_ira, 0) AS ha_ira, COALESCE(p.ha_401k, 0) AS ha_401k,
               (ABS(HASH(q.ACCOUNT_ID, pc.code, 'conv')) % 10000) / 10000.0 AS u_conv,
               (ABS(HASH(q.ACCOUNT_ID, pc.code, 'base')) % 10000) / 10000.0 AS u_base,
               (ABS(HASH(q.ACCOUNT_ID, pc.code, 'keep')) % 10000) / 10000.0 AS u_keep,
               (ABS(HASH(q.ACCOUNT_ID, pc.code, :run_month, 'jit')) % 10000) / 10000.0 AS u_jit,
               CASE pc.code
                   WHEN 'CHK-ACQ'  THEN COALESCE(h.h_chk OR h.h_pchk, FALSE)
                   WHEN 'HYS-ACQ'  THEN COALESCE(h.h_sav, FALSE)
                   WHEN 'CRC-ACQ'  THEN COALESCE(h.h_card, FALSE)
                   WHEN 'AUTO-ACQ' THEN COALESCE(h.h_auto, FALSE)
                   WHEN 'MTG-30'   THEN COALESCE(h.h_mtg, FALSE)
                   WHEN 'HEL-ACQ'  THEN COALESCE(h.h_heloc, FALSE)
                   WHEN 'PL-ACQ'   THEN COALESCE(h.h_pl, FALSE)
                   WHEN 'INV-ACQ'  THEN COALESCE(h.h_inv, FALSE)
                   WHEN 'PCHK-ACQ' THEN COALESCE(h.h_pchk, FALSE)
                   WHEN 'WM-CASH'  THEN COALESCE(h.h_cash, FALSE)
                   WHEN 'WM-MAS'   THEN COALESCE(h.h_mas, FALSE)
                   WHEN 'IRA-RTH'  THEN COALESCE(h.h_roth, FALSE)
                   WHEN 'IRA-ROL'  THEN COALESCE(h.h_rollover, FALSE)
                   WHEN 'MTG-JMB'  THEN COALESCE(h.h_mtg, FALSE)
               END AS owned
        FROM q CROSS JOIN pc
        LEFT JOIN h ON h.ACCOUNT_ID = q.ACCOUNT_ID
        LEFT JOIN p ON p.ACCOUNT_ID = q.ACCOUNT_ID
    ),
    pr AS (
        SELECT px.*,
               CASE code
                   WHEN 'CHK-ACQ'  THEN TRUE
                   WHEN 'HYS-ACQ'  THEN inc >= 25000 OR ha_sav > 0
                   WHEN 'CRC-ACQ'  THEN fico >= 640
                   WHEN 'AUTO-ACQ' THEN fico >= 600 AND (ha_auto > 0 OR inc >= 35000)
                   WHEN 'MTG-30'   THEN fico >= 660 AND ((NOT owner AND inc >= 60000) OR (ha_mtg BETWEEN 1 AND 766550))
                   WHEN 'HEL-ACQ'  THEN fico >= 660 AND owner AND equity >= 50000
                   WHEN 'PL-ACQ'   THEN fico >= 620 AND dti < 0.45 AND inc >= 30000
                   WHEN 'INV-ACQ'  THEN inc >= 75000 OR ha_brk + ha_ira > 0 OR inv_prop >= 60
                   WHEN 'PCHK-ACQ' THEN inc >= 150000 OR wealth_prop >= 60 OR cat = 'Wealth Management'
                   WHEN 'WM-CASH'  THEN inc >= 100000 OR ha_sav >= 50000
                   WHEN 'WM-MAS'   THEN ha_brk >= 250000 OR inc >= 200000 OR wealth_prop >= 70
                   WHEN 'IRA-RTH'  THEN inc BETWEEN 30000 AND 240000 AND age < 70
                   WHEN 'IRA-ROL'  THEN ha_401k > 0
                   WHEN 'MTG-JMB'  THEN fico >= 700 AND (inc >= 250000 OR ha_mtg > 766550)
               END AS rule_ok,
               CASE code
                   WHEN 'CHK-ACQ'  THEN IFF(ha_chk > 0, 12, 0)
                   WHEN 'HYS-ACQ'  THEN IFF(ha_sav > 0, 12, 0)
                   WHEN 'CRC-ACQ'  THEN IFF(ha_card > 0, 10, 0)
                   WHEN 'AUTO-ACQ' THEN IFF(ha_auto > 0, 12, 0)
                   WHEN 'MTG-30'   THEN IFF(ha_mtg > 0, 10, 0)
                   WHEN 'INV-ACQ'  THEN IFF(ha_brk + ha_ira > 0, 12, 0)
                   WHEN 'PCHK-ACQ' THEN IFF(ha_chk > 0, 8, 0)
                   WHEN 'WM-CASH'  THEN IFF(ha_sav > 0, 12, 0)
                   WHEN 'WM-MAS'   THEN IFF(ha_brk > 0, 12, 0)
                   WHEN 'IRA-RTH'  THEN IFF(ha_ira > 0, 8, 0)
                   WHEN 'IRA-ROL'  THEN 18
                   WHEN 'MTG-JMB'  THEN IFF(ha_mtg > 0, 10, 0)
                   ELSE 0
               END
               + CASE
                   WHEN evt = 'New_Home'            AND code IN ('MTG-30', 'MTG-JMB', 'HEL-ACQ', 'CRC-ACQ') THEN 6
                   WHEN evt = 'Marriage'            AND code IN ('CHK-ACQ', 'HYS-ACQ', 'CRC-ACQ', 'PCHK-ACQ') THEN 6
                   WHEN evt = 'New_Baby'            AND code IN ('HYS-ACQ', 'INV-ACQ', 'WM-CASH') THEN 6
                   WHEN evt = 'Job_Change'          AND code IN ('IRA-ROL', 'CHK-ACQ', 'PCHK-ACQ') THEN 6
                   WHEN evt = 'Retirement_Planning' AND code IN ('IRA-ROL', 'IRA-RTH', 'WM-MAS', 'INV-ACQ') THEN 6
                   WHEN evt = 'College_Planning'    AND code IN ('INV-ACQ', 'HYS-ACQ', 'PL-ACQ') THEN 6
                   ELSE 0
                 END
               + CASE
                   WHEN code IN ('MTG-30', 'MTG-JMB') THEN mtg_prop / 20
                   WHEN code = 'HEL-ACQ'              THEN heloc_score / 20
                   WHEN code IN ('INV-ACQ', 'IRA-RTH') THEN inv_prop / 25
                   WHEN family = 'Wealth'             THEN wealth_prop / 25
                   ELSE (fico - 600) / 40
                 END AS bonus,
               CASE code
                   WHEN 'CHK-ACQ'  THEN GREATEST(ha_chk, 2000)
                   WHEN 'HYS-ACQ'  THEN GREATEST(ha_sav, inc * 0.1)
                   WHEN 'CRC-ACQ'  THEN inc
                   WHEN 'AUTO-ACQ' THEN IFF(ha_auto > 0, ha_auto, 30000)
                   WHEN 'MTG-30'   THEN IFF(ha_mtg > 0, ha_mtg, inc * 3.5)
                   WHEN 'HEL-ACQ'  THEN equity * 0.3
                   WHEN 'PL-ACQ'   THEN inc * 0.15
                   WHEN 'INV-ACQ'  THEN IFF(ha_brk + ha_ira > 0, ha_brk + ha_ira, inc * 0.5)
                   WHEN 'PCHK-ACQ' THEN IFF(ha_chk > 0, ha_chk, inc * 0.2)
                   WHEN 'WM-CASH'  THEN IFF(ha_sav > 0, ha_sav, inc * 0.3)
                   WHEN 'WM-MAS'   THEN IFF(ha_brk > 0, ha_brk, inc * 2)
                   WHEN 'IRA-RTH'  THEN GREATEST(ha_ira, 7000)
                   WHEN 'IRA-ROL'  THEN ha_401k
                   WHEN 'MTG-JMB'  THEN IFF(ha_mtg > 0, ha_mtg, inc * 4)
               END AS basis
        FROM px
        WHERE NOT owned
    ),
    pe AS (
        SELECT ORG_ID, ACCOUNT_ID, code, family,
               -- Person "size" (0 at $50K income, 1 at ~$1M) drives the RM-call vs email split.
               LEAST(1, GREATEST(0, LOG(10, GREATEST(inc, 1) / 50000) / 1.3)) AS size,
               conv, noaction,
               ROUND((conv - noaction) / 100 * product_value, 2) AS ev,
               COALESCE(rule_ok, FALSE) AND u_keep >= 0.12 AS eligible
        FROM (
            SELECT pr.*,
                   ROUND(LEAST(70, GREATEST(1, base_conv * (0.7 + 0.6 * u_conv) * (0.97 + 0.06 * u_jit) + bonus)), 2) AS conv,
                   ROUND(2 + 4 * u_base, 2) AS noaction,
                   LEAST(value_cap, GREATEST(value_floor, value_rate * COALESCE(basis, 0))) AS product_value
            FROM pr
        )
    ),
    e AS (
        SELECT * FROM be
        UNION ALL
        SELECT * FROM pe
    )
    SELECT ORG_ID, ACCOUNT_ID || '|' || code || '|' || TO_CHAR(:run_month, 'YYYY-MM'), ACCOUNT_ID, code, family,
           IFF(eligible, ROW_NUMBER() OVER (PARTITION BY ORG_ID, ACCOUNT_ID, eligible ORDER BY ev DESC, code), NULL),
           conv, noaction, ev,
           IFF(size >= 0.5, 'CC,EM', 'EM,CC'),
           ROUND(conv * (0.9 - 0.5 * size), 2),
           ROUND(conv * (0.5 + 0.5 * size), 2),
           :run_month, :run_month::TIMESTAMP_NTZ
    FROM e;

    -- Newest month wins the current table; a backfill of an older month leaves it alone.
    SELECT MAX(START_DATE) INTO :newest FROM DATA_JEDAIS.FINS__PUBLIC.OFFER_ELIGIBILITY_HISTORY;
    is_current := (run_month >= newest);
    IF (is_current) THEN
        INSERT OVERWRITE INTO DATA_JEDAIS.FINS__PUBLIC.OFFER_ELIGIBILITY (
            ORG_ID, RECORD_ID, ACCOUNT_ID, ACTION_CODE, PRODUCT_FAMILY, RECOMMENDED_ACTION_RANK,
            CONVERSION_PROBABILITY, NOACTION_CONVERSION, EXPECTED_VALUE_UPLIFT,
            RECOMMENDED_CHANNELS, EM_PROBABILITY, CC_PROBABILITY, START_DATE, GENERATED_AT
        )
        SELECT ORG_ID, ACCOUNT_ID || '|' || ACTION_CODE, ACCOUNT_ID, ACTION_CODE, PRODUCT_FAMILY, RECOMMENDED_ACTION_RANK,
               CONVERSION_PROBABILITY, NOACTION_CONVERSION, EXPECTED_VALUE_UPLIFT,
               RECOMMENDED_CHANNELS, EM_PROBABILITY, CC_PROBABILITY, START_DATE, GENERATED_AT
        FROM DATA_JEDAIS.FINS__PUBLIC.OFFER_ELIGIBILITY_HISTORY
        WHERE START_DATE = :run_month;
    END IF;

    SELECT COUNT(*), COUNT(DISTINCT ACCOUNT_ID), COUNT(DISTINCT IFF(RECOMMENDED_ACTION_RANK IS NOT NULL, ACCOUNT_ID, NULL))
      INTO :rows_written, :audience, :accts_offered
      FROM DATA_JEDAIS.FINS__PUBLIC.OFFER_ELIGIBILITY_HISTORY
     WHERE START_DATE = :run_month;

    INSERT INTO DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG
        (TASK_NAME, STATUS, ROWS_INSERTED, ACCOUNTS_PROCESSED, ERROR_MESSAGE, DURATION_MS)
    SELECT 'TASK_MONTHLY_OFFER_ELIGIBILITY', 'SUCCEEDED',  -- SP_DAILY_JOB_REPORT counts only SUCCEEDED as a pass
           :rows_written, :audience, NULL,
           DATEDIFF('millisecond', :started, CURRENT_TIMESTAMP());

    RETURN 'OFFER_ELIGIBILITY ' || run_month || ': ' || rows_written || ' rows, ' || audience
        || ' accounts, ' || accts_offered || ' with at least one eligible offer'
        || IFF(is_current, ' (current table replaced)', ' (history only)');
END;
$$;
