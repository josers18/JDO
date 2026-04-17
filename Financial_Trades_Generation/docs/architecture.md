# Architecture and Data Flow

## System Overview

The Financial Trades Generation system is a Snowflake-native data pipeline that produces realistic synthetic trade data. It runs entirely within Snowflake using scheduled tasks, Python stored procedures (Snowpark), and reference/configuration tables.

## Entity Relationship Diagram

```mermaid
erDiagram
    TRADE_GENERATION_CONFIG ||--o{ FINANCIAL_TRADES : "generates"
    INSTRUMENT_UNIVERSE ||--o{ FINANCIAL_TRADES : "provides instruments"
    TASK_EXECUTION_LOG {
        varchar LOG_ID PK
        varchar TASK_NAME
        timestamp EXECUTION_TIME
        varchar STATUS
        number ROWS_INSERTED
        number ACCOUNTS_PROCESSED
        varchar ERROR_MESSAGE
        number DURATION_MS
    }
    TRADE_GENERATION_CONFIG {
        varchar ACCOUNT_ID PK
        varchar ACCOUNT_NAME
        varchar ACCOUNT_TYPE
        varchar FREQUENCY
        number TRADES_PER_PERIOD
        varchar PREFERRED_SECTORS
        varchar PREFERRED_EXCHANGES
        varchar RISK_PROFILE
        number MAX_TRADE_VALUE
        boolean ACTIVE
        date LAST_GENERATED_DATE
    }
    INSTRUMENT_UNIVERSE {
        varchar TICKER PK
        varchar INSTRUMENT_NAME
        varchar SECTOR
        float BASE_PRICE
    }
    FINANCIAL_TRADES {
        varchar TRADE_ID PK
        varchar ORDER_ID
        varchar ACCOUNT_ID FK
        timestamp TRADE_DATE
        varchar INSTRUMENT_IDENTIFIER FK
        float PRICE
        number QUANTITY
        float TOTAL_TRADE
        float FEES
        varchar TRADE_SIDE
        varchar EXCHANGE
        varchar CURRENCY
        varchar TRADE_STATUS
    }
```

## Data Flow Diagram

```mermaid
graph TB
    subgraph "External Sources"
        SF["Salesforce Data Cloud<br/>FINSDC3_DATASHARE<br/>ssot__Account__dlm"]
    end

    subgraph "Snowflake Scheduled Tasks"
        T1["DAILY_ACCOUNT_SYNC<br/>Midnight ET<br/>TASK_WH (X-Small)"]
        T2["DAILY_TRADE_GENERATOR<br/>1:00 AM ET<br/>TASK_WH (X-Small)"]
    end

    subgraph "Stored Procedures"
        P1["SYNC_NEW_ACCOUNTS()<br/>Python 3.11 / Snowpark"]
        P2["GENERATE_DAILY_TRADES()<br/>Python 3.11 / Snowpark"]
        P3["GENERATE_HISTORICAL_TRADES()<br/>Python 3.11 / Snowpark"]
    end

    subgraph "Reference Data"
        IU["INSTRUMENT_UNIVERSE<br/>2,004 tickers / 8 sectors"]
    end

    subgraph "Configuration"
        CFG["TRADE_GENERATION_CONFIG<br/>645 accounts"]
    end

    subgraph "Output"
        FT["FINANCIAL_TRADES<br/>1.5M+ rows"]
        LOG["TASK_EXECUTION_LOG<br/>Audit trail"]
    end

    SF -->|"filter 001% IDs"| P1
    T1 --> P1
    P1 -->|"insert new accounts"| CFG
    P1 -->|"log result"| LOG

    CFG -->|"active + due accounts"| P2
    IU -->|"instruments + base prices"| P2
    T2 --> P2
    P2 -->|"batch INSERT 500/batch"| FT
    P2 -->|"log result"| LOG
    P2 -->|"update LAST_GENERATED_DATE"| CFG

    CFG --> P3
    IU --> P3
    P3 -->|"batch INSERT 500/batch"| FT
    P3 -->|"progress every 50 days"| LOG
```

## Daily Pipeline Sequence

```mermaid
sequenceDiagram
    participant CRON as Snowflake Scheduler
    participant SYNC as DAILY_ACCOUNT_SYNC
    participant SP1 as SYNC_NEW_ACCOUNTS()
    participant CFG as TRADE_GENERATION_CONFIG
    participant GEN as DAILY_TRADE_GENERATOR
    participant SP2 as GENERATE_DAILY_TRADES()
    participant IU as INSTRUMENT_UNIVERSE
    participant FT as FINANCIAL_TRADES
    participant LOG as TASK_EXECUTION_LOG

    Note over CRON: Midnight ET
    CRON->>SYNC: trigger
    SYNC->>SP1: CALL
    SP1->>CFG: SELECT existing ACCOUNT_IDs
    SP1->>SP1: Query FINSDC3_DATASHARE for 001% accounts
    SP1->>SP1: Filter new accounts (Python set diff)
    SP1->>SP1: Map account types to trading profiles
    SP1->>CFG: INSERT new accounts (batch 500)
    SP1->>LOG: INSERT execution result

    Note over CRON: 1:00 AM ET (1 hour gap)
    CRON->>GEN: trigger
    GEN->>SP2: CALL
    SP2->>IU: SELECT all instruments
    SP2->>CFG: SELECT active accounts
    loop For each active account
        SP2->>SP2: Check _is_due(frequency, last_gen, today)
        SP2->>SP2: Filter instruments by preferred sectors
        SP2->>SP2: Generate N trades with risk-based parameters
    end
    SP2->>FT: INSERT trades (batch 500)
    SP2->>CFG: UPDATE LAST_GENERATED_DATE per account
    SP2->>LOG: INSERT execution result
```

## Warehouse Strategy

| Warehouse | Size | Purpose | Used By |
|---|---|---|---|
| `TASK_WH` | X-Small | Daily automated operations | `DAILY_ACCOUNT_SYNC`, `DAILY_TRADE_GENERATOR` |
| `LARGE_LOAD` | X-Large | Bulk historical backfill | `GENERATE_HISTORICAL_TRADES()` (manual) |

The daily tasks run on X-Small since they process a single day's trades (~3,100 per run). Historical backfill requires X-Large to handle hundreds of days and millions of rows without timeouts.

## Key Design Decisions

1. **Python Snowpark over SQL**: Trade generation requires complex randomization (weighted choices, jitter, UUID generation) that is more naturally expressed in Python than SQL.

2. **EXECUTE AS OWNER**: Procedures run with owner privileges to access shared database objects. This introduces a limitation: temporary tables cannot be created inside these procedures.

3. **Batch INSERT pattern**: Trades are accumulated in Python lists and inserted in batches of 500 using parameterized `INSERT INTO ... VALUES` statements. This avoids DataFrame overhead and provides predictable performance.

4. **Frequency gating in Python**: The `_is_due()` function runs client-side (in the procedure) rather than as a SQL filter, because the logic depends on per-account state that evolves as the procedure iterates through days.

5. **1-hour task gap**: Account sync at midnight, trade generation at 1 AM. This ensures newly imported accounts are committed and visible before the generator reads them.

6. **Resume capability**: The historical backfill procedure reads existing trades from `FINANCIAL_TRADES` to initialize the `last_gen` dict, allowing it to resume correctly across chunked executions without duplicating WEEKLY/MONTHLY triggers.
