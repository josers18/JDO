# Cumulus Plan 1 — Claritas Demographics Implementation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement task-by-task.

**Goal:** Stand up the first per-dataset Cumulus pipeline — Claritas-style demographics. One Snowpark Python SP that emits one row per PERSON account into `FINS.PUBLIC.CLARITAS_DEMOGRAPHICS` monthly, federated into Data Cloud as `CumulusClaritasDemographics__dlm`.

**Architecture:** Instantiates the dataset template (`docs/superpowers/plans/2026-05-28-cumulus-plan-N-dataset-template.md`) verbatim, with the placeholders filled in below. The row factory and table schema are specified in the rowspec attachment.

**Depends on:** Plan 0 (`Snowflake_Cumulus_Common`).

---

## How to use this plan

1. Open the template at `docs/superpowers/plans/2026-05-28-cumulus-plan-N-dataset-template.md`.
2. Apply the placeholder values from §1 below.
3. Read the rowspec attachment at `docs/superpowers/plans/attachments/cumulus-plan-1-claritas-demographics-rowspec.md` — it specifies the table columns, primary key, row-factory bias logic, and the L1 anchor-influence test target.
4. Implement task-by-task as the template directs. The 8 tasks (T1–T8) are mechanical given the placeholders and rowspec.

---

## §1 Placeholder values

| Placeholder | Value |
|---|---|
| `<<PLAN_N>>` | `1` |
| `<<DATASET_SLUG>>` | `claritas-demographics` |
| `<<DATASET_SLUG_UNDERSCORE>>` | `claritas_demographics` |
| `<<MIMICS_VENDOR>>` | `Claritas` |
| `<<DATASET_TABLE>>` | `CLARITAS_DEMOGRAPHICS` |
| `<<DATASET_TABLE_LOWER>>` | `claritas_demographics` |
| `<<REPO_DIR>>` | `Snowflake_Claritas_Demographics` |
| `<<DC_DMO>>` | `CumulusClaritasDemographics__dlm` |
| `<<DATASET_SALT>>` | `claritas` |
| `<<CADENCE>>` | `MONTHLY` |
| `<<TASK_NAME>>` | `TASK_MONTHLY_CLARITAS_DEMOGRAPHICS` |
| `<<TASK_NAME_LOWER>>` | `task_monthly_claritas_demographics` |
| `<<SP_NAME>>` | `SP_GENERATE_CLARITAS_DEMOGRAPHICS` |
| `<<CRON>>` | `'USING CRON 0 7 1 * * UTC'` |
| `<<AUDIENCE_PREDICATE>>` | `ACCOUNT_TYPE_FLAG = 'PERSON'` |
| `<<COVERAGE_RULE>>` | rows = audience (1:1 monthly per account) |
| `<<ROW_PK>>` | `(ACCOUNT_ID, PROFILE_MONTH)` |
| `<<COLUMN_LIST>>` | See rowspec — 13 columns + PROFILE_MONTH |

## §2 Audience-predicate probe

Audience is `ACCOUNT_TYPE_FLAG = 'PERSON'` — not a CLIENT_CATEGORY filter, so the template's optional CLIENT_CATEGORY probe step (Pre-flight) is **not** required for Plan 1. Skip it.

The cardinality cross-check from spec §3 v1.2 finding #3 still applies inversely: Plan 1's audience is PERSON-scoped, currently 25,424 anchors. If `accounts_processed` deviates by more than ±10% from that, log a warning (not a fail) — could indicate Phase 4 backfill drift.

## §3 Rowspec attachment

`docs/superpowers/plans/attachments/cumulus-plan-1-claritas-demographics-rowspec.md`

Read it before starting Task 2. It contains:
- The full 14-column table DDL inputs (column names, types, nullability)
- The primary key declaration `(ACCOUNT_ID, PROFILE_MONTH)`
- The 12-segment PRIZM catalog used by `_row_for`
- The bias logic for life stage, household composition, net worth band, propensity scores, urbanicity, and financial stress
- The L1 anchor-influence test target (low vs high income → different PRIZM distribution)

## §4 What changes from the template

The template is followed verbatim, with these dataset-specific notes:

1. **Task 2 (table DDL).** Translate the rowspec's column table into a `CREATE OR REPLACE TABLE FINS.PUBLIC.CLARITAS_DEMOGRAPHICS (...)`. PK is `(ACCOUNT_ID, PROFILE_MONTH)`. Comment block at the top references this plan + the rowspec.

2. **Task 3 (L1 tests).** The template's `in_audience_anchors` fixture override is `[a for a in all_anchors if a["ACCOUNT_TYPE_FLAG"] == "PERSON"]`. Property #4 (anchor influence) uses `OUTPUT_FIELD_TO_CHECK = "PRIZM_SEGMENT_CODE"`, splitting persons into low-income (<$50K) and high-income (≥$250K) groups — assert their PRIZM distributions differ.

3. **Task 4 (SP).** Implement `_row_for` per the rowspec's bias logic block (paste verbatim, then refactor into the helper functions it sketches). Implement `_anchor_in_audience` as `anchor.get("ACCOUNT_TYPE_FLAG") == "PERSON"`. The MERGE in `_merge` uses the PK `(ACCOUNT_ID, PROFILE_MONTH)`.

4. **Task 5 (L2).** Standard. The fixture has 50 PERSON anchors, so the integration test should expect distinct ACCOUNT_IDs in `CLARITAS_DEMOGRAPHICS` to equal 50.

5. **Task 6 (TASK).** CRON `0 7 1 * * UTC`, monthly.

6. **Task 7 (DC stream).** In DC Setup → Data Streams → New, pick the existing "Snowflake (Federate / Zero Copy)" connection, select `FINS.PUBLIC.CLARITAS_DEMOGRAPHICS`, name the DLO `CumulusClaritasDemographics__dll`, promote to DMO `CumulusClaritasDemographics__dlm`. Map `ACCOUNT_ID` → `ssot__AccountId__c` (FK to `ssot__Account__dlm.ssot__Id__c`). Other columns map snake_case → camelCase per the standard mapper. Add to foundational-streams allowlist.

7. **Task 8 (L3 smoke).** After `CALL FINS.PUBLIC.SP_GENERATE_CLARITAS_DEMOGRAPHICS()`, expect `STATUS='SUCCEEDED'` in `TASK_EXECUTION_LOG` and ~25K distinct ACCOUNT_IDs in the table (matching V_ACCOUNT_ANCHORS PERSON count, ±5%).

## §5 Self-review checklist (per the template's §"Self-Review")

When instantiating, verify before each task:

- [ ] Audience predicate appears identically in `AUDIENCE_SQL`, `COVERAGE_SQL`, `_anchor_in_audience`, and the L1 fixture override (3 places, plus the L2 SQL — 4 total).
- [ ] Salt `"claritas"` appears in: SP module constant `DATASET_SALT`. Nowhere else.
- [ ] Cadence `MONTHLY` appears in: TASK CRON, README, AGENTS.md.
- [ ] Coverage rule "rows = audience" reflected in: L2 test, L3 smoke check.
- [ ] No `<<` or `>>` placeholders left in any committed file.
- [ ] No `NotImplementedError` or "REPLACE WITH ..." comments left in source.

## §6 Out of scope

- Real Claritas Premier license / 68-segment fidelity. Our 12-segment subset is a recognisable cover (per rowspec).
- Stable PRIZM segments month-over-month — re-running for a different month rolls new draws by design.
- Behavioral product propensity beyond the 3 propensity scores (wealth/investment/mortgage). Other Plans handle deeper behavioral signals.

## §7 Status

Pending implementation. Plan 0 is deployed (`V_ACCOUNT_ANCHORS` live, 24 tests green). Plan 1 unblocks Plan 9 (Relationship Graph), which cross-joins `CLARITAS_DEMOGRAPHICS.HOUSEHOLD_COMPOSITION` to derive household edges.
