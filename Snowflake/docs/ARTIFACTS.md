# Artifacts

Complete inventory of all database objects in `FINS.PUBLIC`.

---

## Tables

| Table | Rows | Owner | Purpose | Pipeline |
|-------|------|-------|---------|----------|
| MASTER_ACCOUNTS | 36,813 | SYSADMIN | Current Salesforce Data Cloud account master list | CSAT/NPS |
| TRADE_GENERATION_CONFIG | 36,756 | SYSADMIN | Per-account trade generation parameters (frequency, risk, sectors) | Trades |
| FINANCIAL_TRADES | 1,876,216 | SYSADMIN | Synthetic instrument trades (BUY/SELL) | Trades |
| INSTRUMENT_UNIVERSE | 2,004 | SYSADMIN | Reference: tradeable instruments (stocks, bonds, ETFs) | Trades |
| CSAT_NPS_DATA | 29,640 | SYSADMIN | Monthly CSAT + NPS scores per account | CSAT/NPS |
| TASK_EXECUTION_LOG | 184 | SYSADMIN | Centralized execution log for all scheduled tasks | Shared |
| FINANCIAL_TRANSACTIONS | 16,007 | SYSADMIN | Synthetic bank transactions (credits/debits) | Transactions |
| FINANCIAL_TRANSACTIONS_XL | 100,000,000 | SYSADMIN | Large-scale transaction dataset (demo/testing) | Legacy |
| ACCOUNT_BALANCE_TRACKER | 10 | SYSADMIN | Monthly balance tracking for active accounts | Transactions |
| ACCOUNT_CREDIT_CONFIG | 2 | SYSADMIN | Direct deposit / bonus configuration for transaction gen | Transactions |
| ACCOUNT_DAILY_BALANCE | 2,047 | SYSADMIN | Daily balance snapshots for account tracking | Transactions |
| FINANCIAL_TRANSACTION_ACCOUNTS | 2 | SYSADMIN | Active accounts for transaction generation | Transactions |
| FINANCIAL_ACCOUNT_MASTER | 65 | SYSADMIN | Master list of financial account types | Reference |
| CUSTOMER | 50,000 | ACCOUNTADMIN | Legacy customer reference table | Legacy |
| ACCOUNT | 0 | ACCOUNTADMIN | Legacy account table (empty) | Legacy |
| ATTRITION_INPUTS | 741 | SYSADMIN | Attrition model input features | ML / Prediction |
| CSAT_ATTRITION_INPUTS | 741 | SYSADMIN | Combined CSAT + attrition inputs for modeling | ML / Prediction |
| RETAIL_ATTRITION_TRAINING_DATA | 10,000 | SYSADMIN | Training dataset for retail attrition model | ML / Prediction |
| BUSINESS_PRODUCT_RECOMMENDATION_SET | 3,500 | SYSADMIN | Business product recommendation training data | ML / Prediction |
| BUSINESS_PRODUCT_RECOMMENDATION_SUBSET | 4,240 | SYSADMIN | Business product recommendation subset | ML / Prediction |
| PERSONAL_PRODUCT_RECOMMENDATION_TRAINING_SET | 7,500 | SYSADMIN | Personal product recommendation training data | ML / Prediction |
| PERSONAL_PRODUCT_RECOMMENDATION_SUBSET | 8,240 | SYSADMIN | Personal product recommendation subset | ML / Prediction |
| ENROLLMENTS | 741 | SYSADMIN | Account enrollment tracking (stream-driven) | Enrollments |
| LOAN_DELINQUENCIES_RECOVERIES | 750 | SYSADMIN | Loan delinquency + recovery data | Reference |
| LOAN_CHARGEOFFS | 201 | SYSADMIN | Loan charge-off events | Reference |
| SEC_FILINGS | 11 | SYSADMIN | SEC filing reference data | Reference |
| WEBSITE_PROSPECTS | 1,000 | SYSADMIN | Web prospect lead data | Reference |
| WEB_ENGAGEMENTS | 157 | SYSADMIN | Web engagement event data | Reference |
| LEADS_TABLE | 107 | SYSADMIN | Lead records | Reference |
| ACTIVITIES | 100 | SYSADMIN | Activity records | Reference |
| TASKS | 100 | SYSADMIN | Task records | Reference |
| MCC | 324 | SYSADMIN | Merchant Category Codes reference | Transactions |
| MDPROVIDER | 1,000 | SYSADMIN | Market data provider reference | Reference |
| PROFILE_MAIN | 2 | SYSADMIN | Profile configuration | Reference |
| FINANCIAL_MASKING_DATASET | 20 | SYSADMIN | Data masking reference dataset | Reference |
| TRANSACTIONS_CLONE | 8,748 | SYSADMIN | Transaction table clone (testing) | Legacy |
| FINANCIAL_TRADES_EXT | — | SYSADMIN | External table for trades (external stage) | Trades |
| TEST | 1 | SYSADMIN | Scratch/test table | — |

---

## Views

| View | Purpose | Source Tables |
|------|---------|--------------|
| VW_ACCOUNT_SUMMARY | Lifetime summary statistics for all active accounts | FINANCIAL_TRANSACTIONS, ACCOUNT_BALANCE_TRACKER |
| VW_CURRENT_MONTH_BALANCES | Current month balance status with account flags | ACCOUNT_DAILY_BALANCE, ACCOUNT_BALANCE_TRACKER |
| V_YTD_FINANCIAL_TRANSACTIONS | Year-to-date financial transactions | FINANCIAL_TRANSACTIONS |

---

## Stored Procedures (User-Defined)

| Procedure | Language | Signature | Purpose | Called By |
|-----------|----------|-----------|---------|-----------|
| SP_LOAD_MASTER_ACCOUNTS | SQL | `()` → VARCHAR | MERGE accounts from DC datashare (with dedup) | TASK_LOAD_MASTER_ACCOUNTS |
| SP_GENERATE_MONTHLY_CSAT | SQL | `()` → VARCHAR | Generate monthly CSAT/NPS scores | TASK_MONTHLY_CSAT |
| SYNC_NEW_ACCOUNTS | SQL | `()` → VARCHAR | Sync new DC accounts to trade config | DAILY_ACCOUNT_SYNC |
| GENERATE_DAILY_TRADES | Python | `()` → VARCHAR | Generate daily synthetic trades | DAILY_TRADE_GENERATOR |
| GENERATE_DAILY_TRANSACTIONS | SQL | `(NUMBER)` → VARCHAR | Generate daily bank transactions | DAILY_TRANSACTION_GENERATOR |
| GENERATE_HISTORICAL_TRADES | Python | `(DATE, DATE)` → VARCHAR | Backfill trades for a date range | Manual |
| SP_BACKFILL_TRADES | Python | `(DATE)` → VARCHAR | Backfill trades for a specific date | Manual |
| SP_RETRY_WRAPPER | Python | `(VARCHAR, NUMBER)` → VARCHAR | Exponential backoff retry for any SP | All tasks |
| SP_DAILY_JOB_REPORT | Python | `()` → VARCHAR | HTML email report of daily executions | DAILY_JOB_REPORT_TASK |
| GENERATE_DAILY_TRANSACTIONS_DEBUG | SQL | `(NUMBER)` → VARCHAR | Debug version of transaction gen | Manual |

---

## Scheduled Tasks

| Task | Schedule | Warehouse | Calls | State |
|------|----------|-----------|-------|-------|
| DAILY_ACCOUNT_SYNC | `0 0 * * * America/New_York` | TASK_WH | SP_RETRY_WRAPPER('SYNC_NEW_ACCOUNTS()', 2) | started |
| DAILY_TRADE_GENERATOR | `0 1 * * * America/New_York` | LARGE_LOAD | SP_RETRY_WRAPPER('GENERATE_DAILY_TRADES()', 2) | started |
| DAILY_TRANSACTION_GENERATOR | `0 0 * * * America/New_York` | TASK_WH | SP_RETRY_WRAPPER('GENERATE_DAILY_TRANSACTIONS(10)', 2) | started |
| TASK_LOAD_MASTER_ACCOUNTS | `0 6 * * * UTC` | MAIN_WH_XS | SP_RETRY_WRAPPER('SP_LOAD_MASTER_ACCOUNTS()', 2) | started |
| TASK_MONTHLY_CSAT | `0 7 1 * * UTC` | MAIN_WH_XS | SP_RETRY_WRAPPER('SP_GENERATE_MONTHLY_CSAT()', 2) | started |
| DAILY_JOB_REPORT_TASK | `0 8 * * * America/New_York` | TASK_WH | SP_DAILY_JOB_REPORT() | started |
| ENROLLMENTS_SNAPSHOT_TASK | `1 MINUTE` (stream-driven) | TASK_WH | Inline MERGE on ENROLLMENTS_STREAM | started |
| WEEKLY_BALANCE_REPORT | `0 9 * * 1 America/New_York` | TASK_WH | SELECT from VW_ACCOUNT_SUMMARY | suspended |

---

## Notification Integrations

| Integration | Type | Direction | Purpose |
|-------------|------|-----------|---------|
| TASK_EMAIL_ALERTS | EMAIL | OUTBOUND | Daily job report delivery |
| TASK_ERROR_NOTIFICATIONS | EMAIL | OUTBOUND | Error-triggered alerts |

---

## Warehouses

| Warehouse | Size | Auto-Suspend | Auto-Resume | Owner | Primary Use |
|-----------|------|--------------|-------------|-------|-------------|
| MAIN_WH_XS | X-Small | 60s | Yes | SYSADMIN | Default; lightweight SPs |
| TASK_WH | X-Small | 60s | Yes | SYSADMIN | Scheduled task execution |
| LARGE_LOAD | X-Large | 300s | Yes | SYSADMIN | Trade generation (heavy compute) |
| DC_CONNECTION | X-Small | 600s | Yes | SYSADMIN | Data Cloud connector queries |
| LOAD_WH | X-Small | 60s | Yes | SYSADMIN | One-time data loads |
| SNOWFLAKE_LEARNING_WH | X-Small | 300s | Yes | ACCOUNTADMIN | Snowflake provisioning |
| SYSTEM$STREAMLIT_NOTEBOOK_WH | X-Small | 60s | Yes | ACCOUNTADMIN | Streamlit / Notebooks |
