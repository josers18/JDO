-- =============================================================================
-- DATA_JEDAIS.FINS__PUBLIC.MSCI_ESG_SCORES
-- MSCI-style synthetic ESG ratings for Cumulus BUSINESS accounts.
-- =============================================================================
-- Cadence:    MONTHLY via TASK_MONTHLY_MSCI_ESG_SCORES
-- Audience:   ACCOUNT_TYPE_FLAG = 'BUSINESS'  (~12K rows/month — over-count
--             vs CRM ~5K is expected per spec §3 v1.2 finding #3)
-- Generator:  SP_GENERATE_MSCI_ESG_SCORES (Snowpark Python via SP_RETRY_WRAPPER)
-- Egress:     DC Snowflake federation → DLO/DMO CumulusMSCIESG__dlm
-- Plan:       docs/superpowers/plans/2026-05-28-cumulus-plan-2-msci-esg.md
-- Rowspec:    docs/superpowers/plans/attachments/cumulus-plan-2-msci-esg-rowspec.md
--
-- v1.x multi-org-additive: ORG_ID prepended to PK so two orgs can carry the
-- same ACCOUNT_ID. DEFAULT 'JDO' kept in place for backward-compatible
-- single-org loads; per-org SPs stamp ORG_ID explicitly via the audience row
-- supplied by V_ACCOUNT_ANCHORS. See Snowflake_Cumulus_Common/docs/ROLLOUT.md.
-- =============================================================================

CREATE OR REPLACE TABLE DATA_JEDAIS.FINS__PUBLIC.MSCI_ESG_SCORES (
    ORG_ID                                VARCHAR(18)       NOT NULL DEFAULT 'JDO'  COMMENT 'Tenant short identifier (JDO / ACME / WFB). Backward-compatible default; per-org SPs stamp explicitly.',
    ACCOUNT_ID                            VARCHAR(16777216) NOT NULL  COMMENT 'Salesforce Account ID (ssot__Id__c). FK to V_ACCOUNT_ANCHORS.',
    PROFILE_MONTH                         DATE              NOT NULL  COMMENT 'First-of-month for the run; PK component for monthly idempotency.',
    MSCI_ESG_RATING                       VARCHAR(8)        NOT NULL  COMMENT 'One of 7 ratings: AAA / AA / A / BBB / BB / B / CCC.',
    INDUSTRY_CLASSIFICATION               VARCHAR(20)       NOT NULL  COMMENT 'Industry-relative: Leader / Average / Laggard.',
    ESG_SCORE_OVERALL                     NUMBER(4,2)       NOT NULL  COMMENT '0.00-10.00 weighted average of pillars.',
    ENVIRONMENTAL_SCORE                   NUMBER(4,2)       NOT NULL  COMMENT '0.00-10.00, biased lower for Energy/Mining/Manufacturing.',
    SOCIAL_SCORE                          NUMBER(4,2)       NOT NULL  COMMENT '0.00-10.00, slight bias up with employee count.',
    GOVERNANCE_SCORE                      NUMBER(4,2)       NOT NULL  COMMENT '0.00-10.00, biased up with revenue band.',
    CARBON_INTENSITY_TONS_PER_M_REVENUE   NUMBER(8,2)       NOT NULL  COMMENT '0.00-2000.00; heavy industries high, services low.',
    CONTROVERSY_FLAG_COUNT                NUMBER(3,0)       NOT NULL  COMMENT '0-15 active controversy flags. Most firms 0-2; Laggards skew higher.',
    TOP_CONTROVERSY_CATEGORY              VARCHAR(40)                 COMMENT 'NULL when CONTROVERSY_FLAG_COUNT=0; else one of 7 categories.',
    MATERIALITY_TAGS                      VARCHAR(200)      NOT NULL  COMMENT 'Comma-separated 2-4 tags from a 12-tag pool, biased by industry.',
    LAST_RATING_CHANGE_DIRECTION          VARCHAR(10)       NOT NULL  COMMENT 'Upgrade / Downgrade / Unchanged (~85% Unchanged).',
    GENERATED_AT                          TIMESTAMP_NTZ(9)  NOT NULL  COMMENT 'Month-bucketed for byte-identical mid-month re-runs (audit time → TASK_EXECUTION_LOG).',
    CONSTRAINT pk_msci_esg_scores PRIMARY KEY (ORG_ID, ACCOUNT_ID, PROFILE_MONTH)
)
COMMENT = 'MSCI-style synthetic ESG ratings. Monthly generation. One row per BUSINESS account per month. v1.x multi-org-additive: ORG_ID is first PK column. See Snowflake_MSCI_ESG/README.md and the umbrella spec.';
