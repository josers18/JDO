# MSCI — Cumulus Synthetic Dataset (ESG Scores)

Synthetic MSCI-style ESG ratings for Cumulus BUSINESS accounts. Mirrors
[Snowflake_CSAT_NPS](../Snowflake_CSAT_NPS) and the Cumulus umbrella spec at
[../docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md](../docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md).

## Plan
- Plan 2, instantiated from `../docs/superpowers/plans/2026-05-28-cumulus-plan-N-dataset-template.md` (v1.4)
- Per-plan file: `../docs/superpowers/plans/2026-05-28-cumulus-plan-2-msci-esg.md`
- Rowspec: `../docs/superpowers/plans/attachments/cumulus-plan-2-msci-esg-rowspec.md`
- Depends on: [Snowflake_Cumulus_Common](../Snowflake_Cumulus_Common) (Plan 0)

## Snowflake objects
- Table: `FINS.PUBLIC.MSCI_ESG_SCORES`
- Stored procedure: `FINS.PUBLIC.SP_GENERATE_MSCI_ESG_SCORES()`
- Task: `FINS.PUBLIC.TASK_MONTHLY_MSCI_ESG_SCORES` (MONTHLY, `0 7 1 * * UTC`, warehouse `MAIN_WH_XS`, wrapper `SP_RETRY_WRAPPER` retries=2)
- Egress: DC "Snowflake (Federate / Zero Copy)" connector → DLO `CumulusMSCIESG__dll` → DMO `CumulusMSCIESG__dlm`

## Audience
```sql
SELECT DISTINCT * FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS WHERE ACCOUNT_TYPE_FLAG = 'BUSINESS'
```

## Tests
```bash
cd Snowflake_MSCI_ESG
pip install -e ".[dev]"
pip install -e ../Snowflake_Cumulus_Common
pytest tests/ -v
```

## Deploy
```bash
snow sql -c GSB13421 -f schemas/msci_esg_scores.sql
snow sql -c GSB13421 -f procedures/sp_create_procedure.sql
snow sql -c GSB13421 -f tasks/task_monthly_msci_esg_scores.sql
```

DC ingest is configured via the existing federation connector (see Plan 2 Task 7 + the recipe at `../Snowflake_Claritas_Demographics/docs/dc-setup-recipe.md`).
