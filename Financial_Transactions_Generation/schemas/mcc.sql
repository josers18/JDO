-- Financial Transactions Generation
-- Database: DATA_JEDAIS.FINS__PUBLIC
-- Table:    MCC
-- Purpose:  Merchant Category Codes reference table. Used by transaction generator
--           to assign realistic merchant categories and descriptions to debit transactions.

CREATE OR REPLACE TABLE DATA_JEDAIS.FINS__PUBLIC.MCC (
    MCC NUMBER(38,0),
    DESCRIPTION VARCHAR(16777216),
    CATEGORY VARCHAR(16777216),
    TRAN_TYPE VARCHAR(16777216),
    TRAN_CATEGORY VARCHAR(16777216)
);
