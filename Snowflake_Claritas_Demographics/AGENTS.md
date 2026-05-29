# AGENTS.md — Snowflake_Claritas_Demographics

Synthetic Claritas-style dataset for the Cumulus FSC demo. One of 13.

> **v1.x multi-org-additive (Phase A, 2026-05-29 commit `c9119d32`).** Table now leads with `ORG_ID VARCHAR(18) NOT NULL DEFAULT 'JDO'` as the first column; PK promoted from `(ACCOUNT_ID, PROFILE_MONTH)` to `(ORG_ID, ACCOUNT_ID, PROFILE_MONTH)`. SP row factory stamps `"ORG_ID": anchor.get("ORG_ID", "JDO")` as the first key; MERGE source SELECT, ON, INSERT lists all lead with ORG_ID; UPDATE SET deliberately skips ORG_ID (PK-component, immutable). Backward-compatible — JDO loaders continue working unchanged via DEFAULT. Multi-org rollout runbook: `Snowflake_Cumulus_Common/docs/ROLLOUT.md`.

## Boundaries
- Owns: `FINS.PUBLIC.CLARITAS_DEMOGRAPHICS`, `SP_GENERATE_CLARITAS_DEMOGRAPHICS`, `TASK_MONTHLY_CLARITAS_DEMOGRAPHICS`, and the DC Data Stream / DLO / DMO that federates this table.
- Does NOT own: `V_ACCOUNT_ANCHORS`, `MASTER_ACCOUNTS`, the seed/coverage helpers — see `Snowflake_Cumulus_Common`.
- Does NOT own any outbound Snowflake share. DC reads through via the existing "Snowflake (Federate / Zero Copy)" connector.

## Conventions
- The SP uses `cumulus_common.seed_for(...)` for determinism with salt `"claritas"`.
- The SP uses `cumulus_common.assert_coverage(session, expected_sql, actual_sql)` in step 4 — the canonical "coverage gap: N missing rows" message lives there.
- The MERGE replaces on PK `(ACCOUNT_ID, PROFILE_MONTH)`. Re-runs are idempotent within a calendar month.
- Audience SQL uses `SELECT DISTINCT *` to defend against the 1.7% MASTER_ACCOUNTS dupe pattern documented in the umbrella spec §3 v1.2.

## Tests
- L1 (pytest, `tests/test_claritas_demographics_row_factory.py`): pure-function tests covering determinism, audience scoping, boring-case coverage, anchor influence (low vs high income → different PRIZM distribution), schema contract.
- L2 (`tests/integration/`): deploys SP into `FINS.TEST` with a fixture-backed `V_ACCOUNT_ANCHORS` view, runs the SP, asserts coverage + idempotency + log row.
- L3 (manual smoke, post-deploy): one run against `jdo-uqj0jr`, then row count ≈ 25K + sample plausibility.

## Gotchas
- Audience predicate `ACCOUNT_TYPE_FLAG = 'PERSON'` lives in BOTH `AUDIENCE_SQL` and `COVERAGE_SQL` constants in the SP. They MUST stay in sync — drift is the sneakiest way to silently produce a coverage gap.
- The 12 PRIZM segment codes (UC, MB, YA, MS, PP, BB, CR, CD, SS, HR, FS, MT) are a recognisable subset — NOT a license-grade Claritas Premier mapping. See rowspec.
- A given account's PRIZM_SEGMENT_CODE may flip month-over-month with the seed roll — that's intentional (random walk simulating life changes), not a bug.
