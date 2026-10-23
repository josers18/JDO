#!/usr/bin/env bash
# Emit the GENERATE_DAILY_TRANSACTIONS DDL (gen_core.py + sp_handler.py inlined).
# Deploy: ./build_sp.sh > sp.sql && snow sql -c SFDC_DC_TECH_ARCH --role ACCOUNTADMIN -f sp.sql
cd "$(dirname "$0")"
cat <<'SQL'
CREATE OR REPLACE PROCEDURE DATA_JEDAIS.FINS__PUBLIC.GENERATE_DAILY_TRANSACTIONS("TRANSACTIONS_PER_ACCOUNT" NUMBER(38,0))
COPY GRANTS
RETURNS VARCHAR
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('snowflake-snowpark-python','pandas')
HANDLER = 'generate_transactions'
COMMENT = 'Product-aware daily transactions for every ACTIVE row in FINANCIAL_TRANSACTION_ACCOUNTS (one per open FinServ__FinancialAccount__c). See React-Headless docs/SNOWFLAKE_DATA_FIXES.md section 7.'
EXECUTE AS OWNER
AS $$
SQL
cat gen_core.py sp_handler.py
echo '$$;'
