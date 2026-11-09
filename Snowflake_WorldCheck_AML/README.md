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
- Table: `DATA_JEDAIS.FINS__PUBLIC.WORLD_CHECK_AML`
- Stored procedure: `DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_WORLD_CHECK_AML(RUN_DATE DATE DEFAULT NULL)` (NULL = today UTC; pass a date to backfill that screening day, e.g. `CALL SP_GENERATE_WORLD_CHECK_AML('2026-11-01'::DATE)`; the task still calls it with no argument)
- Task: `DATA_JEDAIS.FINS__PUBLIC.TASK_DAILY_WORLD_CHECK_AML` (DAILY, `0 6 * * * UTC`, warehouse `MAIN_WH_XS`, wrapper `SP_RETRY_WRAPPER` retries=2)
- Egress: DC "Snowflake (Federate / Zero Copy)" connector → DLO `CumulusWorldCheckAml__dll` → DMO `CumulusWorldCheckAml__dlm`

## Audience
**All-accounts** — every distinct anchor in `V_ACCOUNT_ANCHORS` is screened daily, regardless of CLIENT_CATEGORY. AML has no opt-out cohort (legal posture):

```sql
SELECT DISTINCT * FROM DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS
```

Live cardinality (probed 2026-05-28): **36,813 distinct accounts** (37,445 raw rows with 1.7% MASTER_ACCOUNTS duplicates collapsed by `DISTINCT`). Each anchor emits exactly one screening row per day → **~36,813 rows/day**.

**Storage** — re-runs MERGE-replace in place (composite PK `(ACCOUNT_ID, PROFILE_DATE)`, but PROFILE_DATE is bucketed to today's date, so re-runs same day overwrite the existing row). No daily history retention — live storage stays at ~36,813 rows.

## Realism model (2026-11-09)
- **Weighted jurisdictions** — a 30-code pool drawn with `rng.choices` (month-stable seed): Low ~90% (US 80%), Medium ~8%, High ~1.8%, Prohibited ~0.2% (IR, KP, CU, SY). Synthetic tiers, loosely modelled on FATF/OFAC lists. Prohibited rolls up to Severe, so Severe is now a fraction of a percent instead of ~15%.
- **`CHANGE_SINCE_LAST_RUN`** — `New` (no row for the account on the most recent earlier `PROFILE_DATE`; all rows when no earlier date exists), else `Changed` / `Unchanged`. Rating values Severe/High/Medium/Low and `Changed` are unchanged for downstream consumers.
- **Backfill** — `RUN_DATE` regenerates one day; if the day already has rows only those accounts are regenerated.

## Tests
```bash
cd Snowflake_WorldCheck_AML
pip install -e ".[dev]"
pip install -e ../Snowflake_Cumulus_Common
pytest tests/ -v
```

## Deploy
First deploy of the `RUN_DATE` signature: drop the old zero-arg procedure so `()` is not ambiguous.
```bash
snow sql -c SFDC_DC_TECH_ARCH_jwt --role ACCOUNTADMIN -q "DROP PROCEDURE IF EXISTS DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_WORLD_CHECK_AML()"
snow sql -c SFDC_DC_TECH_ARCH_jwt --role ACCOUNTADMIN -f schemas/world_check_aml.sql
python3 scripts/deploy_sp.py   # regenerate procedures/sp_create_procedure.sql and create the SP as ACCOUNTADMIN
snow sql -c SFDC_DC_TECH_ARCH_jwt --role ACCOUNTADMIN -f tasks/task_daily_world_check_aml.sql
```

Deploy as ACCOUNTADMIN: the live SP, table and task are owned by ACCOUNTADMIN, and SYSADMIN lacks CREATE TABLE on `DATA_JEDAIS.FINS__PUBLIC`. `scripts/deploy_sp.py` passes `--role ACCOUNTADMIN` by default (`--role` overrides it).

DC ingest is configured via the existing federation connector (see Plan 7 Task 7 + the recipe at `../Snowflake_Claritas_Demographics/docs/dc-setup-recipe.md`).
