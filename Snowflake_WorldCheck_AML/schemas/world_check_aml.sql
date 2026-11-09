-- =============================================================================
-- DATA_JEDAIS.FINS__PUBLIC.WORLD_CHECK_AML  (v1.x — multi-org-additive)
-- LSEG World-Check / Dow Jones Risk and Compliance / ComplyAdvantage-style
-- synthetic AML / sanctions / PEP screening per Cumulus customer.
-- =============================================================================
-- Multi-org migration (additive, backward-compatible):
--   ORG_ID is the leading PK column with NOT NULL DEFAULT 'JDO'. Existing
--   single-org callers continue to work unchanged; new orgs stamp their own
--   ORG_ID via the per-org loader / V_ACCOUNT_ANCHORS filter. See
--   Snowflake_Cumulus_Common/docs/ROLLOUT.md Phase A.
-- =============================================================================
-- Cadence:    DAILY via TASK_DAILY_WORLD_CHECK_AML
--             (Cron: 0 6 * * * UTC — every day at 06:00 UTC, after the
--             LSEG overnight feed publishes at ~02:00 GMT)
-- Audience:   All-accounts (no WHERE predicate) — distinct accounts from
--             V_ACCOUNT_ANCHORS, ~36,813 distinct anchors. 1:1 — each
--             anchor emits exactly one row per day → ~36,813 rows/day.
--             Re-runs same calendar day MERGE-replace in place; no
--             daily history retained.
-- Generator:  SP_GENERATE_WORLD_CHECK_AML (Snowpark Python via SP_RETRY_WRAPPER)
-- Egress:     DC Snowflake federation -> DLO/DMO BT_WorldCheck_AML__dlm
-- Plan:       docs/superpowers/plans/2026-05-28-cumulus-plan-7-worldcheck-aml.md
-- Rowspec:    docs/superpowers/plans/attachments/cumulus-plan-7-worldcheck-aml-rowspec.md
-- Synced 2026-11-09 to the live table (GET_DDL). Declared PK = RECORD_ID
-- (the DMO key, record_id__c); the natural key (ACCOUNT_ID, PROFILE_DATE) is a
-- UNIQUE without ORG_ID. Snowflake enforces neither: the SP's MERGE ON is
-- what keeps rows unique. ORG_ID is nullable with DEFAULT 'JDO'. See
-- Snowflake_Cumulus_Common/docs/ROLLOUT.md A6.
-- =============================================================================

CREATE OR REPLACE TABLE DATA_JEDAIS.FINS__PUBLIC.WORLD_CHECK_AML (
    ACCOUNT_ID                   VARCHAR(16777216) NOT NULL COMMENT 'Anchor.ACCOUNT_ID — the Cumulus customer being screened. FK to ssot__Account__dlm. PK component.',
    PROFILE_DATE                 DATE NOT NULL COMMENT 'Screening run date (UTC). Day-bucketed for determinism — mid-day re-runs are byte-identical. PK component.',
    OVERALL_RISK_RATING          VARCHAR(10) NOT NULL COMMENT 'Rolled-up flag: Low (~92%), Medium (~6%), High (~1.7%), Severe (~0.3%). Derived from component flags + jurisdiction tier.',
    SANCTIONS_HIT                BOOLEAN NOT NULL COMMENT 'true if matched against OFAC/EU/UK/UN sanctions list. ~0.5% of accounts. Drawn independently via daily seed.',
    PEP_HIT                      BOOLEAN NOT NULL COMMENT 'true if PEP / Reportable-Person match. ~1.2% of accounts. Drawn independently via daily seed.',
    ADVERSE_MEDIA_HIT            BOOLEAN NOT NULL COMMENT 'true if adverse-media match. ~3.0% of accounts. Drawn independently via daily seed.',
    ADVERSE_MEDIA_CATEGORIES     VARCHAR(200) COMMENT 'Pipe-delimited list of 1-3 categories from a 10-category pool (e.g. "Financial Crime|Bribery"). NULL when ADVERSE_MEDIA_HIT=false.',
    RISK_JURISDICTION_CODE       VARCHAR(2) NOT NULL COMMENT 'ISO-3166-1 alpha-2 of the highest-risk jurisdiction tied to this account. Synthesized — year-stable per account via salt "worldcheck_jurisdiction" (NOT read from dirty anchor.COUNTRY_CODE).',
    RISK_JURISDICTION_TIER       VARCHAR(10) NOT NULL COMMENT 'Standard (~98.5%), Enhanced (~1.0%), Prohibited (~0.5%). Derived from RISK_JURISDICTION_CODE.',
    LAST_SCREENED_AT             TIMESTAMP_NTZ(9) NOT NULL COMMENT 'Day-bucketed (= PROFILE_DATE 00:00:00) for byte-identical mid-day re-runs.',
    CHANGE_SINCE_LAST_RUN        VARCHAR(20) NOT NULL COMMENT 'New, Unchanged, Risk Increased, Risk Decreased, Cleared. ~99% Unchanged on day-2+. Computed by re-deriving yesterday''s seed and diffing the rating.',
    CASE_REFERENCE               VARCHAR(32) COMMENT 'Vendor case-management ID (format WCH-YYYY-NNNNNN). Year-stable via salt "worldcheck_case". NULL when OVERALL_RISK_RATING NOT IN (High, Severe).',
    GENERATED_AT                 TIMESTAMP_NTZ(9) NOT NULL COMMENT 'Day-bucketed for byte-identical mid-day re-runs (audit time -> TASK_EXECUTION_LOG).',
    ORG_ID                       VARCHAR(18) DEFAULT 'JDO',
    RECORD_ID                    VARCHAR(36) NOT NULL DEFAULT UUID_STRING(),
    CONSTRAINT uq_world_check_aml UNIQUE (ACCOUNT_ID, PROFILE_DATE),
    CONSTRAINT pk_world_check_aml PRIMARY KEY (RECORD_ID)
)
;
