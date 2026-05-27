# Architecture

Detailed architecture of the Snowflake data pipelines in `FINS.PUBLIC`.

---

## Entity Relationship Diagram

```mermaid
erDiagram
    MASTER_ACCOUNTS {
        VARCHAR ACCOUNT_ID PK "Salesforce Account ID (ssot__Id__c)"
        VARCHAR ACCOUNT_NAME "Account display name"
        VARCHAR DATA_SOURCE "Originating DC data source"
        DATE SNAPSHOT_DATE "Last refresh date"
    }

    TRADE_GENERATION_CONFIG {
        VARCHAR ACCOUNT_ID PK "Salesforce Account ID"
        VARCHAR ACCOUNT_NAME "Display name"
        VARCHAR ACCOUNT_TYPE "Retail/Wealth/SmallBiz/Commercial"
        VARCHAR TRADE_FREQUENCY "daily/weekly/monthly"
        VARCHAR RISK_PROFILE "conservative/moderate/aggressive"
        NUMBER MAX_TRADE_VALUE "Max single trade value"
        NUMBER MIN_TRADE_VALUE "Min single trade value"
        VARCHAR PREFERRED_SECTORS "Comma-sep sector list"
        VARCHAR DATA_SOURCE "DC data source ID"
        DATE SYNC_DATE "Last sync date"
    }

    FINANCIAL_TRADES {
        NUMBER TRADE_ID PK "Auto-increment trade ID"
        VARCHAR ACCOUNT_ID FK "Links to TRADE_GENERATION_CONFIG"
        VARCHAR INSTRUMENT_ID FK "Links to INSTRUMENT_UNIVERSE"
        VARCHAR TRADE_TYPE "BUY or SELL"
        NUMBER QUANTITY "Shares traded"
        NUMBER PRICE "Execution price"
        NUMBER TOTAL_VALUE "quantity * price"
        NUMBER FEES "Transaction fees"
        VARCHAR CURRENCY "Trade currency"
        VARCHAR EXCHANGE "Exchange venue"
        DATE TRADE_DATE "Execution date"
        TIMESTAMP CREATED_AT "Record creation timestamp"
    }

    INSTRUMENT_UNIVERSE {
        VARCHAR INSTRUMENT_ID PK "Unique instrument ID"
        VARCHAR SYMBOL "Ticker symbol"
        VARCHAR NAME "Full instrument name"
        VARCHAR SECTOR "Industry sector"
        VARCHAR EXCHANGE "Primary exchange"
        NUMBER BASE_PRICE "Reference price"
        VARCHAR CURRENCY "Denomination currency"
        BOOLEAN IS_ACTIVE "Trading status"
    }

    CSAT_NPS_DATA {
        NUMBER ROWID PK "Monotonic row ID"
        VARCHAR ACCOUNTID FK "Links to MASTER_ACCOUNTS"
        VARCHAR CONTACTID "Reserved (NULL)"
        NUMBER CSAT_SCORE "Satisfaction score (20-100)"
        VARCHAR CSAT_DESCRIPTION "Poor/Fair/Good/Very Good/Excellent"
        NUMBER NPS_SCORE "Net Promoter Score (0-10)"
        VARCHAR NPS_DESCRIPTION "Detractor/Passives/Promoter"
        DATE SCORE_DATE "Month the score represents"
    }

    TASK_EXECUTION_LOG {
        VARCHAR LOG_ID PK "UUID"
        VARCHAR TASK_NAME "Procedure/task identifier"
        TIMESTAMP EXECUTION_TIME "Start time"
        VARCHAR STATUS "SUCCEEDED or FAILED"
        NUMBER ROWS_INSERTED "Rows affected"
        NUMBER ACCOUNTS_PROCESSED "Accounts touched"
        VARCHAR ERROR_MESSAGE "Error details (NULL on success)"
        NUMBER DURATION_MS "Execution duration"
    }

    MASTER_ACCOUNTS ||--o{ CSAT_NPS_DATA : "monthly scores"
    MASTER_ACCOUNTS ||--o| TRADE_GENERATION_CONFIG : "sync config"
    TRADE_GENERATION_CONFIG ||--o{ FINANCIAL_TRADES : "generates trades"
    INSTRUMENT_UNIVERSE ||--o{ FINANCIAL_TRADES : "traded instrument"
```

---

## Data Flow

```mermaid
flowchart TD
    subgraph External["External Sources"]
        SF[Salesforce CRM]
        DC[Data Cloud]
        DS[FINSDC3_DATASHARE<br/>ssot__Account__dlm]
    end

    subgraph Tasks["Scheduled Tasks (CRON)"]
        T_SYNC[DAILY_ACCOUNT_SYNC<br/>midnight ET]
        T_TRADE[DAILY_TRADE_GENERATOR<br/>1 AM ET]
        T_TXN[DAILY_TRANSACTION_GENERATOR<br/>midnight ET]
        T_MA[TASK_LOAD_MASTER_ACCOUNTS<br/>6 AM UTC]
        T_CSAT[TASK_MONTHLY_CSAT<br/>1st of month]
        T_REPORT[DAILY_JOB_REPORT<br/>8 AM ET]
    end

    subgraph Procedures["Stored Procedures"]
        RW[SP_RETRY_WRAPPER<br/>Python · 2 retries · exp backoff]
        SP_SYNC[SYNC_NEW_ACCOUNTS]
        SP_TRADE[GENERATE_DAILY_TRADES<br/>Python · Snowpark]
        SP_TXN[GENERATE_DAILY_TRANSACTIONS]
        SP_MA[SP_LOAD_MASTER_ACCOUNTS<br/>SQL · MERGE + dedup]
        SP_CSAT[SP_GENERATE_MONTHLY_CSAT<br/>SQL · MERGE]
        SP_REPORT[SP_DAILY_JOB_REPORT<br/>Python · HTML email]
    end

    subgraph Tables["FINS.PUBLIC Tables"]
        MA[MASTER_ACCOUNTS<br/>36,813 rows]
        TGC[TRADE_GENERATION_CONFIG<br/>36,756 rows]
        FT[FINANCIAL_TRADES<br/>1.87M rows]
        FTX[FINANCIAL_TRANSACTIONS<br/>16K rows]
        CSAT[CSAT_NPS_DATA<br/>29,640 rows]
        IU[INSTRUMENT_UNIVERSE<br/>2,004 rows]
        LOG[TASK_EXECUTION_LOG<br/>184 rows]
    end

    subgraph Output["Outputs"]
        EMAIL[Daily Email Report]
    end

    SF -->|"hydrates accounts"| DC
    DC -->|"inbound share"| DS

    T_SYNC --> RW --> SP_SYNC
    T_TRADE --> RW --> SP_TRADE
    T_TXN --> RW --> SP_TXN
    T_MA --> RW --> SP_MA
    T_CSAT --> RW --> SP_CSAT
    T_REPORT --> SP_REPORT

    DS -->|"reads + dedup"| SP_SYNC
    DS -->|"reads + dedup"| SP_MA

    SP_SYNC -->|"MERGE"| TGC
    SP_TRADE -->|"INSERT"| FT
    SP_TXN -->|"INSERT"| FTX
    SP_MA -->|"MERGE"| MA
    SP_CSAT -->|"MERGE"| CSAT
    SP_REPORT -->|"reads"| LOG
    SP_REPORT -->|"sends"| EMAIL

    SP_TRADE -.->|"reads config"| TGC
    SP_TRADE -.->|"reads instruments"| IU
    SP_CSAT -.->|"reads accounts"| MA

    SP_SYNC & SP_TRADE & SP_TXN & SP_MA & SP_CSAT -->|"logs"| LOG
```

---

## Daily Pipeline Sequence

```mermaid
sequenceDiagram
    participant CRON as Snowflake Scheduler
    participant TASK as DAILY_TRADE_GENERATOR
    participant RW as SP_RETRY_WRAPPER
    participant SP as GENERATE_DAILY_TRADES
    participant TGC as TRADE_GENERATION_CONFIG
    participant IU as INSTRUMENT_UNIVERSE
    participant FT as FINANCIAL_TRADES
    participant LOG as TASK_EXECUTION_LOG

    CRON->>TASK: 1 AM ET trigger
    TASK->>RW: CALL SP_RETRY_WRAPPER('GENERATE_DAILY_TRADES()', 2)
    RW->>SP: Attempt 1
    SP->>TGC: Read active account configs
    SP->>IU: Read instrument universe
    Note over SP: For each account:<br/>frequency check → instrument filter<br/>→ price jitter → quantity → fees
    SP->>FT: INSERT batch (~5K trades)
    SP->>LOG: INSERT (SUCCEEDED, rows, duration)
    SP-->>RW: Return "Generated X trades for YYYY-MM-DD"
    RW-->>TASK: Return "Succeeded on attempt 1: ..."

    Note over RW: On failure: wait 30s, retry.<br/>On 2nd failure: wait 60s, retry.<br/>On 3rd failure: log FAILED_ALL_RETRIES, RAISE.
```

---

## Master Accounts Sync Sequence

```mermaid
sequenceDiagram
    participant CRON as Snowflake Scheduler
    participant TASK as TASK_LOAD_MASTER_ACCOUNTS
    participant RW as SP_RETRY_WRAPPER
    participant SP as SP_LOAD_MASTER_ACCOUNTS
    participant DS as FINSDC3_DATASHARE
    participant MA as MASTER_ACCOUNTS
    participant LOG as TASK_EXECUTION_LOG

    CRON->>TASK: 6 AM UTC trigger
    TASK->>RW: CALL SP_RETRY_WRAPPER('SP_LOAD_MASTER_ACCOUNTS()', 2)
    RW->>SP: Attempt 1
    SP->>DS: SELECT with ROW_NUMBER() dedup
    Note over SP: ROW_NUMBER() OVER<br/>(PARTITION BY ssot__Id__c<br/>ORDER BY ssot__DataSourceId__c)<br/>WHERE rn = 1
    SP->>MA: MERGE (update existing + insert new)
    SP->>LOG: INSERT (SUCCEEDED, 36813, duration)
    SP-->>RW: Return "Merged 36813 rows on YYYY-MM-DD"
    RW-->>TASK: Return "Succeeded on attempt 1: ..."
```

---

## Warehouse Strategy

| Warehouse | Size | Auto-Suspend | Purpose | Tasks |
|-----------|------|--------------|---------|-------|
| MAIN_WH_XS | X-Small | 60s | Default; lightweight queries | TASK_LOAD_MASTER_ACCOUNTS, TASK_MONTHLY_CSAT |
| TASK_WH | X-Small | 60s | General task execution | DAILY_ACCOUNT_SYNC, DAILY_TRANSACTION_GENERATOR, DAILY_JOB_REPORT_TASK |
| LARGE_LOAD | X-Large | 300s | Heavy compute (trade gen) | DAILY_TRADE_GENERATOR |
| DC_CONNECTION | X-Small | 600s | Data Cloud connector queries | Manual / ad-hoc |
| LOAD_WH | X-Small | 60s | Legacy / one-time loads | Manual |

---

## Retry Strategy (SP_RETRY_WRAPPER)

All scheduled tasks invoke their target procedure through `SP_RETRY_WRAPPER`:

```sql
CALL FINS.PUBLIC.SP_RETRY_WRAPPER('FINS.PUBLIC.GENERATE_DAILY_TRADES()', 2);
```

| Attempt | Wait Before | Action |
|---------|-------------|--------|
| 1 | — | Execute procedure |
| 2 | 30 seconds | Retry on exception |
| 3 | 60 seconds | Retry on exception |
| — | — | Log `FAILED_ALL_RETRIES` to TASK_EXECUTION_LOG, then RAISE |

The wrapper is **Snowpark Python** (`EXECUTE AS OWNER`) so it can call arbitrary procedures by name and catch Snowflake exceptions generically.

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **MERGE + ROW_NUMBER dedup** on account sync | Data Cloud `ssot__Account__dlm` contains duplicate rows per account from multi-source ingestion. ROW_NUMBER collapses duplicates before MERGE prevents "Duplicate row detected" errors. |
| **HASH-based pseudo-randomness** (not RANDOM()) | Deterministic: `HASH(ACCOUNT_ID \|\| date)` produces the same score/trade for the same inputs. Enables reproducibility and debugging without seed management. |
| **Retry wrapper as shared utility** | Transient failures (warehouse contention, datashare latency) are common in scheduled pipelines. Centralized retry with exponential backoff avoids duplicating logic across procedures. |
| **Single TASK_EXECUTION_LOG** for all pipelines | Unified monitoring, alerting, and daily reporting. One table to query for health across both projects. |
| **Daily email report** | Immediate visibility into pipeline health without needing to log into Snowsight. Red/green HTML report makes failures obvious. |
| **EXECUTE AS OWNER** on datashare-reading SPs | Avoids granting inbound share privileges to the task-runner role; owner (SYSADMIN) has the share grants. |
| **One row per account** in MASTER_ACCOUNTS (not daily snapshots) | Historical tracking isn't needed — downstream consumers want "current state." MERGE in-place is simpler and eliminates table growth. |
| **X-Large warehouse for trades only** | Trade generation processes 36K+ accounts with instrument filtering, price computation, and batch inserts. XS would take 10x longer and risk timeout. All other tasks are lightweight. |
