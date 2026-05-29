-- =============================================================================
-- FINS.PUBLIC.MOODYS_MARKET_CONTEXT
-- Moody's Investors Service / Moody's Analytics-style synthetic credit-rating
-- + market-context dataset per publicly traded instrument.
-- =============================================================================
-- Plan:       FINAL Cumulus plan (Plan 13 of 13). Most-divergent instantiation
--             of the dataset template (4 structural deviations vs Plan 8).
-- Scope:      INSTRUMENT-SCOPED (not account-scoped). PK is (TICKER, PROFILE_DATE);
--             there is NO ACCOUNT_ID column. Second non-account-scoped Cumulus
--             plan after Plan 4 (Esri / branch-scoped).
-- Cadence:    DAILY via TASK_DAILY_MOODYS_MARKET_CONTEXT — second daily-cadence
--             plan in the rollout (Cron: 0 1 * * * UTC — every day at 01:00 UTC,
--             pre-Asia-open, after Plan 7's 06:00 UTC slot to avoid warehouse
--             contention).
-- Audience:   Instrument-scoped, all-rows — every instrument in
--             FINS.PUBLIC.INSTRUMENT_UNIVERSE (no WHERE clause). 1:1 — each
--             instrument emits exactly one row per day → ~2,004 rows/day.
--             Re-runs same calendar day MERGE-replace in place; no daily
--             history retained.
-- Schema-drift note: spec described the audience as `WHERE IS_ACTIVE = TRUE`
--             keyed by INSTRUMENT_ID; live INSTRUMENT_UNIVERSE has TICKER PK
--             and no IS_ACTIVE column. Plan 13 keys on TICKER and reads the
--             full table unconditionally.
-- Identifier rename: rowspec's digit-leading market-data fields renamed to
--             FIFTY_TWO_WEEK_HIGH_PRICE / FIFTY_TWO_WEEK_LOW_PRICE /
--             THIRTY_DAY_PRICE_CHANGE_PCT — Snowflake identifiers cannot
--             begin with a digit.
-- Generator:  SP_GENERATE_MOODYS_MARKET_CONTEXT (Snowpark Python via SP_RETRY_WRAPPER)
-- Egress:     DC Snowflake federation -> DLO/DMO CumulusMoodysMarketContext__dlm
-- Plan doc:   docs/superpowers/plans/2026-05-28-cumulus-plan-13-moodys-market-context.md
-- Rowspec:    docs/superpowers/plans/attachments/cumulus-plan-13-moodys-market-context-rowspec.md
-- =============================================================================

CREATE OR REPLACE TABLE FINS.PUBLIC.MOODYS_MARKET_CONTEXT (
    TICKER                       VARCHAR(10)       NOT NULL  COMMENT 'Instrument.TICKER from INSTRUMENT_UNIVERSE — the publicly traded instrument this market-context row describes. PK component. NOT a foreign key to ssot__Account__dlm; account ↔ instrument joins go through the trades-pipeline graph.',
    PROFILE_DATE                 DATE              NOT NULL  COMMENT 'Market-context run date (UTC). Day-bucketed for determinism — mid-day re-runs are byte-identical. PK component.',
    CREDIT_RATING                VARCHAR(4)        NOT NULL  COMMENT 'Moody''s-style 22-rating + NR taxonomy: Aaa..C plus NR. Year-stable per ticker via salt "moodys_year". SECTOR-biased distribution (Financials cluster A/Baa, Utilities cluster Aa/A, Technology spans Aaa..Caa1).',
    RATING_OUTLOOK               VARCHAR(12)       NOT NULL  COMMENT 'Stable (~78%), Positive (~8%), Negative (~8%), Developing (~3%), Watch (~3%). Year-stable per ticker via salt "moodys_year".',
    OUTLOOK_LAST_CHANGED_DATE    DATE              NULL      COMMENT 'Date of last RATING_OUTLOOK change (year-stable). NULL when RATING_OUTLOOK has been Stable for the entire ticker history (80% of Stable instruments — ~62% of all rows). Non-Stable outlooks always populated within last 0-12 months.',
    MARKET_CAP_USD               NUMBER(18,2)      NOT NULL  COMMENT 'Market capitalization (USD). Range $50M-$3T. Year-stable shares-outstanding base (BASE_PRICE × log-uniform shares draw on salt "moodys_year") × (1 + daily 30-day-change/100). Hybrid year-stable + daily.',
    DAILY_VOLATILITY_PCT         NUMBER(5,2)       NOT NULL  COMMENT 'Realized daily volatility (%). Range [0.00, 25.00]. Daily-bucketed via salt "moodys" + _daily_seed wrapper. ~0-3% normal, occasional 5-10% spikes (5% chance).',
    THIRTY_DAY_PRICE_CHANGE_PCT  NUMBER(5,2)       NOT NULL  COMMENT 'Cumulative 30-day price change (%). Range [-25.00, +25.00]. Daily-bucketed via salt "moodys" + _daily_seed. Synthesized as cumulative drift over 30 random ±1% draws. Renamed from rowspec''s 30_DAY_PRICE_CHANGE_PCT — Snowflake identifiers cannot begin with a digit.',
    FIFTY_TWO_WEEK_HIGH_PRICE    NUMBER(12,4)      NOT NULL  COMMENT '52-week high price (USD). Year-stable per ticker via salt "moodys_year". BASE_PRICE × random multiplier in [1.10, 1.85], with a sanity floor of BASE_PRICE × 0.5. Renamed from rowspec''s 52_WEEK_HIGH_PRICE — Snowflake identifiers cannot begin with a digit.',
    FIFTY_TWO_WEEK_LOW_PRICE     NUMBER(12,4)      NOT NULL  COMMENT '52-week low price (USD). Year-stable per ticker via salt "moodys_year". BASE_PRICE × random multiplier in [0.55, 0.95]. Renamed from rowspec''s 52_WEEK_LOW_PRICE — Snowflake identifiers cannot begin with a digit.',
    RATING_AGENCY_FLAG_COUNT     NUMBER(2,0)       NOT NULL  COMMENT 'Count of recent rating-watch / credit-action events. Range [0, 3]. Year-stable per ticker via salt "moodys_year". Most tickers (85%) have 0; 10% have 1; 4% have 2; 1% have 3.',
    LIQUIDITY_TIER               VARCHAR(10)       NOT NULL  COMMENT 'Tier 1 (mega-cap, ≥$50B) / Tier 2 (large-cap, ≥$5B) / Tier 3 (mid-cap, ≥$500M) / Illiquid (<$500M). Year-stable per ticker — derived from year-stable shares-outstanding base WITHOUT daily noise to avoid tier flips on small daily moves.',
    LAST_DATA_REFRESH_AT         TIMESTAMP_NTZ(9)  NOT NULL  COMMENT 'Day-bucketed (= PROFILE_DATE 00:00:00) for byte-identical mid-day re-runs.',
    GENERATED_AT                 TIMESTAMP_NTZ(9)  NOT NULL  COMMENT 'Day-bucketed for byte-identical mid-day re-runs (audit time -> TASK_EXECUTION_LOG).',
    CONSTRAINT pk_moodys_market_context PRIMARY KEY (TICKER, PROFILE_DATE)
)
COMMENT = 'Moody''s Investors Service / Moody''s Analytics-style synthetic credit-rating + market-context dataset per publicly traded instrument. FINAL Cumulus plan (Plan 13 of 13). INSTRUMENT-SCOPED (not account-scoped) — second non-account-scoped Cumulus plan after Plan 4 (Esri / branch-scoped); rows keyed by (TICKER, PROFILE_DATE) with NO ACCOUNT_ID column. Second daily-cadence plan in the rollout — re-runs same day MERGE-replace, no daily history retained, ~2,004 rows/day. Two-salt model: "moodys" (daily) for market signals + "moodys_year" (year-stable) for editorial signals (rating, outlook, 52W band, liquidity tier). 12 NOT NULL + 1 NULLable (OUTLOOK_LAST_CHANGED_DATE) — simplest NULL/Boolean footprint of any Cumulus dataset (0 BOOLEAN). DMO not joinable to ssot__Account__dlm; ticker__c is the canonical join key. DC PK collapses to single-column profileDate__c with ticker__c as a KQ qualifier. See Snowflake_Moodys_MarketContext/README.md and Plan 13.';
