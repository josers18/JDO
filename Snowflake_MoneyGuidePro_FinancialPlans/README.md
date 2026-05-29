# MoneyGuidePro Financial Plans — Cumulus Synthetic Dataset (Wealth Financial Planning)

Synthetic MoneyGuidePro / eMoney / NaviPlan-style financial-plan dataset per Wealth Management account for Cumulus's customer footprint. Mirrors
[Snowflake_WorldCheck_AML](../Snowflake_WorldCheck_AML) and the Cumulus umbrella spec at
[../docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md](../docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md).

**Plan 8 is account-scoped with monthly cadence — the smallest Cumulus audience by 2.9× (Wealth Management only, ~3,920 anchors) AND the first dataset whose NULL semantics are gated by a non-Boolean enum.** Each distinct Wealth anchor produces one financial-plan row per month. Rows are keyed by composite PK `(ACCOUNT_ID, PROFILE_MONTH)` (~3,920 rows/month at 1:1 anchor:row). Re-runs same calendar month MERGE-replace in place. The DMO is joinable to `ssot__Account__dlm` via FK `ACCOUNT_ID`; DC PK collapses to single-column `profileMonth__c` with `ssot__AccountId__c` as a KQ qualifier (single-column-PK rule from Plan 4).

## Plan
- Plan 8, instantiated from `../docs/superpowers/plans/2026-05-28-cumulus-plan-N-dataset-template.md` (v1.5)
- Per-plan file: `../docs/superpowers/plans/2026-05-28-cumulus-plan-8-mgp-financial-plans.md`
- Rowspec: `../docs/superpowers/plans/attachments/cumulus-plan-8-mgp-financial-plans-rowspec.md`
- Depends on: [Snowflake_Cumulus_Common](../Snowflake_Cumulus_Common) (Plan 0)

## Snowflake objects
- Table: `FINS.PUBLIC.MGP_FINANCIAL_PLANS`
- Stored procedure: `FINS.PUBLIC.SP_GENERATE_MGP_FINANCIAL_PLANS()`
- Task: `FINS.PUBLIC.TASK_MONTHLY_MGP_FINANCIAL_PLANS` (MONTHLY, `0 7 1 * * UTC`, warehouse `MAIN_WH_XS`, wrapper `SP_RETRY_WRAPPER` retries=2)
- Egress: DC "Snowflake (Federate / Zero Copy)" connector → DLO `CumulusMgpFinancialPlans__dll` → DMO `CumulusMgpFinancialPlans__dlm`

## Audience
**Wealth Management only** — every distinct anchor in `V_ACCOUNT_ANCHORS` whose `CLIENT_CATEGORY = 'Wealth Management'`. Retail customers don't get formal financial plans (they self-serve via apps); Commercial / Small Business has its own corporate-treasury planning tools. The audience predicate is therefore the cleanest in the rollout:

```sql
SELECT DISTINCT * FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS
WHERE CLIENT_CATEGORY = 'Wealth Management'
```

Live cardinality (probed 2026-05-28): **3,920 distinct accounts** with no MASTER_ACCOUNTS duplicates. **Smallest Cumulus dataset by 2.9×** — next-smallest is MSCI ESG / D&B Business Credit at 11,389. Both `BIRTHDATE` and `ANNUAL_INCOME` are 100% populated for this cohort — income range $200K-$1.9M, median $333K, mean $381K.

Each anchor emits exactly one financial-plan row per month → **~3,920 rows/month**.

## Tests
```bash
cd Snowflake_MoneyGuidePro_FinancialPlans
pip install -e ".[dev]"
pip install -e ../Snowflake_Cumulus_Common
pytest tests/ -v
```

## Deploy
```bash
snow sql -f schemas/mgp_financial_plans.sql
snow sql -f procedures/sp_create_procedure.sql
snow sql -f tasks/task_monthly_mgp_financial_plans.sql
```

DC ingest is configured via the existing federation connector (see Plan 8 Task 7 + the recipe at `../Snowflake_Claritas_Demographics/docs/dc-setup-recipe.md`).
