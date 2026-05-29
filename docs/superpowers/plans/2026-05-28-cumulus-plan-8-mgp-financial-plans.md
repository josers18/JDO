# Cumulus Plan 8 — MoneyGuidePro Financial Plans Implementation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Stand up the eighth per-dataset Cumulus pipeline — MoneyGuidePro-style financial-plan records per Wealth Management account. Wealth-only audience. Monthly cadence. SP emits one row per Wealth account per month into `FINS.PUBLIC.MGP_FINANCIAL_PLANS` (~3,920 rows), federated as `CumulusMgpFinancialPlans__dlm`.

**Architecture:** Instantiates the dataset template (v1.5) with **two structural deviations** from Plans 1-7:
1. **Smallest audience by 2.9×** (3,920 vs 11,389 next-smallest). L1 fixture has only ~3-5 Wealth anchors out of SAMPLE_ANCHORS' 100, so property tests must shift from distributional rate convergence to **per-anchor deterministic invariants**.
2. **Status-driven NULL semantics** — `PLAN_STATUS` (Active/Draft/Stale) gates which fields are NULL. `Draft` → LAST_REVIEW_DATE NULL. `Stale` → NEXT_REVIEW_DATE NULL. `Active` → both populated. First Cumulus dataset where NULL semantics depend on a non-Boolean enum.

**Depends on:** Plan 0. Independent of Plans 1-7.

---

## §1 Placeholder values

| Placeholder | Value |
|---|---|
| `<<PLAN_N>>` | `8` |
| `<<DATASET_SLUG>>` | `mgp-financial-plans` |
| `<<DATASET_SLUG_UNDERSCORE>>` | `mgp_financial_plans` |
| `<<MIMICS_VENDOR>>` | `MoneyGuidePro` |
| `<<DATASET_TABLE>>` | `MGP_FINANCIAL_PLANS` |
| `<<DATASET_TABLE_LOWER>>` | `mgp_financial_plans` |
| `<<REPO_DIR>>` | `Snowflake_MoneyGuidePro_FinancialPlans` |
| `<<DC_DMO>>` | `CumulusMgpFinancialPlans__dlm` |
| `<<DATASET_SALT>>` | `mgp` |
| `<<CADENCE>>` | `MONTHLY` |
| `<<TASK_NAME>>` | `TASK_MONTHLY_MGP_FINANCIAL_PLANS` |
| `<<TASK_NAME_LOWER>>` | `task_monthly_mgp_financial_plans` |
| `<<SP_NAME>>` | `SP_GENERATE_MGP_FINANCIAL_PLANS` |
| `<<CRON>>` | `'USING CRON 0 7 1 * * UTC'` |
| `<<AUDIENCE_PREDICATE>>` | `CLIENT_CATEGORY = 'Wealth Management'` |
| `<<COVERAGE_RULE>>` | distinct accts = audience (1:1 monthly per Wealth) |
| `<<ROW_PK>>` | `(ACCOUNT_ID, PROFILE_MONTH)` |
| `<<COLUMN_LIST>>` | See rowspec — 14 columns including 2 NULLable, 1 BOOLEAN |

## §2 Audience-predicate probe

`CLIENT_CATEGORY = 'Wealth Management'`

**Live cardinality (probed 2026-05-28):** 3,920 distinct anchors (no duplicates). Both BIRTHDATE and ANNUAL_INCOME are 100% populated. Income range $200K-$1.9M, median $333K, mean $381K. The cohort is genuinely affluent — no income-NULL fallback needed.

**Smallest Cumulus dataset by 2.9×.** Next-smallest plans:
- Plan 8 (this one): 3,920 rows
- Plan 2 (MSCI ESG): 11,389 rows
- Plan 3 (D&B Business Credit): 11,389 rows

## §3 Rowspec attachment

`docs/superpowers/plans/attachments/cumulus-plan-8-mgp-financial-plans-rowspec.md`

Contains:
- 14-column table DDL inputs (12 NOT NULL + 2 NULLable: LAST_REVIEW_DATE, NEXT_REVIEW_DATE)
- PK `(ACCOUNT_ID, PROFILE_MONTH)`
- PLAN_STATUS distribution (~80% Active / 12% Draft / 8% Stale)
- Status-driven NULL semantics for review dates
- Age-glide RECOMMENDED_ASSET_ALLOCATION (textbook 5-tier glide)
- Income-driven MONTHLY_INCOME_TARGET (70-90% replacement rate)
- Age-driven TOTAL_GOAL_AMOUNT and GOAL_COUNT
- Monte Carlo success synthesis (income + age + goal_count → success%)
- L1 anchor-influence test targets (NEW shape: per-anchor invariants since cohort is too small for distributional)

## §4 What changes from the v1.5 template

1. **Task 1 (scaffold).** AGENTS.md gotchas:
   - **Smallest Cumulus audience.** 3,920 anchors vs Plan 2/3's 11,389. SP runtime expected <2s.
   - **Status-driven NULL semantics.** `PLAN_STATUS='Draft'` → LAST_REVIEW_DATE NULL. `PLAN_STATUS='Stale'` → NEXT_REVIEW_DATE NULL. `PLAN_STATUS='Active'` → both populated. **The L1 NULL-semantic invariants are the load-bearing tests** — distributional convergence won't work at this cohort size.
   - **Anchor reads:** BIRTHDATE + ANNUAL_INCOME (both 100% populated). No NULL fallback needed.
   - **Date-coherence invariants:** PLAN_LAST_UPDATED_DATE ≤ run_ts.date(); LAST_REVIEW_DATE (if populated) ≤ run_ts.date(); NEXT_REVIEW_DATE (if populated) > run_ts.date().
   - **Per-anchor invariants, not distributional.** Property tests for age→allocation, income→monthly_target are per-anchor (e.g. "every age <35 anchor has Aggressive or Moderate Aggressive allocation"), NOT mean comparisons or rate convergence.
   - Salt is `"mgp"` (monthly, no year-stable salt needed).
   - 1 BOOLEAN column (ADVISOR_NOTES_FLAG) — declare as Boolean in DC.

2. **Task 2 (table DDL).** PK `(ACCOUNT_ID, PROFILE_MONTH)`. 12 NOT NULL + 2 NULLable. 1 BOOLEAN NOT NULL.

3. **Task 3 (L1 tests).** Plan 1's conftest pattern (importlib + SAMPLE_ANCHORS) but `in_audience_anchors = [a for a in all_anchors if a["CLIENT_CATEGORY"] == "Wealth Management"]`. Property #4 has FIVE per-anchor invariants:
   - **4a Age-glide** (per-anchor): every <35 anchor → Aggressive/Moderate Aggressive; every ≥70 anchor → Moderate Conservative/Conservative.
   - **4b Income-floor** (per-anchor): every anchor's MONTHLY_INCOME_TARGET in [income×0.70/12, income×0.90/12].
   - **4c NULL-semantics** (per-row): Draft → LAST_REVIEW_DATE NULL; Stale → NEXT_REVIEW_DATE NULL; Active → both populated. Test against full audience × 6-month roll for diverse plan_status sampling.
   - **4d Date-coherence** (per-row): PLAN_LAST_UPDATED ≤ today; LAST_REVIEW (if not null) ≤ today; NEXT_REVIEW (if not null) > today.
   - **4e Range invariants** (per-row): RETIREMENT_TARGET_AGE [55,80], MONTHLY_INCOME_TARGET [10000,200000], TOTAL_GOAL_AMOUNT [500000,50000000], GOAL_COUNT [1,6], MONTE_CARLO_SUCCESS_PCT [30.0,99.0].
   - Multi-month roll (6+ months) gives ~24-30 rows per anchor cohort, enough to encounter all 3 PLAN_STATUS values for the NULL test.

4. **Task 4 (SP).** Implement `_row_for` per the rowspec. Standard 5-step pattern. Two structural points:
   - **Status-first computation:** PLAN_STATUS computed before review-dates so NULL gating is determined upfront.
   - **Date-coherence guard:** `_review_dates` clamps last_review to ≤ run_ts.date() and next_review to > run_ts.date() (boundary handling for edge-of-month runs).
   - The MERGE handles 2 NULLable date columns and 1 BOOLEAN cast (`ADVISOR_NOTES_FLAG::BOOLEAN`).

5. **Task 5 (L2).** 14-anchor fixture (4 Wealth + 10 non-Wealth, audience filter excludes the 10). Plan 8-specific assertions:
   - `COUNT(DISTINCT ACCOUNT_ID) = 4` (audience size, after filter).
   - All 4 emit exactly one row per month.
   - At least 1 of the 3 PLAN_STATUS values present (with 4 anchors and 80/12/8 distribution, expectation is 3.2/0.5/0.3 — Active dominant; assertion checks that at least one Status appears).
   - **NULL-semantics invariants enforced**: 0 Draft rows with LAST_REVIEW_DATE; 0 Stale rows with NEXT_REVIEW_DATE; 0 Active rows missing either.
   - Idempotent re-run: ROWS_INSERTED=0.

6. **Task 6 (deploy).** Clone Plan 7's `scripts/deploy_sp.py`. Single salt `"mgp"` (vs Plan 7's three: worldcheck, worldcheck_jurisdiction, worldcheck_case). Update docstring describing Plan 8's structural deviations. No `&` sanitize ("MGP" / "MoneyGuidePro" both clean). Monthly cron, `MAIN_WH_XS`. Wrapper `SP_RETRY_WRAPPER('FINS.PUBLIC.SP_GENERATE_MGP_FINANCIAL_PLANS()', 2)`.

7. **Task 7 (DC stream + DMO).** API path identical to Plans 1-7. Mapping table:

   | Snowflake | DC field | Type |
   |---|---|---|
   | ACCOUNT_ID | ssot__AccountId__c | Text (FK) |
   | PROFILE_MONTH | profileMonth__c | Date (PK; format MM/dd/yyyy) |
   | PLAN_STATUS | planStatus__c | Text |
   | PLAN_LAST_UPDATED_DATE | planLastUpdatedDate__c | Date |
   | RETIREMENT_TARGET_AGE | retirementTargetAge__c | Number |
   | MONTHLY_INCOME_TARGET_USD | monthlyIncomeTargetUsd__c | Number |
   | TOTAL_GOAL_AMOUNT_USD | totalGoalAmountUsd__c | Number |
   | GOAL_COUNT | goalCount__c | Number |
   | MONTE_CARLO_SUCCESS_PCT | monteCarloSuccessPct__c | Number |
   | RECOMMENDED_ASSET_ALLOCATION | recommendedAssetAllocation__c | Text |
   | LAST_REVIEW_DATE | lastReviewDate__c | Date |
   | NEXT_REVIEW_DATE | nextReviewDate__c | Date |
   | ADVISOR_NOTES_FLAG | advisorNotesFlag__c | **Boolean** |
   | GENERATED_AT | generatedAt__c | DateTime |

   `PROFILE_MONTH`, `PLAN_LAST_UPDATED_DATE`, `LAST_REVIEW_DATE`, `NEXT_REVIEW_DATE` need `format: "MM/dd/yyyy"`. ADVISOR_NOTES_FLAG declared as `Boolean` (Plan 5 finding).

   DC PK collapses to `profileMonth__c` + KQ on `ssot__AccountId__c` (single-column-PK rule from Plan 4).

8. **Task 8 (L3 smoke).** Verify SP run, ~3,920 rows. Spot-check:
   - 5 random rows for plausibility (mix of Active / Draft / Stale).
   - PLAN_STATUS distribution: ~80% Active, ~12% Draft, ~8% Stale.
   - **NULL-semantics**: 0 Draft rows with LAST_REVIEW_DATE; 0 Stale rows with NEXT_REVIEW_DATE; 0 Active rows missing either.
   - **Date-coherence**: 0 future-dated PLAN_LAST_UPDATED, LAST_REVIEW, or non-future NEXT_REVIEW.
   - **Range invariants**: RETIREMENT_TARGET_AGE in [55,80]; MONTHLY_INCOME_TARGET in [10K, 200K]; etc.
   - Asset allocation distribution: heavy concentration in Moderate / Moderate Aggressive (most Wealth anchors are 40-65 age band).

## §5 Self-review checklist

- [ ] Audience predicate `CLIENT_CATEGORY = 'Wealth Management'` in 4 places (SP `_AUDIENCE_PREDICATE`, audience SQL, coverage SQL, L1 fixture override).
- [ ] Salt `"mgp"` in SP module constant.
- [ ] PK `(ACCOUNT_ID, PROFILE_MONTH)` in DDL and MERGE ON.
- [ ] 1 BOOLEAN column declared as BOOLEAN NOT NULL in DDL.
- [ ] DC mapping: `advisorNotesFlag__c` declared as `Boolean` (not Text).
- [ ] L1 tests use per-anchor invariants, not distributional rate convergence.
- [ ] NULL-semantics tests roll over 6+ months for diverse PLAN_STATUS sampling.
- [ ] No `<<` placeholders left.

## §6 Out of scope

- Real MoneyGuidePro / eMoney / NaviPlan license / data fidelity.
- Goal hierarchies, what-if scenarios, plan-version history.
- Free-text advisor notes (only the boolean flag).
- Joint/couples plans — single-account only.
- Real Monte Carlo engine — success% is biased, not simulated.

## §7 Status

Pending implementation. Plans 1-7 shipping live (7 datasets, 167,443 rows total). Plan 8 is the **smallest audience** Cumulus dataset (3,920 rows) — validates the recipe handles narrow cohorts before Plan 10 (BoardEx, Commercial Banking ~960 anchors — even smaller).
