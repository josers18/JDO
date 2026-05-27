"""CLI dispatch for hydrate.py.

Plan 1 implements: validate-config, and a minimal `hydrate` subcommand
that runs Phase 0 + retail generation + 3-CSV bulk load. Plans 2–6 add
the rest.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import yaml

from customer_hydration.sf_runner import SfRunner
from customer_hydration.phase5.segments import (
    execute_create_segments,
    execute_recreate_segments,
)
from customer_hydration.phase5.segments_probe import (
    probe_relative_date_filter,
    write_probe_artifact,
)
from customer_hydration.phase5.data_cloud import get_org_session


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
    p_dc.add_argument("--run-id", default=None,
                      help="Manifest to read (default: latest with DC section)")
    p_dc.add_argument("--json", action="store_true",
                      help="Machine-readable output")
    p_dc.add_argument("--watch", action="store_true",
                      help="Poll every 30s until done (v1: single-shot poll)")

    p_refresh = sub.add_parser(
        "refresh-streams",
        help="Refresh DC streams sourcing from hydrated objects (Phase 2)",
    )
    _add_global_args(p_refresh)
    p_refresh.add_argument(
        "--allow-production", action="store_true",
        help="Required for non-sandbox orgs",
    )

    p_segments = sub.add_parser(
        "create-segments",
        help="Create + publish DC segments from segments.yaml (Phase 2)",
    )
    _add_global_args(p_segments)
    p_segments.add_argument("--allow-production", action="store_true")
    p_segments.add_argument(
        "--segment-id", default=None,
        help="Process only one segment by config key",
    )
    p_segments.add_argument(
        "--skip-publish", action="store_true",
        help="Create/patch but don't publish",
    )
    p_segments.add_argument(
        "--recreate", default=None, metavar="PATTERN",
        help="Glob over config keys; runs DELETE+POST for matching segments. "
             "Mutually exclusive with --segment-id.",
    )
    p_segments.add_argument(
        "--probe-relative-dates", action="store_true",
        help="One-shot: probe v62 relative-date semantics and write a verdict "
             "artifact, then exit. Use --probe-artifact to control the path.",
    )
    p_segments.add_argument(
        "--probe-artifact", default="output/phase3d/probe_latest.json",
        help="Where to read/write the probe verdict (default: %(default)s)",
    )
    # Note: --dry-run is inherited from _add_global_args above (would conflict
    # if redeclared); it's reused here as the "print what would happen without
    # making changes" mode.

    p_augment = sub.add_parser(
        "augment-phase3",
        help="Backfill life events + campaign members on existing HYDRATE-* accounts (Phase 3)",
    )
    _add_global_args(p_augment)
    p_augment.add_argument("--seed", type=int, default=42)
    p_augment.add_argument("--allow-production", action="store_true")

    p_mirror = sub.add_parser(
        "mirror-life-events",
        help=(
            "Mirror every HYDRATE-LE-* legacy FinServ__LifeEvent__c row to a "
            "matching HYDRATE-NLE-* native PersonLifeEvent row (Phase 3 parity)"
        ),
    )
    _add_global_args(p_mirror)
    p_mirror.add_argument("--allow-production", action="store_true")

    p_backfill = sub.add_parser(
        "backfill-accounts",
        help="Fill empty Account fields across the target org (Phase 4)",
    )
    _add_global_args(p_backfill)
    p_backfill.add_argument(
        "--persona",
        help="Comma-separated persona filter (retail,wealth,smb,commercial,household)",
    )
    p_backfill.add_argument(
        "--record-type",
        help="Comma-separated RecordType.Name filter",
    )
    p_backfill.add_argument(
        "--limit",
        type=int,
        help="Process at most N records (testing aid)",
    )
    p_backfill.add_argument(
        "--skip-refresh-stream",
        action="store_true",
        help="Skip the post-load DC stream refresh trigger",
    )
    p_backfill.add_argument(
        "--strict",
        action="store_true",
        help="Any non-zero per-row failure exits rc=2 (regardless of threshold)",
    )
    p_backfill.add_argument(
        "--allow-missing-external-id",
        action="store_true",
        help=(
            "Allow rows lacking External_ID__c to be backfilled with a synthetic "
            "BACKFILL-<Id> stamp. Default: skip such rows (avoids creating new "
            "Account records when the synthetic id doesn't match an existing row)."
        ),
    )
    p_backfill.add_argument(
        "--allow-production",
        action="store_true",
        help="Required to run against an org with a production-org id",
    )

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
    if args.subcommand == "dc-status":
        return _run_dc_status(args)
    if args.subcommand == "refresh-streams":
        return _run_refresh_streams(args)
    if args.subcommand == "create-segments":
        return _run_create_segments(args)
    if args.subcommand == "augment-phase3":
        from customer_hydration.augment_phase3 import run_augment
        return run_augment(args)
    if args.subcommand == "mirror-life-events":
        from customer_hydration.mirror_life_events import run_mirror
        return run_mirror(args)
    if args.subcommand == "backfill-accounts":
        from customer_hydration.backfill_accounts import run_backfill
        from datetime import datetime
        ts = datetime.now().strftime("%Y-%m-%dT%H%M")
        out_dir = Path(args.output_dir) / f"backfill-accounts-{ts}"
        return run_backfill(
            target_org=args.target_org,
            output_dir=out_dir,
            dry_run=args.dry_run,
            persona=getattr(args, "persona", None),
            record_type=getattr(args, "record_type", None),
            limit=getattr(args, "limit", None),
            skip_refresh_stream=getattr(args, "skip_refresh_stream", False),
            strict=getattr(args, "strict", False),
            require_external_id=not getattr(args, "allow_missing_external_id", False),
            allow_production=getattr(args, "allow_production", False),
            records=None,
            life_events_by_id=None,
        )
    if args.subcommand == "briefs":
        return _run_briefs(args)
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
    """Plan 5: legacy + native lineages + Apex wireup + DC stream refresh."""
    from customer_hydration.runner_p5 import run_all
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
    # Stash the run_id on args so runner_p5 picks up the resume.
    args.resume_run_id = checkpoint.run_id
    from customer_hydration.runner_p5 import run_all
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


# ---------------------------------------------------------------------------
# Plan 5 / Task 6 — dc-status subcommand
# ---------------------------------------------------------------------------


def _run_dc_status(args: argparse.Namespace) -> int:
    """Poll Data Cloud stream-run state from the latest manifest.

    Phase 2 also appends a Segments section sourced from
    ``config/segments.yaml`` when present. Segment polling is best-effort:
    a failure prints to stderr but does not change the return code, similar
    to Phase 5.5 stream-refresh tolerance.
    """
    import json as _json

    from customer_hydration.phase5.data_cloud import (
        get_org_session,
        poll_stream_run_status,
    )
    output_dir = Path(args.output_dir)
    yaml_path = Path(args.config_dir) / "segments.yaml"
    have_segments_yaml = yaml_path.exists()

    # Find the manifest (stream section is optional when segments.yaml exists)
    manifest_path: Path | None = None
    if getattr(args, "run_id", None):
        candidate = output_dir / args.run_id / "manifest.json"
        if candidate.exists():
            manifest_path = candidate
    else:
        # Latest run with a DataCloud_Stream_Refresh section
        candidates = sorted(output_dir.glob("run-*/manifest.json"), reverse=True)
        for p in candidates:
            try:
                m = _json.loads(p.read_text(encoding="utf-8"))
                if "DataCloud_Stream_Refresh" in m.get("object_status", {}):
                    manifest_path = p
                    break
            except Exception:
                continue

    stream_failed = 0
    stream_section_ok = False
    if manifest_path is None:
        if not have_segments_yaml:
            print(
                f"No run with Data Cloud stream refresh found in {output_dir}",
                file=sys.stderr,
            )
            return 2
        # No manifest, but segments.yaml exists — note it and fall through to
        # the segment view. We still surface the missing manifest on stderr so
        # the caller can tell stream output was skipped.
        print(
            f"No run with Data Cloud stream refresh found in {output_dir}",
            file=sys.stderr,
        )
    else:
        manifest = _json.loads(manifest_path.read_text(encoding="utf-8"))
        dc_section = manifest.get("object_status", {}).get(
            "DataCloud_Stream_Refresh", {}
        )
        stream_runs = dc_section.get("stream_runs", [])
        if not stream_runs:
            print(f"No stream runs in {manifest_path}")
            if not have_segments_yaml:
                return 0
        else:
            if args.target_org is None:
                print("--target-org required for live polling", file=sys.stderr)
                return 2

            instance_url, access_token = get_org_session(args.target_org)

            rows = []
            complete = 0
            in_progress = 0
            failed = 0
            for sr in stream_runs:
                run_id = sr.get("run_id")
                if not run_id:
                    rows.append((
                        sr.get("stream_api_name"), sr.get("source_object"),
                        "NoRunId", 0,
                    ))
                    failed += 1
                    continue
                try:
                    state = poll_stream_run_status(
                        instance_url, access_token, run_id,
                    )
                    status = (
                        state.get("status")
                        or state.get("runStatus")
                        or "Unknown"
                    )
                    rows_processed = (
                        state.get("rowsProcessed")
                        or state.get("recordsProcessed")
                        or 0
                    )
                    rows.append((
                        sr.get("stream_api_name"),
                        sr.get("source_object"),
                        status,
                        rows_processed,
                    ))
                    if status in ("Success", "Completed"):
                        complete += 1
                    elif status in ("Failed", "Error"):
                        failed += 1
                    else:
                        in_progress += 1
                except Exception as exc:  # noqa: BLE001 — surfaced in row
                    rows.append((
                        sr.get("stream_api_name"),
                        sr.get("source_object"),
                        f"Err: {exc}",
                        0,
                    ))
                    failed += 1

            if args.json:
                print(_json.dumps(
                    {
                        "rows": rows,
                        "complete": complete,
                        "in_progress": in_progress,
                        "failed": failed,
                    },
                    indent=2,
                ))
            else:
                print(f"\nCustomer_Hydration  ·  Data Cloud stream status")
                print(f"Run: {manifest_path.parent.name}")
                print(f"---")
                print(
                    f"{'Stream':35s} {'Source':30s} "
                    f"{'Status':12s} {'Rows':>10s}"
                )
                print(f"---")
                for stream, source, status, rows_processed in rows:
                    print(
                        f"{stream:35s} {source:30s} "
                        f"{status:12s} {rows_processed:>10}"
                    )
                print(f"---")
                print(
                    f"{complete} complete · {in_progress} in progress · "
                    f"{failed} failed"
                )

            stream_failed = failed
            stream_section_ok = True

    # NEW Phase 2 — segment publication state from segments.yaml
    segment_section_ok = False
    if args.target_org:
        if yaml_path.exists():
            try:
                from customer_hydration.phase5.segments import load_segment_definitions
                from customer_hydration.phase5.data_cloud import (
                    get_org_session, get_segment_status,
                )
                instance_url, access_token = get_org_session(args.target_org)
                definitions = load_segment_definitions(yaml_path)
                print()
                print("=== Segments ===")
                segment_complete = 0
                segment_in_progress = 0
                segment_failed = 0
                for sd in definitions:
                    status = get_segment_status(
                        instance_url, access_token, api_name=sd.api_name,
                    )
                    member_str = (
                        f"{status.member_count:,}"
                        if status.member_count is not None
                        else "?"
                    )
                    last_str = status.last_publish_time or "never"
                    print(f"  {sd.api_name:42s} {status.status:12s} "
                          f"members={member_str:>10s}  last={last_str}")
                    if status.status == "PUBLISHED":
                        segment_complete += 1
                    elif status.status in ("FAILED", "NOT_FOUND"):
                        segment_failed += 1
                    else:
                        segment_in_progress += 1
                print(
                    f"---\n{segment_complete} published, {segment_in_progress} in progress, "
                    f"{segment_failed} failed"
                )
                segment_section_ok = True
            except Exception as exc:
                print(f"Segment polling failed: {exc}", file=sys.stderr)
    else:
        if yaml_path.exists():
            print(
                "(Segments not polled — pass --target-org to enable segment view)",
                file=sys.stderr,
            )

    # If neither section produced output, surface a non-zero rc so callers
    # (and the existing "no runs" smoke test) can tell dc-status had nothing
    # actionable to report.
    if not stream_section_ok and not segment_section_ok:
        return 2
    return 0 if stream_failed == 0 else 2


# ---------------------------------------------------------------------------
# Phase 2 / Task 5 — refresh-streams subcommand
# ---------------------------------------------------------------------------


def _run_refresh_streams(args: argparse.Namespace) -> int:
    """Refresh DC streams sourcing from hydrated objects (Phase 2)."""
    if args.target_org is None:
        print("--target-org is required", file=sys.stderr)
        return 2

    runner = SfRunner(args.target_org)
    org_info = runner._run([  # noqa: SLF001 — same pattern as _run_reset
        "sf", "org", "display", "--target-org", args.target_org, "--json",
    ])
    is_sandbox = bool(org_info.get("result", {}).get("isSandbox", False))
    if not is_sandbox and not getattr(args, "allow_production", False):
        print(
            f"Refusing to refresh streams in non-sandbox org {args.target_org}. "
            f"Pass --allow-production to override.",
            file=sys.stderr,
        )
        return 2

    from customer_hydration.phase5.segments import execute_refresh_streams
    result = execute_refresh_streams(target_org=args.target_org)

    from datetime import datetime, timezone
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M")
    manifest_path = Path(args.output_dir) / f"refresh-streams-{ts}.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps({
        "target_org": args.target_org,
        "streams_discovered": result.streams_discovered,
        "streams_matched": result.streams_matched,
        "streams_triggered": result.streams_triggered,
        "streams_policy_skipped": result.streams_policy_skipped,
        "stream_runs": [
            {
                "stream_api_name": sr.stream_api_name,
                "source_object": sr.source_object,
                "run_id": sr.run_id,
                "status": sr.status,
                "triggered_at": sr.triggered_at,
                "error": sr.error,
            }
            for sr in result.stream_runs
        ],
        "stream_trigger_failures": result.stream_trigger_failures,
    }, indent=2), encoding="utf-8")

    print(
        f"Refreshed {result.streams_triggered} of "
        f"{result.streams_matched} matched streams "
        f"({result.streams_policy_skipped} skipped by org policy)"
    )
    print(f"Manifest: {manifest_path}")
    # Phase 5.5 fire-and-forget: even with trigger failures, exit 0
    return 0


# ---------------------------------------------------------------------------
# Phase 2 / Task 6 — create-segments subcommand
# ---------------------------------------------------------------------------


def _run_create_segments(args):
    from pathlib import Path
    import os, sys

    yaml_path = Path(args.config_dir) / "segments.yaml"

    # Probe-relative-dates does not require the YAML to exist, but recreate and
    # the default create path do.
    if not args.probe_relative_dates and not yaml_path.exists():
        print(f"segments.yaml not found at {yaml_path}", file=sys.stderr)
        return 2

    if args.probe_relative_dates:
        try:
            instance_url, access_token = get_org_session(args.target_org)
        except Exception as exc:
            print(f"Probe FAILED to authenticate: {exc}", file=sys.stderr)
            return 3
        result = probe_relative_date_filter(instance_url, access_token)
        artifact_path = Path(args.probe_artifact)
        write_probe_artifact(artifact_path, result)
        print(f"Probe verdict: {result.verdict}")
        print(f"  target_dmo={result.target_dmo}  field={result.field}  days={result.days}")
        print(f"  recent={result.count_recent}  old={result.count_old}  frozen={result.count_recent_frozen}")
        print(f"Artifact: {artifact_path}")
        return 0

    # Make the recently-written probe artifact visible to the translator.
    probe_artifact = Path(args.probe_artifact)
    if probe_artifact.exists():
        os.environ["PHASE3D_PROBE_ARTIFACT"] = str(probe_artifact)

    if args.recreate is not None:
        result = execute_recreate_segments(
            target_org=args.target_org,
            yaml_path=yaml_path,
            pattern=args.recreate,
            dry_run=args.dry_run,
        )
        print(f"recreated={result.segments_recreated} "
              f"failed={result.segments_failed} "
              f"processed={result.segments_processed}")
        for r in result.results:
            tag = "OK" if r.created else ("FAIL" if r.error else "SKIP")
            print(f"  [{tag}] {r.config_key} ({r.api_name}) {r.error or ''}")
        return 0 if result.segments_failed == 0 else 2

    # Default path: existing create-or-skip behavior.
    if not args.dry_run:
        if args.target_org is None:
            print("--target-org is required (unless --dry-run)", file=sys.stderr)
            return 2
    # Import locally to maintain compatibility with existing test patches.
    from customer_hydration.phase5.segments import execute_create_segments as _exec_create
    result = _exec_create(
        target_org=args.target_org,
        yaml_path=yaml_path,
        segment_id=args.segment_id,
        skip_publish=args.skip_publish,
        dry_run=args.dry_run,
    )
    print(f"created={result.segments_created} "
          f"skipped={result.segments_skipped} "
          f"failed={result.segments_failed} "
          f"processed={result.segments_processed}")
    # Fire-and-forget: keep backward compatibility, always exit 0
    return 0


# ---------------------------------------------------------------------------
# Plan 6 / Task 2 — briefs subcommand
# ---------------------------------------------------------------------------


def _run_briefs(args: argparse.Namespace) -> int:
    """Generate per-banker brief MD files from live org data."""
    if args.target_org is None:
        print("--target-org is required", file=sys.stderr)
        return 2

    from customer_hydration.briefs import generate_brief, generate_index
    from customer_hydration.sf_runner import SfRunner

    rm_pool_path = Path(args.config_dir) / "rm_pool.yaml"
    rm_pool = yaml.safe_load(rm_pool_path.read_text())

    rms = rm_pool["rms"]
    if args.rm:
        rms = {
            k: v for k, v in rms.items()
            if args.rm in (v["name"], v["user_id"], k)
        }
        if not rms:
            print(f"No banker matches --rm {args.rm!r}", file=sys.stderr)
            return 2

    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    runner = SfRunner(args.target_org)

    summary_rows = []
    for slug, banker in rms.items():
        try:
            brief = generate_brief(runner=runner, slug=slug, banker=banker)
            path = output_dir / f"{slug.replace('_', '-')}.md"
            path.write_text(brief.markdown, encoding="utf-8")
            summary_rows.append(brief.summary_row)
            print(f"  Generated {path}")
        except Exception as exc:  # noqa: BLE001 — surfaced per banker, run continues
            print(f"  FAILED for {slug}: {exc}", file=sys.stderr)

    if summary_rows:
        index_path = output_dir.parent / "BANKER_BRIEFS.md"
        index_md = generate_index(summary_rows)
        index_path.write_text(index_md, encoding="utf-8")
        print(f"  Generated {index_path}")

    print(f"Generated {len(summary_rows)} briefs in {output_dir}/")
    return 0
