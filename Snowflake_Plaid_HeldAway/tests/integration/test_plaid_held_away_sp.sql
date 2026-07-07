-- =============================================================================
-- L2 integration test for SP_GENERATE_PLAID_HELD_AWAY
-- =============================================================================
-- Plan:    docs/superpowers/plans/2026-05-28-cumulus-plan-6-plaid-held-away.md
-- Task:    Plan 6 T5
-- Run:     snow sql -f tests/integration/test_plaid_held_away_sp.sql
-- Pass:    Every assertion column returns TRUE. Any FALSE = test failure.
--
-- Strategy:
--   Plan 5's L2 fixture lives in a separate FINS.TEST schema. That schema
--   doesn't exist in this org (only DATA_JEDAIS.FINS__PUBLIC), so Plan 6 takes a different
--   path: clone the live SP into DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_PLAID_HELD_AWAY_FIXTURE
--   via GET_DDL + REPLACE, redirecting the audience view, dataset table, and
--   staging table FQNs to fixture-scoped names. Self-contained — no schema
--   prerequisites beyond the deployed live SP.
--
-- Plan 6 differences from Plans 1-5:
--   - First 1:N dataset — `_rows_for(anchor, run_ts) -> list[dict]` returns
--     1-5 rows per anchor. Total row count must be in band [audience, 5*audience].
--   - Composite PK (ACCOUNT_ID, HELD_AWAY_ACCOUNT_ID, PROFILE_MONTH).
--   - 4 NULLable columns (LAST_TRANSACTION_DATE, MONTHLY_NET_FLOW_USD,
--     INVESTMENT_RISK_TIER, INTEREST_RATE_PCT) conditional on IS_ACTIVE /
--     ACCOUNT_TYPE.
--   - Audience predicate `CLIENT_CATEGORY IN ('Retail', 'Wealth Management')`.
--     Fixture has 16 anchors (10 Retail + 4 Wealth Management + 2 Small
--     Business filtered out) — audience-eligible count is 14.
--
-- Pre-requisites:
--   1. SP_GENERATE_PLAID_HELD_AWAY deployed (run scripts/deploy_sp.py first).
-- =============================================================================

USE SCHEMA DATA_JEDAIS.FINS__PUBLIC;

-- ---------------------------------------------------------------------------
-- 1. Drop any leftover objects from a prior failed run so the test is
--    idempotent end-to-end.
-- ---------------------------------------------------------------------------
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.PLAID_HELD_AWAY_FIXTURE;
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.PLAID_HELD_AWAY_FIXTURE_STAGING;
DROP PROCEDURE IF EXISTS DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_PLAID_HELD_AWAY_FIXTURE();
DROP VIEW      IF EXISTS DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS_PLAID_FIXTURE;

-- ---------------------------------------------------------------------------
-- 2. Materialise the L2 fixture audience view: 16 anchors total.
--    - 10 Retail        (audience-eligible)
--    -  4 Wealth Mgmt   (audience-eligible)
--    -  2 Small Business (filtered out by _AUDIENCE_PREDICATE)
--    = 14 audience-eligible anchors.
--
--    Coverage of the rowspec dimensions:
--    - Age bands: Gen Z (<30), Millennial (30-44), Gen X (45-59), Boomer (60+)
--    - Income tiers: <$50K, $50K-$150K, $150K-$250K, >=$250K
--    - States: CA, NY, TX, FL, MA, IL
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS_PLAID_FIXTURE AS
SELECT
    'PLAID-FIX-R-01'::VARCHAR AS ACCOUNT_ID,
    'Avery Stone'::VARCHAR     AS ACCOUNT_NAME,
    '2026-05-28'::DATE         AS SNAPSHOT_DATE,
    'Retail'::VARCHAR          AS CLIENT_CATEGORY,
    'PERSON'::VARCHAR          AS ACCOUNT_TYPE_FLAG,
    '2002-03-14'::TIMESTAMP_LTZ AS BIRTHDATE,        -- Gen Z (~24)
    35000::NUMBER              AS ANNUAL_INCOME,     -- <$50K
    680::NUMBER                AS CREDIT_SCORE,
    NULL::VARCHAR              AS INDUSTRY,
    NULL::NUMBER               AS ANNUAL_REVENUE,
    NULL::NUMBER               AS EMPLOYEE_COUNT,
    '94110'::VARCHAR           AS POSTAL_CODE,
    'CA'::VARCHAR              AS STATE_CODE,
    'US'::VARCHAR              AS COUNTRY_CODE,
    'PHA-FIX-R-001'::VARCHAR   AS EXTERNAL_ID
UNION ALL SELECT 'PLAID-FIX-R-02', 'Riley Park',     '2026-05-28'::DATE, 'Retail', 'PERSON', '1995-08-22'::TIMESTAMP_LTZ,  62000, 700, NULL, NULL, NULL, '10025', 'NY', 'US', 'PHA-FIX-R-002'
UNION ALL SELECT 'PLAID-FIX-R-03', 'Casey Reed',     '2026-05-28'::DATE, 'Retail', 'PERSON', '1990-11-05'::TIMESTAMP_LTZ,  95000, 720, NULL, NULL, NULL, '02115', 'MA', 'US', 'PHA-FIX-R-003'
UNION ALL SELECT 'PLAID-FIX-R-04', 'Quinn Marlowe',  '2026-05-28'::DATE, 'Retail', 'PERSON', '1988-04-08'::TIMESTAMP_LTZ, 130000, 740, NULL, NULL, NULL, '94027', 'CA', 'US', 'PHA-FIX-R-004'
UNION ALL SELECT 'PLAID-FIX-R-05', 'Jordan Vega',    '2026-05-28'::DATE, 'Retail', 'PERSON', '1975-06-12'::TIMESTAMP_LTZ, 175000, 750, NULL, NULL, NULL, '77002', 'TX', 'US', 'PHA-FIX-R-005'
UNION ALL SELECT 'PLAID-FIX-R-06', 'Morgan Hayes',   '2026-05-28'::DATE, 'Retail', 'PERSON', '1972-09-30'::TIMESTAMP_LTZ, 210000, 760, NULL, NULL, NULL, '60601', 'IL', 'US', 'PHA-FIX-R-006'
UNION ALL SELECT 'PLAID-FIX-R-07', 'Sam Walters',    '2026-05-28'::DATE, 'Retail', 'PERSON', '1958-02-18'::TIMESTAMP_LTZ,  88000, 730, NULL, NULL, NULL, '33139', 'FL', 'US', 'PHA-FIX-R-007'
UNION ALL SELECT 'PLAID-FIX-R-08', 'Pat Donovan',    '2026-05-28'::DATE, 'Retail', 'PERSON', '1955-12-03'::TIMESTAMP_LTZ,  72000, 720, NULL, NULL, NULL, '10001', 'NY', 'US', 'PHA-FIX-R-008'
UNION ALL SELECT 'PLAID-FIX-R-09', 'Drew Mitchell',  '2026-05-28'::DATE, 'Retail', 'PERSON', '1992-07-19'::TIMESTAMP_LTZ,  45000, 690, NULL, NULL, NULL, '02101', 'MA', 'US', 'PHA-FIX-R-009'
UNION ALL SELECT 'PLAID-FIX-R-10', 'Alex Brennan',   '2026-05-28'::DATE, 'Retail', 'PERSON', '1960-01-22'::TIMESTAMP_LTZ, 110000, 750, NULL, NULL, NULL, '90001', 'CA', 'US', 'PHA-FIX-R-010'
-- Wealth Management — high income, full mix of ages
UNION ALL SELECT 'PLAID-FIX-W-01', 'Logan Pierce',   '2026-05-28'::DATE, 'Wealth Management', 'PERSON', '1968-04-12'::TIMESTAMP_LTZ, 350000, 780, NULL, NULL, NULL, '94027', 'CA', 'US', 'PHA-FIX-W-001'
UNION ALL SELECT 'PLAID-FIX-W-02', 'Harper Cole',    '2026-05-28'::DATE, 'Wealth Management', 'PERSON', '1980-10-04'::TIMESTAMP_LTZ, 285000, 770, NULL, NULL, NULL, '10021', 'NY', 'US', 'PHA-FIX-W-002'
UNION ALL SELECT 'PLAID-FIX-W-03', 'Skyler Lane',    '2026-05-28'::DATE, 'Wealth Management', 'PERSON', '1953-06-09'::TIMESTAMP_LTZ, 500000, 800, NULL, NULL, NULL, '02115', 'MA', 'US', 'PHA-FIX-W-003'
UNION ALL SELECT 'PLAID-FIX-W-04', 'Reese Calloway', '2026-05-28'::DATE, 'Wealth Management', 'PERSON', '1985-03-21'::TIMESTAMP_LTZ, 410000, 790, NULL, NULL, NULL, '77002', 'TX', 'US', 'PHA-FIX-W-004'
-- Edge: Small Business anchors — must be filtered out (audience is Retail/Wealth-only)
UNION ALL SELECT 'PLAID-FIX-B-01', 'Pinewood Coffee Co.', '2026-05-28'::DATE, 'Small Business', 'BUSINESS', NULL::TIMESTAMP_LTZ, NULL, NULL, 'Food & Beverage', 1200000, 18, '98101', 'WA', 'US', 'PHA-FIX-B-001'
UNION ALL SELECT 'PLAID-FIX-B-02', 'Mariposa Cleaners LLC', '2026-05-28'::DATE, 'Small Business', 'BUSINESS', NULL::TIMESTAMP_LTZ, NULL, NULL, 'Personal Services', 480000, 6, '94110', 'CA', 'US', 'PHA-FIX-B-002';

-- ---------------------------------------------------------------------------
-- 3. Materialise the fixture-scoped target table: same DDL as
--    DATA_JEDAIS.FINS__PUBLIC.PLAID_HELD_AWAY but renamed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE TABLE DATA_JEDAIS.FINS__PUBLIC.PLAID_HELD_AWAY_FIXTURE
LIKE DATA_JEDAIS.FINS__PUBLIC.PLAID_HELD_AWAY;

-- ---------------------------------------------------------------------------
-- 4. Clone SP_GENERATE_PLAID_HELD_AWAY into ..._FIXTURE with FQN swaps:
--      V_ACCOUNT_ANCHORS         -> V_ACCOUNT_ANCHORS_PLAID_FIXTURE
--      PLAID_HELD_AWAY (table)   -> PLAID_HELD_AWAY_FIXTURE
--      PLAID_HELD_AWAY_STAGING   -> PLAID_HELD_AWAY_FIXTURE_STAGING
--      SP_GENERATE_PLAID_HELD_AWAY -> SP_GENERATE_PLAID_HELD_AWAY_FIXTURE
--      TASK_MONTHLY_PLAID_HELD_AWAY -> TASK_MONTHLY_PLAID_HELD_AWAY_FIXTURE
--    Sentinel-based ordering avoids substring-collision in repeated REPLACE
--    passes (e.g. replacing SP_GENERATE_PLAID_HELD_AWAY first would mean
--    later PLAID_HELD_AWAY -> PLAID_HELD_AWAY_FIXTURE catches the new
--    procedure name and double-suffixes it).
-- ---------------------------------------------------------------------------
EXECUTE IMMEDIATE $$
DECLARE
    sp_ddl STRING;
BEGIN
    sp_ddl := (SELECT GET_DDL('PROCEDURE', 'DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_PLAID_HELD_AWAY()'));
    -- Step 1: stash the suffix-bearing identifiers behind sentinels.
    sp_ddl := REPLACE(sp_ddl, 'PLAID_HELD_AWAY_STAGING',     '__PHA_STG__');
    sp_ddl := REPLACE(sp_ddl, 'SP_GENERATE_PLAID_HELD_AWAY', '__PHA_SP__');
    sp_ddl := REPLACE(sp_ddl, 'TASK_MONTHLY_PLAID_HELD_AWAY','__PHA_TASK__');
    -- Step 2: now PLAID_HELD_AWAY (the dataset table) is unambiguous.
    sp_ddl := REPLACE(sp_ddl, 'PLAID_HELD_AWAY',             'PLAID_HELD_AWAY_FIXTURE');
    -- Step 3: expand sentinels back to fixture-suffixed names.
    sp_ddl := REPLACE(sp_ddl, '__PHA_STG__',                 'PLAID_HELD_AWAY_FIXTURE_STAGING');
    sp_ddl := REPLACE(sp_ddl, '__PHA_SP__',                  'SP_GENERATE_PLAID_HELD_AWAY_FIXTURE');
    sp_ddl := REPLACE(sp_ddl, '__PHA_TASK__',                'TASK_MONTHLY_PLAID_HELD_AWAY_FIXTURE');
    -- Step 4: redirect audience view.
    sp_ddl := REPLACE(sp_ddl, 'V_ACCOUNT_ANCHORS',           'V_ACCOUNT_ANCHORS_PLAID_FIXTURE');
    EXECUTE IMMEDIATE :sp_ddl;
    RETURN 'fixture SP staged';
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. First run.
-- ---------------------------------------------------------------------------
CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_PLAID_HELD_AWAY_FIXTURE();

-- ---------------------------------------------------------------------------
-- 6. Coverage assertion #1: distinct ACCOUNT_ID == audience size (14).
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(DISTINCT ACCOUNT_ID) FROM DATA_JEDAIS.FINS__PUBLIC.PLAID_HELD_AWAY_FIXTURE) = 14
    AS distinct_accounts_assertion_passes;
-- Expected: TRUE  (14 audience-eligible anchors all emit at least one row)

-- ---------------------------------------------------------------------------
-- 7. Row-count band assertion #2: COUNT(*) in [14, 70] (audience to 5*audience).
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.PLAID_HELD_AWAY_FIXTURE) BETWEEN 14 AND 70
    AS row_count_band_assertion_passes;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 8. 1:N expansion assertion #3: at least one anchor produces > 1 row.
-- ---------------------------------------------------------------------------
SELECT EXISTS (
    SELECT 1
    FROM DATA_JEDAIS.FINS__PUBLIC.PLAID_HELD_AWAY_FIXTURE
    GROUP BY ACCOUNT_ID
    HAVING COUNT(*) > 1
) AS multi_row_anchor_exists;
-- Expected: TRUE  (Wealth and high-income anchors should hit the >1 distribution)

-- ---------------------------------------------------------------------------
-- 9. Inactive-row presence #4: at least one row has IS_ACTIVE = false (~8% rate).
-- The 8% is a loose target — 14-70 rows means 1-6 expected inactive. To make
-- this assertion non-flaky, only require at-least-one. With 70 rows max and
-- 8% rate, the chance of zero inactive is (0.92^70) ~ 0.3%; with min 14 rows
-- it's (0.92^14) ~ 31% — non-trivial. The fixture audience reliably yields
-- enough rows to make this stable across re-runs (deterministic seed).
-- ---------------------------------------------------------------------------
SELECT EXISTS (
    SELECT 1 FROM DATA_JEDAIS.FINS__PUBLIC.PLAID_HELD_AWAY_FIXTURE WHERE IS_ACTIVE = FALSE
) AS inactive_row_present;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 10. Audience-filter assertion #5: Small Business anchors must NOT leak.
-- ---------------------------------------------------------------------------
SELECT NOT EXISTS (
    SELECT 1 FROM DATA_JEDAIS.FINS__PUBLIC.PLAID_HELD_AWAY_FIXTURE
    WHERE ACCOUNT_ID IN ('PLAID-FIX-B-01', 'PLAID-FIX-B-02')
) AS audience_filter_passes;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 11. Distinct held-away ID assertion #6: at least 14 distinct values
-- (one per anchor minimum, since slot 0 of each anchor is unique).
-- ---------------------------------------------------------------------------
SELECT
    (SELECT COUNT(DISTINCT HELD_AWAY_ACCOUNT_ID) FROM DATA_JEDAIS.FINS__PUBLIC.PLAID_HELD_AWAY_FIXTURE) >= 14
    AS distinct_held_away_ids_assertion_passes;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 12. Date-bound sanity #7: LAST_LINKED_DATE in [1990-01-01, today].
-- The bias logic uses 1-48 months ago, so realistic floor is 2022-ish, but
-- we leave the floor loose at 1990 to absorb any future helper edits.
-- ---------------------------------------------------------------------------
SELECT NOT EXISTS (
    SELECT 1 FROM DATA_JEDAIS.FINS__PUBLIC.PLAID_HELD_AWAY_FIXTURE
    WHERE LAST_LINKED_DATE < '1990-01-01'
       OR LAST_LINKED_DATE > CURRENT_DATE()
) AS last_linked_date_in_range;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 13. NULL-when-inactive invariant #8: rows with IS_ACTIVE=false must have
-- both LAST_TRANSACTION_DATE and MONTHLY_NET_FLOW_USD NULL.
-- (The reverse — IS_ACTIVE=true → both non-NULL — is also enforced by SP
-- helpers; we check the more critical inactive-side invariant.)
-- ---------------------------------------------------------------------------
SELECT NOT EXISTS (
    SELECT 1 FROM DATA_JEDAIS.FINS__PUBLIC.PLAID_HELD_AWAY_FIXTURE
    WHERE IS_ACTIVE = FALSE
      AND (LAST_TRANSACTION_DATE IS NOT NULL OR MONTHLY_NET_FLOW_USD IS NOT NULL)
) AS null_when_inactive_invariant;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 14. Investment-tier conditional invariant #9: INVESTMENT_RISK_TIER must be
-- NULL for non-investment ACCOUNT_TYPE rows (i.e. only Brokerage/IRA/401k/HSA
-- carry a risk tier).
-- ---------------------------------------------------------------------------
SELECT NOT EXISTS (
    SELECT 1 FROM DATA_JEDAIS.FINS__PUBLIC.PLAID_HELD_AWAY_FIXTURE
    WHERE ACCOUNT_TYPE NOT IN ('Brokerage','IRA','401k','HSA')
      AND INVESTMENT_RISK_TIER IS NOT NULL
) AS investment_tier_conditional_invariant;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 15. Idempotency assertion #10: a second run leaves the row count unchanged
-- (MERGE-not-INSERT).
-- ---------------------------------------------------------------------------
SET row_count_before = (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.PLAID_HELD_AWAY_FIXTURE);
CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_PLAID_HELD_AWAY_FIXTURE();
SELECT
    (SELECT COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.PLAID_HELD_AWAY_FIXTURE) = $row_count_before
    AS idempotency_assertion_passes;
-- Expected: TRUE

-- ---------------------------------------------------------------------------
-- 16. Cleanup
-- ---------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_PLAID_HELD_AWAY_FIXTURE();
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.PLAID_HELD_AWAY_FIXTURE_STAGING;
DROP TABLE     IF EXISTS DATA_JEDAIS.FINS__PUBLIC.PLAID_HELD_AWAY_FIXTURE;
DROP VIEW      IF EXISTS DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS_PLAID_FIXTURE;
DELETE FROM DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG WHERE TASK_NAME = 'TASK_MONTHLY_PLAID_HELD_AWAY_FIXTURE';
