-- =============================================================================
-- Table:    TRADE_GENERATION_CONFIG
-- Database: FINS.PUBLIC
-- Purpose:  Control table that defines per-account trade generation parameters.
--           Each account has a frequency (DAILY/WEEKLY/MONTHLY), risk profile,
--           and volume settings. Accounts are auto-imported from Salesforce
--           Data Cloud via SYNC_NEW_ACCOUNTS().
-- Rows:     645 (5 original + 640 imported from org)
-- PK:       ACCOUNT_ID
-- =============================================================================

CREATE OR REPLACE TABLE FINS.PUBLIC.TRADE_GENERATION_CONFIG (
    ACCOUNT_ID          VARCHAR(50)     NOT NULL,    -- Account identifier (TRD-xxx or 001%)
    ACCOUNT_NAME        VARCHAR(200),                -- Display name (from source or manual)
    ACCOUNT_TYPE        VARCHAR(20)     DEFAULT 'Retail',        -- Institutional or Retail
    FREQUENCY           VARCHAR(20)     DEFAULT 'DAILY',         -- DAILY, WEEKLY, or MONTHLY
    TRADES_PER_PERIOD   NUMBER(10,0)    DEFAULT 5,               -- Trades generated per due period
    PREFERRED_SECTORS   VARCHAR(500),                -- Comma-separated sector filter (optional)
    PREFERRED_EXCHANGES VARCHAR(200),                -- Comma-separated exchange filter (optional)
    RISK_PROFILE        VARCHAR(20)     DEFAULT 'Moderate',      -- Aggressive, Moderate, Conservative
    MAX_TRADE_VALUE     NUMBER(15,2)    DEFAULT 500000,          -- Max notional per trade
    ACTIVE              BOOLEAN         DEFAULT TRUE,            -- Trade generation enabled
    LAST_GENERATED_DATE DATE,                        -- Most recent trade date for this account
    CREATED_DATE        TIMESTAMP_NTZ(9) DEFAULT CURRENT_TIMESTAMP(),
    LAST_UPDATED        TIMESTAMP_NTZ(9) DEFAULT CURRENT_TIMESTAMP(),
    NOTES               VARCHAR(500),                -- Provenance notes

    PRIMARY KEY (ACCOUNT_ID)
)
COMMENT = 'Per-account configuration for the automated trade generation pipeline. Accounts are synced from Salesforce Data Cloud and mapped to trading profiles by source account type.';

-- Distribution snapshot (as of April 2026):
--   287 DAILY  accounts (Institutional + Retail)
--   313 WEEKLY accounts (primarily Retail)
--    45 MONTHLY accounts (Person, Consultant types)
