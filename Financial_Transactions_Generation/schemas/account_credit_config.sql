-- Financial Transactions Generation
-- Database: DATA_JEDAIS.FINS__PUBLIC
-- Table:    ACCOUNT_CREDIT_CONFIG
-- Purpose:  Configuration for direct deposits and bonuses per account.
--           Used by GENERATE_DAILY_TRANSACTIONS to determine credit amounts and schedules.

CREATE OR REPLACE TABLE DATA_JEDAIS.FINS__PUBLIC.ACCOUNT_CREDIT_CONFIG (
    ACCOUNTID VARCHAR(50) NOT NULL,
    SFACCOUNTID VARCHAR(18),
    CONTACTID VARCHAR(18),
    ACCOUNT_TYPE VARCHAR(20),
    DIRECT_DEPOSIT_AMOUNT NUMBER(15,2) NOT NULL COMMENT 'Amount for each direct deposit (occurs twice monthly on DD_DAY_1 and DD_DAY_2)',
    BONUS_AMOUNT NUMBER(15,2) NOT NULL COMMENT 'Amount for bonus payments (frequency set by BONUS_FREQUENCY)',
    DD_DAY_1 NUMBER(38,0) DEFAULT 1,
    DD_DAY_2 NUMBER(38,0) DEFAULT 15,
    BONUS_FREQUENCY VARCHAR(20) DEFAULT 'QUARTERLY',
    ACTIVE BOOLEAN DEFAULT TRUE,
    CREATED_DATE TIMESTAMP_NTZ(9) DEFAULT CURRENT_TIMESTAMP(),
    LAST_UPDATED TIMESTAMP_NTZ(9) DEFAULT CURRENT_TIMESTAMP(),
    NOTES VARCHAR(500),
    PRIMARY KEY (ACCOUNTID)
) COMMENT = 'Configuration table for account direct deposits and bonuses. Used by transaction generator to ensure proper credit amounts.';
