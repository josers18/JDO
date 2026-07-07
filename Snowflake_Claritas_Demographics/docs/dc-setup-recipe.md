# DC Setup Recipe — `CumulusClaritasDemographics`

Canonical recipe for wiring a Snowflake-federated dataset into Salesforce Data Cloud, discovered while implementing **Plan 1 Task 7** (`DATA_JEDAIS.FINS__PUBLIC.CLARITAS_DEMOGRAPHICS` → DLO → DMO). This is the first per-dataset DC stream in the Cumulus rollout — Plans 2–13 should follow the same recipe.

> **TL;DR.** Steps 1 and 2 (data stream + DLO, then DMO) are **fully scriptable** via the public REST API. Step 3 (DLO → DMO column mapping) **must be completed in the Lightning UI** — the public REST endpoint returns `UNKNOWN_EXCEPTION` for federated-Snowflake source DLOs, even though it works for SFDC-source DLOs.

---

## Prerequisites

- Snowflake side fully done: table populated, monthly TASK scheduled.
- DC org has a working `connectorType: SNOWFLAKE` connection pointed at the FINS database. In `jdo-uqj0jr` the connection is **`Jedi_Snowflake`** (id `9cgam0000003EknAAE`, account `eob55465.us-east-1.snowflakecomputing.com`, warehouse `MAIN_WH_XS`, user `jsifontes`).
- An access token for the org. Use `sf org auth show-access-token --target-org jdo-uqj0jr --no-prompt --json` (since CLI v2.136 the `--json` flag preserves the real token; `sf org display --json` returns `[REDACTED]`).

```bash
SF_TOKEN=$(sf org auth show-access-token --target-org jdo-uqj0jr --no-prompt --json \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['result']['accessToken'])")
INSTANCE_URL="https://storm-16a17dc388fbe6.demo.my.salesforce.com"
```

---

## Step 1 — Create the data stream + DLO (API)

Endpoint: `POST /services/data/v62.0/ssot/data-streams`

Payload (committed to repo at `output/plan-1-dc-create-stream-payload.json`):

```json
{
  "name": "CumulusClaritasDemographics",
  "label": "Cumulus Claritas Demographics",
  "datastreamType": "EXTERNAL",
  "connectorInfo": {
    "connectorType": "DataConnector",
    "connectorDetails": { "name": "Jedi_Snowflake" }
  },
  "dataLakeObjectInfo": {
    "dataspaceInfo": [{ "name": "default" }],
    "category": "Profile",
    "label": "Cumulus Claritas Demographics",
    "name": "CumulusClaritasDemographics__dll",
    "dataLakeFieldInputRepresentations": [ /* … 14 columns, see payload file … */ ]
  },
  "mappings":     [ /* sourceFieldLabel == targetFieldName for each col */ ],
  "sourceFields": [ /* each col with dataType + name + (Date format) */ ],
  "refreshConfig": { "refreshMode": "TOTAL_REPLACE" },
  "advancedAttributes": {
    "schema": "PUBLIC", "database": "FINS", "object": "CLARITAS_DEMOGRAPHICS"
  },
  "dataAccessMode": "Direct_Access"
}
```

**Quirk encountered (resolved):** The first POST returned

> `BAD_REQUEST: source field with name PROFILE_MONTH and format MM/dd/yyyy does not match the field with name PROFILE_MONTH and format yyyy-MM-dd on connect api payload`

Snowflake DATE columns auto-discover with format `MM/dd/yyyy` — set the `format` on every Date `sourceFields` entry to `MM/dd/yyyy` (NOT the more-natural `yyyy-MM-dd`). Once aligned, the POST returns 200 with a fully-baked DLO at `CumulusClaritasDemographics__dll`.

After this step the DLO is **immediately queryable** because it's federated (Direct_Access) — no copy-and-load needed:

```bash
curl -s -X POST -H "Authorization: Bearer $SF_TOKEN" -H "Content-Type: application/json" \
  "$INSTANCE_URL/services/data/v62.0/ssot/queryv2" \
  -d '{"sql":"SELECT COUNT(*) FROM CumulusClaritasDemographics__dll"}'
# {"data": [[25424]], …}
```

25,424 rows — exact match with Snowflake source.

---

## Step 2 — Create the DMO (API)

Endpoint: `POST /services/data/v62.0/ssot/data-model-objects`

Payload (committed to repo at `output/plan-1-dc-create-dmo-payload.json`):

```json
{
  "name": "CumulusClaritasDemographics",
  "label": "Cumulus Claritas Demographics",
  "description": "...",
  "dataSpaceName": "default",
  "category": "PROFILE",
  "fields": [
    { "name": "ssot__AccountId",           "dataType": "Text",     ... },
    { "name": "profileMonth",              "dataType": "Date",     "isPrimaryKey": true, ... },
    { "name": "prizmSegmentCode",          "dataType": "Text", ... },
    /* … 11 more, see payload … */
    { "name": "generatedAt",               "dataType": "DateTime", ... }
  ]
}
```

The API auto-suffixes every field with `__c` and auto-creates 4 system fields:
`DataSource__c`, `DataSourceObject__c`, `InternalOrganization__c`, `KQ_profileMonth__c` (key-qualifier for the PK).

Created DMO: **`CumulusClaritasDemographics__dlm`** (id `0gjam000001DJkDAAW`, status ACTIVE).

---

## Step 3 — Map DLO → DMO columns (UI, NOT API)

This is the gap. The expected API call is

```
POST /services/data/v62.0/ssot/data-model-object-mappings?dataspace=default
```

with a body of the shape

```json
{
  "sourceEntityDeveloperName": "CumulusClaritasDemographics__dll",
  "targetEntityDeveloperName": "CumulusClaritasDemographics__dlm",
  "fieldMapping": [
    {"sourceFieldDeveloperName": "ACCOUNT_ID__c",    "targetFieldDeveloperName": "ssot__AccountId__c"},
    {"sourceFieldDeveloperName": "PROFILE_MONTH__c", "targetFieldDeveloperName": "profileMonth__c"},
    /* … one row per column … */
  ]
}
```

This payload (saved at `output/plan-1-dc-create-mapping-payload.json`) returned

```
HTTP 500 — UNKNOWN_EXCEPTION
ErrorId: 1556798735-116609 (-1138913265)
```

across three retry shapes (with/without system fields, with/without `dataspace`, with/without `KQ_*`). The `dataspace=Default` (capitalized) variant returned `INTERNAL_ERROR: end-user denied authorization`, suggesting the endpoint is reachable but rejects something in the body.

Existing org evidence: **`CumulusWebProfilesSQL__dll → ssot__Account__dlm`** does have an active API-created mapping, so the endpoint can work for Snowflake-source DLOs in principle — but only when targeting a *standard* DMO with `ssot__*` fields. Targeting a fully-custom DMO (only `__c` fields) appears to trip an internal validator.

### Manual UI walkthrough (≤ 5 minutes)

1. Open Data Cloud app → **Data Model** tab → search for **`CumulusClaritasDemographics`**.
2. Click the DMO → top-right **New** → **New Field Mapping**.
3. Source object: **`CumulusClaritasDemographics__dll`** (in `default` data space).
4. Map each column:

   | Source DLO field (`__c` suffixed) | Target DMO field (`__c` suffixed) |
   |---|---|
   | `ACCOUNT_ID__c`                  | `ssot__AccountId__c` |
   | `PROFILE_MONTH__c`               | `profileMonth__c` |
   | `PRIZM_SEGMENT_CODE__c`          | `prizmSegmentCode__c` |
   | `PRIZM_SEGMENT_NAME__c`          | `prizmSegmentName__c` |
   | `PRIZM_LIFESTYLE_GROUP__c`       | `prizmLifestyleGroup__c` |
   | `LIFE_STAGE__c`                  | `lifeStage__c` |
   | `HOUSEHOLD_COMPOSITION__c`       | `householdComposition__c` |
   | `ESTIMATED_NET_WORTH_BAND__c`    | `estimatedNetWorthBand__c` |
   | `WEALTH_PROPENSITY_SCORE__c`     | `wealthPropensityScore__c` |
   | `INVESTMENT_PROPENSITY_SCORE__c` | `investmentPropensityScore__c` |
   | `MORTGAGE_PROPENSITY_SCORE__c`   | `mortgagePropensityScore__c` |
   | `URBANICITY__c`                  | `urbanicity__c` |
   | `FINANCIAL_STRESS_INDICATOR__c`  | `financialStressIndicator__c` |
   | `GENERATED_AT__c`                | `generatedAt__c` |
   | `KQ_PROFILE_MONTH__c`            | `KQ_profileMonth__c` |

5. **Optional but recommended:** flag `ssot__AccountId__c` as a **foreign key to `ssot__Account__dlm.ssot__Id__c`** so Phase-3d-style cross-DMO joins work. The DC field-edit dialog has a "Foreign Key Relationship" section.
6. **Save & Deploy.**

### Verification SQL

```sql
SELECT COUNT(*) FROM CumulusClaritasDemographics__dlm;
-- Expect ~25,424 (matches DLO + Snowflake)
```

```sql
SELECT a.ssot__Id__c, d.profileMonth__c, d.prizmSegmentCode__c
FROM ssot__Account__dlm a
JOIN CumulusClaritasDemographics__dlm d ON d.ssot__AccountId__c = a.ssot__Id__c
LIMIT 5;
-- FK works → Plan 1 fully wired.
```

---

## Recipe summary for Plans 2–13

For every subsequent Snowflake-source dataset (each `Snowflake_*` plan):

| Step | API or UI? | Notes |
|---|---|---|
| 1. Stream + DLO | **API** | `POST /ssot/data-streams` with `connectorType:"DataConnector"`, `connectorDetails.name:"Jedi_Snowflake"`. **Date columns must declare `format: "MM/dd/yyyy"`** in `sourceFields`. |
| 2. DMO create   | **API** | `POST /ssot/data-model-objects` with custom-dlm fields. Auto-`__c`-suffixes. |
| 3. DLO → DMO mapping | **UI** | Public REST returns `UNKNOWN_EXCEPTION` when target DMO has only custom fields (no `ssot__*`). Use Data Model Setup UI. ~5 min per dataset. |
| 4. (optional) FK | **UI** | Set in DMO field edit dialog. Required for cross-DMO joins. |
| 5. Verify       | **API** | `POST /ssot/queryv2 SELECT COUNT(*) FROM <dmo>` after mapping deploys. |

Total per-dataset cost: **~5 minutes UI work** plus whatever scripts you run.

If a future SDK release fixes the `UNKNOWN_EXCEPTION`, this recipe collapses to fully-API. Track the spec at `~/.claude/skills/dc-connect-api/spec.yaml` for vocabulary changes.

---

## Artifacts captured

All under `output/` in the repo root:

- `plan-1-dc-stream-create.json` — final GET on the data stream after creation
- `plan-1-dc-create-stream-payload.json` — the working POST body
- `plan-1-dc-create-dmo-payload.json` — the DMO POST body
- `plan-1-dc-dmo-create-response.json` — the DMO POST response (full field list)
- `plan-1-dc-create-mapping-payload.json` — the mapping POST body that hit UNKNOWN_EXCEPTION
- `plan-1-dc-mapping-create-error.json` — the error response (with ErrorId)
