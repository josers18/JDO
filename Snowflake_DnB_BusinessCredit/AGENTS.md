# AGENTS.md — Snowflake_DnB_BusinessCredit

Synthetic D&B-style business credit dataset for the Cumulus FSC demo. One of 13. **BUSINESS-scoped (same audience as Plan 2 MSCI).**

## Boundaries
- Owns: `FINS.PUBLIC.DNB_BUSINESS_CREDIT`, `SP_GENERATE_DNB_BUSINESS_CREDIT`, `TASK_MONTHLY_DNB_BUSINESS_CREDIT`, and the DC Data Stream / DLO / DMO that federates this table.
- Does NOT own: `V_ACCOUNT_ANCHORS`, `MASTER_ACCOUNTS`, the seed/coverage helpers — see `Snowflake_Cumulus_Common`.
- Does NOT own any outbound Snowflake share. DC reads through via the existing "Snowflake (Federate / Zero Copy)" connector.

## Conventions
- The SP uses `cumulus_common.seed_for(...)` for determinism with salt `"dnb"`.
- The SP uses `cumulus_common.assert_coverage(session, expected_sql, actual_sql)` in step 4 — canonical "coverage gap: N missing rows" message.
- The MERGE replaces on PK `(ACCOUNT_ID, PROFILE_MONTH)`. Re-runs are idempotent within a calendar month.
- Audience SQL uses `SELECT DISTINCT *` to defend against the 1.7% MASTER_ACCOUNTS dupe pattern (spec §3 v1.2).
- The 11 D&B financial-strength tiers (5A, 4A, 3A, 2A, 1A, BA, BB, CB, CC, DC, DD) × 4 composite-risk values produce 44 valid `<tier><composite>` ratings (e.g. `5A1`, `BA3`). Recognisable as D&B's canonical Rating system, NOT a license-grade D&B dataset. See rowspec.
- The SP logs a non-fatal warning to `TASK_EXECUTION_LOG.ERROR_MESSAGE` when `accounts_processed > 10000` (BUSINESS over-count per spec §3 v1.2 finding #3 — real CRM count is closer to 5K).

## Tests
- L1 (pytest): determinism, audience scoping (BUSINESS), boring case, anchor influence (revenue → tier + industry → PAYDEX), schema contract.
- L2 (`tests/integration/`): deploys SP into a fixture-backed schema, asserts coverage + idempotency.
- L3 (manual smoke, post-deploy): one CALL against jdo-uqj0jr; row count ~12K (or close); sample plausibility; industry vs PAYDEX spot-check across Construction / Finance / Healthcare; DUNS year-stability spot-check.

## Gotchas
- Audience predicate `ACCOUNT_TYPE_FLAG = 'BUSINESS'` lives in BOTH `AUDIENCE_SQL` and `COVERAGE_SQL` constants. They MUST stay in sync — drift is the sneakiest way to silently produce a coverage gap.
- BUSINESS over-count is expected (~12K instead of ~5K). The SP warns but does NOT fail — the long-term fix is upstream `PersonBirthdate__c` backfill, not a view change. See spec §3 v1.2 finding #3.
- A given account's D&B tier / composite / PAYDEX may flip month-over-month with the seed roll — that's intentional (random walk simulating real credit-rating dynamics).
- The DLO → DMO field mapping must be completed in DC Setup UI for fully-custom DMOs (the API endpoint returns 500). See the recipe at `../Snowflake_Claritas_Demographics/docs/dc-setup-recipe.md` from Plan 1 T7.
- Snowflake DATE columns auto-discover as `MM/dd/yyyy` in the DC data-stream POST body. Use that format for `PROFILE_MONTH`'s sourceFields entry, NOT `yyyy-MM-dd`.
- `write_pandas(auto_create_table=True)` mis-types `datetime64[ns]` as `NUMBER(38,0)`. The MERGE source SELECT casts back via `TO_TIMESTAMP_NTZ(GENERATED_AT::NUMBER / 1000000000)` — see template Task 4 §_merge.
- 15 columns total; only `ULTIMATE_PARENT_DUNS` is NULLable (NULL when `CORPORATE_FAMILY_SIZE = 1`, i.e. standalone businesses).
- `DUNS_NUMBER` uses a separate `'duns_id'` salt and a year-stable seed (`datetime(run_ts.year, 1, 1)`), NOT the month-stable seed used by every other field. Stable across months for a given account/year. Year-rollover is allowed to roll a new DUNS — intentional simplification, not a real-D&B-fidelity feature (real DUNS are permanent for life).
