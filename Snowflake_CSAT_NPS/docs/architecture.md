# Architecture

## Entity-Relationship Diagram

```mermaid
erDiagram
    MASTER_ACCOUNTS {
        VARCHAR ACCOUNT_ID PK
        VARCHAR ACCOUNT_NAME
        VARCHAR DATA_SOURCE
        DATE SNAPSHOT_DATE
    }
    CSAT_NPS_DATA {
        NUMBER ROWID PK
        VARCHAR ACCOUNTID FK
        VARCHAR CONTACTID
        NUMBER CSAT_SCORE
        VARCHAR CSAT_DESCRIPTION
        NUMBER NPS_SCORE
        VARCHAR NPS_DESCRIPTION
        DATE SCORE_DATE
    }
    MASTER_ACCOUNTS ||--o{ CSAT_NPS_DATA : "has scores"
```

## Data Flow

```mermaid
flowchart LR
    subgraph Source
        DC["Salesforce Data Cloud<br/>FINSDC3_DATASHARE"]
    end
    subgraph "FINS.PUBLIC"
        MA["MASTER_ACCOUNTS<br/>(daily snapshot)"]
        CSAT["CSAT_NPS_DATA<br/>(monthly scores)"]
    end
    subgraph Procedures
        SP1["SP_LOAD_MASTER_ACCOUNTS<br/>Daily @ 6 AM UTC"]
        SP2["SP_GENERATE_MONTHLY_CSAT<br/>1st of month @ 7 AM UTC"]
    end

    DC -->|"ssot__Account__dlm"| SP1
    SP1 -->|"INSERT snapshot"| MA
    MA -->|"active accounts"| SP2
    CSAT -->|"3-month history"| SP2
    SP2 -->|"INSERT scores"| CSAT
```

## Monthly Pipeline Sequence

```mermaid
sequenceDiagram
    participant CRON as Snowflake Scheduler
    participant TASK as TASK_MONTHLY_CSAT
    participant SP as SP_GENERATE_MONTHLY_CSAT
    participant MA as MASTER_ACCOUNTS
    participant CSAT as CSAT_NPS_DATA

    CRON->>TASK: 1st of month, 7 AM UTC
    TASK->>SP: CALL SP_GENERATE_MONTHLY_CSAT()
    SP->>SP: Compute target_month (previous month)
    SP->>CSAT: DELETE existing rows for target_month
    SP->>MA: SELECT active accounts (latest snapshot)
    SP->>CSAT: SELECT 3-month rolling average per account
    SP->>SP: Apply event model (15% neg / 15% pos / 70% drift)
    SP->>SP: Derive NPS from CSAT via correlation bands
    SP->>CSAT: INSERT new monthly scores
    SP-->>TASK: Return row count summary
```

## Daily Account Sync Sequence

```mermaid
sequenceDiagram
    participant CRON as Snowflake Scheduler
    participant TASK as TASK_LOAD_MASTER_ACCOUNTS
    participant SP as SP_LOAD_MASTER_ACCOUNTS
    participant DC as FINSDC3_DATASHARE
    participant MA as MASTER_ACCOUNTS

    CRON->>TASK: Daily, 6 AM UTC
    TASK->>SP: CALL SP_LOAD_MASTER_ACCOUNTS()
    SP->>MA: DELETE today's snapshot (idempotent)
    SP->>DC: SELECT from ssot__Account__dlm
    SP->>MA: INSERT daily snapshot with SNAPSHOT_DATE
    SP-->>TASK: Return row count summary
```

## Warehouse Strategy

| Warehouse | Size | Usage | Schedule |
|-----------|------|-------|----------|
| `MAIN_WH_XS` | X-Small | Daily account sync | Every day 6 AM UTC |
| `MAIN_WH_XS` | X-Small | Monthly CSAT/NPS generation | 1st of month 7 AM UTC |

Both tasks use `MAIN_WH_XS` (X-Small) as the workload is lightweight -- daily syncs process ~1,400 rows and monthly generation produces ~741 rows.

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Daily snapshots** instead of live views | Track account additions/removals over time; avoid dependency on datashare availability |
| **HASH-based pseudo-randomness** | Deterministic: same account + date always produces same score, enabling reproducible results |
| **3-month rolling average** baseline | Prevents sudden, unrealistic jumps; scores evolve naturally from recent history |
| **15/15/70 event model** | ~30% of accounts experience a significant event each month, matching real-world CSAT volatility |
| **CSAT-to-NPS correlation** | Ensures metrics move together realistically; eliminates contradictory score combinations |
| **Idempotent procedures** | DELETE-before-INSERT pattern allows safe re-runs without data duplication |
| **Dollar-sign delimiters** (`$$`) | Required for Snowflake SQL procedures containing semicolons in the body |
| **`(SELECT CURRENT_DATE)`** wrapper | Snowflake SQL Scripting quirk: `CURRENT_DATE` must be in query context inside `LET` |
