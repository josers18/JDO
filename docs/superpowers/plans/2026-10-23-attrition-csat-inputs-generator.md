# Attrition, CSAT and Enrollments Inputs Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A monthly Snowpark SP that rewrites `ATTRITION_INPUTS`, `CSAT_ATTRITION_INPUTS` and `ENROLLMENTS` with one feed-grounded, mutually consistent row per real Cumulus account.

**Architecture:** New project `Snowflake_Attrition_CSAT_Inputs/`, a structural copy of `Snowflake_Product_Recommendations` (reference checkout: `/Users/jsifontes/Documents/Git/JDO-prodrec/Snowflake_Product_Recommendations/` — read it, it is not on `main`). One feature SQL returns one row per account; `build_profile` turns it into a shared profile dict; three row factories derive each table's row from that one profile (so the tables agree by construction); Python gates run before any DML; `replace_tables` swaps all three tables in one transaction.

**Tech Stack:** Python 3.11, Snowpark (`snowflake-snowpark-python`), pandas, pytest; `snow` CLI; Snowflake `DATA_JEDAIS.FINS__PUBLIC`.

**Spec:** `docs/superpowers/specs/2026-10-23-attrition-csat-inputs-generator-design.md`

## Global Constraints

- Project dir `Snowflake_Attrition_CSAT_Inputs/`; package `procedures/attrcsat/`; SP `DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_ATTRITION_CSAT_INPUTS(MODE STRING DEFAULT 'INPUTS')`; only mode `INPUTS`.
- Task `DATA_JEDAIS.FINS__PUBLIC.TASK_MONTHLY_ATTRITION_CSAT_INPUTS`, `USING CRON 0 5 2 * * America/New_York`, `MAIN_WH_XS`, `SP_RETRY_WRAPPER(..., 2)`, created SUSPENDED.
- Column order and names are the contract — exactly the live `DESCRIBE TABLE` order in `vocab.py` (Task 1). Never rename or retype columns.
- Audience = every `V_ACCOUNT_ANCHORS` row with `ACCOUNT_ID LIKE '001am%'`, one row per `ACCOUNT_ID`: 36,239 live (25,424 PERSON, 5,725 BUSINESS, 5,090 Household). See Ruling R1.
- Feed windows end at `DATE_TRUNC('month', CURRENT_DATE())` (exclusive). Sticky flags use `stable_rng(account_id, salt)` (no month); drift uses `month_rng(account_id, salt, run_ts)`.
- 0 NULLs in any column of any table; keys only `001am%`, no duplicates; categoricals in vocabulary; numerics within `RANGES` (Task 1).
- No `$$`, no bare `&` in module source; SP-local top-level names use the `_sp_` prefix; Snowpark binds `None` as `'None'` → pass `''` + `NULLIF`.
- `snow sql -c SFDC_DC_TECH_ARCH --role ACCOUNTADMIN ...` (flags after `sql`).
- `output/calibration.md` is aggregate-only; anything holding account ids is gitignored. Never print SF access tokens or frontdoor URLs. No push or merge.

**Rulings made while planning** (spec silences/conflicts, recorded so executors don't re-decide):
- **R1 Audience includes households.** The spec says "excluding households" *and* "about 36.2k, matching CSAT_NPS_DATA"; excluding households gives 31,149. The user's own answer was "All ~36k accounts", and households appear in `CSAT_NPS_DATA`, Gong and World-Check. So: all 36,239 `001am` anchors. Households have no financial accounts → feed-less fallbacks.
- **R2 CSAT `SEGMENT` uses the live spelling `WealthManagement`** (no space), which is what the table and model hold today; vocabulary is `Corporate, WealthManagement, Commercial, Banking`.
- **R3 `CSAT_NPS_DATA` uses `Passives`;** map to the attrition vocabulary value `Passive`.

## Review Focus

1. **Accounts with no financial accounts** (≈9.5k persons, ≈3.8k businesses, all 5,090 households): every feature NULL from FTA/ADB must still yield a complete, in-range, non-NULL row via seeded fallbacks. Test: `test_profile_feedless_account_is_complete` (Task 2) and `test_rows_feedless_complete` (Task 4).
2. **A sanctions / PEP / adverse-media hit on a Low-rated profile:** any hit forces review status regardless of rating. Test: `test_kyc_hit_overrides_low_rating` (Task 3).
3. **Re-running in the same month** must produce byte-identical rows; **the next month** must change ≤5% of rows per enrolment flag. Test: `test_enrollment_same_month_identical` and `test_enrollment_month_drift_small` (Task 3).
4. **Feed values outside training ranges** (huge business revenue, credit scores < 621.78, tenure > 74 months, ages < 18): clamped, never gate-failed. Test: `test_rows_extreme_inputs_clamped` (Task 4).
5. **A gate failure on the second table after the first is staged** must leave all three live tables untouched. Test: `test_main_gate_failure_no_dml` (Task 5).

---

### Task 1: Scaffold, shared helpers, vocabulary

**Files:**
- Create: `Snowflake_Attrition_CSAT_Inputs/pyproject.toml`, `.gitignore`, `procedures/attrcsat/__init__.py`, `procedures/attrcsat/common.py`, `procedures/attrcsat/vocab.py`, `tests/__init__.py`, `tests/conftest.py`, `tests/test_common.py`, `tests/test_vocab.py`

**Interfaces:**
- Produces: `common.stable_rng(key, salt) -> random.Random`, `month_rng(key, salt, run_ts) -> random.Random`, `jitter`, `clamp(v, lo, hi)`, `as_float(v) -> float|None`, `as_date(v) -> date|None` — copied verbatim from the sibling `common.py` (drop `allocate_flags` unless used later).
- Produces in `vocab.py`: `ATTRITION_COLUMNS`, `CSAT_COLUMNS`, `ENROLLMENT_COLUMNS` (tuples), `CATEGORIES: dict[str, tuple[str, ...]]` (column → allowed values), `RANGES: dict[str, tuple[float, float]]` (column → inclusive min/max), `YES_NO_COLUMNS`, `BOOL_COLUMNS`.
- Produces in `conftest.py`: fixture `feature_rows` (list of feature dicts, see Task 2 for keys) and factory `make_feature(**overrides) -> dict`, exported as a fixture.

- [ ] **Step 1: Copy scaffolding** from the sibling: `pyproject.toml` (rename project to `cumulus-attrition-csat-inputs`, keep `pythonpath = ["procedures", "."]` and dev deps), `.gitignore` (replace `calibration_pool.json` line with `output/*pool*.json`), `common.py`.

- [ ] **Step 2: Write `tests/test_vocab.py`** asserting the exact live column orders:

```python
ATTR = ("CUSTOMER_SEGMENT_C","CROSS_SELL_SCORE_C","ONLINE_BANKING_C","MOBILE_BANKING_C","DIRECT_DEPOSIT_C",
        "AVG_NUMBER_OF_TRANSACTIONS_C","TENURE_IN_MONTHS_C","AVG_BALANCE_6_MONTHS_C","NPS_SCORE_C",
        "SINGLE_PRODUCT_CUSTOMER_C","PROMOTIONAL_PRODUCT_C","PCT_BALANCE_DROP_6_MONTHS_AVG_C",
        "DAYS_SINCE_LAST_INTERACTION_C","CHURNED_C","UNIQUEID","AVG_NUMBER_OF_CALL_CENTER_CALLS_C")
CSAT = ("SEGMENT","AGE","ANNUAL_INCOME","ACCOUNT_BALANCE","TENURE_YEARS","NUM_PRODUCTS","DIGITAL_ENGAGEMENT",
        "COMPLAINT_COUNT","CUSTOMER_SERVICE_CONTACT","CROSS_SELL_SCORE","ESCALATED_CASES","TRANSACTION_VOLUME",
        "CREDIT_SCORE","ACCOUNTID")
ENR = ("ACCOUNTID","MOBILE_ENROLLED","ONLINE_ENROLLED","KYC_STATUS","MFA_STATUS","PAPERLESS_ENROLLED",
       "ALERT_ENROLLED","WIRE_ENABLED","SAVINGS_RATE","CROSS_SELL_SCORE","AML_STATUS","SNAPSHOT_DATE")
```

plus: `CATEGORIES["CUSTOMER_SEGMENT_C"] == ("Regular","Premium","Preferred")`, `["NPS_SCORE_C"] == ("Promoter","Passive","Detractor")`, `["SEGMENT"] == ("Corporate","WealthManagement","Commercial","Banking")`, `["KYC_STATUS"] == ("Current","Pending","Expired","Under Review")`, `["AML_STATUS"] == ("Cleared","Under Review","Pending","None")`, `["CHURNED_C"] == ("No",)`; every column in `YES_NO_COLUMNS` maps to `("Yes","No")`; `BOOL_COLUMNS` = the six enrolment booleans; every numeric column of all three tables has a `RANGES` entry. Pin these `RANGES` values (keys are column names; CSAT and enrolment `CROSS_SELL_SCORE` collide, so key them `"CSAT.CROSS_SELL_SCORE"` / `"ENR.CROSS_SELL_SCORE"`):

| Column | Range | Column | Range |
|---|---|---|---|
| CROSS_SELL_SCORE_C | 1–7 | AGE | 18–79 |
| AVG_NUMBER_OF_TRANSACTIONS_C | 0–45 | ANNUAL_INCOME | 40004–14795526 |
| TENURE_IN_MONTHS_C | 8–74 | ACCOUNT_BALANCE | 3667.14–7249807.74 |
| AVG_BALANCE_6_MONTHS_C | 1.70–778793.36 | TENURE_YEARS | 1–34 |
| PCT_BALANCE_DROP_6_MONTHS_AVG_C | 0–0.84 | NUM_PRODUCTS | 1–23 |
| DAYS_SINCE_LAST_INTERACTION_C | 0–65 | DIGITAL_ENGAGEMENT | 40–99 |
| AVG_NUMBER_OF_CALL_CENTER_CALLS_C | 0–11 | COMPLAINT_COUNT | 0–4 |
| ENR.SAVINGS_RATE | 0.00–0.40 | CUSTOMER_SERVICE_CONTACT | 0–5 |
| ENR.CROSS_SELL_SCORE | 1–10 | CSAT.CROSS_SELL_SCORE | 0–100 |
| | | ESCALATED_CASES | 0–2 |
| | | TRANSACTION_VOLUME | 1–197 |
| | | CREDIT_SCORE | 621.78–842 |

Yes/No columns: `ONLINE_BANKING_C, MOBILE_BANKING_C, DIRECT_DEPOSIT_C, SINGLE_PRODUCT_CUSTOMER_C, PROMOTIONAL_PRODUCT_C`.

- [ ] **Step 3: Write `tests/test_common.py`** — port the sibling's common tests.
- [ ] **Step 4: Run** `pytest` from the project dir → FAIL (no vocab). Implement `vocab.py`; re-run → PASS.
- [ ] **Step 5: Write `conftest.py`** — `make_feature(**overrides)` returns a full grounded PERSON feature row (all Task 2 keys populated, `ACCOUNT_ID="001am00000TEST0001"`); `feature_rows` returns ≥60 rows: 30 PERSON (ages 20–78 across `Retail`/`WealthManagement`), 15 BUSINESS (`SmallBusiness`/`CommercialBanking`), 10 Household, with ≥1/3 of PERSON and BUSINESS rows feed-less (FTA/ADB keys `None`), ≥5 rows with a World-Check hit, ≥3 with `RISK_RATING='Severe'`, distinct `001am…` ids. Not loaded from Cumulus fixtures (their ids are `TEST-…`, which fail the key gate).
- [ ] **Step 6: Commit** `feat(attrcsat): scaffold project, vocab and helpers`.

### Task 2: Feature row → shared profile

**Files:**
- Create: `procedures/attrcsat/profile.py`, `tests/test_profile.py`

**Interfaces:**
- Consumes: feature row dict with keys (uppercase, from Task 5's SQL; any may be `None` except `ACCOUNT_ID`, `ACCOUNT_TYPE_FLAG`): `ACCOUNT_ID, ACCOUNT_TYPE_FLAG, CLIENT_CATEGORY, BIRTHDATE, ANNUAL_INCOME, CREDIT_SCORE, ANNUAL_REVENUE, NPS_SCORE, NPS_DESCRIPTION, DETRACTOR_12M, N_PRODUCTS, N_DEPOSIT, N_LOAN, N_INVESTMENT, N_LINE, DD_AMOUNT, BONUS_AMOUNT, FIRST_OPEN_DATE, TOTAL_BALANCE, AVG_BALANCE, EARLY_AVG_BALANCE, LATE_AVG_BALANCE, CREDITS, DEBITS, ADB_TXN, ADB_DAYS, FT_TXN, CALLS, GONG_WEEKS, LAST_CALL_DATE, NEG_WEEKS, VNEG_WEEKS, RISK_RATING, SANCTIONS_HIT, PEP_HIT, ADVERSE_MEDIA_HIT`.
- Produces: `build_profile(feature: dict, run_ts: datetime) -> dict` with exactly these keys:
  `account_id:str, kind:'PERSON'|'BUSINESS'|'HOUSEHOLD', client_category:str, age:int, income:float, credit_score:float, tenure_months:int, n_products:int, has_direct_deposit:bool, has_promo:bool, total_balance:float, avg_balance:float, pct_balance_drop:float, monthly_txn:float, savings_rate:float, monthly_calls:float, days_since_interaction:int, complaints:int, escalations:int, nps_category:str, cross_sell:float, risk:'REVIEW'|'WATCH'|'CLEAN', digital_affinity:float, grounded:bool`.
  Values are *unclamped to model ranges* (row factories clamp); all non-NULL.

- [ ] **Step 1: Write tests** (`tests/test_profile.py`):
  - `test_profile_keys_and_types` — every key above present and non-None for all `feature_rows`.
  - `test_profile_feedless_account_is_complete` — `make_feature(N_PRODUCTS=None, TOTAL_BALANCE=None, AVG_BALANCE=None, CREDITS=None, ADB_TXN=None, FIRST_OPEN_DATE=None, ...)` → complete profile, `grounded is False`, `n_products >= 1`.
  - `test_profile_kind` — `CLIENT_CATEGORY='Household'` → `HOUSEHOLD`; BUSINESS otherwise → `BUSINESS`; PERSON → `PERSON`.
  - `test_profile_nps_category` — `NPS_DESCRIPTION` `Promoter`/`Passives`/`Detractor` → `Promoter`/`Passive`/`Detractor`; `None` → derived from `NPS_SCORE` (≥9 Promoter, 7–8 Passive, else Detractor), else seeded.
  - `test_profile_risk` — any of the three hits True → `REVIEW`; `RISK_RATING` in (`High`,`Severe`) → `REVIEW`; `Medium` without hits → `WATCH`; `Low` without hits → `CLEAN`.
  - `test_profile_balance_drop` — `EARLY_AVG_BALANCE=100000, LATE_AVG_BALANCE=60000` → `pct_balance_drop == 0.4`; late ≥ early → `0.0`.
  - `test_profile_cross_sell_tracks_holdings` — more product kinds held (deposit+loan+investment+line) → strictly higher `cross_sell` than deposit-only, same seed; `0 <= cross_sell <= 1`.
  - `test_profile_digital_affinity_by_age` — PERSON age 25 has higher `digital_affinity` than age 75 with all else equal; BUSINESS > HOUSEHOLD.
  - `test_profile_deterministic` — same feature + same month → equal dicts.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** `build_profile`. Derivations (salts prefixed `attrcsat-`; fallbacks via `stable_rng(account_id, "attrcsat-<field>")`):
  - `age`: PERSON from `BIRTHDATE` at `run_ts`; BUSINESS/HOUSEHOLD seeded 30–72 (primary contact). `income`: PERSON `ANNUAL_INCOME`, else `ANNUAL_REVENUE`, else seeded by kind.
  - `credit_score`: anchor `CREDIT_SCORE`; else seeded 640–820 (business skew higher with revenue).
  - `tenure_months`: months from `FIRST_OPEN_DATE` to the feed anchor; else seeded 12–240.
  - `n_products`: `N_PRODUCTS`, else seeded 1–3. `has_direct_deposit`: `DD_AMOUNT > 0` (feed-less: seeded, PERSON ~55%, others ~20%). `has_promo`: `BONUS_AMOUNT > 0` (feed-less seeded ~30%).
  - `total_balance`: `TOTAL_BALANCE`; `avg_balance`: `AVG_BALANCE` else `TOTAL_BALANCE`; both feed-less → seeded log-normal around `income * 0.25`.
  - `monthly_txn`: `ADB_TXN / ADB_DAYS * 30` when `ADB_DAYS`, else `FT_TXN` per month, else seeded 2–30.
  - `savings_rate`: `(CREDITS - DEBITS) / CREDITS` when `CREDITS > 0`, else seeded 0.02–0.12; floor 0.
  - `monthly_calls`: `CALLS / GONG_WEEKS * 4.33`; `days_since_interaction`: days from `LAST_CALL_DATE` to anchor (None → seeded 20–90). `complaints`: `DETRACTOR_12M` + `NEG_WEEKS // 4`. `escalations`: `VNEG_WEEKS`.
  - `cross_sell`: weighted product-kind breadth + `n_products` + small seeded jitter, in [0,1]. `digital_affinity`: logistic of age (younger higher), `+` business, `+` monthly_txn, `−` household, in [0,1].
  - `grounded`: True iff `N_PRODUCTS` was not None.
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `feat(attrcsat): feed row to shared profile`.

### Task 3: Enrollment row factory and its consistency gate

**Files:**
- Create: `procedures/attrcsat/enrollments.py`, `tests/test_enrollments.py`

**Interfaces:**
- Consumes: `build_profile` output (Task 2); `vocab.ENROLLMENT_COLUMNS`, `RANGES`.
- Produces: `enrollment_row(profile: dict, run_ts: datetime) -> dict` (keys = `ENROLLMENT_COLUMNS`; booleans are Python `bool`; `SNAPSHOT_DATE` is the string `'YYYY-MM-01 00:00:00'` of `run_ts`'s month; `CROSS_SELL_SCORE = 1 + round(9 * profile["cross_sell"])`); `enrollment_problems(rows: list[dict], profiles: list[dict]) -> list[str]` (empty = pass; parallel lists).

- [ ] **Step 1: Write tests:**
  - `test_enrollment_columns_and_no_nulls` — over `feature_rows`, keys == `ENROLLMENT_COLUMNS`, no None.
  - `test_mfa_requires_digital` — no row has `MFA_STATUS` True with both `ONLINE_ENROLLED` and `MOBILE_ENROLLED` False (property over 2,000 synthetic profiles from `make_feature` with varied ids).
  - `test_kyc_hit_overrides_low_rating` — `make_feature(RISK_RATING='Low', PEP_HIT=True)` → `KYC_STATUS in ('Pending','Under Review')` and `AML_STATUS in ('Under Review','Pending')`.
  - `test_clean_profile_statuses` — over 2,000 CLEAN profiles: KYC only `Current`/`Expired` with `Expired` share 2–8%; AML only `Cleared`/`None` with `None` share ≤ 5%.
  - `test_wire_rates` — over 2,000 profiles each: BUSINESS wire rate ≥ 40%; PERSON `Retail` with `total_balance < 50000` wire rate ≤ 5%.
  - `test_paperless_alerts_follow_digital` — among non-digital rows, paperless rate ≤ 10% and alerts rate ≤ 10%; among digital rows, both ≥ 40%.
  - `test_adoption_by_age` — PERSON age 22–30 mobile rate > age 65–79 mobile rate by ≥ 20 points.
  - `test_enrollment_same_month_identical` — two calls, same `run_ts` month (different days) → equal rows.
  - `test_enrollment_month_drift_small` — runs for 2026-10 and 2026-11 over 2,000 profiles: each boolean flag differs on ≤ 5% of rows and ≥ 1 row (drift exists); KYC/AML for REVIEW profiles never change to clean.
  - `test_enrollment_problems_flags_violations` — hand-built rows violating MFA, a hit with KYC `Current`, a NULL, a `SAVINGS_RATE` of 0.9, a non-`001am` id → each yields ≥1 problem string; valid rows → `[]`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** Target rates (record in Task 6's calibration doc): online P ≈ 0.55 + 0.35·affinity (BUSINESS +0.1), mobile P ≈ 0.15 + 0.75·affinity; MFA P = 0.85 given digital; paperless 0.6 / alerts 0.65 given digital, 0.05 otherwise; wire P: BUSINESS 0.6, HOUSEHOLD 0.15, WealthManagement 0.35, other PERSON 0.03 (+0.1 when `total_balance ≥ 250000`). Each flag = sticky draw from `stable_rng(id, "attrcsat-enr-<flag>")`, then flip with P 0.02 from `month_rng(id, "attrcsat-drift-<flag>", run_ts)`; re-apply MFA ⇒ digital after drift. KYC/AML: REVIEW → seeded among (`Under Review`,`Pending`) for both; WATCH → KYC (`Current` 0.7 / `Pending` 0.3), AML (`Cleared` 0.6 / `Pending` 0.4); CLEAN → KYC `Expired` 0.05 else `Current`; AML `None` 0.03 else `Cleared`. `SAVINGS_RATE` = `round(clamp(profile["savings_rate"], 0, 0.40), 2)`. `enrollment_problems` checks NULLs, vocab, ranges, key prefix, MFA⇒digital, hit/REVIEW⇒review statuses, CLEAN⇒no review statuses.
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `feat(attrcsat): enrollment flags with consistency gate`.

### Task 4: Attrition and CSAT row factories, cross-table gate

**Files:**
- Create: `procedures/attrcsat/attrition.py`, `procedures/attrcsat/csat.py`, `procedures/attrcsat/checks.py`, `tests/test_rows.py`

**Interfaces:**
- Consumes: profile (Task 2), enrollment row (Task 3), `vocab`.
- Produces: `attrition_row(profile, enrollment) -> dict` (keys `ATTRITION_COLUMNS`); `csat_row(profile, enrollment) -> dict` (keys `CSAT_COLUMNS`); `checks.row_problems(table: str, row: dict) -> list[str]` for `table in ('ATTRITION','CSAT','ENROLLMENTS')` (NULL, vocab, `RANGES`, key prefix); `checks.cross_table_problems(att: list, csat: list, enr: list) -> list[str]` (lists aligned by account).

- [ ] **Step 1: Write tests:**
  - `test_rows_columns_vocab_ranges` — every row of all `feature_rows` passes `row_problems` for its table.
  - `test_rows_feedless_complete` — feed-less PERSON, BUSINESS and HOUSEHOLD features → rows pass `row_problems`.
  - `test_rows_extreme_inputs_clamped` — `make_feature(ANNUAL_INCOME=9e9, CREDIT_SCORE=400, FIRST_OPEN_DATE=date(1980,1,1), BIRTHDATE=date(2015,1,1), AVG_BALANCE=5e7, CALLS=500, GONG_WEEKS=1)` → rows pass `row_problems`.
  - `test_banking_flags_match_enrollment` — `ONLINE_BANKING_C == 'Yes'` iff `ONLINE_ENROLLED`; same for mobile.
  - `test_cross_sell_agrees` — for all rows: `|(att-1)/6 − (enr-1)/9| ≤ 0.17` and `|csat/100 − (enr-1)/9| ≤ 0.12`.
  - `test_attrition_semantics` — `UNIQUEID == account_id`, `CHURNED_C == 'No'`, `NPS_SCORE_C == profile["nps_category"]`, `SINGLE_PRODUCT_CUSTOMER_C == 'Yes'` iff `n_products == 1`, `DIRECT_DEPOSIT_C`/`PROMOTIONAL_PRODUCT_C` follow `has_direct_deposit`/`has_promo`.
  - `test_csat_segment_mapping` — PERSON `Retail`→`Banking`; PERSON `WealthManagement`/`Gold`/`Platinum`→`WealthManagement`; BUSINESS `CommercialBanking`→`Corporate`; other BUSINESS→`Commercial`; HOUSEHOLD→`Banking`; other PERSON→`Banking`.
  - `test_customer_segment_mapping` — `WealthManagement`/`Gold`/`Platinum` or `total_balance ≥ 250000` → `Preferred`; `CommercialBanking`/`Silver` or `total_balance ≥ 75000` → `Premium`; else `Regular`.
  - `test_cross_table_problems_detects_mismatch` — flip one `ONLINE_BANKING_C` → one problem; aligned lists → `[]`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** Every numeric = `clamp(<profile value>, *RANGES[col])`, integers rounded, money 2 dp. Mappings: `AVG_NUMBER_OF_TRANSACTIONS_C`←`monthly_txn`, `TENURE_IN_MONTHS_C`←`tenure_months`, `AVG_BALANCE_6_MONTHS_C`←`avg_balance`, `PCT_BALANCE_DROP_6_MONTHS_AVG_C`←`pct_balance_drop`, `DAYS_SINCE_LAST_INTERACTION_C`←`days_since_interaction`, `AVG_NUMBER_OF_CALL_CENTER_CALLS_C`←`monthly_calls`, `CROSS_SELL_SCORE_C = 1 + round(6·cross_sell)`; CSAT `AGE`, `ANNUAL_INCOME`←`income`, `ACCOUNT_BALANCE`←`total_balance`, `TENURE_YEARS = round(tenure_months/12)`, `NUM_PRODUCTS`, `DIGITAL_ENGAGEMENT = 40 + 59·mean(digital_affinity, share of the 6 enrolment booleans True)`, `COMPLAINT_COUNT`←`complaints`, `CUSTOMER_SERVICE_CONTACT`←`round(monthly_calls)`, `CROSS_SELL_SCORE = round(100·cross_sell)`, `ESCALATED_CASES`←`escalations`, `TRANSACTION_VOLUME`←`monthly_txn`, `CREDIT_SCORE`.
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `feat(attrcsat): attrition and CSAT rows with cross-table gate`.

### Task 5: SP main — feature SQL, gates, atomic replace, logging

**Files:**
- Create: `procedures/attrcsat/sp_main.py`, `tests/test_sp_main.py`

**Interfaces:**
- Consumes: Tasks 1–4; `seed_for`, `assert_coverage` (inlined from `Snowflake_Cumulus_Common/cumulus_common/` at build time, imported normally in tests).
- Produces: `TASK_NAME = "TASK_MONTHLY_ATTRITION_CSAT_INPUTS"`, `FEATURES_SQL: str`, `_sp_AUD: str` (the `aud AS (...)` CTE), `dedupe_anchors`, `replace_tables(session, writes, check=None) -> int`, `assert_inputs(session) -> None`, `main(session, mode="INPUTS") -> str`.

- [ ] **Step 1: Write tests** with a fake session (port the sibling's `tests/test_sp_main.py` fake that records SQL and returns canned rows for the features query):
  - `test_features_sql_shape` — `FEATURES_SQL` contains `LIKE '001am%'`, `DATE_TRUNC('month', CURRENT_DATE())`, `QUALIFY ROW_NUMBER()`, every Task 2 feature key as an output alias, and reads `CSAT_NPS_DATA`, `FINANCIAL_TRANSACTION_ACCOUNTS`, `ACCOUNT_DAILY_BALANCE`, `FINANCIAL_TRANSACTIONS`, `GONG_CALL_SENTIMENT`, `WORLD_CHECK_AML`; does not filter out `Household`.
  - `test_main_writes_three_tables_in_one_transaction` — order `BEGIN` → (DELETE+INSERT)×3 for `ATTRITION_INPUTS`, `CSAT_ATTRITION_INPUTS`, `ENROLLMENTS` → assert queries → `COMMIT`; staging dropped; one `TASK_EXECUTION_LOG` insert with `STATUS='SUCCEEDED'` and name `TASK_MONTHLY_ATTRITION_CSAT_INPUTS[INPUTS]`.
  - `test_main_gate_failure_no_dml` — monkeypatch `cross_table_problems` to return `["x"]` → `RuntimeError`, no `BEGIN`/`DELETE`/`INSERT INTO DATA_JEDAIS.FINS__PUBLIC.ATTRITION_INPUTS` issued, log `STATUS='FAILED'`.
  - `test_main_rejects_other_modes` — `main(s, "TRAINING")` → `ValueError`.
  - `test_main_empty_audience_fails` — features return `[]` → `RuntimeError("empty audience…")`.
  - `test_assert_inputs_checks` — the SQL it issues covers, per table: coverage vs `_sp_AUD`, duplicates, `NOT LIKE '001am%'`, row count > audience, and a NULL count over every column.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** `FEATURES_SQL` = `WITH aud AS (SELECT ... FROM V_ACCOUNT_ANCHORS WHERE ACCOUNT_ID LIKE '001am%' QUALIFY ROW_NUMBER() OVER (PARTITION BY ACCOUNT_ID ORDER BY SNAPSHOT_DATE DESC) = 1)` plus one aggregated CTE per feed, LEFT JOINed on account: `nps` (latest `SCORE_DATE < anchor` by `ACCOUNTID`; `DETRACTOR_12M` = count `NPS_SCORE <= 4` in 12 months), `fta` (by `SFACCOUNTID`: product-kind counts, `SUM(DIRECT_DEPOSIT_AMOUNT)`, `SUM(BONUS_AMOUNT)`, `MIN(OPEN_DATE)`, `SUM(BALANCE)`), `adb` (join FTA `ACCOUNTID`→`ACCOUNT_DAILY_BALANCE.ACCOUNTID`, `BALANCE_DATE` in `[anchor − 6 months, anchor)`; daily per-customer balance summed then averaged; early/late halves split at the window midpoint; `SUM(DAILY_CREDITS)`, `SUM(DAILY_DEBITS)`, `SUM(TRANSACTION_COUNT)`, `COUNT(DISTINCT BALANCE_DATE)`), `ft` (count by `SFACCOUNTID`, `POSTINGDATE` in last 30 days before anchor), `gong` (`PROFILE_WEEK` in last 12 weeks: `SUM(CALL_COUNT_LAST_7D)`, `COUNT(*)`, `MAX(LAST_CALL_DATE)`, count `OVERALL_SENTIMENT IN ('Negative','VeryNegative')`, count `'VeryNegative'`), `wc` (latest `PROFILE_DATE <= anchor` per account). `main` follows the sibling's shape: build profiles → enrollments → attrition/CSAT; collect row-factory exceptions (zero tolerance); run `row_problems` on every row, `enrollment_problems`, `cross_table_problems` — any problem raises before staging; then `replace_tables` with `check=assert_inputs`. Staged `SNAPSHOT_DATE` is a string; the `INSERT … SELECT` casts it to `TIMESTAMP_NTZ` (write `TO_TIMESTAMP_NTZ(SNAPSHOT_DATE)` for that column).
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `feat(attrcsat): SP main with gates and atomic replace`.

### Task 6: Build script, generated SQL, task, docs

**Files:**
- Create: `scripts/deploy_sp.py`, `procedures/sp_create_procedure.sql` (generated), `tasks/task_monthly_attrition_csat_inputs.sql`, `tests/test_deploy_sp.py`, `README.md`, `AGENTS.md`, `output/calibration.md`

**Interfaces:**
- Consumes: all modules. `MODULE_ORDER = ("common", "vocab", "profile", "enrollments", "attrition", "csat", "checks", "sp_main")`; `PKG_DIR = procedures/attrcsat`; `_INTERNAL_ROOTS = ("attrcsat", "cumulus_common", "__future__")`; `PROCEDURE_FQN` per Global Constraints.

- [ ] **Step 1:** Port the sibling `scripts/deploy_sp.py` and `tests/test_deploy_sp.py` with the values above (header comment names modes `INPUTS` only). The task-SQL test asserts `SUSPENDED`-by-default comment, `SP_RETRY_WRAPPER`, `''INPUTS''`, `2`, `0 5 2 * * America/New_York`, `MAIN_WH_XS`.
- [ ] **Step 2: Run** `pytest` → test_deploy_sp FAIL until `.venv/bin/python scripts/deploy_sp.py --no-deploy` generates the SQL; re-run → all PASS.
- [ ] **Step 3: Docs.** `README.md` and `AGENTS.md` mirror the sibling's sections (objects table with row counts left as `TBD-live` for Task 7 to fill, audience incl. Ruling R1, Data Cloud wiring: `BT_Attrition_Inputs`→`Attrition_Inputs_Snowflake__dlm` (key `uniqueid__c`), `BT_CSAT_Attrition_Inputs`→`CSAT_Prediction_Input__dlm` (key `accountid__c`), `BT_Enrollments`→`Enrollments__dlm`; tests; deploy/run; gotchas). `output/calibration.md`: feed map, every derivation rule and constant from Tasks 2–4 (target rates, salts, fallbacks, complaint/escalation rule), and an empty "Live run" section for Task 7.
- [ ] **Step 4: Commit** `feat(attrcsat): deploy script, task SQL and docs`.

### Task 7: Live deploy, run, schedule, verify (controller, not a subagent)

- [ ] **Step 1:** `.venv/bin/python scripts/deploy_sp.py --connection SFDC_DC_TECH_ARCH --role ACCOUNTADMIN` → `Function SP_GENERATE_ATTRITION_CSAT_INPUTS successfully created`.
- [ ] **Step 2:** `snow sql -c SFDC_DC_TECH_ARCH --role ACCOUNTADMIN -q "CALL DATA_JEDAIS.FINS__PUBLIC.SP_RETRY_WRAPPER('DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_ATTRITION_CSAT_INPUTS(''INPUTS'')', 2)"` → `SUCCEEDED rows=108717 accounts=36239` (3 × audience). On a gate failure: fix, re-run tests, redeploy.
- [ ] **Step 3:** `snow sql -f tasks/task_monthly_attrition_csat_inputs.sql`, then `ALTER TASK DATA_JEDAIS.FINS__PUBLIC.TASK_MONTHLY_ATTRITION_CSAT_INPUTS RESUME`; `SHOW TASKS LIKE 'TASK_MONTHLY_ATTRITION%'` → `state=started`.
- [ ] **Step 4: Verify in Snowflake:** each table `COUNT(*) = COUNT(DISTINCT key) = 36239`, 0 non-`001am` keys, 0 NULLs per column; flag rates and KYC/AML mix vs `WORLD_CHECK_AML` latest; MFA-without-digital = 0. Record aggregates in `calibration.md` "Live run".
- [ ] **Step 5: Verify in Data Cloud** (`jdo-gj9q5q`, `ssot/query-sql`): `COUNT(*)` on `Attrition_Inputs_Snowflake__dlm`, `CSAT_Prediction_Input__dlm`, `Enrollments__dlm` = 36,239 each (federated, so immediate).
- [ ] **Step 6: Retire `Attrition_Inputs_Snowflake`** (record `1dsam000000BUNlAAO`): confirm its DLO has no DMO mapping, segment, CI or transform references, then delete via DC Setup UI (Playwright).
- [ ] **Step 7:** Fill README/AGENTS row counts and task status; update `React-Headless/docs/SNOWFLAKE_DATA_FIXES.md` §2 to ✅ with live counts. Regenerate nothing else. Commit `docs(attrcsat): live counts and fixes doc`. No push.
