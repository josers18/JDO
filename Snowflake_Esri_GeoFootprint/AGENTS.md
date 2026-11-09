# AGENTS.md — Snowflake_Esri_GeoFootprint

Synthetic Esri-style geographic enrichment dataset for the Cumulus FSC demo. One of 13. **Branch-scoped, NOT account-scoped — first non-account-scoped dataset in the rollout.**

> **v1.x multi-org (Phase A, 2026-05-29 `c9119d32`; checked against live 2026-11-09).** Live table: PK `RECORD_ID` (`UUID_STRING()` default, the row id); UNIQUE `(BRANCH_ZIP, PROFILE_MONTH)` (`RELY = false`, not enforced, no `ORG_ID`, which is cosmetic); `ORG_ID VARCHAR(18)` nullable, `DEFAULT 'JDO'`, added near the end of the column list (not first). The row factory stamps `"ORG_ID": org_id` on each branch row. **AUDIENCE_SQL** groups by ORG_ID alongside POSTAL_CODE/STATE_CODE/COUNTRY_CODE, and coverage uses `COUNT(DISTINCT (ORG_ID || '|' || BRANCH_ZIP))` so ZIPs across orgs don't collide. The deployed MERGE `ON` is `ORG_ID, BRANCH_ZIP, PROFILE_MONTH`, and that is what keeps rows unique; UPDATE SET skips `ORG_ID`. Multi-org rollout runbook: `Snowflake_Cumulus_Common/docs/ROLLOUT.md` (A6).

## Boundaries
- Owns: `DATA_JEDAIS.FINS__PUBLIC.ESRI_GEO_FOOTPRINT`, `SP_GENERATE_ESRI_GEO_FOOTPRINT`, `TASK_MONTHLY_ESRI_GEO_FOOTPRINT`, and the DC Data Stream / DLO / DMO that federates this table.
- Does NOT own: `V_ACCOUNT_ANCHORS`, `MASTER_ACCOUNTS`, the seed/coverage helpers — see `Snowflake_Cumulus_Common`.
- Does NOT own any outbound Snowflake share. DC reads through via the existing "Snowflake (Federate / Zero Copy)" connector.
- **Branch-scoped, not account-scoped** — rows are keyed by `BRANCH_ZIP`, NOT `ACCOUNT_ID`. The geo metadata stands alone in DC; **no FK from `BRANCH_ZIP` to `ssot__Account__dlm`**. Downstream joins are soft (`branchZip__c = postalCode__c`).

## Conventions
- The SP uses `cumulus_common.seed_for(...)` for determinism with salt `"esri"`.
- The SP uses `cumulus_common.assert_coverage(session, expected_sql, actual_sql)` in step 4 — canonical "coverage gap: N missing rows" message.
- The MERGE replaces on `(ORG_ID, BRANCH_ZIP, PROFILE_MONTH)` (its `ON`; the table PK is `RECORD_ID`). Re-runs are idempotent within a calendar month.
- Audience SQL is a `GROUP BY POSTAL_CODE, STATE_CODE, COUNTRY_CODE` aggregation of `V_ACCOUNT_ANCHORS` — NOT a `WHERE` predicate. The SP iterates over ZIP-level rows (one per distinct ZIP) with a pre-aggregated `CUSTOMER_COUNT`.
- The 12 Esri Tapestry-style segments (TC, EE, ND, BS, SF, MD, SH, RD, RC, HM, MS, RH) crossed with 4 urbanicity tiers (Urban Core, Suburban, Small Town, Rural) drive the bias logic for income, foot traffic, commercial density, and branch distance. Recognisable as Esri Tapestry shape, NOT a license-grade Esri dataset. See rowspec.
- `accounts_processed` in `TASK_EXECUTION_LOG` is the **rolled-up customer count across all ZIPs** (sum of `CUSTOMER_COUNT`), NOT the row count. Row count is `len(audience) == 13328`.

## Tests
- L1 (pytest): determinism, input-shape validation (ZIP non-empty + digits-only), boring case, anchor influence (state → median income, urbanicity → foot traffic), schema contract.
- L2 (`tests/integration/test_esri_geo_footprint_sp.sql`): clones the deployed SP via GET_DDL + REPLACE onto `*_FIXTURE` names in `DATA_JEDAIS.FINS__PUBLIC` (dataset, staging, task name, anchor view; a guard aborts if any live name survives), CALLs it against a 32-anchor fixture view (11 audience rows incl. a second org on a shared ZIP, empty/NULL ZIPs, a 'USA' country code), and asserts 20 checks: coverage, org isolation, vocabularies/tier bands, decision tree, idempotency, determinism, log rows. Passed live 2026-11-09 (20/20).
- L3 (manual smoke, post-deploy): one CALL against jdo-uqj0jr; row count ~13,328; sample plausibility (Tapestry codes vary, urbanicity distributes Urban/Suburban/Small Town/Rural, commercial density correlates with urbanicity); spot-check 3 ZIPs spanning urbanicity tiers.

## Gotchas
- **Branch-scoped, not account-scoped.** No `ACCOUNT_ID` column anywhere — DDL, MERGE, output dict, DC mapping. The natural key is `(BRANCH_ZIP, PROFILE_MONTH)` (a `RELY = false` UNIQUE key; the table PK is `RECORD_ID`). The DC DMO has no `ssot__AccountId__c` field; downstream queries that need the account must soft-join `branchZip__c = ssot__Account__dlm.postalCode__c`.
- **Audience aggregation runs server-side as ONE GROUP BY.** Pulling raw `V_ACCOUNT_ANCHORS` rows into the Snowpark Python body and grouping client-side would drag ~36K rows over the wire unnecessarily — the SP instead lets Snowflake hand back ~13,328 pre-aggregated tuples.
- The audience aggregation lives in BOTH `AUDIENCE_SQL` (the SP iterates this) and `COVERAGE_SQL` (step 4 asserts against this). They MUST stay in sync — drift is the sneakiest way to silently produce a coverage gap. Coverage uses `COUNT(DISTINCT POSTAL_CODE)` vs `COUNT(DISTINCT BRANCH_ZIP)`.
- A given ZIP's Tapestry segment / urbanicity / income / market-penetration may flip month-over-month with the seed roll — that's intentional (random walk simulating real geo-demographic dynamics, including market penetration shifting as customer counts shift in the underlying audience).
- The DLO → DMO field mapping must be completed in DC Setup UI for fully-custom DMOs (the API endpoint returns 500). See the recipe at `../Snowflake_Claritas_Demographics/docs/dc-setup-recipe.md` from Plan 1 T7.
- Snowflake DATE columns auto-discover as `MM/dd/yyyy` in the DC data-stream POST body. Use that format for `PROFILE_MONTH`'s `sourceFields` entry, NOT `yyyy-MM-dd`.
- `write_pandas(auto_create_table=True)` mis-types `datetime64[ns]` as `NUMBER(38,0)`. The MERGE source SELECT casts back via `TO_TIMESTAMP_NTZ(GENERATED_AT::NUMBER / 1000000000)` — see template Task 4 §_merge.
- 17 columns in the live table (15 contract columns incl. `GENERATED_AT`, plus `ORG_ID` and `RECORD_ID`): 16 NOT NULL, and `ORG_ID` is the only NULLable column. No data column is NULLable — Plans 2/3 had `ULTIMATE_PARENT_DUNS` etc., Plan 4 does not.
- L1 conftest provides a synthetic ZIP fixture (~30 ZIPs across 8 states, urbanicity-balanced) — `SAMPLE_ANCHORS` from Cumulus_Common is NOT used here (wrong shape: anchor dict vs. ZIP tuple).
