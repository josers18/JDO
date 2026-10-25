# AGENTS.md — ML_Attrition_Training

Training-set generators for the two Data Cloud Model Builder models behind the Account-page prediction cards, plus the flows that call those models. Each generator bootstraps its features from the live **scoring** rows (the Snowflake input tables built by [`Snowflake_Attrition_CSAT_Inputs`](../Snowflake_Attrition_CSAT_Inputs/README.md)), adds jitter, draws a learnable label, and replaces a Heroku Postgres table that a TOTAL_REPLACE Data Cloud stream ingests.

## Boundaries
- Owns:
  - the rows of Heroku `"Fins"."Retail_Attrition_Training_Data"` and `"Fins".csat_prediction_training`;
  - `flows/DC_MLAttrition.flow-meta.xml` and `flows/DC_MLCSAT.flow-meta.xml`.
- Does NOT own:
  - the scoring tables (`ATTRITION_INPUTS`, `CSAT_ATTRITION_INPUTS`), which are owned by `Snowflake_Attrition_CSAT_Inputs`;
  - the DC streams, the models or their activation (Model Builder, done by hand);
  - the Heroku connection (`Marketing_Engagement/db.py connect()`).

## Layout
```
generate_training_data.py       ← attrition: 10,000 rows, Bernoulli churn from a logistic risk score
generate_csat_training_data.py  ← CSAT: 5,000 rows, noisy linear CSAT_Score (20-100)
flows/DC_MLAttrition.flow-meta.xml  ← calls Predicted_Churned_c_Latest
flows/DC_MLCSAT.flow-meta.xml       ← calls Predicted_CSAT_Score_Latest
```

| Generator | Scoring export | Heroku table | DC stream | Model |
|---|---|---|---|---|
| `generate_training_data.py` | `ATTRITION_INPUTS` | `"Fins"."Retail_Attrition_Training_Data"` | `ML_Attrition_Training_Data` | Predicted Churned_c Latest |
| `generate_csat_training_data.py` | `CSAT_ATTRITION_INPUTS` | `"Fins".csat_prediction_training` | `CSAT_Prediction_Training` (`1dsam000000IMzlAAG`) | Predicted CSAT_Score Latest |

## Commands
```bash
# 1. export the scoring rows
snow sql -c SFDC_DC_TECH_ARCH_jwt --format csv \
  -q "SELECT * FROM DATA_JEDAIS.FINS__PUBLIC.CSAT_ATTRITION_INPUTS" > csat_score.csv
# 2. dry run: prints the profile, per-driver label averages and a holdout metric
python3 generate_csat_training_data.py csat_score.csv
# 3. write (backs the table up first, then replaces its rows in one transaction)
python3 generate_csat_training_data.py csat_score.csv --write
# 4. refresh the stream (TOTAL_REPLACE accepts the REST trigger)
sf api request rest "/services/data/v62.0/ssot/data-streams/1dsam000000IMzlAAG/actions/run" \
  --method POST --body @empty.json -o jdo-gj9q5q        # empty.json contains {}
```
The attrition generator works the same way: export `ATTRITION_INPUTS` and run `generate_training_data.py`. After the stream reports `SUCCESS`, retrain and activate the model in Model Builder.

## Conventions
- **Training must look like scoring.** Category spellings, ranges and feature means must match the scoring table, so a model never extrapolates. Compare the dry run's `train avg` and `live avg` columns before writing.
- **Labels must be learnable but noisy.** Holdout AUC about 0.8 for attrition and R² about 0.74 for CSAT. A metric near 1.0 means the label is too deterministic; near 0.5 (AUC) or 0 (R²) means it ignores the features.
- Tuning (coefficients, `NOISE_SD`, `TARGET_*`, `SEED`) lives in module constants. Explain any change in the docstring.
- Always run the dry run and review it before `--write`, because writing replaces shared data.

## Gotchas
- **One backup per day.** `--write` runs `CREATE TABLE IF NOT EXISTS <table>_bak_<YYYYMMDD>`, so a second write on the same day keeps the first backup and doesn't back up the set it replaces.
- **Customer_ID / UniqueID are keys, not features.** The stream needs a primary key; the model must not train on it.
- **DLO columns carry `__c`** (`CSAT_Score__c`, `Segment__c`) when you query `CSAT_Prediction_Training__dll`; the Heroku columns don't.
- **A stream run sits `PENDING` for roughly 5–10 minutes** before `SUCCESS`; `lastRefreshDate` only moves at the end.
- **Holdout metrics are a local proxy** (scikit-learn gradient boosting, 70/30 split), not Model Builder's metrics.
- **Flows aren't in a DX project here.** To deploy one, copy it into a throwaway DX project under `force-app/main/default/flows/`, then deploy that project to `jdo-gj9q5q`.

## Related docs
- [`../Snowflake_Attrition_CSAT_Inputs/README.md`](../Snowflake_Attrition_CSAT_Inputs/README.md): the scoring tables.
- [`../React-Headless/docs/SNOWFLAKE_DATA_FIXES.md`](../React-Headless/docs/SNOWFLAKE_DATA_FIXES.md) §2: training vs input vs output tables.
- [`../DC_Prediction_Model_LWC/AGENTS.md`](../DC_Prediction_Model_LWC/AGENTS.md): the card that runs these flows.
