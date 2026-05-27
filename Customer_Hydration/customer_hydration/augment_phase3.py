"""Phase 3 augment — backfill life events + campaign members on existing
HYDRATE-* accounts.

This is a one-shot tool that runs *after* a normal `hydrate.py hydrate`
flow has already loaded customers + their loan products. The Phase 3a
append run produces 11K accounts WITH loan subtypes but the runner
(``runner_p5``) only emits LifeEvents for wealth customers (one
"Retirement"@anchor each) and CampaignMembers were silently dropped
during the append run, leaving the org with effectively no campaign-
or life-event data tied to HYDRATE-* accounts.

Phase 3d's placeholder segments — ``WealthRecentLifeEvent`` and the 10
``Cmp*`` campaign-aligned segments — need varied life-event types
spread across a recent date window AND broad CampaignMember coverage to
produce non-trivial filter results. This module fills both gaps in
isolation: it does NOT touch Account/FinancialAccount/etc. — only adds
life events and campaign members keyed against existing HYDRATE-*
External_ID__c values.

Re-runnable. Sequence numbers are picked above the current org max so
re-running is a no-op for already-loaded rows.

Loader strategy:
  Wave A — FinServ__LifeEvent__c (no resolver dependency).
  Wave B — CampaignMember (depends on the resolver's Person Account →
           auto-Contact map; we populate it via a single SOQL post-Wave-A).
"""
from __future__ import annotations

import argparse
import random
import sys
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path

from customer_hydration.csv_writer import write_csv
from customer_hydration.generators.campaigns import (
    plan_campaign_members,
    generate_campaign_members,
)
from customer_hydration.generators.lifecycle import (
    LifeEventRequest,
    VALID_EVENT_TYPES,
    generate_life_events,
)
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


# Anchor date for the augment — keep stable so re-runs don't redrift dates.
ANCHOR_DATE = date(2026, 5, 20)

# Per-persona event-type weights. Wealth and SMB skew toward retirement /
# new-business respectively; retail spreads across family-stage events.
_EVENT_WEIGHTS: dict[str, dict[str, int]] = {
    "retail":     {"New Baby": 25, "New Job": 25, "New Home": 30,
                   "College": 15, "New Business": 3, "Retirement": 2},
    "wealth":     {"Retirement": 35, "New Home": 15, "College": 20,
                   "New Job": 15, "New Baby": 10, "New Business": 5},
    "smb":        {"New Business": 50, "New Job": 25, "New Home": 10,
                   "College": 5, "New Baby": 5, "Retirement": 5},
    "commercial": {"New Business": 60, "New Job": 25, "Retirement": 10,
                   "New Home": 3, "College": 1, "New Baby": 1},
}

# Probability that a given account gets a life event this run.
_LIFE_EVENT_PROB = 0.25
# Date-distribution split applied to selected accounts.
_PAST_PROB = 0.70   # event_date in the trailing 12 months
_FUTURE_PROB = 0.20  # event_date in the next 6 months
# Remaining 0.10 become "anchor-anchored" (event_date == ANCHOR_DATE) —
# realistic for "just announced" milestones and useful for "happened
# yesterday" demo phrases.

_PERSONA_FROM_PREFIX = {
    "RT": "retail",
    "WL": "wealth",
    "SB": "smb",
    "CM": "commercial",
}


@dataclass
class AugmentPlan:
    """All requests + computed seqs for a single augment run."""

    life_event_requests: list[LifeEventRequest]
    le_starting_seq: int
    nle_starting_seq: int
    cm_starting_seq: int
    persona_for_ext: dict[str, str]


def derive_persona(external_id: str) -> str | None:
    """Map ``HYDRATE-{XX}-NNNN`` → persona key, or None if not a customer.

    The ext-id prefix carries the persona — RT=retail, WL=wealth,
    SB=smb, CM=commercial. Other prefixes (HH=household, FA=financial
    account, etc.) return None and are skipped by the planner.
    """
    parts = external_id.split("-")
    if len(parts) < 3 or parts[0] != "HYDRATE":
        return None
    return _PERSONA_FROM_PREFIX.get(parts[1])


def query_hydrate_customers(runner: SfRunner) -> dict[str, str]:
    """Return ``{external_id: persona}`` for every customer-prefixed Account.

    Skips household (HH) / business (BUS) / non-customer Accounts whose
    External_IDs don't map to a persona. Insertion order is the External_ID
    sort the SOQL returns — deterministic for a given org state.
    """
    rows = runner.query(
        "SELECT External_ID__c FROM Account "
        "WHERE External_ID__c LIKE 'HYDRATE-%' "
        "ORDER BY External_ID__c"
    )
    out: dict[str, str] = {}
    for row in rows:
        ext = row.get("External_ID__c")
        if not ext:
            continue
        persona = derive_persona(ext)
        if persona is not None:
            out[ext] = persona
    return out


def _max_seq_via_field(
    runner: SfRunner, sobject: str, field_name: str, prefix: str,
) -> int:
    """Return the next free sequence for ``HYDRATE-{prefix}-NNNNNN`` rows.

    Generic over the idempotency-field name (LifeEvent uses
    SourceSystemId, CampaignMember uses External_ID__c).
    """
    soql = (
        f"SELECT {field_name} FROM {sobject} "
        f"WHERE {field_name} LIKE '{prefix}-%'"
    )
    rows = runner.query(soql)
    seqs = [
        s for r in rows
        if (s := parse_seq_from_external_id(r.get(field_name))) is not None
    ]
    return max(seqs, default=0) + 1


def plan_life_events(
    *,
    seed: int,
    anchor_date: date,
    persona_for_ext: dict[str, str],
) -> list[LifeEventRequest]:
    """Pick ~25% of accounts and assign each a persona-weighted event.

    Determinism: callers must pass the same ``seed``, ``anchor_date``,
    and ``persona_for_ext`` (insertion order preserved) to get the same
    request list. Re-running with the same inputs produces idempotent
    HYDRATE-LE-* loads (combined with seqs above the org max).
    """
    # Validate up-front — if the caller hands us an unknown persona,
    # surface every offender at once rather than failing per-element
    # only after the rng-skip filter happens to pick that row.
    bad = {
        ext_id: persona
        for ext_id, persona in persona_for_ext.items()
        if persona not in _EVENT_WEIGHTS
    }
    if bad:
        raise KeyError(
            f"Unknown persona(s): {bad!r}. Valid: {sorted(_EVENT_WEIGHTS)}"
        )

    rng = random.Random(seed)
    requests: list[LifeEventRequest] = []

    for ext_id, persona in persona_for_ext.items():
        if rng.random() >= _LIFE_EVENT_PROB:
            continue

        weights = _EVENT_WEIGHTS[persona]
        types_pop = list(weights.keys())
        types_w = list(weights.values())
        event_type = rng.choices(types_pop, weights=types_w, k=1)[0]
        if event_type not in VALID_EVENT_TYPES:
            # Defensive: a typo in _EVENT_WEIGHTS would surface here
            # rather than at load time.
            raise ValueError(
                f"Unknown event_type {event_type!r} for persona {persona!r}"
            )

        bucket = rng.random()
        if bucket < _PAST_PROB:
            event_date = anchor_date - timedelta(days=rng.randint(1, 365))
        elif bucket < _PAST_PROB + _FUTURE_PROB:
            event_date = anchor_date + timedelta(days=rng.randint(1, 180))
        else:
            event_date = anchor_date

        requests.append(LifeEventRequest(
            client_account_external_id=ext_id,
            event_type=event_type,
            event_date=event_date,
        ))

    return requests


def build_plan(
    runner: SfRunner, seed: int, anchor_date: date,
) -> AugmentPlan:
    """Query the org, compute seqs, build life-event + campaign plans."""
    persona_for_ext = query_hydrate_customers(runner)
    if not persona_for_ext:
        return AugmentPlan(
            life_event_requests=[],
            le_starting_seq=1,
            nle_starting_seq=1,
            cm_starting_seq=1,
            persona_for_ext={},
        )

    life_event_requests = plan_life_events(
        seed=seed,
        anchor_date=anchor_date,
        persona_for_ext=persona_for_ext,
    )
    le_seek = _max_seq_via_field(
        runner, "FinServ__LifeEvent__c", "FinServ__SourceSystemId__c",
        "HYDRATE-LE",
    )
    nle_seek = _max_seq_via_field(
        runner, "PersonLifeEvent", "External_ID__c", "HYDRATE-NLE",
    )
    cm_seek = _max_seq_via_field(
        runner, "CampaignMember", "External_ID__c", "HYDRATE-CMPMEM",
    )
    return AugmentPlan(
        life_event_requests=life_event_requests,
        le_starting_seq=le_seek,
        nle_starting_seq=nle_seek,
        cm_starting_seq=cm_seek,
        persona_for_ext=persona_for_ext,
    )


def _rewrite_parent_headers(csv_path: Path, replacements: dict[str, str]) -> None:
    """Replace each ``old_col -> new_col`` in the CSV header line.

    Mirrors runner_p5._rewrite_parent_headers — same semantics; not
    imported because that helper is private and pulling it in would
    couple the augment module to the full runner_p5 import graph.
    """
    if not csv_path.exists():
        return
    text = csv_path.read_text(encoding="utf-8")
    lines = text.splitlines()
    if not lines:
        return
    header = lines[0]
    cols = header.split(",")
    cols = [replacements.get(c, c) for c in cols]
    lines[0] = ",".join(cols)
    csv_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def run_augment(args: argparse.Namespace) -> int:
    """Augment-phase3 entry point. Returns process exit code."""
    if args.target_org is None:
        print("--target-org is required", file=sys.stderr)
        return 2

    runner = SfRunner(args.target_org)

    # Sandbox / production guard mirrors the main hydrate flow.
    org_info = runner._run([  # noqa: SLF001 — same pattern as runner_p3
        "sf", "org", "display", "--target-org", args.target_org, "--json",
    ])
    is_sandbox = bool(org_info.get("result", {}).get("isSandbox", False))
    if not is_sandbox and not getattr(args, "allow_production", False):
        print(
            f"Refusing to augment non-sandbox org {args.target_org}. "
            f"Pass --allow-production to override.",
            file=sys.stderr,
        )
        return 2

    plan = build_plan(runner, seed=args.seed, anchor_date=ANCHOR_DATE)
    print(
        f"Augment plan: {len(plan.persona_for_ext)} customers, "
        f"{len(plan.life_event_requests)} life events, "
        f"campaign-member seq starts at {plan.cm_starting_seq}.",
    )
    if not plan.persona_for_ext:
        print("No HYDRATE-* customers in target org. Nothing to augment.")
        return 0

    # ---- Phase 0: preflight describe for the 3 sObjects ------------------
    cache = run_preflight(
        runner,
        ["FinServ__LifeEvent__c", "PersonLifeEvent", "CampaignMember"],
    )

    # ---- Generate ---------------------------------------------------------
    life_events = generate_life_events(
        seed=args.seed + 100,
        starting_seq=plan.le_starting_seq,
        requests=plan.life_event_requests,
    ).life_events

    # FinServ__LifeEvent__c.Name is auto-number on this org (createable=False).
    # The generator emits a human-readable Name for spec parity, but Bulk
    # API rejects the column with INVALID_FIELD_FOR_INSERT_UPDATE. Strip
    # it here. Preflight's createable check would handle this generically;
    # for now, fix at the source.
    for row in life_events:
        row.pop("Name", None)

    # Native PersonLifeEvent — same per-customer plan, mapped to the
    # native picklist + linked via auto-Contact. DC ingests this lineage
    # via the PersonLifeEvent_Home stream; without it, the legacy custom
    # object's rows would never reach Data Cloud.
    native_le_requests = [
        NativePersonLifeEventRequest(
            client_account_external_id=req.client_account_external_id,
            event_type=map_legacy_event_type(req.event_type),
            event_date=req.event_date,
        )
        for req in plan.life_event_requests
    ]
    native_life_events = generate_native_person_life_events(
        starting_seq=plan.nle_starting_seq,
        requests=native_le_requests,
    ).rows

    # CampaignMember has a unique constraint on (CampaignId, ContactId)
    # that External_ID__c can't bypass — re-running the augment regenerates
    # the same persona-targeted pairs, which Bulk rejects with
    # DUPLICATE_VALUE. If the seq pointer is already past 1, a prior run
    # loaded the pairs; skip generation to keep the augment idempotent.
    if plan.cm_starting_seq > 1:
        print(
            f"  Skipping CampaignMember (cm_seek={plan.cm_starting_seq}) — "
            f"prior run already loaded the (Campaign, Contact) pairs."
        )
        campaign_members: list[dict] = []
    else:
        cm_plan = plan_campaign_members(
            seed=args.seed + 101,
            customer_personas=plan.persona_for_ext,
        )
        campaign_members = generate_campaign_members(
            seed=args.seed + 102,
            starting_seq=plan.cm_starting_seq,
            requests=cm_plan,
        ).members

        # CampaignMember.HasResponded is derived from Status on this org
        # (createable=False, calculated). The generator emits it for spec
        # parity but Bulk rejects the column. Strip here.
        for row in campaign_members:
            row.pop("HasResponded", None)

    # ---- Manifest + run dir ----------------------------------------------
    manifest = new_run_manifest(
        target_org=args.target_org,
        seed=args.seed,
        flags={
            "subcommand": "augment-phase3",
            "allow_production": bool(args.allow_production),
            "dry_run": bool(args.dry_run),
            "customers_in_scope": len(plan.persona_for_ext),
        },
    )
    # Distinguish from `run-*` so the augment dir doesn't collide with
    # the main hydration runner's output naming.
    manifest.run_id = manifest.run_id.replace("run-", "augment-phase3-")
    run_dir = Path(args.output_dir) / manifest.run_id
    run_dir.mkdir(parents=True, exist_ok=True)

    # ---- Write CSVs ------------------------------------------------------
    le_csv = run_dir / "life_events.csv"
    nle_csv = run_dir / "person_life_events.csv"
    cm_csv = run_dir / "campaign_members.csv"

    le_write = write_csv(life_events, "FinServ__LifeEvent__c", cache, le_csv)
    nle_write = write_csv(native_life_events, "PersonLifeEvent", cache, nle_csv)
    cm_write = write_csv(campaign_members, "CampaignMember", cache, cm_csv)

    manifest.object_status["FinServ__LifeEvent__c"] = {
        "csv_path": str(le_csv),
        "rows_written": le_write.rows_written,
        "dropped_fields": sorted(le_write.dropped_fields),
    }
    manifest.object_status["PersonLifeEvent"] = {
        "csv_path": str(nle_csv),
        "rows_written": nle_write.rows_written,
        "dropped_fields": sorted(nle_write.dropped_fields),
    }
    manifest.object_status["CampaignMember"] = {
        "csv_path": str(cm_csv),
        "rows_written": cm_write.rows_written,
        "dropped_fields": sorted(cm_write.dropped_fields),
    }

    # Header rewrites — parent-id external-id reference syntax.
    _rewrite_parent_headers(
        le_csv,
        {"FinServ__Client__c": "FinServ__Client__r.External_ID__c"},
    )
    _rewrite_parent_headers(
        cm_csv,
        {"CampaignId": "Campaign.External_ID__c"},
    )
    # Native PersonLifeEvent.PrimaryPersonId is resolved post-Account-query
    # via the IdResolver's Person Account → auto-Contact map. The CSV stays
    # with RESOLVE: markers until the rewrite step below.

    if args.dry_run:
        manifest.exit_code = 0
        manifest.write(run_dir / "manifest.json")
        print(f"Dry-run: CSVs written to {run_dir} but not loaded.")
        return 0

    # ---- Wave A: FinServ__LifeEvent__c upsert (no resolver dep) ----------
    print(f"Wave A: upserting {le_write.rows_written} legacy life events...")
    wave_a = Wave(
        name="A-augment",
        sobjects=("FinServ__LifeEvent__c",),
        depends_on=(),
        parallel=False,
        description="Augment Wave A: legacy LifeEvents",
    )
    wave_a_result = run_wave_parallel(
        wave=wave_a,
        specs=[CsvLoadSpec(
            sobject="FinServ__LifeEvent__c",
            csv_path=le_csv,
            external_id_field="FinServ__SourceSystemId__c",
        )],
        target_org=args.target_org,
        parallel=1,
        retry=RetryPolicy(),
    )
    for r in wave_a_result.csv_results:
        if r.error:
            print(f"  legacy LifeEvent load FAILED: {r.error}", file=sys.stderr)
        else:
            print(
                f"  legacy LifeEvent: {r.records_processed - r.records_failed}/"
                f"{r.records_processed} ok in {r.duration_s:.1f}s"
            )

    # ---- Resolve Person Account auto-Contact ids -------------------------
    resolver = IdResolver()
    resolver.populate_from_org(runner, "Account")
    print(
        f"Resolver: {len(resolver.contact_id_by_account_external_id)} "
        f"Person Account auto-Contact(s) loaded."
    )

    # Rewrite RESOLVE:HYDRATE-* markers in-place on both Contact-bearing
    # CSVs. CampaignMember.ContactId and PersonLifeEvent.PrimaryPersonId
    # both point at the auto-Contact, so a single resolver call serves
    # both. Drops any rows whose Account → Contact lookup fails (unlikely
    # — every Person Account gets an auto-Contact at insert time).
    cm_kept = 0
    if campaign_members:
        cm_kept, cm_dropped = rewrite_csv_resolve_markers(
            cm_csv, {"ContactId": "contact"}, resolver,
        )
        if cm_dropped:
            print(
                f"  WARN: {cm_dropped} CampaignMember rows dropped "
                f"(unresolved ContactId)"
            )
    nle_kept, nle_dropped = rewrite_csv_resolve_markers(
        nle_csv, {"PrimaryPersonId": "contact"}, resolver,
    )
    if nle_dropped:
        print(
            f"  WARN: {nle_dropped} PersonLifeEvent rows dropped "
            f"(unresolved PrimaryPersonId)"
        )

    # ---- Wave B: native PersonLifeEvent + CampaignMember (parallel) ------
    # Both sObjects only need the auto-Contact map; they don't depend on
    # each other. Parallel=2 cuts wall-clock vs serializing.
    wave_b_specs = [
        CsvLoadSpec(
            sobject="PersonLifeEvent",
            csv_path=nle_csv,
            external_id_field="External_ID__c",
        ),
    ]
    if campaign_members:
        wave_b_specs.append(CsvLoadSpec(
            sobject="CampaignMember",
            csv_path=cm_csv,
            external_id_field="External_ID__c",
        ))
        print(
            f"Wave B: upserting {nle_kept} native life events + "
            f"{cm_kept} campaign members in parallel..."
        )
    else:
        print(f"Wave B: upserting {nle_kept} native life events...")
    wave_b = Wave(
        name="B-augment",
        sobjects=tuple(s.sobject for s in wave_b_specs),
        depends_on=("A-augment",),
        parallel=len(wave_b_specs) > 1,
        description="Augment Wave B: native LifeEvents (+ CampaignMembers)",
    )
    wave_b_result = run_wave_parallel(
        wave=wave_b,
        specs=wave_b_specs,
        target_org=args.target_org,
        parallel=len(wave_b_specs),
        retry=RetryPolicy(),
    )
    for r in wave_b_result.csv_results:
        if r.error:
            print(f"  {r.sobject} load FAILED: {r.error}", file=sys.stderr)
        else:
            print(
                f"  {r.sobject}: {r.records_processed - r.records_failed}/"
                f"{r.records_processed} ok in {r.duration_s:.1f}s"
            )

    failed = sum(
        (r.error is not None) or (r.records_failed > 0)
        for r in wave_a_result.csv_results + wave_b_result.csv_results
    )
    manifest.exit_code = 0 if failed == 0 else 2
    manifest.write(run_dir / "manifest.json")
    print(f"Done. Manifest: {run_dir / 'manifest.json'}")
    return manifest.exit_code
