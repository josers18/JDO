# Cumulus Implementation Plans — Manifest

> **For agentic workers:** This manifest is the index for all 14 Cumulus implementation plans. It is NOT itself an executable plan — it lists the per-plan documents and the placeholder values needed to instantiate Plans 1–13 from the dataset template.

**Source spec:** `docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md`

## Plan files

| Plan | Status | Plan file |
|---|---|---|
| **Plan 0** — Foundation | Written | `2026-05-28-cumulus-plan-0-foundation.md` |
| **Plans 1–13** — Dataset template | Written | `2026-05-28-cumulus-plan-N-dataset-template.md` |
| Plan 1 — Claritas Demographics | Pending instantiation | (instantiate from template) |
| Plan 2 — MSCI ESG Scores | Pending instantiation | (instantiate from template) |
| Plan 3 — D&B Business Credit | Pending instantiation | (instantiate from template) |
| Plan 4 — Esri Geo Footprint | Pending instantiation | (instantiate from template) |
| Plan 5 — CoreLogic Property | Pending instantiation | (instantiate from template) |
| Plan 6 — Plaid Held-Away | Pending instantiation | (instantiate from template) |
| Plan 7 — World-Check AML | Pending instantiation | (instantiate from template) |
| Plan 8 — MGP Financial Plans | Pending instantiation | (instantiate from template) |
| Plan 9 — Synth Relationship Graph | Pending instantiation | (instantiate from template; see §3 below for graph-specific deviations) |
| Plan 10 — BoardEx Exec Intel | Pending instantiation | (instantiate from template) |
| Plan 11 — ZoomInfo Firmographics | Pending instantiation | (instantiate from template) |
| Plan 12 — Gong Call Sentiment | Pending instantiation | (instantiate from template) |
| Plan 13 — Moody's Market Context | Pending instantiation | (instantiate from template; see §3 below for instrument-scoped deviations) |

**Why a template + manifest instead of 13 plan files:** the per-dataset variation is mechanical (audience predicate, table columns, salt), so a 700-line plan that's 95% identical for each of 13 datasets would be 9000 lines of copy-paste with drift risk. The template + per-dataset rowspec attachment captures the variation in ~50 lines per dataset instead.

## Plan dependency graph

```
                Plan 0 (Foundation)
                       │
       ┌───────┬───────┼───────┬───────┬───────┐
       ▼       ▼       ▼       ▼       ▼       ▼
   Plan 1   Plan 2   Plan 3   Plan 4   Plan 5   Plan 6
 (Claritas) (MSCI)   (D&B)   (Esri)  (CoreLogic)(Plaid)
       │                       │
       │                       │
       ▼                       ▼
   Plan 7  ←── runs after Plan 1                       (parallel-track timing only)
 (WorldCheck)
       │
       ▼
   Plan 8
   (MGP)
       │
       ▼
   Plan 9 (Relationship Graph) ← cross-joins Plans 1, 2, 3, 5, 6, 7, 8 outputs
       │
       ▼
   ┌───┬───┬───┬───┐
   ▼   ▼   ▼   ▼
Plan10 Plan11 Plan12 Plan13
(BoardEx)(ZI)(Gong)(Moody's)
```

Plans 1–8 only depend on Plan 0; the visual ordering above reflects ship sequence (parallel-track per spec §4), not hard dependency. Plan 9 is the only one with hard cross-plan dependencies — it queries the previously-shipped tables to compute relationship edges.

## Per-dataset placeholder substitution table

Use this when instantiating Plans 1–13 from `2026-05-28-cumulus-plan-N-dataset-template.md`. Substitute every `<<...>>` with the column for that plan.

| Placeholder | Plan 1 (Claritas) | Plan 2 (MSCI) | Plan 3 (D&B) | Plan 4 (Esri) | Plan 5 (CoreLogic) | Plan 6 (Plaid) | Plan 7 (WorldCheck) |
|---|---|---|---|---|---|---|---|
| `<<PLAN_N>>` | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
| `<<DATASET_SLUG>>` | claritas-demographics | msci-esg | dnb-business-credit | esri-geo-footprint | corelogic-property | plaid-held-away | worldcheck-aml |
| `<<MIMICS_VENDOR>>` | Claritas | MSCI | D&B | Esri | CoreLogic | Plaid | World-Check |
| `<<DATASET_TABLE>>` | `CLARITAS_DEMOGRAPHICS` | `MSCI_ESG_SCORES` | `DNB_BUSINESS_CREDIT` | `ESRI_GEO_FOOTPRINT` | `CORELOGIC_PROPERTY` | `PLAID_HELD_AWAY` | `WORLDCHECK_AML` |
| `<<REPO_DIR>>` | `Snowflake_Claritas_Demographics` | `Snowflake_MSCI_ESG` | `Snowflake_DnB_BusinessCredit` | `Snowflake_Esri_GeoFootprint` | `Snowflake_CoreLogic_Property` | `Snowflake_Plaid_HeldAway` | `Snowflake_WorldCheck_AML` |
| `<<DC_DMO>>` | `CumulusClaritasDemographics__dlm` | `CumulusMSCIESG__dlm` | `CumulusDnBBusinessCredit__dlm` | `CumulusEsriGeoFootprint__dlm` | `CumulusCoreLogicProperty__dlm` | `CumulusPlaidHeldAway__dlm` | `CumulusWorldCheckAML__dlm` |
| `<<DATASET_SALT>>` | `claritas` | `msci` | `dnb` | `esri` | `corelogic` | `plaid` | `worldcheck` |
| `<<CADENCE>>` | MONTHLY | MONTHLY | MONTHLY | MONTHLY | QUARTERLY | WEEKLY | DAILY |
| `<<TASK_NAME>>` | `TASK_MONTHLY_CLARITAS_DEMOGRAPHICS` | `TASK_MONTHLY_MSCI_ESG_SCORES` | `TASK_MONTHLY_DNB_BUSINESS_CREDIT` | `TASK_MONTHLY_ESRI_GEO_FOOTPRINT` | `TASK_QUARTERLY_CORELOGIC_PROPERTY` | `TASK_WEEKLY_PLAID_HELD_AWAY` | `TASK_DAILY_WORLDCHECK_AML` |
| `<<SP_NAME>>` | `SP_GENERATE_CLARITAS_DEMOGRAPHICS` | `SP_GENERATE_MSCI_ESG_SCORES` | `SP_GENERATE_DNB_BUSINESS_CREDIT` | `SP_GENERATE_ESRI_GEO_FOOTPRINT` | `SP_GENERATE_CORELOGIC_PROPERTY` | `SP_GENERATE_PLAID_HELD_AWAY` | `SP_GENERATE_WORLDCHECK_AML` |
| `<<CRON>>` | `'USING CRON 0 7 1 * * UTC'` | `'USING CRON 0 7 1 * * UTC'` | `'USING CRON 0 7 1 * * UTC'` | `'USING CRON 0 7 1 * * UTC'` | `'USING CRON 0 8 1 1,4,7,10 * UTC'` | `'USING CRON 0 5 * * 1 UTC'` | `'USING CRON 0 1 * * * UTC'` |
| `<<AUDIENCE_PREDICATE>>` | `ACCOUNT_TYPE_FLAG = 'PERSON'` | `ACCOUNT_TYPE_FLAG = 'BUSINESS'` | `ACCOUNT_TYPE_FLAG = 'BUSINESS'` | `1=1` (branch-scoped, see §3.1) | `ACCOUNT_TYPE_FLAG = 'PERSON' AND POSTAL_CODE IS NOT NULL` | `CLIENT_CATEGORY IN ('Retail','Wealth Management')` | `1=1` |
| `<<COVERAGE_RULE>>` | rows = audience | rows = audience | rows = audience | rows = `COUNT(DISTINCT BRANCH_ZIP)` | distinct accts = audience | distinct accts = audience | rows = `COUNT(MASTER_ACCOUNTS)` |

| Placeholder | Plan 8 (MGP) | Plan 9 (Relationship Graph) | Plan 10 (BoardEx) | Plan 11 (ZoomInfo) | Plan 12 (Gong) | Plan 13 (Moody's) |
|---|---|---|---|---|---|---|
| `<<PLAN_N>>` | 8 | 9 | 10 | 11 | 12 | 13 |
| `<<DATASET_SLUG>>` | mgp-financial-plans | synth-relationship-graph | boardex-exec-intel | zoominfo-firmographics | gong-call-sentiment | moodys-market-context |
| `<<MIMICS_VENDOR>>` | MoneyGuidePro | composition (no single vendor) | BoardEx | ZoomInfo | Gong | Moody's |
| `<<DATASET_TABLE>>` | `MGP_FINANCIAL_PLANS` | `SYNTH_RELATIONSHIP_GRAPH` | `BOARDEX_EXEC_INTEL` | `ZOOMINFO_FIRMOGRAPHICS` | `GONG_CALL_SENTIMENT` | `MOODYS_MARKET_CONTEXT` |
| `<<REPO_DIR>>` | `Snowflake_MoneyGuidePro_Plans` | `Snowflake_Synth_RelationshipGraph` | `Snowflake_BoardEx_ExecIntel` | `Snowflake_ZoomInfo_Firmographics` | `Snowflake_Gong_CallSentiment` | `Snowflake_Moodys_MarketContext` |
| `<<DC_DMO>>` | `CumulusMGPFinancialPlans__dlm` | `CumulusRelationshipGraph__dlm` | `CumulusBoardExExecIntel__dlm` | `CumulusZoomInfoFirmographics__dlm` | `CumulusGongCallSentiment__dlm` | `CumulusMoodysMarketContext__dlm` |
| `<<DATASET_SALT>>` | `mgp` | `synth-graph` | `boardex` | `zoominfo` | `gong` | `moodys` |
| `<<CADENCE>>` | MONTHLY | WEEKLY | MONTHLY | MONTHLY | WEEKLY | DAILY |
| `<<TASK_NAME>>` | `TASK_MONTHLY_MGP_FINANCIAL_PLANS` | `TASK_WEEKLY_SYNTH_RELATIONSHIP_GRAPH` | `TASK_MONTHLY_BOARDEX_EXEC_INTEL` | `TASK_MONTHLY_ZOOMINFO_FIRMOGRAPHICS` | `TASK_WEEKLY_GONG_CALL_SENTIMENT` | `TASK_DAILY_MOODYS_MARKET_CONTEXT` |
| `<<SP_NAME>>` | `SP_GENERATE_MGP_FINANCIAL_PLANS` | `SP_GENERATE_SYNTH_RELATIONSHIP_GRAPH` | `SP_GENERATE_BOARDEX_EXEC_INTEL` | `SP_GENERATE_ZOOMINFO_FIRMOGRAPHICS` | `SP_GENERATE_GONG_CALL_SENTIMENT` | `SP_GENERATE_MOODYS_MARKET_CONTEXT` |
| `<<CRON>>` | `'USING CRON 0 7 1 * * UTC'` | `'USING CRON 0 5 * * 1 UTC'` | `'USING CRON 0 7 1 * * UTC'` | `'USING CRON 0 7 1 * * UTC'` | `'USING CRON 0 5 * * 1 UTC'` | `'USING CRON 0 1 * * * UTC'` |
| `<<AUDIENCE_PREDICATE>>` | `CLIENT_CATEGORY = 'Wealth Management'` | `1=1` (edge-scoped, see §3.2) | `CLIENT_CATEGORY = 'Commercial Banking'` | `ACCOUNT_TYPE_FLAG = 'BUSINESS'` | `CLIENT_CATEGORY IN ('Wealth Management','Commercial Banking')` | `1=1` (instrument-scoped, see §3.3) |
| `<<COVERAGE_RULE>>` | distinct accts = audience | distinct src_acct = audience | distinct accts = audience | rows = audience | distinct accts = audience | rows = `COUNT(INSTRUMENT_UNIVERSE)` |

## §3 — Plans needing template deviations

Three datasets break the per-account pattern; their plan files must adjust the template's coverage assertion and audience SQL accordingly.

### §3.1 Plan 4 — Esri Geo Footprint (branch-scoped)

The dataset is keyed by `BRANCH_ZIP`, not `ACCOUNT_ID`. Adjust:

- `_row_for(branch_record, run_ts)` — input is a branch row (zip, region), not an anchor.
- Audience SQL is `SELECT DISTINCT POSTAL_CODE FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS WHERE POSTAL_CODE IS NOT NULL` (or a separate branch list).
- Coverage assertion: `actual_sql = "SELECT COUNT(DISTINCT BRANCH_ZIP) FROM FINS.PUBLIC.ESRI_GEO_FOOTPRINT"`.
- Skip the `_anchor_in_audience` predicate guard — there's no per-account audience.

### §3.2 Plan 9 — Synth Relationship Graph (edge-scoped)

The dataset is a directed graph: `(SRC_ACCOUNT_ID, DST_ACCOUNT_ID, EDGE_TYPE)`. Adjust:

- Output rows are edges (1:N per account); the row factory returns a list, not a single dict.
- Coverage assertion: `actual_sql = "SELECT COUNT(DISTINCT SRC_ACCOUNT_ID) FROM FINS.PUBLIC.SYNTH_RELATIONSHIP_GRAPH"` — counts distinct source accounts, not edges.
- Self-edges (`src=dst`, `edge_type='SELF'`) emitted for accounts with no external relationships, so no account is dropped from the graph.
- Cross-plan dependency: queries `CLARITAS_DEMOGRAPHICS` (household), `DNB_BUSINESS_CREDIT` (corporate parent), `BOARDEX_EXEC_INTEL` (board membership) when those tables exist. If any are absent, the corresponding edge type is skipped (not failed) — coverage assertion still passes via self-edges.

### §3.3 Plan 13 — Moody's Market Context (instrument-scoped)

Keyed by `INSTRUMENT_ID`, not `ACCOUNT_ID`. Adjust:

- Audience SQL: `SELECT * FROM FINS.PUBLIC.INSTRUMENT_UNIVERSE WHERE IS_ACTIVE = TRUE` (uses the existing trades-pipeline instrument table).
- Coverage assertion: `actual_sql = "SELECT COUNT(DISTINCT INSTRUMENT_ID) FROM FINS.PUBLIC.MOODYS_MARKET_CONTEXT"`.
- Skip the V_ACCOUNT_ANCHORS read entirely — instruments aren't account-scoped.

## Per-dataset rowspec attachments

Each plan needs a `docs/superpowers/plans/attachments/cumulus-plan-<N>-<dataset-slug>-rowspec.md` listing exact column names, types, and bias logic. Attachments are created **at plan-instantiation time** by reading the spec §4 row + the source-doc vendor description, then writing out:

```markdown
# <Dataset> rowspec

## Table: FINS.PUBLIC.<<DATASET_TABLE>>

| Column | Type | Null? | Source / synthesis |
|---|---|---|---|
| ACCOUNT_ID | VARCHAR | NO | Anchor.ACCOUNT_ID |
| ... | ... | ... | ... |

## Primary key

(ACCOUNT_ID, <SCORE_MONTH | EDGE_ID | etc.>)

## Bias logic for _row_for

- Field A bias: ...
- Field B bias: ...

## Boring case (must still emit)

A "boring" anchor (...) produces a row with field X = "DEFAULT_VALUE".
```

Attachments aren't authored as part of plan-writing — they're authored as the first step of each per-dataset implementation, by the engineer working from the source brainstorming doc + the vendor's public schema. Use the `find-skills` skill to locate `aisuite:researcher` if you need to gather a vendor's real schema details.

## Execution order recommendation

For maximum reviewer parallelism without dependency conflicts:

1. **Plan 0** (Foundation) — must merge first.
2. **Plan 1** (Claritas) and **Plan 2** (MSCI ESG) — start in parallel after Plan 0; ESG validates the egress path on a non-critical dataset.
3. **Plan 3** (D&B) and **Plan 4** (Esri) — parallel after Plans 1+2 land.
4. **Plans 5, 6, 7** (CoreLogic, Plaid, WorldCheck) — sequential; each touches different audience predicates so reviewer can context-switch.
5. **Plan 8** (MGP).
6. **Plan 9** (Relationship Graph) — last in Tier 1.
7. **Plans 10, 11, 12, 13** — parallel; ship after Plan 9.

## Status

This manifest is the planning deliverable for the Cumulus brainstorm. After it's approved:
- Plan 0 is ready to execute as written.
- Plans 1–13 are instantiated on demand, one at a time, by copying `2026-05-28-cumulus-plan-N-dataset-template.md` and substituting the row from §2.

After Plan 0 + Plan 1 ship as a proving run, the rest of Tier 1 + Tier 2 follow the recommended execution order in §4.
