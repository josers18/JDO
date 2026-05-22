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
