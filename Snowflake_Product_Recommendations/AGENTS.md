# AGENTS.md — Snowflake_Product_Recommendations

Generator for the Cumulus product-recommendation model **inputs** and **training sets** (personal and business). One Snowpark Python SP, `SP_GENERATE_PRODUCT_RECOMMENDATION_INPUTS(MODE)`, is assembled from `procedures/prodrec/*.py` by `scripts/deploy_sp.py`. The input tables federate into Data Cloud (`jdo-gj9q5q`) and feed the `cdpMlPrediction` actions that the `DC_Multiclass_Prediction_LWC` reference flows call. See [README.md](README.md) for objects, counts and commands.

## Boundaries
- Owns:
  - `BUSINESS_PRODUCT_RECOMMENDATION_SUBSET`, `PERSONAL_PRODUCT_RECOMMENDATION_SUBSET`, `BUSINESS_PRODUCT_RECOMMENDATION_SET`, `PERSONAL_PRODUCT_RECOMMENDATION_TRAINING_SET` (all in `DATA_JEDAIS.FINS__PUBLIC`);
  - the SP and `TASK_MONTHLY_PRODUCT_RECOMMENDATION_INPUTS`;
  - `migrations/`.
- Does NOT own:
  - `V_ACCOUNT_ANCHORS`, `seed_for` or `assert_coverage` (all from `Snowflake_Cumulus_Common`; the helpers are inlined at build time);
  - the Cumulus feed tables it reads;
  - the DC streams, DMOs or models;
  - the flows, which live in `../DC_Multiclass_Prediction_LWC/force-app/main/default/flows/`.

## Layout
```
procedures/prodrec/
  vocab.py     ← column orders (must match DESCRIBE TABLE) + categorical vocabularies/weights
  common.py    ← shared numeric/RNG helpers
  business.py  ← business_profile / business_input_row
  personal.py  ← personal_profile / personal_input_row
  labels.py    ← rule-scored RECOMMENDED_PRODUCT labels (+ NOISE)
  training.py  ← stratified training sampler + mix_problems gate
  sp_main.py   ← feature SQL, audience CTEs, main(session, mode), all-tables replace, input asserts
procedures/sp_create_procedure.sql  ← GENERATED, committed, test-pinned
scripts/deploy_sp.py | scripts/calibrate.py
migrations/00N_*.sql  ← additive ALTER TABLEs, applied live in order
tasks/task_monthly_product_recommendation_inputs.sql
output/calibration.md  ← aggregate-only calibration record
```

## Conventions
- **Column order is the contract.** `*_SUBSET_COLUMNS` / `*_TRAINING_COLUMNS` in `vocab.py` mirror the live tables; `tests/test_vocab.py` pins them. Append new columns at the end under a comment naming the migration.
- **Adding a model input:**
  1. Write `migrations/00N_*.sql` (ACCOUNTADMIN, `ADD COLUMN` only, types match the training table).
  2. Add the column to `vocab.py` and the row factory.
  3. Run `pytest`.
  4. Run `deploy_sp.py` and then `INPUTS`.
  5. Check there are 0 NULLs.
  6. Add the DMO field (`PATCH /ssot/data-model-objects/{name}`, lowercase `name`, auto `__c`), then map it.
  7. Wire `param_<field>__c` in the flow.
- **Determinism:** seeds come from `seed_for(account_id, salt, month_start)`. Feed windows end at the first day of the run month, so re-runs in the same month are reproducible.
- **Atomic replace:** every table a mode writes is staged, then swapped in one transaction. A failure in any gate (row-factory errors, `mix_problems`, `assert_inputs`) aborts before DML.
- **Tuning** lives in named constants (`NOISE`, label weights, volatility cut-offs, distribution weights). Record every change in `output/calibration.md` (old → new, why).

## Tests
- `pytest`: 112 tests over vocab, profiles, labels, training, SP SQL text and the `deploy_sp` build. `test_deploy_sp.py` fails if `sp_create_procedure.sql` is stale. Regenerate with `deploy_sp.py --no-deploy` (or a real deploy, which also regenerates).
- Live check after `INPUTS`: row counts equal the audience (5,725 / 25,424), with 0 NULLs in every column the model needs. Then run each flow once (`POST /services/data/v67.0/actions/custom/flow/<Flow>`): the class probabilities sum to ~1.0 and `prediction` equals the top class.

## Gotchas
- **`cdpMlPrediction` actions require every input.** A retrained model that adds a feature breaks the flow until the column exists end to end. Get the list from `GET /services/data/v67.0/actions/custom/cdpMlPrediction/<action>` (inputs are `param_<field>__c`).
- **Some subset columns are unused by the current models**: business `MONTHLY_AVG_DEPOSITS`; personal `DEBT_TO_INCOME_RATIO`, `HOME_OWNERSHIP`, `MONTHLY_DEPOSIT_AMOUNT`. Keep them; they are part of the original 13-column contract.
- **`snow sql` connection flags**: put `-c SFDC_DC_TECH_ARCH --role ACCOUNTADMIN` after the `sql` subcommand. The `FINS__PUBLIC` objects belong to ACCOUNTADMIN.
- **No `$$` and no bare `&` in module source.** `build_sql()` rejects both: `$$` would end the procedure literal, and `snow sql -f` treats `&{…}` as a template. Write "and".
- **Top-level name collisions** across concatenated modules are rejected by `check_name_collisions`. SP-local names use the `_sp_` prefix.
- **Snowpark binds `None` as `'None'`.** The log insert passes `''` and wraps it in `NULLIF`.
- **`output/calibration_pool.json` holds real account ids.** It is gitignored; never commit it, and keep `calibration.md` aggregate-only.
- **The task file recreates the task SUSPENDED.** Resume it after re-running the file (`ALTER TASK … RESUME`).
- zsh doesn't word-split unquoted `$VAR`. Write `snow`/`sf` commands inline instead of building them in shell variables.
