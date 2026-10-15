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
    conn.execute(f'DROP SCHEMA IF EXISTS "{TEST_SCHEMA}" CASCADE')
    migrate.apply_sql(conn)
    yield conn
    conn.execute(f'DROP SCHEMA IF EXISTS "{TEST_SCHEMA}" CASCADE')
    conn.close()
