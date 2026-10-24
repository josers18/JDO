-- =============================================================================
-- Migration 002 (applied 2026-10-24): revert TRADE_DATE / SETTLEMENT_DATE /
-- SNAPSHOT_DATE to DATE. Supersedes the type change in migration 001; its
-- TRD- key cleanup and config deactivation stay.
--
-- Why: the Data Cloud stream BT_Financial_Trades registered these three source
-- fields with format 'MM/dd/yyyy HH:mm:ss.SSS zzz'. For TIMESTAMP_TZ columns the
-- connector unloads TO_TIMESTAMP_NTZ(CONVERT_TIMEZONE('UTC', col))::string
-- ('2025-01-01 00:00:00.000'), which that format misreads (2025-01-01 lands as
-- 0006-07-18). DATE columns unload as native Parquet dates and read correctly.
-- The field format can't be changed on an existing stream (Connect API rejects
-- it), so the columns stay DATE until the stream is rebuilt.
--
-- Known cost: with DATE columns the stream's INCREMENTAL runs (watermark
-- TRADE_DATE) fail after reading max(TRADE_DATE), so new days only land with a
-- manual Full Refresh (DC Setup UI) until the stream's incremental column or
-- format is fixed.
--
-- Run outside the DAILY_TRADE_GENERATOR window (00:10 PT / 03:10 ET), then run one
-- Full Refresh of BT_Financial_Trades.
-- Rollback: FINANCIAL_TRADES_BAK_20261024_TZ (TIMESTAMP_TZ state after 001).
-- =============================================================================

USE SCHEMA DATA_JEDAIS.FINS__PUBLIC;

CREATE TABLE IF NOT EXISTS FINANCIAL_TRADES_BAK_20261024_TZ CLONE FINANCIAL_TRADES;

ALTER TABLE FINANCIAL_TRADES ADD COLUMN TRADE_DATE_D DATE;
ALTER TABLE FINANCIAL_TRADES ADD COLUMN SETTLEMENT_DATE_D DATE;
ALTER TABLE FINANCIAL_TRADES ADD COLUMN SNAPSHOT_DATE_D DATE;

UPDATE FINANCIAL_TRADES SET
    TRADE_DATE_D      = CONVERT_TIMEZONE('UTC', TRADE_DATE)::DATE,
    SETTLEMENT_DATE_D = CONVERT_TIMEZONE('UTC', SETTLEMENT_DATE)::DATE,
    SNAPSHOT_DATE_D   = CONVERT_TIMEZONE('UTC', SNAPSHOT_DATE)::DATE;

ALTER TABLE FINANCIAL_TRADES DROP COLUMN TRADE_DATE;
ALTER TABLE FINANCIAL_TRADES DROP COLUMN SETTLEMENT_DATE;
ALTER TABLE FINANCIAL_TRADES DROP COLUMN SNAPSHOT_DATE;
ALTER TABLE FINANCIAL_TRADES RENAME COLUMN TRADE_DATE_D TO TRADE_DATE;
ALTER TABLE FINANCIAL_TRADES RENAME COLUMN SETTLEMENT_DATE_D TO SETTLEMENT_DATE;
ALTER TABLE FINANCIAL_TRADES RENAME COLUMN SNAPSHOT_DATE_D TO SNAPSHOT_DATE;
ALTER TABLE FINANCIAL_TRADES ALTER COLUMN TRADE_DATE SET NOT NULL;

-- Verify
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM DATA_JEDAIS.INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA = 'FINS__PUBLIC' AND TABLE_NAME = 'FINANCIAL_TRADES'
   AND COLUMN_NAME IN ('ACCOUNT_ID', 'TRADE_DATE', 'SETTLEMENT_DATE', 'SNAPSHOT_DATE');
SELECT COUNT(*) AS n, COUNT_IF(ACCOUNT_ID IS NULL) AS null_keys, COUNT_IF(ACCOUNT_ID LIKE 'TRD-%') AS trd_keys,
       MIN(TRADE_DATE) AS mn, MAX(TRADE_DATE) AS mx
  FROM FINANCIAL_TRADES;
