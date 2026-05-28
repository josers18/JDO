"""Coverage assertion shared by every Cumulus dataset generator.

The canonical assertion: after MERGE-ing data into a dataset table,
verify that every account in the audience has at least one row. If
fewer accounts have rows than the audience size, raise RuntimeError
with a message matching ``coverage gap: N missing rows ...`` so the
daily email taxonomy (spec §6.2) can filter on the prefix.

Used by every dataset's stored procedure step 4.
"""
from __future__ import annotations

from typing import Any


def assert_coverage(session: Any, expected_sql: str, actual_sql: str) -> None:
    """Verify ``actual_sql`` returns at least ``expected_sql`` rows.

    Args:
        session: A snowflake.snowpark.Session (or duck type with
            ``session.sql(query).collect()`` returning a list of rows).
        expected_sql: A SQL string returning the audience cardinality
            (one int in row 0, column 0).
        actual_sql: A SQL string returning the realized row cardinality
            in the dataset table (one int in row 0, column 0).

    Raises:
        RuntimeError: if ``actual < expected``. Message format is
            ``"coverage gap: <missing> missing rows (expected <e>, got <a>)"``
            so the email taxonomy can filter on the ``"coverage gap:"`` prefix.
    """
    expected = session.sql(expected_sql).collect()[0][0]
    actual = session.sql(actual_sql).collect()[0][0]
    if actual < expected:
        missing = expected - actual
        raise RuntimeError(
            f"coverage gap: {missing} missing rows (expected {expected}, got {actual})"
        )
