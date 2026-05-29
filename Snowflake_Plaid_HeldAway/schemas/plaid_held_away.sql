-- =============================================================================
-- FINS.PUBLIC.PLAID_HELD_AWAY
-- Plaid-style synthetic held-away financial accounts (external brokerages,
-- banks, credit unions, robo-advisors, crypto exchanges) per Retail/Wealth
-- anchor — Cumulus's customer footprint.
-- =============================================================================
-- Cadence:    MONTHLY via TASK_MONTHLY_PLAID_HELD_AWAY
--             (Cron: 0 7 1 * * UTC — 1st of every month at 07:00 UTC)
-- Audience:   Account-scoped (CLIENT_CATEGORY IN ('Retail', 'Wealth Management'))
--             — distinct accounts from V_ACCOUNT_ANCHORS, ~25,381 anchors.
--             1:N — each anchor emits 1-5 rows/month → ~52,300 rows/month.
-- Generator:  SP_GENERATE_PLAID_HELD_AWAY (Snowpark Python via SP_RETRY_WRAPPER)
-- Egress:     DC Snowflake federation -> DLO/DMO CumulusPlaidHeldAway__dlm
-- Plan:       docs/superpowers/plans/2026-05-28-cumulus-plan-6-plaid-held-away.md
-- Rowspec:    docs/superpowers/plans/attachments/cumulus-plan-6-plaid-held-away-rowspec.md
-- =============================================================================

CREATE OR REPLACE TABLE FINS.PUBLIC.PLAID_HELD_AWAY (
    ACCOUNT_ID                 VARCHAR(16777216) NOT NULL  COMMENT 'Anchor.ACCOUNT_ID — the Cumulus customer that owns this held-away account. FK to ssot__Account__dlm. PK component.',
    HELD_AWAY_ACCOUNT_ID       VARCHAR(64)       NOT NULL  COMMENT 'sha256(account_id + "_slot" + slot_index + "_plaid")[:16] hex — deterministic per (anchor, slot, salt). Identity-stable across months. PK component (single-column DC DMO PK).',
    PROFILE_MONTH              DATE              NOT NULL  COMMENT 'First-of-month for the run. Month-bucketed for determinism. PK component.',
    INSTITUTION_NAME           VARCHAR(60)       NOT NULL  COMMENT 'One of 20 mock external institutions (Vanguard, Fidelity, Chase, Wells Fargo, etc.).',
    INSTITUTION_TYPE           VARCHAR(20)       NOT NULL  COMMENT 'Brokerage, Bank, Credit Union, Robo-Advisor, Crypto Exchange.',
    ACCOUNT_TYPE               VARCHAR(30)       NOT NULL  COMMENT 'Checking, Savings, Brokerage, IRA, 401k, HSA, Credit Card, Mortgage, Auto Loan, Crypto Wallet. Conditional on INSTITUTION_TYPE.',
    BALANCE_USD                NUMBER(12,2)      NOT NULL  COMMENT 'Balance $0.00-$10M. Biased by income, age, account_type. Loans (Credit Card, Mortgage, Auto Loan) negative.',
    LAST_LINKED_DATE           DATE              NOT NULL  COMMENT 'When the customer first connected this account via Plaid. 1-48 months ago, mode ~12 months.',
    IS_ACTIVE                  BOOLEAN           NOT NULL  COMMENT 'true if Plaid connection is currently healthy; false if reconnect needed (~8% of rows). When false, LAST_TRANSACTION_DATE and MONTHLY_NET_FLOW_USD are NULL.',
    LAST_TRANSACTION_DATE      DATE              NULL      COMMENT 'Most-recent transaction date. NULL when IS_ACTIVE=false (stale connection).',
    MONTHLY_NET_FLOW_USD       NUMBER(12,2)      NULL      COMMENT 'Last-30d net inflow/outflow. NULL when IS_ACTIVE=false. Loans always negative (payments).',
    INVESTMENT_RISK_TIER       VARCHAR(15)       NULL      COMMENT 'Conservative, Moderate, Aggressive, Speculative. Only populated for ACCOUNT_TYPE in (Brokerage, IRA, 401k, HSA). Age-glide-path biased.',
    INTEREST_RATE_PCT          NUMBER(5,3)       NULL      COMMENT 'APY for Savings (0.5-5.5%); APR for Mortgage/Auto Loan/Credit Card (3-28%). NULL for non-rate-bearing accounts.',
    GENERATED_AT               TIMESTAMP_NTZ(9)  NOT NULL  COMMENT 'Month-bucketed for byte-identical mid-month re-runs (audit time -> TASK_EXECUTION_LOG).',
    CONSTRAINT pk_plaid_held_away PRIMARY KEY (ACCOUNT_ID, HELD_AWAY_ACCOUNT_ID, PROFILE_MONTH)
)
COMMENT = 'Plaid-style synthetic held-away financial accounts per Retail/Wealth anchor. Monthly generation. 1-5 rows per anchor per month (~52,300 rows/month). First 1:N dataset in the Cumulus rollout. Composite PK (ACCOUNT_ID, HELD_AWAY_ACCOUNT_ID, PROFILE_MONTH) — DC DMO collapses to single-column PK heldAwayAccountId__c. 4 NULLable fields conditional on IS_ACTIVE / ACCOUNT_TYPE. See Snowflake_Plaid_HeldAway/README.md and the umbrella spec.';
