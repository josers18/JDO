# Product Recommendation Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Snowpark generator, `SP_GENERATE_PRODUCT_RECOMMENDATION_INPUTS`. It rebuilds the two product-recommendation **input** tables from real accounts, one row per real customer. It also rebuilds, on demand, the two **training** tables from the same population, using rule-derived labels.

**Architecture:** A new sister project, `JDO/Snowflake_Product_Recommendations/`, in the pattern of `Snowflake_DnB_BusinessCredit`.
- Small, focused Python modules (vocab, business profile, personal profile, labels, training sampler, SP entry point) are unit-tested locally.
- `scripts/deploy_sp.py` concatenates them, plus the inlined `cumulus_common` helpers, into one self-contained `CREATE PROCEDURE` (no stage, no IMPORTS).
- One SQL read per side joins the audience to the real feeds. A Python profile factory then turns each account into the full variable set. The input row is that profile projected onto the 12 subset columns, so inputs and training share one code path.

**Tech Stack:** Python 3.11, snowflake-snowpark-python, pandas, pytest; Snowflake CLI (`snow sql -c SFDC_DC_TECH_ARCH`).

**Spec:** `docs/superpowers/specs/2026-10-23-product-recommendation-generator-design.md`. Read §4–§7 before starting. §8 and the "Settled after review" section list the calls already made.

## Global Constraints

- **Snowflake target:** account `SFDC_DC_TECH_ARCH`, schema `DATA_JEDAIS.FINS__PUBLIC`, role SYSADMIN, warehouse `MAIN_WH_XS`.
  - Every `snow` command passes `-c SFDC_DC_TECH_ARCH`. The default `GSB13421_jwt` connection points at a retired account.
- **Tables written, all four:** the names, column names, column order and types match `DESCRIBE TABLE` as of 2026-10-23 (listed in Task 1). Add no columns: no `ORG_ID`, no `PROFILE_MONTH`.
- **Business audience:** `ACCOUNT_TYPE_FLAG = 'BUSINESS' AND COALESCE(CLIENT_CATEGORY,'') <> 'Household' AND ACCOUNT_ID LIKE '001am%'` (5,725 today).
- **Personal audience:** `ACCOUNT_TYPE_FLAG = 'PERSON'` (25,424 today, all `001am`).
- **No account in both input tables.** Inputs never carry `B-`/`P-` keys.
- **Anchor values are copied, never clamped:**
  - business `ANNUAL_REVENUE` and `NUMBER_OF_EMPLOYEES`;
  - personal `ANNUAL_INCOME`, `CREDIT_SCORE`, and `AGE` (from `BIRTHDATE`).
  - Generate a value only when the anchor is NULL.
- **Salts:** `product_rec_business` and `product_rec_personal`. Training-pool salts: `product_rec_business_training` and `product_rec_personal_training`.
- **Category vocabularies:** exactly the underscore values in spec Appendix A. Business labels: 12 classes. Personal labels: 11 classes.
- **Training sizes:** business 3,500 rows with keys `B-000001…`; personal 7,500 rows with keys `P-000001…`. Each class gets at least 100 rows.
- **Label-mix gate**, applied to each training set and to inference: no class above 40%, at least 8 classes present.
- **Writes:** replace the full table inside one transaction (`BEGIN` / `DELETE` / `INSERT … SELECT` from staging / `COMMIT`). Never `CREATE OR REPLACE` or swap a DC-read table.
- **Task:** `TASK_MONTHLY_PRODUCT_RECOMMENDATION_INPUTS`, schedule `USING CRON 0 4 2 * * America/New_York`. It calls `SP_RETRY_WRAPPER('DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_PRODUCT_RECOMMENDATION_INPUTS(''INPUTS'')', 2)`.
  - It is created **SUSPENDED**, and only Task 10 resumes it.
  - Training is never scheduled.
- **SQL files:** no bare `&` anywhere (`snow sql -f` templating); write "and".
- **Git:**
  - Work on branch `feat/product-recommendation-generator`, cut from `main`. Code goes through a PR.
  - Commit messages end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. **NULL anchors.** A business with NULL revenue or employees, or a person with NULL birthdate or income, still gets a complete row. No NUMBER column may be None. Tests: Tasks 2 and 3.
2. **An industry label the crosswalk doesn't know** (a new label appears in the roster). It gets a seeded, weighted pick from the 14 codes; the build must not crash or emit an unknown code. Test: Task 1.
3. **Absurd real-feed values.** Example: 90-day credits of 100× revenue/12, or a deposit balance of 0 for a $20M firm. These must fall back to the generated value instead of poisoning the input. Tests: Tasks 2 and 3.
4. **Duplicate anchors.** `MASTER_ACCOUNTS` has duplicate `ACCOUNT_ID`s with differing values, which `SELECT DISTINCT *` doesn't collapse. The build must still yield exactly one row per account. Test: Task 6.
5. **A failure mid-write** (an INSERT error after the DELETE). The table must not be left empty: the transaction rolls back. Test: Task 6.

---

## File Structure

All paths are under `JDO/Snowflake_Product_Recommendations/`.

| File | Responsibility |
|---|---|
| `pyproject.toml`, `tests/conftest.py` | Same shape as the sibling project; the conftest loads the shared 100-anchor fixture |
| `procedures/prodrec/common.py` | Seeded RNG helpers (stable and monthly), `jitter`, `clamp` |
| `procedures/prodrec/vocab.py` | Column lists, category vocabularies, training marginals, industry crosswalk, state→region map |
| `procedures/prodrec/business.py` | `business_profile()`: anchor + feeds → every business training variable |
| `procedures/prodrec/personal.py` | `personal_profile()`: anchor + feeds → every personal training variable |
| `procedures/prodrec/labels.py` | Per-class rule scores, `rule_label`, `draw_label` |
| `procedures/prodrec/training.py` | Pool → stratified training set, key assignment, mix gate |
| `procedures/prodrec/sp_main.py` | Audience/feature SQL, transactional replace, coverage asserts, `main(session, mode)` |
| `scripts/deploy_sp.py` | Concatenates the modules and helpers → `procedures/sp_create_procedure.sql` → deploys |
| `scripts/calibrate.py` | Read-only: pulls the live audience and feeds, runs the factories and labels locally, prints the gates |
| `tasks/task_monthly_product_recommendation_inputs.sql` | Creates the task (suspended) |
| `tests/test_*.py` | One test file per module |
| `output/calibration.md`, `output/l3-smoke.md` | Recorded live numbers |
| `README.md`, `AGENTS.md` | Written in Task 10 |

---

### Task 1: Workspace, scaffold, vocab and RNG helpers

**Files:**
- Create: `pyproject.toml`, `tests/__init__.py`, `tests/conftest.py`, `procedures/prodrec/__init__.py`, `procedures/prodrec/common.py`, `procedures/prodrec/vocab.py`, `tests/test_vocab.py`, `tests/test_common.py`, `.gitignore` (`output/calibration_pool.json`, `.venv/`, `__pycache__/`)
- Also commit: `docs/superpowers/specs/2026-10-23-product-recommendation-generator-design.md` and this plan. They're untracked on another branch's working tree, so copy them into the worktree.

**Interfaces — Produces:**
- `common.stable_rng(key: str, salt: str) -> random.Random`, seeded by `seed_for(key, salt, datetime(2026, 1, 1))`. Month-independent: categoricals and base values come from it.
- `common.month_rng(key: str, salt: str, run_ts: datetime) -> random.Random`, seeded by `seed_for(key, salt + "|month", run_ts)`.
- `common.jitter(value: float, rng: random.Random, pct: float = 0.03) -> float`: `value * (1 + U(-pct, pct))`. This is the only month-to-month drift on generated values.
- `common.clamp(v: float, lo: float, hi: float) -> float`
- In `vocab`:
  - `BUSINESS_SUBSET_COLUMNS`, `BUSINESS_TRAINING_COLUMNS`, `PERSONAL_SUBSET_COLUMNS`, `PERSONAL_TRAINING_COLUMNS: tuple[str, ...]`. These are the exact DESCRIBE orders below, starting with `ACCOUNTID`; the training lists end with `RECOMMENDED_PRODUCT`.
  - `BUSINESS_PRODUCTS` (12) and `PERSONAL_PRODUCTS` (11), as tuples.
  - `INDUSTRIES` (14), plus `INDUSTRY_WEIGHTS: dict[str, int]` holding the Appendix A counts.
  - `INDUSTRY_CROSSWALK: dict[str, str]`.
  - `REGION_BY_STATE: dict[str, str]`, covering all 50 states + DC → `Northeast | Mid_Atlantic | Southeast | Midwest | Southwest | West`.
  - Every other categorical's values and Appendix A counts, named `<COLUMN>_WEIGHTS`.
- `vocab.map_industry(label: str | None, rng: random.Random) -> str`
- `vocab.map_region(state: str | None, rng: random.Random) -> str`

Exact column orders (from `DESCRIBE TABLE`, 2026-10-23):
- **Business subset:** `ACCOUNTID, INDUSTRY, EXISTING_PRODUCT_COUNT, PROFIT_MARGIN_PCT, ANNUAL_REVENUE, YEARS_IN_BUSINESS, NUMBER_OF_EMPLOYEES, OPERATING_ACCOUNT_BALANCE, MONTHLY_AVG_DEPOSITS, NET_MONTHLY_CASH_FLOW, YEARS_AS_CUSTOMER, CASH_FLOW_VOLATILITY, NUMBER_OF_LOCATIONS`
- **Business training:** `ACCOUNTID, INDUSTRY, BUSINESS_STRUCTURE, ANNUAL_REVENUE, NUMBER_OF_EMPLOYEES, YEARS_IN_BUSINESS, MONTHLY_AVG_DEPOSITS, NET_MONTHLY_CASH_FLOW, OPERATING_ACCOUNT_BALANCE, CASH_FLOW_VOLATILITY, NUMBER_OF_LOCATIONS, INTERNATIONAL_OPERATIONS, BUSINESS_CREDIT_SCORE, DEBT_TO_REVENUE_RATIO, PAYROLL_BURDEN_PCT, HAS_BUSINESS_CHECKING, HAS_BUSINESS_SAVINGS, HAS_BUSINESS_CREDIT_CARD, HAS_BUSINESS_LOAN, HAS_LINE_OF_CREDIT, HAS_MERCHANT_SERVICES, EXISTING_PRODUCT_COUNT, YEARS_AS_CUSTOMER, DIGITAL_BANKING_USAGE, REVENUE_GROWTH_YOY_PCT, PROFIT_MARGIN_PCT, SEASONAL_BUSINESS, AVG_RECEIVABLES_DAYS, DEBT_SERVICE_COVERAGE_RATIO, MONTHLY_WIRE_TRANSFER_COUNT, ACH_TRANSACTIONS_PER_EMPLOYEE, RECOMMENDED_PRODUCT`
- **Personal subset:** `ACCOUNTID, ANNUAL_INCOME, EXISTING_PRODUCT_COUNT, TOTAL_ACCOUNT_BALANCE, CREDIT_SCORE, AGE, DEBT_TO_INCOME_RATIO, RISK_TOLERANCE, EMPLOYMENT_STATUS, HOME_OWNERSHIP, MONTHLY_DEPOSIT_AMOUNT, SAVINGS_RATE_PCT, EDUCATION_LEVEL`
- **Personal training:** `ACCOUNTID, AGE, EDUCATION_LEVEL, ANNUAL_INCOME, CREDIT_SCORE, EMPLOYMENT_STATUS, YEARS_AT_CURRENT_JOB, MARITAL_STATUS, NUMBER_OF_DEPENDENTS, HOME_OWNERSHIP, GEOGRAPHIC_REGION, TOTAL_ACCOUNT_BALANCE, MONTHLY_TRANSACTION_COUNT, AVG_TRANSACTION_AMOUNT, MONTHLY_DEPOSIT_AMOUNT, DEBT_TO_INCOME_RATIO, HAS_CHECKING, HAS_SAVINGS, HAS_INVESTMENT_ACCOUNT, HAS_MORTGAGE, HAS_AUTO_LOAN, HAS_CREDIT_CARD, EXISTING_PRODUCT_COUNT, YEARS_AS_CUSTOMER, DIGITAL_BANKING_LOGINS_MONTHLY, BRANCH_VISITS_MONTHLY, MOBILE_APP_ACTIVE, RISK_TOLERANCE, RECENT_LIFE_EVENT, MONTHS_SINCE_LAST_PRODUCT, CUSTOMER_SATISFACTION_SCORE, OVERDRAFT_COUNT_12M, SAVINGS_RATE_PCT, RECOMMENDED_PRODUCT`

Decimal columns (all others are integers):
- `DEBT_TO_REVENUE_RATIO`, `DEBT_SERVICE_COVERAGE_RATIO` and `DEBT_TO_INCOME_RATIO` are NUMBER(38,2).
- `PAYROLL_BURDEN_PCT`, `REVENUE_GROWTH_YOY_PCT`, `PROFIT_MARGIN_PCT`, `ACH_TRANSACTIONS_PER_EMPLOYEE`, `CUSTOMER_SATISFACTION_SCORE` and `SAVINGS_RATE_PCT` are NUMBER(38,1).

Live anchor industry labels (audience, 2026-10-23), every one of which the crosswalk must cover:
- Restaurant, Retail Trade, Construction, Professional Services, Healthcare, Wholesale, Real Estate, Manufacturing, Logistics
- Healthcare Systems, Professional Services Mid-Market, Real Estate Holdings, Wholesale Distribution
- Hospitality, Technology, Financial Services, Healthcare & Life Sciences, Communications, Retail, Insurance
- Banking, Consulting, Energy, Finance, Transportation, Education

- [ ] **Step 1: Create the worktree and scaffold.** From `JDO/`, run `git worktree add ../JDO-prodrec -b feat/product-recommendation-generator main`. If the new index is 0 bytes, run `git read-tree HEAD` inside the worktree. Copy in the spec and this plan. Copy `pyproject.toml` and `tests/conftest.py` from `Snowflake_DnB_BusinessCredit`, then:
  - rename the package to `cumulus-product-recommendations`;
  - set `pythonpath = ["procedures", "."]`;
  - make the conftest fixtures `business_anchors` (`ACCOUNT_TYPE_FLAG == 'BUSINESS'`) and `person_anchors`.
  - Then run `python3.11 -m venv .venv && .venv/bin/pip install -e ".[dev]" -e ../Snowflake_Cumulus_Common`.
- [ ] **Step 2: Write the failing tests.**
  - `test_columns_match_describe`: assert each column tuple equals the list above, verbatim.
  - `test_crosswalk_covers_live_labels`: every live label maps into `INDUSTRIES`. Pin `Restaurant→Food_Beverage`, `Retail Trade→Retail`, `Wholesale→Retail`, `Logistics→Transportation`, `Healthcare Systems→Healthcare`, `Banking→Financial_Services`, `Communications→Technology`.
  - `test_unknown_industry_weighted_pick`: `map_industry("Underwater Basket Weaving", rng)` and `map_industry(None, rng)` return a member of `INDUSTRIES`. Over 2,000 seeded draws, `Technology` (422) is picked more than `Agriculture` (138).
  - `test_region_map`: all 51 codes map to one of the 6 regions, and `map_region("ZZ", rng)` returns one of the 6.
  - `test_stable_rng_month_independent`: `stable_rng("001amX","s").random()` is identical across calls.
  - `test_month_rng_changes_by_month`: `month_rng` differs between 2026-10 and 2026-11, and is the same for 2026-10-01 and 2026-10-23.
  - `test_jitter_bounded`: for 1,000 draws, `0.97*v <= jitter(v, rng) <= 1.03*v`.
- [ ] **Step 3:** Run `.venv/bin/pytest tests/test_vocab.py tests/test_common.py -v`. Expected: FAIL (ImportError).
- [ ] **Step 4:** Implement `common.py` and `vocab.py` with the interfaces above. Import `seed_for` with `from cumulus_common.seed import seed_for`; the deploy step strips that line.
- [ ] **Step 5:** Run the same command. Expected: PASS.
- [ ] **Step 6: Commit** the spec, plan, scaffold, `common.py`, `vocab.py` and tests: `feat(prodrec): scaffold project, vocab, seeded RNG helpers`.

### Task 2: Business profile factory

**Files:** Create `procedures/prodrec/business.py` and `tests/test_business.py`.

**Interfaces:**
- Consumes: `common.*` and `vocab.*` from Task 1.
- Produces: `business_profile(anchor: dict, feats: dict, run_ts: datetime, key: str | None = None) -> dict`. It returns every key in `BUSINESS_TRAINING_COLUMNS` except `RECOMMENDED_PRODUCT`, with `ACCOUNTID = anchor["ACCOUNT_ID"]`.
  - `key` defaults to the account Id. Training passes `f"{account_id}#T{i}"` so generated fields differ from that account's input row.
  - `business_input_row(profile: dict) -> dict` projects onto `BUSINESS_SUBSET_COLUMNS`.
- `feats` keys come from the Task 6 SQL. Any of them may be None:
  - `DEPOSIT_BALANCE`, `MONTHLY_CREDITS`, `MONTHLY_NET`, `MONTHLY_NET_SD`, `FEED_MONTHS`
  - `PRODUCT_COUNT`, `FIRST_OPEN_DATE`
  - `HAS_LOAN`, `HAS_LINE`, `HAS_CARD`, `HAS_TREASURY`, `HAS_INVESTMENT`
  - `FOUNDED_YEAR`

Rules the tests pin (anything not listed is the builder's choice, within the Appendix A ranges):
- **Size:** `ANNUAL_REVENUE` and `NUMBER_OF_EMPLOYEES` equal the anchor when it isn't NULL; there's no clamp. When one is NULL, it's derived from the other at a revenue-per-employee of roughly $150K, jittered. When both are NULL, revenue is drawn from the training marginal.
- **Industry:** `INDUSTRY = map_industry(anchor["INDUSTRY"], stable_rng(key, salt))`.
- **Years in business:** `YEARS_IN_BUSINESS = max(1, run_ts.year − FOUNDED_YEAR)` when `FOUNDED_YEAR` is present.
- **Monthly deposits:** `MONTHLY_AVG_DEPOSITS = MONTHLY_CREDITS` when it lies within `[0.05, 3] × revenue/12`. Otherwise it's generated at about `revenue/12 × U(0.6, 1.1)`.
- **Operating balance:** `OPERATING_ACCOUNT_BALANCE = DEPOSIT_BALANCE` when it lies within `[0.01, 2] × revenue`. Otherwise it's generated at about `revenue × U(0.08, 0.2)`.
- **Net cash flow:** `NET_MONTHLY_CASH_FLOW = MONTHLY_NET` under the same `[−1, 1] × revenue/12` sanity window, else generated around `PROFIT_MARGIN_PCT/100 × revenue/12`.
- **Cash-flow volatility:** `CASH_FLOW_VOLATILITY` comes from `cv = MONTHLY_NET_SD / max(MONTHLY_CREDITS, 1)`. The cut-offs are constants: `VOL_LOW_MAX = 0.15` and `VOL_MED_MAX = 0.40`, tuned in Task 8. When there's no feed it's drawn from the training weights, with `SEASONAL_BUSINESS = 1` raising the odds of High.
- **Product holdings:** the six `HAS_*` flags start from the real holdings:
  - FTA deposit → `HAS_BUSINESS_CHECKING`
  - `HAS_LOAN` → `HAS_BUSINESS_LOAN`
  - `HAS_LINE` → `HAS_LINE_OF_CREDIT`
  - `HAS_CARD` → `HAS_BUSINESS_CREDIT_CARD`

  The remaining flags are drawn at the Appendix A rates. **`EXISTING_PRODUCT_COUNT` is always the sum of the six flags.**
- **Years as customer:** `YEARS_AS_CUSTOMER = run_ts.year − FIRST_OPEN_DATE.year` when present, else generated. It's always ≤ `YEARS_IN_BUSINESS`.
- **Monthly drift:** continuous generated values get `jitter(…, month_rng)`. Categoricals and flags use `stable_rng` only.

- [ ] **Step 1: Write the failing tests.**
  - `test_anchor_values_copied_unclamped`: an anchor with revenue 120,000,000 and 900 employees round-trips exactly.
  - `test_null_anchor_still_complete` (Review Focus 1): revenue and employees both None → every NUMBER column is not None and ≥ 0 where the training minimum is ≥ 0.
  - `test_absurd_feed_falls_back` (Review Focus 3): `MONTHLY_CREDITS = 100 × revenue/12` gives a `MONTHLY_AVG_DEPOSITS` that is not equal to it and lies within `[0.05, 3] × revenue/12`. `DEPOSIT_BALANCE = 0` on a $20M firm is likewise replaced.
  - `test_real_feed_used_when_sane`: sane `MONTHLY_CREDITS`, `DEPOSIT_BALANCE` and `FOUNDED_YEAR = 2001` are used verbatim, and `YEARS_IN_BUSINESS == 25` at `run_ts = 2026-10-23`.
  - `test_product_count_equals_flags`: across all fixture business anchors, `EXISTING_PRODUCT_COUNT` equals the sum of the six flags.
  - `test_customer_tenure_le_business_age`: across all fixture business anchors, `YEARS_AS_CUSTOMER <= YEARS_IN_BUSINESS`.
  - `test_deposits_scale_with_revenue`: across 200 keys, the mean `MONTHLY_AVG_DEPOSITS` at $10M revenue is more than 10× the mean at $200K.
  - `test_idempotent_within_month_bounded_drift`: identical on 2026-10-01 and 2026-10-23. On 2026-11-01, categoricals and flags are identical and continuous generated values are within ±3%.
  - `test_vocab_and_columns`: keys equal the training columns minus the label, and every categorical is in its vocabulary.
- [ ] **Step 2:** Run `.venv/bin/pytest tests/test_business.py -v`. Expected: FAIL.
- [ ] **Step 3:** Implement `business_profile` and `business_input_row`.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(prodrec): business profile factory`.

### Task 3: Personal profile factory

**Files:** Create `procedures/prodrec/personal.py` and `tests/test_personal.py`.

**Interfaces:**
- Consumes: Task 1.
- Produces: `personal_profile(anchor: dict, feats: dict, run_ts: datetime, key: str | None = None) -> dict` with every `PERSONAL_TRAINING_COLUMNS` key except the label, and `personal_input_row(profile) -> dict`.
- `feats` keys, any of which may be None:
  - `DEPOSIT_BALANCE`, `DIRECT_DEPOSIT`, `MONTHLY_CREDITS`, `PRODUCT_COUNT`, `FIRST_OPEN_DATE`
  - `HAS_INVESTMENT`, `HAS_LOAN`, `HAS_CARD`
  - `IS_OWNER`, `MORTGAGE_BALANCE`, `PROPERTY_VALUE`
  - `LIFE_STAGE`, `INVESTMENT_PROPENSITY`, `FINANCIAL_STRESS`

Rules the tests pin:
- **Copied from the anchor, no clamp:**
  - `AGE` is whole years from `BIRTHDATE` to `run_ts`.
  - `ANNUAL_INCOME` and `CREDIT_SCORE` are copied.
  - When one is NULL it's generated: age by its training marginal; income conditioned on age; credit score around 675 with sd 60.
- **Home ownership:** `HOME_OWNERSHIP` is `Mortgage` if `IS_OWNER` and `MORTGAGE_BALANCE > 0`; `Own` if `IS_OWNER`; `Rent` if `IS_OWNER` is False. It's drawn from the training weights only when `IS_OWNER` is None. `HAS_MORTGAGE = 1` exactly when `HOME_OWNERSHIP == 'Mortgage'`.
- **Region:** `GEOGRAPHIC_REGION = map_region(anchor["STATE_CODE"], rng)`.
- **Total balance:** `TOTAL_ACCOUNT_BALANCE = DEPOSIT_BALANCE` (deposits only, never investments) when within `[0, 5] × income`, else generated from income.
- **Monthly deposits:** `MONTHLY_DEPOSIT_AMOUNT = DIRECT_DEPOSIT`, or else `MONTHLY_CREDITS`, when within `[0.05, 1.5] × income/12`, else generated at about `income/12 × U(0.25, 0.6)`.
- **Employment:** `EMPLOYMENT_STATUS` is never `Retired` under 50 and never `Student` over 35. It's `Retired` with probability ≥ 0.8 at 70+, and `Student` with probability ≥ 0.4 under 23. Claritas `LIFE_STAGE = 'Retirees'` raises the odds of `Retired`.
- **Education:** `EDUCATION_LEVEL` is never `Doctorate` or `Masters` under 22, and leans higher as income rises.
- **Risk tolerance:** `RISK_TOLERANCE` leans `Aggressive` as `INVESTMENT_PROPENSITY` rises and `Conservative` from age 65.
- **Debt-to-income:** `DEBT_TO_INCOME_RATIO` falls as credit score rises; a mortgage adds about 0.08. It's clamped to [0, 0.68].
- **Savings rate:** `SAVINGS_RATE_PCT` rises with `TOTAL_ACCOUNT_BALANCE / income`, within [0.1, 36.1].
- **Product holdings:** `EXISTING_PRODUCT_COUNT` = the sum of the six `HAS_*` flags. Real holdings seed `HAS_CHECKING` (deposit), `HAS_INVESTMENT_ACCOUNT`, `HAS_CREDIT_CARD` and `HAS_MORTGAGE`.
- **Years as customer:** `YEARS_AS_CUSTOMER ≤ max(0, AGE − 18)`.
- **Monthly drift:** the same rule as Task 2.

- [ ] **Step 1: Write the failing tests.**
  - `test_anchor_values_copied_unclamped`: income 2,400,000 and credit 842 round-trip exactly.
  - `test_null_anchor_still_complete` (Review Focus 1): birthdate, income and credit score all None → a complete row with no None.
  - `test_home_ownership_from_corelogic`: the three `IS_OWNER`/balance cases give the right value, and `HAS_MORTGAGE` agrees.
  - `test_absurd_feed_falls_back` (Review Focus 3): `DIRECT_DEPOSIT = 50 × income/12` is replaced.
  - `test_age_gates_employment`: across 500 keys each:
    - age 30 → 0 `Retired`;
    - age 45 → 0 `Student`;
    - age 75 → ≥ 80% `Retired`;
    - age 20 → ≥ 40% `Student`.
  - `test_dti_falls_with_credit`: mean DTI at credit 800 is lower than at credit 550, over 300 keys.
  - `test_tenure_le_adult_years`: `YEARS_AS_CUSTOMER <= AGE − 18` on every fixture person.
  - `test_product_count_equals_flags`
  - `test_idempotent_within_month_bounded_drift`
  - `test_vocab_and_columns`
- [ ] **Step 2:** Run `.venv/bin/pytest tests/test_personal.py -v`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(prodrec): personal profile factory`.

### Task 4: Label rules

**Files:** Create `procedures/prodrec/labels.py` and `tests/test_labels.py`.

**Interfaces:**
- Produces:
  - `business_scores(p: dict) -> dict[str, float]` and `personal_scores(p: dict) -> dict[str, float]`. Each returns every class in its product tuple, every score ≥ `BASE_SCORE = 0.05`.
  - `rule_label(scores) -> str`: the argmax, ties broken by tuple order.
  - `draw_label(scores, rng, noise: float = NOISE) -> str`: returns `rule_label` with probability `1 − noise`. Otherwise it makes a draw weighted by `scores`.
  - `NOISE = 0.2`, tuned in Task 8 so 70–80% of labels equal `rule_label`.
- Every class must be reachable as the argmax of some profile. The rules come from spec §5.5, and the scores lean mostly on subset columns.

- [ ] **Step 1: Write the failing tests.** Each starts from a neutral profile helper, `_neutral_business()` / `_neutral_personal()`. These are mid-range values where no rule fires strongly, written in the test file. Each rule test asserts `rule_label`:
  - **Business:**
    - High volatility with `HAS_LINE_OF_CREDIT = 0` → `Line_of_Credit`.
    - Revenue 80M with 6 locations → `Treasury_Services`.
    - `Food_Beverage` with `HAS_MERCHANT_SERVICES = 0` → `Merchant_Services`.
    - Operating balance at 40% of revenue with low volatility → `Money_Market` or `CDs`.
    - `Construction` with `REVENUE_GROWTH_YOY_PCT = 25` and `DSCR = 2.5` → `Commercial_Loans`.
    - `YEARS_IN_BUSINESS = 1` with product count 1 → `Credit_Cards` or `Business_Banking_Services`.
    - Revenue 30M with a large balance and `YEARS_AS_CUSTOMER ≥ 10` → `Wealth_Management` or `Brokerage_Advisory`.
    - `HAS_BUSINESS_SAVINGS = 0` with a positive net cash flow → `Savings` or `Deposits`.
  - **Personal:**
    - Rent with savings rate 25 → `Savings` or `CDs`.
    - Credit 780 with Mortgage and property equity → `HELOC`.
    - Rent, credit 760 and income 120K → `Residential_Loans`.
    - Credit 600 with DTI 0.5 → `Personal_Loans`.
    - Age 35, `Employed_FT` and `HAS_AUTO_LOAN = 0` → `Auto_Loans`.
    - `Aggressive` with balance 150K → `Brokerage_Advisory`.
    - Income 600K, age 58 → `Wealth_Management`.
    - Age 21 with product count 1 → `Credit_Cards`.
    - Balance 60K with low DTI → `Money_Market` or `Deposits`.
  - `test_every_class_reachable`: the union of the rule tests' outputs covers all 12 business classes and all 11 personal classes.
  - `test_draw_label_noise_rate`: over 5,000 draws on one profile with `noise = 0.2`, the share equal to `rule_label` lies in [0.78, 0.86].
- [ ] **Step 2:** Run `.venv/bin/pytest tests/test_labels.py -v`. Expected: FAIL.
- [ ] **Step 3:** Implement the score functions as additive terms per class, so they're easy to tune in Task 8.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(prodrec): rule-scored product labels`.

### Task 5: Training-set sampler and mix gate

**Files:** Create `procedures/prodrec/training.py` and `tests/test_training.py`.

**Interfaces:**
- Consumes:
  - `business_profile` / `personal_profile` (Tasks 2–3)
  - `business_scores` / `personal_scores`, `draw_label` (Task 4)
  - `vocab` column lists
- Produces:
  - `build_training_set(population: list[tuple[dict, dict]], side: Literal["business", "personal"], run_ts: datetime, size: int, floor: int = 100) -> list[dict]`
    - `population` holds (anchor, feats) pairs.
    - Rows have the full training columns. `ACCOUNTID` is `B-000001…` (business) or `P-000001…` (personal), and keys are assigned after a seeded shuffle so they don't encode the class.
  - `mix_problems(labels: list[str], max_share: float = 0.40, min_classes: int = 8, floor: int | None = None) -> list[str]` returns human-readable violations, or an empty list.
- Algorithm (fixed):
  1. Build a pool of `3 × size` candidates. Candidate `i` takes `population[rng.randrange(len)]` and the profile `key = f"{account_id}#T{i}"`. The rng is `stable_rng(f"pool|{run_ts:%Y-%m}", side + "_training")`.
  2. Label each candidate with `draw_label`.
  3. For each class, take `min(floor, available)` candidates in pool order.
  4. Fill the remaining slots from the leftover candidates in pool order. This keeps the population's natural mix above the floor.
  5. Shuffle, then assign keys.

- [ ] **Step 1: Write the failing tests.** Use fixture anchors × synthetic feats as the population.
  - `test_size_and_keys`: `len == size`, and the keys are exactly `B-000001…B-{size:06d}`.
  - `test_floor_lifts_rare_classes`: every class with ≥ `floor` pool candidates has ≥ `floor` rows.
  - `test_keys_not_sorted_by_class`: the first 100 rows hold ≥ 3 classes.
  - `test_deterministic_per_month`: equal on 2026-10-01 and 2026-10-23.
  - `test_columns`: every row's keys equal `*_TRAINING_COLUMNS`.
  - `test_mix_problems`: `["A"] * 50 + ["B"] * 50` → reports both "max share" and "classes", and a healthy 10-class mix → `[]`.
- [ ] **Step 2:** Run `.venv/bin/pytest tests/test_training.py -v`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(prodrec): stratified training sampler and mix gate`.

### Task 6: SP entry point — SQL, transactional replace, asserts

**Files:** Create `procedures/prodrec/sp_main.py` and `tests/test_sp_main.py`, which uses a `FakeSession` that records SQL and serves canned rows.

**Interfaces:**
- Consumes: everything above, plus `cumulus_common.coverage.assert_coverage`.
- Produces:
  - `main(session, mode: str = "INPUTS") -> str`, where mode ∈ {`INPUTS`, `TRAINING`, `ALL`}; anything else raises `ValueError`.
  - `BUSINESS_FEATURES_SQL` and `PERSONAL_FEATURES_SQL: str`
  - `dedupe_anchors(rows: list[dict]) -> list[dict]`
  - `replace_table(session, table: str, columns: tuple[str, ...], rows: list[dict]) -> int`
  - `assert_inputs(session) -> None`
  - `TASK_NAME = "TASK_MONTHLY_PRODUCT_RECOMMENDATION_INPUTS"`

**Feature SQL.** One query per side, one row per audience account, with every anchor column plus the `feats` keys from Tasks 2–3.

Business:

```sql
WITH aud AS (
  SELECT * FROM DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS
  WHERE ACCOUNT_TYPE_FLAG = 'BUSINESS' AND COALESCE(CLIENT_CATEGORY, '') <> 'Household' AND ACCOUNT_ID LIKE '001am%'
  QUALIFY ROW_NUMBER() OVER (PARTITION BY ACCOUNT_ID ORDER BY ANNUAL_REVENUE DESC NULLS LAST, EMPLOYEE_COUNT DESC NULLS LAST) = 1
),
fta AS (
  SELECT SFACCOUNTID AS ACCOUNT_ID,
         SUM(IFF(PRODUCT_KIND = 'deposit', BALANCE, 0)) AS DEPOSIT_BALANCE,
         COUNT(*) AS PRODUCT_COUNT, MIN(OPEN_DATE) AS FIRST_OPEN_DATE,
         MAX(IFF(FINANCIAL_ACCOUNT_TYPE = 'Loans' AND PRODUCT_KIND = 'loan', 1, 0)) AS HAS_LOAN,
         MAX(IFF(FINANCIAL_ACCOUNT_TYPE = 'Loans' AND PRODUCT_KIND = 'line', 1, 0)) AS HAS_LINE,
         MAX(IFF(FINANCIAL_ACCOUNT_TYPE = 'Credit Cards', 1, 0)) AS HAS_CARD,
         MAX(IFF(FINANCIAL_ACCOUNT_TYPE = 'Treasury Management', 1, 0)) AS HAS_TREASURY,
         MAX(IFF(FINANCIAL_ACCOUNT_TYPE = 'Investments', 1, 0)) AS HAS_INVESTMENT
  FROM DATA_JEDAIS.FINS__PUBLIC.FINANCIAL_TRANSACTION_ACCOUNTS
  WHERE COALESCE(ACTIVE, TRUE) GROUP BY 1
),
ftm AS (
  SELECT SFACCOUNTID AS ACCOUNT_ID, FLOOR(DATEDIFF(day, TRANSACTIONDATE, CURRENT_DATE()) / 30) AS b,
         SUM(IFF(TRANSACTION_TYPE = 'Credit', AMOUNT, 0)) AS cr, SUM(IFF(TRANSACTION_TYPE = 'Debit', AMOUNT, 0)) AS dr
  FROM DATA_JEDAIS.FINS__PUBLIC.FINANCIAL_TRANSACTIONS
  WHERE TRANSACTIONDATE >= DATEADD(day, -90, CURRENT_DATE()) GROUP BY 1, 2
),
ft AS (
  SELECT ACCOUNT_ID, AVG(cr) AS MONTHLY_CREDITS, AVG(cr - dr) AS MONTHLY_NET,
         STDDEV_POP(cr - dr) AS MONTHLY_NET_SD, COUNT(*) AS FEED_MONTHS
  FROM ftm WHERE b < 3 GROUP BY 1
),
zi AS (
  SELECT ACCOUNT_ID, MAX(FOUNDED_YEAR) AS FOUNDED_YEAR FROM DATA_JEDAIS.FINS__PUBLIC.ZOOMINFO_FIRMOGRAPHICS
  WHERE PROFILE_MONTH = (SELECT MAX(PROFILE_MONTH) FROM DATA_JEDAIS.FINS__PUBLIC.ZOOMINFO_FIRMOGRAPHICS) GROUP BY 1
)
SELECT aud.*, fta.* EXCLUDE (ACCOUNT_ID), ft.* EXCLUDE (ACCOUNT_ID), zi.FOUNDED_YEAR
FROM aud LEFT JOIN fta USING (ACCOUNT_ID) LEFT JOIN ft USING (ACCOUNT_ID) LEFT JOIN zi USING (ACCOUNT_ID)
```

Personal uses the same shape:
- `aud`: `ACCOUNT_TYPE_FLAG = 'PERSON'`, and the QUALIFY orders by `ANNUAL_INCOME DESC NULLS LAST`.
- `fta` adds `SUM(IFF(PRODUCT_KIND = 'deposit', DIRECT_DEPOSIT_AMOUNT, 0)) AS DIRECT_DEPOSIT`.
- `ft` keeps only `MONTHLY_CREDITS`.
- `cl`: CoreLogic at the latest `PROFILE_QUARTER`, giving `IS_OWNER`, `OUTSTANDING_MORTGAGE_BALANCE AS MORTGAGE_BALANCE` and `ESTIMATED_PROPERTY_VALUE AS PROPERTY_VALUE`.
- `cd`: Claritas at the latest `PROFILE_MONTH`, giving `LIFE_STAGE`, `INVESTMENT_PROPENSITY_SCORE AS INVESTMENT_PROPENSITY` and `FINANCIAL_STRESS_INDICATOR AS FINANCIAL_STRESS`.

Feed coverage on 2026-10-23 was:

| Feed | Business (of 5,725) | Personal (of 25,424) |
|---|---|---|
| FTA / FT | 1,917 | 15,921 |
| ZoomInfo | 5,708 | — |
| CoreLogic | — | 25,424 |
| Claritas | — | 25,424 |

**`main` flow:**
1. Read both feature queries → `dedupe_anchors`, a Python backstop on `ACCOUNT_ID` that keeps the first row.
2. For `INPUTS`/`ALL`:
   - Build input rows with the profile factories at `run_ts = utcnow()`.
   - If more than `max(10, n // 100)` rows fail, raise. This is the sibling project's tolerance.
   - `replace_table` both subsets, then `assert_inputs`.
3. For `TRAINING`/`ALL`:
   - Run `build_training_set` for each side (3,500 business, 7,500 personal).
   - Run `mix_problems(labels, floor=100)`. If it reports anything, raise `RuntimeError("label mix gate: …")` **before** writing.
   - Otherwise `replace_table` both training tables.
4. Always insert a `TASK_EXECUTION_LOG` row, using the same column list as the sibling project. `ROWS_INSERTED` is the total across all tables written.

**`replace_table`:**
1. `session.write_pandas(df, staging, database="DATA_JEDAIS", schema="FINS__PUBLIC", auto_create_table=True, overwrite=True)`, where `staging = table + "_STAGING"`.
2. `BEGIN`
3. `DELETE FROM <table>`
4. `INSERT INTO <table> (<columns>) SELECT <columns> FROM <staging>`
5. `COMMIT`
6. On any exception, `ROLLBACK` and re-raise.
7. Always `DROP TABLE IF EXISTS <staging>`.

**`assert_inputs`:**
- It calls `assert_coverage` twice, comparing the live audience recount against each subset's `COUNT(DISTINCT ACCOUNTID)`.
- It also raises `RuntimeError("coverage gap: …")` if any of these hold:
  - either subset has `COUNT(*) <> COUNT(DISTINCT ACCOUNTID)`;
  - the two subsets share any `ACCOUNTID`;
  - either has a key `NOT LIKE '001am%'`;
  - either has more rows than its audience.

- [ ] **Step 1: Write the failing tests** against a `FakeSession`, where `sql(q).collect()` returns canned rows keyed by substring and `write_pandas` records its DataFrame.
  - `test_dedupe_anchors` (Review Focus 4): two rows with the same `ACCOUNT_ID` and different revenue → exactly one survives.
  - `test_inputs_mode_replaces_both_subsets_in_transaction`: the recorded SQL order is `BEGIN`, `DELETE FROM …BUSINESS_PRODUCT_RECOMMENDATION_SUBSET`, `INSERT`, `COMMIT`, and the same for personal. The staging DataFrame columns equal the subset columns.
  - `test_insert_failure_rolls_back` (Review Focus 5): the fake raises on `INSERT` → `ROLLBACK` is issued, no `COMMIT`, the exception propagates, and the log row records `FAILED`.
  - `test_training_gate_blocks_write`: monkeypatch `draw_label` so it always returns one class → raises "label mix gate", and no `DELETE` reaches a training table.
  - `test_assert_inputs_overlap_raises`: the overlap query returns 1 → `RuntimeError` starting with "coverage gap:".
  - `test_bad_mode_raises`
  - `test_idempotent_rerun`: two `INPUTS` runs in the same month write identical DataFrames.
- [ ] **Step 2:** Run `.venv/bin/pytest tests/test_sp_main.py -v`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `.venv/bin/pytest -v`. Expected: all PASS.
- [ ] **Step 5: Commit:** `feat(prodrec): SP entry point with transactional replace and input asserts`.

### Task 7: Deploy script and task SQL

**Files:** Create `scripts/deploy_sp.py`, `procedures/sp_create_procedure.sql` (generated and committed), `tasks/task_monthly_product_recommendation_inputs.sql` and `tests/test_deploy_sp.py`.

**Interfaces:**
- Produces: `deploy_sp.build_sql() -> str`. `main()` takes the same CLI as the sibling project (`--connection`, `--no-deploy`).
  - It concatenates, in this order: inlined `seed_for` and `assert_coverage` (the sibling's `_extract_helper`), `common.py`, `vocab.py`, `business.py`, `personal.py`, `labels.py`, `training.py`, `sp_main.py`.
  - It strips each module's docstring, `from __future__`, `from cumulus_common…` and `from prodrec…` / `import prodrec…` lines, and hoists `from __future__ import annotations` to the top.
  - Header: `CREATE OR REPLACE PROCEDURE DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_PRODUCT_RECOMMENDATION_INPUTS(MODE STRING DEFAULT 'INPUTS') RETURNS STRING LANGUAGE PYTHON RUNTIME_VERSION = '3.11' PACKAGES = ('snowflake-snowpark-python', 'pandas') HANDLER = 'main' EXECUTE AS CALLER`
  - Before deploying, it asserts there is no bare `&` (spaced `" & "` is allowed).
- The task SQL is `CREATE OR REPLACE TASK …` with `WAREHOUSE = MAIN_WH_XS` and the schedule and wrapper call from Global Constraints. It ends with **no** `RESUME`; a comment says Task 10 resumes it.

- [ ] **Step 1: Write the failing tests.**
  - `test_build_sql_compiles_and_runs`: take the text between the `$$` markers. `compile()` it, then `exec` it into a fresh namespace. Assert `callable(ns["main"])`. Then call `ns["business_profile"]` on one fixture anchor at 2026-10-23 and assert it equals the module-imported `business_profile`. This catches name collisions between modules.
  - `test_no_unescaped_ampersand`
  - `test_no_intra_package_imports_left`: neither `prodrec` nor `cumulus_common` appears in the body.
- [ ] **Step 2:** Run `.venv/bin/pytest tests/test_deploy_sp.py -v`. Expected: FAIL.
- [ ] **Step 3:** Implement. Run `python scripts/deploy_sp.py --no-deploy` to generate the SQL, and write the task SQL file.
- [ ] **Step 4:** Run `.venv/bin/pytest -v`. Expected: all PASS.
- [ ] **Step 5: Commit:** `feat(prodrec): deploy script, generated procedure, suspended monthly task`.

### Task 8: Live calibration (read-only)

**Files:** Create `scripts/calibrate.py` and `output/calibration.md`. Modify the tuning constants only: `labels.py` (`NOISE` and the per-class weights) and `business.py` (`VOL_LOW_MAX`, `VOL_MED_MAX`).

**Interfaces:**
- Consumes: `BUSINESS_FEATURES_SQL` / `PERSONAL_FEATURES_SQL`, the profile factories, `build_training_set` and `mix_problems`.
- `calibrate.py`:
  - It runs both feature queries through `snow sql -c SFDC_DC_TECH_ARCH --format json`, caching to the gitignored `output/calibration_pool.json` (`--refresh` re-pulls). It writes nothing to Snowflake.
  - It builds:
    - (a) the input rows for every audience account;
    - (b) both training sets at `run_ts = now`;
    - (c) labels for the input population, using `rule_label`, as a proxy for what a retrained model will predict.
  - It prints:
    - row counts and overlap;
    - the training class mix;
    - the input-population argmax mix;
    - the rule-consistency share;
    - `CASH_FLOW_VOLATILITY` and `HOME_OWNERSHIP` mixes;
    - min / median / max for each numeric subset column, input versus training;
    - feed-fallback rates (how often each real value was rejected).

- [ ] **Step 1:** Implement `calibrate.py`, then run `.venv/bin/python scripts/calibrate.py`.
- [ ] **Step 2: Tune until every gate passes.** For each side:
  - The training mix has no class above 40% and at least 8 classes, with every class at ≥ 100 rows **or** listed in `calibration.md` as structurally rare, with the reason. Example: Treasury_Services if fewer than 100 audience firms qualify. In that case lower `floor` to the available count for that class only, and record it.
  - The input-population argmax mix passes the same 40% / 8-class gate.
  - Rule-consistency on the training labels lies in [0.70, 0.80].
  - Business volatility mix lies within ±10 points of the training's 50/32/18 (High/Medium/Low).
  - Each real-feed fallback rate is below 25%. If one is above that, widen the window and record why.
- [ ] **Step 3:** Run `.venv/bin/pytest -v` again, since tuning must not break the Task 4 rule tests. Expected: all PASS.
- [ ] **Step 4:** Record the final printout in `output/calibration.md`, then commit with `chore(prodrec): calibrate label weights and volatility cut-offs against live population`.

### Task 9: Deploy, back up, build the training sets (live) — then hand off

**Files:** Create `output/l3-smoke.md`.

- [ ] **Step 1: Back up all four tables (zero-copy):**
  ```
  snow sql -c SFDC_DC_TECH_ARCH -q "CREATE TABLE DATA_JEDAIS.FINS__PUBLIC.<T>_BAK_20261023 CLONE DATA_JEDAIS.FINS__PUBLIC.<T>"
  ```
  Run it for each of the four table names.

  Expected: 4 × "successfully created".
- [ ] **Step 2: Deploy the procedure and task.** Run `python scripts/deploy_sp.py -c SFDC_DC_TECH_ARCH`, then `snow sql -c SFDC_DC_TECH_ARCH -f tasks/task_monthly_product_recommendation_inputs.sql`.

  Expected: `SHOW PROCEDURES LIKE 'SP_GENERATE_PRODUCT_RECOMMENDATION_INPUTS'` returns 1 row, and `SHOW TASKS LIKE 'TASK_MONTHLY_PRODUCT_RECOMMENDATION_INPUTS'` shows state `suspended`.
- [ ] **Step 3: Build the training sets.** Run `CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_PRODUCT_RECOMMENDATION_INPUTS('TRAINING')`.

  Expected: `…: SUCCEEDED rows=11000`. Then verify:
  - the row counts are 3,500 and 7,500;
  - the class mix (`GROUP BY RECOMMENDED_PRODUCT`) matches `calibration.md`;
  - `COUNT(*) WHERE ACCOUNTID NOT LIKE 'B-%'` (or `'P-%'`) is 0.
- [ ] **Step 4: Check that Data Cloud sees the new training rows** (zero-copy, so no refresh is needed):
  ```
  sf api request rest "/services/data/v67.0/ssot/query-sql" --method POST --body '{"sql":"SELECT recommended_product__c, COUNT(*) FROM BT_Business_Product_Recommendations__dlm GROUP BY 1"}' -o jdo-oe0sdd
  ```
  Expected: the counts match Step 3.

  If the endpoint shape differs, check the `dc-connect-api` skill's spec. Never print access tokens or frontdoor URLs.
- [ ] **Step 5:** Record the results in `output/l3-smoke.md`. Commit with `chore(prodrec): deploy SP and task, rebuild training sets`, then push the branch.
- [ ] **Step 6: HUMAN GATE.** Tell the user the training sets have landed (with the class mix), and that the inputs task is deployed but suspended. Ask them to retrain and redeploy both Data Cloud models. **Stop here until the user confirms the models are redeployed.**

### Task 10: Build the inputs (live), verify inference, go live, document

**Files:**
- Create: `README.md` and `AGENTS.md` (the sibling project's shape: audience, salts, cadence, gotchas, including the duplicate-anchor QUALIFY and the transactional replace).
- Modify: `output/l3-smoke.md`, and `React-Headless/docs/SNOWFLAKE_DATA_FIXES.md` §1.

- [ ] **Step 1: Build the inputs.** Run `CALL …SP_GENERATE_PRODUCT_RECOMMENDATION_INPUTS('INPUTS')`.

  Expected: `SUCCEEDED`. The business subset row count equals the live business audience (about 5,725), and the personal subset equals the personal audience (about 25,424). Overlap = 0, and keys not like `001am%` = 0.
- [ ] **Step 2: Check the inputs in Data Cloud.**
  - `BUSINESS_PRODUCT_RECOMMENDATION_INPU__dlm` and `PERSONAL_PRODUCT_RECOMMENDATION_INPU__dlm` have the same counts as Step 1.
  - Joining each to `ssot__Account__dlm` on `KQ_accountid__c = ssot__Id__c` matches 100% of rows.
- [ ] **Step 3: Check the predicted mix.** After the user runs inference, or with their pointer to the prediction output DMO: query the predicted-product mix per side.

  Expected: no class above 40%, and at least 8 classes. Record it in `l3-smoke.md`. If it fails, report it to the user with the mix and don't resume the task.
- [ ] **Step 4: Resume the task.** Run `ALTER TASK DATA_JEDAIS.FINS__PUBLIC.TASK_MONTHLY_PRODUCT_RECOMMENDATION_INPUTS RESUME`.

  Expected: `SHOW TASKS` reports `started`.
- [ ] **Step 5: Document.**
  - Write `README.md` and `AGENTS.md`.
  - Update `SNOWFLAKE_DATA_FIXES.md` §1:
    - item 1 (re-key) is done, with the counts;
    - item 2 ("personal output table") is superseded by Data Cloud inference;
    - item 3 now notes that inputs are real-keyed.
- [ ] **Step 6: Commit and open the PR.**
  - Commit with `docs(prodrec): README, AGENTS, data-fixes §1 done`.
  - Push, then run `gh pr create --base main` with a summary, the calibration numbers and the smoke results.
  - The PR body ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
  - If the push returns 403, run `gh auth switch --user josers18`.
  - The `SNOWFLAKE_DATA_FIXES.md` edit lives in React-Headless, which is in the same JDO repo, so it rides in this PR.
