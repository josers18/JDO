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
