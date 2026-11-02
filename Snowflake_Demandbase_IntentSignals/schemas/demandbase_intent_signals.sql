-- =============================================================================
-- DATA_JEDAIS.FINS__PUBLIC.DEMANDBASE_INTENT_SIGNALS (+ _STAGING sibling)
-- Demandbase / G2 / Bombora-style synthetic weekly third-party buying-intent
-- topic scores per non-household Cumulus business account.
-- =============================================================================
-- Cadence:    WEEKLY via TASK_WEEKLY_DEMANDBASE_INTENT_SIGNALS
--             (Cron: 30 5 * * 1 UTC -- Monday 05:30 UTC, 30 min after Gong).
-- Audience:   ACCOUNT_TYPE_FLAG = 'BUSINESS'
--             AND COALESCE(CLIENT_CATEGORY, '') <> 'Household'
--             -- 6,435 anchors (probed 2026-11-02). COALESCE is required:
--             NULL <> 'Household' is NULL and would drop NULL-category anchors.
-- Shape:      Sparse 1:N. 1-4 topic rows per anchor per week; the year-stable
--             top-affinity topic always emits (IS_TOP_TOPIC = TRUE, exactly
--             one per account-week), so distinct accounts = audience.
--             Fan-out varies week to week, so the SP rewrites each week
--             wholesale (DELETE the week + INSERT, one transaction).
-- Generator:  SP_GENERATE_DEMANDBASE_INTENT_SIGNALS(BACKFILL_WEEKS INTEGER DEFAULT 0)
-- Egress:     DC Snowflake federation -> DLO/DMO CumulusDemandbaseIntentSignals__dlm
-- Plan:       docs/superpowers/plans/2026-11-02-cumulus-plan-14-demandbase-intent-signals.md
-- Rowspec:    docs/superpowers/plans/attachments/cumulus-plan-14-demandbase-intent-signals-rowspec.md
-- No ampersand anywhere in this file (snow sql template-render trap).
-- =============================================================================

CREATE OR REPLACE TABLE DATA_JEDAIS.FINS__PUBLIC.DEMANDBASE_INTENT_SIGNALS (
    ORG_ID                  VARCHAR(18)       NOT NULL DEFAULT 'JDO' COMMENT 'Multi-org tenant identifier (Phase A convention). Stable short-id per logical tenant, NOT the 18-char SF Org Id. PK component (first).',
    RECORD_ID               VARCHAR(36)       NOT NULL COMMENT 'Deterministic UUID = record_id_for(ORG_ID, ACCOUNT_ID, PROFILE_WEEK, INTENT_TOPIC) (cumulus_common/record_id.py). Single-column DC primary key recordId__c.',
    ACCOUNT_ID              VARCHAR(16777216) NOT NULL COMMENT 'Anchor.ACCOUNT_ID. FK to ssot__Account__dlm. PK component.',
    PROFILE_WEEK            DATE              NOT NULL COMMENT 'Monday of the run week (UTC). Week-bucketed for determinism. PK component.',
    INTENT_TOPIC            VARCHAR(40)       NOT NULL COMMENT 'One of 10 commercial-banking product topics (Treasury Management, Commercial Lending, Equipment Finance, Merchant Services, International Payments and FX, Payroll Services, Commercial Real Estate Lending, SBA Lending, AP Automation, Business Credit Cards). PK component.',
    TOPIC_CATEGORY          VARCHAR(20)       NOT NULL COMMENT 'Lending / Payments / Cash Management / Cards -- fixed by topic.',
    IS_TOP_TOPIC            BOOLEAN           NOT NULL COMMENT 'TRUE for exactly one row per (account, week): the year-stable highest-affinity topic, not the week''s highest score. Always emitted, even at a low score.',
    INTENT_SCORE            NUMBER(3,0)       NOT NULL COMMENT 'Intent strength [0, 100]. Resting level from year-stable affinity plus surge-episode bump plus weekly noise. Non-top topics emit only at >= 40.',
    SURGE_FLAG              BOOLEAN           NOT NULL COMMENT 'INTENT_SCORE >= 70.',
    WEEKS_SURGING           NUMBER(2,0)       NOT NULL COMMENT 'Consecutive weeks including this one with SURGE_FLAG; 0 when not surging; capped at 12. Recomputed from the score function, never read from this table.',
    SCORE_DELTA_WOW         NUMBER(4,0)       NOT NULL COMMENT 'score(W) - score(W-1), recomputed (valid even if the topic did not emit last week). Range [-100, 100].',
    JOURNEY_STAGE           VARCHAR(15)       NOT NULL COMMENT 'Awareness / Consideration / Decision / Purchase -- from score and WEEKS_SURGING.',
    UNIQUE_RESEARCHERS      NUMBER(2,0)       NOT NULL COMMENT 'Distinct anonymous researchers [1, 40]; capped by EMPLOYEE_COUNT tier (3 / 12 / 40) and scaled by score.',
    RESEARCHING_COMPETITOR  VARCHAR(30)       NULL     COMMENT 'Rival the account compared on G2 (year-stable per account-topic). NULL below score 50; otherwise NULL ~80 pct, ~30 pct when same-week Gong KEY_TOPICS_FLAGS has Competitor.',
    KEYWORD_SAMPLE          VARCHAR(200)      NOT NULL COMMENT '2-3 keywords from the topic keyword bank, joined with semicolon-space.',
    SIGNAL_SOURCE           VARCHAR(12)       NOT NULL COMMENT 'Demandbase 55 pct / Bombora 30 pct / G2 15 pct; forced to G2 when RESEARCHING_COMPETITOR is non-NULL.',
    LAST_SIGNAL_DATE        DATE              NOT NULL COMMENT 'Most recent signal day, within the 7 days ending on PROFILE_WEEK (never after the Monday run date).',
    INTENT_NOTE             VARCHAR(200)      NULL     COMMENT 'One-liner for surging rows only, e.g. 3-week surge: 7 researchers comparing treasury platforms. NULL when not surging.',
    GENERATED_AT            TIMESTAMP_NTZ(9)  NOT NULL COMMENT 'Week-bucketed (PROFILE_WEEK at 00:00:00) so same-week re-runs are byte-identical.',
    CONSTRAINT pk_demandbase_intent_signals PRIMARY KEY (ORG_ID, ACCOUNT_ID, PROFILE_WEEK, INTENT_TOPIC)
)
COMMENT = 'Demandbase / G2 / Bombora-style synthetic weekly third-party buying-intent topic scores per non-household Cumulus business account (6,435 anchors). Sparse 1:N: 1-4 topic rows per account-week; exactly one IS_TOP_TOPIC row per account-week. Weekly per-week DELETE + INSERT. Two salts: demandbase (week) + demandbase_year (year-stable affinity). Soft-depends on GONG_CALL_SENTIMENT. DC PK recordId__c. See Snowflake_Demandbase_IntentSignals/README.md and Plan 14.';

-- Staging sibling: identical columns, defaults and comments (CREATE ... LIKE
-- copies the column definitions). The SP loads a week here, then DELETEs that
-- week from the target and INSERTs from staging inside one transaction.
CREATE OR REPLACE TABLE DATA_JEDAIS.FINS__PUBLIC.DEMANDBASE_INTENT_SIGNALS_STAGING
    LIKE DATA_JEDAIS.FINS__PUBLIC.DEMANDBASE_INTENT_SIGNALS;
