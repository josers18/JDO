# Artifacts

Complete inventory of all database objects in `DATA_JEDAIS.FINS__PUBLIC`.

> **Multi-org Phase A live as of 2026-05-29.** `MASTER_ACCOUNTS` and the 13 Cumulus dataset tables now carry `ORG_ID VARCHAR(18) NOT NULL DEFAULT 'JDO'` as the leading column with PKs promoted to lead with ORG_ID. See [ROLLOUT.md](../../Snowflake_Cumulus_Common/docs/ROLLOUT.md).
>
> **Account migration (2026-06-29).** All objects migrated from GSB13421 `FINS.PUBLIC` to SFDC_DC_TECH_ARCH `DATA_JEDAIS.FINS__PUBLIC`.

---

## Tables

| Table | Rows | Owner | Purpose | Pipeline |
|-------|------|-------|---------|----------|
| MASTER_ACCOUNTS | 36,816 | ACCOUNTADMIN | Current Salesforce Data Cloud account master list (now with ORG_ID) | CSAT/NPS · Cumulus |
| TRADE_GENERATION_CONFIG | 36,756 | ACCOUNTADMIN | Per-account trade generation parameters (frequency, risk, sectors) | Trades |
| FINANCIAL_TRADES | 3,279,536 | ACCOUNTADMIN | Synthetic instrument trades (BUY/SELL) | Trades |
| INSTRUMENT_UNIVERSE | 2,004 | ACCOUNTADMIN | Reference: tradeable instruments (stocks, bonds, ETFs) | Trades |
| CSAT_NPS_DATA | 103,269 | ACCOUNTADMIN | Monthly CSAT + NPS scores per account | CSAT/NPS |
| TASK_EXECUTION_LOG | 549 | ACCOUNTADMIN | Centralized execution log for all scheduled tasks | Shared |
| FINANCIAL_TRANSACTIONS | 16,819 | ACCOUNTADMIN | Synthetic bank transactions (credits/debits) | Transactions |
| FINANCIAL_TRANSACTIONS_XL | 100,000,000 | ACCOUNTADMIN | Large-scale transaction dataset (demo/testing) | Legacy |
| ACCOUNT_BALANCE_TRACKER | 10 | ACCOUNTADMIN | Monthly balance tracking for active accounts | Transactions |
| ACCOUNT_CREDIT_CONFIG | 2 | ACCOUNTADMIN | Direct deposit / bonus configuration for transaction gen | Transactions |
| ACCOUNT_DAILY_BALANCE | 2,127 | ACCOUNTADMIN | Daily balance snapshots for account tracking | Transactions |
| FINANCIAL_TRANSACTION_ACCOUNTS | 2 | ACCOUNTADMIN | Active accounts for transaction generation | Transactions |
| FINANCIAL_ACCOUNT_MASTER | 65 | ACCOUNTADMIN | Master list of financial account types | Reference |
| CUSTOMER | 50,000 | ACCOUNTADMIN | Legacy customer reference table | Legacy |
| ATTRITION_INPUTS | 741 | ACCOUNTADMIN | Attrition model input features | ML / Prediction |
| CSAT_ATTRITION_INPUTS | 741 | ACCOUNTADMIN | Combined CSAT + attrition inputs for modeling | ML / Prediction |
| RETAIL_ATTRITION_TRAINING_DATA | 10,000 | ACCOUNTADMIN | Training dataset for retail attrition model | ML / Prediction |
| BUSINESS_PRODUCT_RECOMMENDATION_SET | 3,500 | ACCOUNTADMIN | Business product recommendation training data | ML / Prediction |
| BUSINESS_PRODUCT_RECOMMENDATION_SUBSET | 4,240 | ACCOUNTADMIN | Business product recommendation subset | ML / Prediction |
| PERSONAL_PRODUCT_RECOMMENDATION_TRAINING_SET | 7,500 | ACCOUNTADMIN | Personal product recommendation training data | ML / Prediction |
| PERSONAL_PRODUCT_RECOMMENDATION_SUBSET | 8,240 | ACCOUNTADMIN | Personal product recommendation subset | ML / Prediction |
| ENROLLMENTS | 741 | ACCOUNTADMIN | Account enrollment tracking (stream-driven) | Enrollments |
| LOAN_DELINQUENCIES_RECOVERIES | 750 | ACCOUNTADMIN | Loan delinquency + recovery data | Reference |
| LOAN_CHARGEOFFS | 201 | ACCOUNTADMIN | Loan charge-off events | Reference |
| SEC_FILINGS | 11 | ACCOUNTADMIN | SEC filing reference data | Reference |
| WEBSITE_PROSPECTS | 1,000 | ACCOUNTADMIN | Web prospect lead data | Reference |
| WEB_ENGAGEMENTS | 157 | ACCOUNTADMIN | Web engagement event data | Reference |
| LEADS_TABLE | 107 | ACCOUNTADMIN | Lead records | Reference |
| ACTIVITIES | 100 | ACCOUNTADMIN | Activity records | Reference |
| TASKS | 100 | ACCOUNTADMIN | Task records | Reference |
| MCC | 324 | ACCOUNTADMIN | Merchant Category Codes reference | Transactions |
| MDPROVIDER | 1,000 | ACCOUNTADMIN | Market data provider reference | Reference |
| PROFILE_MAIN | 2 | ACCOUNTADMIN | Profile configuration | Reference |
| FINANCIAL_MASKING_DATASET | 20 | ACCOUNTADMIN | Data masking reference dataset | Reference |
| TRANSACTIONS_CLONE | 8,748 | ACCOUNTADMIN | Transaction table clone (testing) | Legacy |
| TEST | 1 | ACCOUNTADMIN | Scratch/test table | — |
| **CLARITAS_DEMOGRAPHICS** | 76,272 | ACCOUNTADMIN | Cumulus Plan 1 — synthetic Claritas PRIZM segment demographics, ORG_ID-tagged | Cumulus |
| **MSCI_ESG_SCORES** | 34,170 | ACCOUNTADMIN | Cumulus Plan 2 — BUSINESS-only ESG scores | Cumulus |
| **DNB_BUSINESS_CREDIT** | 34,170 | ACCOUNTADMIN | Cumulus Plan 3 — DnB-style business credit ratings | Cumulus |
| **ESRI_GEO_FOOTPRINT** | 39,981 | ACCOUNTADMIN | Cumulus Plan 4 — geo-keyed (BRANCH_ZIP, PROFILE_MONTH) demographics | Cumulus |
| **CORELOGIC_PROPERTY** | 50,848 | ACCOUNTADMIN | Cumulus Plan 5 — quarterly property records (PERSON-only) | Cumulus |
| **PLAID_HELD_AWAY** | 165,680 | ACCOUNTADMIN | Cumulus Plan 6 — 1:N held-away financial accounts per anchor | Cumulus |
| **WORLD_CHECK_AML** | 1,472,592 | ACCOUNTADMIN | Cumulus Plan 7 — AML screening daily snapshots | Cumulus |
| **MGP_FINANCIAL_PLANS** | 957,141 | ACCOUNTADMIN | Cumulus Plan 8 — MoneyGuidePro-style monthly financial plans | Cumulus |
| **SYNTH_RELATIONSHIP_GRAPH** | 70,897 | ACCOUNTADMIN | Cumulus Plan 9 — directed-edge relationship graph | Cumulus |
| **BOARDEX_EXEC_INTEL** | 957,141 | ACCOUNTADMIN | Cumulus Plan 10 — BUSINESS executive intelligence | Cumulus |
| **ZOOMINFO_FIRMOGRAPHICS** | 34,170 | ACCOUNTADMIN | Cumulus Plan 11 — BUSINESS firmographics | Cumulus |
| **GONG_CALL_SENTIMENT** | 1,104,401 | ACCOUNTADMIN | Cumulus Plan 12 — weekly call sentiment | Cumulus |
| **MOODYS_MARKET_CONTEXT** | 1,446,471 | ACCOUNTADMIN | Cumulus Plan 13 — daily commercial credit risk × 90-day history | Cumulus |

### Staging Tables (Cumulus)

| Table | Rows | Purpose |
|-------|------|---------|
| BOARDEX_EXEC_INTEL_STAGING | 36,816 | Staging for Plan 10 SP |
| CLARITAS_DEMOGRAPHICS_STAGING | 25,424 | Staging for Plan 1 SP |
| CORELOGIC_PROPERTY_STAGING | 25,424 | Staging for Plan 5 SP |
| DNB_BUSINESS_CREDIT_STAGING | 11,392 | Staging for Plan 3 SP |
| ESRI_GEO_FOOTPRINT_STAGING | 13,327 | Staging for Plan 4 SP |
| GONG_CALL_SENTIMENT_STAGING | 36,816 | Staging for Plan 12 SP |
| MGP_FINANCIAL_PLANS_STAGING | 36,816 | Staging for Plan 8 SP |
| MOODYS_MARKET_CONTEXT_STAGING | 11,392 | Staging for Plan 13 SP |
| MSCI_ESG_SCORES_STAGING | 11,392 | Staging for Plan 2 SP |
| PLAID_HELD_AWAY_STAGING | 55,082 | Staging for Plan 6 SP |
| SYNTH_RELATIONSHIP_GRAPH_STAGING | 38,089 | Staging for Plan 9 SP |
| WORLD_CHECK_AML_STAGING | 36,816 | Staging for Plan 7 SP |
| ZOOMINFO_FIRMOGRAPHICS_STAGING | 11,392 | Staging for Plan 11 SP |

---

## Views

| View | Purpose | Source Tables |
|------|---------|--------------|
| VW_ACCOUNT_SUMMARY | Lifetime summary statistics for all active accounts | FINANCIAL_TRANSACTIONS, ACCOUNT_BALANCE_TRACKER |
| VW_CURRENT_MONTH_BALANCES | Current month balance status with account flags | ACCOUNT_DAILY_BALANCE, ACCOUNT_BALANCE_TRACKER |
| V_YTD_FINANCIAL_TRANSACTIONS | Year-to-date financial transactions | FINANCIAL_TRANSACTIONS |
| **V_ACCOUNT_ANCHORS** (v1.2) | Multi-org-additive anchor view — joins MASTER_ACCOUNTS to FINSDC3_DATASHARE; 1 row per active account; ORG_ID-aware | MASTER_ACCOUNTS, FINSDC3_DATASHARE |

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
| DAILY_ACCOUNT_SYNC | `0 3 * * * America/New_York` | TASK_WH | SP_RETRY_WRAPPER('SYNC_NEW_ACCOUNTS()', 2) | started |
| DAILY_TRADE_GENERATOR | `10 3 * * * America/New_York` | LARGE_LOAD | SP_RETRY_WRAPPER('GENERATE_DAILY_TRADES()', 2) | started |
| DAILY_TRANSACTION_GENERATOR | `5 3 * * * America/New_York` | TASK_WH | SP_RETRY_WRAPPER('GENERATE_DAILY_TRANSACTIONS(10)', 2) | started |
| TASK_LOAD_MASTER_ACCOUNTS | `25 3 * * * America/New_York` | MAIN_WH_XS | SP_RETRY_WRAPPER('SP_LOAD_MASTER_ACCOUNTS()', 2) | started |
| TASK_MONTHLY_CSAT | `10 3 1 * * America/New_York` | MAIN_WH_XS | SP_RETRY_WRAPPER('SP_GENERATE_MONTHLY_CSAT()', 2) | started |
| DAILY_JOB_REPORT_TASK | `0 4 * * * America/New_York` | TASK_WH | SP_DAILY_JOB_REPORT() | started |
| ENROLLMENTS_SNAPSHOT_TASK | `1 MINUTE` (stream-driven) | TASK_WH | Inline MERGE on ENROLLMENTS_STREAM | started |
| WEEKLY_BALANCE_REPORT | `10 3 * * 1 America/New_York` | TASK_WH | SELECT from VW_ACCOUNT_SUMMARY | started |

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
| MAIN_WH_XS | X-Small | 60s | Yes | ACCOUNTADMIN | Cumulus data generation SPs |
| TASK_WH | X-Small | 60s | Yes | ACCOUNTADMIN | Scheduled task execution |
| LARGE_LOAD | X-Large | 60s | Yes | ACCOUNTADMIN | Trade generation (heavy compute) |
| PRONTO_DATACLOUD_WH | X-Small | 60s | Yes | ACCOUNTADMIN | Data Cloud zero-copy queries |
| TABLEAU_WH | Medium | 60s | Yes | ACCOUNTADMIN | Tableau analytics |
| COMPUTE_WH | X-Small | 60s | Yes | ACCOUNTADMIN | General compute (default) |
| SNOWFLAKE_LEARNING_WH | X-Small | 300s | Yes | ACCOUNTADMIN | Snowflake provisioning |
