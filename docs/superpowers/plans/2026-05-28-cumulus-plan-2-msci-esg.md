# Cumulus Plan 2 — MSCI ESG Scores Implementation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement task-by-task.

**Goal:** Stand up the second per-dataset Cumulus pipeline — MSCI ESG-style scores. This is the **first BUSINESS-scoped** dataset, validating that the Plan 1 recipe generalizes from PERSON to BUSINESS audiences. Snowpark Python SP emits one row per BUSINESS account into `FINS.PUBLIC.MSCI_ESG_SCORES` monthly, federated into Data Cloud as `CumulusMSCIESG__dlm`.

**Architecture:** Instantiates the dataset template (`docs/superpowers/plans/2026-05-28-cumulus-plan-N-dataset-template.md` — v1.4) with the placeholders below. Row-factory bias logic and table schema specified in the rowspec attachment.

**Depends on:** Plan 0 (`Snowflake_Cumulus_Common`). Parallel-track with Plan 1 — they share no Snowflake objects, no Python imports, and no DC stream coupling, so Plan 2 may be implemented concurrently with Plan 1 if reviewer bandwidth allows.

---

## How to use this plan

1. Open the template at `docs/superpowers/plans/2026-05-28-cumulus-plan-N-dataset-template.md` (v1.4 with Plan 1 deploy lessons baked in).
2. Apply the placeholder values from §1 below.
3. Read the rowspec attachment at `docs/superpowers/plans/attachments/cumulus-plan-2-msci-esg-rowspec.md` — it specifies the table columns, primary key, row-factory bias logic, and the L1 anchor-influence test target.
4. Implement task-by-task as the template directs. The 8 tasks (T1–T8) are mechanical given the placeholders and rowspec.

## §1 Placeholder values

| Placeholder | Value |
|---|---|
| `<<PLAN_N>>` | `2` |
| `<<DATASET_SLUG>>` | `msci-esg` |
| `<<DATASET_SLUG_UNDERSCORE>>` | `msci_esg` |
| `<<MIMICS_VENDOR>>` | `MSCI` |
| `<<DATASET_TABLE>>` | `MSCI_ESG_SCORES` |
| `<<DATASET_TABLE_LOWER>>` | `msci_esg_scores` |
| `<<REPO_DIR>>` | `Snowflake_MSCI_ESG` |
| `<<DC_DMO>>` | `CumulusMSCIESG__dlm` |
| `<<DATASET_SALT>>` | `msci` |
| `<<CADENCE>>` | `MONTHLY` |
| `<<TASK_NAME>>` | `TASK_MONTHLY_MSCI_ESG_SCORES` |
| `<<TASK_NAME_LOWER>>` | `task_monthly_msci_esg_scores` |
| `<<SP_NAME>>` | `SP_GENERATE_MSCI_ESG_SCORES` |
| `<<CRON>>` | `'USING CRON 0 7 1 * * UTC'` |
| `<<AUDIENCE_PREDICATE>>` | `ACCOUNT_TYPE_FLAG = 'BUSINESS'` |
| `<<COVERAGE_RULE>>` | rows = audience (1:1 monthly per BUSINESS account) |
| `<<ROW_PK>>` | `(ACCOUNT_ID, PROFILE_MONTH)` |
| `<<COLUMN_LIST>>` | See rowspec — 14 columns including `MSCI_ESG_RATING`, 3 pillar scores, controversy fields, materiality tags |

## §2 Audience-predicate probe

Audience is `ACCOUNT_TYPE_FLAG = 'BUSINESS'` — not a CLIENT_CATEGORY filter, so the template's CLIENT_CATEGORY probe step (Pre-flight) is **not** required.

**However:** spec §3 v1.2 finding #3 specifically calls out BUSINESS-scoped plans (this one, plus 9, 11) for cardinality drift. The current view returns 12,021 BUSINESS anchors but real CRM BUSINESS cardinality is closer to ~5K — the gap is Person Accounts misclassified as BUSINESS due to NULL `PersonBirthdate__c`. Per the template's Task 9 "BUSINESS-scoped plans extra check": the SP should log a warning (not fail) if `accounts_processed > 10000`. The L1 anchor-influence test should split on `ANNUAL_REVENUE` rather than `ACCOUNT_TYPE_FLAG` to avoid being polluted by misclassified accounts.

## §3 Rowspec attachment

`docs/superpowers/plans/attachments/cumulus-plan-2-msci-esg-rowspec.md`

Read it before starting Task 2. It contains:
- The 14-column table DDL inputs
- PK `(ACCOUNT_ID, PROFILE_MONTH)`
- 7-letter MSCI rating pool (`AAA`/`AA`/`A`/`BBB`/`BB`/`B`/`CCC`) with target distribution
- Industry → ESG-pillar bias table (Energy/Manufacturing → low E; Tech/Finance → high)
- Controversy count distribution (Leaders ~0, Laggards 1-12)
- 12-tag materiality pool with industry-relative subsets
- Bias-logic block ready to translate into `_row_for`
- L1 anchor-influence test targets (revenue → rating; industry → environmental score)

## §4 What changes from the template

The template (v1.4) is followed verbatim, with these dataset-specific notes:

1. **Task 2 (table DDL).** Translate the rowspec's column table into `CREATE OR REPLACE TABLE FINS.PUBLIC.MSCI_ESG_SCORES (...)`. PK is `(ACCOUNT_ID, PROFILE_MONTH)`. `TOP_CONTROVERSY_CATEGORY` is the only NULLable column (NULL when count=0); all 13 others NOT NULL.

2. **Task 3 (L1 tests).** The template's `in_audience_anchors` fixture override is `[a for a in all_anchors if a["ACCOUNT_TYPE_FLAG"] == "BUSINESS"]`. Property #4 (anchor influence) has TWO assertions:
   - `BIAS_AXIS_FN = ANNUAL_REVENUE`, `OUTPUT_FIELD_TO_CHECK = "MSCI_ESG_RATING"` — split low-revenue (<$1M) vs high-revenue (≥$100M), assert distributions differ AND high-revenue has more `AAA/AA/A` rows.
   - `BIAS_AXIS_FN = INDUSTRY`, `OUTPUT_FIELD_TO_CHECK = "ENVIRONMENTAL_SCORE"` — split heavy industries (Energy/Mining/Manufacturing) vs clean (Tech/Finance), assert mean E_score is meaningfully different (≥1.0 gap with 12-month roll).
   Use the same `importlib.util.spec_from_file_location` conftest pattern that Plan 1 introduced (avoids the `tests/` package collision).

3. **Task 4 (SP).** Implement `_row_for` per the rowspec's bias logic block. `_anchor_in_audience` is `anchor.get("ACCOUNT_TYPE_FLAG") == "BUSINESS"`. The MERGE in `_merge` uses the v1.4 `TO_TIMESTAMP_NTZ(GENERATED_AT::NUMBER / 1000000000)` cast pattern from the template. The 5-step canonical body adds the BUSINESS-cardinality warning **between Step 1 (read audience) and Step 2 (build rows)**:
   ```python
   if accounts_processed > 10000:
       err = (f"BUSINESS audience over-count: {accounts_processed} accounts "
              f"(expected ~5K — see spec §3 v1.2 finding #3). Continuing.")
       # Log to TASK_EXECUTION_LOG.ERROR_MESSAGE on success path; do NOT fail.
   ```

4. **Task 5 (L2).** Standard. The fixture has 50 BUSINESS anchors covering 9 distinct industries, so the integration test should expect distinct ACCOUNT_IDs in `MSCI_ESG_SCORES` to equal 50.

5. **Task 6 (TASK + SP deploy).** Use the v1.4 inline-source pattern (`procedures/sp_create_procedure.sql` with cumulus_common helpers inlined). Wrapper is `SP_RETRY_WRAPPER('FINS.PUBLIC.SP_GENERATE_MSCI_ESG_SCORES()', 2)`, warehouse `MAIN_WH_XS`, monthly cron.

6. **Task 7 (DC stream + DMO).** Use the recipe from `Snowflake_Claritas_Demographics/docs/dc-setup-recipe.md` (Plan 1 T7 codified it). The DLO → DMO field mapping step still requires DC Setup UI work for fully-custom DMOs (API returns 500). Use lowercase `default` for the dataspace param.
   - DLO name: `CumulusMSCIESG__dll`
   - DMO name: `CumulusMSCIESG__dlm`
   - Field mapping: `ACCOUNT_ID` → `ssot__AccountId__c` (FK to `ssot__Account__dlm`), other columns snake_case → camelCase, `MSCI_ESG_RATING` → `msciEsgRating__c`, etc.
   - PROFILE_MONTH source field needs `format: "MM/dd/yyyy"` per the v1.4 recipe (Snowflake DATE auto-discovers as MM/dd/yyyy).

7. **Task 8 (L3 smoke).** After `CALL FINS.PUBLIC.SP_GENERATE_MSCI_ESG_SCORES()`, expect `STATUS='SUCCEEDED'` and ~12K rows. **Distribution sanity** is more nuanced for ESG than for Claritas — verify all 7 letter ratings present, controversy counts skewed toward 0/1/2 for most rows, materiality tags non-empty. Spot-check 3 anchors (one Energy, one Tech, one Finance) — environmental score should differ meaningfully across the three.

## §5 Self-review checklist

When instantiating, verify before each task:

- [ ] Audience predicate `ACCOUNT_TYPE_FLAG = 'BUSINESS'` appears identically in `AUDIENCE_SQL`, `COVERAGE_SQL`, `_anchor_in_audience`, and the L1 fixture override (4 places).
- [ ] Salt `"msci"` appears in: SP module constant `DATASET_SALT`. Nowhere else.
- [ ] Cadence `MONTHLY` in: TASK CRON, README, AGENTS.md.
- [ ] Coverage rule "rows = audience" reflected in: L2 test, L3 smoke check.
- [ ] BUSINESS-cardinality warning lands at SP step 1.5 (between read and build) per §4 above.
- [ ] No `<<` or `>>` placeholders in any committed file.
- [ ] No `NotImplementedError` or "REPLACE WITH ..." comments left in source.
- [ ] DDL uses NULL only for `TOP_CONTROVERSY_CATEGORY` — all other 13 columns NOT NULL.

## §6 Out of scope

- Real MSCI ESG license / 0-10 exposure-score dimension. Our 7-letter + 3-pillar structure is a recognisable cover.
- Stable ratings month-over-month — re-running for a different month rolls new draws by design (`LAST_RATING_CHANGE_DIRECTION` only describes the most-recent change, not historical state).
- Per-pillar controversy detail. Aggregate `CONTROVERSY_FLAG_COUNT` + `TOP_CONTROVERSY_CATEGORY` only.
- Climate scenario / transition-risk fields (real MSCI products but not synthesized here).

## §7 Status

Pending implementation. Plan 1 (Claritas) is shipping live (25,424 rows in `FINS.PUBLIC.CLARITAS_DEMOGRAPHICS`, T7 DC stream live with 25,424 federated rows, T8 L3 smoke green). The v1.4 spec/template/manifest captured Plan 1's deploy lessons. Plan 2 is the validation that the recipe generalizes to BUSINESS-scoped audiences and benefits from those v1.4 baked-in fixes (no `SP_RUN_WITH_RETRY` translation, no `write_pandas` datetime fix-up, no share scaffolding to delete).
