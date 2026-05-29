# Cumulus Plan 9 — Synth Relationship Graph Implementation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Stand up the ninth per-dataset Cumulus pipeline — a synthesized directed relationship graph stitching together household members (Claritas), corporate parents (D&B), board memberships (BoardEx, when available), advisor-book peers, internal referrals, and business-owner bridges. **Second 1:N dataset** in the rollout (Plan 6 was first), **second weekly cadence** (Plan 6 was first; Plan 12 will be third), and the **only edge-scoped dataset** in the rollout. All-accounts audience. Weekly cadence. SP emits multiple edge rows per anchor per week into `FINS.PUBLIC.SYNTH_RELATIONSHIP_GRAPH` (~110K–180K rows expected), federated as `CumulusRelationshipGraph__dlm`.

**Architecture:** Instantiates the dataset template (v1.5) with **four structural deviations** from Plan 8:

1. **Edge-scoped 1:N row factory** — `_rows_for(anchor, run_ts) -> list[dict]` returns 1–N edge rows per anchor (mirroring Plan 6's shape), where each row is a directed edge `(SRC_ACCOUNT_ID, DST_ACCOUNT_ID, EDGE_TYPE)`. Plan 9 is the first dataset where the row PK is not anchored to a single account scope — `SRC_ACCOUNT_ID` is the anchor but the row identity also carries `DST_ACCOUNT_ID` and `EDGE_TYPE`.
2. **Cross-plan SOFT dependencies** — the SP queries upstream Cumulus tables (`CLARITAS_DEMOGRAPHICS`, `DNB_BUSINESS_CREDIT`, `BOARDEX_EXEC_INTEL`) for HOUSEHOLD / CORPORATE_PARENT / BOARD_MEMBER edge sources. Each table is probed with `SELECT 1 FROM <table> LIMIT 1` inside a try/except in `main()`; if a table is absent, the corresponding edge type is skipped (not failed). Plan 9 is the first dataset with cross-plan dependencies — the manifest §3.2 specifies SOFT semantics, not HARD.
3. **Composite 3-column PK collapses to single-column DC PK with KQ on the other two** — natural Snowflake PK is `(SRC_ACCOUNT_ID, DST_ACCOUNT_ID, EDGE_TYPE)`. DC requires a single-column DMO PK (Plan 4 finding); we project a derived `EDGE_ID = sha256(src||'|'||dst||'|'||edge_type)[:32]` at the DLO source view and use it as the DMO PK with KQ qualifiers `srcAccountId__c`, `dstAccountId__c`, `edgeType__c`. Plan 9 is the first dataset with a 3-column natural PK — Plan 6's collapse was 3→1 too but the keying was naturally `HELD_AWAY_ACCOUNT_ID`-rooted.
4. **Self-edge fallback for coverage invariant** — every anchor with no other edge applies emits exactly one `(account, account, 'SELF')` row with `EDGE_WEIGHT=1.000` and `CONFIDENCE_PCT=100.00`. This guarantees `COUNT(DISTINCT SRC_ACCOUNT_ID) = audience_size` always holds, even when every cross-plan table is absent. Plan 9 is the first dataset where the boring case is a self-loop, not a "default value" row.

**Depends on:** Plan 0. SOFT-depends on Plans 1 (Claritas), 3 (D&B), 10 (BoardEx) — all three absorbed by the SELF-fallback, so Plan 9 ships and runs green even if Plans 1/3 outputs are empty and Plan 10 hasn't shipped.

## §1 Placeholder values

| Placeholder | Value |
|---|---|
| `<<PLAN_N>>` | `9` |
| `<<DATASET_SLUG>>` | `synth-relationship-graph` |
| `<<DATASET_SLUG_UNDERSCORE>>` | `synth_relationship_graph` |
| `<<MIMICS_VENDOR>>` | `composition` (no single-vendor mimic — synthesized from prior Cumulus plans + brainstorm doc §17) |
| `<<DATASET_TABLE>>` | `SYNTH_RELATIONSHIP_GRAPH` |
| `<<DATASET_TABLE_LOWER>>` | `synth_relationship_graph` |
| `<<REPO_DIR>>` | `Snowflake_Synth_RelationshipGraph` |
| `<<DC_DMO>>` | `CumulusRelationshipGraph__dlm` |
| `<<DATASET_SALT>>` | `synth-graph` |
| `<<CADENCE>>` | `WEEKLY` |
| `<<TASK_NAME>>` | `TASK_WEEKLY_SYNTH_RELATIONSHIP_GRAPH` |
| `<<TASK_NAME_LOWER>>` | `task_weekly_synth_relationship_graph` |
| `<<SP_NAME>>` | `SP_GENERATE_SYNTH_RELATIONSHIP_GRAPH` |
| `<<CRON>>` | `'USING CRON 0 5 * * 1 UTC'` |
| `<<AUDIENCE_PREDICATE>>` | `1=1` (all accounts; audience SQL uses `SELECT DISTINCT *` to dedupe MASTER_ACCOUNTS) |
| `<<COVERAGE_RULE>>` | distinct src_acct = audience (every anchor contributes ≥1 row, SELF-fallback guarantees this) |
| `<<ROW_PK>>` | `(SRC_ACCOUNT_ID, DST_ACCOUNT_ID, EDGE_TYPE)` — composite 3-column |
| `<<COLUMN_LIST>>` | See rowspec — 9 columns including 1 NULLable (METADATA) |

## §2 Audience-predicate probe

`1=1` — all accounts.

**Live cardinality (probed 2026-05-28):** **36,813 distinct anchors** (37,445 raw `V_ACCOUNT_ANCHORS` rows due to the known 1.7% MASTER_ACCOUNTS dup discovered in Plan 0 v1.5). Audience SQL must use `SELECT DISTINCT` defensively until the upstream MASTER_ACCOUNTS dedup ships:

```sql
SELECT DISTINCT *
FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS
```

This is the second all-accounts audience in the rollout (Plan 7 World-Check AML was first). Same dedup caveat applies. No BUSINESS-misclassification concern at the audience level — Plan 9's edge types route based on `ACCOUNT_TYPE_FLAG` and `CLIENT_CATEGORY` per-edge, so the 12,021-vs-expected-5K BUSINESS over-count surfaces only as a slight over-count of CORPORATE_PARENT and BUSINESS_OWNER edge candidates (which the cross-plan probe filters against actual D&B rows).

## §3 Rowspec attachment

`docs/superpowers/plans/attachments/cumulus-plan-9-synth-relationship-graph-rowspec.md`

Contains:
- 9-column table DDL inputs (1 NULLable: METADATA)
- Composite PK `(SRC_ACCOUNT_ID, DST_ACCOUNT_ID, EDGE_TYPE)`
- 7 EDGE_TYPE values with provenance + cross-plan dependency map
- Edge-count distribution (mean target [3, 5] across all anchors)
- EDGE_WEIGHT bands per type (SELF=1.000, CORPORATE_PARENT/BUSINESS_OWNER ≥ 0.85, etc.)
- CONFIDENCE_PCT with age-decay
- EDGE_DISCOVERED_DATE / EDGE_LAST_SEEN_DATE coherence rules
- Per-EDGE_TYPE synthesis logic (HOUSEHOLD, CORPORATE_PARENT, BOARD_MEMBER, ADVISOR_BOOK, REFERRAL, BUSINESS_OWNER, SELF)
- 1:N `_rows_for` skeleton with single salt + week-bucketed seed + cross-plan lookup-table parameters
- Cross-plan dependency probe for `available_edge_types: set[str]`
- L1 anchor-influence test target (NEW shape: per-anchor invariants with SELF-fallback as load-bearing assertion since cross-plan tables are absent in unit tests)

## §4 What changes from the v1.5 template

Plan 9 is the second 1:N dataset (Plan 6 was first), so Plan 6's deviations from the v1.5 template carry forward (multi-row `_rows_for`, composite PK, deterministic row ordering before MERGE). Plan 9 adds **four further structural deviations** beyond what Plan 6 introduced:

1. **Task 1 (scaffold).** AGENTS.md gotchas:
   - **First edge-scoped dataset.** Row identity is `(SRC, DST, EDGE_TYPE)` — the row PK is the directed-edge tuple, not an `account_id + slot_index` shape. SRC_ACCOUNT_ID is the anchor; DST_ACCOUNT_ID can be any other account in the audience (or the same account for SELF).
   - **Cross-plan SOFT dependencies.** SP `main()` runs `_probe_available_edge_types(session)` at top-of-run. Each `IF EXISTS` probe (`SELECT 1 FROM <table> LIMIT 1`) is wrapped in try/except; absent tables silently filter out the corresponding edge_type from `available_edge_types`. **Never fail the SP because a cross-plan table is missing** — log a warning in TASK_EXECUTION_LOG.ERROR_MESSAGE prefix instead.
   - **SELF self-edge fallback.** Every `_rows_for(anchor, ...)` that would otherwise return `[]` instead returns `[self_edge(anchor)]`. The SELF row has fixed `EDGE_WEIGHT=1.000`, `CONFIDENCE_PCT=100.00`, `EDGE_DISCOVERED_DATE=EDGE_LAST_SEEN_DATE=week_start.date()`, `METADATA=NULL`. This is the load-bearing coverage guarantee.
   - **Single salt, week-bucketed seed.** `seed_for(account_id, "synth-graph", week_start)` where `week_start = run_ts.replace(day=run_ts.day - run_ts.weekday(), hour=0, minute=0, second=0, microsecond=0)`. Re-running mid-week produces byte-identical output.
   - **Anchor reads:** `ACCOUNT_ID`, `ACCOUNT_TYPE_FLAG`, `CLIENT_CATEGORY`, `ANNUAL_INCOME`, `BIRTHDATE`. None NULL on the live audience for the in-use fields.
   - **Sort rows by (DST_ACCOUNT_ID, EDGE_TYPE) before MERGE** for deterministic ordering — different sort key from Plan 6.
   - **Per-anchor invariants, not distributional.** L1 unit-test environment lacks Claritas/D&B/BoardEx; most anchors will SELF-fallback in tests. Property tests target SELF invariants, weight/confidence bounds, and date-coherence — not edge-type rate distributions.
   - 1 NULLable column (METADATA) — declare as `VARCHAR(500) NULL` in DDL.

2. **Task 2 (table DDL).** Composite PK on three columns. `EDGE_TYPE` declared `VARCHAR(20)` to fit the seven values. `EDGE_WEIGHT NUMBER(4,3)` (range 0.000–1.000); `CONFIDENCE_PCT NUMBER(5,2)` (range 0.00–100.00). The DLO source view `V_SYNTH_RELATIONSHIP_GRAPH_FOR_DC` adds the projected `EDGE_ID = SUBSTR(SHA2(SRC_ACCOUNT_ID||'|'||DST_ACCOUNT_ID||'|'||EDGE_TYPE, 256), 1, 32)` for DC's single-column DMO PK.

3. **Task 3 (L1 tests).** Plan 6's conftest pattern (importlib + SAMPLE_ANCHORS + multi-row determinism). `in_audience_anchors = list(all_anchors)` since audience is `1=1`. Property #4 has SIX per-anchor / per-edge invariants:
   - **4a Determinism on multi-row output** (per-anchor, per-`available_edge_types` set): `_rows_for(anchor, run_ts, available_edge_types={"SELF"})` returns the same list on re-run.
   - **4b SELF-fallback invariant** (load-bearing): every anchor with `available_edge_types == {"SELF"}` returns exactly one row, that row's EDGE_TYPE='SELF', SRC==DST, EDGE_WEIGHT==1.000, CONFIDENCE_PCT==100.00. No anchor returns `[]`.
   - **4c Edge-weight bounds** (per-row): EDGE_WEIGHT in `_EDGE_TYPE_WEIGHT_BAND[edge_type]`. SELF exactly 1.000.
   - **4d Confidence bounds** (per-row): CONFIDENCE_PCT in [30.00, 100.00]. SELF exactly 100.00.
   - **4e Date-coherence** (per-row): EDGE_LAST_SEEN_DATE >= EDGE_DISCOVERED_DATE; EDGE_DISCOVERED_DATE <= run_ts.date(); SELF rows: discovered==last_seen==week_start.
   - **4f Edge-count band** (per-anchor mean): mean edges/anchor across SAMPLE_ANCHORS in [1, 5]. With L1's empty cross-plan tables the mean will be 1.0; with full live data ~3-5. Inclusive band is intentional.
   - Skip distributional convergence over EDGE_TYPE rates entirely — the 100-anchor SAMPLE_ANCHORS won't have all cross-plan dependencies satisfied, so most edge types resolve to "soft-skip" in tests.

4. **Task 4 (SP).** Implement `_rows_for` per the rowspec. Structural points: `_probe_available_edge_types(session)` runs first to build `available_edge_types: set[str]` from `IF EXISTS` probes (SELF/ADVISOR_BOOK/REFERRAL/BUSINESS_OWNER always present; HOUSEHOLD/CORPORATE_PARENT/BOARD_MEMBER conditional). Cross-plan lookup tables (`household_pool`, `dnb_parents`, `boardex_seats`, `advisor_books`) built once in `main()` and passed into `_rows_for`; absent cross-plan tables yield empty lookups. MERGE source SELECT explicit casts on `EDGE_TYPE::VARCHAR(20)`, `EDGE_WEIGHT::NUMBER(4,3)`, `CONFIDENCE_PCT::NUMBER(5,2)`, `METADATA::VARCHAR(500)`, `GENERATED_AT::TIMESTAMP_NTZ(9)` (write_pandas datetime nanos bug, Plan 1 v1.4). Single-part `assert_coverage` for distinct-src-accounts (Plan 6's two-part band overkill — SELF-fallback obviates the row-count band). Per-edge-type emit counts logged to `TASK_EXECUTION_LOG.ERROR_MESSAGE` on success (e.g. `"emit_counts: HOUSEHOLD=24013, ..., BOARD_MEMBER=skipped(no_table), ..., SELF=4899"`) — operator-visible signal for SOFT-dependency skips.

5. **Task 5 (L2).** 14-anchor fixture (mixed Retail/Wealth/Business). Plan 9-specific assertions:
   - `COUNT(DISTINCT SRC_ACCOUNT_ID) == 14` (audience size; SELF-fallback guarantees this).
   - At least one anchor produces ≥1 row (every anchor does, by SELF-fallback).
   - `COUNT(*) WHERE EDGE_TYPE = 'SELF'` ≥ 1 (in L2 with empty cross-plan fixtures, every anchor SELF-falls-back, so this should equal 14).
   - Idempotent re-run: ROWS_INSERTED=0.
   - Test the SOFT-dependency path explicitly: install a mock `CLARITAS_DEMOGRAPHICS` table with 2 fixture rows, re-run, verify HOUSEHOLD edges appear and SELF count drops accordingly.

6. **Task 6 (deploy).** Clone Plan 6's `scripts/deploy_sp.py` (Plan 6 is the closer 1:N template than Plan 8). Single salt `"synth-graph"` (matches manifest). Update docstring describing Plan 9's four structural deviations. No `&` sanitize. **Weekly cron** `'USING CRON 0 5 * * 1 UTC'` (matches Plan 6's weekly cadence — same Monday 05:00 UTC slot; tasks run sequentially in alphabetical-ish task-name order, not concurrently, so no warehouse contention concern). `MAIN_WH_XS`. Wrapper `SP_RETRY_WRAPPER('FINS.PUBLIC.SP_GENERATE_SYNTH_RELATIONSHIP_GRAPH()', 2)`.

7. **Task 7 (DC stream + DMO).** API path identical to Plans 1-8. **DC PK collapse:** project `EDGE_ID = SUBSTR(SHA2(SRC||'|'||DST||'|'||EDGE_TYPE, 256), 1, 32)` at the DLO source view; use `edgeId__c` as the single-column DMO PK with KQ qualifiers `srcAccountId__c` (FK to `ssot__Account__dlm`), `dstAccountId__c`, `edgeType__c`. Mapping table:

   | Snowflake | DC field | Type |
   |---|---|---|
   | `EDGE_ID` (projected) | edgeId__c | Text (PK) |
   | SRC_ACCOUNT_ID | srcAccountId__c | Text (FK + KQ) |
   | DST_ACCOUNT_ID | dstAccountId__c | Text (KQ) |
   | EDGE_TYPE | edgeType__c | Text (KQ) |
   | EDGE_WEIGHT | edgeWeight__c | Number |
   | CONFIDENCE_PCT | confidencePct__c | Number |
   | EDGE_DISCOVERED_DATE | edgeDiscoveredDate__c | Date |
   | EDGE_LAST_SEEN_DATE | edgeLastSeenDate__c | Date |
   | METADATA | metadata__c | Text |
   | GENERATED_AT | generatedAt__c | DateTime |

   Both date fields need `format: "MM/dd/yyyy"` per v1.4.1. `srcAccountId__c` is the joinable FK; `dstAccountId__c` is an account ID but not registered as an FK — destination-side joins use raw equality.

8. **Task 8 (L3 smoke).** Verify SP run, ~110K-180K rows expected. Spot-check:
   - `COUNT(DISTINCT SRC_ACCOUNT_ID) = 36,813` (audience size; SELF-fallback guarantees this regardless of cross-plan availability).
   - Total rows in band [36,813, 200,000]. Floor is "every anchor SELF-falls-back"; ceiling is generous to absorb full Claritas+D&B+BoardEx output.
   - `COUNT(*) GROUP BY EDGE_TYPE` distribution — confirm the per-edge-type counts logged in TASK_EXECUTION_LOG.ERROR_MESSAGE match the actual table counts.
   - 5 random anchors — verify each has ≥1 row, edge_weight bounds hold, confidence bounds hold, date-coherence holds.
   - SELF-edge invariant: `COUNT(*) WHERE EDGE_TYPE='SELF' AND (SRC_ACCOUNT_ID != DST_ACCOUNT_ID OR EDGE_WEIGHT != 1.000 OR CONFIDENCE_PCT != 100.00)` should be 0.
   - Cross-plan visibility: confirm BOARD_MEMBER count is either 0 (Plan 10 not yet shipped — expected at Plan 9 ship time) or matches BoardEx director-seat count.

## §5 Self-review checklist

- [ ] Audience predicate `1=1` in 4 places (SP `_AUDIENCE_PREDICATE`, audience SQL with `SELECT DISTINCT`, coverage SQL, L1 fixture passes through full SAMPLE_ANCHORS).
- [ ] Salt `"synth-graph"` in SP module constant.
- [ ] `_rows_for(anchor, run_ts, **lookup_tables) -> list[dict]` shape.
- [ ] Single seed: `seed_for(account_id, "synth-graph", week_start)`. Week-bucketed via `_week_start(run_ts)`.
- [ ] SELF-fallback unconditional: every `_rows_for` that would return `[]` returns `[self_edge(anchor)]` instead.
- [ ] Cross-plan probes wrapped in try/except in `_probe_available_edge_types`. Never fail SP on missing cross-plan table.
- [ ] Per-edge-type emit counts logged to TASK_EXECUTION_LOG.ERROR_MESSAGE on success.
- [ ] Rows sorted by `(DST_ACCOUNT_ID, EDGE_TYPE)` before MERGE.
- [ ] Composite PK `(SRC_ACCOUNT_ID, DST_ACCOUNT_ID, EDGE_TYPE)` in DDL and MERGE ON.
- [ ] Single-part coverage assertion (distinct src accts = audience size). No row-count band.
- [ ] DLO source view projects `EDGE_ID` for DC single-column DMO PK.
- [ ] DC DMO PK is single-column `edgeId__c`. KQ qualifiers `srcAccountId__c`, `dstAccountId__c`, `edgeType__c`.
- [ ] Weekly cron `'USING CRON 0 5 * * 1 UTC'` (matches Plan 6).
- [ ] No `<<` placeholders left.

## §6 Out of scope

- Graph algorithms (PageRank, centrality, community detection, shortest-path).
- Transitive closure (A→C inferred from A→B + B→C).
- Time-windowed edge history — only most-recent state.
- Edge polarity / sentiment.
- Real BoardEx / D&B / Claritas vendor licenses.
- Per-row provenance / attribution metadata.
- Inverse edges for unidirectional types (CORPORATE_PARENT subsidiary→parent only).

## §7 Status

Pending implementation. Plans 1-8 LIVE: 171,363 rows total. Plan 9 is the **second 1:N dataset** (Plan 6 was first), the **second weekly cadence** (Plan 6 first; Plan 12 third), and the **only edge-scoped dataset** in the rollout — the row PK is the directed-edge tuple, not an account-anchored single key. Introduces the **first cross-plan SOFT dependency** pattern: SP runs green even if Claritas / D&B / BoardEx outputs are empty or absent, courtesy of the SELF self-edge fallback that guarantees coverage. Blueprints the SOFT-dependency pattern Plan 12 may adopt to ground sentiment edges on prior CRM activity.
