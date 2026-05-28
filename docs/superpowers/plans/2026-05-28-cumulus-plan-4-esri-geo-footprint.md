# Cumulus Plan 4 — Esri Geo Footprint Implementation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Stand up the fourth per-dataset Cumulus pipeline — Esri-style geographic enrichment data per ZIP code. **First non-account-scoped dataset** in the rollout. SP emits one row per distinct US ZIP per month into `FINS.PUBLIC.ESRI_GEO_FOOTPRINT` (~13,328 rows), federated into Data Cloud as `CumulusEsriGeoFootprint__dlm`.

**Architecture:** Instantiates the dataset template (v1.4.2) with the **§3.1 spec deviations** for branch-scoped audience. Row-factory bias logic + table schema specified in the rowspec attachment.

**Depends on:** Plan 0. Independent of Plans 1-3 — no shared Snowflake objects, no DC stream coupling. Validates that the recipe extends to non-account-scoped datasets (also blueprints Plan 13 / Moody's, which is instrument-scoped).

---

## §1 Placeholder values

| Placeholder | Value |
|---|---|
| `<<PLAN_N>>` | `4` |
| `<<DATASET_SLUG>>` | `esri-geo-footprint` |
| `<<DATASET_SLUG_UNDERSCORE>>` | `esri_geo_footprint` |
| `<<MIMICS_VENDOR>>` | `Esri` |
| `<<DATASET_TABLE>>` | `ESRI_GEO_FOOTPRINT` |
| `<<DATASET_TABLE_LOWER>>` | `esri_geo_footprint` |
| `<<REPO_DIR>>` | `Snowflake_Esri_GeoFootprint` |
| `<<DC_DMO>>` | `CumulusEsriGeoFootprint__dlm` |
| `<<DATASET_SALT>>` | `esri` |
| `<<CADENCE>>` | `MONTHLY` |
| `<<TASK_NAME>>` | `TASK_MONTHLY_ESRI_GEO_FOOTPRINT` |
| `<<TASK_NAME_LOWER>>` | `task_monthly_esri_geo_footprint` |
| `<<SP_NAME>>` | `SP_GENERATE_ESRI_GEO_FOOTPRINT` |
| `<<CRON>>` | `'USING CRON 0 7 1 * * UTC'` |
| `<<AUDIENCE_PREDICATE>>` | **N/A — branch-scoped, see §2 below** |
| `<<COVERAGE_RULE>>` | rows = `COUNT(DISTINCT POSTAL_CODE)` from V_ACCOUNT_ANCHORS where non-null |
| `<<ROW_PK>>` | `(BRANCH_ZIP, PROFILE_MONTH)` — **not ACCOUNT_ID** |
| `<<COLUMN_LIST>>` | See rowspec — 14 columns including `BRANCH_ZIP`, Tapestry segment, geo metrics |

## §2 Audience — non-account-scoped (key deviation)

**Plan 4 does not use `V_ACCOUNT_ANCHORS WHERE <predicate>`.** It aggregates the view to enumerate distinct ZIPs:

```sql
-- AUDIENCE_SQL (the SP reads this)
SELECT POSTAL_CODE, STATE_CODE, COUNTRY_CODE,
       COUNT(DISTINCT ACCOUNT_ID) AS CUSTOMER_COUNT
FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS
WHERE POSTAL_CODE IS NOT NULL
GROUP BY POSTAL_CODE, STATE_CODE, COUNTRY_CODE

-- COVERAGE_SQL (the SP step 4 asserts against)
SELECT COUNT(DISTINCT POSTAL_CODE)
FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS
WHERE POSTAL_CODE IS NOT NULL

-- ACTUAL_SQL
SELECT COUNT(DISTINCT BRANCH_ZIP) FROM FINS.PUBLIC.ESRI_GEO_FOOTPRINT
```

Live probe (2026-05-28): **13,328 distinct US ZIPs** across 23 states. That's the row count the SP must produce.

The BUSINESS over-count warning (Plans 2/3) does **not apply** — Plan 4 isn't BUSINESS-scoped.

## §3 Rowspec attachment

`docs/superpowers/plans/attachments/cumulus-plan-4-esri-geo-footprint-rowspec.md`

Contains:
- 14-column table DDL inputs (PK on `BRANCH_ZIP`, not ACCOUNT_ID)
- 12-segment Tapestry pool
- URBANICITY_TIER heuristic (ZIP first-digit + state override)
- State-level income table (MA/CA/NY/etc. base medians)
- All bias-logic functions for the per-ZIP row factory
- L1 test targets (different from Plans 1-3 — see §4 below)
- The shape of `_row_for_zip(zip, state, country, customer_count, run_ts) -> dict` — input is a tuple, not an anchor dict

## §4 What changes from the v1.4.2 template

The template assumes per-account row factory + audience predicate. Plan 4 deviates substantially in three places — but the **5-step main()** pattern stays the same.

1. **Task 1 (scaffold).** AGENTS.md §Boundaries notes "branch-scoped, not account-scoped" and "no FK from BRANCH_ZIP to ssot__Account__dlm — geo-derived metadata stands alone in DC". Drop the BUSINESS over-count gotcha (doesn't apply). Add a new gotcha: "Audience aggregation must run as ONE GROUP BY in Snowflake — pulling raw V_ACCOUNT_ANCHORS rows into Python and grouping client-side would pull 36K rows into the SP body unnecessarily."

2. **Task 2 (table DDL).** PK is `(BRANCH_ZIP, PROFILE_MONTH)`. `ACCOUNT_ID` is NOT a column. All 14 columns are NOT NULL — there's no NULLable column for this dataset.

3. **Task 3 (L1 tests).** Per-plan conftest provides a **synthetic ZIP fixture** (~30 ZIPs across 8 states, urbanicity-balanced) instead of importing `SAMPLE_ANCHORS` from Cumulus_Common. The 5 property classes from spec §7.2 adapt:
   - **Determinism** — same `(zip, state, country, customer_count, run_ts)` tuple → same dict.
   - **Audience scoping** — `_row_for_zip` raises `ValueError` on None or non-numeric ZIP (input-shape check, not audience predicate).
   - **Boring case** — Suburban mid-income ZIP still emits a row.
   - **Anchor influence** (TWO assertions):
     - State → median income shift: MA ZIPs > MS ZIPs by ≥$15K mean (with 12-month roll).
     - Urbanicity → foot traffic shift: Urban Core ZIPs > Rural ZIPs.
   - **Schema contract** — output dict matches the 14 columns.

4. **Task 4 (SP).** Implementation differs from Plans 1-3:
   - `_row_for_zip(zip_code, state_code, country_code, customer_count, run_ts) -> dict` replaces `_row_for(anchor, run_ts)`.
   - `main()` reads the audience as a `GROUP BY` aggregation (per §2 above). The audience iteration is over Snowpark rows like `(POSTAL_CODE, STATE_CODE, COUNTRY_CODE, CUSTOMER_COUNT)`.
   - `accounts_processed` = `sum(r.CUSTOMER_COUNT for r in audience)` — total customer-coverage, NOT row count. The row count is `len(audience) == 13328`.
   - `_anchor_in_audience` is replaced by an input-shape validator that checks ZIP is non-empty and digits-only.
   - The MERGE PK is `(BRANCH_ZIP, PROFILE_MONTH)`. SQL identical-shape to Plans 2/3 modulo column list.
   - `_merge` uses the same v1.4 `TO_TIMESTAMP_NTZ(GENERATED_AT::NUMBER / 1000000000)` cast.

5. **Task 5 (L2).** Fixture in `tests/integration/test_esri_geo_footprint_sp.sql` materializes a small `V_ACCOUNT_ANCHORS_FIXTURE` with ~10 distinct ZIPs in 4 states, urbanicity-mixed. The audience SQL aggregates this fixture; coverage assertion expects 10 ZIPs in `ESRI_GEO_FOOTPRINT`.

6. **Task 6 (deploy).** Identical to Plans 1-3 — clone Plan 3's `scripts/deploy_sp.py`, swap identifiers. **No special handling for `&`** since "Esri" has no `&`. TASK on `MAIN_WH_XS`, monthly cron, `SP_RETRY_WRAPPER('FINS.PUBLIC.SP_GENERATE_ESRI_GEO_FOOTPRINT()', 2)`.

7. **Task 7 (DC stream + DMO).** API path identical to Plans 1-3. Mapping table:

   | Snowflake | DC field |
   |---|---|
   | BRANCH_ZIP | branchZip__c |
   | STATE_CODE | stateCode__c |
   | COUNTRY_CODE | countryCode__c |
   | PROFILE_MONTH | profileMonth__c |
   | TAPESTRY_SEGMENT_CODE | tapestrySegmentCode__c |
   | TAPESTRY_SEGMENT_NAME | tapestrySegmentName__c |
   | URBANICITY_TIER | urbanicityTier__c |
   | MEDIAN_HOUSEHOLD_INCOME | medianHouseholdIncome__c |
   | WEALTH_INDEX | wealthIndex__c |
   | FOOT_TRAFFIC_INDEX | footTrafficIndex__c |
   | COMMERCIAL_DENSITY_PER_SQ_MI | commercialDensityPerSqMi__c |
   | DISTANCE_TO_NEAREST_BRANCH_MI | distanceToNearestBranchMi__c |
   | MARKET_PENETRATION_PCT | marketPenetrationPct__c |
   | BRANCH_RECOMMENDATION | branchRecommendation__c |
   | GENERATED_AT | generatedAt__c |

   Note: **no `ssot__AccountId__c`** — DMO is not joinable to `ssot__Account__dlm`. Use `BRANCH_ZIP` as the canonical join key for downstream queries (e.g., a calculated insight that joins this DMO to `ssot__Account__dlm` on `branchZip__c = postalCode__c`).

   `PROFILE_MONTH` needs `format: "MM/dd/yyyy"` per the v1.4.1 finding.

8. **Task 8 (L3 smoke).** Verify SP run, ~13,328 rows, sample plausibility (Tapestry codes vary, urbanicity distributes Urban/Suburban/Small Town/Rural, commercial density correlates with urbanicity). Spot-check 3 ZIPs spanning urbanicity tiers — confirm directional bias on income, foot traffic, commercial density, branch distance.

## §5 Self-review checklist

- [ ] No `<<AUDIENCE_PREDICATE>>` placeholder accidentally instantiated as account-scoped — Plan 4 uses GROUP BY aggregation, not WHERE filter.
- [ ] PK `(BRANCH_ZIP, PROFILE_MONTH)` in DDL, MERGE source SELECT, MERGE ON clause.
- [ ] No `ACCOUNT_ID` column in DDL or output dict.
- [ ] Salt `"esri"` in SP module constant only.
- [ ] No BUSINESS over-count warning in the SP (doesn't apply).
- [ ] L1 conftest has its own synthetic ZIP fixture, not `SAMPLE_ANCHORS`.
- [ ] Coverage assertion uses `COUNT(DISTINCT POSTAL_CODE)` and `COUNT(DISTINCT BRANCH_ZIP)`.
- [ ] DC field mapping has no `ssot__AccountId__c`.
- [ ] All 14 columns NOT NULL.

## §6 Out of scope

- Real Esri license / Tapestry license-grade segments.
- Sub-ZIP geographic precision (block-level, drive-time, census tract).
- Real Placer.ai foot-traffic data (synthesized from urbanicity).
- Multi-month time-series (single point-in-time per month).
- Non-US ZIPs (audience filter implicitly drops them).

## §7 Status

Pending implementation. Plans 1-3 shipping live. Plan 4 is the parallel-track Tier-2 dataset that proves the recipe handles non-account-scoped audiences (also blueprints Plan 13 Moody's instrument-scoped variant).
