"""Tests for the CLI dispatch."""
from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import pytest

from customer_hydration.cli import build_parser, main


class TestArgparseDispatch:
    def test_default_subcommand_is_hydrate(self):
        parser = build_parser()
        args = parser.parse_args(["--target-org", "jdo-fw51xz"])
        assert args.subcommand in (None, "hydrate")

    def test_validate_config_no_org_required(self):
        parser = build_parser()
        args = parser.parse_args(["validate-config"])
        assert args.subcommand == "validate-config"

    def test_hydrate_default_persona_volumes(self):
        parser = build_parser()
        args = parser.parse_args(["hydrate", "--target-org", "jdo-fw51xz"])
        assert args.retail == 7000
        assert args.wealth == 1200
        assert args.smb == 1500
        assert args.commercial == 300

    def test_skip_flags_parse(self):
        parser = build_parser()
        args = parser.parse_args([
            "hydrate", "--target-org", "jdo-fw51xz",
            "--skip-natives", "--skip-apex-wireup", "--skip-data-cloud",
        ])
        assert args.skip_natives is True
        assert args.skip_apex_wireup is True
        assert args.skip_data_cloud is True

    def test_personas_subset_parses_as_list(self):
        parser = build_parser()
        args = parser.parse_args([
            "hydrate", "--target-org", "jdo-fw51xz", "--personas", "retail,wealth",
        ])
        assert args.personas == ["retail", "wealth"]


class TestValidateConfig:
    def test_validate_config_passes_for_real_configs(self, package_root: Path):
        # Validate-config reads config/*.yaml, asserts schema, exits 0.
        rc = main(["validate-config", "--config-dir", str(package_root / "config")])
        assert rc == 0

    def test_validate_config_fails_on_missing_dir(self, tmp_path: Path):
        rc = main(["validate-config", "--config-dir", str(tmp_path / "missing")])
        assert rc == 1


class TestPlan3Subcommands:
    """Plan 3 / Task 11 — argparse + dispatch for reset / resume / status."""

    def test_reset_subcommand_parses(self):
        parser = build_parser()
        args = parser.parse_args(["reset", "--confirm", "--target-org", "alias"])
        assert args.subcommand == "reset"
        assert args.confirm is True
        assert args.target_org == "alias"

    def test_resume_subcommand_parses(self):
        parser = build_parser()
        args = parser.parse_args(["resume", "--target-org", "alias"])
        assert args.subcommand == "resume"
        assert args.target_org == "alias"

    def test_status_subcommand_parses(self):
        parser = build_parser()
        args = parser.parse_args(["status", "--target-org", "alias"])
        assert args.subcommand == "status"
        assert args.target_org == "alias"

    def test_status_json_flag(self):
        parser = build_parser()
        args = parser.parse_args(["status", "--target-org", "alias", "--json"])
        assert args.json is True

    def test_reset_without_confirm_fails(self):
        # SfRunner is only constructed AFTER the --confirm gate, so no
        # subprocess patching is needed for this branch.
        rc = main(["reset", "--target-org", "alias"])
        assert rc == 2

    def test_status_no_target_org_fails(self):
        # Hits the "--target-org is required" branch before SfRunner
        # construction — no subprocess interaction.
        rc = main(["status"])
        assert rc == 2


class TestDcStatusSubcommand:
    """Plan 5 / Task 6 — argparse + dispatch for dc-status."""

    def test_dc_status_subcommand_parses(self):
        parser = build_parser()
        args = parser.parse_args(["dc-status", "--target-org", "alias"])
        assert args.subcommand == "dc-status"
        assert args.target_org == "alias"
        # New flags default cleanly
        assert args.run_id is None
        assert args.json is False
        assert args.watch is False

    def test_dc_status_with_json_flag(self):
        parser = build_parser()
        args = parser.parse_args([
            "dc-status", "--target-org", "alias", "--json",
        ])
        assert args.subcommand == "dc-status"
        assert args.json is True

    def test_dc_status_with_run_id_flag(self):
        parser = build_parser()
        args = parser.parse_args([
            "dc-status", "--target-org", "alias",
            "--run-id", "run-2026-05-21T1234",
        ])
        assert args.run_id == "run-2026-05-21T1234"

    def test_dc_status_no_runs_returns_2(self, tmp_path: Path):
        # Empty output dir — no run-*/manifest.json files. The function
        # should print "No run with Data Cloud stream refresh found" and
        # return exit code 2.
        rc = main([
            "dc-status",
            "--target-org", "alias",
            "--output-dir", str(tmp_path),
        ])
        assert rc == 2


class TestPlan6Briefs:
    """Plan 6 / Task 2 — argparse + dispatch for briefs subcommand."""

    def test_briefs_subcommand_parses(self):
        parser = build_parser()
        args = parser.parse_args(["briefs", "--target-org", "jdo-fw51xz"])
        assert args.subcommand == "briefs"
        assert args.target_org == "jdo-fw51xz"
        # --output defaults to ../docs/briefs/
        assert args.output == "../docs/briefs/"
        # --rm defaults to None
        assert args.rm is None

    def test_briefs_with_rm_flag(self):
        parser = build_parser()
        args = parser.parse_args([
            "briefs", "--target-org", "jdo-fw51xz",
            "--rm", "vince_west",
            "--output", "/tmp/briefs",
        ])
        assert args.rm == "vince_west"
        assert args.output == "/tmp/briefs"

    def test_briefs_no_target_org_returns_2(self):
        # The --target-org guard fires before any SfRunner construction
        # so no subprocess patching is needed.
        rc = main(["briefs"])
        assert rc == 2
