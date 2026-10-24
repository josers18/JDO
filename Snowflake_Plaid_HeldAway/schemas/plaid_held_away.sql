-- =============================================================================
-- DATA_JEDAIS.FINS__PUBLIC.PLAID_HELD_AWAY
-- Plaid-style synthetic held-away financial accounts (external brokerages,
-- banks, credit unions, robo-advisors, crypto exchanges) per Retail/Wealth
-- anchor — Cumulus's customer footprint.
-- =============================================================================
-- Cadence:    MONTHLY via TASK_MONTHLY_PLAID_HELD_AWAY
--             (Cron: 35 3 1 * * America/New_York — 1st of every month at 03:35 ET)
-- Audience:   Account-scoped (CLIENT_CATEGORY IN ('Retail', 'Wealth Management'))
--             — distinct accounts from V_ACCOUNT_ANCHORS, ~25,381 anchors.
--             1:N — each anchor emits 1-5 rows/month → ~55,000 rows/month.
--             Held-away accounts are identity-stable: the same slots, institutions,
--             account types, link dates, risk tiers and rates every month; balance,
--             activity and flow change monthly.
-- Generator:  SP_GENERATE_PLAID_HELD_AWAY (Snowpark Python via SP_RETRY_WRAPPER)
-- Egress:     DC Snowflake federation -> stream BT_Plaid_Held_Away -> BT_Plaid_Held_Away__dlm
-- Plan:       docs/superpowers/plans/2026-05-28-cumulus-plan-6-plaid-held-away.md
-- Rowspec:    docs/superpowers/plans/attachments/cumulus-plan-6-plaid-held-away-rowspec.md
-- =============================================================================

CREATE OR REPLACE TABLE DATA_JEDAIS.FINS__PUBLIC.PLAID_HELD_AWAY (
    ORG_ID                     VARCHAR(18)       NOT NULL DEFAULT 'JDO' COMMENT 'v1.x multi-org-additive: ORG_ID stamped from V_ACCOUNT_ANCHORS; default JDO is the backward-compat backstop. Leads the PK so two orgs holding the same SF ACCOUNT_ID + slot never clobber each other.',
    ACCOUNT_ID                 VARCHAR(16777216) NOT NULL  COMMENT 'Anchor.ACCOUNT_ID — the Cumulus customer that owns this held-away account. FK to ssot__Account__dlm. PK component.',
    HELD_AWAY_ACCOUNT_ID       VARCHAR(64)       NOT NULL  COMMENT 'sha256(account_id + "_slot" + slot_index + "_plaid")[:16] hex — deterministic per (anchor, slot, salt). Identity-stable across months. PK component (single-column DC DMO PK).',
    PROFILE_MONTH              DATE              NOT NULL  COMMENT 'First-of-month for the run. Month-bucketed for determinism. PK component.',
    INSTITUTION_NAME           VARCHAR(60)       NOT NULL  COMMENT 'One of 20 mock external institutions. Weighted: type first (Brokerage 30, Bank 38, Credit Union 14, Robo-Advisor 9, Crypto Exchange 9), then market share within type (Fidelity, Schwab, Vanguard lead Brokerage; Chase, Bank of America, Wells Fargo lead Bank). Stable per held-away account.',
    INSTITUTION_TYPE           VARCHAR(20)       NOT NULL  COMMENT 'Brokerage, Bank, Credit Union, Robo-Advisor, Crypto Exchange.',
    ACCOUNT_TYPE               VARCHAR(30)       NOT NULL  COMMENT 'Constrained by INSTITUTION_TYPE: Brokerage -> Brokerage/IRA/401k/HSA; Bank -> Checking/Savings/Credit Card/Mortgage/Auto Loan; Credit Union -> Checking/Savings/Credit Card/Auto Loan; Robo-Advisor -> Managed Portfolio/IRA; Crypto Exchange -> Crypto Wallet.',
    BALANCE_USD                NUMBER(12,2)      NOT NULL  COMMENT 'Always >= 0, $0.00-$10M. For liabilities it is the amount owed; read BALANCE_CATEGORY for the sign. Biased by income, age, account_type; drifts a few percent month to month around a stable per-account base.',
    BALANCE_CATEGORY           VARCHAR(10)       NOT NULL  COMMENT 'asset or liability. liability = Credit Card, Mortgage, Auto Loan. Net worth = SUM(asset) - SUM(liability).',
    LAST_LINKED_DATE           DATE              NOT NULL  COMMENT 'When the customer first connected this account via Plaid. 1-48 months before 2026-05-01, mode ~12 months. Stable per held-away account.',
    IS_ACTIVE                  BOOLEAN           NOT NULL  COMMENT 'true if Plaid connection is currently healthy; false if reconnect needed (~8% of rows). When false, LAST_TRANSACTION_DATE and MONTHLY_NET_FLOW_USD are NULL.',
    LAST_TRANSACTION_DATE      DATE              NULL      COMMENT 'Most-recent transaction date. NULL when IS_ACTIVE=false (stale connection).',
    MONTHLY_NET_FLOW_USD       NUMBER(12,2)      NULL      COMMENT 'Last-30d net inflow/outflow. NULL when IS_ACTIVE=false. Loans always negative (payments).',
    INVESTMENT_RISK_TIER       VARCHAR(15)       NULL      COMMENT 'Conservative, Moderate, Aggressive, Speculative. NULL BY DESIGN (not missing) unless ACCOUNT_TYPE in (Brokerage, Managed Portfolio, IRA, 401k, HSA). Age-glide-path biased.',
    INTEREST_RATE_PCT          NUMBER(5,3)       NULL      COMMENT 'APY for Savings (0.5-5.5%); APR for Mortgage/Auto Loan/Credit Card (2.75-28%). NULL BY DESIGN (not missing) for Checking, investment and crypto accounts.',
    GENERATED_AT               TIMESTAMP_NTZ(9)  NOT NULL  COMMENT 'Month-bucketed for byte-identical mid-month re-runs (audit time -> TASK_EXECUTION_LOG).',
    RECORD_ID                  VARCHAR(36)       NOT NULL DEFAULT UUID_STRING() COMMENT 'Per-row surrogate key (table default; the generator never writes it).',
    CONSTRAINT pk_plaid_held_away PRIMARY KEY (ORG_ID, ACCOUNT_ID, HELD_AWAY_ACCOUNT_ID, PROFILE_MONTH)
)
COMMENT = 'Plaid-style synthetic held-away financial accounts per Retail/Wealth anchor. Monthly generation. 1-5 rows per anchor per month (~55,000 rows/month). First 1:N dataset in the Cumulus rollout. Composite PK (ORG_ID, ACCOUNT_ID, HELD_AWAY_ACCOUNT_ID, PROFILE_MONTH) — DC DMO collapses to single-column PK heldAwayAccountId__c. 4 NULLable fields conditional on IS_ACTIVE / ACCOUNT_TYPE (NULL by design). Balances are positive; BALANCE_CATEGORY carries asset/liability. v1.x multi-org-additive: ORG_ID stamped from V_ACCOUNT_ANCHORS; default JDO is the backward-compat backstop. See Snowflake_Plaid_HeldAway/README.md and the umbrella spec.';
