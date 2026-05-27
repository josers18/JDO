# Environment

Snowflake connection details, warehouse configuration, permissions, and external data sources.

---

## Connection Details

| Setting | Value |
|---------|-------|
| **Account** | GSB13421 |
| **Region** | (default) |
| **Database** | FINS |
| **Schema** | PUBLIC |
| **Role** | SYSADMIN |
| **Default Warehouse** | MAIN_WH_XS |

### Connection String (SnowSQL / CLI)

```
snowsql -a GSB13421 -u <username> -d FINS -s PUBLIC -w MAIN_WH_XS -r SYSADMIN
```

---

## Warehouses

| Warehouse | Size | Auto-Suspend | Auto-Resume | Purpose | Monthly Use |
|-----------|------|--------------|-------------|---------|-------------|
| MAIN_WH_XS | X-Small | 60s | Yes | Default queries, lightweight SPs (CSAT, Master Accounts) | Low |
| TASK_WH | X-Small | 60s | Yes | Scheduled task execution (account sync, transactions, reports) | Medium |
| LARGE_LOAD | X-Large | 300s | Yes | Trade generation (processes 36K+ accounts per run) | High |
| DC_CONNECTION | X-Small | 600s | Yes | Data Cloud connector / ad-hoc datashare queries | Low |
| LOAD_WH | X-Small | 60s | Yes | One-time bulk data loads | Occasional |

**Cost note:** LARGE_LOAD is the primary credit consumer. It runs once daily for ~5 minutes. TASK_WH runs 3-4 tasks/day at ~1 minute each. MAIN_WH_XS handles 2 daily tasks at <10 seconds each.

---

## Permissions

### Role Hierarchy

```
ACCOUNTADMIN
  └── SYSADMIN (owns all FINS.PUBLIC objects)
        └── (task execution context)
```

### Object Ownership

| Object Type | Owner | Notes |
|-------------|-------|-------|
| All tables | SYSADMIN | Except ACCOUNT, CUSTOMER (ACCOUNTADMIN — legacy) |
| All procedures | SYSADMIN | All user-defined SPs |
| All tasks | SYSADMIN | Created by JSIFONTES |
| Notification integrations | SYSADMIN | TASK_EMAIL_ALERTS, TASK_ERROR_NOTIFICATIONS |
| Warehouses | SYSADMIN | Except SNOWFLAKE_LEARNING_WH, SYSTEM$STREAMLIT_NOTEBOOK_WH (ACCOUNTADMIN) |

### Execution Context

| Procedure | Execute As | Reason |
|-----------|-----------|--------|
| SP_LOAD_MASTER_ACCOUNTS | CALLER | Reads inbound datashare (SYSADMIN grants on share) |
| SP_GENERATE_MONTHLY_CSAT | CALLER | Standard table access |
| GENERATE_DAILY_TRADES | OWNER | Snowpark Python requires OWNER context for session management |
| SP_RETRY_WRAPPER | OWNER | Needs to call arbitrary SPs via `session.sql()` |
| SP_DAILY_JOB_REPORT | OWNER | Needs access to SYSTEM$SEND_EMAIL and notification integrations |
| SYNC_NEW_ACCOUNTS | CALLER | Reads inbound datashare |

---

## External Data Sources

### FINSDC3_DATASHARE (Inbound)

| Property | Value |
|----------|-------|
| Share type | Inbound secure share (Salesforce Data Cloud) |
| Provider | Salesforce Data Cloud org (JDO demo org) |
| Schema path | `FINSDC3_DATASHARE."schema_Jedi_Snowflake"` |
| Primary object | `"ssot__Account__dlm"` (Account DMO) |
| Row count | ~37,445 (includes duplicates; 36,813 distinct accounts) |
| Refresh | Near-real-time via Data Cloud streaming; visible in Snowflake within hours |

**Caveats:**
- Schema name (`schema_Jedi_Snowflake`) is assigned by Data Cloud and may change if the space is recreated
- Column names use double-quote identifiers (e.g., `"ssot__Id__c"`, `"ssot__Name__c"`)
- Contains duplicate rows per `ssot__Id__c` from multi-source Data Cloud ingestion — always deduplicate before use
- To verify the share is accessible: `SHOW SHARES INBOUND`

### Columns Used

| DC Column | Maps To | Used By |
|-----------|---------|---------|
| `ssot__Id__c` | ACCOUNT_ID | SP_LOAD_MASTER_ACCOUNTS, SYNC_NEW_ACCOUNTS |
| `ssot__Name__c` | ACCOUNT_NAME | SP_LOAD_MASTER_ACCOUNTS, SYNC_NEW_ACCOUNTS |
| `ssot__DataSourceId__c` | DATA_SOURCE | SP_LOAD_MASTER_ACCOUNTS, SYNC_NEW_ACCOUNTS |
| `ssot__AccountType__c` | ACCOUNT_TYPE | SYNC_NEW_ACCOUNTS (mapped to trade params) |

---

## Notification Integrations

### TASK_EMAIL_ALERTS

| Property | Value |
|----------|-------|
| Type | EMAIL |
| Direction | OUTBOUND |
| Used by | SP_DAILY_JOB_REPORT |
| Recipient | jsifontes@salesforce.com |
| Content | HTML daily execution summary |

### TASK_ERROR_NOTIFICATIONS

| Property | Value |
|----------|-------|
| Type | EMAIL |
| Direction | OUTBOUND |
| Used by | Error-triggered alerts (future) |
| Recipient | jsifontes@salesforce.com |

### Setup Commands

```sql
-- Create notification integration (already exists)
CREATE OR REPLACE NOTIFICATION INTEGRATION TASK_EMAIL_ALERTS
    TYPE = EMAIL
    ENABLED = TRUE;

-- Verify integrations
SHOW NOTIFICATION INTEGRATIONS;

-- Test email delivery
CALL SYSTEM$SEND_EMAIL(
    'TASK_EMAIL_ALERTS',
    'jsifontes@salesforce.com',
    'Test: Snowflake Email Integration',
    '<h1>Test</h1><p>Email integration is working.</p>',
    'text/html'
);
```

---

## Network & Security

| Aspect | Configuration |
|--------|--------------|
| Network policies | None (default Snowflake access) |
| IP allowlisting | Not configured |
| MFA | Account-level setting |
| SSO | Not configured |
| Data encryption | Snowflake-managed (AES-256, automatic) |
| Time Travel | 1 day (default for all tables) |
| Fail-safe | 7 days (Enterprise feature) |

---

## Maintenance Notes

- **Warehouse sizing:** Monitor LARGE_LOAD execution time in TASK_EXECUTION_LOG. If avg exceeds 10 minutes, consider upgrading to 2X-Large.
- **Storage growth:** FINANCIAL_TRADES grows ~5K rows/day (~150K/month). At current rate, it will reach ~3.5M rows by end of 2026. No pruning strategy yet.
- **Time Travel:** Default 1-day retention. Sufficient for error recovery but not for compliance auditing.
- **Datashare stability:** If FINSDC3_DATASHARE stops refreshing, check Data Cloud data stream status in the Salesforce org. Use `python hydrate.py dc-status --target-org X` from the Customer_Hydration project.
