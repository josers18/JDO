-- =============================================================================
-- 2026-10-23: the retrained personal model (prediction action
-- Predicted_RECOMMENDED_PRODUCT_Personal_CM_12l_32q497b2bbf) requires 27
-- inputs; these six were outside its top-20 contributors and missing from the
-- inference table. Types match PERSONAL_PRODUCT_RECOMMENDATION_TRAINING_SET.
-- Additive only. Run as ACCOUNTADMIN, BEFORE redeploying the SP.
-- =============================================================================
ALTER TABLE DATA_JEDAIS.FINS__PUBLIC.PERSONAL_PRODUCT_RECOMMENDATION_SUBSET ADD COLUMN
    BRANCH_VISITS_MONTHLY  NUMBER(38,0),
    HAS_INVESTMENT_ACCOUNT NUMBER(38,0),
    YEARS_AT_CURRENT_JOB   NUMBER(38,0),
    NUMBER_OF_DEPENDENTS   NUMBER(38,0),
    OVERDRAFT_COUNT_12M    NUMBER(38,0),
    MARITAL_STATUS         VARCHAR;
