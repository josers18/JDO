# AGENTS.md — Snowflake_Esri_GeoFootprint

Synthetic Esri-style geographic enrichment dataset for the Cumulus FSC demo. One of 13. **Branch-scoped, NOT account-scoped — first non-account-scoped dataset in the rollout.**

> **v1.x multi-org-additive (Phase A, 2026-05-29 commit `c9119d32`).** Table now leads with `ORG_ID VARCHAR(18) NOT NULL DEFAULT 'JDO'` as the first column; PK promoted from `(BRANCH_ZIP, PROFILE_MONTH)` to `(ORG_ID, BRANCH_ZIP, PROFILE_MONTH)`. SP row factory stamps `"ORG_ID": anchor.get("ORG_ID", "JDO")` as the first key; MERGE source SELECT, ON, INSERT lists all lead with ORG_ID; UPDATE SET deliberately skips ORG_ID (PK-component, immutable). **AUDIENCE_SQL also updated**: `GROUP BY` adds ORG_ID alongside POSTAL_CODE/STATE_CODE/COUNTRY_CODE, and coverage uses `COUNT(DISTINCT (ORG_ID || '|' || BRANCH_ZIP))` so ZIPs across orgs don't collide. Backward-compatible — JDO loaders continue working unchanged via DEFAULT. Multi-org rollout runbook: `Snowflake_Cumulus_Common/docs/ROLLOUT.md`.

## Boundaries
- Owns: `FINS.PUBLIC.ESRI_GEO_FOOTPRINT`, `SP_GENERATE_ESRI_GEO_FOOTPRINT`, `TASK_MONTHLY_ESRI_GEO_FOOTPRINT`, and the DC Data Stream / DLO / DMO that federates this table.
- Does NOT own: `V_ACCOUNT_ANCHORS`, `MASTER_ACCOUNTS`, the seed/coverage helpers — see `Snowflake_Cumulus_Common`.
- Does NOT own any outbound Snowflake share. DC reads through via the existing "Snowflake (Federate / Zero Copy)" connector.
- **Branch-scoped, not account-scoped** — rows are keyed by `BRANCH_ZIP`, NOT `ACCOUNT_ID`. The geo metadata stands alone in DC; **no FK from `BRANCH_ZIP` to `ssot__Account__dlm`**. Downstream joins are soft (`branchZip__c = postalCode__c`).

## Conventions
- The SP uses `cumulus_common.seed_for(...)` for determinism with salt `"esri"`.
- The SP uses `cumulus_common.assert_coverage(session, expected_sql, actual_sql)` in step 4 — canonical "coverage gap: N missing rows" message.
- The MERGE replaces on PK `(BRANCH_ZIP, PROFILE_MONTH)`. Re-runs are idempotent within a calendar month.
- Audience SQL is a `GROUP BY POSTAL_CODE, STATE_CODE, COUNTRY_CODE` aggregation of `V_ACCOUNT_ANCHORS` — NOT a `WHERE` predicate. The SP iterates over ZIP-level rows (one per distinct ZIP) with a pre-aggregated `CUSTOMER_COUNT`.
- The 12 Esri Tapestry-style segments (TC, EE, ND, BS, SF, MD, SH, RD, RC, HM, MS, RH) crossed with 4 urbanicity tiers (Urban Core, Suburban, Small Town, Rural) drive the bias logic for income, foot traffic, commercial density, and branch distance. Recognisable as Esri Tapestry shape, NOT a license-grade Esri dataset. See rowspec.
- `accounts_processed` in `TASK_EXECUTION_LOG` is the **rolled-up customer count across all ZIPs** (sum of `CUSTOMER_COUNT`), NOT the row count. Row count is `len(audience) == 13328`.

## Tests
- L1 (pytest): determinism, input-shape validation (ZIP non-empty + digits-only), boring case, anchor influence (state → median income, urbanicity → foot traffic), schema contract.
- L2 (`tests/integration/`): deploys SP into a fixture-backed schema with `V_ACCOUNT_ANCHORS_FIXTURE` (~10 distinct ZIPs in 4 states, urbanicity-mixed); asserts coverage + idempotency.
- L3 (manual smoke, post-deploy): one CALL against jdo-uqj0jr; row count ~13,328; sample plausibility (Tapestry codes vary, urbanicity distributes Urban/Suburban/Small Town/Rural, commercial density correlates with urbanicity); spot-check 3 ZIPs spanning urbanicity tiers.

## Gotchas
- **Branch-scoped, not account-scoped.** No `ACCOUNT_ID` column anywhere — DDL, MERGE, output dict, DC mapping. The PK is `(BRANCH_ZIP, PROFILE_MONTH)`. The DC DMO has no `ssot__AccountId__c` field; downstream queries that need the account must soft-join `branchZip__c = ssot__Account__dlm.postalCode__c`.
- **Audience aggregation runs server-side as ONE GROUP BY.** Pulling raw `V_ACCOUNT_ANCHORS` rows into the Snowpark Python body and grouping client-side would drag ~36K rows over the wire unnecessarily — the SP instead lets Snowflake hand back ~13,328 pre-aggregated tuples.
- The audience aggregation lives in BOTH `AUDIENCE_SQL` (the SP iterates this) and `COVERAGE_SQL` (step 4 asserts against this). They MUST stay in sync — drift is the sneakiest way to silently produce a coverage gap. Coverage uses `COUNT(DISTINCT POSTAL_CODE)` vs `COUNT(DISTINCT BRANCH_ZIP)`.
- A given ZIP's Tapestry segment / urbanicity / income / market-penetration may flip month-over-month with the seed roll — that's intentional (random walk simulating real geo-demographic dynamics, including market penetration shifting as customer counts shift in the underlying audience).
- The DLO → DMO field mapping must be completed in DC Setup UI for fully-custom DMOs (the API endpoint returns 500). See the recipe at `../Snowflake_Claritas_Demographics/docs/dc-setup-recipe.md` from Plan 1 T7.
- Snowflake DATE columns auto-discover as `MM/dd/yyyy` in the DC data-stream POST body. Use that format for `PROFILE_MONTH`'s `sourceFields` entry, NOT `yyyy-MM-dd`.
- `write_pandas(auto_create_table=True)` mis-types `datetime64[ns]` as `NUMBER(38,0)`. The MERGE source SELECT casts back via `TO_TIMESTAMP_NTZ(GENERATED_AT::NUMBER / 1000000000)` — see template Task 4 §_merge.
- 14 columns total + `GENERATED_AT` = 15 columns; **all NOT NULL**. There's no NULLable column for this dataset — Plans 2/3 had `ULTIMATE_PARENT_DUNS` etc., Plan 4 does not.
- L1 conftest provides a synthetic ZIP fixture (~30 ZIPs across 8 states, urbanicity-balanced) — `SAMPLE_ANCHORS` from Cumulus_Common is NOT used here (wrong shape: anchor dict vs. ZIP tuple).
