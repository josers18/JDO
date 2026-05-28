# AGENTS.md — Snowflake_Cumulus_Common

This sister-project owns the shared infrastructure for all 13 Cumulus dataset pipelines.
Pattern mirrors `Snowflake_CSAT_NPS/`.

## Boundaries

- Owns: `FINS.PUBLIC.V_ACCOUNT_ANCHORS`, `cumulus_common` Python pkg, shared anchor fixture.
- Does NOT own: any dataset table, any generator SP, any TASK definition. Those live in the per-dataset sister-projects.
- Does NOT own any outbound Snowflake share. DC ingests each `FINS.PUBLIC.<DATASET_TABLE>` via the existing "Snowflake (Federate / Zero Copy)" connector — per-dataset DC stream setup lives in each per-dataset plan's Task 8.

## Conventions

- DDL for shared objects goes in `schemas/` (views).
- Python helpers go under `cumulus_common/` and are importable as `from cumulus_common.seed import seed_for`.
- Every helper has a pytest test alongside in `tests/`.
- Snowflake objects use the schema-qualified form `FINS.PUBLIC.<NAME>` in DDL — never rely on session schema.

## Gotchas

- `V_ACCOUNT_ANCHORS` reads from the `FINSDC3_DATASHARE` inbound share. If a column rename happens upstream, the view fails to compile — re-deploy with the new column name.
- `MASTER_ACCOUNTS.SNAPSHOT_DATE` only carries today's roster; the view's `WHERE SNAPSHOT_DATE = MAX(...)` clause pins to that. Don't change without thinking through historical-cohort generators (none exist yet).
- Per-dataset salts in the seed function are NOT optional — without them, two datasets seeded only by ACCOUNT_ID produce correlated random draws (same accounts skew the same direction in every dataset).
- **MASTER_ACCOUNTS has duplicate ACCOUNT_IDs within today's snapshot** (~1.7%, 632/36,813 as of 2026-05-28). All audience SQL in per-dataset SPs MUST use `SELECT DISTINCT ACCOUNT_ID` or `GROUP BY ACCOUNT_ID` defensively. See spec §3 v1.2.
- **CLIENT_CATEGORY has 9 distinct values, not 4.** Plans 3/8/10/12 filter by category — probe the live values before locking the predicate; prefer `IN (...)` over `=`. The 4 canonical values cover most rows but not all.
- **ACCOUNT_TYPE_FLAG misclassifies ~12K accounts as BUSINESS** because the upstream Phase 4 backfill didn't fully populate `PersonBirthdate__c` on Person Accounts. Plans 2/9/11 (BUSINESS-scoped) should warn if `BUSINESS_actual > BUSINESS_expected × 2`. Long-term fix is upstream backfill, not a view change.

## Tests

```bash
pytest tests/ -v        # L1 only — pure-function tests
```

L2 integration runs in CI per dataset (no integration tests live here, since this dir owns no generator).
