"""Mirror legacy ``FinServ__LifeEvent__c`` rows to native ``PersonLifeEvent``.

The augment-phase3 flow generates a fresh life-event plan and writes both
lineages from the same plan, but plan/regen drift across runs (and the
fact that the legacy lineage was loaded ahead of the native generator
even existing) leaves the two lineages with mismatched row counts:

  Today on jdo-uqj0jr: legacy 12,518 vs native 6,259.

This module closes that gap deterministically by **mirroring** — querying
every existing ``HYDRATE-LE-*`` row from the org and writing a matching
``HYDRATE-NLE-*`` row with:

  - the SAME numeric sequence (so HYDRATE-LE-007842 → HYDRATE-NLE-007842),
  - the same ``Client.External_ID__c`` → resolved auto-Contact,
  - the same ``EventDate`` (anchored to midnight UTC for xsd:dateTime),
  - the legacy ``FinServ__EventType__c`` translated via
    ``LEGACY_TO_NATIVE_EVENT_TYPE``.

Idempotent: re-running upserts the same External_ID__c rows. Future
legacy adds re-mirror automatically without recomputing a plan.
"""
from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Iterable

from customer_hydration.csv_writer import write_csv
from customer_hydration.loader.id_resolver import (
    IdResolver,
    rewrite_csv_resolve_markers,
)
from customer_hydration.loader.parallel import (
    CsvLoadSpec,
    RetryPolicy,
    run_wave_parallel,
)
from customer_hydration.loader.wave import Wave
from customer_hydration.manifest import new_run_manifest
from customer_hydration.native.person_life_event import (
    NativePersonLifeEventRequest,
    generate_native_person_life_events,
    map_legacy_event_type,
)
from customer_hydration.preflight import run_preflight
from customer_hydration.seek import parse_seq_from_external_id
from customer_hydration.sf_runner import SfRunner


@dataclass
class LegacyRow:
    """A single legacy LifeEvent — only the fields we need for mirroring."""

    seq: int
    client_external_id: str
    event_type: str  # legacy picklist value
    event_date: date


def fetch_legacy_rows(runner: SfRunner) -> list[LegacyRow]:
    """Query every HYDRATE-LE-* legacy LifeEvent and parse it.

    The query joins through the FinServ__Client__r relationship so the
    Person Account External_ID__c comes back inline — no second SOQL pass
    needed. Rows whose seq fails to parse, whose client External_ID is
    missing, or whose event_type isn't in the legacy → native map are
    skipped (with a warning) so a single bad legacy row doesn't break
    the mirror.
    """
    soql = (
        "SELECT FinServ__SourceSystemId__c, "
        "FinServ__Client__r.External_ID__c, "
        "FinServ__EventType__c, FinServ__EventDate__c "
        "FROM FinServ__LifeEvent__c "
        "WHERE FinServ__SourceSystemId__c LIKE 'HYDRATE-LE-%' "
        "ORDER BY FinServ__SourceSystemId__c"
    )
    raw = runner.query(soql)
    rows: list[LegacyRow] = []
    skipped: list[str] = []
    for r in raw:
        ssid = r.get("FinServ__SourceSystemId__c")
        seq = parse_seq_from_external_id(ssid)
        if seq is None:
            skipped.append(f"unparseable: {ssid!r}")
            continue
        client_ref = r.get("FinServ__Client__r") or {}
        client_ext = client_ref.get("External_ID__c") if isinstance(client_ref, dict) else None
        if not client_ext:
            skipped.append(f"{ssid}: no Client.External_ID__c")
            continue
        event_type = r.get("FinServ__EventType__c")
        if not event_type:
            skipped.append(f"{ssid}: no EventType")
            continue
        event_date_raw = r.get("FinServ__EventDate__c")
        if not event_date_raw:
            skipped.append(f"{ssid}: no EventDate")
            continue
        try:
            event_date = date.fromisoformat(event_date_raw[:10])
        except ValueError:
            skipped.append(f"{ssid}: bad EventDate {event_date_raw!r}")
            continue
        rows.append(LegacyRow(
            seq=seq,
            client_external_id=client_ext,
            event_type=event_type,
            event_date=event_date,
        ))

    if skipped:
        print(
            f"  WARN: skipped {len(skipped)} legacy row(s); first 3: "
            f"{skipped[:3]}",
            file=sys.stderr,
        )
    return rows


def _query_existing_native_seqs(runner: SfRunner) -> set[int]:
    """Return the set of HYDRATE-NLE-* seqs already in the org.

    Used to skip rows on the mirror's insert pass — existing native rows
    can't be Bulk-upserted because EventType / PrimaryPersonId are
    updateable=False on PersonLifeEvent.
    """
    rows = runner.query(
        "SELECT External_ID__c FROM PersonLifeEvent "
        "WHERE External_ID__c LIKE 'HYDRATE-NLE-%'"
    )
    seqs: set[int] = set()
    for r in rows:
        seq = parse_seq_from_external_id(r.get("External_ID__c"))
        if seq is not None:
            seqs.add(seq)
    return seqs


def to_native_requests(
    legacy_rows: Iterable[LegacyRow],
) -> list[NativePersonLifeEventRequest]:
    """Translate legacy rows into native generator inputs.

    Legacy rows whose ``event_type`` isn't in ``LEGACY_TO_NATIVE_EVENT_TYPE``
    are skipped (with a warning) — better to leave a gap than to fabricate
    a bogus native row. In jdo-uqj0jr today, every legacy event_type
    has a mapping so this branch is dead, but it stays as a safety net.
    """
    out: list[NativePersonLifeEventRequest] = []
    skipped = 0
    for row in legacy_rows:
        try:
            native_type = map_legacy_event_type(row.event_type)
        except KeyError:
            skipped += 1
            continue
        out.append(NativePersonLifeEventRequest(
            client_account_external_id=row.client_external_id,
            event_type=native_type,
            event_date=row.event_date,
        ))
    if skipped:
        print(
            f"  WARN: skipped {skipped} row(s) with unmapped legacy "
            f"event_type",
            file=sys.stderr,
        )
    return out


def _generate_native_rows_with_legacy_seqs(
    legacy_rows: list[LegacyRow],
) -> list[dict]:
    """Materialize native rows preserving the legacy seq numbers.

    The standard ``generate_native_person_life_events`` takes a single
    ``starting_seq`` and increments per-row — but the mirror needs each
    row to land on its OWN legacy-derived seq so HYDRATE-LE-007842
    pairs with HYDRATE-NLE-007842 deterministically across re-runs.

    We invoke the generator one row at a time so we can pass each row's
    ``starting_seq`` independently. Cheap (Python loop over generator
    calls is microseconds per row) and avoids forking the generator.
    """
    native_rows: list[dict] = []
    for row in legacy_rows:
        try:
            native_type = map_legacy_event_type(row.event_type)
        except KeyError:
            continue
        bundle = generate_native_person_life_events(
            starting_seq=row.seq,
            requests=[NativePersonLifeEventRequest(
                client_account_external_id=row.client_external_id,
                event_type=native_type,
                event_date=row.event_date,
            )],
        )
        native_rows.extend(bundle.rows)
    return native_rows


def run_mirror(args: argparse.Namespace) -> int:
    """Mirror entry point. Returns process exit code."""
    if args.target_org is None:
        print("--target-org is required", file=sys.stderr)
        return 2

    runner = SfRunner(args.target_org)

    # Sandbox / production guard.
    org_info = runner._run([  # noqa: SLF001 — same pattern as augment
        "sf", "org", "display", "--target-org", args.target_org, "--json",
    ])
    is_sandbox = bool(org_info.get("result", {}).get("isSandbox", False))
    if not is_sandbox and not getattr(args, "allow_production", False):
        print(
            f"Refusing to mirror in non-sandbox org {args.target_org}. "
            f"Pass --allow-production to override.",
            file=sys.stderr,
        )
        return 2

    print("Querying legacy FinServ__LifeEvent__c rows...")
    legacy_rows = fetch_legacy_rows(runner)
    print(f"Found {len(legacy_rows)} legacy rows.")
    if not legacy_rows:
        print("No HYDRATE-LE-* rows in target org. Nothing to mirror.")
        return 0

    # Existing native rows: PersonLifeEvent.EventType and PrimaryPersonId
    # are insert-only (updateable=False). Re-upserting an existing row
    # via Bulk fails with INVALID_FIELD_FOR_INSERT_UPDATE on those
    # columns. Filter the mirror plan to seqs that don't yet exist on
    # the native side — that's strictly an insert pass, no updates.
    existing_native_seqs = _query_existing_native_seqs(runner)
    print(f"Existing HYDRATE-NLE-* rows: {len(existing_native_seqs)}.")
    legacy_rows = [r for r in legacy_rows if r.seq not in existing_native_seqs]
    print(f"Mirror plan: {len(legacy_rows)} new native rows to insert.")
    if not legacy_rows:
        print("Native lineage already at parity with legacy. Nothing to do.")
        return 0

    # ---- Phase 0: preflight describe ----
    cache = run_preflight(runner, ["PersonLifeEvent"])

    # ---- Generate native rows with legacy seqs ----
    native_rows = _generate_native_rows_with_legacy_seqs(legacy_rows)
    print(f"Generated {len(native_rows)} native PersonLifeEvent rows.")

    # ---- Manifest + run dir ----
    manifest = new_run_manifest(
        target_org=args.target_org,
        seed=0,  # mirror is deterministic from org state, no seed needed
        flags={
            "subcommand": "mirror-life-events",
            "allow_production": bool(args.allow_production),
            "dry_run": bool(args.dry_run),
            "legacy_rows_in_scope": len(legacy_rows),
        },
    )
    manifest.run_id = manifest.run_id.replace("run-", "mirror-life-events-")
    run_dir = Path(args.output_dir) / manifest.run_id
    run_dir.mkdir(parents=True, exist_ok=True)

    nle_csv = run_dir / "person_life_events.csv"
    nle_write = write_csv(native_rows, "PersonLifeEvent", cache, nle_csv)
    manifest.object_status["PersonLifeEvent"] = {
        "csv_path": str(nle_csv),
        "rows_written": nle_write.rows_written,
        "dropped_fields": sorted(nle_write.dropped_fields),
    }

    if args.dry_run:
        manifest.exit_code = 0
        manifest.write(run_dir / "manifest.json")
        print(f"Dry-run: CSV written to {nle_csv} but not loaded.")
        return 0

    # ---- Resolve Person Account auto-Contact ids ----
    resolver = IdResolver()
    resolver.populate_from_org(runner, "Account")
    print(
        f"Resolver: {len(resolver.contact_id_by_account_external_id)} "
        f"Person Account auto-Contact(s) loaded."
    )

    kept, dropped = rewrite_csv_resolve_markers(
        nle_csv, {"PrimaryPersonId": "contact"}, resolver,
    )
    if dropped:
        print(
            f"  WARN: {dropped} row(s) dropped (unresolved PrimaryPersonId)"
        )

    # ---- Upsert ----
    print(f"Wave A: upserting {kept} native life events...")
    wave_a = Wave(
        name="A-mirror",
        sobjects=("PersonLifeEvent",),
        depends_on=(),
        parallel=False,
        description="Mirror Wave A: native PersonLifeEvent",
    )
    wave_result = run_wave_parallel(
        wave=wave_a,
        specs=[CsvLoadSpec(
            sobject="PersonLifeEvent",
            csv_path=nle_csv,
            external_id_field="External_ID__c",
        )],
        target_org=args.target_org,
        parallel=1,
        retry=RetryPolicy(),
    )
    for r in wave_result.csv_results:
        if r.error:
            print(f"  PersonLifeEvent load FAILED: {r.error}", file=sys.stderr)
        else:
            print(
                f"  PersonLifeEvent: {r.records_processed - r.records_failed}/"
                f"{r.records_processed} ok in {r.duration_s:.1f}s"
            )

    failed = sum(
        (r.error is not None) or (r.records_failed > 0)
        for r in wave_result.csv_results
    )
    manifest.exit_code = 0 if failed == 0 else 2
    manifest.write(run_dir / "manifest.json")
    print(f"Done. Manifest: {run_dir / 'manifest.json'}")
    return manifest.exit_code
