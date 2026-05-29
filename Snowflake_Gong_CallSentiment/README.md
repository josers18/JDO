# Gong Call Sentiment — Cumulus Synthetic Dataset (Conversation Intelligence)

Synthetic Gong / Chorus.ai / ExecVision-style weekly conversation-intelligence rollups per Wealth Management + Commercial Banking anchor for Cumulus's customer footprint. Mirrors
[Snowflake_MoneyGuidePro_FinancialPlans](../Snowflake_MoneyGuidePro_FinancialPlans) and the Cumulus umbrella spec at
[../docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md](../docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md).

**Plan 12 is account-scoped with weekly cadence — the second weekly Cumulus plan after Plan 6 (Plaid Held-Away). The first Cumulus dataset where NULL semantics cascade-collapse from a single zero-activity Boolean predicate (`CALL_COUNT_LAST_7D == 0`) — when an anchor had no calls that week, six fields collapse together (talk time/ratio zero, sentiment 'Neutral', topics/last-call NULL, action items zero) but the row still emits.** Each distinct Wealth + Commercial anchor produces one rollup row per week. Rows are keyed by composite PK `(ACCOUNT_ID, PROFILE_WEEK)` (~4,880 rows/week at 1:1 anchor:row). Re-runs same calendar week MERGE-replace in place. The DMO is joinable to `ssot__Account__dlm` via FK `ACCOUNT_ID`; DC PK collapses to single-column `profileWeek__c` with `ssot__AccountId__c` as a KQ qualifier (single-column-PK rule from Plan 4).

## Plan
- Plan 12, instantiated from `../docs/superpowers/plans/2026-05-28-cumulus-plan-N-dataset-template.md` (v1.5)
- Per-plan file: `../docs/superpowers/plans/2026-05-28-cumulus-plan-12-gong-call-sentiment.md`
- Rowspec: `../docs/superpowers/plans/attachments/cumulus-plan-12-gong-call-sentiment-rowspec.md`
- Depends on: [Snowflake_Cumulus_Common](../Snowflake_Cumulus_Common) (Plan 0)

## Snowflake objects
- Table: `FINS.PUBLIC.GONG_CALL_SENTIMENT`
- Stored procedure: `FINS.PUBLIC.SP_GENERATE_GONG_CALL_SENTIMENT()`
- Task: `FINS.PUBLIC.TASK_WEEKLY_GONG_CALL_SENTIMENT` (WEEKLY, `0 5 * * 1 UTC`, warehouse `MAIN_WH_XS`, wrapper `SP_RETRY_WRAPPER` retries=2)
- Egress: DC "Snowflake (Federate / Zero Copy)" connector → DLO `CumulusGongCallSentiment__dll` → DMO `CumulusGongCallSentiment__dlm`

## Audience
**Wealth Management + Commercial Banking** — every distinct anchor in `V_ACCOUNT_ANCHORS` whose `CLIENT_CATEGORY IN ('Wealth Management', 'Commercial Banking')`. Gong's revenue-intelligence product targets high-touch relationship segments where RM call activity matters — Wealth advisors covering HNW clients, and Commercial Bankers covering corporate-treasury accounts. Retail self-serves through digital channels (no RM calls); Small Business and Household are below the call-volume threshold where conversation analytics earn their keep:

```sql
SELECT DISTINCT * FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS
WHERE CLIENT_CATEGORY IN ('Wealth Management', 'Commercial Banking')
```

Live cardinality (probed 2026-05-28): **4,880 distinct accounts** (Wealth Management 3,920 + Commercial Banking 960). Mid-size cohort — between Plan 8's 3,920 and Plan 11's 12,021. The audience predicate uses `IN (...)` rather than `=` to handle the 9-value `CLIENT_CATEGORY` drift gracefully (umbrella spec §3 finding) — if a Wealth sub-band like `'Private Wealth Management'` appears upstream, the predicate either becomes empty (caught by coverage assertion) or picks up the rename when the SP is updated.

Each anchor emits exactly one rollup row per week → **~4,880 rows/week → ~21,000/month**.

## Cadence

**Weekly.** Cron `0 5 * * 1 UTC` (Monday 05:00 UTC) — matches Plan 6 (Plaid Held-Away) and in-flight Plan 9 (Synth Relationship Graph). Plan 12 is the second weekly-cadence Cumulus dataset to ship; weekly is rare in the rollout (3 of 13 plans). The seed is **week-bucketed** via `week_start = run_ts - timedelta(days=run_ts.weekday())` truncated to midnight (Monday anchor) — mid-week re-runs are byte-identical.

## Two-salt model

Plan 12 uses two top-level salts (plus one row-factory helper):
- **`gong`** (week-bucketed) — primary salt for everything that legitimately changes weekly: call count, talk time/ratio, sentiment, topics, action items, deal risk, and the cascade-gated dates.
- **`gong_rm`** (year-stable) — secondary salt for `RM_NAME`. RMs don't reassign weekly; the year-stable seed keeps the relationship manager identity sticky across all 52 weeks of a calendar year.
- A tertiary helper `gong_trend` (year-stable) lives inside the row factory for the SENTIMENT_TREND base trajectory — it's a helper, not a top-level dataset salt.

Distinct from Plan 7's three-salt model (each driving a top-level dataset behavior); here it's one main + one year-stable for the single sticky field, plus a helper for trend persistence.

## Cascade-gated NULL semantics

When `CALL_COUNT_LAST_7D == 0`, six fields collapse together to their no-call defaults:

| Field | No-call default |
|---|---|
| `TOTAL_TALK_TIME_MINUTES` | `0` |
| `CUSTOMER_TALK_RATIO_PCT` | `0.00` |
| `OVERALL_SENTIMENT` | `'Neutral'` |
| `KEY_TOPICS_FLAGS` | `NULL` |
| `LAST_CALL_DATE` | `NULL` |
| `ACTION_ITEMS_COUNT` | `0` |

The boring case (no activity that week) is itself a meaningful row, not a row that's filtered out. Coverage invariant still holds — every Wealth + Commercial anchor emits one row per week even on no-call weeks. Plan 12 is the first Cumulus dataset where the boring case has cascade-NULL semantics off a single Boolean predicate (Plan 8's NULL gating was driven by a 3-value enum; Plan 6's was per-row flagged accounts). `NEXT_SCHEDULED_CALL_DATE` carries an independent ~40% NULL gate (RMs don't always schedule the next touch).

## Tests
```bash
cd Snowflake_Gong_CallSentiment
pip install -e ".[dev]"
pip install -e ../Snowflake_Cumulus_Common
pytest tests/ -v
```

## Deploy
```bash
snow sql -f schemas/gong_call_sentiment.sql
snow sql -f procedures/sp_create_procedure.sql
snow sql -f tasks/task_weekly_gong_call_sentiment.sql
```

DC ingest is configured via the existing federation connector (see Plan 12 Task 7 + the recipe at `../Snowflake_Claritas_Demographics/docs/dc-setup-recipe.md`).
