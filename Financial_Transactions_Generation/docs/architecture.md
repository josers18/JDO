# Architecture

Detailed architecture of the Financial Transactions Generation pipeline in `DATA_JEDAIS.FINS__PUBLIC`.

---

## Entity Relationship Diagram

```mermaid
erDiagram
    FINANCIAL_TRANSACTION_ACCOUNTS {
        VARCHAR SFACCOUNTID "Salesforce Account ID"
        VARCHAR ACCOUNTID "Internal account ID (e.g., CC-123456789)"
        VARCHAR CONTACTID "Optional contact reference"
        VARCHAR ACCOUNTTYPE "Personal or Business"
        NUMBER DIRECT_DEPOSIT_AMOUNT "DD amount"
        NUMBER BONUS_AMOUNT "Bonus amount"
        BOOLEAN ACTIVE "Generation enabled"
    }

    ACCOUNT_CREDIT_CONFIG {
        VARCHAR ACCOUNTID PK "Internal account ID"
        VARCHAR SFACCOUNTID "Salesforce Account ID"
        VARCHAR ACCOUNT_TYPE "Personal or Business"
        NUMBER DIRECT_DEPOSIT_AMOUNT "DD amount per occurrence"
        NUMBER BONUS_AMOUNT "Bonus amount per occurrence"
        NUMBER DD_DAY_1 "First DD day of month (default 1)"
        NUMBER DD_DAY_2 "Second DD day of month (default 15)"
        VARCHAR BONUS_FREQUENCY "QUARTERLY (default)"
        BOOLEAN ACTIVE "Config active"
    }

    MCC {
        NUMBER MCC PK "Merchant Category Code"
        VARCHAR DESCRIPTION "Merchant description"
        VARCHAR CATEGORY "Industry category"
        VARCHAR TRAN_TYPE "Debit or Credit"
        VARCHAR TRAN_CATEGORY "Transaction category bucket"
    }

    FINANCIAL_TRANSACTIONS {
        VARCHAR TRANSACTIONID PK "UUID"
        VARCHAR ACCOUNTID FK "Links to FINANCIAL_TRANSACTION_ACCOUNTS"
        TIMESTAMP POSTINGDATE "Posting timestamp"
        TIMESTAMP TRANSACTIONDATE "Transaction timestamp"
        NUMBER AMOUNT "Transaction amount"
        VARCHAR DESCRIPTION "Merchant/transaction description"
        VARCHAR TRANSACTION_CATEGORY "Category bucket"
        NUMBER MCC FK "Merchant Category Code"
        VARCHAR TRANSACTION_TYPE "Credit or Debit"
        VARCHAR SOURCE_TRANSACTION_TYPE "Purchase/Direct Deposit/Bonus"
        VARCHAR CURRENCY "USD"
        VARCHAR ACCOUNT_TYPE "Personal or Business"
    }

    ACCOUNT_DAILY_BALANCE {
        VARCHAR ACCOUNTID PK "Internal account ID"
        DATE BALANCE_DATE PK "Day"
        NUMBER OPENING_BALANCE "Start of day balance"
        NUMBER DAILY_CREDITS "Total credits for day"
        NUMBER DAILY_DEBITS "Total debits for day"
        NUMBER CLOSING_BALANCE "End of day balance"
        NUMBER TRANSACTION_COUNT "Transactions that day"
    }

    ACCOUNT_BALANCE_TRACKER {
        VARCHAR ACCOUNTID PK "Internal account ID"
        NUMBER PERIOD_YEAR PK "Year"
        NUMBER PERIOD_MONTH PK "Month"
        NUMBER OPENING_BALANCE "Start of period balance"
        NUMBER TOTAL_CREDITS "Month credits"
        NUMBER TOTAL_DEBITS "Month debits"
        NUMBER NET_BALANCE "Credits minus debits"
        NUMBER CREDIT_UTILIZATION_PCT "Utilization percentage"
    }

    FINANCIAL_TRANSACTION_ACCOUNTS ||--|| ACCOUNT_CREDIT_CONFIG : "config"
    FINANCIAL_TRANSACTION_ACCOUNTS ||--o{ FINANCIAL_TRANSACTIONS : "generates"
    MCC ||--o{ FINANCIAL_TRANSACTIONS : "categorizes"
    FINANCIAL_TRANSACTIONS ||--o{ ACCOUNT_DAILY_BALANCE : "aggregates to"
    ACCOUNT_DAILY_BALANCE }o--|| ACCOUNT_BALANCE_TRACKER : "rolls up to"
```

---

## Data Flow

```mermaid
flowchart TD
    subgraph Config["Configuration Tables"]
        FTA[FINANCIAL_TRANSACTION_ACCOUNTS<br/>2 active accounts]
        ACC[ACCOUNT_CREDIT_CONFIG<br/>DD amounts, bonus config]
        MCC[MCC<br/>324 merchant codes]
    end

    subgraph Task["Scheduled Task"]
        T[DAILY_TRANSACTION_GENERATOR<br/>3:05 AM ET]
    end

    subgraph Procedure["GENERATE_DAILY_TRANSACTIONS(10)"]
        CHK[Check: transactions exist today?]
        GEN[Generate debits<br/>~10 per account, MCC-sampled]
        DD[Generate credits<br/>DD on 15th, bonus quarterly]
        BAL[Rebuild ACCOUNT_DAILY_BALANCE<br/>TRUNCATE + re-derive]
    end

    subgraph Output["Output"]
        FT[FINANCIAL_TRANSACTIONS<br/>16,819 rows]
        ADB[ACCOUNT_DAILY_BALANCE<br/>2,127 rows]
        LOG[TASK_EXECUTION_LOG]
    end

    subgraph Views["Views Layer"]
        V1[VW_ACCOUNT_SUMMARY<br/>Lifetime stats]
        V2[VW_CURRENT_MONTH_BALANCES<br/>Current month + status flags]
        V3[V_YTD_FINANCIAL_TRANSACTIONS<br/>YTD filter on XL table]
    end

    T -->|SP_RETRY_WRAPPER| CHK
    CHK -->|"No existing → proceed"| GEN
    CHK -->|"Existing → SKIP"| LOG
    FTA --> GEN
    ACC --> DD
    MCC --> GEN
    GEN --> FT
    DD --> FT
    FT --> BAL
    BAL --> ADB
    GEN --> LOG
    FT --> V2
    ADB --> V2
    FT --> V1
```

---

## Execution Sequence

```mermaid
sequenceDiagram
    participant CRON as Snowflake Scheduler
    participant TASK as DAILY_TRANSACTION_GENERATOR
    participant RW as SP_RETRY_WRAPPER
    participant SP as GENERATE_DAILY_TRANSACTIONS
    participant FTA as FINANCIAL_TRANSACTION_ACCOUNTS
    participant MCC as MCC
    participant FT as FINANCIAL_TRANSACTIONS
    participant ADB as ACCOUNT_DAILY_BALANCE
    participant LOG as TASK_EXECUTION_LOG

    CRON->>TASK: 3:05 AM ET trigger
    TASK->>RW: CALL SP_RETRY_WRAPPER('GENERATE_DAILY_TRANSACTIONS(10)', 2)
    RW->>SP: Attempt 1
    SP->>FT: Check: COUNT(*) WHERE DATE(TRANSACTIONDATE) = TODAY
    alt Transactions already exist
        SP->>LOG: INSERT (SKIPPED, "already exist")
        SP-->>RW: Return "Skipped - N transactions already exist"
    else No transactions for today
        SP->>FTA: Read active accounts (2)
        SP->>MCC: Read merchant codes (324)
        Note over SP: For each account:<br/>sample MCCs → generate amounts<br/>→ check DD day → check bonus day
        SP->>FT: INSERT batch (~20-24 transactions)
        SP->>ADB: TRUNCATE + rebuild from all FT history
        SP->>LOG: INSERT (SUCCEEDED, rows, duration)
        SP-->>RW: Return "Generated N transactions for 2 accounts"
    end
    RW-->>TASK: Return result
```

---

## Balance Rebuild Logic

After every successful transaction generation, the SP rebuilds `ACCOUNT_DAILY_BALANCE`:

1. **TRUNCATE** the table (destructive but deterministic)
2. **Re-derive** from all `FINANCIAL_TRANSACTIONS` using a window function:
   - Group by ACCOUNTID + DATE(TRANSACTIONDATE)
   - Calculate DAILY_CREDITS, DAILY_DEBITS, TRANSACTION_COUNT
   - Compute OPENING_BALANCE as cumulative sum of prior days
   - Compute CLOSING_BALANCE as cumulative sum including current day

This ensures the daily balance table is always consistent with the transaction history, even if transactions are manually inserted or deleted.

---

## Views

| View | Source | Purpose |
|------|--------|---------|
| VW_ACCOUNT_SUMMARY | ACCOUNT_CREDIT_CONFIG + ACCOUNT_BALANCE_TRACKER | Lifetime credits, debits, balance, utilization per account |
| VW_CURRENT_MONTH_BALANCES | ACCOUNT_BALANCE_TRACKER + ACCOUNT_CREDIT_CONFIG | Current month with ACCOUNT_STATUS flag (GOOD_STANDING, HIGH_UTILIZATION, OVERDRAWN) |
| V_YTD_FINANCIAL_TRANSACTIONS | FINANCIAL_TRANSACTIONS_XL | YTD filter on the large 100M-row demo table (NOT the daily-generated table) |
