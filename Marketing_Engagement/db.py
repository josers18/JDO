"""Postgres access for the marketing feed. marketing_engagement is insert-only."""

import os

import psycopg
from psycopg.rows import dict_row

from engine import COLUMNS

SCHEMA = os.environ.get("FEED_SCHEMA", "Fins")

CAMPAIGN_COLUMNS = ("campaign_key", "campaign_id", "campaign_name", "audience_source", "target",
                    "audience_rule", "product_name", "product_category", "start_date", "end_date",
                    "template_key", "crm_state")
SETTABLE = {"campaign_id", "crm_state"}
TABLES = ("marketing_engagement", "marketing_campaign", "marketing_campaign_template", "marketing_feed_run")


def t(name):
    return f'"{SCHEMA}".{name}'


def connect():
    """DATABASE_URL on Heroku; otherwise Heroku_PG_* from .env (ME_ENV_FILE or repo root)."""
    url = os.environ.get("DATABASE_URL")
    if url:
        return psycopg.connect(url, sslmode="require", autocommit=True)
    env = os.environ.get("ME_ENV_FILE") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env")
    cfg = {k.strip(): v.strip().strip("'\"") for k, v in
           (l.split("=", 1) for l in open(env) if "=" in l and not l.lstrip().startswith("#"))}
    return psycopg.connect(
        host=cfg["Heroku_PG_Host"], port=cfg["Heroku_PG_Port"], dbname=cfg["Heroku_PG_Database"],
        user=cfg["Heroku_PG_User"], password=cfg["Heroku_PG_Password"], sslmode="require", autocommit=True)


def insert_events(conn, rows, dry_run=False):
    """Insert rows whose engagement_id is new; existing rows are never touched. Returns the new-row count."""
    cols = ", ".join(COLUMNS)
    with conn.transaction(force_rollback=dry_run):
        conn.execute(f"CREATE TEMP TABLE stage (LIKE {t('marketing_engagement')}) ON COMMIT DROP")
        with conn.cursor().copy(f"COPY stage ({cols}) FROM STDIN") as cp:
            for r in rows:
                cp.write_row(r)
        if dry_run:
            return conn.execute(
                f"SELECT count(DISTINCT engagement_id) FROM stage s WHERE NOT EXISTS "
                f"(SELECT 1 FROM {t('marketing_engagement')} e WHERE e.engagement_id = s.engagement_id)").fetchone()[0]
        return conn.execute(
            f"INSERT INTO {t('marketing_engagement')} ({cols}) SELECT {cols} FROM stage "
            "ON CONFLICT (engagement_id) DO NOTHING").rowcount


def campaigns(conn, state=None):
    q = f"SELECT {', '.join(CAMPAIGN_COLUMNS)} FROM {t('marketing_campaign')}"
    q += " WHERE crm_state = %s" if state else ""
    return conn.cursor(row_factory=dict_row).execute(q + " ORDER BY start_date, campaign_key",
                                                     (state,) if state else ()).fetchall()


def insert_campaign(conn, c):
    cols = [k for k in CAMPAIGN_COLUMNS if k in c]
    q = (f"INSERT INTO {t('marketing_campaign')} ({', '.join(cols)}) VALUES ({', '.join(['%s'] * len(cols))}) "
         "ON CONFLICT (campaign_key) DO NOTHING")
    return conn.execute(q, [c[k] for k in cols]).rowcount == 1


def set_campaign(conn, key, **fields):
    """Update campaign_id / crm_state and stamp crm_checked_at."""
    if not set(fields) <= SETTABLE:
        raise ValueError(f"Not settable: {set(fields) - SETTABLE}")
    sets = [f"{k} = %s" for k in fields] + ["crm_checked_at = (now() AT TIME ZONE 'utc')"]
    conn.execute(f"UPDATE {t('marketing_campaign')} SET {', '.join(sets)} WHERE campaign_key = %s",
                 [*fields.values(), key])


def templates(conn):
    return conn.cursor(row_factory=dict_row).execute(
        f"SELECT * FROM {t('marketing_campaign_template')} WHERE active ORDER BY template_key").fetchall()


def sent_counts(conn):
    return dict(conn.execute(
        f"SELECT campaign_id, count(*) FROM {t('marketing_engagement')} "
        "WHERE audience_source = 'Segment' AND engagement_type = 'Sent' GROUP BY campaign_id").fetchall())


def stored_sends(conn, campaign_ids):
    """send_id -> set of engagement types already stored, for these campaigns."""
    out = {}
    for send_id, kind in conn.execute(
            f"SELECT DISTINCT send_id, engagement_type FROM {t('marketing_engagement')} "
            "WHERE campaign_id = ANY(%s)", (list(campaign_ids),)).fetchall():
        out.setdefault(send_id, set()).add(kind)
    return out


def try_lock(conn):
    """Session advisory lock so overlapping feed runs (Scheduler double-fire, manual run) don't race."""
    return conn.execute("SELECT pg_try_advisory_lock(hashtext(%s))", (f"marketing_feed:{SCHEMA}",)).fetchone()[0]


def covered_accounts(conn):
    return {r[0] for r in conn.execute(
        f"SELECT DISTINCT account_id FROM {t('marketing_engagement')} WHERE engagement_type = 'Sent'").fetchall()}


def log_run(conn, step, status, campaigns=0, rows_inserted=0, detail=None, run_at=None):
    """run_at defaults to the DB clock; feed.run passes its own `now` so --now runs log consistently."""
    conn.execute(f"INSERT INTO {t('marketing_feed_run')} (run_at, step, status, campaigns, rows_inserted, detail) "
                 "VALUES (coalesce(%s, now() AT TIME ZONE 'utc'), %s, %s, %s, %s, %s)",
                 (run_at, step, status, campaigns, rows_inserted, detail))


def last_success(conn, step):
    return conn.execute(f"SELECT max(run_at) FROM {t('marketing_feed_run')} WHERE step = %s AND status = 'ok'",
                        (step,)).fetchone()[0]


def table_counts(conn):
    return {name: conn.execute(f"SELECT count(*) FROM {t(name)}").fetchone()[0] for name in TABLES}
