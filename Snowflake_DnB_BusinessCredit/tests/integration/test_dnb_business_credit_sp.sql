-- =============================================================================
-- L2 integration test for SP_GENERATE_DNB_BUSINESS_CREDIT
-- =============================================================================
-- Plan:    docs/superpowers/plans/2026-05-28-cumulus-plan-3-dnb-business-credit.md
-- Run:     snow sql -c SFDC_DC_TECH_ARCH_jwt --role ACCOUNTADMIN -f tests/integration/test_dnb_business_credit_sp.sql
--          (ACCOUNTADMIN: the cloned SP is EXECUTE AS OWNER and write_pandas
--          creates its staging table, which needs CREATE TABLE.)
-- Pass:    Every assertion column returns TRUE. Any FALSE = test failure.
--
-- Strategy:
--   Clone the deployed SP into SP_GENERATE_DNB_BUSINESS_CREDIT_FIXTURE via
--   GET_DDL + REPLACE, redirecting the dataset table, staging table, task-log
--   name and V_ACCOUNT_ANCHORS to fixture-scoped names, then CALL it against
--   a 14-anchor fixture view (12 BUSINESS + 2 PERSON). Self-contained: the
--   old FINS.TEST schema no longer exists in this org.
--   DNB_BUSINESS_CREDIT is a stem of the SP, task and staging names, so those
--   are parked behind sentinels first and expanded after the table swap.
--   Before the first CALL the script asserts that no live write target
--   (DNB_BUSINESS_CREDIT table, its _STAGING table) survives in the cloned DDL.
--
-- What it covers:
--   - Audience (ACCOUNT_TYPE_FLAG = 'BUSINESS'): 12 business anchors emit one
--     row each; the 2 PERSON anchors do not leak.
--   - ORG_ID is stamped from the anchor on every row.
--   - Output shape: 15 NOT NULL columns populated (ULTIMATE_PARENT_DUNS is the
--     only nullable contract column besides ORG_ID/MATCH_CONFIDENCE_CODE, which
--     are populated for new runs), PROFILE_MONTH = first of current month.
--   - Invariants: DNB_RATING = tier || composite; ULTIMATE_PARENT_DUNS NULL iff
--     CORPORATE_FAMILY_SIZE = 1; DUNS unique; MATCH_CONFIDENCE_CODE 1-10 and
--     VERIFICATION_STATUS consistent with its 8/5 cut-offs; SUPPLIER_RISK_LEVEL
--     vocabulary.
--   - Industry bias: heavy-payment industries have a lower mean PAYDEX than
--     clean ones (Finance/Healthcare/Tech).
--   - Idempotency and determinism across same-month re-runs; a backfill CALL
--     for a month with no rows adds nothing.
--
-- Pre-requisites:
--   SP_GENERATE_DNB_BUSINESS_CREDIT deployed (python3 scripts/deploy_sp.py).
-- Side effects:
--   Fixture runs log to TASK_EXECUTION_LOG as TASK_MONTHLY_DNB_BUSINESS_CREDIT_FIXTURE;
--   the cleanup step deletes those rows. No live table is written.
-- =============================================================================

USE SCHEMA DATA_JEDAIS.FINS__PUBLIC;

-- 1. Drop leftovers from a prior failed run.
DROP PROCEDURE IF EXISTS DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_DNB_BUSINESS_CREDIT_FIXTURE(DATE);
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.DNB_BUSINESS_CREDIT_FIXTURE_STAGING;
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.DNB_BUSINESS_CREDIT_FIXTURE;
DROP VIEW      IF EXISTS DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS_DNB_FIXTURE;
DELETE FROM DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG WHERE TASK_NAME = 'TASK_MONTHLY_DNB_BUSINESS_CREDIT_FIXTURE';

-- ---------------------------------------------------------------------------
-- 2. Fixture audience view in the live V_ACCOUNT_ANCHORS column order:
--    12 BUSINESS anchors (DNB-FIX-B-01..12) + 2 PERSON anchors.
--    Coverage: 11 industries incl. Construction/Retail/Food & Beverage (heavy)
--    and Finance/Healthcare/Tech (clean); revenue bands <$1M, $1M-$100M, >=$100M;
--    Small Business + Commercial Banking. The SP has no id-prefix predicate and
--    reads no other table, so any ids enter the audience.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS_DNB_FIXTURE AS
SELECT
    'JDO'::VARCHAR             AS ORG_ID,
    'DNB-FIX-B-01'::VARCHAR     AS ACCOUNT_ID,
    'Mariposa Cleaners LLC'::VARCHAR AS ACCOUNT_NAME,
    '2026-05-28'::DATE         AS SNAPSHOT_DATE,
    'Small Business'::VARCHAR     AS CLIENT_CATEGORY,
    'BUSINESS'::VARCHAR        AS ACCOUNT_TYPE_FLAG,
    NULL::TIMESTAMP_LTZ        AS BIRTHDATE,
    NULL::NUMBER               AS ANNUAL_INCOME,
    NULL::NUMBER               AS CREDIT_SCORE,
    'Personal Services'::VARCHAR AS INDUSTRY,
    480000::NUMBER           AS ANNUAL_REVENUE,
    6::NUMBER                AS EMPLOYEE_COUNT,
    '94110'::VARCHAR           AS POSTAL_CODE,
    'CA'::VARCHAR           AS STATE_CODE,
    'US'::VARCHAR              AS COUNTRY_CODE,
    'HYDRATE-B-001'::VARCHAR AS EXTERNAL_ID
UNION ALL SELECT 'JDO', 'DNB-FIX-B-02', 'Pinewood Coffee Co.', '2026-05-28'::DATE, 'Small Business', 'BUSINESS', NULL::TIMESTAMP_LTZ, NULL, NULL, 'Food & Beverage', 1200000, 18, '98101', 'WA', 'US', 'HYDRATE-B-002'
UNION ALL SELECT 'JDO', 'DNB-FIX-B-03', 'Northwood Manufacturing Inc.', '2026-05-28'::DATE, 'Commercial Banking', 'BUSINESS', NULL::TIMESTAMP_LTZ, NULL, NULL, 'Manufacturing', 28000000, 240, '48226', 'MI', 'US', 'HYDRATE-B-003'
UNION ALL SELECT 'JDO', 'DNB-FIX-B-04', 'Granite Energy Partners', '2026-05-28'::DATE, 'Commercial Banking', 'BUSINESS', NULL::TIMESTAMP_LTZ, NULL, NULL, 'Energy', 145000000, 380, '77002', 'TX', 'US', 'HYDRATE-B-004'
UNION ALL SELECT 'JDO', 'DNB-FIX-B-05', 'Atlas Tech Holdings', '2026-05-28'::DATE, 'Commercial Banking', 'BUSINESS', NULL::TIMESTAMP_LTZ, NULL, NULL, 'Tech', 320000000, 1450, '94105', 'CA', 'US', 'HYDRATE-B-005'
UNION ALL SELECT 'JDO', 'DNB-FIX-B-06', 'Heritage Wealth Advisors', '2026-05-28'::DATE, 'Commercial Banking', 'BUSINESS', NULL::TIMESTAMP_LTZ, NULL, NULL, 'Finance', 45000000, 180, '60601', 'IL', 'US', 'HYDRATE-B-006'
UNION ALL SELECT 'JDO', 'DNB-FIX-B-07', 'Cedar Healthcare Group', '2026-05-28'::DATE, 'Commercial Banking', 'BUSINESS', NULL::TIMESTAMP_LTZ, NULL, NULL, 'Healthcare', 88000000, 520, '02115', 'MA', 'US', 'HYDRATE-B-007'
UNION ALL SELECT 'JDO', 'DNB-FIX-B-08', 'Sterling Real Estate Trust', '2026-05-28'::DATE, 'Commercial Banking', 'BUSINESS', NULL::TIMESTAMP_LTZ, NULL, NULL, 'Real Estate', 12000000, 32, '10017', 'NY', 'US', 'HYDRATE-B-008'
UNION ALL SELECT 'JDO', 'DNB-FIX-B-09', 'Riverbend Construction LLC', '2026-05-28'::DATE, 'Small Business', 'BUSINESS', NULL::TIMESTAMP_LTZ, NULL, NULL, 'Construction', 4500000, 38, '85003', 'AZ', 'US', 'HYDRATE-B-009'
UNION ALL SELECT 'JDO', 'DNB-FIX-B-10', 'Maplewood Retail Co.', '2026-05-28'::DATE, 'Small Business', 'BUSINESS', NULL::TIMESTAMP_LTZ, NULL, NULL, 'Retail', 2800000, 24, '30309', 'GA', 'US', 'HYDRATE-B-010'
UNION ALL SELECT 'JDO', 'DNB-FIX-B-11', 'Cobalt Mining Corp', '2026-05-28'::DATE, 'Commercial Banking', 'BUSINESS', NULL::TIMESTAMP_LTZ, NULL, NULL, 'Mining', 220000000, 950, '80205', 'CO', 'US', 'HYDRATE-B-011'
UNION ALL SELECT 'JDO', 'DNB-FIX-B-12', 'Aurora Software Inc.', '2026-05-28'::DATE, 'Small Business', 'BUSINESS', NULL::TIMESTAMP_LTZ, NULL, NULL, 'Software', 750000, 5, '78704', 'TX', 'US', 'HYDRATE-B-012'
UNION ALL SELECT 'JDO', 'DNB-FIX-P-01', 'Avery Stone', '2026-05-28'::DATE, 'Retail', 'PERSON', '2002-03-14'::TIMESTAMP_LTZ, 42000, 680, NULL, NULL, NULL, '94110', 'CA', 'US', 'HYDRATE-001'
UNION ALL SELECT 'JDO', 'DNB-FIX-P-02', 'Quinn Marlowe', '2026-05-28'::DATE, 'Wealth Management', 'PERSON', '1972-04-08'::TIMESTAMP_LTZ, 285000, 770, NULL, NULL, NULL, '94027', 'CA', 'US', 'HYDRATE-004';

-- ---------------------------------------------------------------------------
-- 3. Fixture dataset table.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE TABLE DATA_JEDAIS.FINS__PUBLIC.DNB_BUSINESS_CREDIT_FIXTURE
LIKE DATA_JEDAIS.FINS__PUBLIC.DNB_BUSINESS_CREDIT;

-- ---------------------------------------------------------------------------
-- 4. Clone the SP with FQN swaps (sentinels avoid stem collisions).
-- ---------------------------------------------------------------------------
EXECUTE IMMEDIATE $$
DECLARE
    sp_ddl STRING;
BEGIN
    sp_ddl := (SELECT GET_DDL('PROCEDURE', 'DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_DNB_BUSINESS_CREDIT(DATE)'));
    sp_ddl := REPLACE(sp_ddl, 'DNB_BUSINESS_CREDIT_STAGING',     '__DNB_STG__');
    sp_ddl := REPLACE(sp_ddl, 'SP_GENERATE_DNB_BUSINESS_CREDIT', '__DNB_SP__');
    sp_ddl := REPLACE(sp_ddl, 'TASK_MONTHLY_DNB_BUSINESS_CREDIT','__DNB_TASK__');
    sp_ddl := REPLACE(sp_ddl, 'DNB_BUSINESS_CREDIT',             'DNB_BUSINESS_CREDIT_FIXTURE');
    sp_ddl := REPLACE(sp_ddl, '__DNB_STG__',                     'DNB_BUSINESS_CREDIT_FIXTURE_STAGING');
    sp_ddl := REPLACE(sp_ddl, '__DNB_SP__',                      'SP_GENERATE_DNB_BUSINESS_CREDIT_FIXTURE');
    sp_ddl := REPLACE(sp_ddl, '__DNB_TASK__',                    'TASK_MONTHLY_DNB_BUSINESS_CREDIT_FIXTURE');
    sp_ddl := REPLACE(sp_ddl, 'V_ACCOUNT_ANCHORS',               'V_ACCOUNT_ANCHORS_DNB_FIXTURE');
    -- Safety gate: abort before creating the clone if any live write target survives.
    -- (Snowflake regex has no lookahead: compare total occurrences to fixture-suffixed ones.)
    IF ((LENGTH(sp_ddl) - LENGTH(REPLACE(sp_ddl, 'DNB_BUSINESS_CREDIT', '')))
          <> (LENGTH(sp_ddl) - LENGTH(REPLACE(sp_ddl, 'DNB_BUSINESS_CREDIT_FIXTURE', ''))) * 19 / 27
        OR (LENGTH(sp_ddl) - LENGTH(REPLACE(sp_ddl, 'V_ACCOUNT_ANCHORS', '')))
          <> (LENGTH(sp_ddl) - LENGTH(REPLACE(sp_ddl, 'V_ACCOUNT_ANCHORS_DNB_FIXTURE', ''))) * 17 / 29) THEN
        RETURN 'ABORT: live identifier survived REPLACE';
    END IF;
    EXECUTE IMMEDIATE :sp_ddl;
    RETURN 'fixture SP staged';
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. First run (no argument: current month, full audience).
-- ---------------------------------------------------------------------------
CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_DNB_BUSINESS_CREDIT_FIXTURE();

-- 6. Fixture SP definition contains no live write target (belt and braces).
WITH d AS (SELECT GET_DDL('PROCEDURE', 'DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_DNB_BUSINESS_CREDIT_FIXTURE(DATE)') AS ddl)
SELECT
    (LENGTH(ddl) - LENGTH(REPLACE(ddl, 'DNB_BUSINESS_CREDIT', '')))
      = (LENGTH(ddl) - LENGTH(REPLACE(ddl, 'DNB_BUSINESS_CREDIT_FIXTURE', ''))) * 19 / 27
    AND (LENGTH(ddl) - LENGTH(REPLACE(ddl, 'V_ACCOUNT_ANCHORS', '')))
      = (LENGTH(ddl) - LENGTH(REPLACE(ddl, 'V_ACCOUNT_ANCHORS_DNB_FIXTURE', ''))) * 17 / 29
    AND REGEXP_COUNT(ddl, 'DNB_BUSINESS_CREDIT') >= 4
    AS no_live_target_survives
FROM d;
-- Expected: TRUE

-- 7. Coverage: one row per BUSINESS anchor (12), nothing else.
SELECT
    (SELECT COUNT(DISTINCT ACCOUNT_ID) FROM DATA_JEDAIS.FINS__PUBLIC.DNB_BUSINESS_CREDIT_FIXTURE) = 12
    AND (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.DNB_BUSINESS_CREDIT_FIXTURE) = 12
    AND (SELECT COUNT(DISTINCT ACCOUNT_ID) FROM DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS_DNB_FIXTURE
         WHERE ACCOUNT_TYPE_FLAG = 'BUSINESS') = 12
    AS coverage_assertion_passes;
-- Expected: TRUE

-- 8. Audience filter: PERSON anchors must not leak.
SELECT NOT EXISTS (
    SELECT 1 FROM DATA_JEDAIS.FINS__PUBLIC.DNB_BUSINESS_CREDIT_FIXTURE WHERE ACCOUNT_ID LIKE 'DNB-FIX-P-%'
) AS audience_filter_passes;
-- Expected: TRUE

-- 9. ORG_ID stamped from the anchor on every row.
SELECT NOT EXISTS (
    SELECT 1 FROM DATA_JEDAIS.FINS__PUBLIC.DNB_BUSINESS_CREDIT_FIXTURE WHERE ORG_ID IS NULL OR ORG_ID <> 'JDO'
) AS org_id_stamped;
-- Expected: TRUE

-- 10. Output shape: all required columns populated; PROFILE_MONTH/GENERATED_AT
--     are the first of the current month.
SELECT NOT EXISTS (
    SELECT 1 FROM DATA_JEDAIS.FINS__PUBLIC.DNB_BUSINESS_CREDIT_FIXTURE
    WHERE ACCOUNT_ID IS NULL OR PROFILE_MONTH IS NULL OR DUNS_NUMBER IS NULL
       OR DNB_RATING IS NULL OR FINANCIAL_STRENGTH_TIER IS NULL
       OR COMPOSITE_RISK_SCORE IS NULL OR PAYDEX_SCORE IS NULL
       OR AVERAGE_DAYS_BEYOND_TERMS IS NULL OR FAILURE_RISK_SCORE IS NULL
       OR DELINQUENCY_PREDICTOR_SCORE IS NULL OR SUPPLIER_RISK_LEVEL IS NULL
       OR CORPORATE_FAMILY_SIZE IS NULL OR VERIFICATION_STATUS IS NULL
       OR MATCH_CONFIDENCE_CODE IS NULL OR GENERATED_AT IS NULL
       OR PROFILE_MONTH <> DATE_TRUNC('month', CURRENT_DATE())
       OR GENERATED_AT::DATE <> PROFILE_MONTH
) AS all_columns_populated;
-- Expected: TRUE

-- 11. DUNS: 9 digits, unique across the 12 anchors.
SELECT
    (SELECT COUNT(DISTINCT DUNS_NUMBER) FROM DATA_JEDAIS.FINS__PUBLIC.DNB_BUSINESS_CREDIT_FIXTURE) = 12
    AND NOT EXISTS (SELECT 1 FROM DATA_JEDAIS.FINS__PUBLIC.DNB_BUSINESS_CREDIT_FIXTURE WHERE NOT REGEXP_LIKE(DUNS_NUMBER, '[0-9]{9}'))
    AS duns_uniqueness_passes;
-- Expected: TRUE

-- 12. DNB_RATING = FINANCIAL_STRENGTH_TIER || COMPOSITE_RISK_SCORE, tier in ladder, composite 1-4.
SELECT NOT EXISTS (
    SELECT 1 FROM DATA_JEDAIS.FINS__PUBLIC.DNB_BUSINESS_CREDIT_FIXTURE
    WHERE DNB_RATING <> FINANCIAL_STRENGTH_TIER || COMPOSITE_RISK_SCORE::VARCHAR
       OR FINANCIAL_STRENGTH_TIER NOT IN ('5A','4A','3A','2A','1A','BA','BB','CB','CC','DC','DD')
       OR COMPOSITE_RISK_SCORE NOT BETWEEN 1 AND 4
) AS dnb_rating_composition_invariant;
-- Expected: TRUE

-- 13. ULTIMATE_PARENT_DUNS NULL iff CORPORATE_FAMILY_SIZE = 1.
SELECT NOT EXISTS (
    SELECT 1 FROM DATA_JEDAIS.FINS__PUBLIC.DNB_BUSINESS_CREDIT_FIXTURE
    WHERE (CORPORATE_FAMILY_SIZE = 1 AND ULTIMATE_PARENT_DUNS IS NOT NULL)
       OR (CORPORATE_FAMILY_SIZE > 1 AND ULTIMATE_PARENT_DUNS IS NULL)
) AS ultimate_parent_null_invariant;
-- Expected: TRUE

-- 14. Vocabularies and ranges (v1.6): confidence 1-10 drives VERIFICATION_STATUS
--     (>=8 Verified, 5-7 Probable, else Unverified); SUPPLIER_RISK_LEVEL set;
--     PAYDEX 1-100; days-beyond-terms 0-180; failure/delinquency 1-100.
SELECT NOT EXISTS (
    SELECT 1 FROM DATA_JEDAIS.FINS__PUBLIC.DNB_BUSINESS_CREDIT_FIXTURE
    WHERE MATCH_CONFIDENCE_CODE NOT BETWEEN 1 AND 10
       OR VERIFICATION_STATUS <> CASE WHEN MATCH_CONFIDENCE_CODE >= 8 THEN 'Verified'
                                      WHEN MATCH_CONFIDENCE_CODE >= 5 THEN 'Probable'
                                      ELSE 'Unverified' END
       OR SUPPLIER_RISK_LEVEL NOT IN ('Low','Moderate','High','Severe')
       OR PAYDEX_SCORE NOT BETWEEN 1 AND 100
       OR AVERAGE_DAYS_BEYOND_TERMS NOT BETWEEN 0 AND 180
       OR FAILURE_RISK_SCORE NOT BETWEEN 1 AND 100
       OR DELINQUENCY_PREDICTOR_SCORE NOT BETWEEN 1 AND 100
) AS vocab_and_range_invariants;
-- Expected: TRUE

-- 15. Industry-vs-PAYDEX: heavy-payment industries (Construction, Retail,
--     Food & Beverage) have a lower mean PAYDEX than Finance/Healthcare/Tech.
--     Bases: Finance=88, Healthcare=84, Tech=82 vs Construction=65, Retail=70, F&B=70.
SELECT
    (SELECT AVG(PAYDEX_SCORE) FROM DATA_JEDAIS.FINS__PUBLIC.DNB_BUSINESS_CREDIT_FIXTURE m
     JOIN DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS_DNB_FIXTURE a ON a.ACCOUNT_ID = m.ACCOUNT_ID
     WHERE a.INDUSTRY IN ('Construction', 'Retail', 'Food & Beverage')) <
    (SELECT AVG(PAYDEX_SCORE) FROM DATA_JEDAIS.FINS__PUBLIC.DNB_BUSINESS_CREDIT_FIXTURE m
     JOIN DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS_DNB_FIXTURE a ON a.ACCOUNT_ID = m.ACCOUNT_ID
     WHERE a.INDUSTRY IN ('Finance', 'Healthcare', 'Tech'))
    AS industry_paydex_correlates;
-- Expected: TRUE

-- 16. Task-log row: a SUCCEEDED row under the fixture task name, 12 accounts.
SELECT EXISTS (
    SELECT 1 FROM DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG
    WHERE TASK_NAME = 'TASK_MONTHLY_DNB_BUSINESS_CREDIT_FIXTURE'
      AND STATUS = 'SUCCEEDED' AND ACCOUNTS_PROCESSED = 12
) AS log_row_present;
-- Expected: TRUE

-- 17. Idempotency + determinism: a same-month re-run leaves the row count and
--     the content hash unchanged (GENERATED_AT is bucketed to month-start).
SET row_count_before = (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.DNB_BUSINESS_CREDIT_FIXTURE);
SET hash_before = (SELECT HASH_AGG(ORG_ID, ACCOUNT_ID, PROFILE_MONTH, DUNS_NUMBER, DNB_RATING,
                     FINANCIAL_STRENGTH_TIER, COMPOSITE_RISK_SCORE, PAYDEX_SCORE,
                     AVERAGE_DAYS_BEYOND_TERMS, FAILURE_RISK_SCORE,
                     DELINQUENCY_PREDICTOR_SCORE, SUPPLIER_RISK_LEVEL,
                     CORPORATE_FAMILY_SIZE, ULTIMATE_PARENT_DUNS, VERIFICATION_STATUS,
                     MATCH_CONFIDENCE_CODE, GENERATED_AT)::VARCHAR FROM DATA_JEDAIS.FINS__PUBLIC.DNB_BUSINESS_CREDIT_FIXTURE);
CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_DNB_BUSINESS_CREDIT_FIXTURE();
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.DNB_BUSINESS_CREDIT_FIXTURE) = $row_count_before
    AS idempotency_assertion_passes;
-- Expected: TRUE

SELECT
    (SELECT HASH_AGG(ORG_ID, ACCOUNT_ID, PROFILE_MONTH, DUNS_NUMBER, DNB_RATING,
                     FINANCIAL_STRENGTH_TIER, COMPOSITE_RISK_SCORE, PAYDEX_SCORE,
                     AVERAGE_DAYS_BEYOND_TERMS, FAILURE_RISK_SCORE,
                     DELINQUENCY_PREDICTOR_SCORE, SUPPLIER_RISK_LEVEL,
                     CORPORATE_FAMILY_SIZE, ULTIMATE_PARENT_DUNS, VERIFICATION_STATUS,
                     MATCH_CONFIDENCE_CODE, GENERATED_AT)::VARCHAR
     FROM DATA_JEDAIS.FINS__PUBLIC.DNB_BUSINESS_CREDIT_FIXTURE) = $hash_before
    AS determinism_assertion_passes;
-- Expected: TRUE

-- 18. Backfill: CALL(previous month) only regenerates accounts already present
--     in that month; none are, so the row count is unchanged.
CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_DNB_BUSINESS_CREDIT_FIXTURE(DATEADD(month, -1, DATE_TRUNC('month', CURRENT_DATE())));
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.DNB_BUSINESS_CREDIT_FIXTURE) = $row_count_before
    AND NOT EXISTS (SELECT 1 FROM DATA_JEDAIS.FINS__PUBLIC.DNB_BUSINESS_CREDIT_FIXTURE WHERE PROFILE_MONTH <> DATE_TRUNC('month', CURRENT_DATE()))
    AS backfill_of_empty_month_adds_nothing;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 19. Cleanup
-- ---------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_DNB_BUSINESS_CREDIT_FIXTURE(DATE);
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.DNB_BUSINESS_CREDIT_FIXTURE_STAGING;
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.DNB_BUSINESS_CREDIT_FIXTURE;
DROP VIEW      IF EXISTS DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS_DNB_FIXTURE;
DELETE FROM DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG WHERE TASK_NAME = 'TASK_MONTHLY_DNB_BUSINESS_CREDIT_FIXTURE';
