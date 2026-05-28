"""Phase 4 backfill orchestrator.

Reads existing Account records, builds a PersonaArchetype per record, runs
the deriver registry (with per-deriver exception isolation), runs the
coverage-rules pass, null-filters, writes a sparse CSV, and (unless --dry-run)
bulk-upserts via External_ID__c and triggers the Account DC stream refresh.

Spec: docs/superpowers/specs/2026-05-26-phase-4-account-backfill-design.md
"""
from __future__ import annotations

import json
import logging
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from customer_hydration.backfill.dc_refresh import refresh_account_stream
from customer_hydration.backfill.exit_codes import (
    OK,
    BULK_HARD_FAILURE,
    BULK_PARTIAL_FAILURE,
    PRODUCTION_GUARD,
)
from customer_hydration.backfill.preflight import (
    filter_picklist_yaml_to_org,
    find_picklist_drift,
    find_unwritable_fields,
    install_picklist_overrides,
    numeric_field_constraints,
    value_exceeds_field_range,
)
from customer_hydration.backfill.value_translator import translate_delta
from customer_hydration.backfill.production_guard import enforce_production_guard
from customer_hydration.backfill.query import fetch_account_chunks
from customer_hydration.backfill.upsert import (
    PARTIAL_FAILURE_THRESHOLD_PCT,
    upsert_to_org,
    write_sparse_csv,
)
from customer_hydration.coverage_rules import apply_coverage_rules
from customer_hydration.derivers._archetype import build_archetype
from customer_hydration.derivers._helpers import seeded_rng
from customer_hydration.derivers._registry import Registry
from customer_hydration.sf_runner import SfRunner

logger = logging.getLogger(__name__)


def _build_registry() -> Registry:
    """Build the deriver registry with all derivers.

    Plan 4b: relationship, credit_personal, profile (person), demographics,
             addresses (person), contact (person).
    Plan 4c: credit_bureau (B2B). The Plan 4b derivers also got B2B branches
             added in Plan 4c, so they apply to both.
    Phase 5a: branch (BranchCode + BranchName from live BranchUnit + BUC).
    """
    from customer_hydration.derivers.relationship import RelationshipDeriver
    from customer_hydration.derivers.credit_personal import CreditPersonalDeriver
    from customer_hydration.derivers.credit_bureau import CreditBureauDeriver
    from customer_hydration.derivers.profile import ProfileDeriver
    from customer_hydration.derivers.demographics import DemographicsDeriver
    from customer_hydration.derivers.addresses import AddressesDeriver
    from customer_hydration.derivers.contact import ContactDeriver
    from customer_hydration.derivers.branch import BranchAssignmentDeriver

    registry = Registry()
    registry.register(RelationshipDeriver())
    registry.register(CreditPersonalDeriver())
    registry.register(CreditBureauDeriver())
    registry.register(ProfileDeriver())
    registry.register(DemographicsDeriver())
    registry.register(AddressesDeriver())
    registry.register(ContactDeriver())
    registry.register(BranchAssignmentDeriver())
    return registry


def _fetch_branch_lookup(runner: SfRunner) -> tuple[list[dict], dict[str, dict]]:
    """Pull BranchUnit + BranchUnitCustomer once. Returns:

    - branch_units: list of {Id, BranchCode, Name} for state-weighted random.
    - canonical_by_account: dict mapping AccountId -> {BranchCode, Name} for
      the ~144 accounts that already have a canonical BranchUnitCustomer link.

    Live in jdo-uqj0jr (2026-05-27): 26 BranchUnit rows + 144 BUC rows. Both
    queries are tiny; one-shot at startup, no pagination needed.
    """
    branches: list[dict] = []
    canonical: dict[str, dict] = {}
    try:
        for row in runner.query(
            "SELECT Id, BranchCode, Name FROM BranchUnit WHERE BranchCode != null"
        ):
            branches.append({
                "Id": row.get("Id"),
                "BranchCode": row.get("BranchCode"),
                "Name": row.get("Name"),
            })
    except Exception as exc:
        logger.warning("BranchUnit fetch failed: %s — branch deriver will no-op", exc)
        return [], {}

    try:
        # Note: BUC stores BranchUnit as a lookup; dot-walk for code+name.
        for row in runner.query(
            "SELECT AccountId, BranchUnit.BranchCode, BranchUnit.Name "
            "FROM BranchUnitCustomer WHERE BranchUnit.BranchCode != null"
        ):
            account_id = row.get("AccountId")
            bu = row.get("BranchUnit") or {}
            if account_id and bu.get("BranchCode"):
                canonical[account_id] = {
                    "BranchCode": bu.get("BranchCode"),
                    "Name": bu.get("Name"),
                }
    except Exception as exc:
        logger.warning(
            "BranchUnitCustomer fetch failed: %s — falling back to state-weighted "
            "random for every row", exc,
        )

    logger.info(
        "branch lookup: %d BranchUnit rows, %d canonical BranchUnitCustomer links",
        len(branches), len(canonical),
    )
    return branches, canonical


def _resolve_org_id(target_org: str) -> str | None:
    """Look up the org id for a target alias via `sf org display`. None on failure."""
    import subprocess
    try:
        proc = subprocess.run(
            ["sf", "org", "display", "--target-org", target_org, "--json"],
            capture_output=True, text=True, check=False, timeout=30,
        )
        if proc.returncode != 0:
            return None
        payload = json.loads(proc.stdout)
        return payload.get("result", {}).get("id")
    except Exception:  # noqa: BLE001
        return None


def run_backfill(
    *,
    target_org: str,
    output_dir: Path,
    dry_run: bool = False,
    persona: str | None = None,
    record_type: str | None = None,
    limit: int | None = None,
    skip_refresh_stream: bool = False,
    strict: bool = False,
    # Plan 4d hotfix: default to True. Records without External_ID__c get
    # synthetic BACKFILL-<Id> stamps that Bulk treats as create-not-update,
    # which fails for org seed records (e.g., MDM rows on jdo-uqj0jr) because
    # __pc fields can't be set on non-person accounts during create. Operators
    # can pass require_external_id=False to opt back into the synthetic-id path.
    require_external_id: bool = True,
    allow_production: bool = False,
    records: list[dict] | None = None,
    life_events_by_id: dict[str, list[dict]] | None = None,
    sf_runner=None,
    account_stream_name: str | None = None,
) -> int:
    """Run the Phase 4 backfill against the target org.

    Returns an exit code from customer_hydration.backfill.exit_codes.

    When `records` is provided, the function uses them and never calls SOQL.
    When `records` is None, the function fetches via `sf_runner.query` (or a
    new SfRunner instance if `sf_runner` is None).
    """
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    started_at = datetime.now(timezone.utc).isoformat()

    # Production guard
    org_id = _resolve_org_id(target_org)
    if org_id:
        try:
            enforce_production_guard(org_id, allow_production=allow_production)
        except PermissionError as exc:
            _write_manifest(
                output_dir, target_org=target_org, started_at=started_at,
                rc=PRODUCTION_GUARD, errors=[str(exc)],
            )
            return PRODUCTION_GUARD

    registry = _build_registry()
    runner = sf_runner or SfRunner(target_org=target_org)

    # Writability preflight: describe Account once, drop fields the platform
    # won't accept on update (formula, rollup-summary, system audit fields,
    # managed-package read-only fields). Empty when describe fails — better
    # to attempt the upsert and let Bulk API report row-level rejections than
    # to over-drop and lose the run entirely.
    unwritable_fields = find_unwritable_fields(
        runner, "Account", registry.all_owned_fields(),
    )
    if unwritable_fields:
        logger.info(
            "writability preflight dropped %d field(s) from output: %s",
            len(unwritable_fields), sorted(unwritable_fields),
        )

    # Picklist drift preflight: load YAML, intersect each field's values with
    # the org's actual picklist values from describe, install a filtered
    # override so derivers' weighted_pick calls only use org-accepted values.
    from customer_hydration.derivers._helpers import _load_picklist_yaml
    yaml_dict = _load_picklist_yaml()
    picklist_drift = find_picklist_drift(runner, "Account", yaml_dict)
    if picklist_drift:
        for field, info in picklist_drift.items():
            if info.get("invalid"):
                logger.info(
                    "picklist preflight: %s — dropping YAML values not accepted "
                    "by org: %s",
                    field, info["invalid"],
                )
        filtered = filter_picklist_yaml_to_org(yaml_dict, picklist_drift)
        install_picklist_overrides(filtered)

    # Numeric range preflight: identify fields whose deriver output may exceed
    # the org's precision/scale (e.g., DNB Failure Score deriver generates
    # 1001-1610 but the org's field is precision=3 → max 999). Used per-row
    # to drop out-of-range values rather than reject the whole row.
    numeric_constraints = numeric_field_constraints(
        runner, "Account", registry.all_owned_fields(),
    )
    numeric_drops_count: dict[str, int] = {}

    # Fetch records (live SOQL) or use injected
    if records is None:
        all_chunks: list[list[dict]] = list(fetch_account_chunks(
            runner,
            owned_fields=registry.all_owned_fields(),
            persona=persona,
            record_type=record_type,
            chunk_size=2000,
            limit=limit,
        ))
        records = [r for chunk in all_chunks for r in chunk]
    if life_events_by_id is None:
        life_events_by_id = {}

    # Phase 5a: pull BranchUnit + BranchUnitCustomer once. Each record gets
    # _branch_units (full list) and _branch_unit_customer (canonical link, if
    # any) injected before deriver runs. Empty lookups = branch deriver no-ops.
    branch_units, canonical_branches = _fetch_branch_lookup(runner)

    # Derive
    rows_with_deltas = 0
    rows_skipped_already_full = 0
    rows_skipped_no_external_id = 0
    rows_with_deriver_errors = 0
    per_field_counts: Counter = Counter()
    per_persona_counts: Counter = Counter()
    output_buffer: list[dict[str, Any]] = []
    derivation_errors: list[dict] = []

    for record in records:
        rng = seeded_rng(record["Id"])
        archetype = build_archetype(
            record, rng,
            life_events=life_events_by_id.get(record["Id"], []),
        )
        # Phase 5a: enrich the record with branch lookups so the BranchAssignmentDeriver
        # can pick a code+name without doing I/O per row.
        record["_branch_units"] = branch_units
        canonical = canonical_branches.get(record["Id"])
        if canonical:
            record["_branch_unit_customer"] = canonical
        candidates = registry.run(archetype, record, rng)
        if registry.errors:
            rows_with_deriver_errors += 1
            derivation_errors.extend(registry.errors)

        delta = {f: v for f, v in candidates.items() if record.get(f) is None}
        apply_coverage_rules(archetype, record, delta, registry, rng)

        # Drop platform-rejected fields (formula/rollup/managed-pkg read-only).
        # The preflight ran once at startup and identified these from the
        # describe payload; here we just mask them out per-row.
        if unwritable_fields:
            delta = {f: v for f, v in delta.items() if f not in unwritable_fields}

        # Drop numeric values that exceed the org's precision/scale.
        # E.g., D&B Failure Score deriver emits 1001-1610 but the org's
        # field may be precision=3 → max 999.
        if numeric_constraints:
            for field in list(delta.keys()):
                constraint = numeric_constraints.get(field)
                if constraint and value_exceeds_field_range(delta[field], constraint):
                    numeric_drops_count[field] = numeric_drops_count.get(field, 0) + 1
                    del delta[field]

        # Translate spec-defined picklist outputs to the org's accepted vocabulary
        # (e.g., Tier=Diamond → A; ServiceModel=Premier → Tier 1). The translator
        # is a no-op for fields/values not in config/account_value_translator.yaml.
        delta = translate_delta(delta)

        if require_external_id and not record.get("External_ID__c"):
            rows_skipped_no_external_id += 1
            continue

        if not delta:
            rows_skipped_already_full += 1
            continue

        rows_with_deltas += 1
        per_persona_counts[archetype.persona] += 1
        for fname in delta:
            per_field_counts[fname] += 1

        output_buffer.append({
            "External_ID__c": record.get("External_ID__c") or f"BACKFILL-{record['Id']}",
            **delta,
        })

    # Write CSV (sparse, External_ID__c first, LF, properly escaped)
    csv_path = output_dir / "account_backfill.csv"
    write_sparse_csv(csv_path, output_buffer)

    # Bulk upsert (unless dry run)
    bulk_section: dict | None = None
    rc = OK
    if not dry_run and output_buffer:
        try:
            bulk_result = upsert_to_org(
                csv_path=csv_path, target_org=target_org,
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("Bulk upsert raised")
            bulk_section = {"status": "Error", "error": str(exc)}
            rc = BULK_HARD_FAILURE
        else:
            processed = getattr(bulk_result, "records_processed", 0) or 0
            failed = getattr(bulk_result, "records_failed", 0) or 0
            failed_pct = (100.0 * failed / processed) if processed else 0.0
            bulk_section = {
                "status": "OK" if failed == 0 else "PartialFailure",
                "rows_processed": processed,
                "rows_failed": failed,
                "failed_pct": round(failed_pct, 3),
            }
            if strict and failed > 0:
                rc = BULK_PARTIAL_FAILURE
            elif failed_pct > PARTIAL_FAILURE_THRESHOLD_PCT:
                rc = BULK_PARTIAL_FAILURE

    # DC refresh (unless dry run or skipped)
    dc_section: dict | None = None
    if not dry_run and not skip_refresh_stream:
        kwargs = {"target_org": target_org}
        if account_stream_name:
            kwargs["stream_name"] = account_stream_name
        status, run_id, fallback = refresh_account_stream(**kwargs)
        dc_section = {
            "status": status,
            "run_id": run_id,
            "fallback_message": fallback,
        }
        # PolicySkipped does NOT fail the run — it's expected when the stream
        # is configured for UPSERT refresh mode (AGENTS.md note 18).

    # Manifest
    completed_at = datetime.now(timezone.utc).isoformat()
    manifest = {
        "run_id": output_dir.name,
        "target_org": target_org,
        "started_at": started_at,
        "completed_at": completed_at,
        "rc": rc,
        "deriver_meta": {
            "fields_owned_by_derivers": registry.all_owned_fields(),
            "unwritable_fields_dropped": sorted(unwritable_fields),
            "picklist_drift": picklist_drift if picklist_drift else None,
        },
        "query": {
            "rows_queried": len(records),
            "filter": {"persona": persona, "record_type": record_type, "limit": limit},
        },
        "derivation": {
            "rows_with_deltas": rows_with_deltas,
            "rows_skipped_already_full": rows_skipped_already_full,
            "rows_skipped_no_external_id": rows_skipped_no_external_id,
            "rows_with_deriver_errors": rows_with_deriver_errors,
            "per_field_fill_counts": dict(per_field_counts),
            "per_persona_counts": dict(per_persona_counts),
        },
        "bulk_load": bulk_section,
        "dc_refresh": dc_section,
        "errors": derivation_errors,
    }
    (output_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))

    return rc


def _write_manifest(
    output_dir: Path,
    *,
    target_org: str,
    started_at: str,
    rc: int,
    errors: list[str],
) -> None:
    """Write a minimal manifest for early-exit paths (e.g., production guard)."""
    completed_at = datetime.now(timezone.utc).isoformat()
    manifest = {
        "run_id": output_dir.name,
        "target_org": target_org,
        "started_at": started_at,
        "completed_at": completed_at,
        "rc": rc,
        "errors": errors,
    }
    (output_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))
