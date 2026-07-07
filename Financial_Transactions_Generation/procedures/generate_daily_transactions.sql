-- Financial Transactions Generation
-- Database:  DATA_JEDAIS.FINS__PUBLIC
-- Procedure: GENERATE_DAILY_TRANSACTIONS
-- Language:  Snowpark Python 3.11
-- Purpose:   Generate synthetic bank transactions for all active accounts.
--            Idempotent: skips if transactions already exist for today.
--            After insert, rebuilds ACCOUNT_DAILY_BALANCE from full history.
-- Called By: DAILY_TRANSACTION_GENERATOR task via SP_RETRY_WRAPPER
-- Schedule:  Daily at 3:05 AM ET
--
-- Usage:
--   CALL DATA_JEDAIS.FINS__PUBLIC.GENERATE_DAILY_TRANSACTIONS(10);
--   -- Generates ~10 transactions per active account for today

CREATE OR REPLACE PROCEDURE DATA_JEDAIS.FINS__PUBLIC.GENERATE_DAILY_TRANSACTIONS(TRANSACTIONS_PER_ACCOUNT NUMBER)
RETURNS VARCHAR
LANGUAGE PYTHON
RUNTIME_VERSION = '3.11'
PACKAGES = ('snowflake-snowpark-python', 'pandas', 'numpy')
HANDLER = 'generate_transactions'
EXECUTE AS OWNER
AS
$$
import pandas as pd
import numpy as np
import uuid
from datetime import datetime
import random
import time
from snowflake.snowpark import Session

def log_execution(session, task_name, status, rows_inserted=0, accounts_processed=0, error_message=None, duration_ms=0):
    session.sql("""
        INSERT INTO DATA_JEDAIS.FINS__PUBLIC.TASK_EXECUTION_LOG 
        (TASK_NAME, STATUS, ROWS_INSERTED, ACCOUNTS_PROCESSED, ERROR_MESSAGE, DURATION_MS)
        VALUES (?, ?, ?, ?, ?, ?)
    """, params=[task_name, status, rows_inserted, accounts_processed, error_message, duration_ms]).collect()

def generate_amount_for_mcc(mcc_row, account_type='personal'):
    category = str(mcc_row.get('CATEGORY', ''))
    amount_ranges = {
        'Retail outlets': (10, 500), 'Restaurants': (15, 150), 'Fast Food': (5, 30),
        'Hotels': (80, 500), 'Airlines': (150, 1500), 'Gas Stations': (20, 100),
        'Utilities': (50, 300), 'Transportation': (5, 200), 
        'Amusement and entertainment': (10, 200),
        'Professional services and membership organizations': (50, 500),
        'Business services': (30, 400), 'Repair services': (40, 300),
        'Government services': (20, 500), 'Agricultural services': (50, 300),
        'Contracted services': (100, 1000),
    }
    min_amt, max_amt = amount_ranges.get(category, (10, 300))
    if account_type and account_type.lower() == 'business':
        multipliers = {
            'Business services': 2.5, 'Professional services and membership organizations': 2.5,
            'Contracted services': 2.5, 'Utilities': 1.8, 'Hotels': 1.8, 'Airlines': 1.8,
            'Repair services': 1.5, 'Transportation': 1.5
        }
        multiplier = multipliers.get(category, 1.3)
        min_amt *= multiplier
        max_amt *= multiplier
    return round(random.uniform(min_amt, max_amt), 2)

def filter_mccs_for_business(mcc_df):
    business_categories = ['Business services', 'Professional services and membership organizations',
        'Contracted services', 'Repair services', 'Agricultural services', 'Government services']
    business_tran_categories = ['Business Services', 'Bills & Utilities', 'Shopping', 'Auto & Transport', 'Fees & Charges']
    exclude_categories = ['Amusement and entertainment', 'Fast Food']
    filtered = mcc_df[
        (mcc_df['CATEGORY'].isin(business_categories) | mcc_df['TRAN_CATEGORY'].isin(business_tran_categories)) &
        ~mcc_df['CATEGORY'].isin(exclude_categories)
    ]
    return filtered if not filtered.empty else mcc_df

def is_quarterly_bonus_day(date):
    return date.day == 1 and date.month in [1, 4, 7, 10]

def rebuild_daily_balance(session):
    session.sql("TRUNCATE TABLE DATA_JEDAIS.FINS__PUBLIC.ACCOUNT_DAILY_BALANCE").collect()
    session.sql("""
        INSERT INTO DATA_JEDAIS.FINS__PUBLIC.ACCOUNT_DAILY_BALANCE 
        (ACCOUNTID, BALANCE_DATE, OPENING_BALANCE, DAILY_CREDITS, DAILY_DEBITS, CLOSING_BALANCE, TRANSACTION_COUNT)
        WITH daily_totals AS (
            SELECT ACCOUNTID, DATE(TRANSACTIONDATE) as BALANCE_DATE,
                SUM(CASE WHEN TRANSACTION_TYPE = 'Credit' THEN AMOUNT ELSE 0 END) as DAILY_CREDITS,
                SUM(CASE WHEN TRANSACTION_TYPE = 'Debit' THEN AMOUNT ELSE 0 END) as DAILY_DEBITS,
                COUNT(*) as TRANSACTION_COUNT
            FROM DATA_JEDAIS.FINS__PUBLIC.FINANCIAL_TRANSACTIONS GROUP BY ACCOUNTID, DATE(TRANSACTIONDATE)
        ),
        running_balance AS (
            SELECT ACCOUNTID, BALANCE_DATE, DAILY_CREDITS, DAILY_DEBITS, TRANSACTION_COUNT,
                SUM(DAILY_CREDITS - DAILY_DEBITS) OVER (PARTITION BY ACCOUNTID ORDER BY BALANCE_DATE ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) as OPENING_BALANCE,
                SUM(DAILY_CREDITS - DAILY_DEBITS) OVER (PARTITION BY ACCOUNTID ORDER BY BALANCE_DATE ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) as CLOSING_BALANCE
            FROM daily_totals
        )
        SELECT ACCOUNTID, BALANCE_DATE, COALESCE(OPENING_BALANCE, 0), DAILY_CREDITS, DAILY_DEBITS, CLOSING_BALANCE, TRANSACTION_COUNT
        FROM running_balance
    """).collect()

def generate_transactions(session: Session, transactions_per_account: int) -> str:
    start_time = time.time()
    task_name = 'DAILY_TRANSACTION_GENERATOR'
    
    try:
        today_result = session.sql("SELECT CURRENT_DATE() as today").collect()[0]
        today_str = str(today_result['TODAY'])
        today = datetime.strptime(today_str, '%Y-%m-%d').date()
        
        existing = session.sql("""
            SELECT COUNT(*) as cnt FROM DATA_JEDAIS.FINS__PUBLIC.FINANCIAL_TRANSACTIONS 
            WHERE DATE(TRANSACTIONDATE) = CURRENT_DATE()
        """).collect()[0]['CNT']
        
        if existing > 0:
            duration_ms = int((time.time() - start_time) * 1000)
            log_execution(session, task_name, 'SKIPPED', 0, 0, 
                         f'Transactions already exist for today ({existing} found)', duration_ms)
            return f"Skipped - {existing} transactions already exist for today"
        
        accounts_df = session.sql("""
            SELECT SFACCOUNTID, ACCOUNTID, CONTACTID, ACCOUNTTYPE, BONUS_AMOUNT, DIRECT_DEPOSIT_AMOUNT
            FROM DATA_JEDAIS.FINS__PUBLIC.FINANCIAL_TRANSACTION_ACCOUNTS WHERE ACTIVE = TRUE
        """).to_pandas()
        
        if accounts_df.empty:
            duration_ms = int((time.time() - start_time) * 1000)
            log_execution(session, task_name, 'SKIPPED', 0, 0, 'No active accounts found', duration_ms)
            return "No active accounts found"
        
        mcc_df = session.sql("SELECT * FROM DATA_JEDAIS.FINS__PUBLIC.MCC").to_pandas()
        all_transactions = []
        
        for _, account in accounts_df.iterrows():
            account_id = account['ACCOUNTID']
            sf_account_id = account.get('SFACCOUNTID', None)
            contact_id = account.get('CONTACTID', None)
            account_type = account.get('ACCOUNTTYPE', 'personal')
            bonus_amount = float(account.get('BONUS_AMOUNT', 0) or 0)
            direct_deposit = float(account.get('DIRECT_DEPOSIT_AMOUNT', 0) or 0)
            
            available_mccs = filter_mccs_for_business(mcc_df) if account_type and account_type.lower() == 'business' else mcc_df
            num_transactions = random.randint(max(1, transactions_per_account - 3), transactions_per_account + 3)
            
            for _ in range(num_transactions):
                mcc_row = available_mccs.sample(1).iloc[0]
                amount = generate_amount_for_mcc(mcc_row.to_dict(), account_type or 'personal')
                
                transaction = {
                    'ACCOUNTID': account_id,
                    'SFACCOUNTID': sf_account_id,
                    'CONTACTID': contact_id,
                    'TRANSACTIONID': str(uuid.uuid4()),
                    'POSTINGDATE': today_str,
                    'TRANSACTIONDATE': today_str,
                    'AMOUNT': amount,
                    'DESCRIPTION': str(mcc_row.get('DESCRIPTION', 'Purchase')),
                    'TRANSACTION_CATEGORY': str(mcc_row.get('TRAN_CATEGORY', 'Other')),
                    'MCC': int(mcc_row.get('MCC', 0)),
                    'MCC_DESCRIPTION': str(mcc_row.get('DESCRIPTION', '')),
                    'TRANSACTION_STATUS': 'Posted',
                    'CURRENCY': 'USD',
                    'TRANSACTION_TYPE': 'Debit',
                    'SOURCE_TRANSACTION_TYPE': 'Purchase',
                    'DATA_DATE': today_str,
                    'ACCOUNT_TYPE': account_type
                }
                all_transactions.append(transaction)
            
            if today.day == 15 and direct_deposit > 0:
                deposit_txn = {
                    'ACCOUNTID': account_id,
                    'SFACCOUNTID': sf_account_id,
                    'CONTACTID': contact_id,
                    'TRANSACTIONID': str(uuid.uuid4()),
                    'POSTINGDATE': today_str, 'TRANSACTIONDATE': today_str,
                    'AMOUNT': direct_deposit,
                    'DESCRIPTION': 'Direct Deposit' if account_type != 'Business' else 'Business Revenue Deposit',
                    'TRANSACTION_CATEGORY': 'Income', 'MCC': 0, 'MCC_DESCRIPTION': 'Deposit',
                    'TRANSACTION_STATUS': 'Posted', 'CURRENCY': 'USD',
                    'TRANSACTION_TYPE': 'Credit',
                    'SOURCE_TRANSACTION_TYPE': 'Direct Deposit',
                    'DATA_DATE': today_str, 'ACCOUNT_TYPE': account_type
                }
                all_transactions.append(deposit_txn)
            
            if is_quarterly_bonus_day(today) and bonus_amount > 0:
                bonus_txn = {
                    'ACCOUNTID': account_id,
                    'SFACCOUNTID': sf_account_id,
                    'CONTACTID': contact_id,
                    'TRANSACTIONID': str(uuid.uuid4()),
                    'POSTINGDATE': today_str, 'TRANSACTIONDATE': today_str,
                    'AMOUNT': bonus_amount,
                    'DESCRIPTION': 'Quarterly Bonus Credit',
                    'TRANSACTION_CATEGORY': 'Income', 'MCC': 0, 'MCC_DESCRIPTION': 'Bonus',
                    'TRANSACTION_STATUS': 'Posted', 'CURRENCY': 'USD',
                    'TRANSACTION_TYPE': 'Credit',
                    'SOURCE_TRANSACTION_TYPE': 'Bonus',
                    'DATA_DATE': today_str, 'ACCOUNT_TYPE': account_type
                }
                all_transactions.append(bonus_txn)
        
        if all_transactions:
            txn_df = pd.DataFrame(all_transactions)
            session.write_pandas(txn_df, 'FINANCIAL_TRANSACTIONS', auto_create_table=False)
        
        rebuild_daily_balance(session)
        
        duration_ms = int((time.time() - start_time) * 1000)
        rows_inserted = len(all_transactions)
        accounts_processed = len(accounts_df)
        
        log_execution(session, task_name, 'SUCCEEDED', rows_inserted, accounts_processed, None, duration_ms)
        return f"Generated {rows_inserted} transactions for {accounts_processed} accounts in {duration_ms}ms"
        
    except Exception as e:
        duration_ms = int((time.time() - start_time) * 1000)
        error_msg = str(e)[:1000]
        log_execution(session, task_name, 'FAILED', 0, 0, error_msg, duration_ms)
        raise
$$;
