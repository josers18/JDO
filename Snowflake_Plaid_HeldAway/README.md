# Plaid Held-Away — Cumulus Synthetic Dataset (External Financial Accounts)

Synthetic Plaid-style held-away financial accounts per Retail/Wealth anchor for Cumulus's customer footprint. Mirrors
[Snowflake_CoreLogic_Property](../Snowflake_CoreLogic_Property) and the Cumulus umbrella spec at
[../docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md](../docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md).

**Plan 6 is account-scoped with monthly cadence — the first 1:N dataset in the Cumulus rollout.** Each anchor produces 1–5 held-away account rows. Rows are keyed by composite PK `(ACCOUNT_ID, HELD_AWAY_ACCOUNT_ID, PROFILE_MONTH)` (~52,300 rows/month at mean ~2.06 rows/anchor). The DMO is joinable to `ssot__Account__dlm` via FK `ACCOUNT_ID`; DC PK is the single-column `heldAwayAccountId__c` with `accountId__c` and `profileMonth__c` as KQ qualifiers.

## Plan
- Plan 6, instantiated from `../docs/superpowers/plans/2026-05-28-cumulus-plan-N-dataset-template.md` (v1.5)
- Per-plan file: `../docs/superpowers/plans/2026-05-28-cumulus-plan-6-plaid-held-away.md`
- Rowspec: `../docs/superpowers/plans/attachments/cumulus-plan-6-plaid-held-away-rowspec.md`
- Depends on: [Snowflake_Cumulus_Common](../Snowflake_Cumulus_Common) (Plan 0)

## Snowflake objects
- Table: `DATA_JEDAIS.FINS__PUBLIC.PLAID_HELD_AWAY`
- Stored procedure: `DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_PLAID_HELD_AWAY()`
- Task: `DATA_JEDAIS.FINS__PUBLIC.TASK_MONTHLY_PLAID_HELD_AWAY` (MONTHLY, `0 7 1 * * UTC`, warehouse `MAIN_WH_XS`, wrapper `SP_RETRY_WRAPPER` retries=2)
- Egress: DC "Snowflake (Federate / Zero Copy)" connector → DLO `CumulusPlaidHeldAway__dll` → DMO `CumulusPlaidHeldAway__dlm`

## Audience
**Account-scoped** — enrolls Retail + Wealth Management anchors:

```sql
SELECT DISTINCT ACCOUNT_ID
FROM DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS
WHERE CLIENT_CATEGORY IN ('Retail', 'Wealth Management')
```

Live cardinality (probed 2026-05-28): **25,381 anchors** (Retail 21,461 + Wealth Management 3,920). BIRTHDATE and ANNUAL_INCOME both 100% populated on this audience. Each anchor emits 1–5 held-away rows per month — expected mean ~2.06 → **~52,300 rows/month** (largest Cumulus table to date).

## Tests
```bash
cd Snowflake_Plaid_HeldAway
pip install -e ".[dev]"
pip install -e ../Snowflake_Cumulus_Common
pytest tests/ -v
```

## Deploy
```bash
snow sql -f schemas/plaid_held_away.sql
snow sql -f procedures/sp_create_procedure.sql
snow sql -f tasks/task_monthly_plaid_held_away.sql
```

DC ingest is configured via the existing federation connector (see Plan 6 Task 7 + the recipe at `../Snowflake_Claritas_Demographics/docs/dc-setup-recipe.md`).
