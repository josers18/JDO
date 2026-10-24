-- =============================================================================
-- DATA_JEDAIS.FINS__PUBLIC.OFFER_ELIGIBILITY
-- Next-best-offer scores for Cumulus BUSINESS accounts: treasury management
-- and lending action codes, keyed to the Salesforce Account ID.
-- =============================================================================
-- Why:        The Databricks model (DC Offer_Eligibility_Model__dlm) only scores
--             person accounts by MDM party key, so business accounts had no
--             offers. This table fills that gap; the React cockpits UNION both.
-- Cadence:    MONTHLY via TASK_MONTHLY_OFFER_ELIGIBILITY (one scoring run kept;
--             each run replaces the table).
-- Audience:   V_ACCOUNT_ANCHORS ACCOUNT_TYPE_FLAG = 'BUSINESS', Salesforce ids only.
-- Generator:  SP_GENERATE_OFFER_ELIGIBILITY (SQL; deterministic per account/code/month)
-- Egress:     DC stream BT_Offer_Eligibility (DIRECT_ACCESS) → DMO BT_Offer_Eligibility__dlm
-- Columns mirror the Databricks model so the reader can UNION them.
-- =============================================================================

CREATE TABLE IF NOT EXISTS DATA_JEDAIS.FINS__PUBLIC.OFFER_ELIGIBILITY (
    ORG_ID                   VARCHAR(18)   NOT NULL DEFAULT 'JDO' COMMENT 'Logical-tenant identifier, from V_ACCOUNT_ANCHORS.ORG_ID.',
    RECORD_ID                VARCHAR(40)   NOT NULL COMMENT 'Deterministic <ACCOUNT_ID>|<ACTION_CODE>; DMO primary key, stable across runs.',
    ACCOUNT_ID               VARCHAR(18)   NOT NULL COMMENT 'Salesforce Account ID (ssot__Id__c).',
    ACTION_CODE              VARCHAR(20)   NOT NULL COMMENT 'BIZ-TM-* treasury or BIZ-* lending code; BIZ- prefix matches the commercial family filter.',
    PRODUCT_FAMILY           VARCHAR(10)   NOT NULL COMMENT 'Treasury / Lending.',
    RECOMMENDED_ACTION_RANK  NUMBER(2,0)            COMMENT '1 = best eligible offer for the account (by expected uplift); NULL = ineligible.',
    CONVERSION_PROBABILITY   NUMBER(5,2)   NOT NULL COMMENT 'Modeled conversion % with outreach.',
    NOACTION_CONVERSION      NUMBER(5,2)   NOT NULL COMMENT 'Modeled conversion % without outreach.',
    EXPECTED_VALUE_UPLIFT    NUMBER(12,2)  NOT NULL COMMENT '(conversion - no-action) / 100 x annual product value, USD.',
    RECOMMENDED_CHANNELS     VARCHAR(20)   NOT NULL COMMENT 'Comma list; EM = email, CC = relationship-manager call.',
    EM_PROBABILITY           NUMBER(5,2)   NOT NULL COMMENT 'Modeled conversion % via email.',
    CC_PROBABILITY           NUMBER(5,2)   NOT NULL COMMENT 'Modeled conversion % via a call.',
    START_DATE               DATE          NOT NULL COMMENT 'Scoring run month (first of month).',
    GENERATED_AT             TIMESTAMP_NTZ NOT NULL COMMENT 'Run month as a timestamp, so re-runs in a month are byte-identical.',
    CONSTRAINT pk_offer_eligibility PRIMARY KEY (ORG_ID, ACCOUNT_ID, ACTION_CODE)
)
COMMENT = 'Synthetic next-best-offer scores (treasury + lending) for BUSINESS accounts. See Snowflake_Offer_Eligibility/README.md.';

-- Same readers as the sibling vendor tables (DATA_ANALYST backs the DC connector).
GRANT SELECT ON TABLE DATA_JEDAIS.FINS__PUBLIC.OFFER_ELIGIBILITY TO ROLE DATA_ANALYST;
GRANT SELECT ON TABLE DATA_JEDAIS.FINS__PUBLIC.OFFER_ELIGIBILITY TO ROLE MCP_EXPLORE_ROLE;
