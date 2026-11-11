-- ServiceNow cases behind the zero-copy Data Cloud stream on "Fins".service_now_cases
-- (ssot__Case__dlm, DataSourceId 'Service_Now'). A Postgres table can back only one stream, and the
-- old ingest stream still holds "Fins".service_now, so the zero-copy stream reads this copy instead.
-- Same columns as service_now, except closeddate is a real timestamp ('' becomes NULL) and
-- "Case ID" is the primary key.
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

-- Copy (and on re-runs, refresh) the old table while it exists. A row changes only if the old table
-- holds a newer updated_at, so feed writes made here after the cutover are never overwritten.
DO $$
BEGIN
    IF to_regclass('"Fins".service_now') IS NOT NULL THEN
        INSERT INTO "Fins".service_now_cases AS n
            ("Case ID", closeddate, comments, createddate, status, subject, type, ext_account_id,
             "Escalated", "Escalation Date", priority, updated_at)
        SELECT "Case ID", nullif(closeddate, '')::timestamp, comments, createddate, status, subject, type,
               ext_account_id, "Escalated", "Escalation Date", priority, updated_at
        FROM "Fins".service_now
        ON CONFLICT ("Case ID") DO UPDATE SET
            status = excluded.status, closeddate = excluded.closeddate, updated_at = excluded.updated_at
        WHERE excluded.updated_at > coalesce(n.updated_at, '-infinity');
    END IF;
END $$;
