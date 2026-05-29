# CoreLogic — Cumulus Synthetic Dataset (Property Records)

Synthetic CoreLogic-style property records per PERSON account for Cumulus's customer footprint. Mirrors
[Snowflake_Esri_GeoFootprint](../Snowflake_Esri_GeoFootprint) and the Cumulus umbrella spec at
[../docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md](../docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md).

**Plan 5 is account-scoped with quarterly cadence.** Rows are keyed by `(ACCOUNT_ID, PROFILE_QUARTER)` — one row per PERSON anchor per quarter (~25,424 rows). The DMO is joinable to `ssot__Account__dlm` via FK `ACCOUNT_ID`.

## Plan
- Plan 5, instantiated from `../docs/superpowers/plans/2026-05-28-cumulus-plan-N-dataset-template.md` (v1.5)
- Per-plan file: `../docs/superpowers/plans/2026-05-28-cumulus-plan-5-corelogic-property.md`
- Rowspec: `../docs/superpowers/plans/attachments/cumulus-plan-5-corelogic-property-rowspec.md`
- Depends on: [Snowflake_Cumulus_Common](../Snowflake_Cumulus_Common) (Plan 0)

## Snowflake objects
- Table: `FINS.PUBLIC.CORELOGIC_PROPERTY`
- Stored procedure: `FINS.PUBLIC.SP_GENERATE_CORELOGIC_PROPERTY()`
- Task: `FINS.PUBLIC.TASK_QUARTERLY_CORELOGIC_PROPERTY` (QUARTERLY, `0 8 1 1,4,7,10 * UTC`, warehouse `MAIN_WH_XS`, wrapper `SP_RETRY_WRAPPER` retries=2)
- Egress: DC "Snowflake (Federate / Zero Copy)" connector → DLO `CumulusCoreLogicProperty__dll` → DMO `CumulusCoreLogicProperty__dlm`

## Audience
**Account-scoped** — enrolls PERSON anchors with valid ZIP codes:

```sql
SELECT DISTINCT ACCOUNT_ID
FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS
WHERE ACCOUNT_TYPE_FLAG = 'PERSON'
  AND POSTAL_CODE IS NOT NULL
  AND POSTAL_CODE <> ''
```

Live cardinality (probed 2026-05-28): **25,424 PERSON anchors** with non-empty POSTAL_CODE. One row per PERSON per quarter, so ~25,424 rows/quarter.

## Tests
```bash
cd Snowflake_CoreLogic_Property
pip install -e ".[dev]"
pip install -e ../Snowflake_Cumulus_Common
pytest tests/ -v
```

## Deploy
```bash
snow sql -f schemas/corelogic_property.sql
snow sql -f procedures/sp_create_procedure.sql
snow sql -f tasks/task_quarterly_corelogic_property.sql
```

DC ingest is configured via the existing federation connector (see Plan 5 Task 7 + the recipe at `../Snowflake_Claritas_Demographics/docs/dc-setup-recipe.md`).
