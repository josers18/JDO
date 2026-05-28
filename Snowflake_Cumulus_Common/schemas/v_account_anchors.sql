-- =============================================================================
-- FINS.PUBLIC.V_ACCOUNT_ANCHORS
-- Shared anchor view — joins MASTER_ACCOUNTS to the inbound DC datashare
-- so all 13 Cumulus generators read live anchor fields without a sync task.
-- =============================================================================
-- Source: spec at docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md §3
--
-- Pinning: WHERE SNAPSHOT_DATE = MAX(...) keeps the view to today's roster
-- so generators see today's account list, not a historical Cartesian product.
--
-- INNER JOIN: an account in the view *means* anchors are real. Accounts in
-- MASTER_ACCOUNTS but not yet in the share are invisible to all generators
-- by design (refresh lag handling).
--
-- LEFT JOIN address: a missing ZIP still lets a row through for non-geo
-- datasets. Geo-scoped datasets filter via WHERE POSTAL_CODE IS NOT NULL.
-- =============================================================================

CREATE OR REPLACE VIEW FINS.PUBLIC.V_ACCOUNT_ANCHORS AS
SELECT
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

    -- Geo anchor
    cpa."ssot__PostalCode__c"                   AS POSTAL_CODE,
    cpa."ssot__StateCode__c"                    AS STATE_CODE,
    cpa."ssot__CountryCode__c"                  AS COUNTRY_CODE,

    -- Namespace flag
    a."External_ID_c__c"                        AS EXTERNAL_ID

FROM FINS.PUBLIC.MASTER_ACCOUNTS ma
INNER JOIN FINSDC3_DATASHARE."schema_Jedi_Snowflake"."ssot__Account__dlm" a
        ON a."ssot__Id__c" = ma.ACCOUNT_ID
LEFT JOIN  FINSDC3_DATASHARE."schema_Jedi_Snowflake"."ssot__ContactPointAddress__dlm" cpa
        ON cpa."ssot__Id__c" = a."ssot__ContactPointAddressId__c"
WHERE ma.SNAPSHOT_DATE = (SELECT MAX(SNAPSHOT_DATE) FROM FINS.PUBLIC.MASTER_ACCOUNTS);

COMMENT ON VIEW FINS.PUBLIC.V_ACCOUNT_ANCHORS IS
'Shared anchor view for the 13 Cumulus dataset generators. One row per active account from MASTER_ACCOUNTS, joined to the inbound FINSDC3_DATASHARE share so anchor fields stay live without a sync task. See docs/superpowers/specs/2026-05-27-cumulus-snowflake-pipelines-design.md §3.';
