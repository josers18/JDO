-- ServiceNow cases behind the zero-copy Data Cloud stream service_now_cases (ssot__Case__dlm,
-- DataSourceObjectId 'service_now_cases'). It replaced "Fins".service_now, which held the old ingest
-- stream (a Postgres table can back only one stream); the rows were copied over on 2026-11-11 and the
-- old table is dropped by 005. closeddate is a real timestamp and "Case ID" is the primary key.
CREATE TABLE IF NOT EXISTS "Fins".service_now_cases (
    "Case ID"         varchar PRIMARY KEY,
    closeddate        timestamp,
    comments          varchar,
    createddate       timestamp,
    status            varchar,
    subject           varchar,
    type              varchar,
    ext_account_id    varchar,
    "Escalated"       boolean,
    "Escalation Date" timestamp,
    priority          varchar,
    updated_at        timestamp
);

