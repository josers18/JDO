# Cumulus Rollout — Checkpoint 2026-05-28

> **For resume after reboot.** This file captures the full state of the Cumulus rollout mid-Plan-8 so the next session can pick up cleanly.

## Quick resume

```bash
cd /Users/jsifontes/Documents/Git/JDO
git status        # should be clean (only untracked .playwright-mcp/, docs/assets/.cortex/, docs/assets/tmp/)
git branch        # confirm: feat/cumulus-snowflake-pipelines-spec
git log --oneline -5  # last commit: a421c0b
```

Then read this file end-to-end + ask the user which parallelization mode they want (see "Pending decision" below).

## State summary

| Item | Value |
|---|---|
| Branch | `feat/cumulus-snowflake-pipelines-spec` |
| Last commit | `a421c0b` (Plan 8 T1+T2 — scaffold + DDL) |
| Commits since main | ~80 |
| Plans LIVE | **8 datasets** (Plans 1-8 — though Plan 8 only has DDL deployed, no rows yet) |
| Plans pending | **5** (Plans 9, 10, 11, 12, 13) |
| Total rows live | **167,443** (Plans 1-7); Plan 8 table is empty |

## Snowflake state

| Plan | Table | Rows | SP | TASK |
|---|---|---|---|---|
| 1 | `FINS.PUBLIC.CLARITAS_DEMOGRAPHICS` | 25,424 | deployed | TASK_MONTHLY_CLARITAS_DEMOGRAPHICS |
| 2 | `FINS.PUBLIC.MSCI_ESG_SCORES` | 11,389 | deployed | TASK_MONTHLY_MSCI_ESG_SCORES |
| 3 | `FINS.PUBLIC.DNB_BUSINESS_CREDIT` | 11,389 | deployed | TASK_MONTHLY_DNB_BUSINESS_CREDIT |
| 4 | `FINS.PUBLIC.ESRI_GEO_FOOTPRINT` | 13,327 | deployed | TASK_MONTHLY_ESRI_GEO_FOOTPRINT |
| 5 | `FINS.PUBLIC.CORELOGIC_PROPERTY` | 25,424 | deployed | TASK_QUARTERLY_CORELOGIC_PROPERTY |
| 6 | `FINS.PUBLIC.PLAID_HELD_AWAY` | 55,274 | deployed | TASK_MONTHLY_PLAID_HELD_AWAY |
| 7 | `FINS.PUBLIC.WORLD_CHECK_AML` | 36,813 | deployed | TASK_DAILY_WORLD_CHECK_AML |
| 8 | `FINS.PUBLIC.MGP_FINANCIAL_PLANS` | **0** | **NOT YET DEPLOYED** | **NOT YET SCHEDULED** |

## DC state (all 7 created via API; mappings pending UI)

| Plan | Stream / DLO / DMO | Status |
|---|---|---|
| 1 | `CumulusClaritasDemographics{,__dll,__dlm}` | Stream/DLO PROCESSING; DMO created; mapping pending UI |
| 2-7 | (same shape per dataset) | Same — all 7 plans pending the same UI step |
| 8 | (none yet) | Pending T7 |

**Operator action needed:** 7 DC field mappings via DC Setup UI per `Snowflake_Claritas_Demographics/docs/dc-setup-recipe.md` Step 3 (~5 min each, ~35 min total). Plus FK setup on `ssot__AccountId__c` for Plans 1, 2, 3, 5, 6, 7 (Plan 4 is non-account-scoped).

## Plan 8 progress

**Done:**
- Rowspec at `docs/superpowers/plans/attachments/cumulus-plan-8-mgp-financial-plans-rowspec.md`
- Per-plan instantiation at `docs/superpowers/plans/2026-05-28-cumulus-plan-8-mgp-financial-plans.md`
- Manifest entry updated
- T1: Scaffold at `Snowflake_MoneyGuidePro_FinancialPlans/` (AGENTS.md, README.md, pyproject.toml, .gitignore, subdirs)
- T2: DDL deployed — `FINS.PUBLIC.MGP_FINANCIAL_PLANS` exists, 14 columns, composite PK on (ACCOUNT_ID, PROFILE_MONTH), empty

**Pending:**
- T3: L1 unit tests at `Snowflake_MoneyGuidePro_FinancialPlans/tests/`
- T4: SP module at `Snowflake_MoneyGuidePro_FinancialPlans/procedures/sp_generate_mgp_financial_plans.py`
- T5: L2 integration test at `Snowflake_MoneyGuidePro_FinancialPlans/tests/integration/test_mgp_financial_plans_sp.sql`
- T6: deploy_sp.py + tasks/task_monthly_mgp_financial_plans.sql
- T7: DC stream/DLO/DMO via API
- T8: SP CALL + L3 smoke report

## User's parallelization decision

User asked: "are we able to kick off the other plans simultaneously using subagents?"

I answered: **yes for docs and local code, no for Snowflake/DC/git operations**. Then offered 3 options.

**User chose option 1**: finish Plan 8 sequentially first, then spawn 5 parallel doc-drafting subagents for Plans 9-13 (rowspec + per-plan files only — no scaffold, no code, no commits in parallel). After parallel docs land, return to sequential implementation OR another parallel batch for T1+T2 scaffolds.

## Resume sequence after reboot

1. Re-read this file
2. Verify branch + state matches "Quick resume" section
3. **Continue Plan 8 T3+T4** (L1 tests + SP module) sequentially — that's the immediate next batch
4. Then T5+T6, T7+T8 sequentially to finish Plan 8 (~30 min total via the standard 4-batch dispatch pattern)
5. After Plan 8 hits "LIVE" in manifest, **spawn 5 parallel doc subagents** for Plans 9-13 (rowspec + per-plan instantiation only — see prompts in this conversation's transcript for the structural template)
6. Controller commits the 5 doc batches sequentially
7. Then return to sequential T1-T8 dispatch per plan, OR another parallel scaffolding batch if user wants more parallelism

## Plans 9-13 preview (for parallel doc drafting if option 2/3 chosen)

| Plan | Vendor | Audience | Cadence | Notable shape |
|---|---|---|---|---|
| 9 | Synth Relationship Graph | edge-scoped (cross-joins prior plans) | monthly | First edge-scoped (1:N) — reuses Plan 6's per-slot seed pattern |
| 10 | BoardEx Exec Intel | Commercial Banking (~960 anchors) | monthly | **Smallest audience** (will dethrone Plan 8) |
| 11 | ZoomInfo Firmographics | BUSINESS (~11,389) | monthly | Standard BUSINESS shape like Plans 2-3 |
| 12 | Gong Call Sentiment | Wealth+Commercial (~4,880) | weekly | First weekly cadence |
| 13 | Moody's Market Context | instrument-scoped (not account) | daily | Reuses Plan 7's _daily_seed wrapper + non-account audience like Plan 4 |

## Reusable patterns canonicalized so far

1. **5-step SP pattern** (Plans 1-7): read audience → build records → MERGE → assert coverage → log
2. **Year-stable salt** (Plan 5): `seed_for(account_id + suffix, "salt_year", datetime(year, 1, 1))` for fields that don't change month-to-month
3. **1:N row factory** (Plan 6): `_rows_for(anchor, run_ts) -> list[dict]`; parent seed for row count + per-slot seed for fields; sort by sub-key before MERGE; two-part coverage (distinct accts + row band)
4. **Daily cadence** (Plan 7): `_daily_seed(account_id, run_ts)` wrapper folds day into account_id since cumulus_common.seed_for is Y-M-only
5. **Hybrid year-stable + daily XOR** (Plan 7): IID daily draws are arithmetically incompatible with high-Unchanged targets; use year-stable base + small daily flip
6. **Anchor-independent bias** (Plan 7): synthesize fields from account_id only when the anchor data is dirty (e.g. Plan 7's RISK_JURISDICTION_CODE bypasses dirty COUNTRY_CODE)
7. **Sentinel-based identifier substitution** (Plan 6): when L2 fixture cloning has nested-identifier shapes (e.g. PLAID_HELD_AWAY is substring of SP_GENERATE_PLAID_HELD_AWAY), use unique sentinels first then expand
8. **DC PK collapse** (Plan 4 onward): Logical composite PK in Snowflake → DC enforces single-column PK; collapse to one column + KQ on the others
9. **DMO description ≤521 chars** (Plan 6): HTTP 400 STRING_TOO_LONG above that
10. **BOOLEAN field declaration in DC** (Plan 5+): both `dataLakeFieldInputRepresentations` AND `sourceFields` need `"Boolean"` not `"Text"`
11. **Per-anchor invariants > distributional** (Plan 8): when audience cohort is small (<5 anchors in fixture), use deterministic per-anchor tests, not rate convergence

## Files to consult on resume

- This file
- `/Users/jsifontes/.claude/projects/-Users-jsifontes-Documents-Git-JDO/memory/project_cumulus_plan8_checkpoint.md` (memory pointer)
- `docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md` (umbrella spec, v1.5)
- `docs/superpowers/plans/2026-05-28-cumulus-plans-manifest.md` (latest status table)
- `Snowflake_MoneyGuidePro_FinancialPlans/AGENTS.md` (Plan 8 specifics)
- For Plan 8 T3+T4 dispatch, copy the prompt structure from Plan 7's T3+T4 dispatch (search this conversation's transcript or look at `Snowflake_WorldCheck_AML/{procedures,tests}` as the structural template).

## Reboot-safe state

Working dir: `/Users/jsifontes/Documents/Git/JDO`. Branch is checked out. No uncommitted Cumulus work. Snowflake JWT auth (`GSB13421_jwt`) on slot 2 — slot 1 is the user's zero-copy connection key (DO NOT TOUCH). Reboot is safe.
