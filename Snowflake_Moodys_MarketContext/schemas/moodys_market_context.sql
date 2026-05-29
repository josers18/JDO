-- =============================================================================
-- FINS.PUBLIC.MOODYS_MARKET_CONTEXT (v2.x — multi-org-additive)
-- Moody''s Investors Service / Moody''s Analytics-style synthetic credit-rating
-- + market-context dataset per Cumulus BUSINESS account, daily snapshot.
-- =============================================================================
-- Re-scope:   Plan 13 was originally instrument-scoped (TICKER PK, ~2,004 rows
--             per day) keyed off INSTRUMENT_UNIVERSE. v2 re-scopes to per-
--             BUSINESS-account (ACCOUNT_ID PK, ~11,389 anchors per day) so
--             every business customer profile gets a Moody''s-style commercial
--             credit-risk + market-context tile that updates daily. The
--             original instrument-scoped table was unjoinable to Account; the
--             new account-scoped table is the canonical join target via
--             ACCOUNT_ID = ssot__Account__dlm.ssot__Id__c.
-- Multi-org:  v2.x adds ORG_ID first column with DEFAULT ''JDO'' for backward
--             compatibility (additive migration — existing JDO rows back-fill
--             via DEFAULT, future second-org rows stamp their own ORG_ID).
--             PK promoted to (ORG_ID, ACCOUNT_ID, PROFILE_DATE).
-- Cadence:    DAILY via TASK_DAILY_MOODYS_MARKET_CONTEXT (Cron: 0 1 * * * UTC).
--             Second daily-cadence Cumulus plan after Plan 7 (WorldCheck AML).
-- Audience:   ACCOUNT_TYPE_FLAG = ''BUSINESS'' from V_ACCOUNT_ANCHORS — ~11,389
--             distinct anchors. 1:1 — each anchor emits exactly one row per
--             day -> ~11,389 rows/day. Backfill SP fans out 90 days for
--             ~1,025,010 rows; daily SP MERGE-replaces in place.
-- Generator:  SP_GENERATE_MOODYS_MARKET_CONTEXT + SP_BACKFILL_MOODYS_MARKET_CONTEXT
--             (Snowpark Python via SP_RETRY_WRAPPER).
-- Egress:     DC Snowflake federation -> DLO/DMO CumulusMoodysMarketContext__dlm.
-- Two-salt:   "moodys"      (daily-bucketed; market signals)
--             "moodys_year" (year-stable; editorial signals + shares base)
-- Plan doc:   docs/superpowers/plans/2026-05-28-cumulus-plan-13-moodys-market-context.md
-- Rowspec:    docs/superpowers/plans/attachments/cumulus-plan-13-moodys-market-context-rowspec.md
-- =============================================================================

CREATE OR REPLACE TABLE FINS.PUBLIC.MOODYS_MARKET_CONTEXT (
    ORG_ID                       VARCHAR(18)       NOT NULL  DEFAULT 'JDO'  COMMENT 'Tenant / org identifier. NOT NULL with DEFAULT ''JDO'' for backward-compatible additive multi-org migration — existing rows back-fill via DEFAULT; future second-org rows stamp their own ORG_ID. PK first component.',
    ACCOUNT_ID                   VARCHAR(16777216) NOT NULL  COMMENT 'Anchor.ACCOUNT_ID from V_ACCOUNT_ANCHORS — the Cumulus BUSINESS account this market-context tile describes. PK component. Joinable to ssot__Account__dlm.ssot__Id__c for downstream queries.',
    PROFILE_DATE                 DATE              NOT NULL  COMMENT 'Snapshot date (UTC). Day-bucketed for determinism — mid-day re-runs are byte-identical. PK component. Backfill emits one row per (ACCOUNT_ID, PROFILE_DATE) over the prior 90 days; daily SP appends one new PROFILE_DATE per run.',
    CREDIT_RATING                VARCHAR(10)       NOT NULL  COMMENT 'Moody''s-style 22-rating + NR taxonomy: Aaa..C plus NR. Year-stable per ACCOUNT_ID via salt "moodys_year". INDUSTRY-biased distribution (Banking clusters A/Baa, Technology spans Aaa..Caa1, Energy clusters Baa/Ba, etc.). Default fallback distribution applied when INDUSTRY is None / unknown.',
    RATING_OUTLOOK               VARCHAR(20)       NOT NULL  COMMENT 'Stable (~78%), Positive (~8%), Negative (~8%), Developing (~3%), Watch (~3%). Year-stable per ACCOUNT_ID via salt "moodys_year".',
    OUTLOOK_LAST_CHANGED_DATE    DATE              NULL      COMMENT 'Date of last RATING_OUTLOOK change (year-stable). NULL when RATING_OUTLOOK has been Stable for the entire account history (80% of Stable accounts — ~62% of all rows). Non-Stable outlooks always populated within last 0-12 months relative to year-start. Anchored on datetime(year, 1, 1) — purely year-derived, no daily entropy leak.',
    MARKET_CAP_USD               NUMBER(15,2)      NOT NULL  COMMENT 'Implied market capitalization (USD). Range $5M-$500B. Derived as ANNUAL_REVENUE * year-stable revenue-multiple in [3.0, 7.0] (typical commercial valuation band) * (1 + daily 30-day-change/100). Hybrid year-stable + daily. Default revenue 5M used when ANNUAL_REVENUE is missing.',
    DAILY_VOLATILITY_PCT         NUMBER(5,2)       NOT NULL  COMMENT 'Realized daily volatility (%). Range [0.00, 25.00]. Daily-bucketed via salt "moodys" + _daily_seed wrapper. ~0-3% normal days, occasional 5-10% spikes (5% chance).',
    THIRTY_DAY_PRICE_CHANGE_PCT  NUMBER(5,2)       NOT NULL  COMMENT 'Cumulative 30-day price change (%). Range [-25.00, +25.00]. Daily-bucketed via salt "moodys" + _daily_seed. Synthesized as cumulative drift over 30 random ±1% draws.',
    FIFTY_TWO_WEEK_HIGH_USD      NUMBER(15,2)      NOT NULL  COMMENT '52-week high implied market cap (USD). Year-stable per ACCOUNT_ID via salt "moodys_year". MARKET_CAP base * uniform(1.05, 1.50). Always >= FIFTY_TWO_WEEK_LOW_USD by construction.',
    FIFTY_TWO_WEEK_LOW_USD       NUMBER(15,2)      NOT NULL  COMMENT '52-week low implied market cap (USD). Year-stable per ACCOUNT_ID via salt "moodys_year". MARKET_CAP base * uniform(0.55, 0.95).',
    RATING_AGENCY_FLAG_COUNT     NUMBER(2,0)       NOT NULL  COMMENT 'Count of recent rating-watch / credit-action events. Range [0, 5]. Year-stable per ACCOUNT_ID via salt "moodys_year". Most accounts (80%) have 0; small tail at 1-5.',
    LIQUIDITY_TIER               VARCHAR(15)       NOT NULL  COMMENT 'Tier 1 (mega-cap, MARKET_CAP base >= $50B) / Tier 2 (large-cap, >= $5B) / Tier 3 (mid-cap, >= $500M) / Illiquid (< $500M). Year-stable per ACCOUNT_ID — derived from year-stable MARKET_CAP base WITHOUT daily noise to avoid tier flips on small daily moves.',
    ANNUAL_REVENUE_USD           NUMBER(15,2)      NULL      COMMENT 'Pass-through of V_ACCOUNT_ANCHORS.ANNUAL_REVENUE for demo storytelling. NULL when source anchor has no revenue value. Not synthesized — reflects upstream FSC data exactly.',
    EMPLOYEE_COUNT               NUMBER(10,0)      NULL      COMMENT 'Pass-through of V_ACCOUNT_ANCHORS.EMPLOYEE_COUNT for demo storytelling. NULL when source anchor has no employee count. Not synthesized — reflects upstream FSC data exactly.',
    LAST_DATA_REFRESH_AT         TIMESTAMP_NTZ(9)  NOT NULL  COMMENT 'Day-bucketed (= PROFILE_DATE 00:00:00) for byte-identical mid-day re-runs.',
    GENERATED_AT                 TIMESTAMP_NTZ(9)  NOT NULL  COMMENT 'Day-bucketed for byte-identical mid-day re-runs (audit time -> TASK_EXECUTION_LOG).',
    CONSTRAINT pk_moodys_market_context PRIMARY KEY (ORG_ID, ACCOUNT_ID, PROFILE_DATE)
)
COMMENT = 'Moody''s Investors Service / Moody''s Analytics-style synthetic credit-rating + market-context dataset per Cumulus BUSINESS account, daily snapshot. v2.x multi-org-additive: ORG_ID first column DEFAULT ''JDO'', PK (ORG_ID, ACCOUNT_ID, PROFILE_DATE). Re-scoped from instrument-scoped (Plan 13 v1) to per-BUSINESS-account (Plan 13 v2). Joinable to ssot__Account__dlm via (ORG_ID, ACCOUNT_ID). ~11,389 BUSINESS anchors * 90 daily snapshots = ~1,025,010 rows after backfill; daily SP MERGE-replaces in place at ~11,389 rows/day. Two-salt model: "moodys" (daily) for market signals + "moodys_year" (year-stable) for editorial signals (rating, outlook, 52-week band, liquidity tier, revenue multiple). 15 NOT NULL + 3 NULLable (OUTLOOK_LAST_CHANGED_DATE, ANNUAL_REVENUE_USD pass-through, EMPLOYEE_COUNT pass-through). 0 BOOLEAN — no DC Boolean-declaration ceremony required. INDUSTRY-driven rating bias + ANNUAL_REVENUE-driven market-cap synthesis. See Snowflake_Moodys_MarketContext/README.md and Plan 13.';
