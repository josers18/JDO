-- =============================================================================
-- Supercharge Bankers demo: Snowflake pins for the hero client
-- Hero: Rodriguez Industries, Account 001am00002A9jm4AAB (see ids.json)
-- Tables are Zero Copy sources for BT_Gong_Call_Sentiment__dlm and the
-- WorldCheck DMO in jdo-oe0sdd.
--
-- The generators rewrite the newest Gong week (Mon 03:00 ET) and add a new
-- WorldCheck day (daily 03:20 ET). SP_APPLY_SUPERCHARGE_DEMO_OVERRIDES updates
-- the hero's newest row in place (RECORD_ID unchanged) so the Nov 15 call
-- story holds: negative/declining sentiment, pricing + competitor topics,
-- 3 action items, Jan 4 follow-up, PEP hit on screening.
-- Rollback at the bottom.
-- =============================================================================

CREATE OR REPLACE PROCEDURE DATA_JEDAIS.FINS__PUBLIC.SP_APPLY_SUPERCHARGE_DEMO_OVERRIDES()
RETURNS VARCHAR
LANGUAGE SQL
COMMENT = 'Supercharge Bankers demo: pins hero Gong call + WorldCheck rows for the newest period'
EXECUTE AS CALLER
AS
$$
DECLARE
  hero VARCHAR DEFAULT '001am00002A9jm4AAB';
  wk DATE;
  dt DATE;
BEGIN
  SELECT MAX(PROFILE_WEEK) INTO :wk FROM DATA_JEDAIS.FINS__PUBLIC.GONG_CALL_SENTIMENT WHERE ACCOUNT_ID = :hero;
  UPDATE DATA_JEDAIS.FINS__PUBLIC.GONG_CALL_SENTIMENT SET
      OVERALL_SENTIMENT = 'Negative', SENTIMENT_TREND = 'Declining',
      KEY_TOPICS_FLAGS = 'Pricing|Competitor', ACTION_ITEMS_COUNT = 3,
      TOTAL_TALK_TIME_MINUTES = 41, DEAL_RISK_SCORE = 36.53,
      LAST_CALL_DATE = '2026-11-15', NEXT_SCHEDULED_CALL_DATE = '2027-01-04',
      RM_NAME = 'Allen Carter'
   WHERE ACCOUNT_ID = :hero AND PROFILE_WEEK = :wk;

  SELECT MAX(PROFILE_DATE) INTO :dt FROM DATA_JEDAIS.FINS__PUBLIC.WORLD_CHECK_AML WHERE ACCOUNT_ID = :hero;
  UPDATE DATA_JEDAIS.FINS__PUBLIC.WORLD_CHECK_AML SET
      OVERALL_RISK_RATING = 'Medium', PEP_HIT = TRUE, SANCTIONS_HIT = FALSE,
      ADVERSE_MEDIA_HIT = FALSE, ADVERSE_MEDIA_CATEGORIES = NULL,
      RISK_JURISDICTION_CODE = 'US', RISK_JURISDICTION_TIER = 'Low'
   WHERE ACCOUNT_ID = :hero AND PROFILE_DATE = :dt;

  RETURN 'hero pins applied: gong week ' || :wk::VARCHAR || ', worldcheck ' || :dt::VARCHAR;
END;
$$;

-- Generators: Gong Mon 03:00 ET, WorldCheck daily 03:20 ET. Re-apply after each.
CREATE OR REPLACE TASK DATA_JEDAIS.FINS__PUBLIC.TASK_WEEKLY_SUPERCHARGE_DEMO_OVERRIDES
  WAREHOUSE = MAIN_WH_XS
  SCHEDULE = 'USING CRON 30 3 * * 1 America/New_York'
AS CALL DATA_JEDAIS.FINS__PUBLIC.SP_APPLY_SUPERCHARGE_DEMO_OVERRIDES();

CREATE OR REPLACE TASK DATA_JEDAIS.FINS__PUBLIC.TASK_DAILY_SUPERCHARGE_DEMO_OVERRIDES
  WAREHOUSE = MAIN_WH_XS
  SCHEDULE = 'USING CRON 40 3 * * * America/New_York'
AS CALL DATA_JEDAIS.FINS__PUBLIC.SP_APPLY_SUPERCHARGE_DEMO_OVERRIDES();

ALTER TASK DATA_JEDAIS.FINS__PUBLIC.TASK_WEEKLY_SUPERCHARGE_DEMO_OVERRIDES RESUME;
ALTER TASK DATA_JEDAIS.FINS__PUBLIC.TASK_DAILY_SUPERCHARGE_DEMO_OVERRIDES RESUME;
CALL DATA_JEDAIS.FINS__PUBLIC.SP_APPLY_SUPERCHARGE_DEMO_OVERRIDES();

-- Tasks run as SYSADMIN; the tables are owned by ACCOUNTADMIN. Run once as ACCOUNTADMIN:
-- GRANT SELECT, UPDATE ON TABLE DATA_JEDAIS.FINS__PUBLIC.GONG_CALL_SENTIMENT TO ROLE SYSADMIN;
-- GRANT SELECT, UPDATE ON TABLE DATA_JEDAIS.FINS__PUBLIC.WORLD_CHECK_AML     TO ROLE SYSADMIN;

-- =============================================================================
-- Rollback (pinned rows are regenerated on the next generator run)
-- =============================================================================
-- DROP TASK IF EXISTS DATA_JEDAIS.FINS__PUBLIC.TASK_WEEKLY_SUPERCHARGE_DEMO_OVERRIDES;
-- DROP TASK IF EXISTS DATA_JEDAIS.FINS__PUBLIC.TASK_DAILY_SUPERCHARGE_DEMO_OVERRIDES;
-- DROP PROCEDURE IF EXISTS DATA_JEDAIS.FINS__PUBLIC.SP_APPLY_SUPERCHARGE_DEMO_OVERRIDES();
