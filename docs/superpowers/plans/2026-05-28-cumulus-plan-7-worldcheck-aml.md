# Cumulus Plan 7 — World-Check AML Implementation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Stand up the seventh per-dataset Cumulus pipeline — World-Check-style AML / sanctions / PEP screening per account. **First daily-cadence dataset** in the rollout. **All-accounts audience** (no CLIENT_CATEGORY filter — AML is non-negotiable for every customer). SP emits one row per distinct account per screening day into `FINS.PUBLIC.WORLD_CHECK_AML` (~36,813 rows/day, MERGE-replaces in place), federated as `CumulusWorldCheckAml__dlm`.

**Architecture:** Instantiates the dataset template (v1.5) with **three structural deviations** from Plans 1-6:
1. **Daily cadence** instead of monthly/quarterly (`PROFILE_DATE`, `'USING CRON 0 6 * * * UTC'`).
2. **All-accounts audience** — no `WHERE` predicate beyond `SELECT DISTINCT *`. First plan with no CLIENT_CATEGORY/ACCOUNT_TYPE_FLAG filter.
3. **Anchor-independent bias** — the row factory reads ONLY `account_id`. No income, age, ZIP, state, or category. The novel signal is `RISK_JURISDICTION_CODE`, which is **synthesized** (year-stable per account) instead of read from the dirty `anchor.COUNTRY_CODE` field.

**Depends on:** Plan 0. Independent of Plans 1-6 — no shared Snowflake objects.

---

## §1 Placeholder values

| Placeholder | Value |
|---|---|
| `<<PLAN_N>>` | `7` |
| `<<DATASET_SLUG>>` | `worldcheck-aml` |
| `<<DATASET_SLUG_UNDERSCORE>>` | `worldcheck_aml` |
| `<<MIMICS_VENDOR>>` | `LSEG World-Check` |
| `<<DATASET_TABLE>>` | `WORLD_CHECK_AML` |
| `<<DATASET_TABLE_LOWER>>` | `world_check_aml` |
| `<<REPO_DIR>>` | `Snowflake_WorldCheck_AML` |
| `<<DC_DMO>>` | `CumulusWorldCheckAml__dlm` |
| `<<DATASET_SALT>>` | `worldcheck` |
| `<<CADENCE>>` | `DAILY` |
| `<<TASK_NAME>>` | `TASK_DAILY_WORLD_CHECK_AML` |
| `<<TASK_NAME_LOWER>>` | `task_daily_world_check_aml` |
| `<<SP_NAME>>` | `SP_GENERATE_WORLD_CHECK_AML` |
| `<<CRON>>` | `'USING CRON 0 6 * * * UTC'` (06:00 UTC daily) |
| `<<AUDIENCE_PREDICATE>>` | **N/A — all-accounts; see §2 below** |
| `<<COVERAGE_RULE>>` | distinct accts = audience (1:1 daily per anchor) |
| `<<ROW_PK>>` | `(ACCOUNT_ID, PROFILE_DATE)` |
| `<<COLUMN_LIST>>` | See rowspec — 13 columns including 2 NULLable, 3 BOOLEAN |

## §2 Audience — all-accounts

**Plan 7 has no audience predicate.** Every distinct account in `V_ACCOUNT_ANCHORS` is screened daily. The audience SQL is the simplest of any Cumulus plan:

```sql
-- AUDIENCE_SQL
SELECT DISTINCT * FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS

-- COVERAGE_SQL
SELECT COUNT(DISTINCT ACCOUNT_ID) FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS

-- ACTUAL_SQL
SELECT COUNT(DISTINCT ACCOUNT_ID) FROM FINS.PUBLIC.WORLD_CHECK_AML
```

**Live cardinality (probed 2026-05-28):** 37,445 raw rows, **36,813 distinct ACCOUNT_IDs**. The 1.7% MASTER_ACCOUNTS duplication (Plan 0 finding) is collapsed by the `DISTINCT` — coverage assertion compares distinct counts, not raw counts.

**No defensive filter needed.** Plan 4's `POSTAL_CODE <> ''` filter doesn't apply; Plan 5's PERSON-only filter doesn't apply; Plan 6's `CLIENT_CATEGORY IN ...` filter doesn't apply.

## §3 Rowspec attachment

`docs/superpowers/plans/attachments/cumulus-plan-7-worldcheck-aml-rowspec.md`

Contains:
- 13-column table DDL inputs (2 NULLable: ADVERSE_MEDIA_CATEGORIES, CASE_REFERENCE)
- PK `(ACCOUNT_ID, PROFILE_DATE)`
- OVERALL_RISK_RATING distribution (~92% Low, 6% Medium, 1.7% High, 0.3% Severe)
- Component flag rates (sanctions 0.5%, PEP 1.2%, adverse media 3.0%) drawn independently
- 30-jurisdiction pool with Standard / Enhanced / Prohibited tiers
- Year-stable RISK_JURISDICTION_CODE (salt `worldcheck_jurisdiction`, year bucket)
- Year-stable CASE_REFERENCE (salt `worldcheck_case`, year bucket)
- CHANGE_SINCE_LAST_RUN day-to-day delta computation (re-derives yesterday's seed)
- L1 anchor-influence test targets (NEW shape: 4 alternative assertions since the row factory ignores anchor demographics)

## §4 What changes from the v1.5 template

1. **Task 1 (scaffold).** AGENTS.md gotchas:
   - **Daily cadence.** `PROFILE_DATE` not `PROFILE_MONTH`/`PROFILE_QUARTER`. Seed bucket is day-start `datetime(year, month, day, 0, 0, 0)`.
   - **All-accounts audience.** No `WHERE` predicate beyond `SELECT DISTINCT *`. `_anchor_in_audience` always returns `True`.
   - **Anchor-independent bias.** Row factory reads ONLY `account_id`. Don't read BIRTHDATE / ANNUAL_INCOME / CLIENT_CATEGORY / etc. — those fields are not available signals here.
   - **Year-stable salts (TWO).** `worldcheck_jurisdiction` for RISK_JURISDICTION_CODE+TIER; `worldcheck_case` for CASE_REFERENCE. Both bucketed by `datetime(run_ts.year, 1, 1)`. Plan 5 had one year-stable salt; Plan 7 has two.
   - **3 BOOLEAN columns** (SANCTIONS_HIT, PEP_HIT, ADVERSE_MEDIA_HIT). DC needs explicit `Boolean` declaration in DLO+DMO field input for ALL THREE (Plan 5 finding).
   - **2 NULLable columns** (ADVERSE_MEDIA_CATEGORIES, CASE_REFERENCE). NULL when their parent flag is false / rating is below High.
   - **Day-to-day delta requires re-deriving yesterday's seed.** `_change_since_last_run` recomputes yesterday's overall rating by seeding `random.Random` with `seed_for(account_id, "worldcheck", run_ts - 1 day)` and re-running the component-flag draws. This means the SP body must include the component-flag helpers as pure functions (no shared mutable state).
   - Salt is `"worldcheck"` (daily cadence). DC mapping descriptions must be ≤521 chars (Plan 6 finding).

2. **Task 2 (table DDL).** PK `(ACCOUNT_ID, PROFILE_DATE)`. 11 NOT NULL + 2 NULLable. 3 BOOLEAN columns must be declared `BOOLEAN NOT NULL`.

3. **Task 3 (L1 tests).** Plan 1's conftest pattern (importlib + SAMPLE_ANCHORS) but `in_audience_anchors = all_anchors` (everyone is in audience). Property #4 has FOUR alternative assertions because traditional anchor-influence (income/age/state) doesn't apply:
   - **Same-day determinism** (mid-day re-runs byte-identical)
   - **Day-to-day stable jurisdiction** (RISK_JURISDICTION_CODE same on May 28 and May 29)
   - **Population-rate convergence** (sanctions/PEP/adverse-media rates ~targets within ±0.3 pp across SAMPLE_ANCHORS × 365 days)
   - **CHANGE_SINCE_LAST_RUN coherence** (~99% Unchanged on day-2 run)
   - PLUS: CASE_REFERENCE stability (year-stable per account when High/Severe both days)

4. **Task 4 (SP).** Implement `_row_for` per the rowspec. Two structural points:
   - **Daily-bucketed seed:** `seed_for(account_id, "worldcheck", day_start)` where `day_start = run_ts.replace(hour=0,minute=0,second=0,microsecond=0)`.
   - **Two year-stable seeds** for jurisdiction + case ID (same pattern as Plan 5, just two of them).
   - The MERGE handles 2 NULLable columns + 3 BOOLEAN casts (`SANCTIONS_HIT::BOOLEAN`, etc.). Source SELECT cast pattern unchanged from Plans 5-6.

5. **Task 5 (L2).** 14-anchor fixture (10 PERSON + 4 BUSINESS — no filtering, all in audience). Plan 7-specific assertions:
   - `COUNT(DISTINCT ACCOUNT_ID) = 14` (all anchors emitted; nothing filtered).
   - All 13 columns populated correctly.
   - At least one Severe anchor present (low probability per fixture, but check if it materializes; otherwise skip the assertion gracefully).
   - Idempotent re-run: same calendar day → ROWS_INSERTED=0.
   - Day-2 re-run (CALL with run_ts shifted +1 day): some anchors show non-Unchanged CHANGE_SINCE_LAST_RUN.

6. **Task 6 (deploy).** Clone Plan 6's `scripts/deploy_sp.py`. **Two year-stable salts** to inline (`worldcheck_jurisdiction` and `worldcheck_case` — both via the same `seed_for` helper). No `&` sanitize ("WorldCheck" / "World-Check" both clean). Daily cron `0 6 * * * UTC`, warehouse `MAIN_WH_XS`. Wrapper `SP_RETRY_WRAPPER('FINS.PUBLIC.SP_GENERATE_WORLD_CHECK_AML()', 2)`.

7. **Task 7 (DC stream + DMO).** API path identical to Plans 1-6. Mapping table:

   | Snowflake | DC field | Type |
   |---|---|---|
   | ACCOUNT_ID | ssot__AccountId__c | Text (FK) |
   | PROFILE_DATE | profileDate__c | Date (PK; format MM/dd/yyyy) |
   | OVERALL_RISK_RATING | overallRiskRating__c | Text |
   | SANCTIONS_HIT | sanctionsHit__c | **Boolean** |
   | PEP_HIT | pepHit__c | **Boolean** |
   | ADVERSE_MEDIA_HIT | adverseMediaHit__c | **Boolean** |
   | ADVERSE_MEDIA_CATEGORIES | adverseMediaCategories__c | Text |
   | RISK_JURISDICTION_CODE | riskJurisdictionCode__c | Text |
   | RISK_JURISDICTION_TIER | riskJurisdictionTier__c | Text |
   | LAST_SCREENED_AT | lastScreenedAt__c | DateTime |
   | CHANGE_SINCE_LAST_RUN | changeSinceLastRun__c | Text |
   | CASE_REFERENCE | caseReference__c | Text |
   | GENERATED_AT | generatedAt__c | DateTime |

   `PROFILE_DATE` (DATE column) needs `format: "MM/dd/yyyy"` per v1.4.1. Three Boolean fields need explicit `Boolean` declaration in BOTH `dataLakeFieldInputRepresentations` AND `sourceFields` (Plan 5 finding, repeated three times).

   DC PK collapses to `profileDate__c` + KQ on `ssot__AccountId__c` (single-column-PK rule from Plan 4; we keep `ssot__AccountId__c` as a regular FK column with KQ semantics).

8. **Task 8 (L3 smoke).** Verify SP run, ~36,813 rows. Spot-check:
   - 5 random rows for plausibility (mix of Low / Medium / High / Severe).
   - Risk-tier distribution: ~92% Low, ~6% Medium, ~1.7% High, ~0.3% Severe.
   - Component flag rates: sanctions ~0.5%, PEP ~1.2%, adverse media ~3.0%.
   - Jurisdiction tier distribution: ~98.5% Standard, ~1.0% Enhanced, ~0.5% Prohibited.
   - All Severe rows have RISK_JURISDICTION_TIER='Prohibited' OR SANCTIONS_HIT=true (per the rollup logic).
   - All High/Severe rows have CASE_REFERENCE populated.
   - All non-flagged rows have ADVERSE_MEDIA_CATEGORIES NULL.
   - **Day-2 re-run** shape sanity: schedule a CALL that simulates the next day (use `CALL ... WITH RUN_TS = ...` if supported, else just re-run on day +1). Expected: ~99% Unchanged, ~1% non-Unchanged. CASE_REFERENCE for High/Severe accounts stable across both days.

## §5 Self-review checklist

- [ ] Audience SQL is `SELECT DISTINCT * FROM V_ACCOUNT_ANCHORS` (no WHERE clause).
- [ ] `_anchor_in_audience` always returns True.
- [ ] Row factory reads ONLY `anchor["ACCOUNT_ID"]` — no BIRTHDATE / income / state / category.
- [ ] Salt `"worldcheck"` for daily fields. `"worldcheck_jurisdiction"` and `"worldcheck_case"` for year-stable fields.
- [ ] Daily-bucketed seed `seed_for(account_id, "worldcheck", day_start)`.
- [ ] PK `(ACCOUNT_ID, PROFILE_DATE)` in DDL and MERGE ON.
- [ ] 3 BOOLEAN columns declared as BOOLEAN NOT NULL in DDL.
- [ ] DC mapping: 3 Boolean fields declared as `"Boolean"` (not Text) in DLO+DMO payloads.
- [ ] DMO description ≤521 chars (Plan 6 finding).
- [ ] No `<<` placeholders left.

## §6 Out of scope

- Real LSEG / Dow Jones / ComplyAdvantage license / data fidelity.
- Daily history retention beyond CHANGE_SINCE_LAST_RUN (we MERGE-replace).
- UBO trees, adverse-media excerpts, multi-language name matching.
- Workflow integration (case management, escalation routing).
- Country-of-residence vs country-of-citizenship distinction.

## §7 Status

Pending implementation. Plans 1-6 shipping live (6 datasets, 130,630 rows total). Plan 7 is the **first daily-cadence** dataset — validates the recipe handles 365×/year refresh before Plans 12 (Gong, weekly) and 13 (Moody's, daily). Also the **first all-accounts audience** dataset — validates the recipe handles unfiltered enrollment.
