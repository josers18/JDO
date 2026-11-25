-- =============================================================================
-- Identify & Acquire demo: Snowflake overrides for the hero prospect
-- Hero: Northgate Point Group, Account 001am00002KsgljAAB (see ids.json)
-- Tables are Zero Copy sources for BT_* DMOs in jdo-oe0sdd.
--
-- 1. UserGems (one-off). Events are immutable and the weekly MERGE only
--    re-derives the previous week + current week, so past rows stay as edited.
-- 2. Demandbase + Harmonic (re-applied). The generators rewrite the newest
--    week / month, so SP_APPLY_ACQUIRE_DEMO_OVERRIDES re-writes the hero rows
--    for the newest period, scheduled just after each generator.
-- Rollback at the bottom.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. UserGems: point departures at the new prospect accounts, add hero Joined
-- ---------------------------------------------------------------------------
UPDATE DATA_JEDAIS.FINS__PUBLIC.USERGEMS_JOB_CHANGES SET NEW_ACCOUNT_ID = CASE RECORD_ID
    WHEN '3a7e08f3-8dc2-bbbf-add2-7fb94c271956' THEN '001am00002KsgljAAB'  -- Elizabeth Smith -> Northgate Point Group
    WHEN '3747c6b3-451e-379c-2897-5082c2d0dd2c' THEN '001am00002KsgljAAB'  -- Robert Kim      -> Northgate Point Group
    WHEN '9c3ae51b-8c43-c09c-db40-75f1815b4c3c' THEN '001am00002KsniPAAR'  -- Aisha Kim       -> Crescent Bay Holdings
    WHEN '67da1685-e825-eee3-6a72-dcf2ff3a8e49' THEN '001am00002KspiDAAR'  -- Aisha Martinez  -> Pioneer Mills Capital
    WHEN '17a8e7c0-cc00-70bf-0bee-842d77eae993' THEN '001am00002KspiDAAR'  -- James Miller    -> Pioneer Mills Capital
    WHEN '8b64c71b-2be7-a60f-d986-2a1d9fe4c0ab' THEN '001am00002Ksh0GAAR'  -- Robert Brown    -> Lakeshore Ridge Technologies
    WHEN 'e377fb55-5553-3032-054f-8b2c1d14e510' THEN '001am00002Ksh0GAAR'  -- Robert Davis    -> Lakeshore Ridge Technologies
  END,
  PAIRED_EVENT_ID = IFF(RECORD_ID = '3a7e08f3-8dc2-bbbf-add2-7fb94c271956',
                        '7def2cca-101f-8ff5-6504-48ad5a7ed252', PAIRED_EVENT_ID)
WHERE RECORD_ID IN ('3a7e08f3-8dc2-bbbf-add2-7fb94c271956','3747c6b3-451e-379c-2897-5082c2d0dd2c',
                    '9c3ae51b-8c43-c09c-db40-75f1815b4c3c','67da1685-e825-eee3-6a72-dcf2ff3a8e49',
                    '17a8e7c0-cc00-70bf-0bee-842d77eae993','8b64c71b-2be7-a60f-d986-2a1d9fe4c0ab',
                    'e377fb55-5553-3032-054f-8b2c1d14e510');

-- Paired Joined row. EVENT_ID = uuid(sha2('JDO|demo_override|usergems|joined|northgate_cfo'));
-- RECORD_ID uses the generator's formula: uuid(sha2(ORG_ID|EVENT_ID|record_id)).
MERGE INTO DATA_JEDAIS.FINS__PUBLIC.USERGEMS_JOB_CHANGES t
USING (SELECT 'JDO' ORG_ID, '7a4cc6cd-ceab-2e31-0b56-b755d4bdf93f' RECORD_ID,
              '7def2cca-101f-8ff5-6504-48ad5a7ed252' EVENT_ID) s
ON t.ORG_ID = s.ORG_ID AND t.EVENT_ID = s.EVENT_ID
WHEN NOT MATCHED THEN INSERT (ORG_ID, RECORD_ID, EVENT_ID, ACCOUNT_ID, PROFILE_WEEK, EVENT_TYPE, EVENT_DATE,
    DETECTED_DATE, CONTACT_NAME, CONTACT_PERSONA, SENIORITY, OLD_TITLE, NEW_TITLE, NEW_EMPLOYER_NAME,
    NEW_ACCOUNT_ID, NEW_EMPLOYER_STATUS, PAIRED_EVENT_ID, WAS_CHAMPION, WAS_PRIMARY_CONTACT,
    OPPORTUNITY_SCORE, RELATIONSHIP_RISK_SCORE, PERSON_ACCOUNT_ID, LIQUIDITY_EVENT_FLAG, GENERATED_AT)
VALUES (s.ORG_ID, s.RECORD_ID, s.EVENT_ID, '001am00002KsgljAAB', '2026-11-02', 'Joined', '2026-10-18',
    '2026-11-08', 'Elizabeth Smith', 'CFO', 'C-Suite', 'CFO', 'CFO', NULL,
    NULL, 'Not Applicable', '3589481b-7858-54f0-03b0-96df93736213', TRUE, FALSE,
    98, 7, NULL, FALSE, '2026-11-02 00:00:00');

-- ---------------------------------------------------------------------------
-- 2. Demandbase + Harmonic hero rows for the newest period (idempotent)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE DATA_JEDAIS.FINS__PUBLIC.SP_APPLY_ACQUIRE_DEMO_OVERRIDES()
RETURNS VARCHAR
LANGUAGE SQL
COMMENT = 'Identify & Acquire demo: re-writes hero prospect intent + funding rows for the newest period'
EXECUTE AS CALLER
AS
$$
DECLARE
  hero VARCHAR DEFAULT '001am00002KsgljAAB';
  wk DATE;
  mo DATE;
BEGIN
  SELECT MAX(PROFILE_WEEK) INTO :wk FROM DATA_JEDAIS.FINS__PUBLIC.DEMANDBASE_INTENT_SIGNALS;
  DELETE FROM DATA_JEDAIS.FINS__PUBLIC.DEMANDBASE_INTENT_SIGNALS
   WHERE ACCOUNT_ID = :hero AND PROFILE_WEEK = :wk;
  INSERT INTO DATA_JEDAIS.FINS__PUBLIC.DEMANDBASE_INTENT_SIGNALS
    (ORG_ID, RECORD_ID, ACCOUNT_ID, PROFILE_WEEK, INTENT_TOPIC, TOPIC_CATEGORY, IS_TOP_TOPIC, INTENT_SCORE,
     SURGE_FLAG, WEEKS_SURGING, SCORE_DELTA_WOW, JOURNEY_STAGE, UNIQUE_RESEARCHERS, RESEARCHING_COMPETITOR,
     KEYWORD_SAMPLE, SIGNAL_SOURCE, LAST_SIGNAL_DATE, INTENT_NOTE, GENERATED_AT)
  SELECT 'JDO',
         REGEXP_REPLACE(LEFT(SHA2(CONCAT_WS('|', 'JDO', 'demo_override', :hero, :wk::VARCHAR, topic), 256), 32),
                        '(.{8})(.{4})(.{4})(.{4})(.{12})', '\\1-\\2-\\3-\\4-\\5'),
         :hero, :wk, topic, cat, top, score, TRUE, weeks, delta, stage, researchers, competitor,
         keywords, src, DATEADD(day, -1, :wk), note, :wk::TIMESTAMP_NTZ
  FROM VALUES
    ('Equipment Finance', 'Lending', TRUE, 94, 4, 21, 'Purchase', 7, 'Wells Fargo',
     'refrigerated trailer financing; fleet loan rates; equipment lease vs buy', 'Demandbase',
     '4-week surge: 7 researchers pricing fleet financing'),
    ('Treasury Management', 'Cash Management', FALSE, 78, 2, 26, 'Consideration', 4, NULL,
     'multi-entity cash pooling; sweep account; payables automation', 'Bombora',
     '2-week surge: 4 researchers comparing cash pooling')
    AS v(topic, cat, top, score, weeks, delta, stage, researchers, competitor, keywords, src, note);

  SELECT MAX(PROFILE_MONTH) INTO :mo FROM DATA_JEDAIS.FINS__PUBLIC.HARMONIC_COMPANY_SIGNALS;
  DELETE FROM DATA_JEDAIS.FINS__PUBLIC.HARMONIC_COMPANY_SIGNALS
   WHERE ACCOUNT_ID = :hero AND PROFILE_MONTH = :mo;
  INSERT INTO DATA_JEDAIS.FINS__PUBLIC.HARMONIC_COMPANY_SIGNALS
    (ORG_ID, RECORD_ID, ACCOUNT_ID, PROFILE_MONTH, FUNDING_STATUS, LAST_FUNDING_STAGE, LAST_FUNDING_DATE,
     LAST_ROUND_USD, TOTAL_RAISED_USD, FUNDING_ROUNDS_COUNT, LEAD_INVESTOR, EST_VALUATION_USD,
     EST_RUNWAY_MONTHS, RECENTLY_FUNDED_FLAG, HEADCOUNT, HEADCOUNT_GROWTH_6M_PCT, TRACTION_SCORE,
     ENG_HEADCOUNT_PCT, SALES_HEADCOUNT_PCT, OPS_HEADCOUNT_PCT, OPEN_JOB_POSTINGS, POSTINGS_TREND,
     LAST_DATA_REFRESH_DATE, GENERATED_AT)
  SELECT 'JDO',
         REGEXP_REPLACE(LEFT(SHA2(CONCAT_WS('|', 'JDO', 'demo_override', :hero, :mo::VARCHAR), 256), 32),
                        '(.{8})(.{4})(.{4})(.{4})(.{12})', '\\1-\\2-\\3-\\4-\\5'),
         :hero, :mo, 'Venture-Backed', 'Series B', '2026-10-27', 48000000, 71500000, 3,
         'Harbor Peak Ventures', 310000000, 38, TRUE, 410, 22.5, 84, 9.0, 14.0, 61.0, 46, 'Accelerating',
         CURRENT_DATE(), :mo::TIMESTAMP_NTZ;

  RETURN 'hero overrides applied: week ' || :wk::VARCHAR || ', month ' || :mo::VARCHAR;
END;
$$;

-- Generators: Demandbase Mon 03:15 ET, Harmonic 1st 05:00 ET. Re-apply after each.
CREATE OR REPLACE TASK DATA_JEDAIS.FINS__PUBLIC.TASK_WEEKLY_ACQUIRE_DEMO_OVERRIDES
  WAREHOUSE = MAIN_WH_XS
  SCHEDULE = 'USING CRON 0 4 * * 1 America/New_York'
AS CALL DATA_JEDAIS.FINS__PUBLIC.SP_APPLY_ACQUIRE_DEMO_OVERRIDES();

CREATE OR REPLACE TASK DATA_JEDAIS.FINS__PUBLIC.TASK_MONTHLY_ACQUIRE_DEMO_OVERRIDES
  WAREHOUSE = MAIN_WH_XS
  SCHEDULE = 'USING CRON 30 5 1 * * America/New_York'
AS CALL DATA_JEDAIS.FINS__PUBLIC.SP_APPLY_ACQUIRE_DEMO_OVERRIDES();

ALTER TASK DATA_JEDAIS.FINS__PUBLIC.TASK_WEEKLY_ACQUIRE_DEMO_OVERRIDES RESUME;
ALTER TASK DATA_JEDAIS.FINS__PUBLIC.TASK_MONTHLY_ACQUIRE_DEMO_OVERRIDES RESUME;
CALL DATA_JEDAIS.FINS__PUBLIC.SP_APPLY_ACQUIRE_DEMO_OVERRIDES();

-- =============================================================================
-- Rollback
-- =============================================================================
-- DROP TASK IF EXISTS DATA_JEDAIS.FINS__PUBLIC.TASK_WEEKLY_ACQUIRE_DEMO_OVERRIDES;
-- DROP TASK IF EXISTS DATA_JEDAIS.FINS__PUBLIC.TASK_MONTHLY_ACQUIRE_DEMO_OVERRIDES;
-- DROP PROCEDURE IF EXISTS DATA_JEDAIS.FINS__PUBLIC.SP_APPLY_ACQUIRE_DEMO_OVERRIDES();
-- DELETE FROM DATA_JEDAIS.FINS__PUBLIC.DEMANDBASE_INTENT_SIGNALS WHERE ACCOUNT_ID = '001am00002KsgljAAB';
-- DELETE FROM DATA_JEDAIS.FINS__PUBLIC.HARMONIC_COMPANY_SIGNALS  WHERE ACCOUNT_ID = '001am00002KsgljAAB';
-- DELETE FROM DATA_JEDAIS.FINS__PUBLIC.USERGEMS_JOB_CHANGES WHERE EVENT_ID = '7def2cca-101f-8ff5-6504-48ad5a7ed252';
-- UPDATE DATA_JEDAIS.FINS__PUBLIC.USERGEMS_JOB_CHANGES SET NEW_ACCOUNT_ID = NULL,
--   PAIRED_EVENT_ID = IFF(RECORD_ID = '3a7e08f3-8dc2-bbbf-add2-7fb94c271956', NULL, PAIRED_EVENT_ID)
--  WHERE RECORD_ID IN ('3a7e08f3-8dc2-bbbf-add2-7fb94c271956','3747c6b3-451e-379c-2897-5082c2d0dd2c',
--   '9c3ae51b-8c43-c09c-db40-75f1815b4c3c','67da1685-e825-eee3-6a72-dcf2ff3a8e49',
--   '17a8e7c0-cc00-70bf-0bee-842d77eae993','8b64c71b-2be7-a60f-d986-2a1d9fe4c0ab',
--   'e377fb55-5553-3032-054f-8b2c1d14e510');
