-- Email engagement events, one row per event (spec §1).
-- Timestamps are UTC.
CREATE TABLE IF NOT EXISTS "Fins".marketing_engagement (
    engagement_id       varchar(64)  PRIMARY KEY,
    send_id             varchar(64)  NOT NULL,
    campaign_id         varchar(18)  NOT NULL,
    campaign_name       varchar(80)  NOT NULL,
    audience_source     varchar(20)  NOT NULL CHECK (audience_source IN ('Campaign Member', 'Segment')),
    campaign_member_id  varchar(18),
    account_id          varchar(18)  NOT NULL,
    contact_id          varchar(18),
    personal_business   varchar(10)  NOT NULL,
    product_name        varchar(50),
    product_category    varchar(50),
    engagement_type     varchar(20)  NOT NULL CHECK (engagement_type IN
                            ('Sent', 'Delivered', 'Bounced', 'Opened', 'Clicked', 'Unsubscribed')),
    engagement_at       timestamp    NOT NULL,
    bounce_type         varchar(10),
    last_modified_at    timestamp    NOT NULL
);

CREATE INDEX IF NOT EXISTS marketing_engagement_account_at_idx
    ON "Fins".marketing_engagement (account_id, engagement_at);
CREATE INDEX IF NOT EXISTS marketing_engagement_send_idx
    ON "Fins".marketing_engagement (send_id);
