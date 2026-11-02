-- =============================================================================
-- DATA_JEDAIS.FINS__PUBLIC.HARMONIC_COMPANY_SIGNALS (+ _STAGING sibling)
-- Harmonic-style synthetic private-company funding and traction signals, with
-- Coresignal-style department headcount mix and job-posting velocity, per
-- young private Cumulus commercial account.
-- =============================================================================
-- Cadence:    MONTHLY via TASK_MONTHLY_HARMONIC_COMPANY_SIGNALS
--             (Cron: 0 9 1 * * UTC -- 1st of month 09:00 UTC, after ZoomInfo).
-- Audience:   Three-way join (plan section 2):
--               V_ACCOUNT_ANCHORS ACCOUNT_TYPE_FLAG = 'BUSINESS'
--               AND COALESCE(CLIENT_CATEGORY, '') <> 'Household'
--             x ZOOMINFO_FIRMOGRAPHICS same-month FOUNDED_YEAR >= 2010
--             x latest MOODYS_MARKET_CONTEXT row LIQUIDITY_TIER = 'Illiquid'.
--             672 anchors for 2026-11 (650-672 over the 7 ZoomInfo months).
-- Shape:      1:1 -- one row per audience anchor per month. MERGE on PK.
-- Generator:  SP_GENERATE_HARMONIC_COMPANY_SIGNALS(BACKFILL_MONTHS INTEGER DEFAULT 0)
-- Egress:     DC Snowflake federation -> DLO/DMO CumulusHarmonicCompanySignals__dlm
-- Plan:       docs/superpowers/plans/2026-11-02-cumulus-plan-16-harmonic-company-signals.md
-- Rowspec:    docs/superpowers/plans/attachments/cumulus-plan-16-harmonic-company-signals-rowspec.md
-- No ampersand anywhere in this file (snow sql template-render trap).
-- =============================================================================

CREATE OR REPLACE TABLE DATA_JEDAIS.FINS__PUBLIC.HARMONIC_COMPANY_SIGNALS (
    ORG_ID                   VARCHAR(18)       NOT NULL DEFAULT 'JDO' COMMENT 'Multi-org tenant identifier (Phase A convention). Stable short-id per logical tenant, NOT the 18-char SF Org Id. PK component (first).',
    RECORD_ID                VARCHAR(36)       NOT NULL COMMENT 'Deterministic UUID = record_id_for(ORG_ID, ACCOUNT_ID, PROFILE_MONTH) (cumulus_common/record_id.py). Written by the SP on INSERT and UPDATE. Single-column DC primary key recordId__c.',
    ACCOUNT_ID               VARCHAR(16777216) NOT NULL COMMENT 'Anchor.ACCOUNT_ID. FK to ssot__Account__dlm. PK component.',
    PROFILE_MONTH            DATE              NOT NULL COMMENT 'First of the run month (UTC). Month-bucketed for determinism. PK component.',
    FUNDING_STATUS           VARCHAR(16)       NOT NULL COMMENT 'Bootstrapped / Angel-Seed / Venture-Backed / PE-Backed, from the last round dated on or before month-end of the account-lifetime funding timeline. Never returns to Bootstrapped after a round.',
    LAST_FUNDING_STAGE       VARCHAR(20)       NULL     COMMENT 'Stage of the last round on or before month-end (Pre-Seed, Seed, Series A, Series B, Series C, Growth, PE Growth Equity, PE Buyout). NULL if Bootstrapped. Ladder index never decreases month over month.',
    LAST_FUNDING_DATE        DATE              NULL     COMMENT 'Date of that round; always on or before month-end. NULL if Bootstrapped.',
    LAST_ROUND_USD           NUMBER(12,0)      NULL     COMMENT 'Size of that round (USD, rounded to 50K, stage-banded). NULL if Bootstrapped. Never exceeds TOTAL_RAISED_USD.',
    TOTAL_RAISED_USD         NUMBER(12,0)      NOT NULL COMMENT 'Sum of rounds on or before month-end; 0 if Bootstrapped. Non-decreasing month over month by construction.',
    FUNDING_ROUNDS_COUNT     NUMBER(2,0)       NOT NULL COMMENT 'Count of rounds on or before month-end; 0 if Bootstrapped. Non-decreasing.',
    LEAD_INVESTOR            VARCHAR(60)       NULL     COMMENT 'Lead investor of the last round (angel / venture / PE pool by stage). NULL if Bootstrapped.',
    EST_VALUATION_USD        NUMBER(13,0)      NULL     COMMENT 'Post-money estimate from the last round = round size x stage multiple (rounded to 100K). Multiple seeded per account and round. NULL if Bootstrapped.',
    EST_RUNWAY_MONTHS        NUMBER(2,0)       NULL     COMMENT 'Months of runway [0, 60] = last round / (headcount x account-stable burn) - months since the round. Angel-Seed / Venture-Backed only; NULL otherwise.',
    RECENTLY_FUNDED_FLAG     BOOLEAN           NOT NULL COMMENT 'TRUE when LAST_FUNDING_DATE is on or after PROFILE_MONTH minus 90 days. FALSE when Bootstrapped.',
    HEADCOUNT                NUMBER(6,0)       NOT NULL COMMENT 'Employee estimate, always inside the same-month ZoomInfo EMPLOYEE_BAND bounds. Account-stable band position and drift, +4 pct per round in the trailing 12 months, 2 pct monthly jitter.',
    HEADCOUNT_GROWTH_6M_PCT  NUMBER(5,1)       NOT NULL COMMENT '(hc(M) - hc(M-6)) / hc(M-6) x 100, recomputed from the pure headcount function with the M-6 band (never read from this table). Clamped to [-60, 300].',
    TRACTION_SCORE           NUMBER(3,0)       NOT NULL COMMENT 'Composite [0, 100]: 40 + growth x 0.6 (capped at +-30) + postings trend + 12 if recently funded + 5 if total raised is at least 10M.',
    ENG_HEADCOUNT_PCT        NUMBER(4,1)       NOT NULL COMMENT 'Coresignal-style dept mix: engineering / technical share of headcount (pct). Industry baseline, account-stable offset, small monthly jitter.',
    SALES_HEADCOUNT_PCT      NUMBER(4,1)       NOT NULL COMMENT 'Coresignal-style dept mix: sales / customer-facing share (pct).',
    OPS_HEADCOUNT_PCT        NUMBER(4,1)       NOT NULL COMMENT 'Coresignal-style dept mix: operations / field / production share (pct). ENG + SALES + OPS is at most 98; the remainder is G and A.',
    OPEN_JOB_POSTINGS        NUMBER(5,0)       NOT NULL COMMENT 'Open job postings = headcount x rate x monthly noise. Rate rises within 180 days of a round, x0.2 for lean hirers, x0.3 when runway is under 6 months.',
    POSTINGS_TREND           VARCHAR(12)       NOT NULL COMMENT 'Accelerating / Steady / Slowing / Frozen, from postings(M) vs postings(M-3), recomputed (never read from this table).',
    LAST_DATA_REFRESH_DATE   DATE              NOT NULL COMMENT 'Vendor refresh day within [PROFILE_MONTH, PROFILE_MONTH + 27 days].',
    GENERATED_AT             TIMESTAMP_NTZ(9)  NOT NULL COMMENT 'Month-bucketed (PROFILE_MONTH at 00:00:00) so same-month re-runs are byte-identical.',
    CONSTRAINT pk_harmonic_company_signals PRIMARY KEY (ORG_ID, ACCOUNT_ID, PROFILE_MONTH)
)
COMMENT = 'Harmonic-style synthetic private-company funding and traction signals plus Coresignal-style dept mix and job postings, per young private Cumulus commercial account (three-way audience: BUSINESS non-household x ZoomInfo FOUNDED_YEAR at least 2010 x Moody''s latest LIQUIDITY_TIER Illiquid; 672 anchors for 2026-11). 1:1 monthly, MERGE on (ORG_ID, ACCOUNT_ID, PROFILE_MONTH). Funding columns are an as-of-month view of one account-lifetime round timeline (salt harmonic_funding), so totals are monotone. Hard-depends on ZOOMINFO_FIRMOGRAPHICS and MOODYS_MARKET_CONTEXT. DC PK recordId__c. See Snowflake_Harmonic_CompanySignals/README.md and Plan 16.';

-- Staging sibling: identical columns, defaults and comments (CREATE ... LIKE
-- copies the column definitions). The SP loads a month here, then MERGEs it
-- into the target on (ORG_ID, ACCOUNT_ID, PROFILE_MONTH).
CREATE OR REPLACE TABLE DATA_JEDAIS.FINS__PUBLIC.HARMONIC_COMPANY_SIGNALS_STAGING
    LIKE DATA_JEDAIS.FINS__PUBLIC.HARMONIC_COMPANY_SIGNALS;
