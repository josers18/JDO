# AGENTS.md — Snowflake_Cumulus_Common

This sister-project owns the shared infrastructure for all 13 Cumulus dataset pipelines.
Pattern mirrors `Snowflake_CSAT_NPS/`.

## Boundaries

- Owns: `FINS.PUBLIC.V_ACCOUNT_ANCHORS`, `FINS.PUBLIC.CUMULUS_SYNTH_SHARE`, `cumulus_common` Python pkg, shared anchor fixture.
- Does NOT own: any dataset table, any generator SP, any TASK definition. Those live in the per-dataset sister-projects.

## Conventions

- DDL for shared objects goes in `schemas/` (views) or `shares/` (shares).
- Python helpers go under `cumulus_common/` and are importable as `from cumulus_common.seed import seed_for`.
- Every helper has a pytest test alongside in `tests/`.
- Snowflake objects use the schema-qualified form `FINS.PUBLIC.<NAME>` in DDL — never rely on session schema.

## Gotchas

- `V_ACCOUNT_ANCHORS` reads from the `FINSDC3_DATASHARE` inbound share. If a column rename happens upstream, the view fails to compile — re-deploy with the new column name.
- `MASTER_ACCOUNTS.SNAPSHOT_DATE` only carries today's roster; the view's `WHERE SNAPSHOT_DATE = MAX(...)` clause pins to that. Don't change without thinking through historical-cohort generators (none exist yet).
- Per-dataset salts in the seed function are NOT optional — without them, two datasets seeded only by ACCOUNT_ID produce correlated random draws (same accounts skew the same direction in every dataset).

## Tests

```bash
pytest tests/ -v        # L1 only — pure-function tests
```

L2 integration runs in CI per dataset (no integration tests live here, since this dir owns no generator).
