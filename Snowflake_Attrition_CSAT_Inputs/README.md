# Attrition, CSAT and Enrollments — Cumulus Synthetic Model Inputs

Generates the **input** tables for two Data Cloud prediction models (attrition and CSAT) plus the downstream `ENROLLMENTS` profile table. One Snowpark Python stored procedure builds a single shared profile for every real Cumulus account from the anchor view and the Cumulus feeds, then writes all three tables so they agree about the same account.

Spec: [`../docs/superpowers/specs/2026-10-23-attrition-csat-inputs-generator-design.md`](../docs/superpowers/specs/2026-10-23-attrition-csat-inputs-generator-design.md) · Plan: [`../docs/superpowers/plans/2026-10-23-attrition-csat-inputs-generator.md`](../docs/superpowers/plans/2026-10-23-attrition-csat-inputs-generator.md) · Depends on: [Snowflake_Cumulus_Common](../Snowflake_Cumulus_Common) · Sibling: [Snowflake_Product_Recommendations](../Snowflake_Product_Recommendations).

## Snowflake objects

| Object | Role | Rows (2026-10-23) |
|---|---|---|
| `DATA_JEDAIS.FINS__PUBLIC.ATTRITION_INPUTS` | Attrition model inputs (16 columns, key `UNIQUEID`) | 36,239 |
| `DATA_JEDAIS.FINS__PUBLIC.CSAT_ATTRITION_INPUTS` | CSAT model inputs (14 columns, key `ACCOUNTID`) | 36,239 |
| `DATA_JEDAIS.FINS__PUBLIC.ENROLLMENTS` | Digital/KYC enrollment profile (12 columns, key `ACCOUNTID`) | 36,239 |
| `SP_GENERATE_ATTRITION_CSAT_INPUTS(MODE)` | `INPUTS` (the only mode, default) | — |
| `TASK_MONTHLY_ATTRITION_CSAT_INPUTS` | `INPUTS` via `SP_RETRY_WRAPPER` (retries 2), `0 5 2 * * America/New_York`, `MAIN_WH_XS`. **Resumed 2026-10-23**; first scheduled run 2026-11-02 05:00 ET | — |

Each run replaces all three tables atomically and logs to `TASK_EXECUTION_LOG` as `TASK_MONTHLY_ATTRITION_CSAT_INPUTS[INPUTS]`.

## Audience

Every `V_ACCOUNT_ANCHORS` row with `ACCOUNT_ID LIKE '001am%'`, one row per `ACCOUNT_ID`: 36,239 accounts. Kind comes from `CLIENT_CATEGORY` (spaces stripped, so live `Wealth Management` → `WealthManagement`; the CSAT `SEGMENT` column keeps the space, to match the CSAT training label), falling back to `ACCOUNT_TYPE_FLAG`: 25,516 PERSON (incl. 92 Gold/Silver/Bronze/Platinum persons with no birthdate), 5,633 BUSINESS, 5,090 HOUSEHOLD.

**Ruling R1:** households are included. The spec's "excluding households" conflicts with its "about 36.2k, matching CSAT_NPS_DATA"; excluding them gives 31,149. Households have no financial accounts, so they use the feed-less fallbacks.

## Data Cloud

The tables federate zero-copy into Data Cloud:

| Snowflake table | DC stream | DMO | Key |
|---|---|---|---|
| `ATTRITION_INPUTS` | `BT_Attrition_Inputs` | `Attrition_Inputs_Snowflake__dlm` | `uniqueid__c` |
| `CSAT_ATTRITION_INPUTS` | `BT_CSAT_Attrition_Inputs` | `CSAT_Prediction_Input__dlm` | `accountid__c` |
| `ENROLLMENTS` | `BT_Enrollments` | `Enrollments__dlm` | `accountid__c` |

`ATTRITION_INPUTS` and `CSAT_ATTRITION_INPUTS` are model inputs only. `ENROLLMENTS` is downstream profile data that other cockpits read, so its flags must stay consistent and sticky.

## Tests

```bash
cd Snowflake_Attrition_CSAT_Inputs
python -m venv .venv && .venv/bin/pip install -e ".[dev]" -e ../Snowflake_Cumulus_Common
.venv/bin/pytest            # 117 tests
```

`tests/test_deploy_sp.py` checks that the committed `procedures/sp_create_procedure.sql` matches `build_sql()`. Regenerate it with `.venv/bin/python scripts/deploy_sp.py --no-deploy` after any module change.

## Deploy and run

```bash
.venv/bin/python scripts/deploy_sp.py --connection SFDC_DC_TECH_ARCH_jwt --role ACCOUNTADMIN   # regenerate + CREATE OR REPLACE
snow sql -c SFDC_DC_TECH_ARCH_jwt --role ACCOUNTADMIN -q \
  "CALL DATA_JEDAIS.FINS__PUBLIC.SP_RETRY_WRAPPER('DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_ATTRITION_CSAT_INPUTS(''INPUTS'')', 2)"
snow sql -c SFDC_DC_TECH_ARCH_jwt --role ACCOUNTADMIN -f tasks/task_monthly_attrition_csat_inputs.sql
```

The task file recreates the task suspended. Run `ALTER TASK DATA_JEDAIS.FINS__PUBLIC.TASK_MONTHLY_ATTRITION_CSAT_INPUTS RESUME;` after verifying the first live run.

Derivation rules, constants and live results: [`output/calibration.md`](output/calibration.md).
