# AGENTS.md — Snowflake_CoreLogic_Property

Synthetic CoreLogic-style property records dataset for the Cumulus FSC demo. One of 13. **Account-scoped with quarterly cadence — first quarterly-cadence dataset.**

> **v1.x multi-org-additive (Phase A, 2026-05-29 commit `c9119d32`).** Table now leads with `ORG_ID VARCHAR(18) NOT NULL DEFAULT 'JDO'` as the first column; PK promoted from `(ACCOUNT_ID, PROFILE_QUARTER)` to `(ORG_ID, ACCOUNT_ID, PROFILE_QUARTER)`. SP row factory stamps `"ORG_ID": anchor.get("ORG_ID", "JDO")` as the first key; MERGE source SELECT, ON, INSERT lists all lead with ORG_ID; UPDATE SET deliberately skips ORG_ID (PK-component, immutable). Backward-compatible — JDO loaders continue working unchanged via DEFAULT. Multi-org rollout runbook: `Snowflake_Cumulus_Common/docs/ROLLOUT.md`.

## Boundaries
- Owns: `FINS.PUBLIC.CORELOGIC_PROPERTY`, `SP_GENERATE_CORELOGIC_PROPERTY`, `TASK_QUARTERLY_CORELOGIC_PROPERTY`, and the DC Data Stream / DLO / DMO that federates this table.
- Does NOT own: `V_ACCOUNT_ANCHORS`, `MASTER_ACCOUNTS`, the seed/coverage helpers — see `Snowflake_Cumulus_Common`.
- Does NOT own any outbound Snowflake share. DC reads through via the existing "Snowflake (Federate / Zero Copy)" connector.
- **Account-scoped** — rows are keyed by `ACCOUNT_ID`, with FK to `ssot__Account__dlm`. One row per PERSON account per quarter.

## Conventions
- The SP uses `cumulus_common.seed_for(...)` for determinism with salt `"corelogic"` (quarter-bucketed).
- **Year-stable seed for `LAST_TRANSFER_YEAR` and `MORTGAGE_RATE_PCT`:** use a separate year-stable salt `"corelogic_year"` so they're stable across quarters within a year (real deeds don't change; fixed mortgages don't reprice quarter-to-quarter). Seed key: `account_id + "_year"`, bucket: `datetime(run_ts.year, 1, 1)`.
- The SP uses `cumulus_common.assert_coverage(session, expected_sql, actual_sql)` in step 4 — canonical "coverage gap: N missing rows" message.
- The MERGE replaces on PK `(ACCOUNT_ID, PROFILE_QUARTER)`. Re-runs are idempotent within a calendar quarter.
- Audience SQL is a `WHERE ACCOUNT_TYPE_FLAG = 'PERSON' AND POSTAL_CODE IS NOT NULL AND POSTAL_CODE <> ''` predicate on `V_ACCOUNT_ANCHORS` — this is the v1.5 defensive ZIP filter (defensive guard, not active filter in current data). The SP iterates over ~25,424 PERSON anchors per quarter.
- CoreLogic property records (deeds, valuations, mortgage status, HELOC opportunity) drive the bias logic. Recognisable as CoreLogic-style property shape, NOT license-grade CoreLogic data. See rowspec.
- `accounts_processed` in `TASK_EXECUTION_LOG` is the **distinct account count**, equal to the row count (1:1 emit rate per PERSON per quarter).
- **9 NULLable property columns when `IS_OWNER=false`:** PRIMARY_PROPERTY_TYPE, ESTIMATED_PROPERTY_VALUE, OUTSTANDING_MORTGAGE_BALANCE, LOAN_TO_VALUE_PCT, EQUITY_USD, MORTGAGE_RATE_PCT, LAST_TRANSFER_YEAR, HELOC_OPPORTUNITY_SCORE. When `IS_OWNER=false`, these are all NULL. LIEN_COUNT, FLOOD_ZONE_CODE, WILDFIRE_RISK_SCORE are always populated.

## Tests
- L1 (pytest): determinism, input-shape validation (ACCOUNT_ID non-empty), boring case (renter + owner), anchor influence (age → owner_prob, income → property_value, state → flood_zone), quarter-bucketed seed produces byte-identical rows on re-runs, schema contract.
- L2 (`tests/integration/`): deploys SP into a fixture-backed schema with `V_ACCOUNT_ANCHORS_FIXTURE` (~12 PERSON + 2 BUSINESS in 4 states, age/income-balanced); asserts coverage + idempotency + IS_OWNER=true and IS_OWNER=false both present in output + NULLable columns NULL when IS_OWNER=false.
- L3 (manual smoke, post-deploy): one CALL against jdo-uqj0jr; row count ~25,424; sample plausibility (IS_OWNER ratio ~62%, property type distribution matches urbanicity bias, flood zones correlate with state); spot-check 5 random rows for mix of IS_OWNER=true/false, age vs owner-probability, income vs property value, state vs flood zone.

## Gotchas
- **Account-scoped with quarterly cadence.** Rows are keyed by `(ACCOUNT_ID, PROFILE_QUARTER)`, NOT `(ACCOUNT_ID, PROFILE_MONTH)`. The `PROFILE_QUARTER` value is the first-of-quarter date (Jan 1, Apr 1, Jul 1, or Oct 1).
- **9 NULLable property columns when IS_OWNER=false.** When `IS_OWNER=false`, the columns PRIMARY_PROPERTY_TYPE, ESTIMATED_PROPERTY_VALUE, OUTSTANDING_MORTGAGE_BALANCE, LOAN_TO_VALUE_PCT, EQUITY_USD, MORTGAGE_RATE_PCT, LAST_TRANSFER_YEAR, HELOC_OPPORTUNITY_SCORE must all be NULL. LIEN_COUNT, FLOOD_ZONE_CODE, WILDFIRE_RISK_SCORE are always non-NULL (renters still have flood/wildfire risk).
- **Quarter-bucketed seed, not month-bucketed.** `seed_for(account_id, "corelogic", _quarter_start(run_ts))` where `_quarter_start` returns `datetime(year, ((month-1)//3)*3+1, 1)`. Mid-quarter re-runs (e.g., Apr 15) produce identical `IS_OWNER` and property values as Apr 1 run.
- **Year-stable seed for LAST_TRANSFER_YEAR and MORTGAGE_RATE_PCT.** Use `seed_for(account_id + "_year", "corelogic_year", datetime(run_ts.year, 1, 1))` for these two derivations specifically. They must NOT change quarter-to-quarter within the same calendar year (a deed transfer year is immutable; a fixed-rate mortgage doesn't reprice).
- **Audience predicate uses v1.5 defensive ZIP filter:** `POSTAL_CODE IS NOT NULL AND POSTAL_CODE <> ''`. Currently not dropping any rows, but is the canonical pattern going forward (defensive guard against silent empty-string ZIPs).
- The MERGE handles 9 NULLable columns correctly — write_pandas + MERGE source SELECT pattern is unchanged from Plans 1-4.
- The `write_pandas(auto_create_table=True)` mis-types `datetime64[ns]` as `NUMBER(38,0)`. The MERGE source SELECT casts back via `TO_TIMESTAMP_NTZ(GENERATED_AT::NUMBER / 1000000000)` — see template Task 4 §_merge.
- 15 columns total: 7 NOT NULL (ACCOUNT_ID, PROFILE_QUARTER, IS_OWNER, LIEN_COUNT, FLOOD_ZONE_CODE, WILDFIRE_RISK_SCORE, GENERATED_AT) + 8 NULLable (PRIMARY_PROPERTY_TYPE, ESTIMATED_PROPERTY_VALUE, OUTSTANDING_MORTGAGE_BALANCE, LOAN_TO_VALUE_PCT, EQUITY_USD, MORTGAGE_RATE_PCT, LAST_TRANSFER_YEAR, HELOC_OPPORTUNITY_SCORE).
- L1 conftest provides a synthetic anchor fixture — `SAMPLE_ANCHORS` from Cumulus_Common IS used here (14-anchor set: 12 PERSON + 2 BUSINESS spanning age bands, income tiers, states).
- The DLO → DMO field mapping must be completed in DC Setup UI for fully-custom DMOs (the API endpoint returns 500). See the recipe at `../Snowflake_Claritas_Demographics/docs/dc-setup-recipe.md` from Plan 1 T7.
- Snowflake DATE columns auto-discover as `MM/dd/yyyy` in the DC data-stream POST body. Use that format for `PROFILE_QUARTER`'s `sourceFields` entry, NOT `yyyy-MM-dd`.
