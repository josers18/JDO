# Cumulus Plan 5 — CoreLogic Property Implementation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Stand up the fifth per-dataset Cumulus pipeline — CoreLogic-style property records (deeds, valuations, mortgage status, HELOC opportunity). PERSON-scoped + ZIP-required (defensive v1.5 predicate). Quarterly cadence. SP emits one row per PERSON anchor with non-empty POSTAL_CODE per quarter into `FINS.PUBLIC.CORELOGIC_PROPERTY` (~25,424 rows), federated as `CumulusCoreLogicProperty__dlm`.

**Architecture:** Instantiates the dataset template (v1.5) with two structural deviations from Plans 1-3:
1. **Quarterly cadence** instead of monthly (`PROFILE_QUARTER` instead of `PROFILE_MONTH`).
2. **1:1 emit-rate but with NULL-able property fields** — non-owners get a row with `IS_OWNER=false` and NULL property data. Coverage assertion is on distinct accounts, not row count.

**Depends on:** Plan 0. Independent of Plans 1-4 — no shared Snowflake objects.

---

## §1 Placeholder values

| Placeholder | Value |
|---|---|
| `<<PLAN_N>>` | `5` |
| `<<DATASET_SLUG>>` | `corelogic-property` |
| `<<DATASET_SLUG_UNDERSCORE>>` | `corelogic_property` |
| `<<MIMICS_VENDOR>>` | `CoreLogic` |
| `<<DATASET_TABLE>>` | `CORELOGIC_PROPERTY` |
| `<<DATASET_TABLE_LOWER>>` | `corelogic_property` |
| `<<REPO_DIR>>` | `Snowflake_CoreLogic_Property` |
| `<<DC_DMO>>` | `CumulusCoreLogicProperty__dlm` |
| `<<DATASET_SALT>>` | `corelogic` |
| `<<CADENCE>>` | `QUARTERLY` |
| `<<TASK_NAME>>` | `TASK_QUARTERLY_CORELOGIC_PROPERTY` |
| `<<TASK_NAME_LOWER>>` | `task_quarterly_corelogic_property` |
| `<<SP_NAME>>` | `SP_GENERATE_CORELOGIC_PROPERTY` |
| `<<CRON>>` | `'USING CRON 0 8 1 1,4,7,10 * UTC'` (1st of Jan/Apr/Jul/Oct at 08:00 UTC) |
| `<<AUDIENCE_PREDICATE>>` | `ACCOUNT_TYPE_FLAG = 'PERSON' AND POSTAL_CODE IS NOT NULL AND POSTAL_CODE <> ''` |
| `<<COVERAGE_RULE>>` | distinct accts = audience (1:1 quarterly per PERSON+ZIP) |
| `<<ROW_PK>>` | `(ACCOUNT_ID, PROFILE_QUARTER)` |
| `<<COLUMN_LIST>>` | See rowspec — 15 columns including 9 NULLable property fields |

## §2 Audience-predicate probe

`ACCOUNT_TYPE_FLAG = 'PERSON' AND POSTAL_CODE IS NOT NULL AND POSTAL_CODE <> ''` — uses the v1.5 defensive predicate (Plan 4 discovery).

**Live cardinality (probed 2026-05-28):** 25,424 PERSON anchors with non-empty POSTAL_CODE — same count as Plan 1 (Claritas), confirming all PERSON rows in V_ACCOUNT_ANCHORS already have valid POSTAL_CODE. The `<> ''` filter is a defensive guard that doesn't actively drop rows in the current data, but is the canonical pattern going forward.

No BUSINESS over-count concern — this is PERSON-scoped.

## §3 Rowspec attachment

`docs/superpowers/plans/attachments/cumulus-plan-5-corelogic-property-rowspec.md`

Contains:
- 15-column table DDL inputs (9 NULLable property fields, 6 always-present fields)
- PK `(ACCOUNT_ID, PROFILE_QUARTER)` — note: PROFILE_QUARTER, not PROFILE_MONTH
- Owner-probability table (life stage × Wealth override)
- Property type bias by urbanicity
- Property value bias by ZIP first-digit + income
- Mortgage balance + rate (bimodal pre/post-2022)
- Flood zone + wildfire risk by state
- HELOC opportunity score derivation
- Quarterly seed bucketing (`_quarter_start`)
- L1 anchor-influence test targets (age→owner, income→value, state→flood)

## §4 What changes from the v1.5 template

1. **Task 1 (scaffold).** AGENTS.md gotchas:
   - Cadence is QUARTERLY not MONTHLY.
   - Seed bucket is quarter-start (Jan 1 / Apr 1 / Jul 1 / Oct 1), not month-first.
   - Audience predicate has the v1.5 defensive `POSTAL_CODE <> ''` filter (no actual rows dropped today, but canonical).
   - 9 NULLable property columns (when IS_OWNER=false). FLOOD_ZONE_CODE + WILDFIRE_RISK_SCORE + LIEN_COUNT are always populated even for renters.
   - Multi-quarter `LAST_TRANSFER_YEAR` is stable per-account (computed via separate year-stable seed `"corelogic_year"`).

2. **Task 2 (table DDL).** PK `(ACCOUNT_ID, PROFILE_QUARTER)`. Out of 15 columns: 6 NOT NULL (ACCOUNT_ID, PROFILE_QUARTER, IS_OWNER, LIEN_COUNT, FLOOD_ZONE_CODE, WILDFIRE_RISK_SCORE, GENERATED_AT — actually 7), 8 NULLable (the property fields).

3. **Task 3 (L1 tests).** Plan 1's conftest pattern (importlib + SAMPLE_ANCHORS). Property #4 has THREE assertions (age→owner_prob, income→property_value, state→flood_zone). Add a determinism-across-quarter test (mid-quarter re-runs are byte-identical, including `LAST_TRANSFER_YEAR`).

4. **Task 4 (SP).** Implement `_row_for` per the rowspec bias logic. Two structural points:
   - **Quarter-bucketed seed:** `seed_for(account_id, "corelogic", _quarter_start(run_ts))`.
   - **Year-stable seed for `LAST_TRANSFER_YEAR` and `MORTGAGE_RATE_PCT`** — these don't change quarter-to-quarter (a deed transfer year is fixed; a fixed-rate mortgage doesn't reprice). Use `seed_for(account_id + "_year", "corelogic_year", datetime(run_ts.year, 1, 1))` for those derivations specifically.
   - The MERGE handles 9 NULLable columns correctly — write_pandas + MERGE source SELECT pattern is unchanged from Plans 1-4.

5. **Task 5 (L2).** 14-anchor fixture (12 PERSON + 2 BUSINESS for filter testing). Plan 5-specific assertions:
   - Coverage assertion uses `COUNT(DISTINCT ACCOUNT_ID)` since rows = audience (no 1:N expansion).
   - At least one row has IS_OWNER=true and at least one has IS_OWNER=false (verified across the fixture's 12 PERSON anchors spanning age bands).
   - When IS_OWNER=false: PRIMARY_PROPERTY_TYPE / ESTIMATED_PROPERTY_VALUE / OUTSTANDING_MORTGAGE_BALANCE / EQUITY_USD / MORTGAGE_RATE_PCT / LAST_TRANSFER_YEAR / HELOC_OPPORTUNITY_SCORE are all NULL.
   - LOAN_TO_VALUE_PCT is NULL when IS_OWNER=false OR mortgage=0.
   - LIEN_COUNT, FLOOD_ZONE_CODE, WILDFIRE_RISK_SCORE always populated.

6. **Task 6 (deploy).** Clone Plan 4's `scripts/deploy_sp.py` (no `&` sanitize). TASK uses **quarterly cron** `0 8 1 1,4,7,10 * UTC` and warehouse `MAIN_WH_XS`. Wrapper `SP_RETRY_WRAPPER('FINS.PUBLIC.SP_GENERATE_CORELOGIC_PROPERTY()', 2)`.

7. **Task 7 (DC stream + DMO).** API path identical to Plans 1-4. Mapping table:

   | Snowflake | DC field |
   |---|---|
   | ACCOUNT_ID | ssot__AccountId__c (FK to ssot__Account__dlm) |
   | PROFILE_QUARTER | profileQuarter__c (NOT profileMonth) |
   | IS_OWNER | isOwner__c |
   | PRIMARY_PROPERTY_TYPE | primaryPropertyType__c |
   | ESTIMATED_PROPERTY_VALUE | estimatedPropertyValue__c |
   | OUTSTANDING_MORTGAGE_BALANCE | outstandingMortgageBalance__c |
   | LOAN_TO_VALUE_PCT | loanToValuePct__c |
   | EQUITY_USD | equityUsd__c |
   | MORTGAGE_RATE_PCT | mortgageRatePct__c |
   | LIEN_COUNT | lienCount__c |
   | FLOOD_ZONE_CODE | floodZoneCode__c |
   | WILDFIRE_RISK_SCORE | wildfireRiskScore__c |
   | LAST_TRANSFER_YEAR | lastTransferYear__c |
   | HELOC_OPPORTUNITY_SCORE | helocOpportunityScore__c |
   | GENERATED_AT | generatedAt__c |

   `PROFILE_QUARTER` (DATE column) needs `format: "MM/dd/yyyy"` per v1.4.1.

8. **Task 8 (L3 smoke).** Verify SP run, ~25,424 rows. Spot-check:
   - 5 random rows for plausibility (mix of IS_OWNER=true/false).
   - Age vs owner-probability spot-check (one young + one older anchor).
   - Income vs property value spot-check (one low + one high income owner).
   - State vs flood zone (FL/LA owners more often in non-X zones).
   - Distribution sanity: IS_OWNER ratio ~62%, property type distribution roughly matches urbanicity bias.

## §5 Self-review checklist

- [ ] Audience predicate `ACCOUNT_TYPE_FLAG = 'PERSON' AND POSTAL_CODE IS NOT NULL AND POSTAL_CODE <> ''` in 4 places (SP `_AUDIENCE_PREDICATE`, audience SQL, coverage SQL, L1 fixture override).
- [ ] Salt `"corelogic"` in SP module constant. Year-stable salt `"corelogic_year"` for LAST_TRANSFER_YEAR + MORTGAGE_RATE_PCT.
- [ ] 9 NULLable columns in DDL match the 9 None-when-non-owner fields in `_row_for`.
- [ ] Quarter-bucketed seed (not month-bucketed).
- [ ] PK is `(ACCOUNT_ID, PROFILE_QUARTER)`, not `PROFILE_MONTH`.
- [ ] No `<<` placeholders left.

## §6 Out of scope

- Real CoreLogic license / parcel-level fidelity.
- Multiple properties per account.
- Property history / sale-event records.
- Real flood maps / wildfire models — state-level heuristic only.
- Rental-side fields.

## §7 Status

Pending implementation. Plans 1-4 shipping live (4 datasets, 49,932 rows total). Plan 5 is the **first quarterly-cadence** dataset and the **first 1:1 emit with NULL-able property fields** — validates that the recipe handles those two patterns before Plans 6-13.
