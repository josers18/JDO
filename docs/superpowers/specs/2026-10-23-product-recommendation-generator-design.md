# Product recommendation generator — design

Date: 2026-10-23 · Status: draft for review · Snowflake account `SFDC_DC_TECH_ARCH`,
schema `DATA_JEDAIS.FINS__PUBLIC` · Data Cloud org `jdo-oe0sdd`

## 1. Intent

Two multiclass prediction models run in Data Cloud: one recommends the next business product and the
other the next personal product. Each one reads a Snowflake **input** table (`_SUBSET`) through a
zero-copy stream and predicts a product. The React cockpits will show those predictions to bankers.

Today none of this reaches a real customer:

- The input tables are copies of the training rows. 3,499 of 4,240 business rows and 7,499 of 8,240
  personal rows carry synthetic `B-`/`P-` keys. The other 741 keys are the same in **both** tables
  (159 local `001am`, the rest other-org Ids or hashes), so one "account" is scored as a business and
  as a person.
- The training sets are a small-business, mass-market population that was generated without any link
  to the org's accounts. Their industry codes don't match the account record.

This project builds a Snowflake generator, in the same pattern as the 13 Cumulus generators. It reads
the real account roster and writes inputs for every real customer. The values must be:

- **consistent**: wherever the account record or another feed already knows a value (revenue,
  employees, income, credit score, age, balances, home ownership), the input uses it, so a banker
  never sees a prediction built on numbers that contradict the account page;
- **realistic**: the variables hang together (deposits scale with revenue, debt-to-income tracks
  credit score), and the models' predictions spread across a believable product mix.

Both matter to the user equally. The user will **retrain and redeploy both models in Data Cloud**
once new training sets land.

## 2. Goals, non-goals, anti-goals

**Goals**
1. `BUSINESS_PRODUCT_RECOMMENDATION_SUBSET` holds one row per real local business customer, and
   `PERSONAL_PRODUCT_RECOMMENDATION_SUBSET` one row per real local person account. No account is in both.
2. New training sets (`BUSINESS_PRODUCT_RECOMMENDATION_SET`, `PERSONAL_PRODUCT_RECOMMENDATION_TRAINING_SET`)
   drawn from the same population, with all variables plus a rule-derived `recommended_product`
   label, so the retrained models learn signals that exist in the real inputs.
3. Monthly refresh, idempotent within a month, plus a coverage check, like the sibling generators.
4. The Data Cloud side doesn't change: same table names, same column names and types. The three
   streams and their mappings (verified 2026-10-23) keep working.

**Non-goals**
- Generating predictions in Snowflake. Prediction belongs to the Data Cloud models.
- Building or changing the Data Cloud models, or the inference output DMO. The user owns retraining.
- The cockpit card that shows predictions. That's a separate React-Headless change, after inference runs.
- Fixing `V_ACCOUNT_ANCHORS` or the upstream birthdate backfill.

**Anti-goals (failure even if it "works")**
- Inputs that contradict the account record: revenue, employees, income, credit score or age that
  differ from `V_ACCOUNT_ANCHORS`.
- Predictions that collapse onto one or two products.
- A Household group record, or an account of the wrong type, scored as a customer.
- Labels that are random noise, so the retrained model learns nothing the banker can explain.

## 3. What exists today (probed 2026-10-23)

| Table | Rows | Columns |
|---|---|---|
| `BUSINESS_PRODUCT_RECOMMENDATION_SET` (training) | 3,500 | 31 variables + `RECOMMENDED_PRODUCT` (12 classes) |
| `BUSINESS_PRODUCT_RECOMMENDATION_SUBSET` (input) | 4,240 | `ACCOUNTID` + 12 variables |
| `PERSONAL_PRODUCT_RECOMMENDATION_TRAINING_SET` (training) | 7,500 | 32 variables + `RECOMMENDED_PRODUCT` (11 classes) |
| `PERSONAL_PRODUCT_RECOMMENDATION_SUBSET` (input) | 8,240 | `ACCOUNTID` + 12 variables |

**Business input variables:** `INDUSTRY, EXISTING_PRODUCT_COUNT, PROFIT_MARGIN_PCT, ANNUAL_REVENUE,
YEARS_IN_BUSINESS, NUMBER_OF_EMPLOYEES, OPERATING_ACCOUNT_BALANCE, MONTHLY_AVG_DEPOSITS,
NET_MONTHLY_CASH_FLOW, YEARS_AS_CUSTOMER, CASH_FLOW_VOLATILITY, NUMBER_OF_LOCATIONS`.

**Personal input variables:** `ANNUAL_INCOME, EXISTING_PRODUCT_COUNT, TOTAL_ACCOUNT_BALANCE, CREDIT_SCORE,
AGE, DEBT_TO_INCOME_RATIO, RISK_TOLERANCE, EMPLOYMENT_STATUS, HOME_OWNERSHIP, MONTHLY_DEPOSIT_AMOUNT,
SAVINGS_RATE_PCT, EDUCATION_LEVEL`.

The full training profiles (ranges, means, category mixes, class counts) are in Appendix A. Category
vocabularies use underscores (`Food_Beverage`, `Employed_FT`, `High_School`), and the generator must
emit exactly these values.

**Data Cloud wiring (unchanged by this project):**

| Stream | DMO |
|---|---|
| `BT_Business_Product_Recommendations` | `BT_Business_Product_Recommendations__dlm` (36 fields) |
| `BT_Business_Product_Recommendations_Inpu` | `BUSINESS_PRODUCT_RECOMMENDATION_INPU__dlm` |
| `BT_Personal_Product_Recommendations` | `PERSONAL_PRODUCT_RECOMMENDATION_INPU__dlm` |

The streams add `KQ_accountid`, `DataSource`, `DataSourceObject` and `InternalOrganization`. The
generator doesn't write those. The training streams are zero-copy, so a rewrite shows up without a
refresh. Confirm that during the smoke test.

## 4. Audience

Read `DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS` (today's `MASTER_ACCOUNTS` snapshot joined to the
`FINSDC3_DATASHARE` account DMO). Use `SELECT DISTINCT`, because `MASTER_ACCOUNTS` has duplicate Ids.

| Table | Predicate | Size today |
|---|---|---|
| Personal | `ACCOUNT_TYPE_FLAG = 'PERSON'` | 25,424 (all local `001am`) |
| Business | `ACCOUNT_TYPE_FLAG = 'BUSINESS' AND COALESCE(CLIENT_CATEGORY,'') <> 'Household' AND ACCOUNT_ID LIKE '001am%'` | 5,725 |

- **Households:** 5,090 BUSINESS-flagged rows are FSC Household group accounts. 5,064 of them have
  industry `Personal`. They aren't customers and get excluded.
- **Non-local Ids:** 701 BUSINESS rows carry other-org or hash Ids and get excluded (the `001am%` predicate).
- **Overlap:** an account appears in at most one table. Because the flag is exclusive, this holds by
  construction, but assert it anyway.

The business audience's `CLIENT_CATEGORY` is Small Business 4,656, Commercial Banking 960, then small
tier buckets (Silver / Gold / Bronze / Platinum / blank).

## 5. How values are produced

### 5.1 Precedence

For every variable the generator uses the first available source:

1. **The account record** (`V_ACCOUNT_ANCHORS`), taken as-is.
2. **Another real feed** in `FINS__PUBLIC` keyed to the same account.
3. **Generated**: conditioned on the values from 1 and 2 using the rules in §5.3, with a
   deterministic per-account seed.

A generated value must never contradict a value from a higher source.

### 5.2 Source map

**Business**

| Variable | Source |
|---|---|
| `ANNUAL_REVENUE` | anchor `ANNUAL_REVENUE` (present on most of the audience); generate from the employee count when missing |
| `NUMBER_OF_EMPLOYEES` | anchor `EMPLOYEE_COUNT`; generate from revenue when missing |
| `INDUSTRY` | anchor `INDUSTRY`, mapped to the 14 training codes by a crosswalk (§5.4) |
| `YEARS_IN_BUSINESS` | ZoomInfo `FOUNDED_YEAR` (current-year − founded) if present, else generated |
| `OPERATING_ACCOUNT_BALANCE`, `MONTHLY_AVG_DEPOSITS` | `FINANCIAL_TRANSACTION_ACCOUNTS` deposit balances on `SFACCOUNTID` (covers 1,917 business accounts) and `ACCOUNT_DAILY_BALANCE`; else generated from revenue |
| `NET_MONTHLY_CASH_FLOW`, `CASH_FLOW_VOLATILITY` | derived from 90-day `FINANCIAL_TRANSACTIONS` credits − debits and their monthly spread where present; else generated |
| `EXISTING_PRODUCT_COUNT` | distinct `FINANCIAL_ACCOUNT_TYPE` / `PRODUCT_KIND` in `FINANCIAL_TRANSACTION_ACCOUNTS`; else generated |
| `YEARS_AS_CUSTOMER` | earliest `OPEN_DATE` in `FINANCIAL_TRANSACTION_ACCOUNTS`; else generated, and never more than `YEARS_IN_BUSINESS` |
| `PROFIT_MARGIN_PCT`, `NUMBER_OF_LOCATIONS` | generated (industry- and size-conditioned) |

**Personal**

| Variable | Source |
|---|---|
| `AGE` | anchor `BIRTHDATE` |
| `ANNUAL_INCOME`, `CREDIT_SCORE` | anchor (present on all 25,424) |
| `HOME_OWNERSHIP` | CoreLogic latest quarter: `IS_OWNER` with mortgage balance > 0 → `Mortgage`; owner without one → `Own`; else `Rent` |
| `TOTAL_ACCOUNT_BALANCE`, `MONTHLY_DEPOSIT_AMOUNT`, `EXISTING_PRODUCT_COUNT` | `FINANCIAL_TRANSACTION_ACCOUNTS` (covers 15,921 person accounts: balances, `DIRECT_DEPOSIT_AMOUNT`, distinct product kinds); else generated from income |
| `EDUCATION_LEVEL`, `EMPLOYMENT_STATUS` | generated, conditioned on age (Retired mostly 62+, Student mostly under 25) and income; Claritas `LIFE_STAGE` can steer it |
| `RISK_TOLERANCE` | generated, conditioned on age and Claritas `INVESTMENT_PROPENSITY_SCORE` |
| `DEBT_TO_INCOME_RATIO` | generated, falling as credit score rises; CoreLogic mortgage balance pushes it up |
| `SAVINGS_RATE_PCT` | generated from balance relative to income |

**Builder must verify** each feed's key, latest snapshot, and coverage before relying on it. The
coverage numbers above were spot checks (a ZoomInfo/CoreLogic coverage query errored during probing).
Real-feed values that are clearly broken (negative balances where none make sense, `CREDIT_SCORE`
outside 300–850) drop to the next source.

### 5.3 Realism rules

- Generated variables follow the training set's marginal distributions (Appendix A), shifted by the
  account's known values. One way to do this: draw from the training set's empirical quantiles,
  conditioned on the account's size band (revenue or income decile). The exact method is the
  builder's choice.
- Cross-variable relationships hold:
  - deposits and operating balance scale with revenue;
  - monthly deposits scale with income;
  - `EXISTING_PRODUCT_COUNT` agrees with the product flags in the training rows (§5.5);
  - `YEARS_AS_CUSTOMER` ≤ `YEARS_IN_BUSINESS`, and ≤ age − 18 for people.
- **Out-of-range anchors are kept, not clamped.** About 5% of businesses exceed the training maximums
  ($50M revenue, 370 employees), as do about 1% of people on income and about 5% on credit score
  (training covers 449–796). The input keeps the real value (consistency), and the new training sets
  cover that range because they're drawn from the same population (§5.5).
- Seeds: `seed_for(account_id, salt, run_ts)` from `cumulus_common`, with salts
  `product_rec_business` and `product_rec_personal`. A re-run in the same month gives the same rows.
  Month-to-month drift on generated values stays small (most values move a few percent); a value from
  the account record or a real feed moves only when the source moves.

### 5.4 Industry crosswalk

The anchor industry labels (`Restaurant`, `Retail Trade`, `Wholesale`, `Wholesale Distribution`,
`Healthcare Systems`, `Professional Services Mid-Market`, `Real Estate Holdings`, `Logistics`, …)
map onto the 14 training codes: `Technology, Retail, Healthcare, Professional_Services,
Manufacturing, Construction, Food_Beverage, Real_Estate, Financial_Services, Transportation,
Energy, Hospitality, Education, Agriculture`.

- The builder writes the crosswalk as a small table or dict covering every live label. Examples:
  `Restaurant` → `Food_Beverage`, `Wholesale` → `Retail`, `Logistics` → `Transportation`.
- Unknown, blank or null labels get a seeded pick weighted by the training mix.
- Re-probe the live labels at build time; the list above is the top 20.

### 5.5 Training sets

Each training set is a fresh sample from the same population, built with the same generator code:

- **Size:** keep the current sizes (3,500 business, 7,500 personal) unless the builder finds the
  rarer classes too thin. Treasury_Services (9) and Wealth_Management (7 business, 19 personal) are
  already thin today; aim for at least ~100 rows per class.
- **Keys:** synthetic keys (`B-000001` / `P-000001`) are fine. Training tables are never read by the
  UI (`SNOWFLAKE_DATA_FIXES.md` ML rule). Each row is built from a real account's anchor profile
  (sampled with replacement, plus seeded jitter on generated fields), so the training population
  matches the input population.
- **Columns:** all current columns, same names and types, including the variables that aren't in the
  subset (`BUSINESS_STRUCTURE`, `HAS_*` flags, `REVENUE_GROWTH_YOY_PCT`, `MARITAL_STATUS`,
  `RECENT_LIFE_EVENT`, …), generated consistently with the subset variables.
- **Labels (`RECOMMENDED_PRODUCT`):** scored banking rules plus noise. Each class gets a score from the
  row's variables; the label is a seeded draw weighted by the scores, so the decision is
  probabilistic and not a hard threshold (aim for roughly 70–80% "rule-consistent" labels). The rules
  lean mainly on the **subset** variables, so the retrained model's important features stay close to
  today's subset. Illustrative rules (the builder finalizes them):
  - *Business:* high `CASH_FLOW_VOLATILITY` with no line of credit → `Line_of_Credit`; revenue ≥ $50M
    or many locations → `Treasury_Services`; Retail / Food_Beverage / Hospitality without merchant
    services → `Merchant_Services`; a large idle operating balance → `Money_Market` / `CDs`; growing
    Construction / Manufacturing / Real_Estate with a solid coverage ratio → `Commercial_Loans`; a
    young business with a low product count → `Credit_Cards` / `Business_Banking_Services`.
  - *Personal:* a renter with a high savings rate → `Savings` / `CDs`; prime credit and a mortgage
    with equity → `HELOC`; renting, prime credit, income ≥ ~$80K → `Residential_Loans`; mid credit
    and high DTI → `Personal_Loans`; no auto loan, age 22–60, employed → `Auto_Loans`;
    `Aggressive` risk with a high balance → `Brokerage_Advisory`; very high income or balance,
    age 50+ → `Wealth_Management`; thin file, young → `Credit_Cards`.
- **Class mix target:** roughly today's mix, with the rare classes lifted to at least ~100. Report the
  final mix in the build notes.

## 6. Snowflake objects and runtime

- **Project:** new sister-project `JDO/Snowflake_Product_Recommendations/`, laid out like
  `Snowflake_DnB_BusinessCredit` (`procedures/`, `schemas/`, `tasks/`, `scripts/deploy_sp.py`,
  `tests/`, `README.md`, `AGENTS.md`).
- **Procedure:** one Snowpark Python SP, `DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_PRODUCT_RECOMMENDATION_INPUTS(MODE STRING DEFAULT 'INPUTS')`.
  - `'INPUTS'`: rebuilds both `_SUBSET` tables.
  - `'TRAINING'`: rebuilds both training sets.
  - `'ALL'`: does both.
  - It's a single SP with no inter-SP imports, with the `cumulus_common` helpers inlined, because
    Snowpark can't import between SPs without a stage.
- **Writes:** the tables have no `PROFILE_MONTH` column and DC reads them as current-state snapshots,
  so each run **replaces** the table contents in one transaction (`DELETE` + `INSERT` from a staging
  table; never a swap). It doesn't MERGE month rows. Keep the column names, types and order exactly.
  - Don't add columns. `ORG_ID` is the sibling convention, but adding it changes the DLO schema and
    breaks the existing mappings. Note it in the build notes as deferred.
- **Coverage check:** after the input rebuild, assert the business row count = the business audience
  and the personal row count = the personal audience, with zero overlap and zero non-`001am` keys.
  Reuse the `coverage gap:` message prefix.
- **Task:** `TASK_MONTHLY_PRODUCT_RECOMMENDATION_INPUTS` runs `'INPUTS'` on the 2nd of the month at
  04:00 America/New_York (after the 1st-of-month siblings that feed it), through `SP_RETRY_WRAPPER` with
  retries=2, on warehouse `MAIN_WH_XS`. The training sets are rebuilt **only on demand**, so they don't
  shift under a deployed model.
- **Deploy:** `snow sql -c SFDC_DC_TECH_ARCH -f …`. The default `GSB13421_jwt` connection points at
  the retired account. Before the first run, back up the four current tables as
  `<NAME>_BAK_20261023` (zero-copy clone).

## 7. Rollout

1. Build and test locally (unit tests for the row factory, crosswalk, label rules and the overlap
   assertion).
2. Clone backups → run `'TRAINING'` → check the class mix and the range coverage against the input
   population.
3. **The user retrains and redeploys both models in Data Cloud on the new training sets.**
4. Run `'INPUTS'` → confirm in Data Cloud that `BUSINESS_PRODUCT_RECOMMENDATION_INPU__dlm` ≈ 5,725
   rows and `PERSONAL_PRODUCT_RECOMMENDATION_INPU__dlm` ≈ 25,424 rows, all joining
   `ssot__Account__dlm`, and that every DLO joins `ssot__Account__dlm.ssot__Id__c` in the right
   banker's book.
5. Run inference → check the predicted product mix isn't collapsed: no class above ~40%, at least
   8 classes present on each side.
6. Resume the task. Update `React-Headless/docs/SNOWFLAKE_DATA_FIXES.md` §1 (done, with numbers).
   The cockpit card is a follow-up.

## 8. Calls I made (flag any you disagree with)

- The input tables are rebuilt as current-state snapshots rather than monthly history, and `ORG_ID`
  isn't added, so the DC mappings stay untouched.
- Training sets are rebuilt only on demand; the monthly task refreshes inputs only.
- Out-of-range real values are kept in the inputs rather than clamped; the new training sets cover them.
- Household group records and non-local Ids are excluded from the business audience.
- Rare classes are lifted to at least ~100 training rows.
- The project is a new sister-project, `Snowflake_Product_Recommendations`, with one SP and three modes.

## 9. Settled after review (2026-10-23)

A builder read this document cold. Their questions are answered here, either from live Snowflake
probes or as my calls.

- **Exact schemas:** captured from `DESCRIBE TABLE` and pinned in the plan (Task 1). The training
  tables have 30 business variables (§3 says 31, which was a miscount) and 32 personal variables.
- **Class mix versus gate:** the gate wins. Each training set and the predicted mix must have no
  class above 40% and at least 8 classes. "Roughly today's mix" is a soft aim. The 70–80%
  rule-consistency is a calibration target, tuned once against the live population (plan Task 8).
  It isn't a hard assertion.
- **Drift:** `seed_for` is used unchanged. Base values and categoricals come from a
  month-independent seed (fixed `run_ts`). A second, month-keyed seed adds at most ±3% jitter to
  continuous generated values. No state table is needed.
- **Write mechanics:** staging table, then `BEGIN` / `DELETE` / `INSERT … SELECT` / `COMMIT`, with
  `ROLLBACK` on error. Never swap or `CREATE OR REPLACE` a table Data Cloud reads.
- **Training-only variables** (structure, credit score, growth, marital status, life event, …):
  generated from the training marginals, consistent with the subset variables. One exception:
  `GEOGRAPHIC_REGION` comes from the anchor `STATE_CODE`.
- **Audience:** the `001am` prefix is a constant for this org. `ACCOUNT_TYPE_FLAG` holds only
  PERSON (25,424) and BUSINESS (11,516). Coverage is checked against a live recount, not a fixed
  number. Duplicate anchor rows are collapsed with `QUALIFY ROW_NUMBER()`, because
  `SELECT DISTINCT *` doesn't collapse duplicates whose values differ.
- **Feed aggregation:**
  - Balances use active deposit accounts only.
  - Cash flow is the last 90 days from `CURRENT_DATE`, in three 30-day buckets.
  - A real value outside a sanity window relative to revenue or income is rejected and replaced by
    a generated one.
  - Coverage: ZoomInfo and D&B 5,708 of 5,725 businesses; FTA 1,917 businesses and 15,921 people;
    CoreLogic and Claritas all 25,424 people.
- **Runtime:** `SP_RETRY_WRAPPER(VARCHAR, NUMBER)`, `MAIN_WH_XS` and `TASK_EXECUTION_LOG` all exist.
  The role is SYSADMIN. The live sibling tasks run at 03:xx America/New_York on the 1st, so this
  task runs `0 4 2 * * America/New_York`.
- **Rollout gate:** the task is created suspended. `TRAINING` runs first. Inputs are built and the
  task is resumed only after the user confirms both models are retrained.

## Appendix A — current training profiles (2026-10-23)

**Business (`BUSINESS_PRODUCT_RECOMMENDATION_SET`, 3,500 rows)**

| Variable | min | mean | sd | max |
|---|---|---|---|---|
| ANNUAL_REVENUE | 50,000 | 1,288,538 | 2,582,624 | 50,000,000 |
| NUMBER_OF_EMPLOYEES | 1 | 15.0 | 21.8 | 370 |
| YEARS_IN_BUSINESS | 1 | 7.8 | 8.2 | 68 |
| MONTHLY_AVG_DEPOSITS | 2,000 | 50,267 | 67,854 | 1,524,169 |
| NET_MONTHLY_CASH_FLOW | −86,309 | 2,432 | 11,322 | 176,698 |
| OPERATING_ACCOUNT_BALANCE | 5,500 | 185,819 | 273,971 | 4,600,073 |
| NUMBER_OF_LOCATIONS | 1 | 1.34 | 0.89 | 8 |
| BUSINESS_CREDIT_SCORE | 74 | 97.4 | 4.6 | 100 |
| DEBT_TO_REVENUE_RATIO | 0.01 | 0.23 | 0.13 | 0.69 |
| PAYROLL_BURDEN_PCT | 5.0 | 35.1 | 12.2 | 75.0 |
| EXISTING_PRODUCT_COUNT | 0 | 2.83 | 1.08 | 6 |
| YEARS_AS_CUSTOMER | 0 | 2.6 | 2.9 | 32 |
| REVENUE_GROWTH_YOY_PCT | −30.0 | 8.2 | 14.7 | 57.0 |
| PROFIT_MARGIN_PCT | −15.0 | 11.8 | 9.9 | 40.5 |
| AVG_RECEIVABLES_DAYS | 5 | 35.0 | 14.9 | 84 |
| DEBT_SERVICE_COVERAGE_RATIO | 0.50 | 1.80 | 0.58 | 3.79 |
| MONTHLY_WIRE_TRANSFER_COUNT | 0 | 4.6 | 2.7 | 19 |
| ACH_TRANSACTIONS_PER_EMPLOYEE | 0.5 | 3.55 | 1.48 | 9.1 |

Flag rates: checking 0.89, savings 0.55, credit card 0.60, loan 0.28, line of credit 0.24, merchant
services 0.27, international 0.09, seasonal 0.24.

- **Industry:** Technology 422, Retail 376, Healthcare 337, Professional_Services 337,
  Manufacturing 302, Construction 292, Food_Beverage 259, Real_Estate 209, Financial_Services 196,
  Transportation 176, Energy 157, Hospitality 154, Education 145, Agriculture 138.
- **Structure:** LLC 1,102, S_Corp 676, Sole_Proprietorship 526, C_Corp 505, Partnership 417,
  Nonprofit 274.
- **Cash-flow volatility:** High 1,757, Medium 1,105, Low 638.
- **Digital banking:** Medium 1,611, High 1,199, Low 690.
- **Labels:** Credit_Cards 853, Line_of_Credit 827, Savings 555, Deposits 313, Commercial_Loans 271,
  Merchant_Services 255, Money_Market 200, CDs 101, Business_Banking_Services 79,
  Brokerage_Advisory 30, Treasury_Services 9, Wealth_Management 7.

**Personal (`PERSONAL_PRODUCT_RECOMMENDATION_TRAINING_SET`, 7,500 rows)**

| Variable | min | mean | sd | max |
|---|---|---|---|---|
| AGE | 18 | 44.6 | 14.5 | 85 |
| ANNUAL_INCOME | 15,000 | 55,829 | 47,825 | 750,000 |
| CREDIT_SCORE | 449 | 614 | 48 | 796 |
| YEARS_AT_CURRENT_JOB | 0 | 3.0 | 4.3 | 37 |
| NUMBER_OF_DEPENDENTS | 0 | 1.56 | 1.32 | 4 |
| TOTAL_ACCOUNT_BALANCE | 624 | 25,936 | 28,685 | 431,445 |
| MONTHLY_TRANSACTION_COUNT | 3 | 24.0 | 6.4 | 47 |
| AVG_TRANSACTION_AMOUNT | 10 | 147 | 190 | 2,817 |
| MONTHLY_DEPOSIT_AMOUNT | 100 | 1,864 | 1,696 | 36,289 |
| DEBT_TO_INCOME_RATIO | 0.00 | 0.23 | 0.13 | 0.68 |
| EXISTING_PRODUCT_COUNT | 0 | 3.13 | 1.09 | 6 |
| YEARS_AS_CUSTOMER | 0 | 5.5 | 5.9 | 40 |
| DIGITAL_BANKING_LOGINS_MONTHLY | 0 | 13.9 | 5.5 | 32 |
| BRANCH_VISITS_MONTHLY | 0 | 2.0 | 1.4 | 9 |
| MONTHS_SINCE_LAST_PRODUCT | 1 | 17.6 | 18.1 | 120 |
| CUSTOMER_SATISFACTION_SCORE | 1.5 | 7.46 | 1.45 | 10.0 |
| OVERDRAFT_COUNT_12M | 0 | 0.81 | 0.90 | 5 |
| SAVINGS_RATE_PCT | 0.1 | 11.4 | 6.4 | 36.1 |

Flag rates: checking 0.90, savings 0.60, investment 0.19, mortgage 0.35, auto loan 0.40, credit card
0.70, mobile app 0.94.

- **Education:** Bachelors 2,579, High_School 1,885, Masters 1,383, Associates 1,113, Doctorate 540.
- **Employment:** Employed_FT 3,888, Self_Employed 956, Retired 813, Unemployed 707, Student 660,
  Employed_PT 476.
- **Marital:** Married 3,634, Single 1,817, Divorced 1,516, Widowed 533.
- **Home:** Rent 3,778, Mortgage 2,618, Own 1,104.
- **Region:** Southeast 1,513, Midwest 1,351, Northeast 1,341, West 1,291, Southwest 1,072,
  Mid_Atlantic 932.
- **Risk:** Moderate 3,355, Conservative 2,221, Aggressive 1,924.
- **Life event:** None 3,762, New_Home 759, Retirement_Planning 759, Marriage 620,
  College_Planning 593, Job_Change 514, New_Baby 493.
- **Labels:** Savings 1,895, Personal_Loans 1,672, Auto_Loans 1,268, Credit_Cards 795, Deposits 458,
  Money_Market 438, CDs 378, Brokerage_Advisory 259, Residential_Loans 160, HELOC 158,
  Wealth_Management 19.

**Real population vs. training (input audience)**

| | Median | Within training max |
|---|---|---|
| Business revenue | $945K | 5,436 / 5,725 |
| Business employees | 5 | 5,315 / 5,725 |
| Person income | $73.1K | 25,216 / 25,424 |
| Person credit score | 675 | 24,239 / 25,424 within 449–796 |
