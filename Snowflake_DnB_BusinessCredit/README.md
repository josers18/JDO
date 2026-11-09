# D&B — Cumulus Synthetic Dataset (Business Credit)

Synthetic D&B-style business credit ratings for Cumulus BUSINESS accounts. Mirrors
[Snowflake_MSCI_ESG](../Snowflake_MSCI_ESG) and the Cumulus umbrella spec at
[../docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md](../docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md).

## Plan
- Plan 3, instantiated from `../docs/superpowers/plans/2026-05-28-cumulus-plan-N-dataset-template.md` (v1.4)
- Per-plan file: `../docs/superpowers/plans/2026-05-28-cumulus-plan-3-dnb-business-credit.md`
- Rowspec: `../docs/superpowers/plans/attachments/cumulus-plan-3-dnb-business-credit-rowspec.md`
- Depends on: [Snowflake_Cumulus_Common](../Snowflake_Cumulus_Common) (Plan 0)

## Snowflake objects
- Table: `DATA_JEDAIS.FINS__PUBLIC.DNB_BUSINESS_CREDIT`
- Stored procedure: `DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_DNB_BUSINESS_CREDIT()`
- Task: `DATA_JEDAIS.FINS__PUBLIC.TASK_MONTHLY_DNB_BUSINESS_CREDIT` (MONTHLY, `0 7 1 * * UTC`, warehouse `MAIN_WH_XS`, wrapper `SP_RETRY_WRAPPER` retries=2)
- Egress: DC "Snowflake (Federate / Zero Copy)" connector → DLO `CumulusDnBBusinessCredit__dll` → DMO `CumulusDnBBusinessCredit__dlm`

## Audience
```sql
SELECT DISTINCT * FROM DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS WHERE ACCOUNT_TYPE_FLAG = 'BUSINESS'
```

## Tests
```bash
cd Snowflake_DnB_BusinessCredit
pip install -e ".[dev]"
pip install -e ../Snowflake_Cumulus_Common
pytest tests/ -v
```

## Deploy
```bash
snow sql -c SFDC_DC_TECH_ARCH_jwt --role ACCOUNTADMIN -f schemas/dnb_business_credit.sql
python3 scripts/deploy_sp.py   # regenerate procedures/sp_create_procedure.sql and create the SP as ACCOUNTADMIN
snow sql -c SFDC_DC_TECH_ARCH_jwt --role ACCOUNTADMIN -f tasks/task_monthly_dnb_business_credit.sql
```

Deploy as ACCOUNTADMIN: the live SP, table and task are owned by ACCOUNTADMIN, and SYSADMIN lacks CREATE TABLE on `DATA_JEDAIS.FINS__PUBLIC`. `scripts/deploy_sp.py` passes `--role ACCOUNTADMIN` by default (`--role` overrides it).

DC ingest is configured via the existing federation connector (see Plan 3 Task 7 + the recipe at `../Snowflake_Claritas_Demographics/docs/dc-setup-recipe.md`).
