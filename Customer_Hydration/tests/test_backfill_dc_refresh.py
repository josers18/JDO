"""Tests for the Phase 4d DC stream refresh trigger (spec §6.2 row 'DC stream is refreshMode UPSERT')."""
from unittest.mock import MagicMock, patch

import pytest

from customer_hydration.backfill.dc_refresh import (
    DEFAULT_ACCOUNT_STREAM_NAME,
    refresh_account_stream,
)


def test_default_account_stream_name():
    """Sane default that operators can override via --account-stream flag if needed."""
    assert DEFAULT_ACCOUNT_STREAM_NAME == "Account_jdo"


@patch("customer_hydration.backfill.dc_refresh.get_org_session")
@patch("customer_hydration.backfill.dc_refresh.trigger_stream_refresh")
def test_refresh_account_stream_calls_trigger_with_resolved_creds(
    mock_trigger, mock_get_session,
):
    mock_get_session.return_value = ("https://example.my.salesforce.com", "TOKEN_X")
    mock_trigger.return_value = (True, "07Lxx00000004XY", None)
    status, run_id, fallback = refresh_account_stream(
        target_org="mock", stream_name="Account_jdo",
    )
    assert status == "Triggered"
    assert run_id == "07Lxx00000004XY"
    assert fallback is None
    mock_trigger.assert_called_once_with(
        "https://example.my.salesforce.com", "TOKEN_X", "Account_jdo",
    )


@patch("customer_hydration.backfill.dc_refresh.get_org_session")
@patch("customer_hydration.backfill.dc_refresh.trigger_stream_refresh")
def test_refresh_account_stream_412_returns_ui_fallback_message(
    mock_trigger, mock_get_session,
):
    """HTTP 412 from actions/run → status='PolicySkipped' + fallback message."""
    mock_get_session.return_value = ("https://example.my.salesforce.com", "TOKEN_X")
    mock_trigger.return_value = (
        False, None,
        "412 Precondition Failed: stream is in UPSERT refresh mode",
    )
    status, run_id, fallback = refresh_account_stream(
        target_org="mock", stream_name="Account_jdo",
    )
    assert status == "PolicySkipped"
    assert run_id is None
    assert "dc-stream-full-refresh-via-ui" in fallback


@patch("customer_hydration.backfill.dc_refresh.get_org_session")
@patch("customer_hydration.backfill.dc_refresh.trigger_stream_refresh")
def test_refresh_account_stream_404_returns_skipped(
    mock_trigger, mock_get_session,
):
    """Stream not found → status='Skipped' + nudge in fallback message."""
    mock_get_session.return_value = ("https://example.my.salesforce.com", "TOKEN_X")
    mock_trigger.return_value = (False, None, "404 Not Found")
    status, run_id, fallback = refresh_account_stream(
        target_org="mock", stream_name="DoesNotExist",
    )
    assert status == "Skipped"
    assert run_id is None
    assert "DoesNotExist" in fallback


@patch("customer_hydration.backfill.dc_refresh.get_org_session")
def test_refresh_account_stream_session_error_returns_skipped(mock_get_session):
    """If get_org_session raises, refresh is skipped — don't fail the run."""
    mock_get_session.side_effect = RuntimeError("sf org display failed")
    status, run_id, fallback = refresh_account_stream(
        target_org="mock", stream_name="Account_jdo",
    )
    assert status == "Skipped"
    assert run_id is None
    assert "sf org display failed" in fallback


@patch("customer_hydration.backfill.dc_refresh.get_org_session")
@patch("customer_hydration.backfill.dc_refresh.trigger_stream_refresh")
def test_refresh_account_stream_other_failure_returns_failed(
    mock_trigger, mock_get_session,
):
    """500 or other non-policy failure → status='Failed'."""
    mock_get_session.return_value = ("https://example.my.salesforce.com", "TOKEN_X")
    mock_trigger.return_value = (False, None, "500 Internal Server Error")
    status, run_id, fallback = refresh_account_stream(
        target_org="mock", stream_name="Account_jdo",
    )
    assert status == "Failed"
    assert run_id is None
    assert "500" in fallback
