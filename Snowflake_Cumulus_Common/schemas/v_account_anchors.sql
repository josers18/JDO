-- =============================================================================
-- DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS
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
--
-- v1.3 (dedup): ssot__Account__dlm in the share carries more than one row for
-- some ssot__Id__c values (the Account DSO plus a PartyRelationshipGroup DSO
-- mapped into the same DMO). A QUALIFY keeps one row per Id so the view stays
-- one row per account.
--
-- v1.4 (deterministic dedup, 2026-11-03): v1.3 ordered the QUALIFY by the
-- partition key itself, so Snowflake could return a different duplicate on
-- every query. 001am00000qvjs6AAA flipped between EMPLOYEE_COUNT 14800 (Account
-- DSO) and NULL (PartyRelationshipGroup DSO), which wrote a 1-10 band into
-- ZoomInfo 2026-11 and a second 2026-10 row. The ORDER BY now prefers, in
-- order: the row with the most populated anchor fields, the Account DSO, the
-- newest ssot__LastModifiedDate__c, then a row hash as a total-order tie-break.
-- Audit 2026-11-03: 25 duplicated Ids, all in MASTER_ACCOUNTS; only
-- 001am00000qvjs6AAA differs on any column this view reads.
-- =============================================================================

CREATE OR REPLACE VIEW DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS COPY GRANTS AS
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

FROM DATA_JEDAIS.FINS__PUBLIC.MASTER_ACCOUNTS ma
INNER JOIN (
    SELECT s.*, HASH(s.*) AS "_row_hash"   -- HASH(*) isn't allowed in a window ORDER BY
    FROM FINSDC3_DATASHARE."schema_Jedi_Snowflake"."ssot__Account__dlm" s
    QUALIFY ROW_NUMBER() OVER (
        PARTITION BY "ssot__Id__c"
        ORDER BY
            -- 1. most populated anchor fields (the columns this view reads)
            ( IFF("FinServ_ClientCategory_c__c"   IS NULL, 0, 1)
            + IFF("PersonBirthdate__c"            IS NULL, 0, 1)
            + IFF("FinServ_AnnualIncome_pc__c"    IS NULL, 0, 1)
            + IFF("FinServ_CreditScore_c__c"      IS NULL, 0, 1)
            + IFF("ssot__PrimaryIndustry__c"      IS NULL, 0, 1)
            + IFF("ssot__AnnualRevenueAmount__c"  IS NULL, 0, 1)
            + IFF("ssot__EmployeeCount__c"        IS NULL, 0, 1)
            + IFF(COALESCE("PersonMailingPostalCode__c", "BillingPostalCode__c") IS NULL, 0, 1)
            + IFF(COALESCE("PersonMailingState__c",      "BillingState__c")      IS NULL, 0, 1)
            + IFF(COALESCE("PersonMailingCountry__c",    "BillingCountry__c")    IS NULL, 0, 1)
            + IFF("External_ID_c__c"              IS NULL, 0, 1) ) DESC,
            -- 2. the Account data source object over PartyRelationshipGroup etc.
            IFF("ssot__DataSourceObjectId__c" = 'Account', 0, 1),
            -- 3. most recently modified
            "ssot__LastModifiedDate__c" DESC NULLS LAST,
            -- 4. total-order tie-break so every query picks the same row
            "_row_hash"
    ) = 1
) a ON a."ssot__Id__c" = ma.ACCOUNT_ID
WHERE ma.SNAPSHOT_DATE = (SELECT MAX(SNAPSHOT_DATE) FROM DATA_JEDAIS.FINS__PUBLIC.MASTER_ACCOUNTS);

COMMENT ON VIEW DATA_JEDAIS.FINS__PUBLIC.V_ACCOUNT_ANCHORS IS
'Shared anchor view for the 16 Cumulus dataset generators. One row per active account from MASTER_ACCOUNTS, joined to the inbound FINSDC3_DATASHARE share so anchor fields stay live without a sync task. v1.4 (deterministic dedup): QUALIFY prefers the most-populated share row, then the Account DSO, then newest LastModifiedDate, then a row hash. v1.3 (dedup): added QUALIFY to deduplicate share-side duplicates in ssot__Account__dlm. v1.2 (multi-org-additive): exposes ORG_ID column for downstream stamping; no filter yet. v1.1: address fields denormalized off Account; CPA DMO not in share. See Snowflake_Cumulus_Common/docs/ROLLOUT.md.';
