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
    p_reset.add_argument("--allow-production", action="store_true",
                         help="Required to reset a non-sandbox org")

    p_status = sub.add_parser("status", help="Show what's in the org under HYDRATE-* (Plan 3)")
    _add_global_args(p_status)
    p_status.add_argument("--json", action="store_true",
                          help="Machine-readable output")
    p_dc = sub.add_parser("dc-status", help="Poll DC stream-run state (Plan 5)")
    _add_global_args(p_dc)
    p_resume = sub.add_parser("resume", help="Continue an interrupted run (Plan 3)")
    _add_global_args(p_resume)
    _add_hydrate_args(p_resume)

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
    if args.subcommand == "reset":
        return _run_reset(args)
    if args.subcommand == "resume":
        return _run_resume(args)
    if args.subcommand == "status":
        return _run_status(args)
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
    """Plan 4: legacy + native lineages with checkpoint/resume."""
    from customer_hydration.runner_p4 import run_all
    return run_all(args)


# ---------------------------------------------------------------------------
# Plan 3 / Task 11 — reset / resume / status subcommands
# ---------------------------------------------------------------------------


# Per-sObject idempotency field — kept in sync with loader/reset.py's _IDEM_FIELD.
_HYDRATE_SOBJECTS: list[tuple[str, str]] = [
    ("Account", "External_ID__c"),
    ("Contact", "External_Id__c"),
    ("AccountContactRelation", "External_ID__c"),
    ("FinServ__FinancialAccount__c", "External_ID__c"),
    ("FinServ__FinancialAccountRole__c", "External_ID__c"),
    ("FinServ__Card__c", "External_ID__c"),
    ("FinServ__FinancialGoal__c", "External_ID__c"),
    ("FinServ__LifeEvent__c", "FinServ__SourceSystemId__c"),
    ("FinServ__FinancialHolding__c", "FinServ__SourceSystemId__c"),
    ("Campaign", "External_ID__c"),
    ("Opportunity", "External_ID__c"),
    ("Case", "External_ID__c"),
    ("Task", "External_ID__c"),
    ("Event", "External_ID__c"),
    ("CampaignMember", "External_ID__c"),
]


def _query_hydrate_counts(runner) -> dict[str, int]:
    """Per-sObject HYDRATE-* count dict.

    Errors per sObject collapse to a -1 sentinel so a missing custom field
    on one object doesn't black-hole the whole status snapshot.
    """
    import json as _json
    import subprocess

    counts: dict[str, int] = {}
    for sobject, idem in _HYDRATE_SOBJECTS:
        try:
            soql = f"SELECT COUNT() FROM {sobject} WHERE {idem} LIKE 'HYDRATE-%'"
            cmd = [
                "sf", "data", "query",
                "--query", soql,
                "--target-org", runner.target_org,
                "--json",
            ]
            proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
            if proc.returncode != 0:
                counts[sobject] = -1
                continue
            payload = _json.loads(proc.stdout)
            counts[sobject] = int(payload.get("result", {}).get("totalSize", 0))
        except Exception:
            counts[sobject] = -1
    return counts


def _count_hydrate_records(runner) -> int:
    """Total HYDRATE-* records in the org. Negative sentinels are ignored."""
    return sum(c for c in _query_hydrate_counts(runner).values() if c >= 0)


def _run_reset(args: argparse.Namespace) -> int:
    """Wipe HYDRATE-* records from the org in reverse-wave order.

    Requires --confirm + typing the org alias as confirmation. Honors the
    same --allow-production guard as `hydrate`.
    """
    from customer_hydration.sf_runner import SfRunner

    if args.target_org is None:
        print("--target-org is required", file=sys.stderr)
        return 2
    if not args.confirm:
        print("reset requires --confirm flag", file=sys.stderr)
        return 2

    runner = SfRunner(args.target_org)
    org_info = runner._run([  # noqa: SLF001 — same pattern as runner_p3
        "sf", "org", "display", "--target-org", args.target_org, "--json",
    ])
    is_sandbox = bool(org_info.get("result", {}).get("isSandbox", False))
    if not is_sandbox and not getattr(args, "allow_production", False):
        print(
            f"Refusing to reset non-sandbox org {args.target_org}. "
            f"Pass --allow-production to override.",
            file=sys.stderr,
        )
        return 2

    pre_count = _count_hydrate_records(runner)
    if pre_count == 0:
        print("No HYDRATE-* records found in target org. Nothing to reset.")
        return 0

    print(f"This will delete approximately {pre_count} HYDRATE-* records.")
    print("Existing non-HYDRATE accounts will NOT be touched.")
    print(f"Type the org alias to confirm: {args.target_org}")
    typed = input(f"{args.target_org}: ").strip()

    try:
        from customer_hydration.loader.reset import reset_hydrate
        reports = reset_hydrate(
            runner=runner,
            target_org=args.target_org,
            output_dir=Path(args.output_dir) / "reset",
            confirm_alias=args.target_org,
            user_typed_alias=typed,
            dry_run=False,
            progress=lambda msg: print(msg),
        )
    except ValueError as exc:
        print(f"Confirmation mismatch: {exc}", file=sys.stderr)
        return 2

    total_deleted = sum(r.deleted for r in reports)
    total_failed = sum(r.failed for r in reports)
    print(f"Reset complete: {total_deleted} deleted, {total_failed} failed.")
    return 0 if total_failed == 0 else 2


def _run_resume(args: argparse.Namespace) -> int:
    """Continue an interrupted run from its checkpoint."""
    from customer_hydration.loader.checkpoint import find_latest_resumable

    if args.target_org is None:
        print("--target-org is required", file=sys.stderr)
        return 2
    output_dir = Path(args.output_dir)
    checkpoint = find_latest_resumable(output_dir)
    if checkpoint is None:
        print(f"No resumable run found in {output_dir}.", file=sys.stderr)
        return 2
    print(
        f"Resuming run {checkpoint.run_id} "
        f"from wave {checkpoint.in_progress_wave}…"
    )
    # Stash the run_id on args so runner_p4 picks up the resume.
    args.resume_run_id = checkpoint.run_id
    from customer_hydration.runner_p4 import run_all
    return run_all(args)


def _run_status(args: argparse.Namespace) -> int:
    """Print current HYDRATE-* counts per object in the target org."""
    from customer_hydration.sf_runner import SfRunner

    if args.target_org is None:
        print("--target-org is required", file=sys.stderr)
        return 2
    runner = SfRunner(args.target_org)
    counts = _query_hydrate_counts(runner)
    if args.json:
        import json as _json
        print(_json.dumps(counts, indent=2))
    else:
        print(f"HYDRATE-* counts in {args.target_org}:")
        for sobject in sorted(counts.keys()):
            print(f"  {sobject:50s} {counts[sobject]:>8}")
    return 0
