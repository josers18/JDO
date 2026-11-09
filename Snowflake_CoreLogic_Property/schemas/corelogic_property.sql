-- =============================================================================
-- DATA_JEDAIS.FINS__PUBLIC.CORELOGIC_PROPERTY
-- CoreLogic-style synthetic property records for Cumulus's customer footprint.
-- =============================================================================
-- Cadence:    QUARTERLY via TASK_QUARTERLY_CORELOGIC_PROPERTY
--             (Cron: 0 8 1 1,4,7,10 * UTC — 1st of Jan/Apr/Jul/Oct at 08:00 UTC)
-- Audience:   Account-scoped (PERSON anchors) — distinct accounts from
--             V_ACCOUNT_ANCHORS with valid POSTAL_CODE (~25,424 rows/quarter).
-- Generator:  SP_GENERATE_CORELOGIC_PROPERTY (Snowpark Python via SP_RETRY_WRAPPER)
-- Egress:     DC Snowflake federation -> DLO/DMO BT_Corelogic_Property__dlm
-- Plan:       docs/superpowers/plans/2026-05-28-cumulus-plan-5-corelogic-property.md
-- Rowspec:    docs/superpowers/plans/attachments/cumulus-plan-5-corelogic-property-rowspec.md
--
-- v1.x multi-org-additive note (2026-05-29):
--   ORG_ID added as first column with DEFAULT 'JDO' to support backward-
--   compatible multi-org rollout (per Snowflake_Cumulus_Common/docs/ROLLOUT.md).
--   PK extended to (ORG_ID, ACCOUNT_ID, PROFILE_QUARTER). Existing JDO rows
--   keep behavior identical via DEFAULT; future orgs append rather than mutate.
-- Synced 2026-11-09 to the live table (GET_DDL). Declared PK = RECORD_ID
-- (the DMO key, record_id__c); the natural key (ACCOUNT_ID, PROFILE_QUARTER) is a
-- UNIQUE without ORG_ID. Snowflake enforces neither: the SP's MERGE ON is
-- what keeps rows unique. ORG_ID is nullable with DEFAULT 'JDO'. See
-- Snowflake_Cumulus_Common/docs/ROLLOUT.md A6.
-- =============================================================================

CREATE OR REPLACE TABLE DATA_JEDAIS.FINS__PUBLIC.CORELOGIC_PROPERTY (
    ACCOUNT_ID                   VARCHAR(16777216) NOT NULL COMMENT 'Account anchor ID. FK to ssot__Account__dlm. PK component.',
    PROFILE_QUARTER              DATE NOT NULL COMMENT 'First-of-quarter for the run (Jan/Apr/Jul/Oct 1st). Quarter-bucketed for determinism. PK component.',
    IS_OWNER                     BOOLEAN NOT NULL COMMENT 'true = property owner; false = renter. Biased by life stage + income. When false, property fields (below) are NULL.',
    PRIMARY_PROPERTY_TYPE        VARCHAR(30) COMMENT 'One of: Single Family, Condo, Townhouse, Multi-Family, Manufactured Home, Vacant Land. NULL when IS_OWNER=false.',
    ESTIMATED_PROPERTY_VALUE     NUMBER(12,0) COMMENT 'Property value $50K-$10M, biased by ZIP median income. NULL when IS_OWNER=false.',
    OUTSTANDING_MORTGAGE_BALANCE NUMBER(12,0) COMMENT 'Mortgage balance $0-$8M. ~30% of owners paid off (balance=0). NULL when IS_OWNER=false.',
    LOAN_TO_VALUE_PCT            NUMBER(5,2) COMMENT 'LTV 0-95% (mortgage/value*100). NULL when IS_OWNER=false OR mortgage=0.',
    EQUITY_USD                   NUMBER(12,0) COMMENT 'Equity (value - mortgage), never negative. NULL when IS_OWNER=false.',
    MORTGAGE_RATE_PCT            NUMBER(5,3) COMMENT 'Rate 2.500-8.500%, bimodal (pre-2022 cluster 2.75-4.5%; post-2022 cluster 6.0-8.5%). NULL when IS_OWNER=false OR mortgage=0.',
    LIEN_COUNT                   NUMBER(2,0) NOT NULL COMMENT 'Active liens 0-5. Most owners 0-1; non-owners 0. Always populated.',
    FLOOD_ZONE_CODE              VARCHAR(8) NOT NULL COMMENT 'FEMA zones: X (minimal), B, C, AE, A, VE, V. Biased by state. Always populated.',
    WILDFIRE_RISK_SCORE          NUMBER(3,0) NOT NULL COMMENT 'Risk score 0-100, biased by state (CA/AZ/CO/OR/MT high; NY/MA/IL low). Always populated.',
    LAST_TRANSFER_YEAR           NUMBER(4,0) COMMENT 'Year of last deed transfer (1980-2026). Stable within calendar year (year-stable seed). NULL when IS_OWNER=false.',
    HELOC_OPPORTUNITY_SCORE      NUMBER(3,0) COMMENT 'HELOC score 0-100, biased by EQUITY_USD + LIEN_COUNT + LTV. NULL when IS_OWNER=false.',
    GENERATED_AT                 TIMESTAMP_NTZ(9) NOT NULL COMMENT 'Quarter-bucketed for byte-identical mid-quarter re-runs (audit time -> TASK_EXECUTION_LOG).',
    ORG_ID                       VARCHAR(18) DEFAULT 'JDO',
    RECORD_ID                    VARCHAR(36) NOT NULL DEFAULT UUID_STRING(),
    CONSTRAINT uq_corelogic_property UNIQUE (ACCOUNT_ID, PROFILE_QUARTER),
    CONSTRAINT pk_corelogic_property PRIMARY KEY (RECORD_ID)
)
COMMENT = 'CoreLogic-style synthetic property records per PERSON account. Quarterly generation. One row per PERSON account per quarter (~25,424 rows). Account-scoped with FK to ssot__Account__dlm. 9 NULLable property fields when IS_OWNER=false. See Snowflake_CoreLogic_Property/README.md and the umbrella spec.';
