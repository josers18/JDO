# Gong Call Sentiment — Cumulus Synthetic Dataset (Conversation Intelligence)

Synthetic Gong / Chorus.ai / ExecVision-style weekly conversation-intelligence rollups per account (all anchors, call volume tiered by `CLIENT_CATEGORY`) for Cumulus's customer footprint. Mirrors
[Snowflake_MoneyGuidePro_FinancialPlans](../Snowflake_MoneyGuidePro_FinancialPlans) and the Cumulus umbrella spec at
[../docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md](../docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md).

**Plan 12 is account-scoped with weekly cadence — the second weekly Cumulus plan after Plan 6 (Plaid Held-Away). The first Cumulus dataset where NULL semantics cascade-collapse from a single zero-activity Boolean predicate (`CALL_COUNT_LAST_7D == 0`) — when an anchor had no calls that week, six fields collapse together (talk time/ratio zero, sentiment 'Neutral', topics/last-call NULL, action items zero) but the row still emits.** The audience is all accounts (~36,813 anchors); the v1 design was Wealth + Commercial only (~4,880), and the rebroadcast widened it with per-`CLIENT_CATEGORY` call-rate tiering (see [Audience](#audience)). Each distinct anchor produces one rollup row per week. Rows are keyed by composite PK `(ACCOUNT_ID, PROFILE_WEEK)` (~36,813 rows/week at 1:1 anchor:row). Re-runs same calendar week MERGE-replace in place. The DMO is joinable to `ssot__Account__dlm` via FK `ACCOUNT_ID`; DC PK collapses to single-column `profileWeek__c` with `ssot__AccountId__c` as a KQ qualifier (single-column-PK rule from Plan 4).

## Plan
- Plan 12, instantiated from `../docs/superpowers/plans/2026-05-28-cumulus-plan-N-dataset-template.md` (v1.5)
- Per-plan file: `../docs/superpowers/plans/2026-05-28-cumulus-plan-12-gong-call-sentiment.md`
- Rowspec: `../docs/superpowers/plans/attachments/cumulus-plan-12-gong-call-sentiment-rowspec.md`
- Depends on: [Snowflake_Cumulus_Common](../Snowflake_Cumulus_Common) (Plan 0)

## Snowflake objects
- Table: `DATA_JEDAIS.FINS__PUBLIC.GONG_CALL_SENTIMENT`
- Stored procedure: `DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_GONG_CALL_SENTIMENT()`
- Task: `DATA_JEDAIS.FINS__PUBLIC.TASK_WEEKLY_GONG_CALL_SENTIMENT` (WEEKLY, `0 5 * * 1 UTC`, warehouse `MAIN_WH_XS`, wrapper `SP_RETRY_WRAPPER` retries=2)
- Egress: DC "Snowflake (Federate / Zero Copy)" connector → DLO `CumulusGongCallSentiment__dll` → DMO `CumulusGongCallSentiment__dlm`

## Audience
**All accounts** — every distinct anchor in `V_ACCOUNT_ANCHORS` (no `CLIENT_CATEGORY` filter). The audience predicate:

```sql
SELECT DISTINCT * FROM DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS
```

Cardinality: **~36,813 distinct accounts**. The v1 design was Wealth Management + Commercial Banking only (`CLIENT_CATEGORY IN ('Wealth Management', 'Commercial Banking')`, 4,880 accounts probed 2026-05-28); the rebroadcast dropped that predicate.

**Per-`CLIENT_CATEGORY` call-rate tiering.** Instead of filtering low-touch segments out, `_call_count_last_7d` caps weekly call volume by category:

| `CLIENT_CATEGORY` | Max calls / week | Zero-call rate |
|---|---|---|
| Commercial Banking | 5 | 20% |
| Wealth Management | 3 | 40% |
| Small Business | 2 | 75% |
| Retail, Household | 1 | 90% |
| Unknown / NULL | 0 | 95% (always 0 calls) |

Unknown-category rows always hit the no-call cascade below, but still emit.

Each anchor emits exactly one rollup row per week → **~36,813 rows/week**.

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

The boring case (no activity that week) is itself a meaningful row, not a row that's filtered out. Coverage invariant still holds — every anchor emits one row per week even on no-call weeks. Plan 12 is the first Cumulus dataset where the boring case has cascade-NULL semantics off a single Boolean predicate (Plan 8's NULL gating was driven by a 3-value enum; Plan 6's was per-row flagged accounts). `NEXT_SCHEDULED_CALL_DATE` carries an independent ~40% NULL gate (RMs don't always schedule the next touch).

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
