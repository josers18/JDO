-- Campaign source of truth, template library and run log (spec 2026-10-15 §1).
CREATE TABLE IF NOT EXISTS "Fins".marketing_campaign (
    campaign_key      varchar(40)  PRIMARY KEY,
    campaign_id       varchar(18)  UNIQUE,
    campaign_name     varchar(80)  NOT NULL,
    audience_source   varchar(20)  NOT NULL CHECK (audience_source IN ('Campaign Member', 'Segment')),
    target            varchar(10)  CHECK (target IN ('Personal', 'Business', 'All')),
    audience_rule     varchar(30)  NOT NULL,
    product_name      varchar(50),
    product_category  varchar(50),
    start_date        date         NOT NULL,
    end_date          date,
    template_key      varchar(30),
    crm_state         varchar(20)  NOT NULL DEFAULT 'Pending CRM'
                          CHECK (crm_state IN ('Pending CRM', 'Linked', 'Missing in CRM', 'Drifted')),
    crm_checked_at    timestamp,
    created_at        timestamp    NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
    CHECK (crm_state = 'Pending CRM' OR campaign_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS "Fins".marketing_campaign_template (
    template_key      varchar(30)  PRIMARY KEY,
    name_pattern      varchar(80)  NOT NULL,   -- {month} → "November 2026"
    target            varchar(10)  NOT NULL CHECK (target IN ('Personal', 'Business', 'All')),
    audience_rule     varchar(30)  NOT NULL,
    product_name      varchar(50)  NOT NULL,
    product_category  varchar(50)  NOT NULL,
    start_day         smallint     NOT NULL CHECK (start_day BETWEEN 1 AND 28),
    duration_days     smallint     NOT NULL CHECK (duration_days > 0),
    active            boolean      NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS "Fins".marketing_feed_run (
    run_id            bigserial    PRIMARY KEY,
    run_at            timestamp    NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
    step              varchar(20)  NOT NULL,
    status            varchar(10)  NOT NULL CHECK (status IN ('ok', 'error')),
    campaigns         integer      NOT NULL DEFAULT 0,
    rows_inserted     integer      NOT NULL DEFAULT 0,
    detail            text
);

INSERT INTO "Fins".marketing_campaign_template
    (template_key, name_pattern, target, audience_rule, product_name, product_category, start_day, duration_days)
VALUES
    ('auto-loan-refi',       'Auto Loan Refinance — {month}',            'Personal', 'share:0.30', 'Auto Loan',               'Loans',               8, 14),
    ('cd-rate-special',      'CD Rate Special — {month}',                'Personal', 'share:0.35', 'Certificate of Deposit',  'Deposits',            5, 10),
    ('heloc-offer',          'Home Equity Line Offer — {month}',         'Personal', 'share:0.30', 'HELOC',                   'Loans',              12, 14),
    ('retirement-readiness', 'Retirement Readiness — {month}',           'Personal', 'share:0.30', 'Retirement Account',      'Investments',        15, 14),
    ('rewards-card',         'Rewards Credit Card Offer — {month}',      'Personal', 'share:0.35', 'Credit Card',             'Loans',               6, 14),
    ('savings-goal',         'Savings Goal Challenge — {month}',         'Personal', 'share:0.40', 'Savings Account',         'Deposits',           10, 10),
    ('biz-credit-card',      'Business Credit Card — {month}',           'Business', 'share:0.40', 'Business Credit Card',    'Loans',               7, 14),
    ('biz-line-of-credit',   'Business Line of Credit — {month}',        'Business', 'share:0.40', 'Business Line of Credit', 'Loans',               9, 14),
    ('cre-lending',          'Commercial Real Estate Lending — {month}', 'Business', 'share:0.30', 'Commercial Real Estate',  'Loans',              14, 14),
    ('merchant-services',    'Merchant Services Spotlight — {month}',    'Business', 'share:0.40', 'Merchant Services',       'Treasury Management', 11, 10),
    ('payroll-services',     'Payroll Services — {month}',               'Business', 'share:0.35', 'Payroll Services',        'Treasury Management',  4, 10),
    ('treasury-insights',    'Treasury Insights — {month}',              'Business', 'share:0.40', 'Treasury Management',     'Treasury Management', 16, 10),
    ('welcome',              'Welcome to Fins — {month}',                'All',      'new_accounts', 'Onboarding',            'Brand',               3,  7)
ON CONFLICT (template_key) DO NOTHING;
