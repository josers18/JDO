-- =============================================================================
-- DATA_JEDAIS.FINS__PUBLIC.OFFER_ELIGIBILITY_HISTORY
-- Every monthly scoring run of SP_GENERATE_OFFER_ELIGIBILITY, one row per
-- account x action code x run month. OFFER_ELIGIBILITY is the latest month of this.
-- =============================================================================
-- Why:        The cockpits' white-space grid shows how a cell's score moved over
--             the last six months. OFFER_ELIGIBILITY keeps one run, so the runs
--             are kept here.
-- Cadence:    MONTHLY. Each SP call replaces its own month (DELETE + INSERT), so
--             re-running a month is idempotent.
-- Backfill:   2026-05 .. 2026-10 scored from the inputs as of each month (Plaid,
--             Claritas, D&B by PROFILE_MONTH; CoreLogic by PROFILE_QUARTER;
--             holdings by OPEN_DATE).
-- Egress:     DC stream BT_Offer_Eligibility_History (DIRECT_ACCESS)
--             → DMO BT_Offer_Eligibility_History__dlm
-- =============================================================================

CREATE TABLE IF NOT EXISTS DATA_JEDAIS.FINS__PUBLIC.OFFER_ELIGIBILITY_HISTORY (
    ORG_ID                   VARCHAR(18)   NOT NULL DEFAULT 'JDO' COMMENT 'Logical-tenant identifier, from V_ACCOUNT_ANCHORS.ORG_ID.',
    RECORD_ID                VARCHAR(48)   NOT NULL COMMENT 'Deterministic <ACCOUNT_ID>|<ACTION_CODE>|<YYYY-MM>; DMO primary key.',
    ACCOUNT_ID               VARCHAR(18)   NOT NULL COMMENT 'Salesforce Account ID (ssot__Id__c).',
    ACTION_CODE              VARCHAR(20)   NOT NULL COMMENT 'Offer code, as in OFFER_ELIGIBILITY.',
    PRODUCT_FAMILY           VARCHAR(10)   NOT NULL COMMENT 'Treasury / Lending / Deposits / Cards / Retail / Wealth.',
    RECOMMENDED_ACTION_RANK  NUMBER(2,0)            COMMENT '1 = best eligible offer for the account that month; NULL = ineligible.',
    CONVERSION_PROBABILITY   NUMBER(5,2)   NOT NULL COMMENT 'Modeled conversion % with outreach.',
    NOACTION_CONVERSION      NUMBER(5,2)   NOT NULL COMMENT 'Modeled conversion % without outreach.',
    EXPECTED_VALUE_UPLIFT    NUMBER(12,2)  NOT NULL COMMENT '(conversion - no-action) / 100 x annual product value, USD.',
    RECOMMENDED_CHANNELS     VARCHAR(20)   NOT NULL COMMENT 'Comma list; EM = email, CC = relationship-manager call.',
    EM_PROBABILITY           NUMBER(5,2)   NOT NULL COMMENT 'Modeled conversion % via email.',
    CC_PROBABILITY           NUMBER(5,2)   NOT NULL COMMENT 'Modeled conversion % via a call.',
    START_DATE               DATE          NOT NULL COMMENT 'Scoring run month (first of month).',
    GENERATED_AT             TIMESTAMP_NTZ NOT NULL COMMENT 'Run month as a timestamp.',
    CONSTRAINT pk_offer_eligibility_history PRIMARY KEY (ORG_ID, ACCOUNT_ID, ACTION_CODE, START_DATE)
)
CLUSTER BY (START_DATE)
COMMENT = 'Monthly next-best-offer score history (all books). See Snowflake_Offer_Eligibility/README.md.';

GRANT SELECT ON TABLE DATA_JEDAIS.FINS__PUBLIC.OFFER_ELIGIBILITY_HISTORY TO ROLE DATA_ANALYST;
GRANT SELECT ON TABLE DATA_JEDAIS.FINS__PUBLIC.OFFER_ELIGIBILITY_HISTORY TO ROLE MCP_EXPLORE_ROLE;
