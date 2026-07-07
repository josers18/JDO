# Esri — Cumulus Synthetic Dataset (Geo Footprint)

Synthetic Esri-style geographic enrichment per ZIP for Cumulus's customer footprint. Mirrors
[Snowflake_DnB_BusinessCredit](../Snowflake_DnB_BusinessCredit) and the Cumulus umbrella spec at
[../docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md](../docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md).

**Plan 4 is non-account-scoped.** Rows are keyed by `(BRANCH_ZIP, PROFILE_MONTH)` — one row per distinct US ZIP per month (~13,328 rows). The DMO is **not joinable** to `ssot__Account__dlm` via FK; downstream queries use `branchZip__c = postalCode__c` as a soft join.

## Plan
- Plan 4, instantiated from `../docs/superpowers/plans/2026-05-28-cumulus-plan-N-dataset-template.md` (v1.4.2)
- Per-plan file: `../docs/superpowers/plans/2026-05-28-cumulus-plan-4-esri-geo-footprint.md`
- Rowspec: `../docs/superpowers/plans/attachments/cumulus-plan-4-esri-geo-footprint-rowspec.md`
- Depends on: [Snowflake_Cumulus_Common](../Snowflake_Cumulus_Common) (Plan 0)

## Snowflake objects
- Table: `DATA_JEDAIS.FINS__PUBLIC.ESRI_GEO_FOOTPRINT`
- Stored procedure: `DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_ESRI_GEO_FOOTPRINT()`
- Task: `DATA_JEDAIS.FINS__PUBLIC.TASK_MONTHLY_ESRI_GEO_FOOTPRINT` (MONTHLY, `0 7 1 * * UTC`, warehouse `MAIN_WH_XS`, wrapper `SP_RETRY_WRAPPER` retries=2)
- Egress: DC "Snowflake (Federate / Zero Copy)" connector → DLO `CumulusEsriGeoFootprint__dll` → DMO `CumulusEsriGeoFootprint__dlm`

## Audience
**Branch-scoped** — aggregates `V_ACCOUNT_ANCHORS` to enumerate distinct US ZIPs (one row per ZIP, with the customer count rolled up per ZIP):

```sql
SELECT POSTAL_CODE, STATE_CODE, COUNTRY_CODE,
       COUNT(DISTINCT ACCOUNT_ID) AS CUSTOMER_COUNT
FROM DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS
WHERE POSTAL_CODE IS NOT NULL
GROUP BY POSTAL_CODE, STATE_CODE, COUNTRY_CODE
```

Live cardinality (probed 2026-05-28): **13,328 distinct ZIPs across 23 states**. Coverage assertion compares `COUNT(DISTINCT BRANCH_ZIP) FROM ESRI_GEO_FOOTPRINT` against `COUNT(DISTINCT POSTAL_CODE) FROM V_ACCOUNT_ANCHORS WHERE POSTAL_CODE IS NOT NULL`.

## Tests
```bash
cd Snowflake_Esri_GeoFootprint
pip install -e ".[dev]"
pip install -e ../Snowflake_Cumulus_Common
pytest tests/ -v
```

## Deploy
```bash
snow sql -f schemas/esri_geo_footprint.sql
snow sql -f procedures/sp_create_procedure.sql
snow sql -f tasks/task_monthly_esri_geo_footprint.sql
```

DC ingest is configured via the existing federation connector (see Plan 4 Task 7 + the recipe at `../Snowflake_Claritas_Demographics/docs/dc-setup-recipe.md`).
