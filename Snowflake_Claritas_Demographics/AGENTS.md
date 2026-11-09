# AGENTS.md — Snowflake_Claritas_Demographics

Synthetic Claritas-style dataset for the Cumulus FSC demo. One of 13.

> **v1.x multi-org (Phase A 2026-05-29 `c9119d32`; deployed SQL ported 2026-11-09, PR #168).** Live table: PK `RECORD_ID` (`UUID_STRING()` default, the row id the DMO keys on); UNIQUE `(ACCOUNT_ID, PROFILE_MONTH)` (`RELY = false`, not enforced, no `ORG_ID`, which is cosmetic); `ORG_ID VARCHAR(18)` nullable, `DEFAULT 'JDO'`, second-to-last column. Both `procedures/sp_generate_*.py` and the deployed `procedures/sp_create_procedure.sql` stamp `"ORG_ID": anchor.get("ORG_ID") or "JDO"` on each row, and the MERGE source SELECT, `ON` and `INSERT` carry `ORG_ID`, so `(ORG_ID, ACCOUNT_ID, PROFILE_MONTH)` is the effective key. UPDATE SET skips `ORG_ID` (key component). Multi-org rollout runbook: `Snowflake_Cumulus_Common/docs/ROLLOUT.md` (A6).

## Boundaries
- Owns: `DATA_JEDAIS.FINS__PUBLIC.CLARITAS_DEMOGRAPHICS`, `SP_GENERATE_CLARITAS_DEMOGRAPHICS`, `TASK_MONTHLY_CLARITAS_DEMOGRAPHICS`, and the DC Data Stream / DLO / DMO that federates this table.
- Does NOT own: `V_ACCOUNT_ANCHORS`, `MASTER_ACCOUNTS`, the seed/coverage helpers — see `Snowflake_Cumulus_Common`.
- Does NOT own any outbound Snowflake share. DC reads through via the existing "Snowflake (Federate / Zero Copy)" connector.

## Conventions
- The SP uses `cumulus_common.seed_for(...)` for determinism with salt `"claritas"`.
- The SP uses `cumulus_common.assert_coverage(session, expected_sql, actual_sql)` in step 4 — the canonical "coverage gap: N missing rows" message lives there.
- The MERGE replaces on `(ORG_ID, ACCOUNT_ID, PROFILE_MONTH)`. Re-runs are idempotent within a calendar month.
- Audience SQL uses `SELECT DISTINCT *` to defend against the 1.7% MASTER_ACCOUNTS dupe pattern documented in the umbrella spec §3 v1.2.

## Tests
- L1 (pytest, `tests/test_claritas_demographics_row_factory.py`): pure-function tests covering determinism, audience scoping, boring-case coverage, anchor influence (low vs high income → different PRIZM distribution), schema contract.
- L2 (`tests/integration/`): clones the deployed SP via GET_DDL + REPLACE into `SP_GENERATE_CLARITAS_DEMOGRAPHICS_FIXTURE` (fixture table, staging, task name and `V_ACCOUNT_ANCHORS_CLARITAS_FIXTURE`, with a pre-CALL safety assertion that no live write target survives), runs it against a 15-anchor fixture (12 PERSON + qualifying/non-qualifying BUSINESS), and asserts audience, ORG_ID stamping, vocabularies, idempotency/determinism, and the log row; passed live 2026-11-09 (17/17).
- L3 (manual smoke, post-deploy): one run against `jdo-uqj0jr`, then row count ≈ 25K + sample plausibility.

## Gotchas
- Audience predicate (`_AUDIENCE_PREDICATE`) lives in BOTH `AUDIENCE_SQL` and `COVERAGE_SQL` constants in the SP. They MUST stay in sync — drift is the sneakiest way to silently produce a coverage gap.
- The 12 PRIZM segment codes (UC, MB, YA, MS, PP, BB, CR, CD, SS, HR, FS, MT) are a recognisable subset — NOT a license-grade Claritas Premier mapping. See rowspec.
- A given account's PRIZM_SEGMENT_CODE may flip month-over-month with the seed roll — that's intentional (random walk simulating life changes), not a bug.
- `procedures/sp_create_procedure.sql` is a hand-synced, inlined copy of `procedures/sp_generate_claritas_demographics.py` (plus `seed_for` / `assert_coverage`). Edit both. The live SP is `EXECUTE AS OWNER` and stages into `DATA_JEDAIS.FINS__PUBLIC`.
- Liquidity strain (2026-10-24): `_liquidity_strained` / `_strained_stress` override `FINANCIAL_STRESS_INDICATOR` for a stable 20% (`STRAIN_RATE`) of Wealth Management / ≥ $250K clients, who are otherwise never High; a strained client is High in 50% (`STRAIN_HIGH`) of months. Separate salt `claritas-strain`, applied after the main draw, so every other column and every non-strained row is byte-identical to before. See README "Financial stress".
- Audience widened (2026-10-24): BUSINESS anchors with a client category and a real `001…` Id (FSC Households, Small Business, Commercial Banking) are in the audience. `_principal_profile` (salt `claritas-principal`) supplies their age and household income; the rest is the person path. The predicate lives in `_AUDIENCE_PREDICATE` (SQL) and `_anchor_in_audience` (Python): keep them in sync. The shared fixture's BUSINESS anchors use `TEST-BIZ-*` ids, so they are still out of audience in the L1 tests.
