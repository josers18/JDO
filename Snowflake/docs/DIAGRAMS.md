# Diagrams

Consolidated Mermaid diagram reference for the Snowflake data pipelines.

> All diagrams render natively in GitHub markdown. No external image files needed.
>
> **Multi-org Phase A live as of 2026-05-29.** `MASTER_ACCOUNTS` and the 13 Cumulus dataset tables now carry `ORG_ID VARCHAR(18) DEFAULT 'JDO'` as the leading column. For the Cumulus-family lineage diagram see [`ARCHITECTURE.md`](ARCHITECTURE.md#cumulus-dataset-family-13-plans-397m-rows). Per-org rollout runbook: [`../../Snowflake_Cumulus_Common/docs/ROLLOUT.md`](../../Snowflake_Cumulus_Common/docs/ROLLOUT.md).

---

## Monorepo Snowflake Landscape

How the Snowflake layer fits within the JDO monorepo:

```mermaid
graph LR
    subgraph "Salesforce CRM (JDO Demo Org)"
        CH[Customer_Hydration<br/>Python CLI]
        SF[Salesforce Objects<br/>Account, FA, Contact...]
    end

    subgraph "Data Cloud"
        STREAMS[Data Streams<br/>CRM → DC ingestion]
        DMO[Account_demo__dlm<br/>Unified entity]
    end

    subgraph "Snowflake (DATA_JEDAIS.FINS__PUBLIC)"
        DS[FINSDC3_DATASHARE<br/>Inbound secure share]
        MA[MASTER_ACCOUNTS]
        TGC[TRADE_GENERATION_CONFIG]
        FT[FINANCIAL_TRADES<br/>1.87M rows]
        CSAT[CSAT_NPS_DATA<br/>29K rows]
    end

    subgraph "Repo Projects"
        FTG[Financial_Trades_Generation/]
        SCSAT[Snowflake_CSAT_NPS/]
        SFDOCS[Snowflake/ ← this folder]
    end

    CH -->|"seeds 36K accounts"| SF
    SF -->|"Data Cloud streams"| STREAMS
    STREAMS --> DMO
    DMO -->|"inbound share"| DS
    DS --> MA & TGC
    TGC --> FT
    MA --> CSAT

    FTG -.->|"defines"| TGC & FT
    SCSAT -.->|"defines"| MA & CSAT
    SFDOCS -.->|"documents all"| DS & MA & TGC & FT & CSAT
```

---

## Data Lineage (End-to-End)

Full lineage from Salesforce CRM to final Snowflake tables:

```mermaid
flowchart TD
    SF[/"Salesforce CRM<br/>(10K+ Accounts)"/]
    DC[/"Data Cloud<br/>ssot__Account__dlm"/]
    SHARE[("FINSDC3_DATASHARE<br/>Inbound Secure View")]

    MA[("MASTER_ACCOUNTS<br/>36,813 accounts")]
    TGC[("TRADE_GENERATION_CONFIG<br/>36,756 configs")]
    IU[("INSTRUMENT_UNIVERSE<br/>2,004 instruments")]

    FT[("FINANCIAL_TRADES<br/>1.87M trades")]
    CSAT[("CSAT_NPS_DATA<br/>29,640 scores")]
    FTX[("FINANCIAL_TRANSACTIONS<br/>16K txns")]

    LOG[("TASK_EXECUTION_LOG")]
    EMAIL[/"Daily Email Report"/]

    SF -->|"Data Cloud streams"| DC
    DC -->|"Inbound datashare"| SHARE

    SHARE -->|"SP_LOAD_MASTER_ACCOUNTS<br/>MERGE + ROW_NUMBER dedup"| MA
    SHARE -->|"SYNC_NEW_ACCOUNTS<br/>MERGE new accounts"| TGC

    MA -->|"SP_GENERATE_MONTHLY_CSAT<br/>3-month rolling + events"| CSAT
    TGC -->|"GENERATE_DAILY_TRADES<br/>per-account frequency"| FT
    IU -->|"instrument selection"| FT

    TGC -->|"GENERATE_DAILY_TRANSACTIONS"| FTX

    MA & TGC & FT & CSAT & FTX -.->|"execution logging"| LOG
    LOG -->|"SP_DAILY_JOB_REPORT"| EMAIL
```

---

## Daily Execution Timeline

Visual timeline of task execution order across a typical day:

```mermaid
gantt
    title Daily Pipeline Execution (US Eastern)
    dateFormat HH:mm
    axisFormat %H:%M

    section Account Sync
    DAILY_ACCOUNT_SYNC (SYNC_NEW_ACCOUNTS)    :a1, 00:00, 2min
    TASK_LOAD_MASTER_ACCOUNTS (SP_LOAD_MA)    :a2, 01:00, 1min

    section Data Generation
    DAILY_TRADE_GENERATOR (trades)            :g1, 01:00, 5min
    DAILY_TRANSACTION_GENERATOR (txns)        :g2, 00:00, 1min

    section Reporting
    DAILY_JOB_REPORT_TASK (email)             :r1, 08:00, 1min

    section Monthly (1st only)
    TASK_MONTHLY_CSAT (scores)                :m1, 02:00, 2min
```

---

## Retry Wrapper Flow

Decision flow for `SP_RETRY_WRAPPER`:

```mermaid
flowchart TD
    START([Task Triggers]) --> CALL[Call SP_RETRY_WRAPPER]
    CALL --> ATTEMPT{Attempt <= max_retries + 1?}

    ATTEMPT -->|Yes| EXEC[Execute target SP]
    EXEC --> SUCCESS{Success?}

    SUCCESS -->|Yes| LOG_OK[Log SUCCEEDED to<br/>TASK_EXECUTION_LOG]
    LOG_OK --> RETURN_OK([Return result])

    SUCCESS -->|No| LAST{Last attempt?}
    LAST -->|No| WAIT[Wait 30s × 2^attempt]
    WAIT --> ATTEMPT

    LAST -->|Yes| LOG_FAIL[Log FAILED_ALL_RETRIES<br/>to TASK_EXECUTION_LOG]
    LOG_FAIL --> RAISE([RAISE exception])
```

---

## Email Alerting Flow

How `SP_DAILY_JOB_REPORT` generates and sends the daily email:

```mermaid
sequenceDiagram
    participant CRON as Scheduler (8 AM ET)
    participant SP as SP_DAILY_JOB_REPORT
    participant LOG as TASK_EXECUTION_LOG
    participant TH as INFORMATION_SCHEMA.TASK_HISTORY
    participant EMAIL as SYSTEM$SEND_EMAIL
    participant USER as jsifontes@salesforce.com

    CRON->>SP: CALL SP_DAILY_JOB_REPORT()
    SP->>LOG: SELECT yesterday's executions
    SP->>TH: SELECT yesterday's task history
    Note over SP: Build HTML email:<br/>- Color-coded header (green/red/yellow)<br/>- Task table with badges<br/>- Duration + row counts<br/>- Missing task warnings
    SP->>EMAIL: CALL SYSTEM$SEND_EMAIL('TASK_EMAIL_ALERTS', ...)
    EMAIL->>USER: [OK/FAIL] Daily Job Report - YYYY-MM-DD
    SP-->>CRON: Return "Report sent for YYYY-MM-DD"
```

---

## MERGE Deduplication Pattern

How `SP_LOAD_MASTER_ACCOUNTS` handles Data Cloud source duplicates:

```mermaid
flowchart LR
    subgraph Source["Source: ssot__Account__dlm (37,445 rows)"]
        RAW[Raw rows with duplicates<br/>e.g. ID 'abc' appears 3×]
    end

    subgraph Dedup["ROW_NUMBER Dedup"]
        RN[PARTITION BY ssot__Id__c<br/>ORDER BY ssot__DataSourceId__c]
        FILTER[WHERE rn = 1]
    end

    subgraph Target["Target: MASTER_ACCOUNTS (36,813 rows)"]
        MERGE_OP{MERGE ON<br/>ACCOUNT_ID}
        UPDATE[WHEN MATCHED → UPDATE<br/>name, source, date]
        INSERT[WHEN NOT MATCHED → INSERT]
    end

    RAW --> RN --> FILTER
    FILTER -->|"36,813 unique rows"| MERGE_OP
    MERGE_OP --> UPDATE
    MERGE_OP --> INSERT
```
