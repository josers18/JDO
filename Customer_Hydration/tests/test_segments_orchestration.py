"""Unit tests for phase5/segments.py — YAML loader + execute_create_segments."""
from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import pytest

from customer_hydration.phase5.segments import (
    SegmentDefinition,
    SegmentCreateResult,
    CreateSegmentsResult,
    load_segment_definitions,
    config_key_to_api_name,
    inject_hydrate_clause,
    execute_create_segments,
    execute_refresh_streams,
)


# ---- config_key_to_api_name ----

class TestConfigKeyToApiName:
    def test_simple_snake_case(self):
        assert config_key_to_api_name("retail_all") == "RetailAll__seg"

    def test_three_word_key(self):
        assert config_key_to_api_name("wealth_pre_retiree") == "WealthPreRetiree__seg"

    def test_campaign_aligned_key(self):
        assert config_key_to_api_name("cmp_heloc_refi_outreach") == "CmpHelocRefiOutreach__seg"

    def test_single_word(self):
        assert config_key_to_api_name("commercial") == "Commercial__seg"


# ---- inject_hydrate_clause ----

class TestInjectHydrateClause:
    def test_appends_and_clause_to_simple_filter(self):
        out = inject_hydrate_clause("FinServ_ClientCategory_c__c = 'Retail'")
        assert "FinServ_ClientCategory_c__c = 'Retail'" in out
        assert "External_ID_c__c LIKE 'HYDRATE-%'" in out
        assert " AND " in out

    def test_idempotent_when_clause_already_present(self):
        already_has = "FinServ_ClientCategory_c__c = 'Retail' AND External_ID_c__c LIKE 'HYDRATE-%'"
        out = inject_hydrate_clause(already_has)
        # Should NOT double-inject
        assert out.count("HYDRATE-%") == 1

    def test_handles_multiline_filter(self):
        multiline = "FinServ_ClientCategory_c__c = 'Wealth Management'\nAND DATE_DIFF(...)"
        out = inject_hydrate_clause(multiline)
        assert "External_ID_c__c LIKE 'HYDRATE-%'" in out


# ---- load_segment_definitions ----

class TestLoadSegmentDefinitions:
    def test_loads_yaml_and_parses_each_segment(self, tmp_path: Path):
        yaml_path = tmp_path / "segments.yaml"
        yaml_path.write_text("""\
segments:
  retail_all:
    name: "Retail Customers"
    description: "All retail"
    persona: retail
    publish_schedule: hourly
    target_dmo: Account_demo__dlm
    rule:
      type: sql
      filter: "FinServ_ClientCategory_c__c = 'Retail'"
""")
        defs = load_segment_definitions(yaml_path)
        assert len(defs) == 1
        d = defs[0]
        assert d.config_key == "retail_all"
        assert d.api_name == "RetailAll__seg"
        assert d.display_name == "Retail Customers"
        assert d.persona == "retail"
        assert d.target_dmo == "Account_demo__dlm"
        assert "External_ID_c__c LIKE 'HYDRATE-%'" in d.filter_sql

    def test_raises_on_missing_required_field(self, tmp_path: Path):
        yaml_path = tmp_path / "bad.yaml"
        yaml_path.write_text("""\
segments:
  retail_all:
    name: "Retail Customers"
    # missing description, persona, publish_schedule, target_dmo, rule
""")
        with pytest.raises(ValueError, match="missing required"):
            load_segment_definitions(yaml_path)

    def test_raises_on_missing_segments_key(self, tmp_path: Path):
        yaml_path = tmp_path / "bad.yaml"
        yaml_path.write_text("""\
something_else: foo
""")
        with pytest.raises(ValueError, match="segments"):
            load_segment_definitions(yaml_path)

    def test_linked_campaign_optional(self, tmp_path: Path):
        yaml_path = tmp_path / "segments.yaml"
        yaml_path.write_text("""\
segments:
  cmp_heloc:
    name: "HELOC"
    description: "x"
    persona: retail
    publish_schedule: daily
    target_dmo: Account_demo__dlm
    linked_campaign: HYDRATE-CMP-001
    rule:
      type: sql
      filter: "X = 'Y'"
  retail_all:
    name: "Retail All"
    description: "x"
    persona: retail
    publish_schedule: hourly
    target_dmo: Account_demo__dlm
    rule:
      type: sql
      filter: "X = 'Y'"
""")
        defs = load_segment_definitions(yaml_path)
        d_with = next(d for d in defs if d.config_key == "cmp_heloc")
        d_without = next(d for d in defs if d.config_key == "retail_all")
        assert d_with.linked_campaign == "HYDRATE-CMP-001"
        assert d_without.linked_campaign is None


# ---- execute_create_segments ----

class TestExecuteCreateSegmentsDryRun:
    def test_dry_run_makes_no_rest_calls(self, tmp_path: Path):
        yaml_path = tmp_path / "segments.yaml"
        yaml_path.write_text("""\
segments:
  retail_all:
    name: "Retail Customers"
    description: "x"
    persona: retail
    publish_schedule: hourly
    target_dmo: Account_demo__dlm
    rule:
      type: sql
      filter: "FinServ_ClientCategory_c__c = 'Retail'"
""")
        with patch("customer_hydration.phase5.segments.get_org_session") as mock_sess, \
             patch("customer_hydration.phase5.segments.list_segments") as mock_list, \
             patch("customer_hydration.phase5.segments.create_segment") as mock_create, \
             patch("customer_hydration.phase5.segments.publish_segment") as mock_pub:
            result = execute_create_segments(
                target_org="DRY-RUN", yaml_path=yaml_path, dry_run=True,
            )
            assert mock_sess.call_count == 0
            assert mock_list.call_count == 0
            assert mock_create.call_count == 0
            assert mock_pub.call_count == 0
            assert result.segments_processed == 1


class TestExecuteCreateSegmentsLive:
    @patch("customer_hydration.phase5.segments.get_org_session")
    @patch("customer_hydration.phase5.segments.list_segments")
    @patch("customer_hydration.phase5.segments.create_segment")
    @patch("customer_hydration.phase5.segments.publish_segment")
    def test_creates_when_segment_not_in_existing_list(
        self, mock_pub, mock_create, mock_list, mock_sess, tmp_path: Path,
    ):
        yaml_path = tmp_path / "segments.yaml"
        yaml_path.write_text("""\
segments:
  retail_all:
    name: "Retail Customers"
    description: "x"
    persona: retail
    publish_schedule: hourly
    target_dmo: Account_demo__dlm
    rule:
      type: sql
      filter: "X = 'Y'"
""")
        mock_sess.return_value = ("https://x.salesforce.com", "tok")
        mock_list.return_value = []  # No existing segments
        mock_create.return_value = (True, "0sX...")
        mock_pub.return_value = (True, "r-1")
        result = execute_create_segments(target_org="alias", yaml_path=yaml_path)
        assert result.segments_created == 1
        assert result.segments_patched == 0
        assert result.segments_published == 1
        assert mock_create.call_count == 1
        assert mock_pub.call_count == 1

    @patch("customer_hydration.phase5.segments.get_org_session")
    @patch("customer_hydration.phase5.segments.list_segments")
    @patch("customer_hydration.phase5.segments.patch_segment")
    @patch("customer_hydration.phase5.segments.publish_segment")
    def test_patches_when_segment_already_exists(
        self, mock_pub, mock_patch, mock_list, mock_sess, tmp_path: Path,
    ):
        from customer_hydration.phase5.data_cloud import SegmentInfo
        yaml_path = tmp_path / "segments.yaml"
        yaml_path.write_text("""\
segments:
  retail_all:
    name: "Retail Customers"
    description: "x"
    persona: retail
    publish_schedule: hourly
    target_dmo: Account_demo__dlm
    rule:
      type: sql
      filter: "X = 'Y'"
""")
        mock_sess.return_value = ("https://x.salesforce.com", "tok")
        mock_list.return_value = [SegmentInfo(
            api_name="RetailAll__seg", display_name="Old Name",
            description="old", target_dmo="Account_demo__dlm", publish_schedule="manual",
        )]
        mock_patch.return_value = (True, "0sX...")
        mock_pub.return_value = (True, "r-1")
        result = execute_create_segments(target_org="alias", yaml_path=yaml_path)
        assert result.segments_created == 0
        assert result.segments_patched == 1
        assert result.segments_published == 1

    @patch("customer_hydration.phase5.segments.get_org_session")
    @patch("customer_hydration.phase5.segments.list_segments")
    @patch("customer_hydration.phase5.segments.create_segment")
    @patch("customer_hydration.phase5.segments.publish_segment")
    def test_skip_publish_does_not_call_publish(
        self, mock_pub, mock_create, mock_list, mock_sess, tmp_path: Path,
    ):
        yaml_path = tmp_path / "segments.yaml"
        yaml_path.write_text("""\
segments:
  retail_all:
    name: "Retail Customers"
    description: "x"
    persona: retail
    publish_schedule: hourly
    target_dmo: Account_demo__dlm
    rule:
      type: sql
      filter: "X = 'Y'"
""")
        mock_sess.return_value = ("https://x.salesforce.com", "tok")
        mock_list.return_value = []
        mock_create.return_value = (True, "0sX...")
        result = execute_create_segments(
            target_org="alias", yaml_path=yaml_path, skip_publish=True,
        )
        assert result.segments_created == 1
        assert result.segments_published == 0
        assert mock_pub.call_count == 0

    @patch("customer_hydration.phase5.segments.get_org_session")
    @patch("customer_hydration.phase5.segments.list_segments")
    @patch("customer_hydration.phase5.segments.create_segment")
    @patch("customer_hydration.phase5.segments.publish_segment")
    def test_segment_id_filters_to_one_entry(
        self, mock_pub, mock_create, mock_list, mock_sess, tmp_path: Path,
    ):
        yaml_path = tmp_path / "segments.yaml"
        yaml_path.write_text("""\
segments:
  retail_all:
    name: "Retail Customers"
    description: "x"
    persona: retail
    publish_schedule: hourly
    target_dmo: Account_demo__dlm
    rule:
      type: sql
      filter: "X = 'Y'"
  wealth_all:
    name: "Wealth Clients"
    description: "x"
    persona: wealth
    publish_schedule: hourly
    target_dmo: Account_demo__dlm
    rule:
      type: sql
      filter: "X = 'Y'"
""")
        mock_sess.return_value = ("https://x.salesforce.com", "tok")
        mock_list.return_value = []
        mock_create.return_value = (True, "0sX...")
        mock_pub.return_value = (True, "r-1")
        result = execute_create_segments(
            target_org="alias", yaml_path=yaml_path, segment_id="wealth_all",
        )
        assert result.segments_processed == 1
        assert mock_create.call_count == 1
        # Verify it created the wealth one, not the retail one
        called_api_name = mock_create.call_args.kwargs["api_name"]
        assert called_api_name == "WealthAll__seg"

    @patch("customer_hydration.phase5.segments.get_org_session")
    @patch("customer_hydration.phase5.segments.list_segments")
    @patch("customer_hydration.phase5.segments.create_segment")
    @patch("customer_hydration.phase5.segments.publish_segment")
    def test_create_failure_recorded_does_not_raise(
        self, mock_pub, mock_create, mock_list, mock_sess, tmp_path: Path,
    ):
        yaml_path = tmp_path / "segments.yaml"
        yaml_path.write_text("""\
segments:
  retail_all:
    name: "Retail Customers"
    description: "x"
    persona: retail
    publish_schedule: hourly
    target_dmo: Account_demo__dlm
    rule:
      type: sql
      filter: "X = 'Y'"
""")
        mock_sess.return_value = ("https://x.salesforce.com", "tok")
        mock_list.return_value = []
        mock_create.return_value = (False, "HTTP 400 Bad Request")
        result = execute_create_segments(target_org="alias", yaml_path=yaml_path)
        assert result.segments_failed == 1
        assert result.segments_created == 0
        assert mock_pub.call_count == 0  # No publish on failed create
        assert "HTTP 400" in result.results[0].error


# ---- execute_refresh_streams ----

class TestExecuteRefreshStreams:
    @patch("customer_hydration.phase5.segments.execute_phase5_5")
    def test_delegates_to_phase5_5(self, mock_p55):
        from customer_hydration.phase5.data_cloud import DataCloudStreamRefreshResult
        mock_p55.return_value = DataCloudStreamRefreshResult(
            streams_discovered=5, streams_matched=3, streams_triggered=3,
        )
        result = execute_refresh_streams(target_org="alias")
        assert result.streams_discovered == 5
        assert result.streams_matched == 3
        assert result.streams_triggered == 3
        mock_p55.assert_called_once_with(target_org="alias")
