-- Financial Transactions Generation
-- Database: DATA_JEDAIS.FINS__PUBLIC
-- View:     V_YTD_FINANCIAL_TRANSACTIONS
-- Purpose:  Year-to-date financial transactions from the large 100M-row demo table.
-- Note:     This reads from FINANCIAL_TRANSACTIONS_XL (pre-loaded demo data),
--           NOT from the daily-generated FINANCIAL_TRANSACTIONS table.

CREATE OR REPLACE VIEW DATA_JEDAIS.FINS__PUBLIC.V_YTD_FINANCIAL_TRANSACTIONS AS
SELECT *
FROM DATA_JEDAIS.FINS__PUBLIC.FINANCIAL_TRANSACTIONS_XL
WHERE YEAR("TransactionDate") = YEAR(CURRENT_DATE());
