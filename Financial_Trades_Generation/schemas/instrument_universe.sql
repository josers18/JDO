-- =============================================================================
-- Table:    INSTRUMENT_UNIVERSE
-- Database: FINS.PUBLIC
-- Purpose:  Reference table of tradeable instruments. Each instrument has a
--           ticker, name, sector, and base price that the trade generation
--           procedures use as a starting point for price jitter calculations.
-- Rows:     2,004
-- PK:       TICKER
-- =============================================================================

CREATE OR REPLACE TABLE FINS.PUBLIC.INSTRUMENT_UNIVERSE (
    TICKER          VARCHAR(10)  NOT NULL,    -- Stock/ETF ticker symbol
    INSTRUMENT_NAME VARCHAR(200),             -- Full instrument name
    SECTOR          VARCHAR(50),              -- Sector classification
    BASE_PRICE      FLOAT,                   -- Base price for jitter calculations

    PRIMARY KEY (TICKER)
);

-- Sector distribution:
--   General        1,358
--   Financials       264
--   Energy           152
--   Technology        75
--   Healthcare        53
--   Consumer          53
--   Industrials       32
--   Communication     17
