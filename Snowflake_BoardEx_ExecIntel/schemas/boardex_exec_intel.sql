-- =============================================================================
-- FINS.PUBLIC.BOARDEX_EXEC_INTEL
-- BoardEx / Equilar / ISS-style synthetic board director and executive
-- intelligence dataset per Commercial Banking Cumulus customer.
-- =============================================================================
-- Cadence:    MONTHLY via TASK_MONTHLY_BOARDEX_EXEC_INTEL
--             (Cron: 0 7 1 * * UTC — first of month at 07:00 UTC)
-- Audience:   Commercial Banking only (CLIENT_CATEGORY = 'Commercial Banking')
--             — distinct accounts from V_ACCOUNT_ANCHORS, ~960 distinct
--             anchors. 1:1 — each anchor emits exactly one row per month
--             → ~960 rows/month. Smallest Cumulus audience of all 13 plans
--             by 4.1× (dethrones Plan 8 MGP Financial Plans, 3,920).
--             Re-runs same calendar month MERGE-replace in place.
-- Generator:  SP_GENERATE_BOARDEX_EXEC_INTEL (Snowpark Python via SP_RETRY_WRAPPER)
-- Egress:     DC Snowflake federation -> DLO/DMO CumulusBoardExExecIntel__dlm
-- Plan:       docs/superpowers/plans/2026-05-28-cumulus-plan-10-boardex-exec-intel.md
-- Rowspec:    docs/superpowers/plans/attachments/cumulus-plan-10-boardex-exec-intel-rowspec.md
-- =============================================================================

CREATE OR REPLACE TABLE FINS.PUBLIC.BOARDEX_EXEC_INTEL (
    ORG_ID                        VARCHAR(18)       NOT NULL  DEFAULT 'JDO'
        COMMENT 'Multi-org tenant discriminator (v1.x multi-org-additive). Salesforce 18-char Org ID; defaults to JDO for the seed tenant. First component of composite PK so the same (ACCOUNT_ID, PROFILE_MONTH) can co-exist across tenants. Backward-compatible: pre-migration rows back-stamp to JDO via DEFAULT.',
    ACCOUNT_ID                    VARCHAR(16777216) NOT NULL  COMMENT 'Anchor.ACCOUNT_ID — the Cumulus Commercial Banking customer whose board / exec intelligence this is. FK to ssot__Account__dlm. PK component.',
    PROFILE_MONTH                 DATE              NOT NULL  COMMENT 'First-of-month for the run (UTC). Month-bucketed for determinism — mid-month re-runs are byte-identical. PK component.',
    BOARD_SIZE                    NUMBER(2,0)       NOT NULL  COMMENT 'Number of directors. Range [5,15]. Biased by anchor EMPLOYEE_COUNT (large enterprise -> 9-15; mid-market -> 7-12; small -> 5-10; smallest -> 5-8).',
    BOARD_INDEPENDENCE_PCT        NUMBER(5,2)       NOT NULL  COMMENT 'Percent of independent (non-executive) directors. Range [50.00, 100.00]. Skewed 70-90 for established commercial-banking clients (NYSE/NASDAQ governance norms).',
    WOMEN_BOARD_PCT               NUMBER(5,2)       NOT NULL  COMMENT 'Percent of women on the board. Range [0.00, 100.00]. Skews 20-45 (real BoardEx 2026 mean ~32%).',
    MINORITY_BOARD_PCT            NUMBER(5,2)       NOT NULL  COMMENT 'Percent of racial / ethnic minorities on the board. Range [0.00, 100.00]. Skews 10-35 (real BoardEx 2026 mean ~22%).',
    BOARD_AVG_TENURE_YEARS        NUMBER(4,1)       NOT NULL  COMMENT 'Average years on the board across all directors. Range [1.0, 20.0]. Established commercial banks average 6-10.',
    CEO_TENURE_YEARS              NUMBER(4,1)       NOT NULL  COMMENT 'Current CEO tenure in years. Range [0.0, 25.0]. Larger employers skew longer-tenured (succession planning).',
    EXEC_TURNOVER_FLAG            BOOLEAN           NOT NULL  COMMENT 'True if any C-suite change in the trailing 12 months. ~20% True overall, biased lower for long-CEO-tenure firms (~10%) and higher for new CEOs <2yrs (~35%).',
    GOVERNANCE_RATING             VARCHAR(15)       NOT NULL  COMMENT 'Excellent / Strong / Adequate / Weak / Concerning. Composite of independence + avg tenure + exec turnover. Skews Strong / Adequate for the cohort.',
    INTERLOCK_COUNT               NUMBER(2,0)       NOT NULL  COMMENT 'Count of board members who sit on other Commercial Banking client boards. Range [0,5]. Driven by anchor INTERLOCK_DEGREE.',
    KEY_DIRECTOR_NAME             VARCHAR(80)       NOT NULL  COMMENT 'Exemplar synthesized director full name (form "<First> <Last>"). Single-row exemplar for narrative — clearly fake; not real-person PII.',
    RECENT_GOVERNANCE_EVENT_DATE  DATE              NULL      COMMENT 'Last reported governance change (chair swap, audit-committee restructure, etc.). NULL ~70% of rows (independent 30%/70% Bernoulli — no enum gating). When populated, ≤ run_ts.date(); within last 365 days.',
    LAST_DATA_REFRESH_DATE        DATE              NOT NULL  COMMENT 'Vendor''s last data refresh. Always ≤ run_ts.date(). Drawn 1-30 days before the run.',
    GENERATED_AT                  TIMESTAMP_NTZ(9)  NOT NULL  COMMENT 'Month-bucketed (= PROFILE_MONTH 00:00:00) for byte-identical mid-month re-runs (audit time -> TASK_EXECUTION_LOG).',
    CONSTRAINT pk_boardex_exec_intel PRIMARY KEY (ORG_ID, ACCOUNT_ID, PROFILE_MONTH)
)
COMMENT = 'BoardEx / Equilar / ISS-style synthetic board director and executive intelligence dataset per Cumulus Commercial Banking customer. Monthly generation. 1:1 — one row per distinct Commercial Banking anchor per month (~960 rows/month). Smallest Cumulus audience of all 13 plans by 4.1× (dethrones Plan 8 MGP Financial Plans, 3,920) and the first dataset where the SAMPLE_ANCHORS L1 fixture has zero relevant cohort members (forces an inline 5-anchor synthetic-fixture override in the L1 conftest). v1.x multi-org-additive: ORG_ID NOT NULL DEFAULT JDO is the leading PK component so the same (ACCOUNT_ID, PROFILE_MONTH) can co-exist across tenants. Composite PK (ORG_ID, ACCOUNT_ID, PROFILE_MONTH) — DC DMO collapses to single-column PK profileMonth__c with ssot__AccountId__c as a KQ qualifier. 1 NULLable date field via independent 30%/70% Bernoulli. 1 BOOLEAN column. Re-runs same month MERGE-replace. See Snowflake_BoardEx_ExecIntel/README.md and Plan 10.';
