# MoneyGuidePro Financial Plans — Cumulus Synthetic Dataset (Wealth Financial Planning)

Synthetic MoneyGuidePro / eMoney / NaviPlan-style financial-plan dataset per account (all anchors, PERSON + BUSINESS) for Cumulus's customer footprint. Mirrors
[Snowflake_WorldCheck_AML](../Snowflake_WorldCheck_AML) and the Cumulus umbrella spec at
[../docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md](../docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md).

**Plan 8 is account-scoped with monthly cadence and an all-accounts audience (~36,813 anchors) — the first dataset whose NULL semantics are gated by a non-Boolean enum.** The v1 design was Wealth Management only (~3,920 anchors); the rebroadcast (v2) widened it to every distinct anchor, with BUSINESS anchors getting a synthesized "business owner" persona (see [Audience](#audience)). Each distinct anchor produces one financial-plan row per month. Rows are keyed by composite PK `(ACCOUNT_ID, PROFILE_MONTH)` (~36,813 rows/month at 1:1 anchor:row). Re-runs same calendar month MERGE-replace in place. The DMO is joinable to `ssot__Account__dlm` via FK `ACCOUNT_ID`; DC PK collapses to single-column `profileMonth__c` with `ssot__AccountId__c` as a KQ qualifier (single-column-PK rule from Plan 4).

## Plan
- Plan 8, instantiated from `../docs/superpowers/plans/2026-05-28-cumulus-plan-N-dataset-template.md` (v1.5)
- Per-plan file: `../docs/superpowers/plans/2026-05-28-cumulus-plan-8-mgp-financial-plans.md`
- Rowspec: `../docs/superpowers/plans/attachments/cumulus-plan-8-mgp-financial-plans-rowspec.md`
- Depends on: [Snowflake_Cumulus_Common](../Snowflake_Cumulus_Common) (Plan 0)

## Snowflake objects
- Table: `DATA_JEDAIS.FINS__PUBLIC.MGP_FINANCIAL_PLANS`
- Stored procedure: `DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_MGP_FINANCIAL_PLANS()`
- Task: `DATA_JEDAIS.FINS__PUBLIC.TASK_MONTHLY_MGP_FINANCIAL_PLANS` (MONTHLY, `0 7 1 * * UTC`, warehouse `MAIN_WH_XS`, wrapper `SP_RETRY_WRAPPER` retries=2)
- Egress: DC "Snowflake (Federate / Zero Copy)" connector → DLO `CumulusMgpFinancialPlans__dll` → DMO `CumulusMgpFinancialPlans__dlm`

## Audience
**All accounts** — every distinct anchor in `V_ACCOUNT_ANCHORS`, PERSON and BUSINESS alike (no `CLIENT_CATEGORY` filter). The audience predicate:

```sql
SELECT DISTINCT * FROM DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS
```

Cardinality: **~36,813 distinct accounts**. The v1 design was Wealth Management only (`CLIENT_CATEGORY = 'Wealth Management'`, 3,920 accounts probed 2026-05-28), which left ~89% of customers with no plan data; the rebroadcast dropped that predicate.

**BUSINESS-anchor fallback.** PERSON anchors keep `BIRTHDATE` + `ANNUAL_INCOME` populated. BUSINESS anchors have both NULL, so `_effective_age` and `_effective_annual_income` synthesize a "business owner" persona — a year-stable owner age in [40, 65] from the `ACCOUNT_ID` hash, and an owner draw of ~5% of `ANNUAL_REVENUE` clamped to [$150K, $2M]. The age/income-banded helpers downstream are unchanged.

Each anchor emits exactly one financial-plan row per month → **~36,813 rows/month**.

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
