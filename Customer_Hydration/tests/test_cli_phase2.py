"""Tests for Phase 2 CLI subcommands: refresh-streams + create-segments."""
from __future__ import annotations

import json
from unittest.mock import patch

import pytest

from customer_hydration.cli import build_parser, main


class TestRefreshStreamsArgparse:
    def test_subcommand_parses(self):
        p = build_parser()
        args = p.parse_args([
            "refresh-streams", "--target-org", "jdo-fw51xz",
        ])
        assert args.subcommand == "refresh-streams"
        assert args.target_org == "jdo-fw51xz"

    def test_allow_production_flag_parses(self):
        p = build_parser()
        args = p.parse_args([
            "refresh-streams", "--target-org", "jdo-fw51xz",
            "--allow-production",
        ])
        assert args.allow_production is True


class TestRefreshStreamsDispatch:
    def test_no_target_org_returns_2(self):
        rc = main(["refresh-streams"])
        assert rc == 2

    @patch("customer_hydration.cli.SfRunner")
    @patch("customer_hydration.phase5.segments.execute_refresh_streams")
    def test_calls_execute_refresh_streams_when_sandbox(
        self, mock_exec, mock_runner,
    ):
        from customer_hydration.phase5.data_cloud import DataCloudStreamRefreshResult
        mock_runner.return_value._run.return_value = {
            "result": {"isSandbox": True}
        }
        mock_exec.return_value = DataCloudStreamRefreshResult(
            streams_discovered=3, streams_matched=2, streams_triggered=2,
        )
        rc = main(["refresh-streams", "--target-org", "alias"])
        assert rc == 0
        mock_exec.assert_called_once_with(target_org="alias")

    @patch("customer_hydration.cli.SfRunner")
    def test_non_sandbox_without_allow_production_returns_2(self, mock_runner):
        mock_runner.return_value._run.return_value = {
            "result": {"isSandbox": False}
        }
        rc = main(["refresh-streams", "--target-org", "alias"])
        assert rc == 2


class TestCreateSegmentsArgparse:
    def test_subcommand_parses(self):
        p = build_parser()
        args = p.parse_args([
            "create-segments", "--target-org", "jdo-fw51xz",
        ])
        assert args.subcommand == "create-segments"

    def test_segment_id_flag(self):
        p = build_parser()
        args = p.parse_args([
            "create-segments", "--target-org", "alias", "--segment-id", "retail_all",
        ])
        assert args.segment_id == "retail_all"

    def test_skip_publish_flag(self):
        p = build_parser()
        args = p.parse_args([
            "create-segments", "--target-org", "alias", "--skip-publish",
        ])
        assert args.skip_publish is True

    def test_dry_run_flag(self):
        p = build_parser()
        args = p.parse_args([
            "create-segments", "--target-org", "alias", "--dry-run",
        ])
        assert args.dry_run is True


class TestCreateSegmentsDispatch:
    def test_dry_run_does_not_require_target_org(self, tmp_path):
        # Write a valid segments.yaml
        cfg = tmp_path / "config"
        cfg.mkdir()
        (cfg / "segments.yaml").write_text("""\
segments:
  retail_all:
    name: "Retail Customers"
    description: "x"
    persona: retail
    publish_schedule: hourly
    target_dmo: Account
    rule:
      type: text_equals
      field: FinServ_ClientCategory_c__c
      value: "Retail"
""")
        rc = main([
            "create-segments", "--config-dir", str(cfg), "--dry-run",
        ])
        assert rc == 0

    def test_no_target_org_and_not_dry_run_returns_2(self, tmp_path):
        cfg = tmp_path / "config"
        cfg.mkdir()
        (cfg / "segments.yaml").write_text("""\
segments:
  retail_all:
    name: "Retail Customers"
    description: "x"
    persona: retail
    publish_schedule: hourly
    target_dmo: Account
    rule:
      type: text_equals
      field: FinServ_ClientCategory_c__c
      value: "Retail"
""")
        rc = main([
            "create-segments", "--config-dir", str(cfg),
        ])
        assert rc == 2

    def test_missing_yaml_returns_2(self, tmp_path):
        cfg = tmp_path / "config"
        cfg.mkdir()  # exists but no segments.yaml
        rc = main([
            "create-segments", "--target-org", "alias", "--config-dir", str(cfg),
            "--dry-run",
        ])
        assert rc == 2

    @patch("customer_hydration.cli.SfRunner")
    @patch("customer_hydration.phase5.segments.execute_create_segments")
    def test_passes_flags_to_execute(self, mock_exec, mock_runner, tmp_path):
        from customer_hydration.phase5.segments import CreateSegmentsResult
        cfg = tmp_path / "config"
        cfg.mkdir()
        (cfg / "segments.yaml").write_text("""\
segments:
  retail_all:
    name: "Retail Customers"
    description: "x"
    persona: retail
    publish_schedule: hourly
    target_dmo: Account
    rule:
      type: text_equals
      field: FinServ_ClientCategory_c__c
      value: "Retail"
""")
        mock_runner.return_value._run.return_value = {"result": {"isSandbox": True}}
        mock_exec.return_value = CreateSegmentsResult(
            segments_processed=1, segments_created=1,
        )
        rc = main([
            "create-segments", "--target-org", "alias", "--config-dir", str(cfg),
            "--segment-id", "retail_all", "--skip-publish",
        ])
        assert rc == 0
        kwargs = mock_exec.call_args.kwargs
        assert kwargs["segment_id"] == "retail_all"
        assert kwargs["skip_publish"] is True
        assert kwargs["dry_run"] is False


class TestDcStatusSegmentView:
    @patch("customer_hydration.phase5.data_cloud.get_org_session")
    @patch("customer_hydration.phase5.data_cloud.get_segment_status")
    def test_dc_status_polls_each_segment_in_yaml(
        self, mock_get_status, mock_sess, tmp_path,
    ):
        from customer_hydration.phase5.data_cloud import SegmentStatus
        cfg = tmp_path / "config"
        cfg.mkdir()
        (cfg / "segments.yaml").write_text("""\
segments:
  retail_all:
    name: "Retail Customers"
    description: "x"
    persona: retail
    publish_schedule: hourly
    target_dmo: Account
    rule:
      type: text_equals
      field: FinServ_ClientCategory_c__c
      value: "Retail"
  wealth_all:
    name: "Wealth Clients"
    description: "x"
    persona: wealth
    publish_schedule: hourly
    target_dmo: Account
    rule:
      type: text_equals
      field: FinServ_ClientCategory_c__c
      value: "Retail"
""")
        out = tmp_path / "output"
        out.mkdir()  # output dir with no manifest — segment-only path
        mock_sess.return_value = ("https://x.salesforce.com", "tok")
        mock_get_status.side_effect = [
            SegmentStatus("RetailAll__seg", "PUBLISHED", 1000, "2026-05-22T10:00:00Z"),
            SegmentStatus("WealthAll__seg", "PUBLISHING", None, None),
        ]
        rc = main([
            "dc-status", "--target-org", "alias",
            "--config-dir", str(cfg), "--output-dir", str(out),
        ])
        # dc-status should at least call get_segment_status for each entry
        # (return code may be 0 or 2 depending on whether mock_segment_status
        # returns success — we just verify it ran the segment view)
        assert mock_get_status.call_count == 2

    def test_no_target_org_with_empty_runs_and_segments_yaml_exits_2_with_hint(
        self, tmp_path, capsys,
    ):
        """Manifest with empty stream_runs + segments.yaml present + no --target-org
        → rc=2 with a stderr hint explaining segments weren't polled."""
        cfg = tmp_path / "config"
        cfg.mkdir()
        (cfg / "segments.yaml").write_text("""\
segments:
  retail_all:
    name: "Retail Customers"
    description: "x"
    persona: retail
    publish_schedule: hourly
    target_dmo: Account
    rule:
      type: text_equals
      field: FinServ_ClientCategory_c__c
      value: "Retail"
""")
        out = tmp_path / "output"
        out.mkdir()
        run_dir = out / "run-2026-05-22T1200"
        run_dir.mkdir()
        (run_dir / "manifest.json").write_text(json.dumps({
            "stream_runs": [],
        }))

        rc = main([
            "dc-status",
            "--config-dir", str(cfg),
            "--output-dir", str(out),
        ])
        captured = capsys.readouterr()
        assert rc == 2
        assert "Segments not polled" in captured.err
