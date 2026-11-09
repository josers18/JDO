-- =============================================================================
-- Migration 009 (NOT YET APPLIED): delete the 35,116 trades with a NULL
-- ACCOUNT_ID, i.e. the trades of the five old TRD- placeholder accounts.
--
-- Where they come from (traced 2026-11-09): TRADE_GENERATION_CONFIG rows
-- TRD-001 Alpha Growth Fund (DAILY/15), TRD-002 Steadfast Income LLC
-- (WEEKLY/8), TRD-003 J. Smith IRA (MONTHLY/3), TRD-004 Apex Trading Desk
-- (DAILY/25) and TRD-005 Wellington Balanced (DAILY/10), created by hand on
-- 2026-04-16. GENERATE_HISTORICAL_TRADES (before it read only '001%') wrote
-- their history from 2024-06-03; GENERATE_DAILY_TRADES wrote 2026-04-16 ..
-- 2026-10-23. Migration 001 (2026-10-23 20:13 PT) set their ACCOUNT_ID to
-- NULL and deactivated the configs; nothing has written a NULL row since.
-- Normal day = 50 rows (15+25+10), +8 on Mondays, +3 on monthly run days.
-- The map from row to TRD id is gone (FINANCIAL_TRADES_BAK_20261024 was
-- dropped), so the rows can't be re-keyed to an account.
--
-- They also carry retry duplicates that 007 left alone (007 was scoped to
-- '001%'): 06-15, 07-06, 07-13, 08-17 and 09-14 have 66 rows, 09-07, 09-21
-- and 10-05 have 74, 10-19 has 90 and 10-12 has 98, instead of 58. 09-28 has
-- 4 (left by the 2026-09-30 manual rn = 1 delete; 008 skipped them).
--
-- Why delete: no reader uses them (checked 2026-11-09). Every cockpit query
-- on BT_Financial_Trades__dlm filters account_id__c (= an account id, or
-- LIKE '001am%'); the one trades segment (Accounts_with_recent_trade_activity)
-- targets ssot__Account__dlm, which a NULL key can't join; none of the 106
-- calculated insights reference trades; no Snowflake view depends on
-- FINANCIAL_TRADES. They only inflate unfiltered totals: Data Cloud saw
-- 6,642,761 rows on 2026-11-09, 35,116 of them NULL.
--
-- Not touched: the five TRD- rows in TRADE_GENERATION_CONFIG (inactive, kept
-- as the record of what they were), every row with an ACCOUNT_ID.
-- The DC stream BT_Financial_Trades is zero copy (DIRECT_ACCESS), so the
-- delete shows up there with no refresh.
-- Run as ACCOUNTADMIN outside the 03:00-03:10 ET task window:
--   snow sql --role ACCOUNTADMIN -f migrations/009_delete_trd_placeholder_trades.sql
-- Safety: the block refuses to delete unless both the table and the backup
-- hold exactly 35,116 NULL rows, and fails if the delete removed anything else.
-- Rollback:
--   INSERT INTO DATA_JEDAIS.FINS__PUBLIC.FINANCIAL_TRADES
--   SELECT * FROM DATA_JEDAIS.FINS__PUBLIC.FINANCIAL_TRADES_TRD_BAK_20261109;
-- =============================================================================

USE SCHEMA DATA_JEDAIS.FINS__PUBLIC;

-- Backup of only the rows being deleted (Time Travel on FINANCIAL_TRADES is 1 day).
CREATE TABLE IF NOT EXISTS FINANCIAL_TRADES_TRD_BAK_20261109 AS
SELECT * FROM FINANCIAL_TRADES WHERE ACCOUNT_ID IS NULL;

EXECUTE IMMEDIATE $$
DECLARE
  n_null    INTEGER;
  n_bak     INTEGER;
  n_before  INTEGER;
  n_after   INTEGER;
  bad_input EXCEPTION (-20901, 'Migration 009: NULL-ACCOUNT_ID rows or backup rows are not 35,116. Nothing was deleted.');
  bad_out   EXCEPTION (-20902, 'Migration 009: post-delete counts do not add up. Restore from FINANCIAL_TRADES_TRD_BAK_20261109.');
BEGIN
  SELECT COUNT_IF(ACCOUNT_ID IS NULL), COUNT(*) INTO :n_null, :n_before FROM FINANCIAL_TRADES;
  SELECT COUNT(*) INTO :n_bak FROM FINANCIAL_TRADES_TRD_BAK_20261109;
  IF (n_null <> 35116 OR n_bak <> 35116) THEN
    RAISE bad_input;
  END IF;

  DELETE FROM FINANCIAL_TRADES WHERE ACCOUNT_ID IS NULL;

  SELECT COUNT_IF(ACCOUNT_ID IS NULL), COUNT(*) INTO :n_null, :n_after FROM FINANCIAL_TRADES;
  IF (n_null <> 0 OR n_before - n_after <> 35116) THEN
    RAISE bad_out;
  END IF;
  RETURN 'Migration 009: deleted 35116 NULL-ACCOUNT_ID trades; FINANCIAL_TRADES ' || n_before || ' -> ' || n_after;
END;
$$;

-- Check: no NULL rows left and the backup intact (expect 0 / 35,116).
SELECT COUNT_IF(ACCOUNT_ID IS NULL)                            AS NULL_ROWS_LEFT,
       (SELECT COUNT(*) FROM FINANCIAL_TRADES_TRD_BAK_20261109) AS BACKUP_ROWS,
       COUNT(*)                                                AS TOTAL_ROWS
FROM FINANCIAL_TRADES;
