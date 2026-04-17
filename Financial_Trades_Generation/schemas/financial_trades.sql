-- =============================================================================
-- Table:    FINANCIAL_TRADES
-- Database: FINS.PUBLIC
-- Purpose:  Primary output table for all generated synthetic trades.
--           Each row represents a single trade execution with full market
--           metadata including price, quantity, fees, exchange, and settlement.
-- Rows:     ~1.5M+ (grows daily)
-- PK:       TRADE_ID (UUID)
-- =============================================================================

CREATE OR REPLACE TABLE FINS.PUBLIC.FINANCIAL_TRADES (
    TRADE_ID               VARCHAR(36)     NOT NULL,    -- UUID, unique trade identifier
    ORDER_ID               VARCHAR(36)     NOT NULL,    -- UUID, groups related trades
    ACCOUNT_ID             VARCHAR(50)     NOT NULL,    -- FK to TRADE_GENERATION_CONFIG
    TRADE_DATE             TIMESTAMP_TZ(9) NOT NULL,    -- Trade execution date (with timezone)
    TRADE_TIME             VARCHAR(8),                  -- HH:MM:SS format trade time
    SETTLEMENT_DATE        TIMESTAMP_TZ(9),             -- T+2 business days from trade date
    SNAPSHOT_DATE          TIMESTAMP_TZ(9),             -- Point-in-time snapshot reference
    INSTRUMENT_IDENTIFIER  VARCHAR(10)     NOT NULL,    -- Ticker symbol (FK to INSTRUMENT_UNIVERSE)
    INSTRUMENT_NAME        VARCHAR(200),                -- Full instrument name
    INSTRUMENT_CATEGORY    VARCHAR(50),                 -- Sector/category from INSTRUMENT_UNIVERSE
    PRICE                  FLOAT           NOT NULL,    -- Execution price (jittered from base)
    QUANTITY               NUMBER(10,0)    NOT NULL,    -- Number of shares/units (1-2000)
    TOTAL_TRADE            FLOAT           NOT NULL,    -- PRICE * QUANTITY
    FEES                   FLOAT,                       -- Transaction fees (1.5-25 bps)
    TRADE_SIDE             VARCHAR(4)      NOT NULL,    -- BUY or SELL
    TRADE_TYPE             VARCHAR(20),                 -- Market Order, Limit Order, Stop Order
    TRADE_CONDITION        VARCHAR(10),                 -- None, FOK (Fill or Kill), IOC (Immediate or Cancel)
    TRADE_STATUS           VARCHAR(20),                 -- Pending (20%), Confirmed (60%), Cancelled (20%)
    EXCHANGE               VARCHAR(10),                 -- NYSE, NASDAQ, LSE, HKEX, JPX
    CURRENCY               VARCHAR(3),                  -- USD, EUR, GBP (weighted by exchange)
    SOURCE_SYSTEM          VARCHAR(50),                 -- Simulated source platform (20 systems)
    COUNTERPARTY_BROKER_ID VARCHAR(10),                 -- BRK-XXXX format broker identifier
    REGULATORY_CODE        VARCHAR(10),                 -- REG-XXXX format compliance code
    COMMENTS               VARCHAR(500),                -- Auto-generated trade commentary
    CREATED_AT             TIMESTAMP_NTZ(9) DEFAULT CURRENT_TIMESTAMP(),

    PRIMARY KEY (TRADE_ID)
);
