-- =============================================================================
-- 2026-10-23: the retrained business model (prediction action
-- Predicted_RECOMMENDED_PRODUCT_Business_CM_12l_32qa0be0859) requires 25
-- inputs; these three were missing from the inference table. Types match
-- BUSINESS_PRODUCT_RECOMMENDATION_SET. Additive only. Run as ACCOUNTADMIN,
-- BEFORE redeploying the SP.
-- =============================================================================
ALTER TABLE DATA_JEDAIS.FINS__PUBLIC.BUSINESS_PRODUCT_RECOMMENDATION_SUBSET ADD COLUMN
    DIGITAL_BANKING_USAGE VARCHAR,
    HAS_BUSINESS_LOAN     NUMBER(38,0),
    SEASONAL_BUSINESS     NUMBER(38,0);
