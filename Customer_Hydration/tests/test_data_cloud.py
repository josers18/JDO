"""Tests for customer_hydration.phase5.data_cloud.

Mocks ``subprocess.run`` (for ``sf org display``) and
``urllib.request.urlopen`` (for the Data Cloud REST endpoints) at the
module boundary.
"""
from __future__ import annotations

import io
import json
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError

import pytest

from customer_hydration.phase5 import data_cloud
from customer_hydration.phase5.data_cloud import (
    DataCloudStreamRefreshResult,
    StreamInfo,
    StreamRunResult,
    execute_phase5_5,
    get_org_session,
    list_streams,
    trigger_stream_refresh,
)


def _proc(*, returncode: int = 0, stdout: str = "", stderr: str = "") -> SimpleNamespace:
    return SimpleNamespace(returncode=returncode, stdout=stdout, stderr=stderr)


def _fake_urlopen_response(payload: dict | bytes) -> MagicMock:
    """Build a context-manager-style mock response that returns ``payload`` bytes."""
    if isinstance(payload, dict):
        body = json.dumps(payload).encode("utf-8")
    else:
        body = payload
    resp = MagicMock()
    resp.read.return_value = body
    resp.__enter__ = MagicMock(return_value=resp)
    resp.__exit__ = MagicMock(return_value=False)
    return resp


# --------------------------------------------------------------------------
# get_org_session
# --------------------------------------------------------------------------

def test_get_org_session_returns_url_and_token():
    payload = {
        "result": {
            "instanceUrl": "https://example.my.salesforce.com",
            "accessToken": "00DXXXXXXXXX!ABCDEFGHIJK",
            "username": "user@example.com",
        }
    }
    fake = _proc(returncode=0, stdout=json.dumps(payload))
    with patch.object(data_cloud.subprocess, "run", return_value=fake):
        url, token = get_org_session("my-org")
    assert url == "https://example.my.salesforce.com"
    assert token == "00DXXXXXXXXX!ABCDEFGHIJK"


def test_get_org_session_raises_on_subprocess_failure():
    fake = _proc(returncode=1, stdout="", stderr="No such target-org: my-org")
    with patch.object(data_cloud.subprocess, "run", return_value=fake):
        with pytest.raises(RuntimeError, match="sf org display failed"):
            get_org_session("my-org")


def test_get_org_session_raises_when_payload_missing_token():
    payload = {"result": {"instanceUrl": "https://example.my.salesforce.com"}}
    fake = _proc(returncode=0, stdout=json.dumps(payload))
    with patch.object(data_cloud.subprocess, "run", return_value=fake):
        with pytest.raises(RuntimeError, match="instanceUrl/accessToken"):
            get_org_session("my-org")


# --------------------------------------------------------------------------
# list_streams
# --------------------------------------------------------------------------

def test_list_streams_returns_stream_info_objects():
    payload = {
        "dataStreams": [
            {
                "apiName": "Stream_Account__dlm",
                "sourceObject": "Account",
                "label": "Account stream",
            },
            {
                "apiName": "Stream_Contact__dlm",
                "sourceObject": "Contact",
                "label": "Contact stream",
            },
            {
                "apiName": "Stream_Opp__dlm",
                "sourceObject": "Opportunity",
                "label": "Opp stream",
            },
        ]
    }
    resp = _fake_urlopen_response(payload)
    with patch("urllib.request.urlopen", return_value=resp):
        streams = list_streams("https://example.my.salesforce.com", "tok")
    assert len(streams) == 3
    assert all(isinstance(s, StreamInfo) for s in streams)
    assert {s.source_object for s in streams} == {"Account", "Contact", "Opportunity"}
    assert streams[0].api_name == "Stream_Account__dlm"
    assert streams[0].label == "Account stream"


def test_list_streams_handles_alt_response_shape():
    """`streams` key + nested `source.apiName` shape works too."""
    payload = {
        "streams": [
            {
                "name": "Stream_Case__dlm",
                "source": {"apiName": "Case"},
                "MasterLabel": "Case stream",
            },
            {
                "DataStreamApiName": "Stream_Task__dlm",
                "sourceObjectApiName": "Task",
            },
        ]
    }
    resp = _fake_urlopen_response(payload)
    with patch("urllib.request.urlopen", return_value=resp):
        streams = list_streams("https://example.my.salesforce.com", "tok")
    assert len(streams) == 2
    by_name = {s.api_name: s for s in streams}
    assert by_name["Stream_Case__dlm"].source_object == "Case"
    assert by_name["Stream_Case__dlm"].label == "Case stream"
    assert by_name["Stream_Task__dlm"].source_object == "Task"


def test_list_streams_extracts_connector_type_from_connectorInfo():
    """Live API shape: top-level sourceObject is absent; connectorInfo.connectorType
    indicates the upstream system and connectorDetails.name disambiguates
    own-source vs federation streams. The parser must populate both
    ``StreamInfo.connector_type`` and ``StreamInfo.connector_name`` and leave
    ``source_object`` empty."""
    payload = {
        "dataStreams": [
            {
                "name": "Account_Home",
                "label": "Account Home",
                "connectorInfo": {
                    "connectorType": "SalesforceDotCom",
                    "connectorDetails": {"name": "SalesforceDotCom_Home"},
                },
                "dataLakeObjectInfo": {
                    "name": "Account_Home__dll",
                    "label": "Account_Home",
                },
                "lastRunStatus": "SUCCESS",
                "status": "ACTIVE",
                "totalRecords": 0,
            },
        ]
    }
    resp = _fake_urlopen_response(payload)
    with patch("urllib.request.urlopen", return_value=resp):
        streams = list_streams("https://example.my.salesforce.com", "tok")
    assert len(streams) == 1
    assert streams[0].api_name == "Account_Home"
    assert streams[0].connector_type == "SalesforceDotCom"
    assert streams[0].connector_name == "SalesforceDotCom_Home"
    assert streams[0].source_object == ""
    assert streams[0].label == "Account Home"


# --------------------------------------------------------------------------
# trigger_stream_refresh
# --------------------------------------------------------------------------

def test_trigger_stream_refresh_returns_run_id():
    """v62.0 actions/run endpoint (per Connect API spec); response shape is
    DataStreamActionResponseRepresentation — extract dataStreamRunId
    preferentially."""
    payload = {"dataStreamRunId": "0d3000000ABCDEAA1", "status": "Queued"}
    resp = _fake_urlopen_response(payload)
    captured: dict = {}

    def _capture(req, timeout=30):  # noqa: ARG001
        captured["url"] = req.full_url
        captured["method"] = req.get_method()
        return resp

    with patch("urllib.request.urlopen", side_effect=_capture):
        ok, run_id, err = trigger_stream_refresh(
            "https://example.my.salesforce.com",
            "tok",
            "Stream_Account__dlm",
        )
    assert ok is True
    assert run_id == "0d3000000ABCDEAA1"
    assert err is None
    assert captured["method"] == "POST"
    assert (
        captured["url"]
        == "https://example.my.salesforce.com/services/data/v62.0"
        "/ssot/data-streams/Stream_Account__dlm/actions/run?interactive=true"
    )


def test_trigger_stream_refresh_handles_http_error():
    """Non-policy HTTP errors (e.g. 5xx) are surfaced as 'HTTP <code>: <body>'."""
    err = HTTPError(
        url="https://example.my.salesforce.com/...",
        code=500,
        msg="Server Error",
        hdrs=None,  # type: ignore[arg-type]
        fp=io.BytesIO(b'{"errorCode":"INTERNAL"}'),
    )
    with patch("urllib.request.urlopen", side_effect=err):
        ok, run_id, err_str = trigger_stream_refresh(
            "https://example.my.salesforce.com",
            "tok",
            "Stream_Missing__dlm",
        )
    assert ok is False
    assert run_id is None
    assert err_str is not None
    assert err_str.startswith("HTTP 500")
    assert not err_str.startswith("policy:")


def test_trigger_stream_refresh_returns_policy_message_on_400_non_interactive():
    """Org-policy rejection: SalesforceDotCom connectors require interactive mode.
    Live response observed against jdo-fw51xz (2026-05-22)."""
    body = (
        b'[{"errorCode":"DATACLOUD_API_CLIENT_EXCEPTION",'
        b'"message":"Connector type SalesforceDotCom is not allowed to run in '
        b'non-interactive mode"}]'
    )
    err = HTTPError(
        url="https://example.my.salesforce.com/...",
        code=400,
        msg="Bad Request",
        hdrs=None,  # type: ignore[arg-type]
        fp=io.BytesIO(body),
    )
    with patch("urllib.request.urlopen", side_effect=err):
        ok, run_id, err_str = trigger_stream_refresh(
            "https://example.my.salesforce.com",
            "tok",
            "Stream_Account__dlm",
        )
    assert ok is False
    assert run_id is None
    assert err_str is not None
    assert err_str.startswith("policy:")
    assert "non-interactive" in err_str


def test_trigger_stream_refresh_returns_policy_message_on_412_full_refresh():
    """Org-policy rejection: only FULL_REFRESH-mode streams may be manually
    triggered in interactive mode. Live response observed against
    jdo-fw51xz (2026-05-22)."""
    body = (
        b'[{"errorCode":"DATACLOUD_API_CLIENT_EXCEPTION",'
        b'"message":"Data Stream id 0xS000000ABCDE is not allowed to run in '
        b'interactive mode if refresh mode is not FULL_REFRESH"}]'
    )
    err = HTTPError(
        url="https://example.my.salesforce.com/...",
        code=412,
        msg="Precondition Failed",
        hdrs=None,  # type: ignore[arg-type]
        fp=io.BytesIO(body),
    )
    with patch("urllib.request.urlopen", side_effect=err):
        ok, run_id, err_str = trigger_stream_refresh(
            "https://example.my.salesforce.com",
            "tok",
            "Stream_Account__dlm",
        )
    assert ok is False
    assert run_id is None
    assert err_str is not None
    assert err_str.startswith("policy:")
    assert "FULL_REFRESH" in err_str


def test_trigger_stream_refresh_returns_policy_message_on_412_inactive_status():
    """Org-policy rejection: stream not in ACTIVE/PROCESSING state. Live
    response observed against jdo-fw51xz (2026-05-22) for a stream whose
    status was DRAFT/ERROR."""
    body = (
        b'[{"errorCode":"DATACLOUD_API_CLIENT_EXCEPTION",'
        b'"message":"Data Stream status must be ACTIVE or PROCESSING"}]'
    )
    err = HTTPError(
        url="https://example.my.salesforce.com/...",
        code=412,
        msg="Precondition Failed",
        hdrs=None,  # type: ignore[arg-type]
        fp=io.BytesIO(body),
    )
    with patch("urllib.request.urlopen", side_effect=err):
        ok, run_id, err_str = trigger_stream_refresh(
            "https://example.my.salesforce.com",
            "tok",
            "Stream_Account__dlm",
        )
    assert ok is False
    assert run_id is None
    assert err_str is not None
    assert err_str.startswith("policy:")
    assert "ACTIVE" in err_str


# --------------------------------------------------------------------------
# execute_phase5_5
# --------------------------------------------------------------------------

def test_execute_phase5_5_skips_streams_with_unmatched_source_object():
    """Only streams whose source_object is in the allowlist get triggered."""
    org_payload = {
        "result": {
            "instanceUrl": "https://example.my.salesforce.com",
            "accessToken": "tok",
        }
    }
    streams_payload = {
        "dataStreams": [
            {"apiName": "Stream_Account__dlm", "sourceObject": "Account"},
            {"apiName": "Stream_Custom__dlm", "sourceObject": "MyCustom__c"},  # NOT in allowlist
            {"apiName": "Stream_Contact__dlm", "sourceObject": "Contact"},
        ]
    }
    refresh_payload = {"runId": "0d3000FAKE"}

    sf_proc = _proc(returncode=0, stdout=json.dumps(org_payload))

    # urlopen first returns the list, then refresh once per match
    list_resp = _fake_urlopen_response(streams_payload)
    refresh_resp_1 = _fake_urlopen_response(refresh_payload)
    refresh_resp_2 = _fake_urlopen_response(refresh_payload)

    with patch.object(data_cloud.subprocess, "run", return_value=sf_proc):
        with patch(
            "urllib.request.urlopen",
            side_effect=[list_resp, refresh_resp_1, refresh_resp_2],
        ):
            result = execute_phase5_5(target_org="my-org")

    assert isinstance(result, DataCloudStreamRefreshResult)
    assert result.streams_discovered == 3
    assert result.streams_matched == 2
    assert result.streams_triggered == 2
    triggered_names = {r.stream_api_name for r in result.stream_runs}
    assert "Stream_Account__dlm" in triggered_names
    assert "Stream_Contact__dlm" in triggered_names
    assert "Stream_Custom__dlm" not in triggered_names
    assert all(r.status == "Triggered" for r in result.stream_runs)
    assert result.stream_trigger_failures == []


def test_execute_phase5_5_matches_only_own_source_dotcom_home_connector():
    """Live API shape regression: when no top-level ``sourceObject`` is
    present, only streams whose ``connectorInfo.connectorDetails.name ==
    "SalesforceDotCom_Home"`` (i.e. the org's OWN data) must be matched
    and triggered. External federation streams from other orgs (e.g.
    ``SalesforceDotCom_FinsDC1``) and non-SFDC connector types
    (e.g. SNOWFLAKE) must NOT be triggered, even if ``connectorType ==
    "SalesforceDotCom"``."""
    org_payload = {
        "result": {
            "instanceUrl": "https://example.my.salesforce.com",
            "accessToken": "tok",
        }
    }
    streams_payload = {
        "dataStreams": [
            {
                "name": "Account_Home",
                "label": "Account Home",
                "connectorInfo": {
                    "connectorType": "SalesforceDotCom",
                    "connectorDetails": {"name": "SalesforceDotCom_Home"},
                },
            },
            {
                "name": "Account_FinsDC1",
                "label": "Account FinsDC1 (federation)",
                "connectorInfo": {
                    "connectorType": "SalesforceDotCom",
                    "connectorDetails": {"name": "SalesforceDotCom_FinsDC1"},
                },
            },
            {
                "name": "Activities_Snow",
                "label": "Activities Snowflake",
                "connectorInfo": {
                    "connectorType": "SNOWFLAKE",
                    "connectorDetails": {"name": "Snowflake_Default"},
                },
            },
        ]
    }
    refresh_payload = {"runId": "0d3000FAKE"}

    sf_proc = _proc(returncode=0, stdout=json.dumps(org_payload))
    list_resp = _fake_urlopen_response(streams_payload)
    refresh_resp_1 = _fake_urlopen_response(refresh_payload)

    with patch.object(data_cloud.subprocess, "run", return_value=sf_proc):
        with patch(
            "urllib.request.urlopen",
            side_effect=[list_resp, refresh_resp_1],
        ):
            result = execute_phase5_5(target_org="my-org")

    assert result.streams_discovered == 3
    assert result.streams_matched == 1
    assert result.streams_triggered == 1
    triggered_names = {r.stream_api_name for r in result.stream_runs}
    assert "Account_Home" in triggered_names
    assert "Account_FinsDC1" not in triggered_names
    assert "Activities_Snow" not in triggered_names
    assert all(r.status == "Triggered" for r in result.stream_runs)
    assert result.stream_trigger_failures == []


def test_execute_phase5_5_records_failures_does_not_raise():
    """A non-policy trigger failure (e.g. HTTP 500) is logged on the result,
    counted as a real failure, and never raised."""
    org_payload = {
        "result": {
            "instanceUrl": "https://example.my.salesforce.com",
            "accessToken": "tok",
        }
    }
    streams_payload = {
        "dataStreams": [
            {"apiName": "Stream_Account__dlm", "sourceObject": "Account"},
        ]
    }
    sf_proc = _proc(returncode=0, stdout=json.dumps(org_payload))
    list_resp = _fake_urlopen_response(streams_payload)
    refresh_err = HTTPError(
        url="https://example.my.salesforce.com/...",
        code=500,
        msg="Server error",
        hdrs=None,  # type: ignore[arg-type]
        fp=io.BytesIO(b"{}"),
    )

    with patch.object(data_cloud.subprocess, "run", return_value=sf_proc):
        with patch(
            "urllib.request.urlopen",
            side_effect=[list_resp, refresh_err],
        ):
            # Must NOT raise
            result = execute_phase5_5(target_org="my-org")

    assert result.streams_discovered == 1
    assert result.streams_matched == 1
    assert result.streams_triggered == 0
    assert result.streams_policy_skipped == 0
    assert len(result.stream_runs) == 1
    assert result.stream_runs[0].status == "Failed"
    assert result.stream_runs[0].run_id is None
    assert len(result.stream_trigger_failures) == 1
    assert "Stream_Account__dlm" in result.stream_trigger_failures[0]


def test_execute_phase5_5_counts_policy_skips_separately():
    """Org-policy rejections (e.g. non-interactive on SalesforceDotCom) are
    counted in ``streams_policy_skipped`` and recorded with status
    ``PolicySkipped`` — they MUST NOT inflate ``stream_trigger_failures``."""
    org_payload = {
        "result": {
            "instanceUrl": "https://example.my.salesforce.com",
            "accessToken": "tok",
        }
    }
    streams_payload = {
        "dataStreams": [
            {"apiName": "Stream_Account__dlm", "sourceObject": "Account"},
        ]
    }
    sf_proc = _proc(returncode=0, stdout=json.dumps(org_payload))
    list_resp = _fake_urlopen_response(streams_payload)
    body = (
        b'[{"errorCode":"DATACLOUD_API_CLIENT_EXCEPTION",'
        b'"message":"Connector type SalesforceDotCom is not allowed to run in '
        b'non-interactive mode"}]'
    )
    policy_err = HTTPError(
        url="https://example.my.salesforce.com/...",
        code=400,
        msg="Bad Request",
        hdrs=None,  # type: ignore[arg-type]
        fp=io.BytesIO(body),
    )

    with patch.object(data_cloud.subprocess, "run", return_value=sf_proc):
        with patch(
            "urllib.request.urlopen",
            side_effect=[list_resp, policy_err],
        ):
            result = execute_phase5_5(target_org="my-org")

    assert result.streams_discovered == 1
    assert result.streams_matched == 1
    assert result.streams_triggered == 0
    assert result.streams_policy_skipped == 1
    assert result.stream_trigger_failures == []
    assert len(result.stream_runs) == 1
    assert result.stream_runs[0].status == "PolicySkipped"
    assert result.stream_runs[0].run_id is None
    assert result.stream_runs[0].error is not None
    assert result.stream_runs[0].error.startswith("policy:")


def test_execute_phase5_5_returns_zero_counts_when_org_session_fails():
    """If get_org_session raises (e.g. wrong target-org), result has zero counts
    and a single trigger_failure entry — never raises."""
    sf_proc = _proc(returncode=1, stdout="", stderr="No such target-org")
    with patch.object(data_cloud.subprocess, "run", return_value=sf_proc):
        # urlopen should not even be called, but patch it just to be sure
        # we'd notice if it were invoked.
        with patch("urllib.request.urlopen") as urlopen_mock:
            result = execute_phase5_5(target_org="bogus-org")
    urlopen_mock.assert_not_called()
    assert result.streams_discovered == 0
    assert result.streams_matched == 0
    assert result.streams_triggered == 0
    assert result.stream_runs == []
    assert len(result.stream_trigger_failures) == 1
    assert "get_org_session" in result.stream_trigger_failures[0]
