"""Unit tests for Phase 2 segment REST methods on phase5/data_cloud.py.

These tests cover the live-verified payload schema discovered during the
Task 10 smoke run against jdo-uqj0jr (2026-05-22):

    POST /services/data/v60.0/ssot/segments
    {
      "displayName": ...,
      "developerName": ...,
      "segmentOnApiName": "Account_demo__dlm",
      "segmentType": "Dynamic",
      "publishSchedule": "NoRefresh|One|...",
      "description": ...,
      "includeCriteria": "<stringified JSON DSL>",
    }

Dynamic segments cannot be PATCHed (ENTITY_SAVE_ERROR — only Dbt and
Lookalike support update), so patch_segment has been removed.
"""
from __future__ import annotations

import io
import json
from unittest.mock import patch, MagicMock

import pytest

from customer_hydration.phase5.data_cloud import (
    SegmentInfo,
    SegmentStatus,
    list_segments,
    create_segment,
    publish_segment,
    get_segment_status,
)


def _mock_response(payload: dict) -> MagicMock:
    """Build a mock response object for urllib.request.urlopen."""
    body = json.dumps(payload).encode("utf-8")
    resp = MagicMock()
    resp.read.return_value = body
    resp.__enter__.return_value = resp
    resp.__exit__.return_value = False
    return resp


class TestSegmentInfoDataclass:
    def test_required_fields(self):
        s = SegmentInfo(
            api_name="RetailAll__seg",
            display_name="Retail Customers",
            description="All retail customers",
            target_dmo="Account_demo__dlm",
            publish_schedule="One",
        )
        assert s.api_name == "RetailAll__seg"
        assert s.target_dmo == "Account_demo__dlm"


class TestSegmentStatusDataclass:
    def test_default_member_count_none(self):
        s = SegmentStatus(api_name="X__seg", status="DRAFT", member_count=None,
                          last_publish_time=None)
        assert s.member_count is None
        assert s.error is None


class TestListSegments:
    @patch("urllib.request.urlopen")
    def test_returns_segments_from_data_streams_response(self, mock_urlopen):
        mock_urlopen.return_value = _mock_response({
            "segments": [
                {"apiName": "RetailAll__seg", "displayName": "Retail Customers",
                 "description": "All retail", "targetDmo": "Account_demo__dlm",
                 "publishSchedule": "One"},
                {"apiName": "WealthAll__seg", "displayName": "Wealth Clients",
                 "description": "All wealth", "targetDmo": "Account_demo__dlm",
                 "publishSchedule": "One"},
            ]
        })
        segs = list_segments("https://example.my.salesforce.com", "tok")
        assert len(segs) == 2
        assert segs[0].api_name == "RetailAll__seg"
        assert segs[1].display_name == "Wealth Clients"

    @patch("urllib.request.urlopen")
    def test_empty_response_returns_empty_list(self, mock_urlopen):
        mock_urlopen.return_value = _mock_response({"segments": []})
        segs = list_segments("https://example.my.salesforce.com", "tok")
        assert segs == []

    @patch("urllib.request.urlopen")
    def test_uses_authorization_bearer_header(self, mock_urlopen):
        mock_urlopen.return_value = _mock_response({"segments": []})
        list_segments("https://example.my.salesforce.com", "abc123")
        request = mock_urlopen.call_args[0][0]
        assert request.headers.get("Authorization") == "Bearer abc123"


class TestCreateSegment:
    @patch("urllib.request.urlopen")
    def test_returns_success_and_api_name(self, mock_urlopen):
        # Live API returns the new segment with apiName populated
        mock_urlopen.return_value = _mock_response({
            "apiName": "RetailAll__seg",
            "id": "0sX...",
        })
        ok, sid = create_segment(
            "https://example.my.salesforce.com", "tok",
            developer_name="RetailAll",
            display_name="Retail Customers",
            description="All retail",
            segment_on_api_name="Account_demo__dlm",
            include_criteria={
                "type": "TextComparison",
                "subject": {
                    "objectApiName": "Account_demo__dlm",
                    "fieldApiName": "FinServ_ClientCategory_c__c",
                },
                "operator": "equals",
                "values": ["Retail"],
            },
            publish_schedule="One",
        )
        assert ok is True
        # Returned identifier should be the apiName when present
        assert sid == "RetailAll__seg"

    @patch("urllib.request.urlopen")
    def test_payload_uses_new_field_names(self, mock_urlopen):
        mock_urlopen.return_value = _mock_response({"apiName": "X__seg"})
        criteria = {
            "type": "TextComparison",
            "subject": {"objectApiName": "Account_demo__dlm",
                        "fieldApiName": "External_ID_c__c"},
            "operator": "contains",
            "values": ["HYDRATE-"],
        }
        create_segment(
            "https://x.salesforce.com", "tok",
            developer_name="HydrateProbe",
            display_name="Hydrate Probe",
            description="probe",
            segment_on_api_name="Account_demo__dlm",
            include_criteria=criteria,
            publish_schedule="NoRefresh",
        )
        request = mock_urlopen.call_args[0][0]
        body = json.loads(request.data.decode("utf-8"))
        assert body["developerName"] == "HydrateProbe"
        assert body["displayName"] == "Hydrate Probe"
        assert body["description"] == "probe"
        assert body["segmentOnApiName"] == "Account_demo__dlm"
        # Hard constraint: Dynamic for new segments
        assert body["segmentType"] == "Dynamic"
        assert body["publishSchedule"] == "NoRefresh"
        # includeCriteria MUST be a stringified JSON object
        assert isinstance(body["includeCriteria"], str)
        assert json.loads(body["includeCriteria"]) == criteria
        # The legacy fields must NOT be present
        assert "apiName" not in body
        assert "filter" not in body
        assert "targetDmo" not in body

    @patch("urllib.request.urlopen")
    def test_default_segment_type_is_dynamic(self, mock_urlopen):
        mock_urlopen.return_value = _mock_response({"apiName": "X__seg"})
        create_segment(
            "https://x.salesforce.com", "tok",
            developer_name="X",
            display_name="X",
            description="",
            segment_on_api_name="Account_demo__dlm",
            include_criteria={
                "type": "TextComparison",
                "subject": {"objectApiName": "Account_demo__dlm",
                            "fieldApiName": "External_ID_c__c"},
                "operator": "has value",
            },
        )
        request = mock_urlopen.call_args[0][0]
        body = json.loads(request.data.decode("utf-8"))
        assert body["segmentType"] == "Dynamic"
        # Default publish schedule is NoRefresh per live constraint mapping
        assert body["publishSchedule"] == "NoRefresh"

    @patch("urllib.request.urlopen")
    def test_handles_http_error(self, mock_urlopen):
        from urllib.error import HTTPError
        mock_urlopen.side_effect = HTTPError(
            url="x", code=400, msg="Bad Request", hdrs=None,
            fp=io.BytesIO(b'{"error":"invalid filter"}'),
        )
        ok, err = create_segment(
            "https://example.my.salesforce.com", "tok",
            developer_name="X",
            display_name="X",
            description="",
            segment_on_api_name="Account_demo__dlm",
            include_criteria={
                "type": "TextComparison",
                "subject": {"objectApiName": "Account_demo__dlm",
                            "fieldApiName": "External_ID_c__c"},
                "operator": "has value",
            },
        )
        assert ok is False
        assert "400" in err or "Bad Request" in err or "invalid filter" in err

    @patch("urllib.request.urlopen")
    def test_posts_to_correct_endpoint(self, mock_urlopen):
        mock_urlopen.return_value = _mock_response({"apiName": "A__seg"})
        create_segment(
            "https://x.salesforce.com", "tok",
            developer_name="A",
            display_name="A",
            description="",
            segment_on_api_name="Account_demo__dlm",
            include_criteria={
                "type": "TextComparison",
                "subject": {"objectApiName": "Account_demo__dlm",
                            "fieldApiName": "External_ID_c__c"},
                "operator": "has value",
            },
        )
        request = mock_urlopen.call_args[0][0]
        assert "/ssot/segments" in request.full_url
        assert request.get_method() == "POST"


class TestPatchSegmentRemoved:
    """patch_segment has been removed: Dynamic segments cannot be PATCHed
    per live ENTITY_SAVE_ERROR observation (only Dbt + Lookalike support
    update). Importing it should fail."""

    def test_patch_segment_is_not_exported(self):
        import customer_hydration.phase5.data_cloud as dc_mod
        assert not hasattr(dc_mod, "patch_segment")


class TestPublishSegment:
    @patch("urllib.request.urlopen")
    def test_returns_success(self, mock_urlopen):
        mock_urlopen.return_value = _mock_response({"runId": "r-123"})
        ok, run_id = publish_segment("https://x.salesforce.com", "tok",
                                     api_name="RetailAll__seg")
        assert ok is True
        assert run_id == "r-123"

    @patch("urllib.request.urlopen")
    def test_posts_to_publish_endpoint(self, mock_urlopen):
        mock_urlopen.return_value = _mock_response({"runId": "r-1"})
        publish_segment("https://x.salesforce.com", "tok", api_name="A__seg")
        request = mock_urlopen.call_args[0][0]
        assert "/segments/A__seg/publish" in request.full_url
        assert request.get_method() == "POST"


class TestGetSegmentStatus:
    @patch("urllib.request.urlopen")
    def test_returns_status_dataclass(self, mock_urlopen):
        mock_urlopen.return_value = _mock_response({
            "apiName": "RetailAll__seg",
            "status": "PUBLISHED",
            "memberCount": 14012,
            "lastPublishTime": "2026-05-22T18:30:00Z",
        })
        s = get_segment_status("https://x.salesforce.com", "tok",
                               api_name="RetailAll__seg")
        assert s.api_name == "RetailAll__seg"
        assert s.status == "PUBLISHED"
        assert s.member_count == 14012
        assert s.last_publish_time == "2026-05-22T18:30:00Z"

    @patch("urllib.request.urlopen")
    def test_handles_404_gracefully(self, mock_urlopen):
        from urllib.error import HTTPError
        mock_urlopen.side_effect = HTTPError(
            url="x", code=404, msg="Not Found", hdrs=None, fp=io.BytesIO(b"{}"),
        )
        s = get_segment_status("https://x.salesforce.com", "tok",
                               api_name="Missing__seg")
        # Returns a status object with status=NOT_FOUND or similar; never raises
        assert s.api_name == "Missing__seg"
        assert s.status in ("NOT_FOUND", "FAILED")
        assert s.error is not None
