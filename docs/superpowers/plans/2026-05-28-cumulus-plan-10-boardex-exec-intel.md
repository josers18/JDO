# Cumulus Plan 10 — BoardEx Exec Intel Implementation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Stand up the tenth per-dataset Cumulus pipeline — BoardEx-style board director and executive intelligence per Commercial Banking account. Commercial-Banking-only audience. Monthly cadence. SP emits one row per Commercial Banking account per month into `FINS.PUBLIC.BOARDEX_EXEC_INTEL` (~960 rows), federated as `CumulusBoardExExecIntel__dlm`.

**Architecture:** Instantiates the dataset template (v1.5) with **three structural deviations** from Plans 1-7 (and beyond Plan 8's two):

1. **Smallest audience by 4.1×** (960 vs 3,920 next-smallest, which is Plan 8 MGP). Plan 10 dethrones Plan 8 as the smallest Cumulus dataset. Per-anchor invariants are even more load-bearing than Plan 8.
2. **Cohort-fixture override required.** Plan 10 is the first dataset where the SAMPLE_ANCHORS fixture has zero relevant cohort members — SAMPLE_ANCHORS is Retail / Wealth / Household / Small Business heavy and contains no Commercial Banking rows. The L1 conftest must build an inline 5-anchor synthetic fixture rather than filter SAMPLE_ANCHORS or `pytest.skip` the cohort tests.
3. **Single NULLable column** (`RECENT_GOVERNANCE_EVENT_DATE`). Simpler than Plan 8's enum-gated 2-NULL setup — the NULL semantics are independent (a flat 30%/70% Bernoulli draw) rather than driven by another column's value.

**Depends on:** Plan 0. Independent of Plans 1-9.

---

## §1 Placeholder values

| Placeholder | Value |
|---|---|
| `<<PLAN_N>>` | `10` |
| `<<DATASET_SLUG>>` | `boardex-exec-intel` |
| `<<DATASET_SLUG_UNDERSCORE>>` | `boardex_exec_intel` |
| `<<MIMICS_VENDOR>>` | `BoardEx` |
| `<<DATASET_TABLE>>` | `BOARDEX_EXEC_INTEL` |
| `<<DATASET_TABLE_LOWER>>` | `boardex_exec_intel` |
| `<<REPO_DIR>>` | `Snowflake_BoardEx_ExecIntel` |
| `<<DC_DMO>>` | `CumulusBoardExExecIntel__dlm` |
| `<<DATASET_SALT>>` | `boardex` |
| `<<CADENCE>>` | `MONTHLY` |
| `<<TASK_NAME>>` | `TASK_MONTHLY_BOARDEX_EXEC_INTEL` |
| `<<TASK_NAME_LOWER>>` | `task_monthly_boardex_exec_intel` |
| `<<SP_NAME>>` | `SP_GENERATE_BOARDEX_EXEC_INTEL` |
| `<<CRON>>` | `'USING CRON 0 7 1 * * UTC'` |
| `<<AUDIENCE_PREDICATE>>` | `CLIENT_CATEGORY = 'Commercial Banking'` |
| `<<COVERAGE_RULE>>` | distinct accts = audience (1:1 monthly per Commercial Banking) |
| `<<ROW_PK>>` | `(ACCOUNT_ID, PROFILE_MONTH)` |
| `<<COLUMN_LIST>>` | See rowspec — 14 columns including 1 NULLable, 1 BOOLEAN |

## §2 Audience-predicate probe

`CLIENT_CATEGORY = 'Commercial Banking'`

**Live cardinality (probed 2026-05-28):** 960 distinct anchors (no duplicates). `'Commercial Banking'` is the canonical literal in the v1.5 9-value CLIENT_CATEGORY set; the umbrella spec flagged this as one of the values where casing/whitespace drift has historically appeared, so the SP probes `WHERE TRIM(CLIENT_CATEGORY) = 'Commercial Banking'` defensively before relying on the count. `EMPLOYEE_COUNT` and `ANNUAL_REVENUE` are expected to be ~100% populated for this BUSINESS-skewed cohort; `INDUSTRY` populated rate should be checked at audience-probe time and logged in the Task 1 scaffold notes.

**Smallest Cumulus dataset of all 13 plans, dethroning Plan 8 by 4.1×.** Cumulus dataset size ladder:
- Plan 10 (this one): **960 rows** ← smallest
- Plan 8 (MGP Financial Plans): 3,920 rows
- Plan 2 (MSCI ESG): 11,389 rows
- Plan 3 (D&B Business Credit): 11,389 rows

## §3 Rowspec attachment

`docs/superpowers/plans/attachments/cumulus-plan-10-boardex-exec-intel-rowspec.md`

Contains:
- 14-column table DDL inputs (13 NOT NULL + 1 NULLable: RECENT_GOVERNANCE_EVENT_DATE)
- PK `(ACCOUNT_ID, PROFILE_MONTH)`
- Per-field synthesis Python skeletons (BOARD_SIZE, BOARD_INDEPENDENCE_PCT, GOVERNANCE_RATING, etc.)
- Bias logic: EMPLOYEE_COUNT → BOARD_SIZE / CEO_TENURE_YEARS; CEO_TENURE_YEARS → EXEC_TURNOVER_FLAG; INTERLOCK_DEGREE → INTERLOCK_COUNT
- Inline 5-anchor synthetic conftest fixture (the cohort-fixture override)
- L1 anchor-influence test target — 5 properties (per Plan 8 pattern, but with bias-band invariants in place of NULL-semantics gating)
- Boring-case ("mid-market enterprise") expected output

## §4 What changes from the v1.5 template

1. **Task 1 (scaffold).** AGENTS.md gotchas:
   - **Smallest Cumulus audience by 4.1×.** 960 anchors vs Plan 8's 3,920. SP runtime expected <1s.
   - **Cohort-fixture override.** Plan 10 is the first dataset where the SAMPLE_ANCHORS fixture has zero relevant cohort members at all (Commercial Banking is ~2.6% of the anchor pool and the 100-anchor SAMPLE_ANCHORS slice has none). The L1 conftest must build an inline 5-anchor synthetic Commercial Banking fixture (see rowspec) rather than filter SAMPLE_ANCHORS or graceful-skip cohort tests à la Plan 5/6. Document the deviation in the SP module docstring.
   - **Anchor reads:** EMPLOYEE_COUNT (drives BOARD_SIZE and CEO_TENURE bands) + INTERLOCK_DEGREE (drives INTERLOCK_COUNT). Both are expected to be ~100% populated for this cohort, but the row factory falls back to `0` if NULL.
   - **Date-coherence invariants:** `LAST_DATA_REFRESH_DATE ≤ run_ts.date()` always; `RECENT_GOVERNANCE_EVENT_DATE ≤ run_ts.date()` when populated.
   - **Per-anchor invariants, not distributional.** Like Plan 8, distributional convergence won't work at this cohort size — but Plan 10 doesn't even have a real cohort in SAMPLE_ANCHORS, so the inline synthetic fixture is the only path.
   - Salt is `"boardex"` (monthly, no year-stable salt needed).
   - 1 BOOLEAN column (EXEC_TURNOVER_FLAG) — declare as Boolean in DC.

2. **Task 2 (table DDL).** PK `(ACCOUNT_ID, PROFILE_MONTH)`. 13 NOT NULL + 1 NULLable. 1 BOOLEAN NOT NULL.

3. **Task 3 (L1 tests).** **Conftest deviation: inline synthetic fixture instead of SAMPLE_ANCHORS filter.** Plan 10's L1 conftest defines `COMMERCIAL_BANKING_FIXTURE` (5 hand-picked synthetic anchors covering the EMPLOYEE_COUNT bias bands) and uses that as `in_audience_anchors` directly. SAMPLE_ANCHORS is not consulted for cohort tests. The 5-anchor fixture rolled over 6+ months gives ~30 rows — sufficient to exercise all 5 governance-rating tiers and the bias-band invariants.

   Property #4 has FIVE per-anchor invariants:
   - **4a Range invariants** (per-anchor): every row's BOARD_SIZE in [5,15]; BOARD_INDEPENDENCE_PCT, WOMEN_BOARD_PCT, MINORITY_BOARD_PCT all in [0.0,100.0]; BOARD_AVG_TENURE_YEARS in [1.0,20.0]; CEO_TENURE_YEARS in [0.0,25.0]; INTERLOCK_COUNT in [0,5].
   - **4b Vocabulary invariants** (per-row): GOVERNANCE_RATING in `{Excellent, Strong, Adequate, Weak, Concerning}`; EXEC_TURNOVER_FLAG is a Python `bool`.
   - **4c Date-coherence invariants** (per-row): LAST_DATA_REFRESH_DATE ≤ run_ts.date(); when populated, RECENT_GOVERNANCE_EVENT_DATE ≤ run_ts.date().
   - **4d Bias-band invariants** (cohort-coupled): EMPLOYEE_COUNT≥10000 → BOARD_SIZE≥9 always; EMPLOYEE_COUNT<100 → BOARD_SIZE≤8 always; INTERLOCK_DEGREE≥4 → INTERLOCK_COUNT≥2 always.
   - **4e Schema contract**: 14 keys per dict; KEY_DIRECTOR_NAME is non-empty string of form `"<First> <Last>"`.

4. **Task 4 (SP).** Implement `_row_for` per the rowspec. Standard 5-step pattern. Two structural points:
   - **Independent NULL draw:** RECENT_GOVERNANCE_EVENT_DATE is a flat 30%/70% Bernoulli — simpler than Plan 8's PLAN_STATUS-gated NULLs. No multi-column coordination needed.
   - **Date-coherence guard:** `_recent_governance_event` and `_last_data_refresh` both subtract from `run_ts.date()` and clamp to ≥ 1 day ago.
   - The MERGE handles 1 NULLable date column and 1 BOOLEAN cast (`EXEC_TURNOVER_FLAG::BOOLEAN`).

5. **Task 5 (L2).** 12-anchor fixture (5 Commercial Banking + 7 non-Commercial-Banking, audience filter excludes the 7). Plan 10-specific assertions:
   - `COUNT(DISTINCT ACCOUNT_ID) = 5` (audience size, after filter).
   - All 5 emit exactly one row per month.
   - At least 3 of the 5 GOVERNANCE_RATING tiers present (sampled across 5 anchors × 3 months).
   - **Range and vocabulary invariants enforced** as in L1.
   - 0 future-dated LAST_DATA_REFRESH_DATE; 0 future-dated RECENT_GOVERNANCE_EVENT_DATE when populated.
   - Idempotent re-run: ROWS_INSERTED=0.

6. **Task 6 (deploy).** Clone Plan 8's `scripts/deploy_sp.py`. Single salt `"boardex"`. Update docstring describing Plan 10's three structural deviations (smallest by 4.1×, cohort-fixture override, single-NULL semantics). No `&` sanitize ("BoardEx" / "Exec Intel" both clean). Monthly cron, `MAIN_WH_XS`. Wrapper `SP_RETRY_WRAPPER('FINS.PUBLIC.SP_GENERATE_BOARDEX_EXEC_INTEL()', 2)`.

7. **Task 7 (DC stream + DMO).** API path identical to Plans 1-8. Mapping table:

   | Snowflake | DC field | Type |
   |---|---|---|
   | ACCOUNT_ID | ssot__AccountId__c | Text (FK) |
   | PROFILE_MONTH | profileMonth__c | Date (PK; format MM/dd/yyyy) |
   | BOARD_SIZE | boardSize__c | Number |
   | BOARD_INDEPENDENCE_PCT | boardIndependencePct__c | Number |
   | WOMEN_BOARD_PCT | womenBoardPct__c | Number |
   | MINORITY_BOARD_PCT | minorityBoardPct__c | Number |
   | BOARD_AVG_TENURE_YEARS | boardAvgTenureYears__c | Number |
   | CEO_TENURE_YEARS | ceoTenureYears__c | Number |
   | EXEC_TURNOVER_FLAG | execTurnoverFlag__c | **Boolean** |
   | GOVERNANCE_RATING | governanceRating__c | Text |
   | INTERLOCK_COUNT | interlockCount__c | Number |
   | KEY_DIRECTOR_NAME | keyDirectorName__c | Text |
   | RECENT_GOVERNANCE_EVENT_DATE | recentGovernanceEventDate__c | Date |
   | LAST_DATA_REFRESH_DATE | lastDataRefreshDate__c | Date |
   | GENERATED_AT | generatedAt__c | DateTime |

   `PROFILE_MONTH`, `RECENT_GOVERNANCE_EVENT_DATE`, `LAST_DATA_REFRESH_DATE` need `format: "MM/dd/yyyy"`. EXEC_TURNOVER_FLAG declared as `Boolean` (Plan 5 / Plan 8 finding). DC PK collapses to `profileMonth__c` + KQ on `ssot__AccountId__c`.

8. **Task 8 (L3 smoke).** Verify SP run, ~960 rows. Spot-check:
   - 5 random rows for plausibility (mix of governance ratings).
   - GOVERNANCE_RATING distribution: skew toward Strong / Adequate (most rows fall in the middle bias band).
   - **Range invariants** all enforced (BOARD_SIZE [5,15], independence/diversity pcts [0,100], etc.).
   - **Vocabulary**: GOVERNANCE_RATING values all in canonical 5-value set.
   - **Date-coherence**: 0 future-dated LAST_DATA_REFRESH_DATE; 0 future-dated RECENT_GOVERNANCE_EVENT_DATE.
   - **NULL rate**: RECENT_GOVERNANCE_EVENT_DATE populated for ~25-35% of rows (target 30%, tolerance ±5%).

## §5 Self-review checklist

- [ ] Audience predicate `CLIENT_CATEGORY = 'Commercial Banking'` in 4 places (SP `_AUDIENCE_PREDICATE`, audience SQL, coverage SQL, L1 fixture).
- [ ] Salt `"boardex"` in SP module constant.
- [ ] PK `(ACCOUNT_ID, PROFILE_MONTH)` in DDL and MERGE ON.
- [ ] 1 BOOLEAN column declared as BOOLEAN NOT NULL in DDL.
- [ ] DC mapping: `execTurnoverFlag__c` declared as `Boolean` (not Text).
- [ ] L1 conftest uses inline `COMMERCIAL_BANKING_FIXTURE` rather than filtering SAMPLE_ANCHORS.
- [ ] L1 tests use per-anchor range / vocabulary / bias-band invariants, not distributional rate convergence.
- [ ] No `<<` placeholders left.

## §6 Out of scope

- Real BoardEx / Equilar / ISS license / live data fidelity; per-director rows; executive compensation detail.
- Committee structure (audit / comp / nominating); board-meeting attendance; multi-year trend analysis.
- Real interlock graph (`INTERLOCK_COUNT` is a biased scalar, not a JOIN).

## §7 Status

Pending implementation. Plans 1-8 shipping live (8 of 13 datasets, 171,363 rows total). Plan 10 will be the **smallest Cumulus dataset by 4.1×, dethroning Plan 8** from that title (960 vs 3,920). It validates the recipe handles a cohort that the standard L1 fixture doesn't sample at all — extending the per-anchor-invariant pattern Plan 8 introduced into the territory where the inline synthetic fixture is the only viable approach.
