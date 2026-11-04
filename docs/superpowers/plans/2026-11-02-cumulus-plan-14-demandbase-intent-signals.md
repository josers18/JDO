# Cumulus Plan 14 — Demandbase Intent Signals Implementation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Stand up the fourteenth per-dataset Cumulus pipeline, the first **third-party buying-intent** dataset. It produces Demandbase/G2/Bombora-style weekly topic-intent scores per non-household business account, covering which banking products the company is researching off-site right now. Weekly cadence. The SP emits **1–4 topic rows per anchor per week** into `DATA_JEDAIS.FINS__PUBLIC.DEMANDBASE_INTENT_SIGNALS`, roughly 10.5K rows/week and ~270K rows with the 26-week backfill (amended 2026-11-02; see §4a). The table is federated as `CumulusDemandbaseIntentSignals__dlm`.

**Why this dataset:** the 2026-11-02 vendor-gap assessment found intent was the one category with **zero** coverage. Every existing behavioral signal is first-party: Gong `KEY_TOPICS_FLAGS`, website prospects, web engagements. Third-party intent answers a question none of the 13 shipped plans can: *"which commercial clients are shopping for a product we sell, before they ask us?"*

**Architecture:** Instantiates the dataset template (v1.5). Plan 12 (Gong, weekly) is the closest sibling. There are **four structural deviations**:

1. **Sparse 1:N per account-week (third 1:N plan after Plan 6 / Plaid and Plan 9 / Graph).** The PK is `(ACCOUNT_ID, PROFILE_WEEK, INTENT_TOPIC)`. Every anchor always emits its **top-affinity topic** row, which may be a low score with no surge. That keeps the per-account coverage assertion intact. The anchor emits 0–3 additional topic rows when their score clears the reporting threshold. The row factory returns a `list[dict]`, not a dict.
2. **Stateless trajectory recomputation.** `WEEKS_SURGING` and `SCORE_DELTA_WOW` depend on prior weeks. Instead of reading the previous week's table rows, the row factory **recomputes the score for weeks W-1 … W-12** from the same deterministic function. It is a pure function with no self-read, so backfill and live runs produce identical values. This is new to the rollout; Plan 12's trend reads a year-stable salt only.
3. **Two salts.** `demandbase` is week-bucketed and drives weekly noise, researchers, keywords and source. `demandbase_year` is year-bucketed and drives per-(account, topic) base affinity and competitor preference. Base affinity must be year-stable, or topics would reshuffle every week and the surge narrative would be noise.
4. **Soft cross-plan read of Gong (Plan 12).** If `GONG_CALL_SENTIMENT` exists, the SP left-joins the same-week `KEY_TOPICS_FLAGS`. When Gong flags `Competitor` that week, the probability that `RESEARCHING_COMPETITOR` is non-NULL rises from 20% to 70%. If the table is absent, the bias is skipped rather than failed. This is the same SOFT-dep pattern as Plan 9.

**Depends on:** Plan 0. **Soft-depends on** Plan 12 (Gong), and the dataset is fully functional without it. Independent of Plans 15 and 16.

---

## §1 Placeholder values

| Placeholder | Value |
|---|---|
| `<<PLAN_N>>` | `14` |
| `<<DATASET_SLUG>>` | `demandbase-intent-signals` |
| `<<DATASET_SLUG_UNDERSCORE>>` | `demandbase_intent_signals` |
| `<<MIMICS_VENDOR>>` | `Demandbase` (with G2 + Bombora as co-op signal sources) |
| `<<DATASET_TABLE>>` | `DEMANDBASE_INTENT_SIGNALS` |
| `<<DATASET_TABLE_LOWER>>` | `demandbase_intent_signals` |
| `<<REPO_DIR>>` | `Snowflake_Demandbase_IntentSignals` |
| `<<DC_DMO>>` | `CumulusDemandbaseIntentSignals__dlm` |
| `<<DATASET_SALT>>` | `demandbase` (weekly) + `demandbase_year` (year-stable affinity) — two salts |
| `<<CADENCE>>` | `WEEKLY` |
| `<<TASK_NAME>>` | `TASK_WEEKLY_DEMANDBASE_INTENT_SIGNALS` |
| `<<TASK_NAME_LOWER>>` | `task_weekly_demandbase_intent_signals` |
| `<<SP_NAME>>` | `SP_GENERATE_DEMANDBASE_INTENT_SIGNALS` |
| `<<CRON>>` | `'USING CRON 15 3 * * 1 America/New_York'` (Monday 03:15 ET; amended 2026-11-02). Live Cumulus TASKs all use America/New_York 03:xx slots: Gong 03:00 (runs <1 min), Graph 03:05, WEEKLY_BALANCE_REPORT 03:10, MASTER_ACCOUNTS 03:25 daily. The original `30 5 * * 1 UTC` is 00:30 ET in winter, ~2.5 h *before* Gong writes the week, so every scheduled run would miss the soft-dep bias |
| `<<AUDIENCE_PREDICATE>>` | `ACCOUNT_TYPE_FLAG = 'BUSINESS' AND COALESCE(CLIENT_CATEGORY, '') <> 'Household'` |
| `<<COVERAGE_RULE>>` | distinct accts = audience (every anchor emits ≥1 topic row per week) |
| `<<ROW_PK>>` | `(ACCOUNT_ID, PROFILE_WEEK, INTENT_TOPIC)` |
| `<<COLUMN_LIST>>` | See rowspec — 17 data columns (+ `ORG_ID`, `RECORD_ID`) including 2 NULLable, 2 BOOLEAN |

## §2 Audience-predicate probe

`ACCOUNT_TYPE_FLAG = 'BUSINESS' AND COALESCE(CLIENT_CATEGORY, '') <> 'Household'`

**Live cardinality (probed 2026-11-02 against `DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS`):** **6,435 anchors**.

| CLIENT_CATEGORY (BUSINESS) | Anchors | In audience? |
|---|---|---|
| Household | 5,090 | **No** — FSC household container records, not companies; they don't research B2B products |
| Small Business | 4,656 | Yes |
| Commercial Banking | 960 | Yes |
| NULL | 711 | Yes |
| Silver / Gold / Bronze / Platinum / `''` | 108 | Yes (legacy tier labels on real business accounts) |
| **Total in audience** | **6,435** | |

**Why not `ACCOUNT_TYPE_FLAG = 'BUSINESS'` alone (11,525)?** That set includes the 5,090 Household containers. Plans 11 and 13 accepted them because firmographics and market context degrade gracefully to defaults. Intent can't: a "Household researching Equipment Finance" surge is a demo-breaking false signal. `COALESCE` is required because `NULL <> 'Household'` is NULL in SQL and would silently drop the 711 NULL-category anchors.

**Why not the "rebroadcast all-accounts" shape Plans 8/10/12 adopted?** PERSON anchors have no B2B research footprint. Emitting zero-score rows for 25K people adds about 650K rows of noise per 26 weeks for no demo value. This dataset stays audience-scoped, as Plan 11 (ZoomInfo) did.

**Size ladder (amended 2026-11-02):** 6,435 anchors × 1.634 topics/week ≈ **10.5K rows/week**. With the 26-week backfill (§4 Task 6) the total is **~270K rows**. Both figures are projected from the reference sample (791 live anchors, `MOD(ABS(HASH(ACCOUNT_ID)), 8) = 0`, 10 weeks ending 2026-11-02); the original estimate was 11.6K / 300K at ~1.8 topics/week.

## §3 Rowspec attachment

`docs/superpowers/plans/attachments/cumulus-plan-14-demandbase-intent-signals-rowspec.md`

The attachment contains:
- 17-data-column DDL (15 NOT NULL + 2 NULLable) plus `ORG_ID` + `RECORD_ID`, and PK `(ACCOUNT_ID, PROFILE_WEEK, INTENT_TOPIC)`.
- The 10-topic vocabulary with `TOPIC_CATEGORY`.
- The INDUSTRY → topic-affinity map and ANNUAL_REVENUE tilt.
- The `_score_for(account, topic, week)` trajectory function, the core of the dataset.
- `WEEKS_SURGING` lookback recomputation, journey-stage derivation and the Gong soft-dep competitor bias.
- `_rows_for(anchor, run_ts, gong_flags)` skeleton returning a list.
- L1 targets (range / vocabulary / trajectory-coherence / cross-field / schema).

## §4 What changes from the v1.5 template (Plan 12 baseline)

1. **Task 1 (scaffold).** AGENTS.md gotchas:
   - **1:N row factory.** `_rows_for` returns `list[dict]` (length 1–4). The top-affinity topic row is **always** emitted, even at score 5, because it keeps coverage = audience. Never return an empty list.
   - **Trajectory is recomputed, never read.** `WEEKS_SURGING` / `SCORE_DELTA_WOW` call `_score_for` for prior weeks. The SP must **not** `SELECT` from `DEMANDBASE_INTENT_SIGNALS`, because a self-read would make backfill order-dependent.
   - **Two salts.** `demandbase_year` is keyed `(account_id + "_" + topic)` with `datetime(year, 1, 1)` and holds base affinity and competitor preference. `demandbase` is keyed on the same string with `week_start` and holds noise, researcher count, keyword, source and last-signal day.
   - **Week anchor** is Monday midnight, `week_start = (run_ts - timedelta(days=run_ts.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)` (Plan 12 pattern).
   - **Gong soft-dep.** Probe `INFORMATION_SCHEMA.TABLES` for `GONG_CALL_SENTIMENT`. If it's present, left-join on `(ACCOUNT_ID, PROFILE_WEEK)`; if absent, pass `gong_flags=None`. Gong's live coverage is all 36,948 accounts × 47 weeks (~6,430 audience rows per week), but the join keeps only rows with non-NULL `KEY_TOPICS_FLAGS`, so the logged `gong_rows_joined` (audience accounts with non-NULL Gong flags that week) is ~1,560–1,680 of 6,435 per week on the live backfill.
   - **Household exclusion uses `COALESCE`** (see §2). Put a comment on the predicate so no one "simplifies" it.
   - DC mapping descriptions ≤521 chars (Plan 6 finding).

2. **Task 2 (table DDL).**
   - The column list leads with `ORG_ID VARCHAR(18) NOT NULL DEFAULT 'JDO'`.
   - Then `RECORD_ID VARCHAR(36) NOT NULL` = `record_id_for(org_id, account_id, profile_week, intent_topic)` (`cumulus_common/record_id.py`).
   - The `_STAGING` sibling has identical columns at DDL time. Each SP run replaces it via `write_pandas(auto_create_table=True, overwrite=True)`, which uses auto-inferred types and no PK.
   - PK is `(ORG_ID, ACCOUNT_ID, PROFILE_WEEK, INTENT_TOPIC)`.
   - Schema at `Snowflake_Demandbase_IntentSignals/schemas/demandbase_intent_signals.sql`.
   - **`cumulus_common/record_id.py` is still untracked in git** (2026-11-02). Commit it in the foundation step of whichever of Plans 14–16 lands first.

3. **Task 3 (L1 tests).** The per-plan conftest builds an inline **12-anchor** fixture. It covers 8 INDUSTRY values (Restaurant, Construction, Real Estate, Wholesale, Logistics, Healthcare, Technology, Manufacturing), 1 NULL INDUSTRY, 1 Commercial Banking at ANNUAL_REVENUE ≥ $25M and 1 at revenue NULL. Property #4 has FIVE classes:
   - **4a Range:** INTENT_SCORE in [0,100]; WEEKS_SURGING in [0,12]; SCORE_DELTA_WOW in [-100,100]; UNIQUE_RESEARCHERS in [1,40].
   - **4b Vocabulary:** INTENT_TOPIC in the 10-value set; TOPIC_CATEGORY in 4; JOURNEY_STAGE in 4; SIGNAL_SOURCE in 3; RESEARCHING_COMPETITOR in the 10-value set or None.
   - **4c Trajectory coherence (load-bearing):** run `_rows_for` for week W and W-1 for the same anchor.
     - For every topic present in both weeks, `SCORE_DELTA_WOW(W) == score(W) - score(W-1)`.
     - If `SURGE_FLAG` holds at W and at W-1, then `WEEKS_SURGING(W) == min(WEEKS_SURGING(W-1)+1, 12)`.
     - If `SURGE_FLAG` is false, then `WEEKS_SURGING == 0`.
   - **4d Bias band:** across 200 synthetic weeks, Restaurant anchors' top-affinity topic ∈ {Merchant Services, Payroll Services, Equipment Finance, Business Credit Cards} ≥ 80% of the time. Real Estate anchors put Commercial Real Estate Lending in their top-2 ≥ 75%.
   - **4e Schema:** every dict's keys equal the 17 data columns (`ORG_ID` and `RECORD_ID` are stamped by the SP).
   - Also: each week has **exactly one** row with `IS_TOP_TOPIC=True` per anchor, and topics are unique within an anchor-week.

4. **Task 4 (SP).** Implement `_rows_for(anchor, run_ts, gong_flags)` per the rowspec.
   - The MERGE is `ON (ORG_ID, ACCOUNT_ID, PROFILE_WEEK, INTENT_TOPIC)`. Same-week re-runs `UPDATE` in place.
   - A topic present last run but absent now (score dropped below threshold) is **deleted for that week only**. The MERGE adds `WHEN NOT MATCHED BY SOURCE AND target.PROFILE_WEEK = :week THEN DELETE`, or a pre-MERGE `DELETE ... WHERE PROFILE_WEEK = :week` followed by an INSERT. **Prefer the DELETE+INSERT inside one transaction.** Snowflake MERGE has no `NOT MATCHED BY SOURCE`.
   - Boolean cast: `SURGE_FLAG::BOOLEAN`.
   - Datetime fix: `TO_TIMESTAMP_NTZ(GENERATED_AT::NUMBER / 1000000000)`.
   - `PROFILE_WEEK` / `LAST_SIGNAL_DATE` cast via `TO_DATE(TO_TIMESTAMP_NTZ(col::NUMBER/1e9))` (write_pandas all-NULL/date mistype lesson).
   - **Gong read, deduped:** probe `GONG_PROBE_SQL`; if present, read `gong_flags_sql(week)` (one row per ACCOUNT_ID) into `_merge_gong_flags`. Never LEFT JOIN raw Gong onto the anchors: live Gong has a duplicate (ACCOUNT_ID, PROFILE_WEEK) pair (`001am00000qvjs6AAA` / 2026-09-28) that would duplicate PKs and RECORD_IDs.
   - **Pre-write guard:** `_assert_unique_pk(staged_rows)` before DELETE+INSERT.
   - **Log** `gong_rows_joined` and `gong_competitor_accounts` per week; warn when Gong exists but `gong_rows_joined = 0`.
   - **SP signature:** `SP_GENERATE_DEMANDBASE_INTENT_SIGNALS(BACKFILL_WEEKS NUMBER DEFAULT 0)`. With `0` it runs the current week only (the TASK path). With `N>0` it loops weeks W-N … W in ascending order. A single SP is required, because inter-SP imports are unsupported (Snowpark lesson).

5. **Task 5 (L2).** Use the 12-anchor `V_ACCOUNT_ANCHORS_FIXTURE`, with no `GONG_CALL_SENTIMENT_FIXTURE` on the first pass. Assertions:
   - `COUNT(DISTINCT ACCOUNT_ID)=12`.
   - Every anchor has exactly one `IS_TOP_TOPIC` row.
   - Idempotent re-run leaves the row count and checksum unchanged.
   - **Second pass** adds a Gong fixture flagging `Competitor` for 6 anchors. Expect `RESEARCHING_COMPETITOR` non-NULL on ≥3 of those 6 anchors' top rows, and ≤3 of the other 6. Evaluate it per week over the 5 weeks of the `CALL SP(4)` backfill pass (the fixture flags all 5) and require ≥4 of 5 weeks: a single calendar week fails ~3% of the time (101 of 104 weeks pass over two years; failing weeks include 2026-08-31). L1 asserts every 5-week window over those 104 weeks has ≥4 passing weeks.
   - **Backfill pass:** `CALL SP(4)` produces 5 distinct `PROFILE_WEEK`s. Week-W rows from the backfill must be byte-identical to a standalone week-W run (excluding GENERATED_AT). This is the trajectory-recomputation proof.

6. **Task 6 (deploy).**
   - Clone Plan 12's `scripts/deploy_sp.py` (weekly cadence + two salts). Inline `seed_for`, `assert_coverage` and `record_id_for`.
   - Cron `15 3 * * 1 America/New_York`, warehouse `MAIN_WH_XS`, wrapper `SP_RETRY_WRAPPER('DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_DEMANDBASE_INTENT_SIGNALS()', 2)`.
   - **After deploy, run the backfill once by hand:** `CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_DEMANDBASE_INTENT_SIGNALS(25)`. That gives 26 weeks ≈ 270K rows. The TASK runs the no-arg form.
   - No bare `&` anywhere in SQL files: the topic name is `International Payments and FX`, never `&` (snow-sql render trap).

7. **Task 7 (DC stream + DMO).** API path identical to Plans 1–13. Mapping table:

   | Snowflake | DC field | Type |
   |---|---|---|
   | RECORD_ID | recordId__c | Text (PK) |
   | ORG_ID | orgId__c | Text |
   | ACCOUNT_ID | ssot__AccountId__c | Text (KQ → `ssot__Account__dlm`) |
   | PROFILE_WEEK | profileWeek__c | Date (format MM/dd/yyyy) |
   | INTENT_TOPIC | intentTopic__c | Text |
   | TOPIC_CATEGORY | topicCategory__c | Text |
   | IS_TOP_TOPIC | isTopTopic__c | Boolean |
   | INTENT_SCORE | intentScore__c | Number |
   | SURGE_FLAG | surgeFlag__c | Boolean |
   | WEEKS_SURGING | weeksSurging__c | Number |
   | SCORE_DELTA_WOW | scoreDeltaWow__c | Number |
   | JOURNEY_STAGE | journeyStage__c | Text |
   | UNIQUE_RESEARCHERS | uniqueResearchers__c | Number |
   | RESEARCHING_COMPETITOR | researchingCompetitor__c | Text (NULLable) |
   | KEYWORD_SAMPLE | keywordSample__c | Text |
   | SIGNAL_SOURCE | signalSource__c | Text |
   | LAST_SIGNAL_DATE | lastSignalDate__c | Date (format MM/dd/yyyy) |
   | INTENT_NOTE | intentNote__c | Text (NULLable) |
   | GENERATED_AT | generatedAt__c | DateTime |

   - **Single-column PK:** the composite PK collapses to `recordId__c` (Plan 4 single-PK rule), which is why RECORD_ID exists.
   - Booleans are declared **Boolean** in the stream schema, not Text.
   - Both DATE columns need `format: "MM/dd/yyyy"` (v1.4.1).

8. **Task 8 (L3 smoke).** Verify the SP run and backfill: **6,435** distinct accounts per week, ~10.5K rows/week (band 9K–15K), 26 distinct weeks. 0 duplicate `RECORD_ID`s and 0 duplicate (ORG_ID, ACCOUNT_ID, PROFILE_WEEK, INTENT_TOPIC) keys. The run log shows `gong_rows_joined > 0` for every week, and the first scheduled TASK run (03:15 ET) is byte-identical to a re-run of the same week. Spot-check:
   - **Coverage:** every audience anchor has exactly 1 `IS_TOP_TOPIC` row per week; 0 Household-category accounts present.
   - **Surge rate:** `SURGE_FLAG` on 8–15% of rows; ≥1 surging topic for 15–25% of accounts each week.
   - **Industry bias:**
     - Restaurant top topic ∈ {Merchant Services, Payroll Services, Equipment Finance, Business Credit Cards} ≥ 75%.
     - Real Estate / Real Estate Holdings put CRE Lending in the top-2 ≥ 70%.
     - Logistics / Wholesale Distribution carry International Payments and FX or AP Automation in ≥50% of their rows.
   - **Revenue tilt:** anchors with ANNUAL_REVENUE ≥ $10M show Treasury Management rows at ≥2× the rate of <$1M anchors. SBA Lending shows the inverse.
   - **Trajectory:**
     - 0 rows with `SURGE_FLAG=FALSE AND WEEKS_SURGING>0`.
     - For 20 random surging (account, topic) pairs, `WEEKS_SURGING` equals the actual consecutive-surge count in the table.
   - **Gong coherence:** among top rows in weeks where Gong `KEY_TOPICS_FLAGS ILIKE '%Competitor%'`, `RESEARCHING_COMPETITOR` is non-NULL ≥55%. Elsewhere it's ≤30%.
   - **Demo pick:** list the 10 Commercial Banking accounts with the longest current Treasury Management surge. Those names go in the demo script.

## §4a Implementation deviations (recorded 2026-11-02, Tasks 1–3 review)

The rowspec attachment has been amended to match the code. Summary:

| Item | Original spec | Shipped | Why |
|---|---|---|---|
| Restaurant × SBA Lending multiplier | 1.5 | 1.2 | On all 876 live Restaurant anchors (2026 affinity year), 1.5 gives 77.2% vs 91.7% for 1.2 against the ≥80% L1 / ≥75% L3 Restaurant band |
| Logistics / Wholesale Distribution FX, AP multipliers | Logistics FX 2.0, AP 1.8; WD FX 2.5, AP 2.0 | Logistics FX 2.2, AP 2.4; WD FX 2.8, AP 2.8 | The originals put FX-or-AP in 49.6% of rows for the 313 live anchors over 26 weeks, a coin flip against the L3 ≥50% band. Re-tuned: 57.8% (Logistics 58.5%, WD 56.6%); L1 pins ≥55% on a mid-market synthetic book |
| Surge episodes | hazard `min(0.6, 0.08·aff)`, bump U(28,45), blocks aligned book-wide | hazard `min(0.70, 0.15·aff)`, bump U(35,50), per-(account, topic) block phase | The spec values missed every L3 surge band and caused a synchronized 12-week sawtooth. Tuned values on the reference sample (791 live anchors × 10 weeks): 1.634 rows per anchor-week, 13.9% surging rows, 20.6% of accounts surging |
| LAST_SIGNAL_DATE | [PROFILE_WEEK, +6] clamped ≤ run date | [PROFILE_WEEK−6, PROFILE_WEEK] | The clamp broke same-week determinism. Plan 12 `LAST_CALL_DATE` precedent |
| Boring case | exactly one row | one row in most weeks (≥60% asserted) | A tuned episode occasionally lifts a second topic over 40 |
| Gong competitor gate | score ≥50 gate on every row | gate lifted on the top row when Gong flags Competitor | With the gate, top rows (resting ≤55) hit only 15.3% even when fully flagged (reference sample; 69.6% with the override). The Task 5 / Task 8 top-row Gong assertions were unreachable. They now hold: L1 measures 72% flagged vs 4.2% unflagged, and the L2-fixture split passes 25 of 26 weeks (L2 now judged over its 5 backfill weeks, ≥4 of 5) |
| TASK cron | `30 5 * * 1 UTC` | `15 3 * * 1 America/New_York` | The UTC slot fired before Gong (03:00 ET) in winter, so scheduled runs missed the soft-dep bias |
| Gong join | left-join on (ACCOUNT_ID, PROFILE_WEEK) | per-account aggregate + `_assert_unique_pk` | Live Gong has an unenforced UNIQUE and a duplicate account-week |
| Volume | 11.6K/week, 300K total | ~10.5K/week, ~270K total | Follows from the tuned fan-out (still inside the 9K–15K band) |

## §5 Self-review checklist

- [ ] Audience predicate excludes Household via `COALESCE(CLIENT_CATEGORY,'') <> 'Household'`; probe = 6,435.
- [ ] `_rows_for` returns 1–4 rows; exactly one `IS_TOP_TOPIC=True`; never empty.
- [ ] No `SELECT` from `DEMANDBASE_INTENT_SIGNALS` inside the SP; trajectory fields come from `_score_for` recomputation.
- [ ] Two salts: `demandbase` (week) + `demandbase_year` (year), keyed `account_id + "_" + topic`.
- [ ] Gong read is guarded by an existence probe; SP succeeds with Gong absent.
- [ ] Per-week DELETE+INSERT in one transaction (not MERGE-only), so dropped topics don't linger.
- [ ] `BACKFILL_WEEKS` arg; TASK calls the no-arg form.
- [ ] RECORD_ID from all 4 PK parts; DC PK = `recordId__c`; Booleans declared Boolean.
- [ ] No bare `&` in SQL; no `<<` placeholders left.

## §6 Out of scope

- Real Demandbase / G2 / Bombora licensing, taxonomy fidelity (Bombora has ~12K topics; we model 10 banking-product topics), or ABM-platform integration.
- Person-level researcher identity (who at the company researched). Plan 15 covers named contacts, but the two aren't joined.
- Page-level / URL-level engagement detail. First-party web engagement already exists in `CumulusWeb_Engagements__dlm`.
- Harmonic-funding → Treasury-intent coupling (a fresh round should spike Treasury Management intent). This is a natural follow-up once Plan 16 is LIVE: add a soft-dep read of `HARMONIC_COMPANY_SIGNALS` mirroring the Gong one.
- Intent for PERSON anchors (Wealth/Retail). Consumer intent is a different product category with different vendors.

## §7 Status

**LIVE** (Snowflake 2026-11-02; DC stream + DMO `BT_Demandbase_Intent_Signals` LIVE 2026-11-04 via REST, category Other). Drafted 2026-11-02 from the vendor-gap assessment. Plans 0–13 are LIVE. Branch `feat/cumulus-chainC-plan14`.

| Task | State (2026-11-02) |
|---|---|
| T1–T4 scaffold, DDL, row factory, SP | done. L1: **77 passed** (row factory 46, SP write path 23, deploy 8) |
| T2 DDL | LIVE in `DATA_JEDAIS.FINS__PUBLIC`: `DEMANDBASE_INTENT_SIGNALS` + `_STAGING`, 19 columns each, PK `PK_DEMANDBASE_INTENT_SIGNALS`. `_STAGING` is replaced by `write_pandas` on each SP run (auto-inferred types, no PK) |
| T5 L2 | 38 of 38 assertion columns TRUE (Passes A–D 34, Pass E 4). `c09` rewritten as JOIN + HAVING after a false FALSE from correlated `EXISTS OR EXISTS`; `c10` added as its negative control. Pass E (real audience, `CALL (25)` on the `_TIMING` clone): 274,143 rows, 6,435 accounts, 26 weeks, 201,818 ms |
| T6 SP + TASK | LIVE. `SP_GENERATE_DEMANDBASE_INTENT_SIGNALS(BACKFILL_WEEKS NUMBER DEFAULT 0)`; `TASK_WEEKLY_DEMANDBASE_INTENT_SIGNALS` started, `USING CRON 15 3 * * 1 America/New_York`, MAIN_WH_XS, via `SP_RETRY_WRAPPER(..., 2)`. First scheduled run Monday 2026-11-09 03:15 ET |
| T6 backfill `CALL …(25)` | **done**: `SUCCEEDED rows=274143 accounts=6435 weeks=26`, DURATION_MS 217,113. Real table: 274,143 rows, 26 weeks 2026-05-11 … 2026-11-02 |
| T7 DC stream + DMO | **LIVE 2026-11-04** via REST: `BT_Demandbase_Intent_Signals` stream/DLO/DMO, category Other, Account relationship ACTIVE, 274,143 rows match Snowflake (IDs in the sub-project AGENTS.md) |
| T8 L3 smoke | **Real table: 18 of 18 checks TRUE** (`tests/integration/l3_smoke_demandbase_intent_signals.sql`, scoped to the backfill run's 26-week window) |

L3 figures (real table, 26 weeks 2026-05-11 … 2026-11-02):
- 6,435 accounts and 6,435 top rows every week (= the backfill run's ACCOUNTS_PROCESSED); 10,469–10,659 rows/week (avg 10,544); 274,143 rows; 0 duplicate RECORD_IDs or keys; 0 Household rows.
- Surging rows 13.5–14.8% per week; surging accounts 20.1–22.1%.
- Restaurant top topic in set 91.7%; Real Estate CRE top-2 92.6%; Logistics/WD FX-or-AP 57.8%.
- Treasury Management 0.545 vs 0.014 rows per anchor-week (≥$10M vs <$1M); SBA Lending 0.436 vs 0.015 (<$1M vs ≥$10M).
- Trajectory: all 35,966 checkable surging rows (18,943 multi-week) match the table.
- Gong coherence: 69.7% of 16,436 flagged top rows have a competitor, vs 4.7% of 150,874 unflagged rows. `gong_rows_joined` 1,564–1,679 (> 0) for 26 of 26 weeks.
- Demo pick (Commercial Banking, longest Treasury surge in week 2026-11-02): Powell-Wood Holdings (8 weeks, score 91), then Sloan-Mccullough Industries (7).

Deviations from the task text:
- L3 Real Estate check counts CRE as "top 2" if it is IS_TOP_TOPIC or rank ≤ 2 by score.
- L3 trajectory checks every surging row, not 20 random ones.
- L3 revenue bands put NULL `ANNUAL_REVENUE` anchors in the "<$1M" band (`COALESCE(ANNUAL_REVENUE, 0)`), because the SP's `_revenue_tilt` treats NULL revenue as main street.
- L3 checks the backfill's 26-week window (from the latest 26-week run in `TASK_EXECUTION_LOG`) and compares coverage with that run's `ACCOUNTS_PROCESSED`, not with today's `V_ACCOUNT_ANCHORS`. Without this the file would fail once the TASK adds week 2026-11-09 or MASTER_ACCOUNTS changes the audience.
- `deploy_sp.py` takes `--role` and gets its connection from `SNOWFLAKE_DEFAULT_CONNECTION_NAME`, never `-c`.

Still open: after the first scheduled run (2026-11-09 03:15 ET), check `TASK_HISTORY` and `TASK_EXECUTION_LOG` for the `TASK_WEEKLY_DEMANDBASE_INTENT_SIGNALS` entry (the TASK → `SP_RETRY_WRAPPER` → SP path has only ever been exercised by direct CALLs) and run the byte-identity check of that week against a no-arg re-run; DC stream + DMO in the UI.

Plan 14 is the **third 1:N dataset** (after Plan 6 and Plan 9), the **fourth weekly plan** (after Plans 6, 9, 12), and the first to derive multi-week trajectory fields by **stateless recomputation** rather than self-reads or year-stable salts.
