-- =============================================================================
-- 2026-10-23: add the retrained personal model's new top contributors to the
-- inference input table. Types match PERSONAL_PRODUCT_RECOMMENDATION_TRAINING_SET.
-- Additive only (existing 13 columns kept). Run as ACCOUNTADMIN, BEFORE
-- redeploying the SP that writes these columns.
-- =============================================================================
ALTER TABLE DATA_JEDAIS.FINS__PUBLIC.PERSONAL_PRODUCT_RECOMMENDATION_SUBSET ADD COLUMN
    HAS_MORTGAGE                   NUMBER(38,0),
    HAS_AUTO_LOAN                  NUMBER(38,0),
    HAS_CREDIT_CARD                NUMBER(38,0),
    HAS_SAVINGS                    NUMBER(38,0),
    GEOGRAPHIC_REGION              VARCHAR,
    AVG_TRANSACTION_AMOUNT         NUMBER(38,0),
    MONTHS_SINCE_LAST_PRODUCT      NUMBER(38,0),
    RECENT_LIFE_EVENT              VARCHAR,
    DIGITAL_BANKING_LOGINS_MONTHLY NUMBER(38,0),
    CUSTOMER_SATISFACTION_SCORE    NUMBER(38,1),
    MONTHLY_TRANSACTION_COUNT      NUMBER(38,0),
    YEARS_AS_CUSTOMER              NUMBER(38,0);
