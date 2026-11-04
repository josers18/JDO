-- =============================================================================
-- Migration 007 (applied 2026-11-04): delete the duplicate trade sets that
-- retried Monday runs of GENERATE_DAILY_TRADES wrote on 12 Mondays,
-- 2026-06-15 .. 2026-11-02.
--
-- Why: before 2026-11-04, _is_due's Monday rule ignored LAST_GENERATED_DATE.
-- A Monday run that hit the 1,800 s procedure timeout was rerun by
-- SP_RETRY_WRAPPER and the task's own retries, and every rerun re-traded every
-- WEEKLY account. Each (account, day) pair on those Mondays can therefore hold
-- 2-6 full trade sets ("passes") instead of one.
--
-- A pass is found from CREATED_AT. Within one pair, consecutive rows are either
-- 61-120 s apart (the old code's 5,000-row flush boundary inside one run) or
-- at least 601 s apart (the next retry, ~30 min later). Nothing falls in
-- 121-600 s, so a gap of more than 600 s starts a new pass.
--
-- Keep rule: per pair, keep the earliest pass with the most rows, and delete
-- the rest. Usually every pass has the same size and the first one is kept. A
-- handful of pairs (e.g. sizes 2,5) have a short first pass, cut off by the
-- timeout partway through the account, so the first complete pass is kept.
--
-- Scope: the 12 TRADE_DATEs below, ACCOUNT_ID LIKE '001%' only. Not changed:
-- other days (06-30, 08-03 and 09-28 have a single pair split across a flush
-- boundary or 9,034 s apart; left alone), NULL-ACCOUNT_ID rows from the old
-- TRD- placeholders, TRADE_GENERATION_CONFIG. The DC stream BT_Financial_Trades
-- is zero copy (DIRECT_ACCESS), so the delete shows up there with no refresh.
-- Run as ACCOUNTADMIN on LARGE_LOAD outside the 03:00-03:10 ET task window, in
-- one session (snow sql -f): the delete set is a TEMPORARY table.
-- Rollback: FINANCIAL_TRADES_BAK_20261104_M007 (state before this migration;
-- dropped 2026-11-04 after the result was accepted, so no longer available).
-- =============================================================================

USE SCHEMA DATA_JEDAIS.FINS__PUBLIC;

CREATE TABLE IF NOT EXISTS FINANCIAL_TRADES_BAK_20261104_M007 CLONE FINANCIAL_TRADES;

CREATE OR REPLACE TEMPORARY TABLE M007_DELETE AS
WITH g AS (
  SELECT TRADE_ID, ACCOUNT_ID, TRADE_DATE, CREATED_AT,
         IFF(DATEDIFF('second',
                      LAG(CREATED_AT) OVER (PARTITION BY ACCOUNT_ID, TRADE_DATE ORDER BY CREATED_AT, TRADE_ID),
                      CREATED_AT) > 600, 1, 0) NEW_PASS
  FROM FINANCIAL_TRADES
  WHERE TRADE_DATE IN ('2026-06-15', '2026-07-06', '2026-07-13', '2026-08-17', '2026-09-07', '2026-09-14',
                       '2026-09-21', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02')
    AND ACCOUNT_ID LIKE '001%'
),
p AS (
  SELECT TRADE_ID, ACCOUNT_ID, TRADE_DATE,
         SUM(NEW_PASS) OVER (PARTITION BY ACCOUNT_ID, TRADE_DATE ORDER BY CREATED_AT, TRADE_ID
                             ROWS UNBOUNDED PRECEDING) PASS
  FROM g
),
keep AS (
  SELECT ACCOUNT_ID, TRADE_DATE, PASS KEEP_PASS
  FROM (SELECT ACCOUNT_ID, TRADE_DATE, PASS, COUNT(*) N FROM p GROUP BY 1, 2, 3)
  QUALIFY ROW_NUMBER() OVER (PARTITION BY ACCOUNT_ID, TRADE_DATE ORDER BY N DESC, PASS) = 1
)
SELECT p.TRADE_ID, p.TRADE_DATE
FROM p JOIN keep k ON k.ACCOUNT_ID = p.ACCOUNT_ID AND k.TRADE_DATE = p.TRADE_DATE
WHERE p.PASS <> k.KEEP_PASS;

-- Rows to delete per day.
SELECT TRADE_DATE, COUNT(*) TO_DELETE FROM M007_DELETE GROUP BY 1 ORDER BY 1;

DELETE FROM FINANCIAL_TRADES t
USING M007_DELETE d
WHERE t.TRADE_ID = d.TRADE_ID
  AND t.TRADE_DATE = d.TRADE_DATE;

-- Check: each pair on the 12 days now has one pass (MULTI_PASS_PAIRS = 0).
WITH g AS (
  SELECT ACCOUNT_ID, TRADE_DATE,
         IFF(DATEDIFF('second',
                      LAG(CREATED_AT) OVER (PARTITION BY ACCOUNT_ID, TRADE_DATE ORDER BY CREATED_AT, TRADE_ID),
                      CREATED_AT) > 600, 1, 0) NEW_PASS
  FROM FINANCIAL_TRADES
  WHERE TRADE_DATE IN ('2026-06-15', '2026-07-06', '2026-07-13', '2026-08-17', '2026-09-07', '2026-09-14',
                       '2026-09-21', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02')
    AND ACCOUNT_ID LIKE '001%'
)
SELECT TRADE_DATE, COUNT(DISTINCT ACCOUNT_ID) PAIRS, COUNT(*) ROWS_LEFT,
       COUNT(DISTINCT IFF(NEW_PASS = 1, ACCOUNT_ID, NULL)) MULTI_PASS_PAIRS
FROM g GROUP BY 1 ORDER BY 1;

SELECT (SELECT COUNT(*) FROM FINANCIAL_TRADES_BAK_20261104_M007) BEFORE_ROWS,
       (SELECT COUNT(*) FROM FINANCIAL_TRADES) AFTER_ROWS,
       (SELECT COUNT(*) FROM M007_DELETE) DELETED;
