-- =============================================================================
-- FINS.PUBLIC.V_ACCOUNT_ANCHORS
-- Shared anchor view — joins MASTER_ACCOUNTS to the inbound DC datashare
-- so all 13 Cumulus generators read live anchor fields without a sync task.
-- =============================================================================
-- Source: spec at docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md §3 (v1.1)
--
-- Pinning: WHERE SNAPSHOT_DATE = MAX(...) keeps the view to today's roster
-- so generators see today's account list, not a historical Cartesian product.
--
-- INNER JOIN: an account in the view *means* anchors are real. Accounts in
-- MASTER_ACCOUNTS but not yet in the share are invisible to all generators
-- by design (refresh lag handling).
--
-- Address fields: v1.1 sources POSTAL_CODE / STATE_CODE / COUNTRY_CODE via
-- COALESCE(PersonMailing*, Billing*) directly off ssot__Account__dlm —
-- ssot__ContactPointAddress__dlm is not in the FINSDC3_DATASHARE share.
-- If the address DMO is added later, swap COALESCE → LEFT JOIN; column
-- names unchanged so consumers don't break.
--
-- v1.2 (multi-org): exposes ma.ORG_ID as the first column. Backward-compat
-- additive — no filter on ORG_ID yet, so existing JDO-only consumers see
-- the same rowset. Per-org filtering will activate when the role-tag
-- predicate is added (Phase A4 in docs/ROLLOUT.md). Dataset SP MERGE source
-- SELECTs source ORG_ID from this column to stamp dataset rows.
-- =============================================================================

CREATE OR REPLACE VIEW FINS.PUBLIC.V_ACCOUNT_ANCHORS AS
SELECT
    ma.ORG_ID,
    ma.ACCOUNT_ID,
    ma.ACCOUNT_NAME,
    ma.SNAPSHOT_DATE,

    -- Type discriminators
    a."FinServ_ClientCategory_c__c"             AS CLIENT_CATEGORY,
    CASE WHEN a."PersonBirthdate__c" IS NOT NULL
         THEN 'PERSON' ELSE 'BUSINESS' END      AS ACCOUNT_TYPE_FLAG,

    -- Person anchors
    a."PersonBirthdate__c"                      AS BIRTHDATE,
    a."FinServ_AnnualIncome_pc__c"              AS ANNUAL_INCOME,
    a."FinServ_CreditScore_c__c"                AS CREDIT_SCORE,

    -- Business anchors
    a."ssot__PrimaryIndustry__c"                AS INDUSTRY,
    a."ssot__AnnualRevenueAmount__c"            AS ANNUAL_REVENUE,
    a."ssot__EmployeeCount__c"                  AS EMPLOYEE_COUNT,

    -- Geo anchor — denormalized off Account
    COALESCE(a."PersonMailingPostalCode__c", a."BillingPostalCode__c")  AS POSTAL_CODE,
    COALESCE(a."PersonMailingState__c",      a."BillingState__c")       AS STATE_CODE,
    COALESCE(a."PersonMailingCountry__c",    a."BillingCountry__c")     AS COUNTRY_CODE,

    -- Namespace flag
    a."External_ID_c__c"                        AS EXTERNAL_ID

FROM FINS.PUBLIC.MASTER_ACCOUNTS ma
INNER JOIN FINSDC3_DATASHARE."schema_Jedi_Snowflake"."ssot__Account__dlm" a
        ON a."ssot__Id__c" = ma.ACCOUNT_ID
WHERE ma.SNAPSHOT_DATE = (SELECT MAX(SNAPSHOT_DATE) FROM FINS.PUBLIC.MASTER_ACCOUNTS);

COMMENT ON VIEW FINS.PUBLIC.V_ACCOUNT_ANCHORS IS
'Shared anchor view for the 13 Cumulus dataset generators. One row per active account from MASTER_ACCOUNTS, joined to the inbound FINSDC3_DATASHARE share so anchor fields stay live without a sync task. v1.2 (multi-org-additive): exposes ORG_ID column for downstream stamping; no filter yet. v1.1: address fields denormalized off Account; CPA DMO not in share. See Snowflake_Cumulus_Common/docs/ROLLOUT.md.';
