-- =============================================================================
-- FINS.PUBLIC.CSAT_NPS_DATA
-- Customer Satisfaction (CSAT) and Net Promoter Score (NPS) tracking table
-- =============================================================================
-- Contains monthly CSAT and NPS scores per account. Populated by:
--   1. One-time historical backfill (Jan 2023 - Mar 2026)
--   2. Monthly auto-generation via SP_GENERATE_MONTHLY_CSAT()
-- =============================================================================

CREATE OR REPLACE TABLE FINS.PUBLIC.CSAT_NPS_DATA (
    ROWID              NUMBER(38,0)         COMMENT 'Monotonically increasing row identifier',
    ACCOUNTID          VARCHAR(16777216)    COMMENT 'Salesforce Account ID from Data Cloud',
    CONTACTID          VARCHAR(16777216)    COMMENT 'Reserved for future use (currently NULL)',
    CSAT_SCORE         NUMBER(38,0)         COMMENT 'Customer satisfaction score (20-100)',
    CSAT_DESCRIPTION   VARCHAR(16777216)    COMMENT 'CSAT band: Poor / Fair / Good / Very Good / Excellent',
    NPS_SCORE          NUMBER(38,0)         COMMENT 'Net Promoter Score (0-10)',
    NPS_DESCRIPTION    VARCHAR(16777216)    COMMENT 'NPS category: Detractor / Passives / Promoter',
    SCORE_DATE         DATE                 COMMENT 'First day of the month the score represents'
)
COMMENT = 'Monthly CSAT and NPS scores per Salesforce account. Source: synthetic generation with correlated scoring model.';
