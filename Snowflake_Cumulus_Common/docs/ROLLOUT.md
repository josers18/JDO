# ROLLOUT.md — Cumulus Multi-Org Deployment Runbook

How to roll all 13 Cumulus Snowflake datasets out to an additional Salesforce Data Cloud org.

> **Status (2026-05-29):** Phase A **LIVE on `main`** (commit `c9119d32`). `MASTER_ACCOUNTS` + 13 dataset tables + `V_ACCOUNT_ANCHORS` v1.2 all carry `ORG_ID VARCHAR(18) DEFAULT 'JDO'`. 3,977,690 rows tagged uniformly (zero NULLs). Phase B (per-org rollout) runs when the first non-JDO org is provisioned.

> **TL;DR.** Phase A (one-time) extends `MASTER_ACCOUNTS` with an `ORG_ID` column and parameterizes `V_ACCOUNT_ANCHORS` so a single Snowflake schema serves N orgs. Phase B (per-org) provisions the inbound share, registers a DC connector, and replays the 13-stream/DLO/DMO/mapping sequence. **All 13 SPs and TASKs stay untouched after Phase A** — they read `ORG_ID` from the audience row and stamp it into output records.

---

## Architecture decision: shared `MASTER_ACCOUNTS`, per-org filtered view

Each dataset SP reads from `FINS.PUBLIC.V_ACCOUNT_ANCHORS`, never from `MASTER_ACCOUNTS` directly. That single indirection point is where the org-binding lives. The chosen approach:

| | Shared table + ORG_ID column (chosen) | Per-org MASTER_ACCOUNTS | Per-org schema |
|---|---|---|---|
| Snowflake artifacts duplicated | 1 view per org | 1 table + view + share + load TASK per org | Entire `FINS.PUBLIC.*` per org |
| Dataset SPs require changes | **No** | No | All 13 (schema-qualified swaps) |
| Storage growth | Linear, single table | Linear × N orgs | Linear × N orgs |
| Cross-org analytics | Trivial (`GROUP BY ORG_ID`) | Requires UNION across tables | Requires UNION across schemas |
| Compliance isolation | Row-access policy required | Native (separate share grants) | Native (separate schema grants) |
| Time to add org #2 | ~30 min (Phase B only) | ~2 hr | ~3 hr |

**Decision rationale:** All current target orgs are demo orgs sharing a single Snowflake account. If a future tenant requires hard-isolation (HIPAA, FedRAMP, EU residency), promote that tenant to a per-org schema; the rest stay on the shared model.

---

## Reference state (jdo-uqj0jr — the model org)

Use these IDs from the model org as your "expected shape" reference when verifying a new org:

- 13 streams + DLOs + DMOs all `ACTIVE` and `hasExternalDataLakeObjectMappings: true`.
- Connector: `Jedi_Snowflake` (`9cgam0000003EknAAE`), account `eob55465.us-east-1.snowflakecomputing.com`, warehouse `MAIN_WH_XS`, user `jsifontes`.
- Inbound share: `FINSDC3_DATASHARE` (schema `schema_Jedi_Snowflake`).
- Source tables: `FINS.PUBLIC.MASTER_ACCOUNTS` (~36,813 rows), 13 dataset tables (~3.92M rows total).

Full registry with stream RecordIds + DMO Ids: see memory `[[reference_jdo_dc_artifacts]]`.

---

# Phase A — Snowflake schema migration (one-time)

Run this **once** before onboarding any second org. Idempotent; safe to re-run.

## A1. Add `ORG_ID` to `MASTER_ACCOUNTS`

```sql
ALTER TABLE FINS.PUBLIC.MASTER_ACCOUNTS
  ADD COLUMN IF NOT EXISTS ORG_ID VARCHAR(18) NOT NULL DEFAULT 'JDO';

-- Backfill existing rows to the model org's identifier.
UPDATE FINS.PUBLIC.MASTER_ACCOUNTS SET ORG_ID = 'JDO' WHERE ORG_ID IS NULL OR ORG_ID = '';

-- Forbid the default going forward — every loader must specify ORG_ID.
ALTER TABLE FINS.PUBLIC.MASTER_ACCOUNTS ALTER COLUMN ORG_ID DROP DEFAULT;
```

> `ORG_ID` is a stable short identifier you assign (e.g. `JDO`, `ACME`, `WFB`) — *not* the 18-char SF Org Id, because that changes per sandbox refresh. Pick something durable per logical-tenant.

## A2. Update `MASTER_ACCOUNTS` loader to stamp `ORG_ID`

The model org's loader is `SP_LOAD_MASTER_ACCOUNTS` reading from `FINSDC3_DATASHARE`. Each new org gets its own loader (Phase B5) that inserts with its own `ORG_ID`. The shared SP's MERGE clause needs an `ORG_ID` filter:

```sql
-- Inside SP_LOAD_MASTER_ACCOUNTS — before MERGE, narrow the source to the org.
MERGE INTO FINS.PUBLIC.MASTER_ACCOUNTS tgt
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
CREATE OR REPLACE VIEW FINS.PUBLIC.V_ACCOUNT_ANCHORS AS
SELECT
    ma.ORG_ID,
    ma.ACCOUNT_ID,
    ma.ACCOUNT_NAME,
    ma.SNAPSHOT_DATE,
    -- ... existing columns unchanged ...
    a."External_ID_c__c"  AS EXTERNAL_ID
FROM FINS.PUBLIC.MASTER_ACCOUNTS ma
INNER JOIN FINS.PUBLIC.V_ACCOUNT_DATASHARE_UNION a
        ON a."ssot__Id__c" = ma.ACCOUNT_ID
       AND a.ORG_ID         = ma.ORG_ID
WHERE ma.SNAPSHOT_DATE = (
    SELECT MAX(SNAPSHOT_DATE)
    FROM FINS.PUBLIC.MASTER_ACCOUNTS
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
CREATE OR REPLACE VIEW FINS.PUBLIC.V_ACCOUNT_DATASHARE_UNION AS
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
CREATE OR REPLACE ROW ACCESS POLICY FINS.PUBLIC.ORG_FILTER AS (org_id VARCHAR) RETURNS BOOLEAN ->
  org_id = SYSTEM$GET_TAG('ORG_ID', CURRENT_ROLE(), 'ROLE');

ALTER TABLE FINS.PUBLIC.CLARITAS_DEMOGRAPHICS ADD ROW ACCESS POLICY FINS.PUBLIC.ORG_FILTER ON (ORG_ID);
-- repeat for the 12 others
```

Skip if all 13 datasets are written by per-org SPs that already filter via `V_ACCOUNT_ANCHORS` (the audience flow already isolates rows by org). The policy is a defense-in-depth layer for ad-hoc queries.

## A6. Add `ORG_ID` to the 13 dataset tables

Each dataset table currently keys on `ACCOUNT_ID` (and per-plan time qualifiers). Add `ORG_ID` and update the PK so two orgs can carry the same `ACCOUNT_ID`:

```sql
ALTER TABLE FINS.PUBLIC.MGP_FINANCIAL_PLANS
  ADD COLUMN IF NOT EXISTS ORG_ID VARCHAR(18) NOT NULL DEFAULT 'JDO';

UPDATE FINS.PUBLIC.MGP_FINANCIAL_PLANS SET ORG_ID = 'JDO' WHERE ORG_ID IS NULL;
ALTER TABLE FINS.PUBLIC.MGP_FINANCIAL_PLANS ALTER COLUMN ORG_ID DROP DEFAULT;

-- Update primary-key column list in each plan's DDL file:
-- before: PRIMARY KEY (ACCOUNT_ID, PROFILE_MONTH)
-- after:  PRIMARY KEY (ORG_ID, ACCOUNT_ID, PROFILE_MONTH)
```

Apply the same pattern to all 13 dataset DDLs:

| Plan | Table | PK before | PK after |
|---|---|---|---|
| 1 | CLARITAS_DEMOGRAPHICS | (ACCOUNT_ID, PROFILE_MONTH) | (ORG_ID, ACCOUNT_ID, PROFILE_MONTH) |
| 2 | MSCI_ESG | (ACCOUNT_ID, PROFILE_MONTH) | (ORG_ID, ACCOUNT_ID, PROFILE_MONTH) |
| 3 | DNB_BUSINESS_CREDIT | (ACCOUNT_ID, PROFILE_MONTH) | (ORG_ID, ACCOUNT_ID, PROFILE_MONTH) |
| 4 | ESRI_GEO_FOOTPRINT | (POSTAL_CODE, PROFILE_MONTH) | (ORG_ID, POSTAL_CODE, PROFILE_MONTH) |
| 5 | CORELOGIC_PROPERTY | (ACCOUNT_ID, PROFILE_MONTH) | (ORG_ID, ACCOUNT_ID, PROFILE_MONTH) |
| 6 | PLAID_HELDAWAY | (ACCOUNT_ID, ACCOUNT_NUMBER) | (ORG_ID, ACCOUNT_ID, ACCOUNT_NUMBER) |
| 7 | WORLDCHECK_AML | (ACCOUNT_ID, CASE_ID) | (ORG_ID, ACCOUNT_ID, CASE_ID) |
| 8 | MGP_FINANCIAL_PLANS | (ACCOUNT_ID, PROFILE_MONTH) | (ORG_ID, ACCOUNT_ID, PROFILE_MONTH) |
| 9 | SYNTH_RELATIONSHIP_GRAPH | (SRC_ACCOUNT_ID, DST_ACCOUNT_ID) | (ORG_ID, SRC_ACCOUNT_ID, DST_ACCOUNT_ID) |
| 10 | BOARDEX_EXEC_INTEL | (ACCOUNT_ID, PROFILE_MONTH) | (ORG_ID, ACCOUNT_ID, PROFILE_MONTH) |
| 11 | ZOOMINFO_FIRMOGRAPHICS | (ACCOUNT_ID, PROFILE_MONTH) | (ORG_ID, ACCOUNT_ID, PROFILE_MONTH) |
| 12 | GONG_CALL_SENTIMENT | (ACCOUNT_ID, CALL_WEEK) | (ORG_ID, ACCOUNT_ID, CALL_WEEK) |
| 13 | MOODYS_MARKET_CONTEXT | (ACCOUNT_ID, PROFILE_DATE) | (ORG_ID, ACCOUNT_ID, PROFILE_DATE) |

Then update each plan's SP MERGE so the source SELECT carries `ORG_ID` (sourced from the audience row, which V_ACCOUNT_ANCHORS already supplies post-A3).

## A7. Verify Phase A

```bash
snow sql -q "
SELECT ORG_ID, COUNT(DISTINCT ACCOUNT_ID) AS distinct_accounts
FROM FINS.PUBLIC.MASTER_ACCOUNTS
WHERE SNAPSHOT_DATE = (SELECT MAX(SNAPSHOT_DATE) FROM FINS.PUBLIC.MASTER_ACCOUNTS)
GROUP BY ORG_ID;"
-- Expect: JDO | 36181  (only one org until Phase B runs)

snow sql -q "SELECT ORG_ID, COUNT(*) FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS GROUP BY ORG_ID;"
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
GRANT USAGE ON SCHEMA FINS.PUBLIC TO ROLE DC_CONNECTOR_ACME;
GRANT SELECT ON ALL VIEWS IN SCHEMA FINS.PUBLIC TO ROLE DC_CONNECTOR_ACME;
GRANT SELECT ON ALL TABLES IN SCHEMA FINS.PUBLIC TO ROLE DC_CONNECTOR_ACME;

-- Create per-org service user
CREATE USER IF NOT EXISTS DC_CONNECTOR_ACME_USER
  PASSWORD = '<rotate>' DEFAULT_ROLE = DC_CONNECTOR_ACME DEFAULT_WAREHOUSE = MAIN_WH_XS
  RSA_PUBLIC_KEY = '<acme_pub_key>';
GRANT ROLE DC_CONNECTOR_ACME TO USER DC_CONNECTOR_ACME_USER;
```

> The role tag `ORG_ID = 'ACME'` is what `V_ACCOUNT_ANCHORS` reads. Without it, the view falls back to the safe default and the new org sees `JDO` data — verify post-grant.

## B3. Update the UNION view in Snowflake

```sql
CREATE OR REPLACE VIEW FINS.PUBLIC.V_ACCOUNT_DATASHARE_UNION AS
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

### B7b. Create the 13 DMOs (API)

Same pattern with `output/plan-*-dc-create-dmo-payload.json` against `/ssot/data-model-objects`.

### B7c. Map DLO → DMO (UI, ~90s/DMO via skill)

REST `POST /ssot/data-model-object-mappings` returns `UNKNOWN_EXCEPTION` for fully-custom DMOs. Use the Lightning UI flow encoded in the `dc-field-mapping-via-data-stream` skill:

1. Open the new org → Data Cloud → Data Streams → click `CumulusClaritasDemographics`
2. Start → Select Objects → Custom Data Model tab → Add Object → pick the matching `__dlm` → Done → Continue → Save
3. Einstein auto-maps fields by column-name match.

13 DMOs × ~90s = ~20 min.

### B7d. Set FK relationships (UI)

For each DMO with `ssot__AccountId__c`: edit field → Foreign Key Relationship → `ssot__Account__dlm.ssot__Id__c`. Plan 4 (geo) has none. Plan 9 has both `Src` and `Dst` FKs.

## B8. Verify the new org's DC layer

```bash
for DMO in CumulusClaritasDemographics CumulusMSCIESG CumulusDnBBusinessCredit \
           CumulusEsriGeoFootprint CumulusCoreLogicProperty CumulusPlaidHeldAway \
           CumulusWorldCheckAML CumulusMgpFinancialPlans CumulusSynthRelationshipGraph \
           CumulusBoardExExecIntel CumulusZoomInfoFirmographics CumulusGongCallSentiment \
           CumulusMoodysMarketContext; do
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
