-- Financial Transactions Generation
-- Database: DATA_JEDAIS.FINS__PUBLIC
-- Table:    ACCOUNT_BALANCE_TRACKER
-- Purpose:  Monthly balance aggregation for all accounts. Tracks credits, debits, utilization.

CREATE OR REPLACE TABLE DATA_JEDAIS.FINS__PUBLIC.ACCOUNT_BALANCE_TRACKER (
    ACCOUNTID VARCHAR(50) NOT NULL,
    PERIOD_YEAR NUMBER(38,0) NOT NULL,
    PERIOD_MONTH NUMBER(38,0) NOT NULL,
    PERIOD_START_DATE DATE,
    PERIOD_END_DATE DATE,
    OPENING_BALANCE NUMBER(15,2) DEFAULT 0,
    TOTAL_CREDITS NUMBER(15,2) DEFAULT 0,
    TOTAL_DEBITS NUMBER(15,2) DEFAULT 0,
    NET_BALANCE NUMBER(15,2) DEFAULT 0,
    AVAILABLE_CREDIT NUMBER(15,2) DEFAULT 0 COMMENT '80% of total credits - maximum allowed debits to maintain 20% buffer',
    CREDIT_UTILIZATION_PCT NUMBER(5,2) DEFAULT 0 COMMENT 'Percentage of available credit used (total_debits / available_credit * 100)',
    TRANSACTION_COUNT NUMBER(38,0) DEFAULT 0,
    LAST_TRANSACTION_DATE TIMESTAMP_NTZ(9),
    LAST_UPDATED TIMESTAMP_NTZ(9) DEFAULT CURRENT_TIMESTAMP(),
    PRIMARY KEY (ACCOUNTID, PERIOD_YEAR, PERIOD_MONTH)
) COMMENT = 'Monthly balance tracking for all accounts. Updated by transaction generator to prevent overdrafts.';
