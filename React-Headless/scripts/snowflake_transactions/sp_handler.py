

TASK_NAME = 'DAILY_TRANSACTION_GENERATOR'
FT = 'DATA_JEDAIS.FINS__PUBLIC.FINANCIAL_TRANSACTIONS'


def log_execution(session, status, rows_inserted=0, accounts_processed=0, error_message=None, duration_ms=0):
    session.sql("""
        INSERT INTO DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG
        (TASK_NAME, STATUS, ROWS_INSERTED, ACCOUNTS_PROCESSED, ERROR_MESSAGE, DURATION_MS)
        VALUES (?, ?, ?, ?, ?, ?)
    """, params=[TASK_NAME, status, rows_inserted, accounts_processed, error_message, duration_ms]).collect()


def rebuild_daily_balance(session):
    session.sql("TRUNCATE TABLE DATA_JEDAIS.FINS__PUBLIC.ACCOUNT_DAILY_BALANCE").collect()
    session.sql(f"""
        INSERT INTO DATA_JEDAIS.FINS__PUBLIC.ACCOUNT_DAILY_BALANCE
        (ACCOUNTID, BALANCE_DATE, OPENING_BALANCE, DAILY_CREDITS, DAILY_DEBITS, CLOSING_BALANCE, TRANSACTION_COUNT)
        WITH daily_totals AS (
            SELECT ACCOUNTID, DATE(TRANSACTIONDATE) AS BALANCE_DATE,
                SUM(CASE WHEN TRANSACTION_TYPE = 'Credit' THEN AMOUNT ELSE 0 END) AS DAILY_CREDITS,
                SUM(CASE WHEN TRANSACTION_TYPE = 'Debit' THEN AMOUNT ELSE 0 END) AS DAILY_DEBITS,
                COUNT(*) AS TRANSACTION_COUNT
            FROM {FT} WHERE ACCOUNTID IS NOT NULL
            GROUP BY ACCOUNTID, DATE(TRANSACTIONDATE)
        ),
        running_balance AS (
            SELECT ACCOUNTID, BALANCE_DATE, DAILY_CREDITS, DAILY_DEBITS, TRANSACTION_COUNT,
                SUM(DAILY_CREDITS - DAILY_DEBITS) OVER (PARTITION BY ACCOUNTID ORDER BY BALANCE_DATE ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS OPENING_BALANCE,
                SUM(DAILY_CREDITS - DAILY_DEBITS) OVER (PARTITION BY ACCOUNTID ORDER BY BALANCE_DATE ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS CLOSING_BALANCE
            FROM daily_totals
        )
        SELECT ACCOUNTID, BALANCE_DATE, COALESCE(OPENING_BALANCE, 0), DAILY_CREDITS, DAILY_DEBITS, CLOSING_BALANCE, TRANSACTION_COUNT
        FROM running_balance
    """).collect()


def generate_transactions(session, transactions_per_account):
    # transactions_per_account is kept for the task signature; volume now comes from each product's pattern.
    import pandas as pd, time
    start_time = time.time()
    try:
        now = session.sql("SELECT CONVERT_TIMEZONE('America/New_York', CURRENT_TIMESTAMP())::TIMESTAMP_NTZ AS NOW").collect()[0]['NOW']
        today = now.date()
        # Posting lags 0-2 days; settle anything whose posting date has passed.
        session.sql(f"UPDATE {FT} SET TRANSACTION_STATUS = 'Posted' WHERE TRANSACTION_STATUS = 'Pending' AND POSTINGDATE <= ?",
                    params=[now]).collect()
        existing = session.sql(f"SELECT COUNT(*) AS CNT FROM {FT} WHERE DATE(TRANSACTIONDATE) = ?", params=[today]).collect()[0]['CNT']
        if existing > 0:
            log_execution(session, 'SKIPPED', 0, 0, f'Transactions already exist for today ({existing} found)', int((time.time() - start_time) * 1000))
            return f"Skipped - {existing} transactions already exist for today"

        accounts = [r.as_dict() for r in session.table('DATA_JEDAIS.FINS__PUBLIC.FINANCIAL_TRANSACTION_ACCOUNTS').filter('ACTIVE = TRUE').collect()]
        if not accounts:
            log_execution(session, 'SKIPPED', 0, 0, 'No active accounts found', int((time.time() - start_time) * 1000))
            return "No active accounts found"

        rows = list(generate(accounts, today, today, now))
        if rows:
            session.write_pandas(pd.DataFrame(rows, columns=COLUMNS), 'FINANCIAL_TRANSACTIONS',
                                 database='DATA_JEDAIS', schema='FINS__PUBLIC', auto_create_table=False)
        rebuild_daily_balance(session)
        duration_ms = int((time.time() - start_time) * 1000)
        log_execution(session, 'SUCCEEDED', len(rows), len(accounts), None, duration_ms)
        return f"Generated {len(rows)} transactions for {len(accounts)} accounts in {duration_ms}ms"
    except Exception as e:
        log_execution(session, 'FAILED', 0, 0, str(e)[:1000], int((time.time() - start_time) * 1000))
        raise
