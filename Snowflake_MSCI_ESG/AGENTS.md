# AGENTS.md — Snowflake_MSCI_ESG

Synthetic MSCI-style ESG dataset for the Cumulus FSC demo. One of 13. **First BUSINESS-scoped dataset.**

> **v1.x multi-org-additive (Phase A, 2026-05-29 commit `c9119d32`).** Table now leads with `ORG_ID VARCHAR(18) NOT NULL DEFAULT 'JDO'` as the first column; PK promoted from `(ACCOUNT_ID, PROFILE_MONTH)` to `(ORG_ID, ACCOUNT_ID, PROFILE_MONTH)`. SP row factory stamps `"ORG_ID": anchor.get("ORG_ID", "JDO")` as the first key; MERGE source SELECT, ON, INSERT lists all lead with ORG_ID; UPDATE SET deliberately skips ORG_ID (PK-component, immutable). Backward-compatible — JDO loaders continue working unchanged via DEFAULT. Multi-org rollout runbook: `Snowflake_Cumulus_Common/docs/ROLLOUT.md`.

## Boundaries
- Owns: `FINS.PUBLIC.MSCI_ESG_SCORES`, `SP_GENERATE_MSCI_ESG_SCORES`, `TASK_MONTHLY_MSCI_ESG_SCORES`, and the DC Data Stream / DLO / DMO that federates this table.
- Does NOT own: `V_ACCOUNT_ANCHORS`, `MASTER_ACCOUNTS`, the seed/coverage helpers — see `Snowflake_Cumulus_Common`.
- Does NOT own any outbound Snowflake share. DC reads through via the existing "Snowflake (Federate / Zero Copy)" connector.

## Conventions
- The SP uses `cumulus_common.seed_for(...)` for determinism with salt `"msci"`.
- The SP uses `cumulus_common.assert_coverage(session, expected_sql, actual_sql)` in step 4 — canonical "coverage gap: N missing rows" message.
- The MERGE replaces on PK `(ACCOUNT_ID, PROFILE_MONTH)`. Re-runs are idempotent within a calendar month.
- Audience SQL uses `SELECT DISTINCT *` to defend against the 1.7% MASTER_ACCOUNTS dupe pattern (spec §3 v1.2).
- The 7 MSCI rating codes (AAA, AA, A, BBB, BB, B, CCC) are a recognisable cover, NOT a license-grade MSCI dataset. See rowspec.
- The SP logs a non-fatal warning to `TASK_EXECUTION_LOG.ERROR_MESSAGE` when `accounts_processed > 10000` (BUSINESS over-count per spec §3 v1.2 finding #3 — real CRM count is closer to 5K).

## Tests
- L1 (pytest): determinism, audience scoping (BUSINESS), boring case, anchor influence (revenue → rating + industry → environmental score), schema contract.
- L2 (`tests/integration/`): deploys SP into a fixture-backed schema, asserts coverage + idempotency.
- L3 (manual smoke, post-deploy): one CALL against jdo-uqj0jr; row count ~12K (or close); sample plausibility; industry vs environmental-score spot-check across Energy / Tech / Finance.

## Gotchas
- Audience predicate `ACCOUNT_TYPE_FLAG = 'BUSINESS'` lives in BOTH `AUDIENCE_SQL` and `COVERAGE_SQL` constants. They MUST stay in sync — drift is the sneakiest way to silently produce a coverage gap.
- BUSINESS over-count is expected (~12K instead of ~5K). The SP warns but does NOT fail — the long-term fix is upstream `PersonBirthdate__c` backfill, not a view change. See spec §3 v1.2 finding #3.
- A given account's MSCI rating may flip month-over-month with the seed roll — that's intentional (random walk simulating real ESG rating dynamics).
- The DLO → DMO field mapping must be completed in DC Setup UI for fully-custom DMOs (the API endpoint returns 500). See the recipe at `../Snowflake_Claritas_Demographics/docs/dc-setup-recipe.md` from Plan 1 T7.
- Snowflake DATE columns auto-discover as `MM/dd/yyyy` in the DC data-stream POST body. Use that format for `PROFILE_MONTH`'s sourceFields entry, NOT `yyyy-MM-dd`.
- `write_pandas(auto_create_table=True)` mis-types `datetime64[ns]` as `NUMBER(38,0)`. The MERGE source SELECT casts back via `TO_TIMESTAMP_NTZ(GENERATED_AT::NUMBER / 1000000000)` — see template Task 4 §_merge.
- 14 columns total; only `TOP_CONTROVERSY_CATEGORY` is NULLable (NULL when controversy_count = 0).
