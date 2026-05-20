"""CLI dispatch for hydrate.py.

Plan 1 implements: validate-config, and a minimal `hydrate` subcommand
that runs Phase 0 + retail generation + 3-CSV bulk load. Plans 2–6 add
the rest.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import yaml


def _add_global_args(p: argparse.ArgumentParser) -> None:
    """Global flags accepted at the root parser AND on every subcommand.

    Using a helper instead of `parents=[...]` keeps the dest/default for each
    flag identical at every level so users can write either
    `hydrate.py --target-org X validate-config` or
    `hydrate.py validate-config --target-org X` and argparse will resolve to
    the same Namespace.
    """
    p.add_argument("--target-org", default=None,
                   help="sf org alias (required for org-touching subcommands)")
    p.add_argument("--output-dir", default="./output",
                   help="Directory for run artifacts (default: ./output)")
    p.add_argument("--config-dir", default="./config",
                   help="Directory for YAML configs (default: ./config)")
    p.add_argument("--quiet", action="store_true")
    p.add_argument("--verbose", action="store_true")
    p.add_argument("--dry-run", action="store_true",
                   help="Generate CSVs but don't load")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="hydrate.py",
        description="Customer_Hydration — JDO demo-org seeding artifact",
    )
    _add_global_args(parser)

    sub = parser.add_subparsers(dest="subcommand")

    p_hydrate = sub.add_parser("hydrate", help="Generate + load customers")
    _add_global_args(p_hydrate)
    _add_hydrate_args(p_hydrate)

    p_briefs = sub.add_parser("briefs", help="Regenerate banker brief MD files (Plan 6)")
    _add_global_args(p_briefs)
    p_briefs.add_argument("--output", default="../docs/briefs/")
    p_briefs.add_argument("--rm", default=None)

    p_reset = sub.add_parser("reset", help="Wipe HYDRATE-* records (Plan 3)")
    _add_global_args(p_reset)
    p_reset.add_argument("--confirm", action="store_true")
    p_reset.add_argument("--persona", default=None)
    p_reset.add_argument("--keep-campaigns", action="store_true")

    p_status = sub.add_parser("status", help="Show what's in the org under HYDRATE-* (Plan 6)")
    _add_global_args(p_status)
    p_dc = sub.add_parser("dc-status", help="Poll DC stream-run state (Plan 5)")
    _add_global_args(p_dc)
    p_resume = sub.add_parser("resume", help="Continue an interrupted run (Plan 3)")
    _add_global_args(p_resume)

    p_validate = sub.add_parser("validate-config", help="Lint config/*.yaml")
    _add_global_args(p_validate)
    # validate-config reuses the global --config-dir

    return parser


def _add_hydrate_args(p: argparse.ArgumentParser) -> None:
    p.add_argument("--retail", type=int, default=7000)
    p.add_argument("--wealth", type=int, default=1200)
    p.add_argument("--smb", type=int, default=1500)
    p.add_argument("--commercial", type=int, default=300)
    p.add_argument("--rm", default=None,
                   help='Restrict customer assignment to a single RM (name or User Id)')
    p.add_argument("--append", action="store_true")
    p.add_argument("--reset", action="store_true")
    p.add_argument("--confirm", action="store_true")
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--parallel", type=int, default=4)
    p.add_argument("--skip-natives", action="store_true")
    p.add_argument("--skip-apex-wireup", action="store_true")
    p.add_argument("--skip-data-cloud", action="store_true")
    p.add_argument("--data-cloud-only", action="store_true")
    p.add_argument("--personas", type=lambda s: s.split(","), default=None)
    p.add_argument("--waves", type=lambda s: s.split(","), default=None)
    p.add_argument("--persona-density", choices=["light", "medium", "heavy"], default="heavy")
    p.add_argument("--allow-production", action="store_true")
    # --target-org inherits from the global parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.subcommand is None or args.subcommand == "hydrate":
        return _run_hydrate(args)
    if args.subcommand == "validate-config":
        return _run_validate_config(args)
    print(f"Subcommand {args.subcommand!r} is implemented in a later plan.", file=sys.stderr)
    return 2


def _run_validate_config(args: argparse.Namespace) -> int:
    config_dir = Path(args.config_dir)
    if not config_dir.is_dir():
        print(f"Config dir not found: {config_dir}", file=sys.stderr)
        return 1
    required_files = ["personas.yaml", "product_catalog.yaml", "rm_pool.yaml"]
    missing = [f for f in required_files if not (config_dir / f).exists()]
    if missing:
        print(f"Missing config files: {missing}", file=sys.stderr)
        return 1
    for fname in required_files:
        try:
            with (config_dir / fname).open() as fh:
                yaml.safe_load(fh)
        except yaml.YAMLError as exc:
            print(f"Invalid YAML in {fname}: {exc}", file=sys.stderr)
            return 1
    print("Config OK.")
    return 0


def _run_hydrate(args: argparse.Namespace) -> int:
    """Plan 1: retail-only, single-RM-pool, no natives, no DC, no Apex wireup."""
    from customer_hydration.runner_p1 import run_retail_only
    return run_retail_only(args)
