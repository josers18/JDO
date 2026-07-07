# Architecture

Detailed architecture of the Snowflake data pipelines in `DATA_JEDAIS.FINS__PUBLIC`.

> **Cumulus dataset family** (13 SPs, ~6.4M rows live as of 2026-07-07) is documented separately. See [`../../Snowflake_Cumulus_Common/AGENTS.md`](../../Snowflake_Cumulus_Common/AGENTS.md) and the multi-org rollout runbook at [`../../Snowflake_Cumulus_Common/docs/ROLLOUT.md`](../../Snowflake_Cumulus_Common/docs/ROLLOUT.md).
>
> **Phase A multi-org migration** (commit `c9119d32`, 2026-05-29) added `ORG_ID VARCHAR(18) NOT NULL DEFAULT 'JDO'` as the leading column on `MASTER_ACCOUNTS` and the 13 Cumulus dataset tables. `V_ACCOUNT_ANCHORS` is now v1.2 and exposes `ORG_ID` as its first column. PKs were promoted to lead with `ORG_ID`. JDO existing loaders continue working unchanged via the DEFAULT backstop.

---

## Entity Relationship Diagram

```mermaid
erDiagram
    MASTER_ACCOUNTS {
        VARCHAR ORG_ID PK "Tenant id (DEFAULT 'JDO') — Phase A multi-org additive"
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

    subgraph Tasks["Scheduled Tasks (CRON — America/New_York)"]
        T_SYNC[DAILY_ACCOUNT_SYNC<br/>3:00 AM ET]
        T_TRADE[DAILY_TRADE_GENERATOR<br/>3:10 AM ET]
        T_TXN[DAILY_TRANSACTION_GENERATOR<br/>3:05 AM ET]
        T_MA[TASK_LOAD_MASTER_ACCOUNTS<br/>3:25 AM ET]
        T_CSAT[TASK_MONTHLY_CSAT<br/>1st of month 3:10 AM ET]
        T_REPORT[DAILY_JOB_REPORT<br/>4:00 AM ET]
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

    subgraph Tables["DATA_JEDAIS.FINS__PUBLIC Tables"]
        MA[MASTER_ACCOUNTS<br/>36,816 rows]
        TGC[TRADE_GENERATION_CONFIG<br/>36,756 rows]
        FT[FINANCIAL_TRADES<br/>3.28M rows]
        FTX[FINANCIAL_TRANSACTIONS<br/>16.8K rows]
        CSAT[CSAT_NPS_DATA<br/>103,269 rows]
        IU[INSTRUMENT_UNIVERSE<br/>2,004 rows]
        LOG[TASK_EXECUTION_LOG<br/>549 rows]
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

    CRON->>TASK: 3:10 AM ET trigger
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

    CRON->>TASK: 3:25 AM ET trigger
    TASK->>RW: CALL SP_RETRY_WRAPPER('SP_LOAD_MASTER_ACCOUNTS()', 2)
    RW->>SP: Attempt 1
    SP->>DS: SELECT with ROW_NUMBER() dedup
    Note over SP: ROW_NUMBER() OVER<br/>(PARTITION BY ssot__Id__c<br/>ORDER BY ssot__DataSourceId__c)<br/>WHERE rn = 1
    SP->>MA: MERGE (update existing + insert new)
    SP->>LOG: INSERT (SUCCEEDED, 36816, duration)
    SP-->>RW: Return "Merged 36816 rows on YYYY-MM-DD"
    RW-->>TASK: Return "Succeeded on attempt 1: ..."
```

---

## Warehouse Strategy

| Warehouse | Size | Auto-Suspend | Purpose | Tasks |
|-----------|------|--------------|---------|-------|
| MAIN_WH_XS | X-Small | 60s | Cumulus data generation SPs; lightweight queries | TASK_LOAD_MASTER_ACCOUNTS, TASK_MONTHLY_CSAT, Cumulus daily/weekly/monthly |
| TASK_WH | X-Small | 60s | General task execution | DAILY_ACCOUNT_SYNC, DAILY_TRANSACTION_GENERATOR, DAILY_JOB_REPORT_TASK, ENROLLMENTS_SNAPSHOT_TASK, WEEKLY_BALANCE_REPORT |
| LARGE_LOAD | X-Large | 60s | Heavy compute (trade gen) | DAILY_TRADE_GENERATOR |

---

## Retry Strategy (SP_RETRY_WRAPPER)

All scheduled tasks invoke their target procedure through `SP_RETRY_WRAPPER`:

```sql
CALL DATA_JEDAIS.FINS__PUBLIC.SP_RETRY_WRAPPER('DATA_JEDAIS.FINS__PUBLIC.GENERATE_DAILY_TRADES()', 2);
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
| **`ORG_ID` first column, additive backward-compat** (Phase A multi-org) | Adding `ORG_ID VARCHAR(18) DEFAULT 'JDO'` to every dataset table makes the schema multi-tenant-ready without invalidating existing JDO loaders. PKs were promoted to lead with ORG_ID; SP MERGE clauses now include `tgt.ORG_ID = src.ORG_ID` in their ON. The `V_ACCOUNT_ANCHORS` view is the single binding point — change the view's filter when adding org #2, no per-SP rewrites needed. See [`../../Snowflake_Cumulus_Common/docs/ROLLOUT.md`](../../Snowflake_Cumulus_Common/docs/ROLLOUT.md). |
| **Account migration (2026-06-29)** | All objects migrated from GSB13421 `FINS.PUBLIC` to SFDC_DC_TECH_ARCH `DATA_JEDAIS.FINS__PUBLIC`. Schema uses double-underscore convention to represent the logical database.schema pairing within the consolidated DATA_JEDAIS database. |

---

## Cumulus dataset family (13 plans, ~6.4M rows)

The Cumulus pipelines live alongside this hub but are documented in their own packages. Architecture overview:

```mermaid
flowchart LR
    subgraph FINSDC3 [FINSDC3_DATASHARE inbound]
        SHARE[ssot__Account__dlm]
    end
    subgraph CUMULUS [Snowflake_Cumulus_Common]
        MA2[MASTER_ACCOUNTS<br/>+ ORG_ID]
        VA[V_ACCOUNT_ANCHORS v1.2<br/>+ ORG_ID first column]
        CC[cumulus_common<br/>seed.py · coverage.py]
    end
    subgraph PLANS [13 dataset SPs]
        SP1[SP_GENERATE_CLARITAS_DEMOGRAPHICS]
        SP2[SP_GENERATE_MSCI_ESG_SCORES]
        SP3[...11 more SPs...]
    end
    subgraph TABLES [13 dataset tables in FINS__PUBLIC]
        T1[CLARITAS_DEMOGRAPHICS<br/>76,272 rows]
        T8[MGP_FINANCIAL_PLANS<br/>957,141 rows]
        T13[MOODYS_MARKET_CONTEXT<br/>1,446,471 rows]
    end
    subgraph DC [Salesforce Data Cloud]
        DLO[13 DLOs<br/>__dll]
        DMO[13 DMOs<br/>__dlm · hasMappings=true]
    end

    SHARE --> VA
    MA2 --> VA
    VA -->|audience read<br/>incl ORG_ID| SP1
    VA -->|audience read<br/>incl ORG_ID| SP2
    VA -->|audience read<br/>incl ORG_ID| SP3
    CC -.->|imports inlined| SP1
    CC -.->|imports inlined| SP2
    CC -.->|imports inlined| SP3
    SP1 -->|MERGE batch 100K| T1
    SP1 -.->|MERGE batch 100K| T8
    SP1 -.->|MERGE batch 100K| T13
    T1 -->|Direct_Access<br/>Federate / Zero Copy| DLO
    T8 -->|Direct_Access| DLO
    T13 -->|Direct_Access| DLO
    DLO -->|Einstein auto-map<br/>via Data Stream UI| DMO
```

Per-plan details live in each `Snowflake_<dataset>/AGENTS.md` (boundaries, conventions, gotchas, salts, audience SQL). The shared infrastructure conventions live in [`../../Snowflake_Cumulus_Common/AGENTS.md`](../../Snowflake_Cumulus_Common/AGENTS.md). For multi-org rollout to additional Salesforce orgs, see [`../../Snowflake_Cumulus_Common/docs/ROLLOUT.md`](../../Snowflake_Cumulus_Common/docs/ROLLOUT.md).
