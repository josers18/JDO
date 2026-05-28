"""L1 tests for the coverage assertion helper.

We mock the snowpark Session so this is a pure-function test.
"""
from unittest.mock import MagicMock
import pytest

from cumulus_common.coverage import assert_coverage


def _mock_session(values):
    """Build a session whose .sql(...).collect()[0][0] returns values in order."""
    session = MagicMock()
    calls = iter(values)
    def sql(_sql_str):
        result = MagicMock()
        result.collect.return_value = [(next(calls),)]
        return result
    session.sql.side_effect = sql
    return session


def test_assert_coverage_passes_when_actual_equals_expected():
    """100 expected, 100 actual → no error."""
    session = _mock_session([100, 100])  # expected_sql returns 100, actual_sql returns 100
    assert_coverage(
        session,
        expected_sql="SELECT COUNT(*) FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS WHERE ACCOUNT_TYPE_FLAG='PERSON'",
        actual_sql="SELECT COUNT(DISTINCT ACCOUNT_ID) FROM FINS.PUBLIC.CLARITAS_DEMOGRAPHICS",
    )  # no raise


def test_assert_coverage_passes_when_actual_exceeds_expected():
    """If we wrote MORE rows than expected (e.g. 1:N tables), still passes."""
    session = _mock_session([100, 250])
    assert_coverage(
        session,
        expected_sql="SELECT COUNT(*) FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS WHERE ...",
        actual_sql="SELECT COUNT(DISTINCT ACCOUNT_ID) FROM FINS.PUBLIC.PLAID_HELD_AWAY",
    )  # no raise


def test_assert_coverage_fails_with_canonical_message_format():
    """Coverage gap → RuntimeError with 'coverage gap: N missing rows' prefix."""
    session = _mock_session([100, 95])
    with pytest.raises(RuntimeError, match=r"^coverage gap: 5 missing rows"):
        assert_coverage(
            session,
            expected_sql="SELECT COUNT(*) FROM FINS.PUBLIC.V_ACCOUNT_ANCHORS WHERE ACCOUNT_TYPE_FLAG='PERSON'",
            actual_sql="SELECT COUNT(DISTINCT ACCOUNT_ID) FROM FINS.PUBLIC.CLARITAS_DEMOGRAPHICS",
        )


def test_assert_coverage_message_includes_expected_and_actual():
    """The error message should include both numbers for debugging."""
    session = _mock_session([1000, 800])
    with pytest.raises(RuntimeError) as exc_info:
        assert_coverage(
            session,
            expected_sql="SELECT 1000",
            actual_sql="SELECT 800",
        )
    msg = str(exc_info.value)
    assert "1000" in msg
    assert "800" in msg
    assert msg.startswith("coverage gap:")


def test_assert_coverage_zero_audience_is_not_a_gap():
    """Empty audience (0 expected, 0 actual) is the empty-audience warning case,
    not a coverage gap. The SP handles the warning separately; this helper
    just shouldn't raise."""
    session = _mock_session([0, 0])
    assert_coverage(
        session,
        expected_sql="SELECT 0",
        actual_sql="SELECT 0",
    )  # no raise
