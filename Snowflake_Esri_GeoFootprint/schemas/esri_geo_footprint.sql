-- =============================================================================
-- DATA_JEDAIS.FINS__PUBLIC.ESRI_GEO_FOOTPRINT
-- Esri-style synthetic geographic enrichment per ZIP for Cumulus's footprint.
-- =============================================================================
-- Cadence:    MONTHLY via TASK_MONTHLY_ESRI_GEO_FOOTPRINT
-- Audience:   Branch-scoped (NOT account-scoped) — distinct US ZIPs from
--             V_ACCOUNT_ANCHORS (~13,328 rows/month across 23 states).
-- Generator:  SP_GENERATE_ESRI_GEO_FOOTPRINT (Snowpark Python via SP_RETRY_WRAPPER)
-- Egress:     DC Snowflake federation -> DLO/DMO CumulusEsriGeoFootprint__dlm
-- Plan:       docs/superpowers/plans/2026-05-28-cumulus-plan-4-esri-geo-footprint.md
-- Rowspec:    docs/superpowers/plans/attachments/cumulus-plan-4-esri-geo-footprint-rowspec.md
-- =============================================================================

CREATE OR REPLACE TABLE DATA_JEDAIS.FINS__PUBLIC.ESRI_GEO_FOOTPRINT (
    ORG_ID                         VARCHAR(18)       NOT NULL DEFAULT 'JDO' COMMENT 'Owning org code. Sourced from V_ACCOUNT_ANCHORS.ORG_ID via the audience GROUP BY. ORG_ID required because two orgs may have the same BRANCH_ZIP. PK component for cross-org isolation.',
    BRANCH_ZIP                     VARCHAR(10)       NOT NULL  COMMENT 'US ZIP this row covers. Derived from V_ACCOUNT_ANCHORS distinct POSTAL_CODE. PK component. NOT an FK to ssot__Account__dlm.',
    STATE_CODE                     VARCHAR(2)        NOT NULL  COMMENT 'US state code from V_ACCOUNT_ANCHORS.',
    COUNTRY_CODE                   VARCHAR(2)        NOT NULL  COMMENT 'Always US for our audience (V_ACCOUNT_ANCHORS POSTAL_CODE filter implicitly drops non-US).',
    PROFILE_MONTH                  DATE              NOT NULL  COMMENT 'First-of-month for the run; PK component for monthly idempotency.',
    TAPESTRY_SEGMENT_CODE          VARCHAR(8)        NOT NULL  COMMENT 'One of 12 codes from the Esri Tapestry-style pool (TC, EE, ND, BS, SF, MD, SH, RD, RC, HM, MS, RH).',
    TAPESTRY_SEGMENT_NAME          VARCHAR(60)       NOT NULL  COMMENT 'Display name for the Tapestry segment (e.g. "Top Tier", "Soccer Moms").',
    URBANICITY_TIER                VARCHAR(20)       NOT NULL  COMMENT 'Urban Core / Suburban / Small Town / Rural. Heuristic from ZIP first digit + STATE_CODE override.',
    MEDIAN_HOUSEHOLD_INCOME        NUMBER(8,0)       NOT NULL  COMMENT 'Median income for the ZIP, $20K-$350K. Biased by URBANICITY_TIER + state.',
    WEALTH_INDEX                   NUMBER(5,2)       NOT NULL  COMMENT '50.00-200.00; 100=US national average. Correlates with MEDIAN_HOUSEHOLD_INCOME.',
    FOOT_TRAFFIC_INDEX             NUMBER(5,2)       NOT NULL  COMMENT '0.00-300.00; 100=US national average pedestrian density. Urban Core skews high.',
    COMMERCIAL_DENSITY_PER_SQ_MI   NUMBER(8,2)       NOT NULL  COMMENT 'Businesses per square mile, 0-2000. Urban Core 500-2000, Rural 0-50.',
    DISTANCE_TO_NEAREST_BRANCH_MI  NUMBER(6,2)       NOT NULL  COMMENT '0.00-50.00. Urban Core 0.5-2 mi; Rural 8-50 mi.',
    MARKET_PENETRATION_PCT         NUMBER(5,2)       NOT NULL  COMMENT '0.00-100.00. Cumulus market share in this ZIP, biased by ANNUAL_REVENUE-weighted customer mass.',
    BRANCH_RECOMMENDATION          VARCHAR(20)       NOT NULL  COMMENT 'Expand / Maintain / Optimize / Consolidate. Decision tree on market penetration + foot traffic + branch distance.',
    GENERATED_AT                   TIMESTAMP_NTZ(9)  NOT NULL  COMMENT 'Month-bucketed for byte-identical mid-month re-runs (audit time -> TASK_EXECUTION_LOG).',
    CONSTRAINT pk_esri_geo_footprint PRIMARY KEY (ORG_ID, BRANCH_ZIP, PROFILE_MONTH)
)
COMMENT = 'Esri-style synthetic geographic enrichment per ZIP. Monthly generation. One row per (ORG_ID, distinct US ZIP) per month (~13,328 rows for JDO). Branch-scoped, NOT account-scoped — no FK to ssot__Account__dlm. ORG_ID required because two orgs may have the same BRANCH_ZIP. See Snowflake_Esri_GeoFootprint/README.md and the umbrella spec.';
