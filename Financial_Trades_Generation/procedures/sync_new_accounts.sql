-- =============================================================================
-- Procedure: SYNC_NEW_ACCOUNTS()
-- Database:  FINS.PUBLIC
-- Purpose:   Imports new accounts from the Salesforce Data Cloud shared table
--            FINSDC3_DATASHARE."schema_Jedi_Snowflake"."ssot__Account__dlm"
--            into TRADE_GENERATION_CONFIG. Filters for 001% IDs, maps source
--            account types to trading profiles, and batch-inserts in groups of 500.
-- Called by: DAILY_ACCOUNT_SYNC task (midnight ET)
-- Language:  Python 3.11 (Snowpark)
-- Execution: EXECUTE AS OWNER
-- =============================================================================

CREATE OR REPLACE PROCEDURE "SYNC_NEW_ACCOUNTS"()
RETURNS VARCHAR
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('snowflake-snowpark-python')
HANDLER = 'sync_accounts'
EXECUTE AS OWNER
AS '
import time

def sync_accounts(session):
    start_time = time.time()
    task_name = ""ACCOUNT_SYNC""

    try:
        # Get existing count before sync
        existing_count = session.sql(
            ""SELECT COUNT(*) AS cnt FROM FINS.PUBLIC.TRADE_GENERATION_CONFIG""
        ).collect()[0][""CNT""]

        # Get existing account IDs into a Python set for comparison
        existing_ids_rows = session.sql(
            ""SELECT ACCOUNT_ID FROM FINS.PUBLIC.TRADE_GENERATION_CONFIG""
        ).collect()
        existing_ids = {r[""ACCOUNT_ID""] for r in existing_ids_rows}

        # Read source accounts (001% IDs with non-blank names)
        source_rows = session.sql(''''''
            SELECT ""ssot__Id__c"" AS ACCOUNT_ID,
                   ""ssot__Name__c"" AS ACCOUNT_NAME,
                   ""ssot__AccountTypeId__c"" AS ACCOUNT_TYPE_SRC
            FROM FINSDC3_DATASHARE.""schema_Jedi_Snowflake"".""ssot__Account__dlm""
            WHERE ""ssot__Id__c"" LIKE ''001%''
              AND ""ssot__Name__c"" IS NOT NULL
              AND TRIM(""ssot__Name__c"") != ''''
        '''''').collect()

        source_count = len(source_rows)

        # Filter to new accounts only
        new_accounts = [r for r in source_rows if r[""ACCOUNT_ID""] not in existing_ids]
        new_count = len(new_accounts)

        if new_count == 0:
            duration_ms = int((time.time() - start_time) * 1000)
            session.sql(
                ""INSERT INTO FINS.PUBLIC.TASK_EXECUTION_LOG ""
                ""(TASK_NAME, STATUS, ROWS_INSERTED, ACCOUNTS_PROCESSED, ERROR_MESSAGE, DURATION_MS) ""
                ""VALUES (?, ?, ?, ?, ?, ?)"",
                params=[task_name, ""SUCCEEDED"", 0, source_count, ""No new accounts"", duration_ms]
            ).collect()
            return (f""No new accounts found. Source: {source_count}, ""
                    f""Config: {existing_count}. Duration: {duration_ms}ms."")

        # Map account type to config values
        def map_config(acct_type):
            type_map = {
                ''Enterprise'':    (''Institutional'', ''DAILY'',   12, ''Moderate'',     500000),
                ''Mid-Market'':    (''Institutional'', ''DAILY'',    8, ''Moderate'',     300000),
                ''Small Business'':(''Retail'',        ''WEEKLY'',   4, ''Conservative'', 100000),
                ''Client'':        (''Retail'',        ''DAILY'',    6, ''Moderate'',     200000),
                ''Person'':        (''Retail'',        ''MONTHLY'',  3, ''Conservative'',  50000),
                ''Partner'':       (''Institutional'', ''WEEKLY'',  10, ''Aggressive'',   400000),
                ''Investor'':      (''Institutional'', ''DAILY'',   15, ''Aggressive'',   750000),
                ''Consultant'':    (''Retail'',        ''MONTHLY'',  2, ''Conservative'',  75000),
            }
            return type_map.get(acct_type or '''', (''Retail'', ''WEEKLY'', 5, ''Moderate'', 150000))

        # Build batch INSERT
        cols = (""ACCOUNT_ID, ACCOUNT_NAME, ACCOUNT_TYPE, FREQUENCY, ""
                ""TRADES_PER_PERIOD, RISK_PROFILE, MAX_TRADE_VALUE, ACTIVE, NOTES"")
        placeholders = "", "".join([""?""] * 9)
        values_clauses = []
        all_params = []

        for r in new_accounts:
            acct_type, freq, trades, risk, max_val = map_config(r[""ACCOUNT_TYPE_SRC""])
            values_clauses.append(f""({placeholders})"")
            all_params.extend([
                r[""ACCOUNT_ID""], r[""ACCOUNT_NAME""], acct_type, freq,
                trades, risk, max_val, True, ""Auto-imported from ssot__Account__dlm""
            ])

        # Insert in batches of 500 to avoid parameter limits
        batch_size = 500
        inserted = 0
        for i in range(0, len(new_accounts), batch_size):
            batch_clauses = values_clauses[i:i+batch_size]
            batch_params = all_params[i*9:(i+batch_size)*9]
            insert_sql = f""INSERT INTO FINS.PUBLIC.TRADE_GENERATION_CONFIG ({cols}) VALUES {'', ''.join(batch_clauses)}""
            session.sql(insert_sql, params=batch_params).collect()
            inserted += len(batch_clauses)

        duration_ms = int((time.time() - start_time) * 1000)
        final_count = existing_count + inserted

        session.sql(
            ""INSERT INTO FINS.PUBLIC.TASK_EXECUTION_LOG ""
            ""(TASK_NAME, STATUS, ROWS_INSERTED, ACCOUNTS_PROCESSED, ERROR_MESSAGE, DURATION_MS) ""
            ""VALUES (?, ?, ?, ?, ?, ?)"",
            params=[task_name, ""SUCCEEDED"", inserted, source_count, None, duration_ms]
        ).collect()

        return (f""Synced {inserted} new accounts. ""
                f""Source: {source_count} (001% with names). ""
                f""Config total: {final_count}. Duration: {duration_ms}ms."")

    except Exception as e:
        duration_ms = int((time.time() - start_time) * 1000)
        err_msg = str(e)[:2000]
        session.sql(
            ""INSERT INTO FINS.PUBLIC.TASK_EXECUTION_LOG ""
            ""(TASK_NAME, STATUS, ROWS_INSERTED, ACCOUNTS_PROCESSED, ERROR_MESSAGE, DURATION_MS) ""
            ""VALUES (?, ?, ?, ?, ?, ?)"",
            params=[task_name, ""FAILED"", 0, 0, err_msg, duration_ms]
        ).collect()
        raise
';
