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
