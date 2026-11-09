-- =============================================================================
-- DATA_JEDAIS.FINS__PUBLIC.PLAID_HELD_AWAY
-- Plaid-style synthetic held-away financial accounts (external brokerages,
-- banks, credit unions, robo-advisors, crypto exchanges, business fintechs) per Retail/Wealth/Small Business/Commercial
-- anchor — Cumulus's customer footprint.
-- =============================================================================
-- Cadence:    MONTHLY via TASK_MONTHLY_PLAID_HELD_AWAY
--             (Cron: 35 3 1 * * America/New_York — 1st of every month at 03:35 ET)
-- Audience:   Account-scoped (CLIENT_CATEGORY IN ('Retail', 'Wealth Management',
--             'Small Business', 'Commercial Banking')) — distinct accounts from
--             V_ACCOUNT_ANCHORS, ~30,997 anchors (25,381 personal + 5,616 business).
--             1:N — each anchor emits 1-5 rows/month → ~55,000 rows/month.
--             Held-away accounts are identity-stable: the same slots, institutions,
--             account types, link dates, risk tiers and rates every month; balance,
--             activity and flow change monthly.
-- Generator:  SP_GENERATE_PLAID_HELD_AWAY (Snowpark Python via SP_RETRY_WRAPPER)
-- Egress:     DC Snowflake federation -> stream BT_Plaid_Held_Away -> BT_Plaid_Held_Away__dlm
-- Plan:       docs/superpowers/plans/2026-05-28-cumulus-plan-6-plaid-held-away.md
-- Rowspec:    docs/superpowers/plans/attachments/cumulus-plan-6-plaid-held-away-rowspec.md
-- Synced 2026-11-09 to the live table (GET_DDL). Declared PK = RECORD_ID
-- (the DMO key, record_id__c); the natural key (ACCOUNT_ID, HELD_AWAY_ACCOUNT_ID, PROFILE_MONTH) is a
-- UNIQUE without ORG_ID. Snowflake enforces neither: the SP's MERGE ON is
-- what keeps rows unique. ORG_ID is nullable with DEFAULT 'JDO'. See
-- Snowflake_Cumulus_Common/docs/ROLLOUT.md A6.
-- =============================================================================

CREATE OR REPLACE TABLE DATA_JEDAIS.FINS__PUBLIC.PLAID_HELD_AWAY (
    ACCOUNT_ID                   VARCHAR(16777216) NOT NULL COMMENT 'Anchor.ACCOUNT_ID — the Cumulus customer that owns this held-away account. FK to ssot__Account__dlm. PK component.',
    HELD_AWAY_ACCOUNT_ID         VARCHAR(64) NOT NULL COMMENT 'sha256(account_id + "_slot" + slot_index + "_plaid")[:16] hex — deterministic per (anchor, slot, salt). Identity-stable across months. PK component (single-column DC DMO PK).',
    PROFILE_MONTH                DATE NOT NULL COMMENT 'First-of-month for the run. Month-bucketed for determinism. PK component.',
    INSTITUTION_NAME             VARCHAR(60) NOT NULL COMMENT 'One of 20 mock external institutions (Vanguard, Fidelity, Chase, Wells Fargo, etc.).',
    INSTITUTION_TYPE             VARCHAR(20) NOT NULL COMMENT 'Brokerage, Bank, Credit Union, Robo-Advisor, Crypto Exchange.',
    ACCOUNT_TYPE                 VARCHAR(30) NOT NULL COMMENT 'Checking, Savings, Brokerage, IRA, 401k, HSA, Credit Card, Mortgage, Auto Loan, Crypto Wallet. Conditional on INSTITUTION_TYPE.',
    BALANCE_USD                  NUMBER(12,2) NOT NULL COMMENT 'Balance $0.00-$10M. Biased by income, age, account_type. Loans (Credit Card, Mortgage, Auto Loan) negative.',
    LAST_LINKED_DATE             DATE NOT NULL COMMENT 'When the customer first connected this account via Plaid. 1-48 months ago, mode ~12 months.',
    IS_ACTIVE                    BOOLEAN NOT NULL COMMENT 'true if Plaid connection is currently healthy; false if reconnect needed (~8% of rows). When false, LAST_TRANSACTION_DATE and MONTHLY_NET_FLOW_USD are NULL.',
    LAST_TRANSACTION_DATE        DATE COMMENT 'Most-recent transaction date. NULL when IS_ACTIVE=false (stale connection).',
    MONTHLY_NET_FLOW_USD         NUMBER(12,2) COMMENT 'Last-30d net inflow/outflow. NULL when IS_ACTIVE=false. Loans always negative (payments).',
    INVESTMENT_RISK_TIER         VARCHAR(15) COMMENT 'Conservative, Moderate, Aggressive, Speculative. Only populated for ACCOUNT_TYPE in (Brokerage, IRA, 401k, HSA). Age-glide-path biased.',
    INTEREST_RATE_PCT            NUMBER(5,3) COMMENT 'APY for Savings (0.5-5.5%); APR for Mortgage/Auto Loan/Credit Card (3-28%). NULL for non-rate-bearing accounts.',
    GENERATED_AT                 TIMESTAMP_NTZ(9) NOT NULL COMMENT 'Month-bucketed for byte-identical mid-month re-runs (audit time -> TASK_EXECUTION_LOG).',
    ORG_ID                       VARCHAR(18) DEFAULT 'JDO',
    RECORD_ID                    VARCHAR(36) NOT NULL DEFAULT UUID_STRING() COMMENT 'Per-row surrogate key (table default; the generator never writes it).',
    BALANCE_CATEGORY             VARCHAR(10) NOT NULL COMMENT 'asset or liability. liability = Credit Card, Mortgage, Auto Loan. Net worth = SUM(asset) - SUM(liability).',
    CONSTRAINT uq_plaid_held_away UNIQUE (ACCOUNT_ID, HELD_AWAY_ACCOUNT_ID, PROFILE_MONTH),
    CONSTRAINT pk_plaid_held_away PRIMARY KEY (RECORD_ID)
)
COMMENT = 'Plaid-style synthetic held-away financial accounts per Retail/Wealth anchor. Monthly generation. 1-5 rows per anchor per month (~52,300 rows/month). First 1:N dataset in the Cumulus rollout. Composite PK (ACCOUNT_ID, HELD_AWAY_ACCOUNT_ID, PROFILE_MONTH) — DC DMO collapses to single-column PK heldAwayAccountId__c. 4 NULLable fields conditional on IS_ACTIVE / ACCOUNT_TYPE. See Snowflake_Plaid_HeldAway/README.md and the umbrella spec.';
