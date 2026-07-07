-- =============================================================================
-- DATA_JEDAIS.FINS__PUBLIC.ZOOMINFO_FIRMOGRAPHICS
-- ZoomInfo / DiscoverOrg / Crunchbase-style synthetic B2B firmographics dataset
-- per Cumulus BUSINESS account.
-- =============================================================================
-- Cadence:    MONTHLY via TASK_MONTHLY_ZOOMINFO_FIRMOGRAPHICS
--             (Cron: 0 7 1 * * UTC — first of month at 07:00 UTC)
-- Audience:   BUSINESS only (ACCOUNT_TYPE_FLAG = 'BUSINESS')
--             — distinct accounts from V_ACCOUNT_ANCHORS, ~12,021 distinct
--             anchors. 1:1 — each anchor emits exactly one row per month
--             → ~12,021 rows/month. Same audience as Plans 2 (MSCI) and 3 (DnB).
--             BUSINESS over-count expected (CRM ~5K) per spec §3 v1.2 finding #3.
--             Re-runs same calendar month MERGE-replace in place.
-- Generator:  SP_GENERATE_ZOOMINFO_FIRMOGRAPHICS (Snowpark Python via SP_RETRY_WRAPPER)
-- Egress:     DC Snowflake federation -> DLO/DMO CumulusZoomInfoFirmographics__dlm
-- Plan:       docs/superpowers/plans/2026-05-28-cumulus-plan-11-zoominfo-firmographics.md
-- Rowspec:    docs/superpowers/plans/attachments/cumulus-plan-11-zoominfo-firmographics-rowspec.md
--
-- v1.x multi-org-additive: ORG_ID prepended as the leading PK column so two
-- orgs can carry the same ACCOUNT_ID. DEFAULT 'JDO' kept in place for
-- backward-compatible single-org loads; per-org SPs stamp ORG_ID explicitly
-- via the audience row supplied by V_ACCOUNT_ANCHORS. See
-- Snowflake_Cumulus_Common/docs/ROLLOUT.md.
-- =============================================================================

CREATE OR REPLACE TABLE DATA_JEDAIS.FINS__PUBLIC.ZOOMINFO_FIRMOGRAPHICS (
    ORG_ID                       VARCHAR(18)       NOT NULL DEFAULT 'JDO'  COMMENT 'Tenant short identifier (JDO / ACME / WFB). Backward-compatible default; per-org SPs stamp explicitly via V_ACCOUNT_ANCHORS. Leading PK component for multi-org isolation.',
    ACCOUNT_ID                   VARCHAR(16777216) NOT NULL  COMMENT 'Anchor.ACCOUNT_ID — the Cumulus BUSINESS customer whose firmographics this is. FK to ssot__Account__dlm. PK component.',
    PROFILE_MONTH                DATE              NOT NULL  COMMENT 'First-of-month for the run (UTC). Month-bucketed for determinism — mid-month re-runs are byte-identical. PK component.',
    EMPLOYEE_BAND                VARCHAR(12)       NOT NULL  COMMENT 'Categorical band derived deterministically from EMPLOYEE_COUNT. 7 buckets: 1-10 / 11-50 / 51-200 / 201-1000 / 1001-5000 / 5001-25000 / 25001+. Default 1-10 when EMPLOYEE_COUNT NULL/0.',
    REVENUE_BAND                 VARCHAR(12)       NOT NULL  COMMENT 'Categorical band derived deterministically from ANNUAL_REVENUE. 6 buckets: <$1M / $1M-$10M / $10M-$50M / $50M-$200M / $200M-$1B / $1B+. Default <$1M when ANNUAL_REVENUE NULL/0.',
    INDUSTRY_NAICS_CODE          VARCHAR(6)        NOT NULL  COMMENT '6-digit NAICS code mapped from INDUSTRY substring. 999999 when no INDUSTRY match. VARCHAR (not NUMBER) to preserve leading-zero codes.',
    INDUSTRY_SIC_CODE            VARCHAR(4)        NOT NULL  COMMENT '4-digit SIC code mapped from INDUSTRY substring. 9999 when no INDUSTRY match. VARCHAR (not NUMBER) to preserve leading-zero codes.',
    FOUNDED_YEAR                 NUMBER(4,0)       NOT NULL  COMMENT 'Year founded. Range [1900, run_ts.year], biased by INDUSTRY (Tech ~2008, Finance ~1965, etc.). Hard cap at run_ts.year — no future-founded businesses.',
    HQ_COUNTRY_CODE              VARCHAR(2)        NOT NULL  COMMENT 'ISO 2-char country code. Literal projection of US (demo is US-only) regardless of raw COUNTRY_CODE — defensive against v1.5 finding #5 (USA / United States literal drift).',
    HQ_STATE_CODE                VARCHAR(2)        NOT NULL  COMMENT 'US 2-char state code. Defensive: SP fallbacks via _state_from_zip helper when raw STATE_CODE is empty or len < 2 (per v1.5 finding #4 empty-string drift). Guaranteed len=2.',
    HQ_POSTAL_CODE               VARCHAR(5)        NOT NULL  COMMENT '5-digit ZIP. Defensive: SP synth-fallbacks to deterministic 5-digit ZIP from seed bytes when raw POSTAL_CODE is empty (per v1.5 finding #4 — 10,798 empty rows). Guaranteed non-empty len=5.',
    WEBSITE_DOMAIN               VARCHAR(120)      NULL      COMMENT 'Lowercase alnum-stripped ACCOUNT_NAME + .com. NULL when normalized name slug length < 3 (~0.5% of rows). Distributionally tested at L1 over 3+ month roll.',
    LINKEDIN_FOLLOWERS           NUMBER(8,0)       NOT NULL  COMMENT 'LinkedIn followers count. Range [0, 5_000_000], biased by EMPLOYEE_BAND (1-10: 0-1.5K; 25001+: 0.8M-5M) with INDUSTRY multiplier (Tech/Finance x1.5; Personal Services/FnB x0.5).',
    TECH_STACK_FLAGS             VARCHAR(200)      NULL      COMMENT 'Comma-separated 0-5 tech indicators from a 12-tag pool (Salesforce, AWS, Snowflake, etc.). NULL when industry-biased tag count rolls 0 (~10% of rows). Distributionally tested at L1.',
    LAST_DATA_REFRESH_DATE       DATE              NOT NULL  COMMENT 'Vendor data-refresh date. Uniform [run_ts.date() - 90d, run_ts.date()]. Always populated, always within 90-day window of run.',
    GENERATED_AT                 TIMESTAMP_NTZ(9)  NOT NULL  COMMENT 'Month-bucketed (= PROFILE_MONTH 00:00:00) for byte-identical mid-month re-runs (audit time -> TASK_EXECUTION_LOG).',
    CONSTRAINT pk_zoominfo_firmographics PRIMARY KEY (ORG_ID, ACCOUNT_ID, PROFILE_MONTH)
)
COMMENT = 'ZoomInfo / DiscoverOrg / Crunchbase-style synthetic B2B firmographics dataset per Cumulus BUSINESS customer. Monthly generation. 1:1 — one row per distinct BUSINESS anchor per month (~12,021 rows/month). Most boring Plan structurally in the rollout — same audience as Plans 2 (MSCI) and 3 (DnB). v1.x multi-org-additive: ORG_ID is the leading PK column. Composite PK (ORG_ID, ACCOUNT_ID, PROFILE_MONTH) — DC DMO collapses to single-column PK profileMonth__c with ssot__AccountId__c as a KQ qualifier. 2 NULLable VARCHAR columns (WEBSITE_DOMAIN, TECH_STACK_FLAGS) gated by data-availability heuristics, distributionally tested. Defensive HQ-string projection per Plan 4 v1.5 findings (US literal country, synth-fallback ZIP, _state_from_zip fallback). Re-runs same month MERGE-replace. See Snowflake_ZoomInfo_Firmographics/README.md and Plan 11.';
