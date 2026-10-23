# Product Recommendations — Cumulus Synthetic Model Inputs and Training Sets

Generates the **input** and **training** tables for the two Data Cloud product-recommendation models (personal and business) that power the [Multiclass Prediction](../DC_Multiclass_Prediction_LWC/README.md) cards on the Account page. One Snowpark Python stored procedure builds a profile for every real Cumulus account from the anchor view and the Cumulus feeds, then writes:

- **Inputs** (monthly): one row per account, with the features the deployed models score on.
- **Training** (manual): a labelled, stratified sample that retrains the models.

Spec: [`../docs/superpowers/specs/2026-10-23-product-recommendation-generator-design.md`](../docs/superpowers/specs/2026-10-23-product-recommendation-generator-design.md) · Plan: [`../docs/superpowers/plans/2026-10-23-product-recommendation-generator.md`](../docs/superpowers/plans/2026-10-23-product-recommendation-generator.md) · Depends on: [Snowflake_Cumulus_Common](../Snowflake_Cumulus_Common).

## Snowflake objects

| Object | Role | Rows (2026-10-23) |
|---|---|---|
| `DATA_JEDAIS.FINS__PUBLIC.BUSINESS_PRODUCT_RECOMMENDATION_SUBSET` | Business model inputs (27 columns) | 5,725 |
| `DATA_JEDAIS.FINS__PUBLIC.PERSONAL_PRODUCT_RECOMMENDATION_SUBSET` | Personal model inputs (31 columns) | 25,424 |
| `DATA_JEDAIS.FINS__PUBLIC.BUSINESS_PRODUCT_RECOMMENDATION_SET` | Business training set (32 columns, labelled) | 3,500 |
| `DATA_JEDAIS.FINS__PUBLIC.PERSONAL_PRODUCT_RECOMMENDATION_TRAINING_SET` | Personal training set (34 columns, labelled) | 7,500 |
| `SP_GENERATE_PRODUCT_RECOMMENDATION_INPUTS(MODE)` | `INPUTS` (default), `TRAINING`, or `ALL` | — |
| `TASK_MONTHLY_PRODUCT_RECOMMENDATION_INPUTS` | `INPUTS` via `SP_RETRY_WRAPPER` (retries 2), `0 4 2 * * America/New_York`, `MAIN_WH_XS`. **Resumed 2026-10-23**; first scheduled run 2026-11-02 04:00 ET | — |

Each run replaces its tables atomically and logs to `TASK_EXECUTION_LOG` as `TASK_MONTHLY_PRODUCT_RECOMMENDATION_INPUTS[<MODE>]`. Training is never scheduled.

## Audience

- **Business:** `V_ACCOUNT_ANCHORS` where `ACCOUNT_TYPE_FLAG = 'BUSINESS'`, not `Household`, `ACCOUNT_ID LIKE '001am%'` → 5,725 accounts.
- **Personal:** `ACCOUNT_TYPE_FLAG = 'PERSON'` → 25,424 accounts.

Both sides take one row per `ACCOUNT_ID`, and no account appears in both.

## Data Cloud

The input tables federate zero-copy into Data Cloud as `BUSINESS_PRODUCT_RECOMMENDATION_INPU__dlm` and `PERSONAL_PRODUCT_RECOMMENDATION_INPU__dlm` (`jdo-gj9q5q`). Every column is mapped. The flows `DC_Multiclass_Business` and `DC_MLProdPersonal` read one row by `accountid__c` and pass it to the retrained models:

| Model action | Inputs | Classes |
|---|---|---|
| `Predicted_RECOMMENDED_PRODUCT_Business_CM_12l_32qa0be0859` | 25 (all subset columns except `ACCOUNTID`, `MONTHLY_AVG_DEPOSITS`) | 12 |
| `Predicted_RECOMMENDED_PRODUCT_Personal_CM_12l_32q497b2bbf` | 27 (all subset columns except `ACCOUNTID`, `DEBT_TO_INCOME_RATIO`, `HOME_OWNERSHIP`, `MONTHLY_DEPOSIT_AMOUNT`) | 11 |

Flow details: [DC_Multiclass_Prediction_LWC/docs/FLOW_GUIDE.md](../DC_Multiclass_Prediction_LWC/docs/FLOW_GUIDE.md#reference-flows-product-recommendation).

## Schema changes (`migrations/`)

The original subset tables had 13 columns each. The retrained models added inputs, so the following columns were added (additive only, applied live 2026-10-23):

| Migration | Table | Columns |
|---|---|---|
| `001_business_subset_add_top_contributors.sql` | business | +11 top contributors |
| `002_personal_subset_add_top_contributors.sql` | personal | +12 top contributors |
| `003_personal_subset_add_model_required_inputs.sql` | personal | +6 other required inputs |
| `004_business_subset_add_model_required_inputs.sql` | business | +3 other required inputs |

Order for a new column:

1. Run the migration as ACCOUNTADMIN.
2. Add the column to `procedures/prodrec/vocab.py` and to the row factory.
3. Redeploy the SP and run `INPUTS`.
4. Add the DMO field and its mapping.
5. Wire the field into the flow action.

## Tests

```bash
cd Snowflake_Product_Recommendations
python -m venv .venv && .venv/bin/pip install -e ".[dev]" -e ../Snowflake_Cumulus_Common
.venv/bin/pytest            # 112 tests
```

`tests/test_deploy_sp.py` checks that the committed `procedures/sp_create_procedure.sql` matches `build_sql()`. Regenerate it with `.venv/bin/python scripts/deploy_sp.py --no-deploy` after any module change.

## Deploy and run

```bash
.venv/bin/python scripts/deploy_sp.py --connection SFDC_DC_TECH_ARCH --role ACCOUNTADMIN   # regenerate + CREATE OR REPLACE
snow sql -c SFDC_DC_TECH_ARCH --role ACCOUNTADMIN -q \
  "CALL DATA_JEDAIS.FINS__PUBLIC.SP_RETRY_WRAPPER('DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_PRODUCT_RECOMMENDATION_INPUTS(''INPUTS'')', 2)"
```

`tasks/task_monthly_product_recommendation_inputs.sql` recreates the task suspended. Run `ALTER TASK … RESUME` after re-running it.

Calibration (label weights, noise, distribution gates against the live population): [`output/calibration.md`](output/calibration.md). Reproduce with `.venv/bin/python scripts/calibrate.py` (`--refresh` re-pulls; the pool cache `output/calibration_pool.json` is gitignored and must never be committed).
