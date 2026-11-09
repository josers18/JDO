# ROLLOUT.md — Cumulus Multi-Org Deployment Runbook

How to roll all 16 Cumulus Snowflake datasets out to an additional Salesforce Data Cloud org.

> **Status (2026-11-09):** **16 datasets LIVE.** Plans 14–16 (Demandbase intent, UserGems job changes, Harmonic company signals) shipped 2026-11-02 → 11-04 with `ORG_ID` as their first column and PK lead, so they needed no Phase A migration. The 16 dataset tables hold **14,112,893 rows** ([row counts](#row-counts-2026-11-09)); `MASTER_ACCOUNTS` has 36,953 rows, all `ORG_ID = 'JDO'`. Phase B still waits for the first non-JDO org.

> **Status (2026-05-29):** Phase A **LIVE on `main`** (commit `c9119d32`). `MASTER_ACCOUNTS` + 13 dataset tables + `V_ACCOUNT_ANCHORS` v1.2 all carry `ORG_ID VARCHAR(18) DEFAULT 'JDO'`. 3,977,690 rows tagged uniformly (zero NULLs). Phase B (per-org rollout) runs when the first non-JDO org is provisioned.

> **TL;DR.** Phase A (one-time) extends `MASTER_ACCOUNTS` with an `ORG_ID` column and parameterizes `V_ACCOUNT_ANCHORS` so a single Snowflake schema serves N orgs. Phase B (per-org) provisions the inbound share, registers a DC connector, and replays the 16-stream/DLO/DMO/mapping sequence. **All 16 SPs and TASKs stay untouched after Phase A** — they read `ORG_ID` from the audience row and stamp it into output records.

---

## Architecture decision: shared `MASTER_ACCOUNTS`, per-org filtered view

Each dataset SP reads from `DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS`, never from `MASTER_ACCOUNTS` directly. That single indirection point is where the org-binding lives. The chosen approach:

| | Shared table + ORG_ID column (chosen) | Per-org MASTER_ACCOUNTS | Per-org schema |
|---|---|---|---|
| Snowflake artifacts duplicated | 1 view per org | 1 table + view + share + load TASK per org | Entire `DATA_JEDAIS.FINS__PUBLIC.*` per org |
| Dataset SPs require changes | **No** | No | All 13 (schema-qualified swaps) |
| Storage growth | Linear, single table | Linear × N orgs | Linear × N orgs |
| Cross-org analytics | Trivial (`GROUP BY ORG_ID`) | Requires UNION across tables | Requires UNION across schemas |
| Compliance isolation | Row-access policy required | Native (separate share grants) | Native (separate schema grants) |
| Time to add org #2 | ~30 min (Phase B only) | ~2 hr | ~3 hr |

**Decision rationale:** All current target orgs are demo orgs sharing a single Snowflake account. If a future tenant requires hard-isolation (HIPAA, FedRAMP, EU residency), promote that tenant to a per-org schema; the rest stay on the shared model.

---

## Reference state (jdo-oe0sdd — the model org)

Use these IDs from the model org as your "expected shape" reference when verifying a new org. Read live from the Connect API and Snowflake on 2026-11-09.

- Org: `jdo-oe0sdd` (Cumulus Financial Services, org id `00Dam00000Uo32qEAB`, `storm-16a17dc388fbe6.demo.my.salesforce.com`).
- Connection: `BT_Managed_Snowflake` (`9cgam000000AhrhAAC`), account `SKJADZG-SFDC_DC_TECH_ARCH.snowflakecomputing.com`, region `us-east-1`; the only **Active** Snowflake connection. `Jedi_Snowflake` (`9cgam0000003EknAAE`) is in **Error**, and its old `Cumulus*` streams were deleted when the org moved to `BT_`.
- 16 `BT_` streams, all `ACTIVE`, `DIRECT_ACCESS` (zero copy, so they never need a Full Refresh), `TOTAL_REPLACE`, reading `DATA_JEDAIS.FINS__PUBLIC.<table>`. The stream API names the connection only for the four streams created by REST (MGP and Plans 14–16); the other 12 were created in the UI and report just `connectorType: SNOWFLAKE`.
- Source tables: `DATA_JEDAIS.FINS__PUBLIC.MASTER_ACCOUNTS` (36,953 rows, 2026-11-09), 16 dataset tables (14,112,893 rows total; see [row counts](#row-counts-2026-11-09)).

| Plan | Data stream | Stream Id | DLO Id | DMO | DMO Id |
|---|---|---|---|---|---|
| 1 | `BT_Claritas_Demographics` | `1dsam000000PrE7AAK` | `0gOam000000aeBvEAI` | `BT_Claritas_Demographics__dlm` | `0gjam000001EM4vAAG` |
| 2 | `BT_MSCI_ESG_Scores` | `1dsam000000PrFeAAK` | `0gOam000000aeDSEAY` | `BT_MSCI_ESG_Scores__dlm` | `0gjam000001ELvFAAW` |
| 3 | `BT_DNB_Business_Credit` | `1dsam000000PrEAAA0` | `0gOam000000aeByEAI` | `BT_DNB_Business_Credit__dlm` | `0gjam000001ELyTAAW` |
| 4 | `BT_ESRI_GEO_Footprint` | `1dsam000000PrE8AAK` | `0gOam000000aeBwEAI` | `BT_ESRI_GEO_Footprint__dlm` | `0gjam000001EM3JAAW` |
| 5 | `BT_Corelogic_Property` | `1dsam000000PrE9AAK` | `0gOam000000aeBxEAI` | `BT_Corelogic_Property__dlm` | `0gjam000001EM05AAG` |
| 6 | `BT_Plaid_Held_Away` | `1dsam000000PrFlAAK` | `0gOam000000aeDZEAY` | `BT_Plaid_Held_Away__dlm` | `0gjam000001ELonAAG` |
| 7 | `BT_WorldCheck_AML` | `1dsam000000PrHGAA0` | `0gOam000000aeF4EAI` | `BT_WorldCheck_AML__dlm` | `0gjam000001ELjxAAG` |
| 8 | `BT_MGP_Financial_Plans` | `1dsam000000Q0M9AAK` | `0gOam000000atQzEAI` | `BT_MoneyGuidePro_Financial_Plans__dlm` | `0gjam000001EftxAAC` |
| 9 | `BT_Synth_Relationship_Graph` | `1dsam000000PrFmAAK` | `0gOam000000aeDaEAI` | `BT_Synth_Relationship_Graph__dlm` | `0gjam000001ELnBAAW` |
| 10 | `BT_Boardex` | `1dsam000000PrE5AAK` | `0gOam000000aeBtEAI` | `BT_Boardex__dlm` | `0gjam000001EM6XAAW` |
| 11 | `BT_Zoominfo_Firmographics` | `1dsam000000PrHFAA0` | `0gOam000000aeF3EAI` | `BT_Zoominfo_Firmographics__dlm` | `0gjam000001ELlZAAW` |
| 12 | `BT_Gong_Call_Sentiment` | `1dsam000000PrFdAAK` | `0gOam000000aeDREAY` | `BT_Gong_Call_Sentiment__dlm` | `0gjam000001ELwrAAG` |
| 13 | `BT_Moodys_Market_Context` | `1dsam000000PrFkAAK` | `0gOam000000aeDYEAY` | `BT_Moodys_Market_Context__dlm` | `0gjam000001ELqPAAW` |
| 14 | `BT_Demandbase_Intent_Signals` | `1dsam000000Q2arAAC` | `0gOam000000awThEAI` | `BT_Demandbase_Intent_Signals__dlm` | `0gjam000001Ejr7AAC` |
| 15 | `BT_UserGems_Job_Changes` | `1dsam000000Q2cTAAS` | `0gOam000000awVJEAY` | `BT_UserGems_Job_Changes__dlm` | `0gjam000001EjsjAAC` |
| 16 | `BT_Harmonic_Company_Signals` | `1dsam000000Q2asAAC` | `0gOam000000awTjEAI` | `BT_Harmonic_Company_Signals__dlm` | `0gjam000001EjpVAAS` |

Plan 8 is the one stream whose DMO name differs from the stream name. Re-read the IDs with `GET /ssot/data-streams/<name>` and `GET /ssot/data-model-objects/<dmo>`.

## Row counts (2026-11-09)

Live counts from `DATA_JEDAIS.INFORMATION_SCHEMA.TABLES.ROW_COUNT` on 2026-11-09. Monthly and weekly plans keep every generated period, so totals grow with each run (Phase A tagged 3,977,690 rows on 2026-05-29).

| Plan | Dataset | Table | Rows |
|---|---|---|---:|
| 1 | Claritas Demographics | `CLARITAS_DEMOGRAPHICS` | 253,672 |
| 2 | MSCI ESG | `MSCI_ESG_SCORES` | 80,000 |
| 3 | DnB Business Credit | `DNB_BUSINESS_CREDIT` | 79,999 |
| 4 | Esri GeoFootprint | `ESRI_GEO_FOOTPRINT` | 93,289 |
| 5 | CoreLogic Property | `CORELOGIC_PROPERTY` | 76,272 |
| 6 | Plaid Held-Away | `PLAID_HELD_AWAY` | 465,801 |
| 7 | World-Check AML | `WORLD_CHECK_AML` | 5,860,286 |
| 8 | MoneyGuidePro Financial Plans | `MGP_FINANCIAL_PLANS` | 1,104,639 |
| 9 | Synth Relationship Graph | `SYNTH_RELATIONSHIP_GRAPH` | 38,470 |
| 10 | BoardEx Exec Intel | `BOARDEX_EXEC_INTEL` | 1,104,633 |
| 11 | ZoomInfo Firmographics | `ZOOMINFO_FIRMOGRAPHICS` | 79,969 |
| 12 | Gong Call Sentiment | `GONG_CALL_SENTIMENT` | 1,768,108 |
| 13 | Moody's Market Context | `MOODYS_MARKET_CONTEXT` | 2,809,350 |
| 14 | Demandbase Intent Signals | `DEMANDBASE_INTENT_SIGNALS` | 284,715 |
| 15 | UserGems Job Changes | `USERGEMS_JOB_CHANGES` | 9,103 |
| 16 | Harmonic Company Signals | `HARMONIC_COMPANY_SIGNALS` | 4,587 |
| | **Total** | | **14,112,893** |

To refresh:

```sql
SELECT TABLE_NAME, ROW_COUNT
FROM DATA_JEDAIS.INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = 'FINS__PUBLIC'
  AND TABLE_NAME IN ('CLARITAS_DEMOGRAPHICS','MSCI_ESG_SCORES','DNB_BUSINESS_CREDIT','ESRI_GEO_FOOTPRINT',
                     'CORELOGIC_PROPERTY','PLAID_HELD_AWAY','WORLD_CHECK_AML','MGP_FINANCIAL_PLANS',
                     'SYNTH_RELATIONSHIP_GRAPH','BOARDEX_EXEC_INTEL','ZOOMINFO_FIRMOGRAPHICS','GONG_CALL_SENTIMENT',
                     'MOODYS_MARKET_CONTEXT','DEMANDBASE_INTENT_SIGNALS','USERGEMS_JOB_CHANGES','HARMONIC_COMPANY_SIGNALS')
ORDER BY TABLE_NAME;
```

---

# Phase A — Snowflake schema migration (one-time)

Run this **once** before onboarding any second org. Idempotent; safe to re-run.

## A1. Add `ORG_ID` to `MASTER_ACCOUNTS`

```sql
ALTER TABLE DATA_JEDAIS.FINS__PUBLIC.MASTER_ACCOUNTS
  ADD COLUMN IF NOT EXISTS ORG_ID VARCHAR(18) NOT NULL DEFAULT 'JDO';

-- Backfill existing rows to the model org's identifier.
UPDATE DATA_JEDAIS.FINS__PUBLIC.MASTER_ACCOUNTS SET ORG_ID = 'JDO' WHERE ORG_ID IS NULL OR ORG_ID = '';

-- Forbid the default going forward — every loader must specify ORG_ID.
ALTER TABLE DATA_JEDAIS.FINS__PUBLIC.MASTER_ACCOUNTS ALTER COLUMN ORG_ID DROP DEFAULT;
```

> `ORG_ID` is a stable short identifier you assign (e.g. `JDO`, `ACME`, `WFB`) — *not* the 18-char SF Org Id, because that changes per sandbox refresh. Pick something durable per logical-tenant.

## A2. Update `MASTER_ACCOUNTS` loader to stamp `ORG_ID`

The model org's loader is `SP_LOAD_MASTER_ACCOUNTS` reading from `FINSDC3_DATASHARE`. Each new org gets its own loader (Phase B5) that inserts with its own `ORG_ID`. The shared SP's MERGE clause needs an `ORG_ID` filter:

```sql
-- Inside SP_LOAD_MASTER_ACCOUNTS — before MERGE, narrow the source to the org.
MERGE INTO DATA_JEDAIS.FINS__PUBLIC.MASTER_ACCOUNTS tgt
USING (
  SELECT 'JDO' AS ORG_ID, /* ... existing source SELECT ... */
  FROM FINSDC3_DATASHARE."schema_Jedi_Snowflake"."ssot__Account__dlm"
) src
ON tgt.ORG_ID = src.ORG_ID AND tgt.ACCOUNT_ID = src.ACCOUNT_ID
WHEN MATCHED THEN UPDATE SET ...
WHEN NOT MATCHED THEN INSERT ...;
```

Point: the composite match key becomes `(ORG_ID, ACCOUNT_ID)`. Without this, two orgs both holding ACCOUNT_ID `001000000ABCDEF` would clobber each other.

## A3. Rebuild `V_ACCOUNT_ANCHORS` as session-parameterized

The view must filter to the caller's org. Snowflake supports session parameters:

```sql
CREATE OR REPLACE VIEW DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS AS
SELECT
    ma.ORG_ID,
    ma.ACCOUNT_ID,
    ma.ACCOUNT_NAME,
    ma.SNAPSHOT_DATE,
    -- ... existing columns unchanged ...
    a."External_ID_c__c"  AS EXTERNAL_ID
FROM DATA_JEDAIS.FINS__PUBLIC.MASTER_ACCOUNTS ma
INNER JOIN DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_DATASHARE_UNION a
        ON a."ssot__Id__c" = ma.ACCOUNT_ID
       AND a.ORG_ID         = ma.ORG_ID
WHERE ma.SNAPSHOT_DATE = (
    SELECT MAX(SNAPSHOT_DATE)
    FROM DATA_JEDAIS.FINS__PUBLIC.MASTER_ACCOUNTS
    WHERE ORG_ID = ma.ORG_ID
)
  AND ma.ORG_ID = COALESCE(
        TRY_CAST(GET_DDL('SESSION', '$current_org_id') AS VARCHAR),  -- session-set
        CURRENT_TAG()::VARCHAR,                                       -- per-role tag fallback
        'JDO'                                                         -- safe default
      );
```

**Snowflake mechanic.** Each per-org DC connector authenticates as a distinct role; the role carries a `ORG_ID` tag set at provisioning (Phase B3). The view filter resolves to that tag, so the same view returns different rowsets to different connectors without per-org duplication.

> If you don't want role tags, the simpler alternative is one view per org: `V_ACCOUNT_ANCHORS_JDO`, `V_ACCOUNT_ANCHORS_ACME` each hard-coding `WHERE ORG_ID = '<id>'`, and updating each dataset SP's audience SQL to read its org-specific view via a Snowflake task parameter. The role-tag approach trades one-time view complexity for zero per-org SP changes — recommended.

## A4. Create the per-org Account datashare union

Each new org delivers its own DC inbound share. To keep `V_ACCOUNT_ANCHORS` agnostic, fan-in via a UNION view that re-stamps `ORG_ID`:

```sql
CREATE OR REPLACE VIEW DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_DATASHARE_UNION AS
SELECT 'JDO' AS ORG_ID, * FROM FINSDC3_DATASHARE."schema_Jedi_Snowflake"."ssot__Account__dlm"
UNION ALL
SELECT 'ACME' AS ORG_ID, * FROM ACME_DATASHARE."schema_Acme_Snowflake"."ssot__Account__dlm"
-- Add one block per org as new shares come online.
;
```

Each SELECT block matches the column shape of the model share. If a future Salesforce release adds columns to `ssot__Account__dlm`, every org's UNION must absorb them in lockstep — pin the column list explicitly rather than `SELECT *` once you have ≥3 orgs.

## A5. Add `ORG_ID` row-access policy on the 13 dataset tables (optional, compliance)

If a dataset table is queryable by users from multiple orgs, attach a row-access policy:

```sql
CREATE OR REPLACE ROW ACCESS POLICY DATA_JEDAIS.FINS__PUBLIC.ORG_FILTER AS (org_id VARCHAR) RETURNS BOOLEAN ->
  org_id = SYSTEM$GET_TAG('ORG_ID', CURRENT_ROLE(), 'ROLE');

ALTER TABLE DATA_JEDAIS.FINS__PUBLIC.CLARITAS_DEMOGRAPHICS ADD ROW ACCESS POLICY DATA_JEDAIS.FINS__PUBLIC.ORG_FILTER ON (ORG_ID);
-- repeat for the 12 others
```

Skip if all 13 datasets are written by per-org SPs that already filter via `V_ACCOUNT_ANCHORS` (the audience flow already isolates rows by org). The policy is a defense-in-depth layer for ad-hoc queries.

## A6. Add `ORG_ID` to the 13 dataset tables

Each dataset table currently keys on `ACCOUNT_ID` (and per-plan time qualifiers). Add `ORG_ID` and update the PK so two orgs can carry the same `ACCOUNT_ID`:

```sql
ALTER TABLE DATA_JEDAIS.FINS__PUBLIC.MGP_FINANCIAL_PLANS
  ADD COLUMN IF NOT EXISTS ORG_ID VARCHAR(18) NOT NULL DEFAULT 'JDO';

UPDATE DATA_JEDAIS.FINS__PUBLIC.MGP_FINANCIAL_PLANS SET ORG_ID = 'JDO' WHERE ORG_ID IS NULL;
ALTER TABLE DATA_JEDAIS.FINS__PUBLIC.MGP_FINANCIAL_PLANS ALTER COLUMN ORG_ID DROP DEFAULT;

-- Update primary-key column list in each plan's DDL file:
-- before: PRIMARY KEY (ACCOUNT_ID, PROFILE_MONTH)
-- after:  PRIMARY KEY (ORG_ID, ACCOUNT_ID, PROFILE_MONTH)
```

Phase A applied this to all 13 tables, but not in this exact form; the live result is:

| Plan | Table | Live PK | Live UNIQUE (natural key) | Phase A design key | Deployed SP MERGE `ON` has `ORG_ID` |
|---|---|---|---|---|---|
| 1 | `CLARITAS_DEMOGRAPHICS` | RECORD_ID | (ACCOUNT_ID, PROFILE_MONTH) | (ORG_ID, ACCOUNT_ID, PROFILE_MONTH) | No |
| 2 | `MSCI_ESG_SCORES` | RECORD_ID | (ACCOUNT_ID, PROFILE_MONTH) | (ORG_ID, ACCOUNT_ID, PROFILE_MONTH) | Yes |
| 3 | `DNB_BUSINESS_CREDIT` | RECORD_ID | (ACCOUNT_ID, PROFILE_MONTH) | (ORG_ID, ACCOUNT_ID, PROFILE_MONTH) | Yes |
| 4 | `ESRI_GEO_FOOTPRINT` | RECORD_ID | (BRANCH_ZIP, PROFILE_MONTH) | (ORG_ID, BRANCH_ZIP, PROFILE_MONTH) | Yes |
| 5 | `CORELOGIC_PROPERTY` | RECORD_ID | (ACCOUNT_ID, PROFILE_QUARTER) | (ORG_ID, ACCOUNT_ID, PROFILE_QUARTER) | No |
| 6 | `PLAID_HELD_AWAY` | RECORD_ID | (ACCOUNT_ID, HELD_AWAY_ACCOUNT_ID, PROFILE_MONTH) | (ORG_ID, ACCOUNT_ID, HELD_AWAY_ACCOUNT_ID, PROFILE_MONTH) | Yes |
| 7 | `WORLD_CHECK_AML` | RECORD_ID | (ACCOUNT_ID, PROFILE_DATE) | (ORG_ID, ACCOUNT_ID, PROFILE_DATE) | No |
| 8 | `MGP_FINANCIAL_PLANS` | RECORD_ID | (ACCOUNT_ID, PROFILE_MONTH) | (ORG_ID, ACCOUNT_ID, PROFILE_MONTH) | No |
| 9 | `SYNTH_RELATIONSHIP_GRAPH` | RECORD_ID | (SRC_ACCOUNT_ID, DST_ACCOUNT_ID, EDGE_TYPE) | (ORG_ID, SRC_ACCOUNT_ID, DST_ACCOUNT_ID, EDGE_TYPE) | Yes |
| 10 | `BOARDEX_EXEC_INTEL` | RECORD_ID | (ACCOUNT_ID, PROFILE_MONTH) | (ORG_ID, ACCOUNT_ID, PROFILE_MONTH) | Yes |
| 11 | `ZOOMINFO_FIRMOGRAPHICS` | RECORD_ID | (ACCOUNT_ID, PROFILE_MONTH) | (ORG_ID, ACCOUNT_ID, PROFILE_MONTH) | Yes |
| 12 | `GONG_CALL_SENTIMENT` | RECORD_ID | (ACCOUNT_ID, PROFILE_WEEK) | (ORG_ID, ACCOUNT_ID, PROFILE_WEEK) | Yes |
| 13 | `MOODYS_MARKET_CONTEXT` | RECORD_ID | (ACCOUNT_ID, PROFILE_DATE) | (ORG_ID, ACCOUNT_ID, PROFILE_DATE) | Yes |

**What's live (checked 2026-11-09).** In the live schema the declared PK of all 13 tables is `RECORD_ID` (the DMOs key on `record_id__c`), and the natural key is a UNIQUE key **without** `ORG_ID`. `ORG_ID` is the second-to-last column, nullable, `DEFAULT 'JDO'`. The `schemas/` DDL files now match this (synced from `GET_DDL` in the same PR as this paragraph); the Phase A design key is kept in each file's header as history. Snowflake enforces neither constraint, so what keeps rows unique is each SP's MERGE `ON` clause.

Nine deployed SPs already match on `ORG_ID`. The four that don't, Plans 1, 5, 7 and 8 (Claritas, CoreLogic, World-Check, MGP), write no `ORG_ID` at all, so their rows get `'JDO'` from the column default. Their committed `procedures/sp_create_procedure.sql` files are exact copies of the deployed bodies; the `ORG_ID`-aware versions exist only in the `procedures/sp_generate_*.py` sources. **Before Phase B** puts a second org's rows in these tables, port the `.py` changes into those four `.sql` files and redeploy them (as ACCOUNTADMIN), and decide whether to re-declare the UNIQUE keys with `ORG_ID`. Read the live constraints with `SHOW PRIMARY KEYS IN SCHEMA DATA_JEDAIS.FINS__PUBLIC` and `SHOW UNIQUE KEYS IN SCHEMA DATA_JEDAIS.FINS__PUBLIC`.

Plans 14–16 postdate Phase A and were created with `ORG_ID` as the first column and PK lead, so this step doesn't apply to them. Their live PKs: `DEMANDBASE_INTENT_SIGNALS (ORG_ID, ACCOUNT_ID, PROFILE_WEEK, INTENT_TOPIC)`, `USERGEMS_JOB_CHANGES (ORG_ID, EVENT_ID)`, `HARMONIC_COMPANY_SIGNALS (ORG_ID, ACCOUNT_ID, PROFILE_MONTH)`.

Then update each plan's SP MERGE so the source SELECT carries `ORG_ID` (sourced from the audience row, which V_ACCOUNT_ANCHORS already supplies post-A3).

## A7. Verify Phase A

```bash
snow sql -q "
SELECT ORG_ID, COUNT(DISTINCT ACCOUNT_ID) AS distinct_accounts
FROM DATA_JEDAIS.FINS__PUBLIC.MASTER_ACCOUNTS
WHERE SNAPSHOT_DATE = (SELECT MAX(SNAPSHOT_DATE) FROM DATA_JEDAIS.FINS__PUBLIC.MASTER_ACCOUNTS)
GROUP BY ORG_ID;"
-- Expect: JDO | 36181  (only one org until Phase B runs)

snow sql -q "SELECT ORG_ID, COUNT(*) FROM DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS GROUP BY ORG_ID;"
-- Expect: JDO | 36181  (filter from session role tag)
```

Re-run all 13 plans' L1 + L2 tests against the migrated schema before declaring Phase A done.

---

# Phase B — Per-org rollout (~45 min, repeatable)

Repeat for each new target org. Variables:

```bash
export TARGET_ORG_ALIAS="acme-prod"      # sf CLI alias for the new org
export TARGET_ORG_ID="ACME"              # short identifier you choose
export TARGET_ORG_INSTANCE="https://acme-prod.my.salesforce.com"
export TARGET_DC_SHARE_NAME="ACME_DATASHARE"     # set when DC creates the inbound share
export TARGET_DC_CONNECTOR_NAME="Acme_Snowflake" # name we'll register inside DC
```

## B1. Provision Salesforce Data Cloud → Snowflake outbound share (in target org)

In the **target Salesforce org**, Setup → Data Cloud → Data Shares → New, point at the same Snowflake account. DC delivers the share with the standard schema name pattern `schema_<connector_label>`.

The share appears in Snowflake as inbound:

```sql
SHOW SHARES INBOUND;
-- Expect a new entry: ACME_DATASHARE
```

Capture the inbound share name and update `TARGET_DC_SHARE_NAME`.

## B2. Register the share + create the per-org Snowflake role

```sql
USE ROLE ACCOUNTADMIN;

-- Mount the share
CREATE DATABASE IF NOT EXISTS ACME_DATASHARE FROM SHARE <provider_account>.ACME_OUTBOUND;

-- Per-org role with ORG_ID tag
CREATE ROLE IF NOT EXISTS DC_CONNECTOR_ACME;
ALTER ROLE DC_CONNECTOR_ACME SET TAG ORG_ID = 'ACME';

-- Grants for read access
GRANT USAGE ON DATABASE ACME_DATASHARE TO ROLE DC_CONNECTOR_ACME;
GRANT USAGE ON SCHEMA ACME_DATASHARE."schema_Acme_Snowflake" TO ROLE DC_CONNECTOR_ACME;
GRANT SELECT ON ALL VIEWS IN SCHEMA ACME_DATASHARE."schema_Acme_Snowflake" TO ROLE DC_CONNECTOR_ACME;

-- Grants for the federated 13 dataset tables + V_ACCOUNT_ANCHORS
GRANT USAGE ON DATABASE FINS TO ROLE DC_CONNECTOR_ACME;
GRANT USAGE ON SCHEMA DATA_JEDAIS.FINS__PUBLIC TO ROLE DC_CONNECTOR_ACME;
GRANT SELECT ON ALL VIEWS IN SCHEMA DATA_JEDAIS.FINS__PUBLIC TO ROLE DC_CONNECTOR_ACME;
GRANT SELECT ON ALL TABLES IN SCHEMA DATA_JEDAIS.FINS__PUBLIC TO ROLE DC_CONNECTOR_ACME;

-- Create per-org service user
CREATE USER IF NOT EXISTS DC_CONNECTOR_ACME_USER
  PASSWORD = '<rotate>' DEFAULT_ROLE = DC_CONNECTOR_ACME DEFAULT_WAREHOUSE = MAIN_WH_XS
  RSA_PUBLIC_KEY = '<acme_pub_key>';
GRANT ROLE DC_CONNECTOR_ACME TO USER DC_CONNECTOR_ACME_USER;
```

> The role tag `ORG_ID = 'ACME'` is what `V_ACCOUNT_ANCHORS` reads. Without it, the view falls back to the safe default and the new org sees `JDO` data — verify post-grant.

## B3. Update the UNION view in Snowflake

```sql
CREATE OR REPLACE VIEW DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_DATASHARE_UNION AS
SELECT 'JDO'  AS ORG_ID, * FROM FINSDC3_DATASHARE."schema_Jedi_Snowflake"."ssot__Account__dlm"
UNION ALL
SELECT 'ACME' AS ORG_ID, * FROM ACME_DATASHARE."schema_Acme_Snowflake"."ssot__Account__dlm";
```

Add one `UNION ALL` block per onboarded org.

## B4. Create the per-org `MASTER_ACCOUNTS` loader

Clone `SP_LOAD_MASTER_ACCOUNTS` to `SP_LOAD_MASTER_ACCOUNTS_ACME` and a TASK `TASK_LOAD_MASTER_ACCOUNTS_ACME`. The new SP differs from the model only in:

1. `'ACME'` literal in the SELECT.
2. `FROM ACME_DATASHARE."schema_Acme_Snowflake"."ssot__Account__dlm"` instead of `FINSDC3_DATASHARE`.
3. MERGE key `(ORG_ID, ACCOUNT_ID)`.

Run once manually before scheduling, then enable the TASK on the same cadence as JDO's loader.

## B5. Probe target org access token

```bash
sf org login web --alias ${TARGET_ORG_ALIAS} --instance-url ${TARGET_ORG_INSTANCE}
SF_TOKEN=$(sf org auth show-access-token --target-org ${TARGET_ORG_ALIAS} --no-prompt --json \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['result']['accessToken'])")
INSTANCE_URL=${TARGET_ORG_INSTANCE}
```

> `sf org display --json` returns `[REDACTED]` since CLI v2.136 — only `sf org auth show-access-token --json` returns the real bearer. See memory `[[feedback_sf_cli_token_redaction]]`.

## B6. Create the DC connector pointing at Snowflake

In **target org** DC Setup → Other Connectors → New Snowflake Connector → enter:

- Account: `eob55465.us-east-1.snowflakecomputing.com` (same Snowflake account as JDO)
- Warehouse: `MAIN_WH_XS`
- Role: `DC_CONNECTOR_ACME`
- User: `DC_CONNECTOR_ACME_USER`
- Auth: Key Pair (paste private key)
- Connector name: `Acme_Snowflake`

Validate. Capture the connector record id (`9cgam...`) — it's the value `connectorDetails.name` references in Phase B7 payloads.

## B7. Replay the 13-stream sequence (REST API + UI)

For each plan, run:

### B7a. Create stream + DLO (API)

```bash
for PLAN in claritas_demographics msci_esg dnb_business_credit esri_geo_footprint \
            corelogic_property plaid_heldaway worldcheck_aml mgp_financial_plans \
            synth_relationship_graph boardex_exec_intel zoominfo_firmographics \
            gong_call_sentiment moodys_market_context; do
  PAYLOAD_FILE="output/plan-${PLAN}-dc-create-stream-payload.json"
  # Two edits per payload before POSTing:
  #   1. connectorInfo.connectorDetails.name = "Acme_Snowflake"  (was "Jedi_Snowflake")
  #   2. dataLakeObjectInfo.dataspaceInfo[0].name = "default" (or per-org dataspace)
  curl -s -X POST -H "Authorization: Bearer $SF_TOKEN" -H "Content-Type: application/json" \
    "$INSTANCE_URL/services/data/v62.0/ssot/data-streams" \
    --data-binary @${PAYLOAD_FILE} \
    | tee output/plan-${PLAN}-stream-${TARGET_ORG_ID}.json
done
```

The 13 payloads are committed in each plan's `output/plan-*-dc-create-stream-payload.json`. They are reusable across orgs once the connector name is swapped.

Plans 14–16 have no `output/` payload files. Their `BT_` streams, DMOs and Account relationships were created by REST on 2026-11-04 (connection `BT_Managed_Snowflake`, DIRECT_ACCESS zero copy). Each plan's `AGENTS.md` section "DC mapping (Task 7)" records the stream settings, the IDs and the full field map. Rebuild those three from that section after the loop.

### B7b. Create the 13 DMOs (API)

Same pattern with `output/plan-*-dc-create-dmo-payload.json` against `/ssot/data-model-objects`.

### B7c. Map DLO → DMO (UI, ~90s/DMO via skill)

REST `POST /ssot/data-model-object-mappings` returns `UNKNOWN_EXCEPTION` for fully-custom DMOs. Use the Lightning UI flow encoded in the `dc-field-mapping-via-data-stream` skill:

1. Open the new org → Data Cloud → Data Streams → click `BT_Claritas_Demographics`
2. Start → Select Objects → Custom Data Model tab → Add Object → pick the matching `__dlm` → Done → Continue → Save
3. Einstein auto-maps fields by column-name match.

16 DMOs × ~90s = ~25 min.

### B7d. Set FK relationships (UI)

For each DMO with `ssot__AccountId__c`: edit field → Foreign Key Relationship → `ssot__Account__dlm.ssot__Id__c`. Plan 4 (geo) has none. Plan 9 has both `Src` and `Dst` FKs.

## B8. Verify the new org's DC layer

```bash
for DMO in BT_Claritas_Demographics BT_MSCI_ESG_Scores BT_DNB_Business_Credit \
           BT_ESRI_GEO_Footprint BT_Corelogic_Property BT_Plaid_Held_Away \
           BT_WorldCheck_AML BT_MoneyGuidePro_Financial_Plans BT_Synth_Relationship_Graph \
           BT_Boardex BT_Zoominfo_Firmographics BT_Gong_Call_Sentiment \
           BT_Moodys_Market_Context BT_Demandbase_Intent_Signals \
           BT_UserGems_Job_Changes BT_Harmonic_Company_Signals; do
  echo "=== ${DMO} ==="
  curl -s -X POST -H "Authorization: Bearer $SF_TOKEN" -H "Content-Type: application/json" \
    "$INSTANCE_URL/services/data/v62.0/ssot/queryv2" \
    -d "{\"sql\":\"SELECT COUNT(*) FROM ${DMO}__dlm\"}"
done
```

Expected counts match the new org's `MASTER_ACCOUNTS` rowcount × per-plan multiplier (e.g. Plan 1: 1× anchors, Plan 8: 1× Wealth-only anchors, Plan 12: ~52× anchors for weekly history).

## B9. Run a cross-DMO smoke

```sql
-- Confirm FK resolution against the new org's Account DMO
SELECT a.ssot__Id__c, COUNT(*) AS plans
FROM ssot__Account__dlm a
JOIN CumulusMgpFinancialPlans__dlm p ON p.ssot__AccountId__c = a.ssot__Id__c
GROUP BY a.ssot__Id__c
LIMIT 5;
```

If counts are 0, suspect: (a) FK relationship not saved, (b) `ssot__Account__dlm` empty in the new org (run hydrate first), (c) connector reading `JDO` rows because role tag missing.

---

# Phase B checklist (printable)

```
[ ] B1. DC outbound share provisioned in target org → captured share name
[ ] B2. Snowflake DATABASE FROM SHARE created; per-org role + service user with ORG_ID tag
[ ] B3. V_ACCOUNT_DATASHARE_UNION extended with new UNION ALL block
[ ] B4. SP_LOAD_MASTER_ACCOUNTS_<ORG> + TASK_LOAD_MASTER_ACCOUNTS_<ORG> created and run once
[ ] B5. SF_TOKEN minted via sf org auth show-access-token --json
[ ] B6. DC connector "<Org>_Snowflake" registered in target org; Validate green
[ ] B7a. 13 streams + DLOs POSTed (REST)
[ ] B7b. 13 DMOs POSTed (REST)
[ ] B7c. 13 DLO→DMO mappings completed via Lightning UI
[ ] B7d. FK relationships set on all account-scoped DMOs (Plans 1-3, 5-8, 10-13; Plan 9 has 2)
[ ] B8. Counts verified against expected multipliers
[ ] B9. Cross-DMO smoke green
```

---

# Common failure modes (cross-referenced from session learnings)

| Symptom | Likely cause | Fix |
|---|---|---|
| `'B' is undefined` SyntaxError on `snow sql -f` | Bare `&` in a SQL file (DDL comment, SP docstring) | Replace with `DnB`, `FnB`, `S+P`, "and". See `[[feedback_snow_sql_ampersand_template_render]]` |
| `Expression type does not match column data type, expecting DATE but got NUMBER(38,0)` in MERGE | `write_pandas` mis-typed all-NULL date column | Apply two-part fix: `pd.to_datetime` coercion + `TO_DATE(TO_TIMESTAMP_NTZ(col / 1e9))` cast. See `[[feedback_write_pandas_all_null_date_mistype]]` |
| `Ambiguous PROCEDURE overloading` when redeploying SP | Schema change to SP signature | `DROP PROCEDURE IF EXISTS <FQN>()` first. See `[[feedback_snowpark_inter_sp_imports_unsupported]]` |
| REST mapping returns `UNKNOWN_EXCEPTION` | Custom DMO + REST mapping endpoint | Use Lightning UI flow per skill `dc-field-mapping-via-data-stream`. See `[[feedback_dc_field_mapping_einstein_automap]]` |
| New org's DMO has 0 rows post-mapping | Role tag `ORG_ID` not set on DC connector role | `ALTER ROLE DC_CONNECTOR_<ORG> SET TAG ORG_ID = '<ORG>'` and re-run query |
| Counts match JDO instead of new org | View fallback hit `'JDO'` default | Verify role tag query: `SELECT SYSTEM$GET_TAG('ORG_ID', CURRENT_ROLE(), 'ROLE');` |
| L2 tests pass but DMO still empty | Data Stream paused | DC Data Streams page → resume; or full-refresh via skill `dc-stream-full-refresh-via-ui` |

---

# Estimated time per new org

- Phase A (one-time): **~3 hours** (schema migration + retesting all 13 plans).
- Phase B (per-org): **~45 minutes**:
  - B1-B5 (Snowflake + auth): 10 min
  - B6 (DC connector): 5 min
  - B7a + B7b (26 API POSTs): 10 min
  - B7c (13 UI mappings): 20 min
  - B7d + B8 + B9 (FKs + verify): 10 min

After ~3 orgs, B7c becomes the dominant cost; if Salesforce ever fixes the REST mapping endpoint for custom DMOs, the per-org cost collapses to ~15 minutes.

---

# Patterns learned during Phase A live deployment (2026-05-29)

The 13-plan parallel rollout exposed several patterns worth documenting for future Phase A-style migrations on this repo or any sibling.

### 1. The `anchor.get("ORG_ID", "JDO")` defensive default in row factories

Every SP module's row factory was independently updated by 13 parallel subagents. **All 13 converged on the same defensive pattern** — `anchor.get("ORG_ID", "JDO")` (or `or "JDO"`) — none used the strict `anchor["ORG_ID"]` lookup. This is the right move because:
- Production: `V_ACCOUNT_ANCHORS` v1.2 always supplies `ORG_ID`, so the default never fires.
- L1 tests: shared `SAMPLE_ANCHORS` in `cumulus_common` doesn't carry ORG_ID; the default keeps tests green without forcing a shared-fixture edit.
- Phase B onboarding: no SP rewrites needed when org #2 arrives — anchors will simply carry the new ORG_ID value.

**Canonical row factory pattern:**
```python
def _row_for(anchor: dict, run_ts: datetime) -> dict:
    return {
        "ORG_ID": anchor.get("ORG_ID", "JDO"),  # defensive default
        "ACCOUNT_ID": anchor["ACCOUNT_ID"],
        # ... remaining fields ...
    }
```

### 2. Patch `EXPECTED_KEYS` in the test module, not conftest

Each plan's `test_<dataset>_row_factory.py` carries an `EXPECTED_KEYS` set asserting the schema contract. When ORG_ID was added, the rule "patch local conftest only" was too restrictive — the right move is to update `EXPECTED_KEYS` directly in the test module. 10 of 13 subagents inferred this correctly; 3 stalled trying to patch conftest before the controller closed the gap. Future Phase X-style migrations should explicitly call out: **schema contract assertions live in the test module, not conftest. Patch them where they live.**

### 3. Snowflake `ALTER TABLE ADD COLUMN ... DEFAULT '<literal>'` is metadata-only and synchronous

The 1.025M-row Plan 13 (`MOODYS_MARKET_CONTEXT`) `UPDATE ... WHERE ORG_ID IS NULL` returned 0 rows updated and finished in seconds. The reason: Snowflake auto-populates existing rows with the constant DEFAULT at the metadata layer at `ALTER TABLE` time — no actual row rewrite happens. The `UPDATE` is a defensive safety net, not the heavy lift. Practical effect: even ~3.97M-row migrations apply in seconds, not minutes. Don't size your maintenance window for the UPDATE — size it for the SP redeploys + L1 reverification.

### 4. JWT default for `snow sql` deploys

Three early-Plans deploy scripts (Plans 1/2/3) hardcoded `default="GSB13421"` (the OAuth-mode connection), forcing browser logins on every redeploy. This was caught and fixed during Phase A — all 13 plans now default to unflagged `snow sql -f <file>` (active JWT connection). The `--connection NAME` flag is opt-in for the rare ad-hoc OAuth case. **For new plan scaffolds**: copy the canonical Plan 4+ pattern, never hardcode a default connection name.

```python
parser.add_argument(
    "--connection", "-c",
    default=None,  # NOT "GSB13421"
    help="Snowflake CLI connection name (default: unflagged — use the active JWT connection)",
)
# Build cmd conditionally:
cmd = ["snow", "sql", "-f", str(SP_SQL)]
if args.connection:
    cmd[1:1] = ["-c", args.connection]
```

### 5. Mass-parallel subagent dispatch + integration verification gate

The 13-plan rollout used the pattern from `[[feedback_parallel_subagent_integration_testing]]`: 13 parallel `fde-engineer` subagents, one per plan, with a non-negotiable controller-side integration check (`SELECT ORG_ID, COUNT(*) GROUP BY ORG_ID` across all 14 tables) immediately after they all returned. Wall-clock: ~5 minutes for 13 plans vs. ~45 minutes if serial. 2 of 13 subagents (Plans 5, 11) terminated mid-fix on the EXPECTED_KEYS test patch; the controller closed those gaps in < 1 minute each. The integration check caught zero drift — a clean validation that the per-subagent contract was tight enough.

### 6. Plan 4 is the geo-keyed exception

Esri (Plan 4) is the only plan with a non-account audience. Its `AUDIENCE_SQL` adds ORG_ID to the GROUP BY, and its coverage assertion uses `COUNT(DISTINCT (ORG_ID || '|' || BRANCH_ZIP))` because `assert_coverage()` takes a single scalar SELECT. **If a future plan is geo-, segment-, or other-non-account-keyed, follow this pattern**: ORG_ID must be in the GROUP BY of the audience query, and the coverage check must concatenate or split per-ORG.

---

# Related artifacts

- Memory: `[[reference_jdo_dc_artifacts]]` — JDO model-org IDs registry
- Memory: `[[feedback_dc_field_mapping_einstein_automap]]` — UI flow rationale
- Memory: `[[feedback_snowpark_inter_sp_imports_unsupported]]` — SP signature gotcha
- Memory: `[[feedback_snow_sql_ampersand_template_render]]` — DDL prose trap
- Memory: `[[feedback_write_pandas_all_null_date_mistype]]` — date column defense
- Memory: `[[feedback_parallel_subagent_integration_testing]]` — applicable when parallelizing B7a-B7c across orgs
- Skill: `dc-field-mapping-via-data-stream` — 7-click DLO→DMO UI flow
- Skill: `dc-stream-full-refresh-via-ui` — fallback when streams need re-priming
- Skill: `dc-connect-api` — REST endpoint vocabulary
- Plan 1 recipe: `Snowflake_Claritas_Demographics/docs/dc-setup-recipe.md` — original API+UI hybrid pattern
- Per-plan payloads: `Snowflake_*/output/plan-*-dc-create-stream-payload.json` (13 files, reusable across orgs)
