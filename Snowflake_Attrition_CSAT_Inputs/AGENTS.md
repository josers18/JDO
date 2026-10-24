# AGENTS.md — Snowflake_Attrition_CSAT_Inputs

Generator for the Cumulus attrition and CSAT model **inputs** and the `ENROLLMENTS` profile table. One Snowpark Python SP, `SP_GENERATE_ATTRITION_CSAT_INPUTS(MODE)` (mode `INPUTS` only), is assembled from `procedures/attrcsat/*.py` by `scripts/deploy_sp.py`. See [README.md](README.md) for objects, counts and commands.

## Boundaries
- Owns:
  - `ATTRITION_INPUTS`, `CSAT_ATTRITION_INPUTS`, `ENROLLMENTS` (all in `DATA_JEDAIS.FINS__PUBLIC`);
  - the SP and `TASK_MONTHLY_ATTRITION_CSAT_INPUTS`.
- Does NOT own:
  - `V_ACCOUNT_ANCHORS`, `seed_for` or `assert_coverage` (from `Snowflake_Cumulus_Common`; the helpers are inlined at build time);
  - the Cumulus feed tables it reads (`CSAT_NPS_DATA`, `FINANCIAL_TRANSACTION_ACCOUNTS`, `ACCOUNT_DAILY_BALANCE`, `FINANCIAL_TRANSACTIONS`, `GONG_CALL_SENTIMENT`, `WORLD_CHECK_AML`);
  - the DC streams, DMOs or models.

## Layout
```
procedures/attrcsat/
  common.py       ← stable_rng / month_rng (month_rng currently unused), clamp, as_float, as_date
  vocab.py        ← column orders (must match DESCRIBE TABLE), vocabularies, RANGES
  profile.py      ← feature row -> shared account profile (with feed-less fallbacks)
  checks.py       ← row_problems (columns, NULLs, vocab, ranges, 001am keys) and cross_table_problems
  enrollments.py  ← sticky flags with one-time persistent drift + enrollment_problems
  attrition.py    ← ATTRITION_INPUTS row factory
  csat.py         ← CSAT_ATTRITION_INPUTS row factory
  sp_main.py      ← audience + feature SQL, main(session, mode), all-tables replace, assert_inputs
procedures/sp_create_procedure.sql  ← GENERATED, committed, test-pinned
scripts/deploy_sp.py
tasks/task_monthly_attrition_csat_inputs.sql
output/calibration.md  ← aggregate-only record
```
Module concatenation order is `common, vocab, profile, checks, enrollments, attrition, csat, sp_main` (`enrollments` imports `checks`; `checks` builds `_CK_TABLES` from `vocab` at import time).

## Conventions
- **Column order and names are the contract.** `*_COLUMNS` in `vocab.py` mirror the live `DESCRIBE TABLE`. Never rename or retype.
- **Determinism:** sticky values use `stable_rng(account_id, salt)` (no month); enrollment drift is a one-time change month per (account, flag), also drawn from `stable_rng`, so a flag changes at most once and never reverts. Feed windows end at `DATE_TRUNC('month', CURRENT_DATE())` (exclusive), so re-runs inside a month are reproducible.
- **One profile, three tables.** Every row factory derives from the same `build_profile` result, and `cross_table_problems` fails the run if the tables disagree (online/mobile flags, cross-sell score).
- **Atomic replace:** all three tables are staged, then swapped in one transaction. Any gate failure (row-factory errors, `gate_problems`, `assert_inputs`) aborts before DML.
- **Zero NULLs** in any column of any table; keys only `001am%`, no duplicates.
- Tuning lives in named constants. Record every change in `output/calibration.md` (old -> new, why).

## Tests
- `pytest`: 116 tests over vocab, profile, enrollments, rows, SP SQL text and the `deploy_sp` build. `test_deploy_sp.py` fails if `sp_create_procedure.sql` is stale. Regenerate with `deploy_sp.py --no-deploy`.
- Live check after `INPUTS`: row counts equal the audience (TBD-live), 0 NULLs in every column, no duplicate keys.

## Gotchas
- **No `$$` and no bare `&` in module source.** `build_sql()` rejects both: `$$` would end the procedure literal, and `snow sql -f` treats `&{...}` as a template. Write "and".
- **SP-local top-level names use the `_sp_` prefix.** `check_name_collisions` rejects duplicates across the concatenated modules.
- **Snowpark binds `None` as `'None'`.** The log insert passes `''` and wraps it in `NULLIF`.
- **`snow` connection flags go after `sql`:** `snow sql -c SFDC_DC_TECH_ARCH --role ACCOUNTADMIN ...`. The `FINS__PUBLIC` objects belong to ACCOUNTADMIN.
- **The task file recreates the task SUSPENDED.** Run `ALTER TASK ... RESUME` after re-running it.
- **`ENROLLMENTS` is downstream profile data**: flags must stay consistent (MFA implies digital; KYC/AML follow the risk profile) and sticky month to month. The other two tables are D360 model inputs only.
- **`output/*pool*.json` is gitignored** and may hold real account ids. Keep `calibration.md` aggregate-only.
- zsh doesn't word-split unquoted `$VAR`. Write `snow`/`sf` commands inline.
- **Feeds carry `ORG_ID`; the feature CTEs don't filter on it.** Fine while JDO is the only org. Add `ORG_ID = 'JDO'` (or the run's org) to every feed CTE in Phase B.
- **Staging table names are fixed** (`<table>_STAGING`, overwritten by `write_pandas`). Never run two `INPUTS` calls concurrently.
- **Kind comes from `CLIENT_CATEGORY` first.** `ACCOUNT_TYPE_FLAG` is just `BIRTHDATE IS NOT NULL`; it is only the fallback for unknown categories.
- **`ACCOUNT_DAILY_BALANCE` rows exist only on transacting days.** Balances are averaged per financial account before summing; the transaction rate divides by the window length in days.
