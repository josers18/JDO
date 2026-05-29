# Claritas — Cumulus Synthetic Dataset

Synthetic Claritas-style demographics data for Cumulus PERSON accounts. Mirrors
[Snowflake_CSAT_NPS](../Snowflake_CSAT_NPS) and the Cumulus umbrella spec at
[../docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md](../docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md).

## Plan
- Plan 1, instantiated from `../docs/superpowers/plans/2026-05-28-cumulus-plan-N-dataset-template.md`
- Per-plan file: `../docs/superpowers/plans/2026-05-28-cumulus-plan-1-claritas-demographics.md`
- Rowspec: `../docs/superpowers/plans/attachments/cumulus-plan-1-claritas-demographics-rowspec.md`
- Depends on: [Snowflake_Cumulus_Common](../Snowflake_Cumulus_Common) (Plan 0)

## Snowflake objects
- Table: `FINS.PUBLIC.CLARITAS_DEMOGRAPHICS`
- Stored procedure: `FINS.PUBLIC.SP_GENERATE_CLARITAS_DEMOGRAPHICS()`
- Task: `FINS.PUBLIC.TASK_MONTHLY_CLARITAS_DEMOGRAPHICS` (MONTHLY, `0 7 1 * * UTC`)
- Egress: DC "Snowflake (Federate / Zero Copy)" connector → DLO `CumulusClaritasDemographics__dll` → DMO `CumulusClaritasDemographics__dlm`

## Audience
```sql
SELECT DISTINCT * FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS WHERE ACCOUNT_TYPE_FLAG = 'PERSON'
```

## Tests
```bash
cd Snowflake_Claritas_Demographics
pip install -e ".[dev]"
pytest tests/ -v
```

## Deploy
```bash
snow sql -f schemas/claritas_demographics.sql
snow sql -f procedures/sp_generate_claritas_demographics.py
snow sql -f tasks/task_monthly_claritas_demographics.sql
```

DC ingest is configured in DC Setup → Data Streams (see Plan 1 Task 7).
