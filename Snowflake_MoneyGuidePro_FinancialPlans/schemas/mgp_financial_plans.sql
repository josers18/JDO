-- =============================================================================
-- FINS.PUBLIC.MGP_FINANCIAL_PLANS
-- MoneyGuidePro / eMoney / NaviPlan-style synthetic financial-plan dataset
-- per Wealth Management Cumulus customer.
-- =============================================================================
-- Cadence:    MONTHLY via TASK_MONTHLY_MGP_FINANCIAL_PLANS
--             (Cron: 0 7 1 * * UTC — first of month at 07:00 UTC)
-- Audience:   Wealth Management only (CLIENT_CATEGORY = 'Wealth Management')
--             — distinct accounts from V_ACCOUNT_ANCHORS, ~3,920 distinct
--             anchors. 1:1 — each anchor emits exactly one row per month
--             → ~3,920 rows/month. Smallest Cumulus audience by 2.9×.
--             Re-runs same calendar month MERGE-replace in place.
-- Generator:  SP_GENERATE_MGP_FINANCIAL_PLANS (Snowpark Python via SP_RETRY_WRAPPER)
-- Egress:     DC Snowflake federation -> DLO/DMO CumulusMgpFinancialPlans__dlm
-- Plan:       docs/superpowers/plans/2026-05-28-cumulus-plan-8-mgp-financial-plans.md
-- Rowspec:    docs/superpowers/plans/attachments/cumulus-plan-8-mgp-financial-plans-rowspec.md
--
-- v1.x (multi-org-additive): ORG_ID prepended as the leading PK column so a
-- single Snowflake table can hold rows for multiple Salesforce orgs without
-- ACCOUNT_ID collisions. ORG_ID DEFAULT 'JDO' keeps existing single-org
-- callers backward-compatible. See Snowflake_Cumulus_Common/docs/ROLLOUT.md
-- Phase A6.
-- =============================================================================

CREATE OR REPLACE TABLE FINS.PUBLIC.MGP_FINANCIAL_PLANS (
    ORG_ID                        VARCHAR(18)       NOT NULL DEFAULT 'JDO'  COMMENT 'Logical-tenant identifier (e.g. JDO, ACME, WFB). Stable short id chosen per org — NOT the 18-char SF Org Id, since that rotates per sandbox refresh. DEFAULT JDO keeps single-org loaders backward-compatible. PK component.',
    ACCOUNT_ID                    VARCHAR(16777216) NOT NULL  COMMENT 'Anchor.ACCOUNT_ID — the Cumulus Wealth Management customer whose plan this is. FK to ssot__Account__dlm. PK component.',
    PROFILE_MONTH                 DATE              NOT NULL  COMMENT 'First-of-month for the run (UTC). Month-bucketed for determinism — mid-month re-runs are byte-identical. PK component.',
    PLAN_STATUS                   VARCHAR(20)       NOT NULL  COMMENT 'Active (~80%), Draft (~12%), Stale (~8%). Drives NULL gating on LAST_REVIEW_DATE / NEXT_REVIEW_DATE.',
    PLAN_LAST_UPDATED_DATE        DATE              NOT NULL  COMMENT 'When the plan was last touched. Within 1-36 months ago, biased by PLAN_STATUS (Stale: 12-36 mo; Draft: 0-3 mo; Active: 1-12 mo). ≤ run_ts.date().',
    RETIREMENT_TARGET_AGE         NUMBER(3,0)       NOT NULL  COMMENT 'Target retirement age in [55,80]. Biased by current age (already-retired -> current age; mid-career -> 65-67; young -> 60-65).',
    MONTHLY_INCOME_TARGET_USD     NUMBER(8,0)       NOT NULL  COMMENT 'Desired monthly retirement income (USD). 70-90% of pre-retirement ANNUAL_INCOME / 12. Range [10000, 200000].',
    TOTAL_GOAL_AMOUNT_USD         NUMBER(12,0)      NOT NULL  COMMENT 'Sum of all goal amounts (USD). 8-35× ANNUAL_INCOME, biased by life stage. Range [500000, 50000000].',
    GOAL_COUNT                    NUMBER(2,0)       NOT NULL  COMMENT 'Number of distinct goals (retirement, college, vacation, legacy, travel, education). Range [1,6], mode 2-3.',
    MONTE_CARLO_SUCCESS_PCT       NUMBER(5,2)       NOT NULL  COMMENT 'Monte Carlo simulation success probability (%). Biased by income / age / goal_count. Range [30.00, 99.00]. Not a real simulation — biased synthesis.',
    RECOMMENDED_ASSET_ALLOCATION  VARCHAR(30)       NOT NULL  COMMENT 'Conservative, Moderate Conservative, Moderate, Moderate Aggressive, Aggressive. Textbook age-glide bias (younger -> aggressive; older -> conservative).',
    LAST_REVIEW_DATE              DATE              NULL      COMMENT 'Date of last advisor review. NULL when PLAN_STATUS=Draft (advisor has not reviewed yet). When populated, ≤ run_ts.date().',
    NEXT_REVIEW_DATE              DATE              NULL      COMMENT 'Scheduled next review. NULL when PLAN_STATUS=Stale (no review scheduled). When populated, > run_ts.date() (1-18 months ahead).',
    ADVISOR_NOTES_FLAG            BOOLEAN           NOT NULL  COMMENT 'true if advisor has logged free-text notes on the plan. ~75% true for Active, ~30% for Draft, ~15% for Stale.',
    GENERATED_AT                  TIMESTAMP_NTZ(9)  NOT NULL  COMMENT 'Month-bucketed (= PROFILE_MONTH 00:00:00) for byte-identical mid-month re-runs (audit time -> TASK_EXECUTION_LOG).',
    CONSTRAINT pk_mgp_financial_plans PRIMARY KEY (ORG_ID, ACCOUNT_ID, PROFILE_MONTH)
)
COMMENT = 'MoneyGuidePro / eMoney / NaviPlan-style synthetic financial-plan dataset per Cumulus Wealth Management customer. Monthly generation. 1:1 — one row per distinct Wealth anchor per month (~3,920 rows/month). Smallest Cumulus audience by 2.9× and first dataset whose NULL semantics are gated by a non-Boolean enum (PLAN_STATUS). Composite PK (ORG_ID, ACCOUNT_ID, PROFILE_MONTH) — v1.x multi-org-additive (ORG_ID DEFAULT JDO). DC DMO collapses to single-column PK profileMonth__c with ssot__AccountId__c as a KQ qualifier. 2 NULLable date fields conditional on PLAN_STATUS. 1 BOOLEAN column. Re-runs same month MERGE-replace. See Snowflake_MoneyGuidePro_FinancialPlans/README.md and Plan 8.';
