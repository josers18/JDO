# Cumulus Plan 3 — D&B Business Credit Implementation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement task-by-task.

**Goal:** Stand up the third per-dataset Cumulus pipeline — D&B-style business credit ratings (DUNS, PAYDEX, financial strength tier, failure risk, corporate family). BUSINESS-scoped, follows the same v1.4 recipe Plan 2 just validated.

**Architecture:** Instantiates the dataset template (v1.4) with the placeholders below. Row-factory bias logic and table schema specified in the rowspec attachment.

**Depends on:** Plan 0. Independent of Plans 1 and 2 — no shared Snowflake objects, no DC stream coupling. Ships in parallel-track with the same recipe Plans 1+2 already proved.

---

## How to use this plan

1. Open the dataset template at `docs/superpowers/plans/2026-05-28-cumulus-plan-N-dataset-template.md` (v1.4).
2. Apply the placeholder values from §1 below.
3. Read the rowspec at `docs/superpowers/plans/attachments/cumulus-plan-3-dnb-business-credit-rowspec.md`.
4. Implement task-by-task. The 8 tasks are mechanical given the placeholders + rowspec + the established Plan 1/2 deploy artifacts.

## §1 Placeholder values

| Placeholder | Value |
|---|---|
| `<<PLAN_N>>` | `3` |
| `<<DATASET_SLUG>>` | `dnb-business-credit` |
| `<<DATASET_SLUG_UNDERSCORE>>` | `dnb_business_credit` |
| `<<MIMICS_VENDOR>>` | `D&B` (display name; `DnB` for slug parts due to `&` URL-unfriendliness) |
| `<<DATASET_TABLE>>` | `DNB_BUSINESS_CREDIT` |
| `<<DATASET_TABLE_LOWER>>` | `dnb_business_credit` |
| `<<REPO_DIR>>` | `Snowflake_DnB_BusinessCredit` (matches the spec §4 catalog) |
| `<<DC_DMO>>` | `CumulusDnBBusinessCredit__dlm` |
| `<<DATASET_SALT>>` | `dnb` |
| `<<CADENCE>>` | `MONTHLY` |
| `<<TASK_NAME>>` | `TASK_MONTHLY_DNB_BUSINESS_CREDIT` |
| `<<TASK_NAME_LOWER>>` | `task_monthly_dnb_business_credit` |
| `<<SP_NAME>>` | `SP_GENERATE_DNB_BUSINESS_CREDIT` |
| `<<CRON>>` | `'USING CRON 0 7 1 * * UTC'` |
| `<<AUDIENCE_PREDICATE>>` | `ACCOUNT_TYPE_FLAG = 'BUSINESS'` |
| `<<COVERAGE_RULE>>` | rows = audience (1:1 monthly per BUSINESS account) |
| `<<ROW_PK>>` | `(ACCOUNT_ID, PROFILE_MONTH)` |
| `<<COLUMN_LIST>>` | See rowspec — 15 columns including `DUNS_NUMBER`, `DNB_RATING`, `PAYDEX_SCORE`, `FAILURE_RISK_SCORE`, corporate family fields |

## §2 Audience-predicate probe

`ACCOUNT_TYPE_FLAG = 'BUSINESS'` — same predicate as Plan 2. SP must include the BUSINESS over-count warning at step 1.5 (per spec §3 v1.2 finding #3 + the now-codified template Task 4 §_merge note).

## §3 Rowspec attachment

`docs/superpowers/plans/attachments/cumulus-plan-3-dnb-business-credit-rowspec.md`

Contains:
- 15-column table DDL inputs (`ULTIMATE_PARENT_DUNS` is the only NULLable column)
- PK `(ACCOUNT_ID, PROFILE_MONTH)`
- 11-tier financial strength ladder (`5A`, `4A`, `3A`, `2A`, `1A`, `BA`, `BB`, `CB`, `CC`, `DC`, `DD`) with revenue thresholds
- 4-level composite risk distribution biased by tier
- PAYDEX industry bias table (Construction lowest at 65, Finance/Banking highest at 88)
- Failure risk + delinquency + supplier risk derivation
- Corporate family size by revenue band
- DUNS year-stable derivation (year not month — see rowspec §"DUNS Number derivation")
- Verification status distribution
- L1 anchor-influence test targets (revenue → tier; industry → PAYDEX mean differs ≥8)

## §4 What changes from the v1.4 template

1. **Task 1 (scaffold).** Repo dir `Snowflake_DnB_BusinessCredit` (note casing: `DnB` not `D&B`, since `&` is unfriendly in paths). README/AGENTS.md identical-shape to Plan 2's, substituting D&B for MSCI.

2. **Task 2 (table DDL).** 15 columns. `ULTIMATE_PARENT_DUNS` is the only NULLable; all 14 others NOT NULL. PK `(ACCOUNT_ID, PROFILE_MONTH)`.

3. **Task 3 (L1 tests).** Plan 2's conftest pattern (importlib spec_from_file_location). BUSINESS audience override. Property #4 has TWO assertions:
   - `BIAS_AXIS = ANNUAL_REVENUE`, `OUTPUT = "FINANCIAL_STRENGTH_TIER"` — low revenue clusters in `{CC, DC, DD, CB}`, high revenue in `{5A, 4A, 3A}`.
   - `BIAS_AXIS = INDUSTRY`, `OUTPUT = "PAYDEX_SCORE"` — Construction/Retail/F&B mean < 73; Finance/Healthcare mean > 82; gap ≥ 8.
   - Add a third test: `DUNS_NUMBER` is stable across months for the same account (compute DUNS at `2026-01-01` vs `2026-12-01`, assert equal). Computing for `2027-01-01` should differ.

4. **Task 4 (SP).** Implement `_row_for` per the rowspec bias-logic skeleton. The DUNS derivation needs `_duns_from_bytes` helper (defined in rowspec). The SP also needs `_anchor_in_audience` returning `anchor.get("ACCOUNT_TYPE_FLAG") == "BUSINESS"`. Include the BUSINESS over-count warning in step 1.5 just like Plan 2. The MERGE handles `ULTIMATE_PARENT_DUNS` NULL correctly (NULL passes through write_pandas → MERGE without special-casing).

5. **Task 5 (L2).** 12 BUSINESS + 2 PERSON fixture (12 industries to exercise the PAYDEX industry-bias table). Add an extra assertion: `DUNS_NUMBER` is unique per ACCOUNT_ID (no collisions in 12 anchors with the seed-based derivation).

6. **Task 6 (deploy).** Use the now-canonical `scripts/deploy_sp.py` builder pattern — clone Plan 2's verbatim, substitute the SP source path. Inline-source `procedures/sp_create_procedure.sql` with cumulus_common helpers. TASK on `MAIN_WH_XS`, monthly cron, `SP_RETRY_WRAPPER('FINS.PUBLIC.SP_GENERATE_DNB_BUSINESS_CREDIT()', 2)`.

7. **Task 7 (DC stream + DMO).** API path identical to Plan 2 (date format `MM/dd/yyyy` for `PROFILE_MONTH`; DMO mapping pending UI). Mapping table:

   | Snowflake | DC field |
   |---|---|
   | ACCOUNT_ID | ssot__AccountId__c |
   | PROFILE_MONTH | profileMonth__c |
   | DUNS_NUMBER | dunsNumber__c |
   | DNB_RATING | dnbRating__c |
   | FINANCIAL_STRENGTH_TIER | financialStrengthTier__c |
   | COMPOSITE_RISK_SCORE | compositeRiskScore__c |
   | PAYDEX_SCORE | paydexScore__c |
   | AVERAGE_DAYS_BEYOND_TERMS | averageDaysBeyondTerms__c |
   | FAILURE_RISK_SCORE | failureRiskScore__c |
   | DELINQUENCY_PREDICTOR_SCORE | delinquencyPredictorScore__c |
   | SUPPLIER_RISK_LEVEL | supplierRiskLevel__c |
   | CORPORATE_FAMILY_SIZE | corporateFamilySize__c |
   | ULTIMATE_PARENT_DUNS | ultimateParentDuns__c |
   | VERIFICATION_STATUS | verificationStatus__c |
   | GENERATED_AT | generatedAt__c |

8. **Task 8 (L3 smoke).** Verify SP run, ~11K rows (matches Plan 2 BUSINESS cardinality), BUSINESS over-count warning logged, PAYDEX-by-industry spot-check (Construction vs Finance), DUNS stability spot-check (run for two different months on same account, confirm DUNS unchanged).

## §5 Self-review checklist

- [ ] Audience predicate `ACCOUNT_TYPE_FLAG = 'BUSINESS'` in 4 places (SP `_AUDIENCE_PREDICATE`, audience SQL, coverage SQL, L1 fixture override).
- [ ] Salt `"dnb"` in SP module constant only.
- [ ] DUNS uses a separate salt (`"duns_id"`) and year-stable seed (not month-stable).
- [ ] `ULTIMATE_PARENT_DUNS` is the only NULLable column.
- [ ] BUSINESS-cardinality warning at SP step 1.5.
- [ ] L1 includes the DUNS stability test.
- [ ] No `<<` or `>>` placeholders left.

## §6 Out of scope

- Real D&B license / live DUNS registry.
- PAYDEX history (12-month weighted average) — single point-in-time score only.
- Trade payment records.
- Multi-level corporate hierarchy.

## §7 Status

Pending implementation. Plans 1+2 shipped end-to-end (Claritas 25,424 PERSON rows, MSCI 11,389 BUSINESS rows). Plan 3 follows the same recipe; the rowspec is the only new artifact.
