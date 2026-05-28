-- =============================================================================
-- FINS.PUBLIC.CLARITAS_DEMOGRAPHICS
-- Claritas-style synthetic demographics for Cumulus PERSON accounts.
-- =============================================================================
-- Cadence:    MONTHLY via TASK_MONTHLY_CLARITAS_DEMOGRAPHICS
-- Audience:   ACCOUNT_TYPE_FLAG = 'PERSON'  (~25K rows/month)
-- Generator:  SP_GENERATE_CLARITAS_DEMOGRAPHICS
-- Egress:     DC Snowflake federation → DLO/DMO CumulusClaritasDemographics__dlm
-- Plan:       docs/superpowers/plans/2026-05-28-cumulus-plan-1-claritas-demographics.md
-- Rowspec:    docs/superpowers/plans/attachments/cumulus-plan-1-claritas-demographics-rowspec.md
-- =============================================================================

CREATE OR REPLACE TABLE FINS.PUBLIC.CLARITAS_DEMOGRAPHICS (
    ACCOUNT_ID                    VARCHAR(16777216) NOT NULL  COMMENT 'Salesforce Account ID (ssot__Id__c). FK to V_ACCOUNT_ANCHORS.',
    PROFILE_MONTH                 DATE              NOT NULL  COMMENT 'First-of-month for the run; PK component for monthly idempotency.',
    PRIZM_SEGMENT_CODE            VARCHAR(8)        NOT NULL  COMMENT 'One of 12 segment codes: UC/MB/YA/MS/PP/BB/CR/CD/SS/HR/FS/MT.',
    PRIZM_SEGMENT_NAME            VARCHAR(120)      NOT NULL  COMMENT 'Display name e.g. "Upper Crust".',
    PRIZM_LIFESTYLE_GROUP         VARCHAR(40)       NOT NULL  COMMENT 'Parent lifestyle group e.g. "Affluent Empty Nests".',
    LIFE_STAGE                    VARCHAR(40)       NOT NULL  COMMENT 'Gen Z / Young Singles / Young Couples / Young Families / Established Families / Empty Nesters / Retirees.',
    HOUSEHOLD_COMPOSITION         VARCHAR(40)       NOT NULL  COMMENT 'Single / Couple / Family with Children / Multi-Generational / Roommates.',
    ESTIMATED_NET_WORTH_BAND      VARCHAR(20)       NOT NULL  COMMENT '<$50K / $50K-$250K / $250K-$1M / $1M-$5M / $5M+.',
    WEALTH_PROPENSITY_SCORE       NUMBER(5,2)       NOT NULL  COMMENT '0.00-100.00.',
    INVESTMENT_PROPENSITY_SCORE   NUMBER(5,2)       NOT NULL  COMMENT '0.00-100.00.',
    MORTGAGE_PROPENSITY_SCORE     NUMBER(5,2)       NOT NULL  COMMENT '0.00-100.00.',
    URBANICITY                    VARCHAR(20)       NOT NULL  COMMENT 'Urban / Suburban / Town / Rural (heuristic from POSTAL_CODE leading digit).',
    FINANCIAL_STRESS_INDICATOR    VARCHAR(10)       NOT NULL  COMMENT 'Low / Moderate / High.',
    GENERATED_AT                  TIMESTAMP_NTZ(9)  NOT NULL  COMMENT 'Run timestamp (UTC).',
    CONSTRAINT pk_claritas_demographics PRIMARY KEY (ACCOUNT_ID, PROFILE_MONTH)
)
COMMENT = 'Claritas-style synthetic demographics. Monthly generation. One row per PERSON account per month. See Snowflake_Claritas_Demographics/README.md and the umbrella spec.';
