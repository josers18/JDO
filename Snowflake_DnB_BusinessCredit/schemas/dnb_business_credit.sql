-- =============================================================================
-- DATA_JEDAIS.FINS__PUBLIC.DNB_BUSINESS_CREDIT
-- DnB-style synthetic business credit ratings for Cumulus BUSINESS accounts.
-- =============================================================================
-- Cadence:    MONTHLY via TASK_MONTHLY_DNB_BUSINESS_CREDIT
-- Audience:   ACCOUNT_TYPE_FLAG = 'BUSINESS'  (~12K rows/month — over-count
--             vs CRM ~5K is expected per spec §3 v1.2 finding #3)
-- Generator:  SP_GENERATE_DNB_BUSINESS_CREDIT (Snowpark Python via SP_RETRY_WRAPPER)
-- Egress:     DC Snowflake federation → DLO/DMO CumulusDnBBusinessCredit__dlm
-- Plan:       docs/superpowers/plans/2026-05-28-cumulus-plan-3-dnb-business-credit.md
-- Rowspec:    docs/superpowers/plans/attachments/cumulus-plan-3-dnb-business-credit-rowspec.md
-- =============================================================================

CREATE OR REPLACE TABLE DATA_JEDAIS.FINS__PUBLIC.DNB_BUSINESS_CREDIT (
    ORG_ID                       VARCHAR(18)       NOT NULL DEFAULT 'JDO'  COMMENT 'Logical-tenant identifier (DnB-style short code, e.g. JDO, ACME). PK component. Sourced from V_ACCOUNT_ANCHORS.ORG_ID per umbrella ROLLOUT.md.',
    ACCOUNT_ID                   VARCHAR(16777216) NOT NULL  COMMENT 'Salesforce Account ID (ssot__Id__c). FK to V_ACCOUNT_ANCHORS.',
    PROFILE_MONTH                DATE              NOT NULL  COMMENT 'First-of-month for the run; PK component for monthly idempotency.',
    DUNS_NUMBER                  VARCHAR(9)        NOT NULL  COMMENT 'Deterministic 9-digit D-U-N-S derived from HASH(account_id, "duns_id", year). Stable across months for the same account.',
    DNB_RATING                   VARCHAR(4)        NOT NULL  COMMENT '<tier><composite> e.g. 5A1, BA3. 11 tiers x 4 composites = 44 valid values.',
    FINANCIAL_STRENGTH_TIER      VARCHAR(2)        NOT NULL  COMMENT 'One of 11 tiers: 5A ($50M+ net worth) -> DD (<$5K). Biased by ANNUAL_REVENUE.',
    COMPOSITE_RISK_SCORE         NUMBER(2,0)       NOT NULL  COMMENT '1=lowest risk, 4=highest. The <composite> digit of DNB_RATING.',
    PAYDEX_SCORE                 NUMBER(3,0)       NOT NULL  COMMENT '0-100. 80=pays as agreed; 100=30 days early; 20=120+ days late. Industry-biased.',
    AVERAGE_DAYS_BEYOND_TERMS    NUMBER(4,0)       NOT NULL  COMMENT '0-180. Inverse correlate of PAYDEX (~(80 - PAYDEX) * 1.5 plus jitter).',
    FAILURE_RISK_SCORE           NUMBER(3,0)       NOT NULL  COMMENT '1-100. 1=very high probability of business failure; 100=very low. Industry + revenue biased.',
    DELINQUENCY_PREDICTOR_SCORE  NUMBER(3,0)       NOT NULL  COMMENT '1-100. 1=very high delinquency probability; 100=very low. Correlated with PAYDEX.',
    SUPPLIER_RISK_LEVEL          VARCHAR(10)       NOT NULL  COMMENT 'Low / Moderate / High / Severe. Derived from FAILURE_RISK_SCORE bands.',
    CORPORATE_FAMILY_SIZE        NUMBER(5,0)       NOT NULL  COMMENT 'Total entities in the corporate family (incl. self). 1=standalone, 2-5 mid-market, 50+ large enterprise.',
    ULTIMATE_PARENT_DUNS         VARCHAR(9)                  COMMENT 'NULL when CORPORATE_FAMILY_SIZE=1 (standalone). Otherwise a deterministic 9-digit DUNS for the parent.',
    VERIFICATION_STATUS          VARCHAR(20)       NOT NULL  COMMENT 'Verified / Probable / Unverified. Most rows Verified; smaller firms more often Probable.',
    GENERATED_AT                 TIMESTAMP_NTZ(9)  NOT NULL  COMMENT 'Month-bucketed for byte-identical mid-month re-runs (audit time -> TASK_EXECUTION_LOG).',
    CONSTRAINT pk_dnb_business_credit PRIMARY KEY (ORG_ID, ACCOUNT_ID, PROFILE_MONTH)
)
COMMENT = 'DnB-style synthetic business credit ratings (Dun and Bradstreet shape). Monthly generation. One row per BUSINESS account per month. See Snowflake_DnB_BusinessCredit/README.md and the umbrella spec.';
