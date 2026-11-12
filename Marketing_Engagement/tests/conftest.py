import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest

TEST_SCHEMA = "fins_feed_test"


@pytest.fixture
def pg(monkeypatch):
    """Fresh scratch schema with all sql/*.sql applied. Dropped afterwards (test schema only)."""
    import db
    import migrate
    try:
        conn = db.connect()
    except Exception as e:  # no creds available
        pytest.skip(f"Postgres unavailable: {e}")
    monkeypatch.setattr(db, "SCHEMA", TEST_SCHEMA)
    # Feed runs at/after 15:00 UTC reach the weekly browsing step; never send real beacons from tests.
    import web_browsing
    monkeypatch.setattr(web_browsing, "send", lambda plan, **kw: sum(len(loads) for _d, _c, loads in plan))
    # The feed's sn_dmo_check asks Data Cloud for its count; tests mirror the scratch table instead.
    import service_now
    monkeypatch.setattr(service_now, "dmo_count", lambda dc_sql: conn.execute(
        f"SELECT count(*) FROM {db.t(service_now.TABLE)}").fetchone()[0])
    conn.execute(f'DROP SCHEMA IF EXISTS "{TEST_SCHEMA}" CASCADE')
    migrate.apply_sql(conn)
    yield conn
    conn.execute(f'DROP SCHEMA IF EXISTS "{TEST_SCHEMA}" CASCADE')
    conn.close()
