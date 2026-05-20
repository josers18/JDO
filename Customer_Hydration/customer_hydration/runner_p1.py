"""Plan 1 runner: retail-only smoke.

Wires Phase 0 preflight + retail generator + CSV writer + bulk loader
+ manifest. Replaced by a full multi-wave orchestrator in Plan 3.
"""
from __future__ import annotations

import argparse
import sys
from datetime import date
from pathlib import Path

import yaml

from customer_hydration.csv_writer import write_csv
from customer_hydration.generators.retail import generate_retail
from customer_hydration.loader import bulk_upsert
from customer_hydration.manifest import new_run_manifest
from customer_hydration.preflight import run_preflight
from customer_hydration.seek import compute_next_seq
from customer_hydration.sf_runner import SfRunner


PHASE0_OBJECTS = [
    "Account",
    "FinServ__FinancialAccount__c",
    "FinServ__FinancialAccountRole__c",
    "RecordType",
]


def run_retail_only(args: argparse.Namespace) -> int:
    if args.target_org is None:
        print("--target-org is required", file=sys.stderr)
        return 2

    runner = SfRunner(args.target_org)

    # Production guard
    org_info = runner._run([  # noqa: SLF001 — using internal _run intentionally
        "sf", "org", "display", "--target-org", args.target_org, "--json"
    ])
    is_sandbox = bool(org_info.get("result", {}).get("isSandbox", False))
    if not is_sandbox and not args.allow_production:
        print(
            f"Refusing to run against non-sandbox org {args.target_org}. "
            f"Pass --allow-production to override.",
            file=sys.stderr,
        )
        return 2

    # Load configs
    config_dir = Path(args.config_dir)
    rm_pool = yaml.safe_load((config_dir / "rm_pool.yaml").read_text())
    catalog = yaml.safe_load((config_dir / "product_catalog.yaml").read_text())

    # Pick the retail RM pool (Plan 1 uses Justin Chen + Standard User)
    retail_rm_ids = [
        rm["user_id"]
        for rm in rm_pool["rms"].values()
        if rm["role_family"] == "retail"
    ]

    # Phase 0 — pre-flight describe
    cache = run_preflight(runner, PHASE0_OBJECTS)

    # Resolve FSC Person Account RT Id at runtime
    rt_rows = runner.query(
        "SELECT Id FROM RecordType WHERE SobjectType='Account' "
        "AND DeveloperName='FSC_Person_Accounts' AND IsActive=true "
        "ORDER BY CreatedDate DESC LIMIT 1"
    )
    if not rt_rows:
        print("No active FSC_Person_Accounts RecordType found in target org.", file=sys.stderr)
        return 2
    person_rt_id = rt_rows[0]["Id"]

    # Compute External-ID seek pointers
    starting_seq_account = compute_next_seq(runner, "HYDRATE-RT", "Account")
    starting_seq_fa = compute_next_seq(runner, "HYDRATE-FA", "FinServ__FinancialAccount__c")
    if starting_seq_account != starting_seq_fa:
        # Plan 1 invariant: retail generator emits one FA per Account, so the
        # sequences should advance together. If they're out of sync, an earlier
        # partial load left orphans — refuse.
        print(
            f"Sequence drift: HYDRATE-RT next={starting_seq_account}, "
            f"HYDRATE-FA next={starting_seq_fa}. Investigate before re-running.",
            file=sys.stderr,
        )
        return 2

    # Generate
    bundle = generate_retail(
        n=args.retail,
        seed=args.seed,
        starting_seq=starting_seq_account,
        rm_user_ids=retail_rm_ids,
        anchor_date=date(2026, 5, 19),
        person_account_rt_id=person_rt_id,
        checking_product_code=catalog["products"]["pd_chk_evd"]["code"],
    )

    # Set up output dir + manifest
    manifest = new_run_manifest(
        target_org=args.target_org,
        seed=args.seed,
        flags={
            "retail": args.retail,
            "personas": ["retail"],
            "skip_natives": True,
            "skip_apex_wireup": True,
            "skip_data_cloud": True,
        },
    )
    run_dir = Path(args.output_dir) / manifest.run_id
    run_dir.mkdir(parents=True, exist_ok=True)

    # Write CSVs
    csv_specs = [
        ("Account", bundle.accounts, run_dir / "accounts.csv"),
        ("FinServ__FinancialAccount__c", bundle.financial_accounts, run_dir / "financial_accounts.csv"),
        ("FinServ__FinancialAccountRole__c", bundle.financial_account_roles, run_dir / "fa_roles.csv"),
    ]
    for sobject, rows, path in csv_specs:
        write_result = write_csv(rows, sobject, cache, path)
        manifest.object_status[sobject] = {
            "csv_path": str(path),
            "rows_written": write_result.rows_written,
            "dropped_fields": sorted(write_result.dropped_fields),
        }

    if args.dry_run:
        print(f"Dry run — CSVs written to {run_dir}, no bulk load performed.")
        manifest.exit_code = 0
        manifest.write(run_dir / "manifest.json")
        return 0

    # Bulk load in dependency order. Account first (no parent), then FA (refs
    # Account via External_ID__c), then FA Role (refs both).
    # Note: the generator emits raw HYDRATE-RT-* values in FinServ__PrimaryOwner__c.
    # The sf-CLI external-id-reference syntax requires the column header itself
    # to be `FinServ__PrimaryOwner__c:Account:External_ID__c`. For Plan 1 we
    # post-process the CSV header in-place before loading the FA CSV.
    _rewrite_fa_header(run_dir / "financial_accounts.csv")
    _rewrite_fa_role_headers(run_dir / "fa_roles.csv")

    for sobject, _rows, path in csv_specs:
        result = bulk_upsert(path, sobject, "External_ID__c", args.target_org)
        manifest.object_status[sobject].update({
            "records_processed": result.records_processed,
            "records_failed": result.records_failed,
        })
        if result.records_failed > 0:
            print(f"{sobject}: {result.records_failed} failed records — see Bulk API logs.")

    manifest.exit_code = 0
    manifest.write(run_dir / "manifest.json")
    print(f"Done. Manifest: {run_dir / 'manifest.json'}")
    return 0


def _rewrite_fa_header(csv_path: Path) -> None:
    """Replace the FinServ__PrimaryOwner__c column with the external-id-reference form."""
    text = csv_path.read_text(encoding="utf-8")
    lines = text.splitlines()
    if not lines:
        return
    header = lines[0]
    # Idempotency guard — bail if already rewritten.
    if ":Account:External_ID__c" in header:
        return
    new_header = header.replace(
        "FinServ__PrimaryOwner__c",
        "FinServ__PrimaryOwner__c:Account:External_ID__c",
    )
    if new_header == header:
        return
    csv_path.write_text("\n".join([new_header, *lines[1:]]) + "\n", encoding="utf-8")


def _rewrite_fa_role_headers(csv_path: Path) -> None:
    """Replace the two parent reference columns with external-id-reference forms."""
    text = csv_path.read_text(encoding="utf-8")
    lines = text.splitlines()
    if not lines:
        return
    header = lines[0]
    # Idempotency guard — bail if already rewritten.
    if ":External_ID__c" in header:
        return
    header = header.replace(
        "FinServ__FinancialAccount__c",
        "FinServ__FinancialAccount__c:FinServ__FinancialAccount__c:External_ID__c",
    )
    header = header.replace(
        "FinServ__Account__c",
        "FinServ__Account__c:Account:External_ID__c",
    )
    csv_path.write_text("\n".join([header, *lines[1:]]) + "\n", encoding="utf-8")
