-- =============================================================================
-- FINS.PUBLIC.GONG_CALL_SENTIMENT
-- Gong / Chorus.ai / ExecVision-style synthetic weekly conversation-intelligence
-- rollups per Wealth Management + Commercial Banking Cumulus customer.
-- =============================================================================
-- Cadence:    WEEKLY via TASK_WEEKLY_GONG_CALL_SENTIMENT
--             (Cron: 0 5 * * 1 UTC — Monday at 05:00 UTC). Matches Plan 6.
-- Audience:   Wealth Management + Commercial Banking (CLIENT_CATEGORY IN
--             ('Wealth Management', 'Commercial Banking')) — distinct accounts
--             from V_ACCOUNT_ANCHORS, ~4,880 distinct anchors. 1:1 — each
--             anchor emits exactly one row per week → ~4,880 rows/week
--             (~21,000/month). Mid-size cohort — between Plan 8's 3,920 and
--             Plan 11's 12,021. Re-runs same calendar week MERGE-replace
--             in place. The "boring case" of zero call activity that week
--             still emits a row; six fields cascade-collapse to no-call
--             defaults (see comments on NULLable columns).
-- Generator:  SP_GENERATE_GONG_CALL_SENTIMENT (Snowpark Python via SP_RETRY_WRAPPER)
-- Egress:     DC Snowflake federation -> DLO/DMO CumulusGongCallSentiment__dlm
-- Plan:       docs/superpowers/plans/2026-05-28-cumulus-plan-12-gong-call-sentiment.md
-- Rowspec:    docs/superpowers/plans/attachments/cumulus-plan-12-gong-call-sentiment-rowspec.md
-- =============================================================================

CREATE OR REPLACE TABLE FINS.PUBLIC.GONG_CALL_SENTIMENT (
    ACCOUNT_ID                    VARCHAR(16777216) NOT NULL  COMMENT 'Anchor.ACCOUNT_ID — the Cumulus Wealth Management or Commercial Banking customer whose weekly rollup this is. FK to ssot__Account__dlm. PK component.',
    PROFILE_WEEK                  DATE              NOT NULL  COMMENT 'Monday-of-week DATE for the run (UTC) — week_start = run_ts - timedelta(days=run_ts.weekday()) truncated to midnight. Week-bucketed for determinism — mid-week re-runs are byte-identical. PK component.',
    CALL_COUNT_LAST_7D            NUMBER(3,0)       NOT NULL  COMMENT 'Number of recorded calls during the past 7 days. Range [0, 15]. Wealth mean ~0.6/wk (mode 0); Commercial mean ~1.8/wk (mode 1). 0 is common — drives the cascade-gate to no-call defaults on six fields.',
    TOTAL_TALK_TIME_MINUTES       NUMBER(5,0)       NOT NULL  COMMENT 'Sum of call durations in minutes. Range [0, 600] (capped at 10h/wk). Per-call mean Wealth ~22min, Commercial ~38min. Cascade-gated: 0 when CALL_COUNT_LAST_7D = 0.',
    CUSTOMER_TALK_RATIO_PCT       NUMBER(5,2)       NOT NULL  COMMENT '% of total talk time the customer spoke (vs RM). Range [0.00, 100.00]. Wealth mean ~58% (HNW client drives agenda); Commercial mean ~42% (banker walks through deck). Cascade-gated: 0.00 when CALL_COUNT_LAST_7D = 0.',
    OVERALL_SENTIMENT             VARCHAR(15)       NOT NULL  COMMENT 'Very Positive (~5%), Positive (~30%), Neutral (~45%), Negative (~15%), Very Negative (~5%). Cascade-gated: forced to ''Neutral'' when CALL_COUNT_LAST_7D = 0.',
    SENTIMENT_TREND               VARCHAR(12)       NOT NULL  COMMENT 'Improving / Stable / Declining. Driven by year-stable per-anchor base trajectory (salt ''gong_trend'') with small ~20% perturbation when this-week sentiment strongly disagrees. Always populated, including no-call weeks.',
    KEY_TOPICS_FLAGS              VARCHAR(120)      NULL      COMMENT 'Pipe-delimited 0-3 topics from {Pricing, Renewal, Competitor, FeatureRequest}. Empty string = we listened, nothing crossed threshold. NULL = we never listened (cascade-gated: NULL when CALL_COUNT_LAST_7D = 0).',
    ACTION_ITEMS_COUNT            NUMBER(2,0)       NOT NULL  COMMENT 'Detected action items across all calls in the week. Range [0, 10]. Biased up (1.5×) when sentiment is Negative/Very Negative. Cascade-gated: 0 when CALL_COUNT_LAST_7D = 0.',
    DEAL_RISK_SCORE               NUMBER(5,2)       NOT NULL  COMMENT '0.00-100.00. Higher = more at risk. Stacks negative sentiment + Competitor topic flag + RM staleness. 5-20 boring case (no calls + RM fresh); 70-95 worst case. Always populated.',
    LAST_CALL_DATE                DATE              NULL      COMMENT 'Most-recent call date in the week (run_ts.date() - 0..6 days). Cascade-gated: NULL when CALL_COUNT_LAST_7D = 0. When populated, ≤ run_ts.date().',
    NEXT_SCHEDULED_CALL_DATE      DATE              NULL      COMMENT 'Next scheduled RM touch (run_ts.date() + 1..60 days). Independent ~40% NULL gate (RMs don''t always schedule the next touch). Independent of CALL_COUNT_LAST_7D. When populated, > run_ts.date().',
    RM_NAME                       VARCHAR(60)       NOT NULL  COMMENT 'Synthesized relationship manager (first + last from a 60-name pool). Year-stable per anchor — salt ''gong_rm'' bucketed at datetime(run_ts.year, 1, 1). RMs don''t reassign weekly. Cross-year drift expected.',
    RM_LAST_LOGGED_NOTE_DATE      DATE              NULL      COMMENT 'RM''s last activity log entry (1-60 days back, biased to recent). NULL ~15% — RM is genuinely stale. Feeds DEAL_RISK_SCORE via in-flight rm_note_stale boolean (None or >30 days back). Auxiliary mixed gate, not part of the cascade.',
    GENERATED_AT                  TIMESTAMP_NTZ(9)  NOT NULL  COMMENT 'Week-bucketed (= week_start at 00:00:00 of the run-week''s Monday) for byte-identical mid-week re-runs (audit time -> TASK_EXECUTION_LOG).',
    CONSTRAINT pk_gong_call_sentiment PRIMARY KEY (ACCOUNT_ID, PROFILE_WEEK)
)
COMMENT = 'Gong / Chorus.ai / ExecVision-style synthetic weekly conversation-intelligence rollups per Cumulus Wealth Management + Commercial Banking customer. Weekly generation. 1:1 — one row per distinct audience anchor per week (~4,880 rows/week, ~21,000/month). Second weekly Cumulus plan after Plan 6. First Cumulus dataset where NULL semantics cascade-collapse from a single zero-activity Boolean predicate (CALL_COUNT_LAST_7D == 0): six fields collapse to no-call defaults but the row still emits. Composite PK (ACCOUNT_ID, PROFILE_WEEK) — DC DMO collapses to single-column PK profileWeek__c with ssot__AccountId__c as a KQ qualifier. 3 NULLable fields cascade- or independently-gated; 1 auxiliary mixed-gate (RM_LAST_LOGGED_NOTE_DATE) feeds DEAL_RISK_SCORE. 0 BOOLEAN columns. Two-salt model: ''gong'' (week-bucketed) + ''gong_rm'' (year-stable) for RM stickiness. Re-runs same week MERGE-replace. See Snowflake_Gong_CallSentiment/README.md and Plan 12.';
