-- ServiceNow cases behind the Data Cloud "Service Now" stream (ssot__Case__dlm, DataSourceId 'Service_Now').
-- The table predates this repo; this keeps the scratch test schema in step and adds updated_at,
-- which service_now.py stamps on every row it inserts or advances.
CREATE TABLE IF NOT EXISTS "Fins".service_now (
    closeddate        varchar,
    comments          varchar,
    createddate       timestamp,
    status            varchar,
    subject           varchar,
    type              varchar,
    ext_account_id    varchar,
    "Case ID"         varchar,
    "Escalated"       boolean,
    "Escalation Date" timestamp,
    priority          varchar
);
ALTER TABLE "Fins".service_now ADD COLUMN IF NOT EXISTS updated_at timestamp;
