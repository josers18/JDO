# World-Check AML — Cumulus Synthetic Dataset (AML / Sanctions / PEP Screening)

Synthetic LSEG World-Check / Dow Jones Risk & Compliance / ComplyAdvantage-style AML screening per account for Cumulus's customer footprint. Mirrors
[Snowflake_Plaid_HeldAway](../Snowflake_Plaid_HeldAway) and the Cumulus umbrella spec at
[../docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md](../docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md).

**Plan 7 is account-scoped with daily cadence — the first daily-cadence dataset AND the first all-accounts-audience dataset in the Cumulus rollout.** Each distinct anchor produces one screening row per day. Rows are keyed by composite PK `(ACCOUNT_ID, PROFILE_DATE)` (~36,813 rows/day at 1:1 anchor:row). Re-runs same calendar day MERGE-replace in place — no daily history retained, so live storage stays at ~36,813 rows year-round. The DMO is joinable to `ssot__Account__dlm` via FK `ACCOUNT_ID`; DC PK collapses to single-column `profileDate__c` with `ssot__AccountId__c` as a KQ qualifier (single-column-PK rule from Plan 4).

## Plan
- Plan 7, instantiated from `../docs/superpowers/plans/2026-05-28-cumulus-plan-N-dataset-template.md` (v1.5)
- Per-plan file: `../docs/superpowers/plans/2026-05-28-cumulus-plan-7-worldcheck-aml.md`
- Rowspec: `../docs/superpowers/plans/attachments/cumulus-plan-7-worldcheck-aml-rowspec.md`
- Depends on: [Snowflake_Cumulus_Common](../Snowflake_Cumulus_Common) (Plan 0)

## Snowflake objects
- Table: `FINS.PUBLIC.WORLD_CHECK_AML`
- Stored procedure: `FINS.PUBLIC.SP_GENERATE_WORLD_CHECK_AML()`
- Task: `FINS.PUBLIC.TASK_DAILY_WORLD_CHECK_AML` (DAILY, `0 6 * * * UTC`, warehouse `MAIN_WH_XS`, wrapper `SP_RETRY_WRAPPER` retries=2)
- Egress: DC "Snowflake (Federate / Zero Copy)" connector → DLO `CumulusWorldCheckAml__dll` → DMO `CumulusWorldCheckAml__dlm`

## Audience
**All-accounts** — every distinct anchor in `V_ACCOUNT_ANCHORS` is screened daily, regardless of CLIENT_CATEGORY. AML has no opt-out cohort (legal posture):

```sql
SELECT DISTINCT * FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS
```

Live cardinality (probed 2026-05-28): **36,813 distinct accounts** (37,445 raw rows with 1.7% MASTER_ACCOUNTS duplicates collapsed by `DISTINCT`). Each anchor emits exactly one screening row per day → **~36,813 rows/day**.

**Storage** — re-runs MERGE-replace in place (composite PK `(ACCOUNT_ID, PROFILE_DATE)`, but PROFILE_DATE is bucketed to today's date, so re-runs same day overwrite the existing row). No daily history retention — live storage stays at ~36,813 rows.

## Tests
```bash
cd Snowflake_WorldCheck_AML
pip install -e ".[dev]"
pip install -e ../Snowflake_Cumulus_Common
pytest tests/ -v
```

## Deploy
```bash
snow sql -f schemas/world_check_aml.sql
snow sql -f procedures/sp_create_procedure.sql
snow sql -f tasks/task_daily_world_check_aml.sql
```

DC ingest is configured via the existing federation connector (see Plan 7 Task 7 + the recipe at `../Snowflake_Claritas_Demographics/docs/dc-setup-recipe.md`).
