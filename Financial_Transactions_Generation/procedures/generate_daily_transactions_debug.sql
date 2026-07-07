-- Financial Transactions Generation
-- Database:  DATA_JEDAIS.FINS__PUBLIC
-- Procedure: GENERATE_DAILY_TRANSACTIONS_DEBUG
-- Language:  Snowpark Python 3.9
-- Purpose:   Debug version with verbose step-by-step output.
--            Does NOT rebuild daily balance. Does NOT check idempotency.
--            Use for troubleshooting only.
--
-- Usage:
--   CALL DATA_JEDAIS.FINS__PUBLIC.GENERATE_DAILY_TRANSACTIONS_DEBUG(5);

-- See the full procedure source in Snowflake (GET_DDL).
-- This file documents the existence and purpose of the debug procedure.
-- The production procedure is generate_daily_transactions.sql.

CREATE OR REPLACE PROCEDURE DATA_JEDAIS.FINS__PUBLIC.GENERATE_DAILY_TRANSACTIONS_DEBUG(TRANSACTIONS_PER_ACCOUNT NUMBER)
RETURNS VARCHAR
LANGUAGE PYTHON
RUNTIME_VERSION = '3.9'
PACKAGES = ('snowflake-snowpark-python', 'pandas', 'numpy')
HANDLER = 'generate_transactions_debug'
EXECUTE AS OWNER
AS
$$
# Debug version - see Snowflake for full source
# Key differences from production:
#   - Returns semicolon-separated step messages instead of raising
#   - Does NOT call rebuild_daily_balance()
#   - Does NOT check for existing transactions (always generates)
#   - Uses Python 3.9 (legacy)
#
# Output format: "Step 1: ...; Step 2: ...; SUCCESS! Wrote N transactions"
# On error:      "Step 1: ...; ERROR: <message>"

import pandas as pd
import numpy as np
import uuid
from datetime import datetime, timedelta
import random
from snowflake.snowpark import Session

def generate_transactions_debug(session, transactions_per_account):
    """Debug version with verbose output"""
    messages = []
    try:
        messages.append("Step 1: Loading accounts...")
        config_query = """
        SELECT a.ACCOUNTID, a.SFACCOUNTID, a.CONTACTID, a.ACCOUNTTYPE, a.ACTIVE,
               c.DIRECT_DEPOSIT_AMOUNT, c.BONUS_AMOUNT, c.DD_DAY_1, c.DD_DAY_2, c.BONUS_FREQUENCY
        FROM DATA_JEDAIS.FINS__PUBLIC.FINANCIAL_TRANSACTION_ACCOUNTS a
        JOIN DATA_JEDAIS.FINS__PUBLIC.ACCOUNT_CREDIT_CONFIG c ON a.ACCOUNTID = c.ACCOUNTID
        WHERE a.ACTIVE = TRUE AND c.ACTIVE = TRUE
        """
        accounts_df = session.sql(config_query).to_pandas()
        messages.append(f"Found {len(accounts_df)} active accounts with credit config")
        if len(accounts_df) == 0:
            return "; ".join(messages) + "; ERROR: No active accounts found"
        
        messages.append("Step 2: Loading MCC data...")
        mcc_df = session.table("DATA_JEDAIS.FINS__PUBLIC.MCC").to_pandas()
        messages.append(f"Found {len(mcc_df)} MCC records")
        mcc_df.columns = [col.strip().upper() for col in mcc_df.columns]
        debit_mccs = mcc_df[mcc_df['TRAN_TYPE'] == 'Debit']
        messages.append(f"Found {len(debit_mccs)} debit MCCs")
        
        today = datetime.now()
        messages.append(f"Today is {today.strftime('%Y-%m-%d')} (Day {today.day})")
        
        transactions = []
        for _, account in accounts_df.iterrows():
            for i in range(min(transactions_per_account, len(debit_mccs))):
                mcc_row = debit_mccs.sample(n=1).iloc[0]
                trans_date = today.replace(hour=0, minute=0, second=0) + timedelta(seconds=random.randint(0, 86399))
                amount = round(random.uniform(10, 300), 2)
                transactions.append({
                    'ACCOUNTID': account['ACCOUNTID'],
                    'TRANSACTIONID': str(uuid.uuid4()),
                    'POSTINGDATE': trans_date, 'TRANSACTIONDATE': trans_date,
                    'AMOUNT': amount, 'DESCRIPTION': mcc_row['DESCRIPTION'],
                    'TRANSACTION_CATEGORY': mcc_row['TRAN_CATEGORY'],
                    'MCC': int(mcc_row['MCC']), 'MCC_DESCRIPTION': mcc_row['DESCRIPTION'],
                    'TRANSACTION_STATUS': 'Posted', 'CURRENCY': 'USD',
                    'TRANSACTION_TYPE': 'Debit', 'SOURCE_TRANSACTION_TYPE': 'Debit',
                    'DATA_DATE': today,
                    'SFACCOUNTID': account['SFACCOUNTID'],
                    'CONTACTID': account['CONTACTID'] if account['CONTACTID'] else '',
                    'ACCOUNT_TYPE': account['ACCOUNTTYPE']
                })
        
        messages.append(f"Generated {len(transactions)} transactions")
        if transactions:
            df = pd.DataFrame(transactions)
            date_columns = ['POSTINGDATE', 'TRANSACTIONDATE', 'DATA_DATE']
            for col in date_columns:
                if col in df.columns:
                    df[col] = pd.to_datetime(df[col]).dt.tz_localize(None)
            snowpark_df = session.create_dataframe(df)
            snowpark_df.write.mode("append").save_as_table("FINANCIAL_TRANSACTIONS")
            messages.append(f"SUCCESS! Wrote {len(df)} transactions to database")
        
        return "; ".join(messages)
    except Exception as e:
        return "; ".join(messages) + f"; ERROR: {str(e)}"
$$;
