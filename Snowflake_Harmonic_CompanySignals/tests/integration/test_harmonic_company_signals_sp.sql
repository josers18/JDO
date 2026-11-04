-- =============================================================================
-- L2 integration test for SP_GENERATE_HARMONIC_COMPANY_SIGNALS
-- =============================================================================
-- Plan:    docs/superpowers/plans/2026-11-02-cumulus-plan-16-harmonic-company-signals.md
-- Task:    Plan 16 T5
-- Run:     SNOWFLAKE_DEFAULT_CONNECTION_NAME=SFDC_DC_TECH_ARCH_jwt \
--            snow sql -f tests/integration/test_harmonic_company_signals_sp.sql --role ACCOUNTADMIN
-- Pass:    Every assertion column returns TRUE. Any FALSE = test failure.
--
-- Strategy: clone the deployed SP into ..._FIXTURE via GET_DDL plus REPLACE,
-- redirecting the anchors view, both hard-dependency tables, the dataset
-- table, the staging table and the task name to fixture-scoped objects. The
-- ZoomInfo and Moody's fixtures use an _HFIX suffix so they cannot collide
-- with other plans' fixtures running in the same schema.
--
-- Fixture world (months are relative to the current UTC month M):
--   6 in-audience BUSINESS anchors, HARMONIC-FIX-IN-01..06 (one with a NULL
--     CLIENT_CATEGORY; IN-01 also has an older duplicate anchor snapshot).
--   5 excluded anchors:
--     X1, X2   founded 2008 (ZoomInfo FOUNDED_YEAR < 2010)
--     X3       latest Moody's row 'Tier 2', older row 'Illiquid'
--     X4       CLIENT_CATEGORY = 'Household'
--     X5       ACCOUNT_TYPE_FLAG = 'PERSON'
--   ZoomInfo fixture: months M-6..M for every anchor (stable FOUNDED_YEAR),
--     plus a duplicate IN-02 row at M-1.
--   So CALL ...(6) must produce 7 months x 6 accounts = 42 rows.
--
-- Negative tests: CALL ...(7) (no ZoomInfo M-7), ZoomInfo month M deleted,
-- Moody's fixture dropped, BACKFILL_MONTHS = -1. Each must raise, write
-- nothing, and log a FAILED row.
--
-- Pre-requisite: scripts/deploy_sp.py has deployed the real SP.
-- No ampersand anywhere in this file (snow sql template-render trap).
-- =============================================================================

USE SCHEMA DATA_JEDAIS.FINS__PUBLIC;

-- ---------------------------------------------------------------------------
-- 1. Drop leftovers from a prior failed run.
-- ---------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_HARMONIC_COMPANY_SIGNALS_FIXTURE(NUMBER);
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.HARMONIC_COMPANY_SIGNALS_FIXTURE;
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.HARMONIC_COMPANY_SIGNALS_FIXTURE_STAGING;
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.ZOOMINFO_FIRMOGRAPHICS_HFIX;
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_HFIX;
DROP VIEW      IF EXISTS DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS_HARMONIC_FIXTURE;
DELETE FROM DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG
 WHERE TASK_NAME = 'TASK_MONTHLY_HARMONIC_COMPANY_SIGNALS_FIXTURE';

SET m_cur = (SELECT DATE_TRUNC('MONTH', CONVERT_TIMEZONE('UTC', CURRENT_TIMESTAMP())::DATE));

-- ---------------------------------------------------------------------------
-- 2. Fixture anchors view (same 16 columns, same order as V_ACCOUNT_ANCHORS).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS_HARMONIC_FIXTURE AS
SELECT 'JDO'::VARCHAR AS ORG_ID, 'HARMONIC-FIX-IN-01'::VARCHAR AS ACCOUNT_ID,
       'Brightloop Labs'::VARCHAR AS ACCOUNT_NAME, '2026-10-28'::DATE AS SNAPSHOT_DATE,
       'Small Business'::VARCHAR AS CLIENT_CATEGORY, 'BUSINESS'::VARCHAR AS ACCOUNT_TYPE_FLAG,
       NULL::TIMESTAMP_LTZ AS BIRTHDATE, NULL::NUMBER AS ANNUAL_INCOME, NULL::NUMBER AS CREDIT_SCORE,
       'Technology'::VARCHAR AS INDUSTRY, 900000::NUMBER AS ANNUAL_REVENUE, 6::NUMBER AS EMPLOYEE_COUNT,
       '94107'::VARCHAR AS POSTAL_CODE, 'CA'::VARCHAR AS STATE_CODE, 'US'::VARCHAR AS COUNTRY_CODE,
       'HARMONIC-FIX-001'::VARCHAR AS EXTERNAL_ID
-- Older duplicate snapshot of IN-01: the SP must keep one anchor per account.
UNION ALL SELECT 'JDO', 'HARMONIC-FIX-IN-01', 'Brightloop Labs (old)', '2026-01-15'::DATE, 'Small Business', 'BUSINESS', NULL, NULL, NULL, 'Technology', 800000, 5, '94107', 'CA', 'US', 'HARMONIC-FIX-001'
UNION ALL SELECT 'JDO', 'HARMONIC-FIX-IN-02', 'Carewell Clinics',      '2026-10-28'::DATE, 'Commercial Banking', 'BUSINESS', NULL, NULL, NULL, 'Healthcare',            4200000,   30, '02115', 'MA', 'US', 'HARMONIC-FIX-002'
UNION ALL SELECT 'JDO', 'HARMONIC-FIX-IN-03', 'Northstack Software',   '2026-10-28'::DATE, 'Commercial Banking', 'BUSINESS', NULL, NULL, NULL, 'Technology',           18000000,  120, '78701', 'TX', 'US', 'HARMONIC-FIX-003'
UNION ALL SELECT 'JDO', 'HARMONIC-FIX-IN-04', 'Quantive Systems',      '2026-10-28'::DATE, 'Commercial Banking', 'BUSINESS', NULL, NULL, NULL, 'Technology',           65000000,  450, '98101', 'WA', 'US', 'HARMONIC-FIX-004'
UNION ALL SELECT 'JDO', 'HARMONIC-FIX-IN-05', 'Ridgeline Builders',    '2026-10-28'::DATE, NULL,                 'BUSINESS', NULL, NULL, NULL, 'Construction',          3100000,   25, '80202', 'CO', 'US', 'HARMONIC-FIX-005'
UNION ALL SELECT 'JDO', 'HARMONIC-FIX-IN-06', 'Meridian Advisory',     '2026-10-28'::DATE, 'Commercial Banking', 'BUSINESS', NULL, NULL, NULL, 'Professional Services', 240000000, 2200, '10017', 'NY', 'US', 'HARMONIC-FIX-006'
UNION ALL SELECT 'JDO', 'HARMONIC-FIX-X1',    'Oldfield Supply',       '2026-10-28'::DATE, 'Small Business',     'BUSINESS', NULL, NULL, NULL, 'Wholesale',             5000000,   40, '60601', 'IL', 'US', 'HARMONIC-FIX-007'
UNION ALL SELECT 'JDO', 'HARMONIC-FIX-X2',    'Legacy Freight',        '2026-10-28'::DATE, 'Commercial Banking', 'BUSINESS', NULL, NULL, NULL, 'Transportation',       30000000,  300, '30301', 'GA', 'US', 'HARMONIC-FIX-008'
UNION ALL SELECT 'JDO', 'HARMONIC-FIX-X3',    'Listed Robotics',       '2026-10-28'::DATE, 'Commercial Banking', 'BUSINESS', NULL, NULL, NULL, 'Technology',           90000000,  600, '94043', 'CA', 'US', 'HARMONIC-FIX-009'
UNION ALL SELECT 'JDO', 'HARMONIC-FIX-X4',    'Family Office Trust',   '2026-10-28'::DATE, 'Household',          'BUSINESS', NULL, NULL, NULL, 'Finance',               1000000,    3, '33101', 'FL', 'US', 'HARMONIC-FIX-010'
UNION ALL SELECT 'JDO', 'HARMONIC-FIX-X5',    'Jamie Ortiz',           '2026-10-28'::DATE, 'Retail',             'PERSON',   '1988-04-02'::TIMESTAMP_LTZ, 85000, 720, NULL, NULL, NULL, '85001', 'AZ', 'US', 'HARMONIC-FIX-011';

-- ---------------------------------------------------------------------------
-- 3. ZoomInfo fixture: only the columns the SP reads. Months M-6..M.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE TABLE DATA_JEDAIS.FINS__PUBLIC.ZOOMINFO_FIRMOGRAPHICS_HFIX (
    ACCOUNT_ID VARCHAR, PROFILE_MONTH DATE, EMPLOYEE_BAND VARCHAR, FOUNDED_YEAR NUMBER);

INSERT INTO DATA_JEDAIS.FINS__PUBLIC.ZOOMINFO_FIRMOGRAPHICS_HFIX
SELECT b.ACCOUNT_ID, DATEADD(MONTH, -g.n, $m_cur::DATE), b.EMPLOYEE_BAND, b.FOUNDED_YEAR
FROM (SELECT * FROM VALUES
        ('HARMONIC-FIX-IN-01', '1-10',      2019),
        ('HARMONIC-FIX-IN-02', '11-50',     2015),
        ('HARMONIC-FIX-IN-03', '51-200',    2016),
        ('HARMONIC-FIX-IN-04', '201-1000',  2013),
        ('HARMONIC-FIX-IN-05', '11-50',     2011),
        ('HARMONIC-FIX-IN-06', '1001-5000', 2010),
        ('HARMONIC-FIX-X1',    '11-50',     2008),
        ('HARMONIC-FIX-X2',    '201-1000',  2008),
        ('HARMONIC-FIX-X3',    '201-1000',  2014),
        ('HARMONIC-FIX-X4',    '1-10',      2015),
        ('HARMONIC-FIX-X5',    '1-10',      2015)
      AS v(ACCOUNT_ID, EMPLOYEE_BAND, FOUNDED_YEAR)) b
CROSS JOIN (SELECT ROW_NUMBER() OVER (ORDER BY SEQ4()) - 1 AS n
            FROM TABLE(GENERATOR(ROWCOUNT => 7))) g;

-- Duplicate (ACCOUNT_ID, PROFILE_MONTH) row, as seen live for 2026-10.
INSERT INTO DATA_JEDAIS.FINS__PUBLIC.ZOOMINFO_FIRMOGRAPHICS_HFIX
VALUES ('HARMONIC-FIX-IN-02', DATEADD(MONTH, -1, $m_cur::DATE), '11-50', 2015);

-- ---------------------------------------------------------------------------
-- 4. Moody's fixture: latest LIQUIDITY_TIER decides. X3's latest is Tier 2.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE TABLE DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_HFIX (
    ACCOUNT_ID VARCHAR, PROFILE_DATE DATE, LIQUIDITY_TIER VARCHAR);

INSERT INTO DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_HFIX
SELECT ACCOUNT_ID, '2026-01-02'::DATE, 'Illiquid'
FROM DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS_HARMONIC_FIXTURE
GROUP BY ACCOUNT_ID;

INSERT INTO DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_HFIX
VALUES ('HARMONIC-FIX-X3', '2026-06-30'::DATE, 'Tier 2'),
       ('HARMONIC-FIX-IN-03', '2026-06-30'::DATE, 'Illiquid');

-- ---------------------------------------------------------------------------
-- 5. Target table (real DDL, so the MERGE casts are tested against real
--    column types) and the clone of the deployed SP.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE TABLE DATA_JEDAIS.FINS__PUBLIC.HARMONIC_COMPANY_SIGNALS_FIXTURE
    LIKE DATA_JEDAIS.FINS__PUBLIC.HARMONIC_COMPANY_SIGNALS;

EXECUTE IMMEDIATE $$
DECLARE
    sp_ddl STRING;
BEGIN
    sp_ddl := (SELECT GET_DDL('PROCEDURE', 'DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_HARMONIC_COMPANY_SIGNALS(NUMBER)'));
    -- Stash the suffix-bearing identifiers behind sentinels first.
    sp_ddl := REPLACE(sp_ddl, 'HARMONIC_COMPANY_SIGNALS_STAGING',        '__H_STG__');
    sp_ddl := REPLACE(sp_ddl, 'SP_GENERATE_HARMONIC_COMPANY_SIGNALS',    '__H_SP__');
    sp_ddl := REPLACE(sp_ddl, 'TASK_MONTHLY_HARMONIC_COMPANY_SIGNALS',   '__H_TASK__');
    sp_ddl := REPLACE(sp_ddl, 'HARMONIC_COMPANY_SIGNALS',                'HARMONIC_COMPANY_SIGNALS_FIXTURE');
    sp_ddl := REPLACE(sp_ddl, '__H_STG__',  'HARMONIC_COMPANY_SIGNALS_FIXTURE_STAGING');
    sp_ddl := REPLACE(sp_ddl, '__H_SP__',   'SP_GENERATE_HARMONIC_COMPANY_SIGNALS_FIXTURE');
    sp_ddl := REPLACE(sp_ddl, '__H_TASK__', 'TASK_MONTHLY_HARMONIC_COMPANY_SIGNALS_FIXTURE');
    -- Dependencies: FQN-qualified swaps only, so TASK_MONTHLY_ZOOMINFO_FIRMOGRAPHICS
    -- (named in the error message) is left alone.
    sp_ddl := REPLACE(sp_ddl, 'DATA_JEDAIS.FINS__PUBLIC.ZOOMINFO_FIRMOGRAPHICS', 'DATA_JEDAIS.FINS__PUBLIC.ZOOMINFO_FIRMOGRAPHICS_HFIX');
    sp_ddl := REPLACE(sp_ddl, 'DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT',  'DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_HFIX');
    sp_ddl := REPLACE(sp_ddl, 'DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS',      'DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS_HARMONIC_FIXTURE');
    EXECUTE IMMEDIATE :sp_ddl;
    RETURN 'fixture SP staged';
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Backfill run: M-6..M.
-- ---------------------------------------------------------------------------
CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_HARMONIC_COMPANY_SIGNALS_FIXTURE(6);

-- A1: 7 months x 6 accounts = 42 rows; distinct accounts = audience size.
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.HARMONIC_COMPANY_SIGNALS_FIXTURE) = 42
    AND (SELECT COUNT(DISTINCT PROFILE_MONTH) FROM DATA_JEDAIS.FINS__PUBLIC.HARMONIC_COMPANY_SIGNALS_FIXTURE) = 7
    AND (SELECT MIN(PROFILE_MONTH) FROM DATA_JEDAIS.FINS__PUBLIC.HARMONIC_COMPANY_SIGNALS_FIXTURE) = DATEADD(MONTH, -6, $m_cur::DATE)
    AND (SELECT MAX(PROFILE_MONTH) FROM DATA_JEDAIS.FINS__PUBLIC.HARMONIC_COMPANY_SIGNALS_FIXTURE) = $m_cur::DATE
    AND (SELECT COUNT(DISTINCT ACCOUNT_ID) FROM DATA_JEDAIS.FINS__PUBLIC.HARMONIC_COMPANY_SIGNALS_FIXTURE) = 6
    AS a1_backfill_42_rows_7_months_6_accounts;

-- A2: per month, distinct accounts equal the plan section 2 audience (run
-- against the fixtures), and no excluded anchor leaks in.
SELECT
    (SELECT COUNT(*) FROM (
        SELECT h.PROFILE_MONTH, COUNT(DISTINCT h.ACCOUNT_ID) AS n
        FROM DATA_JEDAIS.FINS__PUBLIC.HARMONIC_COMPANY_SIGNALS_FIXTURE h
        GROUP BY h.PROFILE_MONTH
        HAVING n <> (
            SELECT COUNT(DISTINCT a.ACCOUNT_ID)
            FROM DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS_HARMONIC_FIXTURE a
            JOIN DATA_JEDAIS.FINS__PUBLIC.ZOOMINFO_FIRMOGRAPHICS_HFIX z
              ON z.ACCOUNT_ID = a.ACCOUNT_ID AND z.PROFILE_MONTH = h.PROFILE_MONTH
            JOIN (SELECT ACCOUNT_ID, LIQUIDITY_TIER FROM DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_HFIX
                  QUALIFY ROW_NUMBER() OVER (PARTITION BY ACCOUNT_ID ORDER BY PROFILE_DATE DESC) = 1) m
              ON m.ACCOUNT_ID = a.ACCOUNT_ID
            WHERE a.ACCOUNT_TYPE_FLAG = 'BUSINESS'
              AND COALESCE(a.CLIENT_CATEGORY, '') <> 'Household'
              AND m.LIQUIDITY_TIER = 'Illiquid'
              AND z.FOUNDED_YEAR >= 2010))) = 0
    AND (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.HARMONIC_COMPANY_SIGNALS_FIXTURE
          WHERE ACCOUNT_ID LIKE 'HARMONIC-FIX-X%') = 0
    AND (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.HARMONIC_COMPANY_SIGNALS_FIXTURE
          WHERE ACCOUNT_ID = 'HARMONIC-FIX-IN-05') = 7
    AS a2_coverage_matches_section_2_audience;

-- A3: funding monotonicity (plan L2 SQL): 0 violations.
SELECT COUNT(*) = 0 AS a3_funding_monotone
FROM (
    SELECT ACCOUNT_ID, PROFILE_MONTH, TOTAL_RAISED_USD, FUNDING_ROUNDS_COUNT,
           LAG(TOTAL_RAISED_USD)     OVER (PARTITION BY ORG_ID, ACCOUNT_ID ORDER BY PROFILE_MONTH) AS prev_total,
           LAG(FUNDING_ROUNDS_COUNT) OVER (PARTITION BY ORG_ID, ACCOUNT_ID ORDER BY PROFILE_MONTH) AS prev_rounds
    FROM DATA_JEDAIS.FINS__PUBLIC.HARMONIC_COMPANY_SIGNALS_FIXTURE)
WHERE TOTAL_RAISED_USD < prev_total OR FUNDING_ROUNDS_COUNT < prev_rounds;

-- A4: as-of-month funding coherence.
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.HARMONIC_COMPANY_SIGNALS_FIXTURE
      WHERE LAST_FUNDING_DATE > LAST_DAY(PROFILE_MONTH)
         OR LAST_ROUND_USD > TOTAL_RAISED_USD
         OR (RECENTLY_FUNDED_FLAG AND LAST_FUNDING_DATE < DATEADD(DAY, -90, PROFILE_MONTH))) = 0
    AS a4_funding_dates_as_of_month;

-- A5: NULLable consistency: Bootstrapped iff every funding column is NULL / 0.
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.HARMONIC_COMPANY_SIGNALS_FIXTURE
      WHERE (FUNDING_STATUS = 'Bootstrapped') <> (LAST_FUNDING_STAGE IS NULL)
         OR (FUNDING_STATUS = 'Bootstrapped') <> (LAST_FUNDING_DATE IS NULL)
         OR (FUNDING_STATUS = 'Bootstrapped') <> (LAST_ROUND_USD IS NULL)
         OR (FUNDING_STATUS = 'Bootstrapped') <> (LEAD_INVESTOR IS NULL)
         OR (FUNDING_STATUS = 'Bootstrapped') <> (EST_VALUATION_USD IS NULL)
         OR (FUNDING_STATUS = 'Bootstrapped' AND (TOTAL_RAISED_USD <> 0 OR FUNDING_ROUNDS_COUNT <> 0 OR RECENTLY_FUNDED_FLAG))
         OR (FUNDING_STATUS NOT IN ('Angel-Seed', 'Venture-Backed') AND EST_RUNWAY_MONTHS IS NOT NULL)
         OR EST_RUNWAY_MONTHS NOT BETWEEN 0 AND 60) = 0
    AS a5_nullables_consistent;

-- A6: vocabularies and ranges.
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.HARMONIC_COMPANY_SIGNALS_FIXTURE
      WHERE FUNDING_STATUS NOT IN ('Bootstrapped', 'Angel-Seed', 'Venture-Backed', 'PE-Backed')
         OR POSTINGS_TREND NOT IN ('Accelerating', 'Steady', 'Slowing', 'Frozen')
         OR TRACTION_SCORE NOT BETWEEN 0 AND 100
         OR HEADCOUNT_GROWTH_6M_PCT NOT BETWEEN -60 AND 300
         OR ENG_HEADCOUNT_PCT + SALES_HEADCOUNT_PCT + OPS_HEADCOUNT_PCT > 98
         OR OPEN_JOB_POSTINGS < 0) = 0
    AS a6_vocab_and_ranges;

-- A7: HEADCOUNT inside the same-month ZoomInfo EMPLOYEE_BAND.
SELECT COUNT(*) = 0 AS a7_headcount_inside_zoominfo_band
FROM DATA_JEDAIS.FINS__PUBLIC.HARMONIC_COMPANY_SIGNALS_FIXTURE h
JOIN (SELECT DISTINCT ACCOUNT_ID, PROFILE_MONTH, EMPLOYEE_BAND
      FROM DATA_JEDAIS.FINS__PUBLIC.ZOOMINFO_FIRMOGRAPHICS_HFIX) z
  ON z.ACCOUNT_ID = h.ACCOUNT_ID AND z.PROFILE_MONTH = h.PROFILE_MONTH
WHERE h.HEADCOUNT < TO_NUMBER(SPLIT_PART(REPLACE(z.EMPLOYEE_BAND, '+', '-'), '-', 1))
   OR (z.EMPLOYEE_BAND NOT LIKE '%+'
       AND h.HEADCOUNT > TO_NUMBER(SPLIT_PART(z.EMPLOYEE_BAND, '-', 2)));

-- A8: RECORD_ID is the SQL form of record_id_for(ORG_ID, ACCOUNT_ID, PROFILE_MONTH).
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.HARMONIC_COMPANY_SIGNALS_FIXTURE
      WHERE RECORD_ID <> REGEXP_REPLACE(
                LEFT(SHA2(CONCAT_WS('|', ORG_ID, ACCOUNT_ID, PROFILE_MONTH::VARCHAR, 'record_id'), 256), 32),
                '(.{8})(.{4})(.{4})(.{4})(.{12})', '\\1-\\2-\\3-\\4-\\5')) = 0
    AND (SELECT COUNT(DISTINCT RECORD_ID) FROM DATA_JEDAIS.FINS__PUBLIC.HARMONIC_COMPANY_SIGNALS_FIXTURE) = 42
    AS a8_record_id_deterministic;

-- A9: month-bucketed timestamps (the ns NUMBER casts in the MERGE).
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.HARMONIC_COMPANY_SIGNALS_FIXTURE
      WHERE GENERATED_AT <> PROFILE_MONTH::TIMESTAMP_NTZ
         OR DATE_TRUNC('MONTH', PROFILE_MONTH) <> PROFILE_MONTH
         OR LAST_DATA_REFRESH_DATE NOT BETWEEN PROFILE_MONTH AND DATEADD(DAY, 27, PROFILE_MONTH)) = 0
    AS a9_dates_month_bucketed;

-- ---------------------------------------------------------------------------
-- 7. Idempotency: re-running the backfill and the TASK form changes nothing.
-- ---------------------------------------------------------------------------
SET hash_before = (SELECT HASH_AGG(*) FROM DATA_JEDAIS.FINS__PUBLIC.HARMONIC_COMPANY_SIGNALS_FIXTURE);

CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_HARMONIC_COMPANY_SIGNALS_FIXTURE(6);
SELECT (SELECT HASH_AGG(*) FROM DATA_JEDAIS.FINS__PUBLIC.HARMONIC_COMPANY_SIGNALS_FIXTURE) = $hash_before
       AND (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.HARMONIC_COMPANY_SIGNALS_FIXTURE) = 42
    AS a10_backfill_rerun_idempotent;

CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_HARMONIC_COMPANY_SIGNALS_FIXTURE();
SELECT (SELECT HASH_AGG(*) FROM DATA_JEDAIS.FINS__PUBLIC.HARMONIC_COMPANY_SIGNALS_FIXTURE) = $hash_before
    AS a11_task_form_rerun_idempotent;

-- ---------------------------------------------------------------------------
-- 8. Backfill month M equals a standalone month-M run (excluding GENERATED_AT).
-- ---------------------------------------------------------------------------
SET hash_m_backfill = (
    SELECT HASH_AGG(ORG_ID, RECORD_ID, ACCOUNT_ID, PROFILE_MONTH, FUNDING_STATUS, LAST_FUNDING_STAGE,
                    LAST_FUNDING_DATE, LAST_ROUND_USD, TOTAL_RAISED_USD, FUNDING_ROUNDS_COUNT,
                    LEAD_INVESTOR, EST_VALUATION_USD, EST_RUNWAY_MONTHS, RECENTLY_FUNDED_FLAG,
                    HEADCOUNT, HEADCOUNT_GROWTH_6M_PCT, TRACTION_SCORE, ENG_HEADCOUNT_PCT,
                    SALES_HEADCOUNT_PCT, OPS_HEADCOUNT_PCT, OPEN_JOB_POSTINGS, POSTINGS_TREND,
                    LAST_DATA_REFRESH_DATE)
    FROM DATA_JEDAIS.FINS__PUBLIC.HARMONIC_COMPANY_SIGNALS_FIXTURE WHERE PROFILE_MONTH = $m_cur::DATE);

DELETE FROM DATA_JEDAIS.FINS__PUBLIC.HARMONIC_COMPANY_SIGNALS_FIXTURE WHERE PROFILE_MONTH = $m_cur::DATE;
CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_HARMONIC_COMPANY_SIGNALS_FIXTURE();

SELECT (SELECT HASH_AGG(ORG_ID, RECORD_ID, ACCOUNT_ID, PROFILE_MONTH, FUNDING_STATUS, LAST_FUNDING_STAGE,
                        LAST_FUNDING_DATE, LAST_ROUND_USD, TOTAL_RAISED_USD, FUNDING_ROUNDS_COUNT,
                        LEAD_INVESTOR, EST_VALUATION_USD, EST_RUNWAY_MONTHS, RECENTLY_FUNDED_FLAG,
                        HEADCOUNT, HEADCOUNT_GROWTH_6M_PCT, TRACTION_SCORE, ENG_HEADCOUNT_PCT,
                        SALES_HEADCOUNT_PCT, OPS_HEADCOUNT_PCT, OPEN_JOB_POSTINGS, POSTINGS_TREND,
                        LAST_DATA_REFRESH_DATE)
        FROM DATA_JEDAIS.FINS__PUBLIC.HARMONIC_COMPANY_SIGNALS_FIXTURE WHERE PROFILE_MONTH = $m_cur::DATE)
       = $hash_m_backfill
       AND (SELECT HASH_AGG(*) FROM DATA_JEDAIS.FINS__PUBLIC.HARMONIC_COMPANY_SIGNALS_FIXTURE) = $hash_before
    AS a12_backfill_month_equals_standalone_run;

-- ---------------------------------------------------------------------------
-- 9. Negative tests. Each CALL must raise and must not change the table.
-- ---------------------------------------------------------------------------

-- N1: BACKFILL_MONTHS = 7 needs ZoomInfo M-7, which the fixture lacks.
EXECUTE IMMEDIATE $$
BEGIN
    CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_HARMONIC_COMPANY_SIGNALS_FIXTURE(7);
    RETURN 'NO_RAISE';
EXCEPTION WHEN OTHER THEN
    RETURN 'RAISED: ' || SQLERRM;
END;
$$;
SELECT $1 LIKE 'RAISED:%ZOOMINFO_FIRMOGRAPHICS_HFIX has no rows for PROFILE_MONTH%'
       AND $1 LIKE '%' || DATEADD(MONTH, -7, $m_cur::DATE)::VARCHAR || '%'
    AS n1_backfill_beyond_zoominfo_history_raises
FROM TABLE(RESULT_SCAN(LAST_QUERY_ID()));

-- N2: drop the ZoomInfo fixture's current-month rows: the SP must raise.
DELETE FROM DATA_JEDAIS.FINS__PUBLIC.ZOOMINFO_FIRMOGRAPHICS_HFIX WHERE PROFILE_MONTH = $m_cur::DATE;
EXECUTE IMMEDIATE $$
BEGIN
    CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_HARMONIC_COMPANY_SIGNALS_FIXTURE();
    RETURN 'NO_RAISE';
EXCEPTION WHEN OTHER THEN
    RETURN 'RAISED: ' || SQLERRM;
END;
$$;
SELECT $1 LIKE 'RAISED:%ZOOMINFO_FIRMOGRAPHICS_HFIX has no rows for PROFILE_MONTH%'
       AND $1 LIKE '%' || $m_cur::DATE::VARCHAR || '%'
       AND $1 LIKE '%TASK_MONTHLY_ZOOMINFO_FIRMOGRAPHICS has not run%'
    AS n2_missing_zoominfo_current_month_raises
FROM TABLE(RESULT_SCAN(LAST_QUERY_ID()));

-- N3: Moody's dependency table missing.
DROP TABLE DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_HFIX;
EXECUTE IMMEDIATE $$
BEGIN
    CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_HARMONIC_COMPANY_SIGNALS_FIXTURE();
    RETURN 'NO_RAISE';
EXCEPTION WHEN OTHER THEN
    RETURN 'RAISED: ' || SQLERRM;
END;
$$;
SELECT $1 LIKE 'RAISED:%hard dependency missing: DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_HFIX%'
    AS n3_missing_moodys_table_raises
FROM TABLE(RESULT_SCAN(LAST_QUERY_ID()));

-- N4: out-of-range BACKFILL_MONTHS.
EXECUTE IMMEDIATE $$
BEGIN
    CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_HARMONIC_COMPANY_SIGNALS_FIXTURE(-1);
    RETURN 'NO_RAISE';
EXCEPTION WHEN OTHER THEN
    RETURN 'RAISED: ' || SQLERRM;
END;
$$;
SELECT $1 LIKE 'RAISED:%BACKFILL_MONTHS must be in [0, 36]%' AS n4_negative_backfill_raises
FROM TABLE(RESULT_SCAN(LAST_QUERY_ID()));

-- N5: none of the failed runs wrote anything.
SELECT (SELECT HASH_AGG(*) FROM DATA_JEDAIS.FINS__PUBLIC.HARMONIC_COMPANY_SIGNALS_FIXTURE) = $hash_before
    AS n5_failed_runs_wrote_nothing;

-- ---------------------------------------------------------------------------
-- 10. TASK_EXECUTION_LOG: 4 SUCCEEDED (6, 6, (), ()) and 4 FAILED runs.
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG
      WHERE TASK_NAME = 'TASK_MONTHLY_HARMONIC_COMPANY_SIGNALS_FIXTURE' AND STATUS = 'SUCCEEDED') = 4
    AND (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG
      WHERE TASK_NAME = 'TASK_MONTHLY_HARMONIC_COMPANY_SIGNALS_FIXTURE' AND STATUS = 'FAILED'
        AND ERROR_MESSAGE IS NOT NULL) = 4
    AND (SELECT MAX(ROWS_INSERTED) FROM DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG
      WHERE TASK_NAME = 'TASK_MONTHLY_HARMONIC_COMPANY_SIGNALS_FIXTURE' AND STATUS = 'SUCCEEDED') = 42
    AS a13_execution_log_rows;

-- ---------------------------------------------------------------------------
-- 11. Cleanup.
-- ---------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_HARMONIC_COMPANY_SIGNALS_FIXTURE(NUMBER);
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.HARMONIC_COMPANY_SIGNALS_FIXTURE_STAGING;
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.HARMONIC_COMPANY_SIGNALS_FIXTURE;
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.ZOOMINFO_FIRMOGRAPHICS_HFIX;
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.MOODYS_MARKET_CONTEXT_HFIX;
DROP VIEW      IF EXISTS DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS_HARMONIC_FIXTURE;
DELETE FROM DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG
 WHERE TASK_NAME = 'TASK_MONTHLY_HARMONIC_COMPANY_SIGNALS_FIXTURE';
