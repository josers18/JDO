-- =============================================================================
-- 2026-10-23: add the retrained business model's new top contributors to the
-- inference input table. Types match BUSINESS_PRODUCT_RECOMMENDATION_SET.
-- Additive only (existing 13 columns kept). Run as ACCOUNTADMIN, BEFORE
-- redeploying the SP that writes these columns.
-- =============================================================================
ALTER TABLE DATA_JEDAIS.FINS__PUBLIC.BUSINESS_PRODUCT_RECOMMENDATION_SUBSET ADD COLUMN
    HAS_BUSINESS_SAVINGS          NUMBER(38,0),
    REVENUE_GROWTH_YOY_PCT        NUMBER(38,1),
    DEBT_SERVICE_COVERAGE_RATIO   NUMBER(38,2),
    PAYROLL_BURDEN_PCT            NUMBER(38,1),
    BUSINESS_STRUCTURE            VARCHAR,
    AVG_RECEIVABLES_DAYS          NUMBER(38,0),
    HAS_BUSINESS_CREDIT_CARD      NUMBER(38,0),
    ACH_TRANSACTIONS_PER_EMPLOYEE NUMBER(38,1),
    HAS_LINE_OF_CREDIT            NUMBER(38,0),
    MONTHLY_WIRE_TRANSFER_COUNT   NUMBER(38,0),
    HAS_MERCHANT_SERVICES         NUMBER(38,0);
