# Demandbase Intent Signals — Cumulus Synthetic Dataset (Third-Party Buying Intent)

Synthetic Demandbase Intent / G2 Buyer Intent / Bombora Company Surge-style weekly topic-intent scores for Cumulus's non-household business accounts. Each row says which commercial-banking product a company is researching off-site right now, how strongly, and whether it is surging. It answers a question first-party signals can't: *which commercial clients are shopping for a product we sell before they ask us?*

**Plan 14.** Weekly cadence and sparse 1:N. Each anchor emits 1–4 topic rows per week:
- The year-stable top-affinity topic always emits (`IS_TOP_TOPIC = TRUE`).
- Up to 3 more topics emit when their score clears 40.

Because the fan-out changes week to week, each week is rewritten wholesale (DELETE + INSERT).

Trajectory fields (`WEEKS_SURGING`, `SCORE_DELTA_WOW`) come from **recomputing** the pure score function for prior weeks. They are never read back from the table, so a backfill and a live run produce identical rows.

## Plan
- Plan: `../docs/superpowers/plans/2026-11-02-cumulus-plan-14-demandbase-intent-signals.md` (template v1.5)
- Rowspec: `../docs/superpowers/plans/attachments/cumulus-plan-14-demandbase-intent-signals-rowspec.md`
- Depends on: [Snowflake_Cumulus_Common](../Snowflake_Cumulus_Common) (Plan 0)
- Soft-depends on: [Snowflake_Gong_CallSentiment](../Snowflake_Gong_CallSentiment) (Plan 12). A same-week Gong `Competitor` flag raises `RESEARCHING_COMPETITOR` from 20% to 70% on score ≥50 rows. On the account's top-topic row it also lifts the score ≥50 gate, so 70% applies at any score. The Gong read is aggregated to one row per account (live Gong has a duplicate account-week). If the table is absent, the bias is skipped.

## Snowflake objects
- Table: `DATA_JEDAIS.FINS__PUBLIC.DEMANDBASE_INTENT_SIGNALS` (+ `_STAGING`, identical columns)
- Stored procedure: `DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_DEMANDBASE_INTENT_SIGNALS(BACKFILL_WEEKS INTEGER DEFAULT 0)` (Task 4)
- Task: `TASK_WEEKLY_DEMANDBASE_INTENT_SIGNALS`, cron `15 3 * * 1 America/New_York` (Monday 03:15 ET, after Gong 03:00 / Graph 03:05 / balance report 03:10, matching the live America/New_York slot convention). Runs on `MAIN_WH_XS` via `SP_RETRY_WRAPPER('…SP_GENERATE_DEMANDBASE_INTENT_SIGNALS()', 2)` (Task 6).
- Egress: DC "Snowflake (Federate / Zero Copy)" connector → DMO `CumulusDemandbaseIntentSignals__dlm`. DC mapping is pending in the UI; see the mapping table in [AGENTS.md](AGENTS.md).

## Audience
```sql
SELECT DISTINCT * FROM DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS
WHERE ACCOUNT_TYPE_FLAG = 'BUSINESS' AND COALESCE(CLIENT_CATEGORY, '') <> 'Household'
```
**6,435 anchors** (probed 2026-11-02). The audience excludes the 5,090 FSC Household containers. `COALESCE` keeps the NULL-category business anchors.

## Columns (17 data + ORG_ID + RECORD_ID)
`ORG_ID`, `RECORD_ID`, `ACCOUNT_ID`, `PROFILE_WEEK`, `INTENT_TOPIC` (10 topics), `TOPIC_CATEGORY` (Lending / Payments / Cash Management / Cards), `IS_TOP_TOPIC`, `INTENT_SCORE` (0–100), `SURGE_FLAG` (score ≥70), `WEEKS_SURGING` (0–12), `SCORE_DELTA_WOW`, `JOURNEY_STAGE` (Awareness / Consideration / Decision / Purchase), `UNIQUE_RESEARCHERS` (1–40), `RESEARCHING_COMPETITOR` (NULLable), `KEYWORD_SAMPLE`, `SIGNAL_SOURCE` (Demandbase / Bombora / G2), `LAST_SIGNAL_DATE`, `INTENT_NOTE` (NULLable, surging rows only), `GENERATED_AT`. Full DDL: [schemas/demandbase_intent_signals.sql](schemas/demandbase_intent_signals.sql).

## Expected volume
These are row-factory estimates on a 791-anchor live sample (1/8 hash sample, 10 weeks ending 2026-11-02), not live counts:
- 1.634 rows per anchor-week, so ~10.5K rows/week.
- 13.9% of rows surging; 20.6% of accounts with at least one surging topic each week.
- ~270K rows after the one-time 26-week backfill, `CALL …(25)`.

## Tests
```bash
cd Snowflake_Demandbase_IntentSignals
pytest tests/ -v      # L1: row factory + SP write path (fake session) + deploy script; cumulus_common resolves via pyproject pythonpath
snow sql -f tests/integration/test_demandbase_intent_signals_sp.sql   # L2: every assertion column must be TRUE (needs DDL + SP deployed)
```

## Deploy
```bash
snow sql -f schemas/demandbase_intent_signals.sql   # table + _STAGING
python scripts/deploy_sp.py                          # Task 6: inline-source SP (--drop-old-signature if a no-arg version exists)
snow sql -f tasks/task_weekly_demandbase_intent_signals.sql
snow sql -q "CALL DATA_JEDAIS.FINS__PUBLIC.SP_GENERATE_DEMANDBASE_INTENT_SIGNALS(25)"   # one-time 26-week backfill
```
Use unflagged `snow sql` (the default JWT connection). Passing `-c` to an OAuth connection opens a browser popup.
See AGENTS.md → Gotchas → "Deploy connection" for the current state of the snow CLI connection.
