# Attrition, CSAT and Enrollments Inputs Generator — Design

Date: 2026-10-23 · Status: draft · Closes: `React-Headless/docs/SNOWFLAKE_DATA_FIXES.md` §2

## Intent

Three Snowflake tables in `DATA_JEDAIS.FINS__PUBLIC` are one-off June loads of 741 rows. Only
159 of those rows are real `001am` Accounts in `jdo-gj9q5q`; the rest are Ids from other orgs.
Build a generator, modelled on `Snowflake_Product_Recommendations`, that rewrites all three
tables every month for **every customer**, with values grounded in the Cumulus feeds.

The tables play two different roles:

| Table | Role | Federated into D360 as |
|---|---|---|
| `ATTRITION_INPUTS` | **Model input only.** Feeds the D360 attrition model. | `BT_Attrition_Inputs` → `Attrition_Inputs_Snowflake__dlm` |
| `CSAT_ATTRITION_INPUTS` | **Model input only.** Feeds the D360 CSAT model. | `BT_CSAT_Attrition_Inputs` → `CSAT_Prediction_Input__dlm` |
| `ENROLLMENTS` | **Customer profile data.** Used downstream: flags on the profile, next best action, campaigns and more. | `BT_Enrollments` → `Enrollments__dlm` |

Scoring, the output DMOs and the transforms belong to D360 and are out of scope. This
generator's job ends when the input tables are correct and complete.

## Goals

1. **Coverage:** one row per customer in each table, for every real account. That means
   `V_ACCOUNT_ANCHORS` where `ACCOUNT_ID LIKE '001am%'`, person and business, excluding
   households (the same anchor rules as product recs). Expect about 36.2k rows, matching the
   36,222 real accounts in `CSAT_NPS_DATA`. Every account gets attrition and CSAT inputs, not
   just persons (decided by the user).
2. **Grounded in the feeds** (decided by the user). Each value comes from the source the
   profile already shows for the same idea, so nothing contradicts the rest of the page.
3. **ENROLLMENTS is realistic profile data, not model filler.** Requirements:
   - Every customer appears, with every flag populated. No NULLs.
   - **Flags are internally consistent:**
     - MFA only applies to customers enrolled online or on mobile.
     - Alerts and paperless mostly go with digital enrolment.
     - Wire is mostly business, private wealth and high balances; it is rare for mass-retail
       persons.
     - `KYC_STATUS` and `AML_STATUS` agree with `WORLD_CHECK_AML` (latest `PROFILE_DATE`).
       Sanctions, PEP or adverse-media hits, or a high `OVERALL_RISK_RATING`, go with
       Under Review / Pending. Clean profiles are Current / Cleared, with a small Expired
       tail.
   - **Flags are realistic across the book.** Adoption varies by age and segment: younger
     customers lean toward mobile, older ones toward online and paper. Business accounts have
     higher online and wire use. Overall rates look like a real bank, not 50/50 coin flips.
     The builder records the target rates in `output/calibration.md`.
   - **The flags explain each other.**
     - `SAVINGS_RATE` comes from balance growth in `ACCOUNT_DAILY_BALANCE` relative to
       income or credits.
     - `CROSS_SELL_SCORE` agrees with the product holdings in
       `FINANCIAL_TRANSACTION_ACCOUNTS`.
   - **Stable across months.** A customer's flags don't change at random from one run to the
     next. Enrolment is sticky; only a small seeded share of customers enrol or un-enrol each
     month. Deterministic seeds (`seed_for(account_id, salt, …)`) without the month in the salt
     give flags that persist. Small month-salted drift adds believable change.
   - `SNAPSHOT_DATE` is set to the run month's first day. Each run replaces the table with one
     current row per customer; no history is kept.
4. **The model inputs stay inside each model's training vocabulary and ranges.** The ranges
   come from `RETAIL_ATTRITION_TRAINING_DATA` and the current `CSAT_ATTRITION_INPUTS`.

   Category values:

   | Column | Values |
   |---|---|
   | Attrition `CUSTOMER_SEGMENT_C` | Regular, Premium, Preferred |
   | `NPS_SCORE_C` | Promoter, Passive, Detractor |
   | Yes/No flags | `'Yes'`, `'No'` |
   | CSAT `SEGMENT` | Corporate, Wealth Management, Commercial, Banking |
   | `KYC_STATUS` | Current, Pending, Expired, Under Review |
   | `AML_STATUS` | Cleared, Under Review, Pending, None |

   Numeric range examples: `CROSS_SELL_SCORE_C` 1–7, `TENURE_IN_MONTHS_C` 8–74.

   `CHURNED_C` is the training label. The model doesn't read it, so write `'No'`.
5. **The three tables agree with each other for the same customer.**
   - The attrition `ONLINE_BANKING_C`/`MOBILE_BANKING_C` match the enrolment
     `ONLINE_ENROLLED`/`MOBILE_ENROLLED`.
   - Cross-sell agrees across the three tables, allowing for each table's own scale.
6. **A monthly Snowflake task** through `SP_RETRY_WRAPPER`, logged to `TASK_EXECUTION_LOG`.
7. **Retire the dead Jedi stream** `Attrition_Inputs_Snowflake` (approved by the user).
   - It reads the deleted `FINS.PUBLIC.ATTRITION_INPUTS` and is in FAILURE.
   - The `BT_Attrition_Inputs` stream replaced it as the input DMO's only mapped source.
   - First check that nothing else references its DLO, then delete the stream in the DC
     Setup UI. Federated streams can't be deleted through the API.
8. **Update `SNOWFLAKE_DATA_FIXES.md` §2** to ✅ with the live counts.

## Feed map (starting point; the builder refines the formulas)

| Value | Source |
|---|---|
| NPS category, CSAT history, complaints proxy | `CSAT_NPS_DATA` (latest + trend, by `ACCOUNTID`) |
| Average balance over 6 months, % balance drop, account balance | `ACCOUNT_DAILY_BALANCE` |
| Transaction count and volume | `FINANCIAL_TRANSACTIONS`, `ACCOUNT_DAILY_BALANCE.TRANSACTION_COUNT` |
| Direct deposit, number of products, single-product, promotional product, tenure | `FINANCIAL_TRANSACTION_ACCOUNTS` (`DIRECT_DEPOSIT_AMOUNT`, `BONUS_AMOUNT`, `OPEN_DATE`, `PRODUCT_KIND`) |
| Call-centre calls, customer-service contacts, days since last interaction, escalations proxy | `GONG_CALL_SENTIMENT` (`CALL_COUNT_LAST_7D`, `LAST_CALL_DATE`, `OVERALL_SENTIMENT`) |
| Age, income, credit score, segment | `V_ACCOUNT_ANCHORS` (`BIRTHDATE`, `ANNUAL_INCOME`, `CREDIT_SCORE`, `CLIENT_CATEGORY`, `ACCOUNT_TYPE_FLAG`) |
| KYC / AML | `WORLD_CHECK_AML` |
| Digital engagement, online/mobile/paperless/alerts/MFA/wire | Seeded per customer, correlated with age, segment, transaction activity and balances |

No case feed exists in Snowflake. Complaint and escalation counts are derived from detractor
scores and negative Gong sentiment. The builder records the rule.

## Non-goals

- Model training, scoring, transforms, output DMOs, and any cockpit change. That's D360's side.
- Renaming or retyping existing columns. Streams and DMO mappings depend on them.
- Writing `CSAT_NPS_DATA` or touching its pipeline (`Snowflake_CSAT_NPS`). This generator only
  reads it.

## Anti-goals

- Enrolment flags that contradict each other or the profile:
  - MFA set without any digital enrolment;
  - KYC Current next to a sanctions hit;
  - wire enabled on a student checking account;
  - flags that flip every month.
- Model inputs that contradict the profile: a Promoter fed in as a Detractor, or a big balance
  drop fed in as stable.
- Non-`001am` keys, duplicate keys, or NULLs in any column.
- A run that leaves a table partly written.

## Constraints (mirror `Snowflake_Product_Recommendations`)

- A Snowpark Python SP assembled from modules by `scripts/deploy_sp.py`.
  - Inline `seed_for` / `assert_coverage` from `Snowflake_Cumulus_Common` (on `main`).
  - The generated `procedures/sp_create_procedure.sql` is committed and pinned by a test.
- Feed windows end at the first day of the run month, so re-runs in the same month are
  reproducible.
- All three tables are replaced atomically in one transaction. Gates abort before any DML:
  - coverage equals the audience;
  - 0 NULLs;
  - every key matches `001am%`, with no duplicates;
  - every category value is in the vocabulary;
  - every number is within the training min/max;
  - the cross-table consistency checks in goal 5 pass;
  - the enrolment consistency rules in goal 3 pass.
- `snow sql -c SFDC_DC_TECH_ARCH --role ACCOUNTADMIN` (flags go after `sql`). No `$$` and no
  bare `&` in module source.
- Org `jdo-gj9q5q`. Never print access tokens or frontdoor URLs.
- The calibration record is aggregate-only. Any pool cache that contains account ids is
  gitignored.

## Left to the builder

- Module split, exact formulas, correlation weights and enrolment target rates. Record each
  in `output/calibration.md`.
- Project name (proposed `Snowflake_Attrition_CSAT_Inputs`) and the task schedule. Proposed:
  monthly, after the feeds land. Product recs run `0 4 2 * *` ET.
