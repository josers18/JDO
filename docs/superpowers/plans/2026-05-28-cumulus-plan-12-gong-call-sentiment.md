# Cumulus Plan 12 — Gong Call Sentiment Implementation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Stand up the twelfth per-dataset Cumulus pipeline — Gong-style weekly rollups of relationship-management call sentiment, talk ratios, key topics, action items, and deal-risk scores per Wealth Management + Commercial Banking account. Mid-size audience (4,880 anchors). Weekly cadence. SP emits one row per anchor per week into `FINS.PUBLIC.GONG_CALL_SENTIMENT` (~4,880 rows/week, ~21,000/month), federated as `CumulusGongCallSentiment__dlm`.

**Architecture:** Instantiates the dataset template (v1.5) with **three structural deviations** from Plan 8:
1. **Weekly cadence** — only Plan 6 (Plaid Held-Away) is currently LIVE on a weekly schedule; Plan 9 (Synth Relationship Graph) is being drafted as the third weekly plan. Cron `'USING CRON 0 5 * * 1 UTC'` matches both. Seed is week-bucketed via `week_start = run_ts - timedelta(days=run_ts.weekday())` truncated to midnight (Monday anchor).
2. **Three NULLable columns with mixed gating logic** — `KEY_TOPICS_FLAGS` and `LAST_CALL_DATE` cascade-gate on a single Boolean predicate (`CALL_COUNT_LAST_7D == 0`); `NEXT_SCHEDULED_CALL_DATE` has its own independent ~40% NULL gate. First Cumulus dataset where the boring case is "all the cascade-gated fields collapse together" rather than Plan 8's enum-driven gating.
3. **Year-stable RM_NAME alongside the week-bucketed primary salt** — two-salt model. Primary salt `"gong"` with week-bucketed seed for everything that legitimately changes weekly; secondary salt `"gong_rm"` with year-bucketed seed for RM_NAME (RMs don't rotate weekly). Distinct from Plan 7's three-salt model — just one main salt + one year-stable for stickiness, plus a third year-stable trajectory salt `"gong_trend"` that lives inside the row factory as a helper rather than a top-level dataset salt.

**Depends on:** Plan 0. Independent of Plans 1-11. **Sibling to Plan 9** (also weekly).

---

## §1 Placeholder values

| Placeholder | Value |
|---|---|
| `<<PLAN_N>>` | `12` |
| `<<DATASET_SLUG>>` | `gong-call-sentiment` |
| `<<DATASET_SLUG_UNDERSCORE>>` | `gong_call_sentiment` |
| `<<MIMICS_VENDOR>>` | `Gong` |
| `<<DATASET_TABLE>>` | `GONG_CALL_SENTIMENT` |
| `<<DATASET_TABLE_LOWER>>` | `gong_call_sentiment` |
| `<<REPO_DIR>>` | `Snowflake_Gong_CallSentiment` |
| `<<DC_DMO>>` | `CumulusGongCallSentiment__dlm` |
| `<<DATASET_SALT>>` | `gong` |
| `<<CADENCE>>` | `WEEKLY` |
| `<<TASK_NAME>>` | `TASK_WEEKLY_GONG_CALL_SENTIMENT` |
| `<<TASK_NAME_LOWER>>` | `task_weekly_gong_call_sentiment` |
| `<<SP_NAME>>` | `SP_GENERATE_GONG_CALL_SENTIMENT` |
| `<<CRON>>` | `'USING CRON 0 5 * * 1 UTC'` |
| `<<AUDIENCE_PREDICATE>>` | `CLIENT_CATEGORY IN ('Wealth Management', 'Commercial Banking')` |
| `<<COVERAGE_RULE>>` | distinct accts = audience (1:1 weekly per Wealth+Commercial anchor) |
| `<<ROW_PK>>` | `(ACCOUNT_ID, PROFILE_WEEK)` |
| `<<COLUMN_LIST>>` | See rowspec — 15 columns including 3 NULLable with mixed gating, 1 year-stable, plus the auxiliary year-stable RM_LAST_LOGGED_NOTE_DATE NULL gate |

## §2 Audience-predicate probe

`CLIENT_CATEGORY IN ('Wealth Management', 'Commercial Banking')`

**Live cardinality (probed 2026-05-28):** Wealth Management 3,920 + Commercial Banking 960 = **4,880 anchors**. Mid-size cohort — bigger than Plan 8 (3,920) but smaller than most other Plans (Plans 1, 5, 6 all >25K).

The predicate uses `IN (...)` rather than `=` to handle the 9-value `CLIENT_CATEGORY` drift gracefully (umbrella spec §3 finding). If a Wealth sub-band (e.g., `'Private Wealth Management'`) appears upstream, the predicate either becomes empty (caught by coverage assertion) or picks up the rename when the SP is updated to extend the value list — without silently misclassifying.

No BUSINESS over-count concern — the predicate filters by `CLIENT_CATEGORY`, not `ACCOUNT_TYPE_FLAG`, so the 12,021-row BUSINESS misclassification in §3 of the umbrella spec is not in scope here.

## §3 Rowspec attachment

`docs/superpowers/plans/attachments/cumulus-plan-12-gong-call-sentiment-rowspec.md`

Contains: 15-column DDL (12 NOT NULL + 3 NULLable + 1 auxiliary mixed-gate); PK `(ACCOUNT_ID, PROFILE_WEEK)`; Wealth vs Commercial cohort split; cascade-gated NULL semantics on `CALL_COUNT_LAST_7D == 0`; independent ~40% NULL gate on NEXT_SCHEDULED_CALL_DATE; year-stable RM_NAME (salt `"gong_rm"`) and SENTIMENT_TREND base (salt `"gong_trend"`); DEAL_RISK_SCORE composition; L1 anchor-influence test targets (5 properties).

## §4 What changes from the v1.5 template

Three structural deviations from Plan 8:

1. **Weekly cadence (not monthly).** Plan 8 used `'USING CRON 0 7 1 * * UTC'` (monthly, 1st-of-month). Plan 12 uses `'USING CRON 0 5 * * 1 UTC'` (weekly, Monday 05:00 UTC) — the same cron Plan 6 uses live and Plan 9 will use. The seed pattern shifts from `month_start = run_ts.replace(day=1, ...)` to `week_start = run_ts - timedelta(days=run_ts.weekday())` truncated to midnight. PROFILE_WEEK column replaces PROFILE_MONTH in the PK. Plan 12 is the **second weekly plan in the rollout** — Plan 6 was first; Plan 9 is being drafted now as the third. Weekly cadence is rare here (3 of 13 plans).

2. **Three NULLable columns with mixed gating logic.** Plan 8 had 2 NULLable date columns gated by a single 3-value enum (`PLAN_STATUS`). Plan 12 has 3 NULLable columns with two distinct gate shapes:
   - **Cascade gate** (single Boolean predicate): when `CALL_COUNT_LAST_7D == 0`, six fields collapse together — `KEY_TOPICS_FLAGS` and `LAST_CALL_DATE` go NULL; `TOTAL_TALK_TIME_MINUTES`, `CUSTOMER_TALK_RATIO_PCT`, `ACTION_ITEMS_COUNT` zero out; `OVERALL_SENTIMENT` defaults to `Neutral`. The L1 cascade-gate test is the load-bearing demo behavior — first Cumulus dataset where the boring case (no activity that week) is itself a meaningful row, not a row that's filtered out.
   - **Independent gate** (~40% NULL): `NEXT_SCHEDULED_CALL_DATE` is NULL ~40% of the time regardless of call activity — RMs don't always schedule the next touch.
   - The auxiliary `RM_LAST_LOGGED_NOTE_DATE` is also NULLable (~15% NULL) but feeds into DEAL_RISK_SCORE via the `rm_note_stale` boolean rather than emitting NULL semantics directly.

3. **Year-stable RM_NAME alongside the week-bucketed primary salt — two-salt model.** Plan 8 used a single salt `"mgp"` with month-bucketed seed for everything. Plan 12 uses `"gong"` with week-bucketed seed for everything that legitimately changes weekly (call count, sentiment, topics, talk ratios, deal risk), plus a secondary salt `"gong_rm"` with year-bucketed seed for RM_NAME — RMs don't reassign weekly. This is **not** Plan 7's three-salt model (`worldcheck`, `worldcheck_jurisdiction`, `worldcheck_case` each driving distinct top-level dataset behaviors). It's just one main + one year-stable for stickiness on the single sticky field. A third year-stable salt `"gong_trend"` lives inside the row factory as a base-trajectory helper for SENTIMENT_TREND, but it isn't a top-level dataset salt — it's a helper that lets sentiment trend persist across weeks rather than whipsaw.

Per-task adjustments:

1. **Task 1 (scaffold).** AGENTS.md gotchas:
   - **Weekly cadence.** PROFILE_WEEK is the Monday-of-week DATE — `week_start = run_ts - timedelta(days=run_ts.weekday())` truncated to midnight. Re-runs same week replace.
   - **Cascade-gated NULL contract.** When `CALL_COUNT_LAST_7D == 0`: six fields collapse — `KEY_TOPICS_FLAGS IS NULL`, `LAST_CALL_DATE IS NULL`, `TOTAL_TALK_TIME_MINUTES = 0`, `CUSTOMER_TALK_RATIO_PCT = 0.00`, `ACTION_ITEMS_COUNT = 0`, `OVERALL_SENTIMENT = 'Neutral'`. Coverage invariant still holds — every anchor emits a row even on no-call weeks.
   - **Two-salt + year-stable trajectory model.** Primary salt `"gong"` (week-bucketed). Secondary `"gong_rm"` (year-bucketed) for RM_NAME. Tertiary `"gong_trend"` (year-bucketed) for SENTIMENT_TREND base.
   - **Anchor reads:** ACCOUNT_ID + CLIENT_CATEGORY only. No BIRTHDATE / ANNUAL_INCOME used (Wealth+Commercial cohort bias is on the cohort flag itself, not anchor financial fields).
   - **Date-coherence invariants:** `LAST_CALL_DATE` (if populated) ≤ run_ts.date(); `NEXT_SCHEDULED_CALL_DATE` (if populated) > run_ts.date(); `RM_LAST_LOGGED_NOTE_DATE` (if populated) ≤ run_ts.date().
   - 0 BOOLEAN columns at the table level (DEAL_RISK_SCORE staleness is computed in-flight, not stored).

2. **Task 2 (table DDL).** PK `(ACCOUNT_ID, PROFILE_WEEK)`. 12 NOT NULL + 3 NULLable + 1 mixed-gate (RM_LAST_LOGGED_NOTE_DATE). 0 BOOLEAN columns.

3. **Task 3 (L1 tests).** Plan 1's conftest pattern (importlib + SAMPLE_ANCHORS) but `in_audience_anchors = [a for a in all_anchors if a["CLIENT_CATEGORY"] in ("Wealth Management", "Commercial Banking")]`. Property #4 has FIVE assertions:
   - **4a Cascade-gate invariants** (per-row): for every row with `CALL_COUNT_LAST_7D == 0`, all six cascade fields take their no-call values. Roll over 8+ weeks to encounter at least one no-call week per cohort anchor (Wealth no-call rate ~65%, Commercial ~35%).
   - **4b Range invariants** (per-row): percentages in [0, 100]; `DEAL_RISK_SCORE` in [0.00, 100.00]; `CALL_COUNT_LAST_7D` in [0, 15]; `LAST_CALL_DATE` (if populated) ≤ today; `NEXT_SCHEDULED_CALL_DATE` (if populated) > today.
   - **4c Vocabulary invariants** (per-row): `OVERALL_SENTIMENT` in `_SENTIMENT_VOCAB`; `SENTIMENT_TREND` in `_TREND_VOCAB`; `KEY_TOPICS_FLAGS` (when not NULL/empty) is a pipe-delimited subset of `_TOPIC_POOL`.
   - **4d Year-stable RM_NAME**: same anchor produces identical RM_NAME for two weeks within the same calendar year. Cross-year drift (week 1 of next year vs week 53 of this year) is *expected* and not asserted.
   - **4e Schema contract**: keys exactly match the 15 columns.

4. **Task 4 (SP).** Implement `_row_for` per the rowspec. Three structural points:
   - **Week-bucketed primary seed:** `week_start = run_ts - timedelta(days=run_ts.weekday())` truncated to midnight; `seed_for(account_id, "gong", week_start)`. PROFILE_WEEK = `week_start.date()`.
   - **Year-stable RM and trend seeds:** computed inside helper functions `_rm_name_stable` and `_sentiment_trend_base`, each calling `seed_for(account_id + "_<suffix>", "<gong_rm|gong_trend>", datetime(run_ts.year, 1, 1))`. Pattern lifted from Plan 7's year-stable jurisdiction.
   - **Cascade gate computed first:** `call_count` is drawn before any cascade-gated field, then each gated synthesis function early-returns the no-call default.
   - The MERGE handles 3 NULLable columns. No BOOLEAN cast needed.

5. **Task 5 (L2).** 14-anchor fixture (4 Wealth + 2 Commercial + 8 non-audience filtered out). Plan 12-specific assertions:
   - `COUNT(DISTINCT ACCOUNT_ID) = 6` (audience size, after filter).
   - All 6 emit exactly one row per week.
   - At least 1 Wealth anchor has a no-call week somewhere across an 8-week roll (Wealth no-call rate ~65% × 8 weeks → ~99.99% chance per anchor).
   - **Cascade-gate invariants enforced**: 0 rows where `CALL_COUNT_LAST_7D == 0` AND any cascade field is non-default.
   - **Year-stable RM_NAME**: every anchor has exactly one distinct RM_NAME across all 8 weeks of the same year.
   - Idempotent re-run: ROWS_INSERTED=0.

6. **Task 6 (deploy).** Clone Plan 8's `scripts/deploy_sp.py`. Two salts (`"gong"` primary, `"gong_rm"` year-stable, plus the in-row helper `"gong_trend"`). Update docstring describing Plan 12's structural deviations (weekly + cascade-gated NULL + year-stable RM). No `&` sanitize needed ("Gong" is clean). Weekly cron, `MAIN_WH_XS`. Wrapper `SP_RETRY_WRAPPER('FINS.PUBLIC.SP_GENERATE_GONG_CALL_SENTIMENT()', 2)`.

7. **Task 7 (DC stream + DMO).** API path identical to Plans 1-8. Mapping table:

   | Snowflake | DC field | Type |
   |---|---|---|
   | ACCOUNT_ID | ssot__AccountId__c | Text (FK) |
   | PROFILE_WEEK | profileWeek__c | Date (PK; format MM/dd/yyyy) |
   | CALL_COUNT_LAST_7D | callCountLast7d__c | Number |
   | TOTAL_TALK_TIME_MINUTES | totalTalkTimeMinutes__c | Number |
   | CUSTOMER_TALK_RATIO_PCT | customerTalkRatioPct__c | Number |
   | OVERALL_SENTIMENT | overallSentiment__c | Text |
   | SENTIMENT_TREND | sentimentTrend__c | Text |
   | KEY_TOPICS_FLAGS | keyTopicsFlags__c | Text |
   | ACTION_ITEMS_COUNT | actionItemsCount__c | Number |
   | DEAL_RISK_SCORE | dealRiskScore__c | Number |
   | LAST_CALL_DATE | lastCallDate__c | Date |
   | NEXT_SCHEDULED_CALL_DATE | nextScheduledCallDate__c | Date |
   | RM_NAME | rmName__c | Text |
   | RM_LAST_LOGGED_NOTE_DATE | rmLastLoggedNoteDate__c | Date |
   | GENERATED_AT | generatedAt__c | DateTime |

   `PROFILE_WEEK`, `LAST_CALL_DATE`, `NEXT_SCHEDULED_CALL_DATE`, `RM_LAST_LOGGED_NOTE_DATE` need `format: "MM/dd/yyyy"`. No BOOLEAN columns.

   DC PK collapses to `profileWeek__c` + KQ on `ssot__AccountId__c` (single-column-PK rule from Plan 4).

8. **Task 8 (L3 smoke).** Verify SP run, ~4,880 rows. Spot-check:
   - `COUNT(DISTINCT ACCOUNT_ID) = 4,880` (audience size).
   - All rows have `PROFILE_WEEK` = the Monday of the run-week.
   - Distribution: ~60-65% of rows have `CALL_COUNT_LAST_7D == 0` (boring case dominates).
   - **Cascade-gate invariants on live data**: 0 rows with `CALL_COUNT_LAST_7D == 0` AND non-NULL `LAST_CALL_DATE`; 0 rows with `CALL_COUNT_LAST_7D == 0` AND non-NULL `KEY_TOPICS_FLAGS`; 0 rows with `CALL_COUNT_LAST_7D == 0` AND `OVERALL_SENTIMENT != 'Neutral'`.
   - **Date-coherence**: 0 future-dated `LAST_CALL_DATE`; 0 non-future `NEXT_SCHEDULED_CALL_DATE`.
   - **Range invariants**: percentages in [0, 100]; `DEAL_RISK_SCORE` in [0.00, 100.00].
   - **Cohort difference**: Commercial Banking mean `CALL_COUNT_LAST_7D` ≥ 2× Wealth Management mean (1.8 vs 0.6 expected).
   - 5 random rows for narrative plausibility — at least one boring case, at least one elevated-risk row.

## §5 Self-review checklist

- [ ] Audience predicate `CLIENT_CATEGORY IN ('Wealth Management', 'Commercial Banking')` in 4 places (SP `_AUDIENCE_PREDICATE`, audience SQL, coverage SQL, L1 fixture override).
- [ ] Audience predicate uses `IN (...)`, not `=`, to handle the 9-value CLIENT_CATEGORY drift gracefully.
- [ ] Salt `"gong"` in SP module constant; `"gong_rm"` and `"gong_trend"` in helper functions only.
- [ ] PK `(ACCOUNT_ID, PROFILE_WEEK)` in DDL and MERGE ON.
- [ ] Week-bucketed seed via `week_start = run_ts - timedelta(days=run_ts.weekday())` truncated to midnight.
- [ ] PROFILE_WEEK column populated with `week_start.date()` (Monday of run-week).
- [ ] Cascade gate enforced: `CALL_COUNT_LAST_7D == 0` → all 6 cascade fields take their no-call defaults.
- [ ] `_rm_name_stable` and `_sentiment_trend_base` use year-bucketed `datetime(run_ts.year, 1, 1)` seeds.
- [ ] L1 tests roll over 8+ weeks to encounter both zero and non-zero call weeks.
- [ ] Year-stable RM_NAME test asserts intra-year stability only (cross-year drift is expected).
- [ ] No `<<` placeholders left.

## §6 Out of scope

- Real Gong / Chorus / ExecVision license, OAuth, or API access.
- Transcript text — only derived rollups.
- Speaker diarization beyond CUSTOMER_TALK_RATIO_PCT.
- Topic extraction beyond the simulated 4-topic pool — real Gong identifies hundreds.
- Per-call rows — only weekly rollups.
- Multi-RM accounts — every anchor has exactly one RM.
- Real Monte Carlo deal-risk model — DEAL_RISK_SCORE is biased by inputs, not simulated.
- Email / chat / messaging conversation channels — voice-call rollups only.

## §7 Status

Pending implementation. Plans 1-8 shipping live (8 datasets, 171,363 rows total). Plan 12 is the **second weekly cadence** dataset (after Plan 6) and the **first dataset with cascade-gated NULL semantics for a zero-activity boring case** — validates the recipe handles "no activity this week" as a meaningful row before Plan 9 (Synth Relationship Graph, also weekly, also has self-edge boring-case semantics).

8 of 13 Plans LIVE.
