# Cumulus Plan 14 — Demandbase Intent Signals Implementation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Stand up the fourteenth per-dataset Cumulus pipeline, the first **third-party buying-intent** dataset. It produces Demandbase/G2/Bombora-style weekly topic-intent scores per non-household business account, covering which banking products the company is researching off-site right now. Weekly cadence. The SP emits **1–4 topic rows per anchor per week** into `FINS.PUBLIC.DEMANDBASE_INTENT_SIGNALS`, roughly 11.5K rows/week and ~300K rows with the 26-week backfill. The table is federated as `CumulusDemandbaseIntentSignals__dlm`.

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
| `<<CRON>>` | `'USING CRON 30 5 * * 1 UTC'` (Monday 05:30 UTC — 30 min after Gong's 05:00 so the soft-dep read sees the same week) |
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

**Size ladder:** 6,435 anchors × ~1.8 topics/week ≈ **11.6K rows/week**. With the 26-week backfill (§4 Task 6) the total is **~300K rows**.

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
   - **Gong soft-dep.** Probe `INFORMATION_SCHEMA.TABLES` for `GONG_CALL_SENTIMENT`. If it's present, left-join on `(ACCOUNT_ID, PROFILE_WEEK)`; if absent, pass `gong_flags=None`. Gong's live coverage is all 36,948 accounts × 47 weeks, so the join hits every audience anchor.
   - **Household exclusion uses `COALESCE`** (see §2). Put a comment on the predicate so no one "simplifies" it.
   - DC mapping descriptions ≤521 chars (Plan 6 finding).

2. **Task 2 (table DDL).**
   - The column list leads with `ORG_ID VARCHAR(18) NOT NULL DEFAULT 'JDO'`.
   - Then `RECORD_ID VARCHAR(36) NOT NULL` = `record_id_for(org_id, account_id, profile_week, intent_topic)` (`cumulus_common/record_id.py`).
   - The `_STAGING` sibling has identical columns.
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
   - **SP signature:** `SP_GENERATE_DEMANDBASE_INTENT_SIGNALS(BACKFILL_WEEKS INTEGER DEFAULT 0)`. With `0` it runs the current week only (the TASK path). With `N>0` it loops weeks W-N … W in ascending order. A single SP is required, because inter-SP imports are unsupported (Snowpark lesson).

5. **Task 5 (L2).** Use the 12-anchor `V_ACCOUNT_ANCHORS_FIXTURE`, with no `GONG_CALL_SENTIMENT_FIXTURE` on the first pass. Assertions:
   - `COUNT(DISTINCT ACCOUNT_ID)=12`.
   - Every anchor has exactly one `IS_TOP_TOPIC` row.
   - Idempotent re-run leaves the row count and checksum unchanged.
   - **Second pass** adds a Gong fixture flagging `Competitor` for 6 anchors. Expect `RESEARCHING_COMPETITOR` non-NULL on ≥3 of those 6 anchors' top rows, and ≤3 of the other 6.
   - **Backfill pass:** `CALL SP(4)` produces 5 distinct `PROFILE_WEEK`s. Week-W rows from the backfill must be byte-identical to a standalone week-W run (excluding GENERATED_AT). This is the trajectory-recomputation proof.

6. **Task 6 (deploy).**
   - Clone Plan 12's `scripts/deploy_sp.py` (weekly cadence + two salts). Inline `seed_for`, `assert_coverage` and `record_id_for`.
   - Cron `30 5 * * 1 UTC`, warehouse `MAIN_WH_XS`, wrapper `SP_RETRY_WRAPPER('FINS.PUBLIC.SP_GENERATE_DEMANDBASE_INTENT_SIGNALS()', 2)`.
   - **After deploy, run the backfill once by hand:** `CALL FINS.PUBLIC.SP_GENERATE_DEMANDBASE_INTENT_SIGNALS(25)`. That gives 26 weeks ≈ 300K rows. The TASK runs the no-arg form.
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

8. **Task 8 (L3 smoke).** Verify the SP run and backfill: **6,435** distinct accounts per week, ~11.6K rows/week (band 9K–15K), 26 distinct weeks. Spot-check:
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

Pending implementation. Drafted 2026-11-02 from the vendor-gap assessment. Plans 0–13 are LIVE.

Plan 14 is the **third 1:N dataset** (after Plan 6 and Plan 9), the **fourth weekly plan** (after Plans 6, 9, 12), and the first to derive multi-week trajectory fields by **stateless recomputation** rather than self-reads or year-stable salts.
