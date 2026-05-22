"""Tests for Phase 2 CLI subcommands: refresh-streams + create-segments."""
from __future__ import annotations

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
      type: sql
      filter: "X = 'Y'"
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
      type: sql
      filter: "X = 'Y'"
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
      type: sql
      filter: "X = 'Y'"
""")
        mock_runner.return_value._run.return_value = {"result": {"isSandbox": True}}
        mock_exec.return_value = CreateSegmentsResult(
            segments_processed=1, segments_created=1, segments_published=1,
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
