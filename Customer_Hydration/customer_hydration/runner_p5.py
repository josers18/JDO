"""Plan 5 runner: Plan 4 + Phase 5 (Apex wireup) + Phase 5.5 (DC streams).

A near-copy of ``runner_p4.py`` with two post-load phases bolted onto the
end of the wave loop:

  - **Phase 5 — Apex post-load wireup.** After all legacy + native waves
    complete, deploy ``force-app/`` (idempotent) and run the anonymous
    Apex script at ``apex/post_load_wireup.apex`` to wire up FSC group
    rollups, party-relationship-group membership, and any other
    declarative bindings that need the records to already exist. Honors
    ``--skip-apex-wireup``. Apex failures are NON-FATAL — the wireup
    error is captured in the manifest and the run continues.

  - **Phase 5.5 — Data Cloud stream refresh.** Discover Data Streams in
    the org whose source object is one of the hydrated CRM objects and
    POST a refresh trigger to each. Honors ``--skip-data-cloud``. Phase
    5.5 NEVER raises — failures are logged in the manifest only.

  - **--data-cloud-only.** Bypasses Phases 0-5 entirely and runs Phase
    5.5 against the latest hydrated org state. Useful when the customer
    payload is already loaded but DC streams need a fresh refresh
    (e.g., after configuring a new stream against an existing source).

What's the same as runner_p4: Plan 4's full wave loop (A-G), persona
generation, native CSV bridging, checkpoint/resume, --skip-natives,
--dry-run, --personas filtering. Reviewers can ``diff runner_p4.py
runner_p5.py`` and see ONLY the Phase 5 / 5.5 / DC-only additions.
"""
from __future__ import annotations

import argparse
import sys
from datetime import date
from pathlib import Path

import yaml

from customer_hydration.csv_writer import write_csv
from customer_hydration.generators.activity import (
    CaseRequest,
    EventRequest,
    OpportunityRequest,
    TaskRequest,
    generate_cases,
    generate_events,
    generate_opportunities,
    generate_tasks,
)
from customer_hydration.generators.campaigns import (
    generate_campaign_members,
    generate_campaigns,
    plan_campaign_members,
)
from customer_hydration.generators.cards import CardRequest, generate_cards
from customer_hydration.generators.commercial import generate_commercial
from customer_hydration.generators.goals import GoalRequest, generate_goals
from customer_hydration.generators.holdings import generate_holdings
from customer_hydration.generators.households import (
    HouseholdRequest,
    generate_households,
)
from customer_hydration.generators.lifecycle import (
    LifeEventRequest,
    generate_life_events,
)
from customer_hydration.generators.retail import generate_retail
from customer_hydration.generators.smb import generate_smb
from customer_hydration.generators.wealth import generate_wealth
from customer_hydration.loader.checkpoint import (
    RunCheckpoint,
    find_latest_resumable,
    new_checkpoint,
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
from customer_hydration.loader.wave import Wave, waves_in_forward_order
from customer_hydration.manifest import new_run_manifest
from customer_hydration.native.business_milestone import (
    BusinessMilestoneRequest,
    generate_business_milestones,
)
from customer_hydration.native.contact_points import generate_contact_points
from customer_hydration.native.financial_account import (
    generate_native_financial_accounts,
)
from customer_hydration.native.financial_account_party import (
    generate_native_financial_account_parties,
)
from customer_hydration.native.financial_goal import (
    generate_native_financial_goals,
)
from customer_hydration.native.party_profile import generate_party_profiles
from customer_hydration.native.party_relationship_group import (
    generate_party_relationship_groups,
)
from customer_hydration.preflight import run_preflight
from customer_hydration.seek import compute_next_seq, parse_seq_from_external_id
from customer_hydration.sf_runner import SfRunner


# All sObjects Plan 4 touches. Phase 0 describes each so the CSV writer
# can drop unknown columns from generator output. Adds the 8 native FSC
# objects vs the Plan 3 list.
PHASE0_OBJECTS = [
    # Legacy lineage (same as Plan 3)
    "Account",
    "Contact",
    "AccountContactRelation",
    "FinServ__FinancialAccount__c",
    "FinServ__FinancialAccountRole__c",
    "FinServ__FinancialHolding__c",
    "FinServ__Card__c",
    "FinServ__FinancialGoal__c",
    "FinServ__LifeEvent__c",
    "Campaign",
    "CampaignMember",
    "Opportunity",
    "Case",
    "Task",
    "Event",
    "RecordType",
    # Native FSC lineage (new in Plan 4)
    "FinancialAccount",
    "FinancialAccountParty",
    "FinancialGoal",
    "BusinessMilestone",
    "PartyRelationshipGroup",
    "PartyProfile",
    "ContactPointAddress",
    "ContactPointEmail",
    "ContactPointPhone",
]

# Default anchor — kept identical to Plans 2/3 so age math + calendar bins line up.
ANCHOR_DATE = date(2026, 5, 20)

# All persona keys Plan 4 understands. --personas filters this set.
ALL_PERSONAS = ("retail", "wealth", "smb", "commercial")

# Cross-cutting child volumes per persona — Plan 4 keeps Plan 3's caps.
CARDS_PER_RETAIL = 1
LIFEEVENTS_PER_WEALTH = 1
TASKS_PER_CUSTOMER = 1
CASES_PER_CUSTOMER = 1
OPPS_PER_CUSTOMER = 1
EVENTS_FRAC = 0.5

# Per-sObject idempotency field. Most use External_ID__c; LifeEvent and
# Holding only carry FinServ__SourceSystemId__c. Contact uses External_Id__c
# (lowercase 'd' — case matters). Native objects without an external-id
# field are intentionally absent here — those CSVs INSERT-only via the
# loader's bulk path with the external-id arg pointing at a placeholder
# and we accept that re-runs may dup (documented as Plan 5+ wart).
_IDEM_FIELD: dict[str, str] = {
    # Legacy lineage
    "Account": "External_ID__c",
    "Contact": "External_Id__c",
    "AccountContactRelation": "External_ID__c",
    "FinServ__FinancialAccount__c": "External_ID__c",
    "FinServ__FinancialAccountRole__c": "External_ID__c",
    "FinServ__Card__c": "External_ID__c",
    "FinServ__FinancialGoal__c": "External_ID__c",
    "FinServ__LifeEvent__c": "FinServ__SourceSystemId__c",
    "FinServ__FinancialHolding__c": "FinServ__SourceSystemId__c",
    "Campaign": "External_ID__c",
    "Opportunity": "External_ID__c",
    "Case": "External_ID__c",
    "Task": "External_ID__c",
    "Event": "External_ID__c",
    "CampaignMember": "External_ID__c",
    # Native lineage. Per jdo-fw51xz describe (Plan 4 prelude):
    #   * FinancialAccount has LegacyId__c (externalId=True, unique=True)
    #     but NO External_ID__c — use LegacyId__c for idempotency.
    #   * FinancialGoal has BOTH; we use External_ID__c (consistent with
    #     legacy lineage idempotency convention).
    #   * BusinessMilestone has External_ID__c.
    "FinancialAccount": "LegacyId__c",
    "FinancialGoal": "External_ID__c",
    "BusinessMilestone": "External_ID__c",
    # PartyRelationshipGroup, PartyProfile, ContactPoint*, FinancialAccountParty
    # have no External_ID__c — see _NATIVE_INSERT_ONLY below.
}

# Native sObjects without External_ID__c. The current bulk_upsert wrapper
# requires --external-id, so the runner skips these in Wave F + G if the
# loader doesn't accept them. Plan 5+ may add an INSERT path. For now we
# document the wart and SKIP loading these CSVs — they're still WRITTEN
# so reviewers can inspect the shape, but Wave F + G will only attempt
# the three external-id-bearing native objects.
_NATIVE_INSERT_ONLY = frozenset({
    "PartyRelationshipGroup",
    "PartyProfile",
    "ContactPointAddress",
    "ContactPointEmail",
    "ContactPointPhone",
    "FinancialAccountParty",
})

# Wave-level fail-fast exit code. Distinct from generic-error 2 so the
# CLI can differentiate a config/preflight failure (2) from a load failure
# that produced a resumable checkpoint (still 2 — the resume command
# distinguishes via checkpoint.is_resumable()).
_LOAD_FAILED_EXIT = 2

# External-ID prefixes for native objects (Plan 4 task 2-8 generators).
_NATIVE_FA_PREFIX = "HYDRATE-NFA"
_NATIVE_GOAL_PREFIX = "HYDRATE-NGOAL"
_NATIVE_MS_PREFIX = "HYDRATE-NMS"


def run_all(args: argparse.Namespace) -> int:
    """Plan 5 runner — Plan 4 waves + Phase 5 (Apex) + Phase 5.5 (DC).

    Returns the process exit code:
      0 — clean completion (or a clean dry run)
      2 — config/preflight error, OR a wave failed and a resumable
          checkpoint was written
    """
    # ---- Argparse / global gates ----------------------------------------
    if args.target_org is None:
        print("--target-org is required", file=sys.stderr)
        return 2

    # ---- --data-cloud-only short-circuit --------------------------------
    # Plan 5 / Task 5: when the operator just wants to refresh the existing
    # DC streams (e.g., after configuring a new stream targeting hydrated
    # data), bypass Phases 0-5 entirely. Write a minimal manifest so the
    # ``dc-status`` subcommand can discover the run.
    if getattr(args, "data_cloud_only", False):
        print("--data-cloud-only set; running Phase 5.5 only")
        from customer_hydration.phase5.data_cloud import execute_phase5_5
        dc_result = execute_phase5_5(target_org=args.target_org)
        flags_dc = {
            "data_cloud_only": True,
            "skip_apex_wireup": True,
            "skip_data_cloud": False,
            "plan": "p5",
        }
        manifest = new_run_manifest(
            target_org=args.target_org, seed=args.seed, flags=flags_dc,
        )
        manifest.object_status["DataCloud_Stream_Refresh"] = {
            "streams_discovered": dc_result.streams_discovered,
            "streams_matched": dc_result.streams_matched,
            "streams_triggered": dc_result.streams_triggered,
            "stream_runs": [
                {
                    "stream_api_name": sr.stream_api_name,
                    "source_object": sr.source_object,
                    "run_id": sr.run_id,
                    "status": sr.status,
                    "triggered_at": sr.triggered_at,
                    "error": sr.error,
                }
                for sr in dc_result.stream_runs
            ],
            "stream_trigger_failures": dc_result.stream_trigger_failures,
        }
        run_dir = Path(args.output_dir) / manifest.run_id
        run_dir.mkdir(parents=True, exist_ok=True)
        manifest.exit_code = 0 if not dc_result.stream_trigger_failures else 1
        manifest.write(run_dir / "manifest.json")
        print(
            f"DC stream refresh: {dc_result.streams_triggered} triggered "
            f"({len(dc_result.stream_trigger_failures)} failures)"
        )
        return 0 if not dc_result.stream_trigger_failures else 1

    runner = SfRunner(args.target_org)

    # ---- Production guard ------------------------------------------------
    org_info = runner._run([  # noqa: SLF001
        "sf", "org", "display", "--target-org", args.target_org, "--json",
    ])
    is_sandbox = bool(org_info.get("result", {}).get("isSandbox", False))
    if not is_sandbox and not args.allow_production:
        print(
            f"Refusing to run against non-sandbox org {args.target_org}. "
            f"Pass --allow-production to override.",
            file=sys.stderr,
        )
        return 2

    skip_natives = bool(getattr(args, "skip_natives", False))

    # ---- Configs --------------------------------------------------------
    config_dir = Path(args.config_dir)
    rm_pool = yaml.safe_load((config_dir / "rm_pool.yaml").read_text())
    personas_cfg = yaml.safe_load((config_dir / "personas.yaml").read_text())
    catalog = yaml.safe_load((config_dir / "product_catalog.yaml").read_text())
    holding_universe_path = config_dir / "holding_universe.yaml"

    # External-ID prefixes per persona.
    retail_prefix = personas_cfg["retail"]["external_id_prefix"]
    wealth_prefix = "HYDRATE-WL"
    smb_prefix = "HYDRATE-SMB"
    commercial_prefix = "HYDRATE-COM"
    household_prefix = "HYDRATE-HH"
    fa_prefix = "HYDRATE-FA"
    far_prefix = "HYDRATE-FAR"

    # ---- Persona filtering ----------------------------------------------
    selected = set(args.personas) if args.personas else set(ALL_PERSONAS)
    unknown = selected - set(ALL_PERSONAS)
    if unknown:
        print(
            f"Unknown personas: {sorted(unknown)}. "
            f"Valid: {sorted(ALL_PERSONAS)}",
            file=sys.stderr,
        )
        return 2

    # ---- RM pool slicing -------------------------------------------------
    wealth_rm_ids = [
        rm["user_id"]
        for rm in rm_pool["rms"].values()
        if rm["role_family"] == "wealth"
    ]
    retail_rm_ids = [
        rm["user_id"]
        for rm in rm_pool["rms"].values()
        if rm["role_family"] == "retail"
    ]
    commercial_rm_ids = [
        rm["user_id"]
        for rm in rm_pool["rms"].values()
        if rm["role_family"] == "commercial"
    ]
    smb_rm_ids = list(commercial_rm_ids)

    if args.rm:
        wanted = args.rm.lower().strip()
        match_ids = [
            rm["user_id"]
            for rm in rm_pool["rms"].values()
            if rm["role_family"] == "wealth"
            and (
                rm["user_id"].lower() == wanted
                or rm["name"].lower() == wanted
            )
        ]
        if not match_ids:
            print(
                f"--rm {args.rm!r}: no wealth RM matched by name or user id.",
                file=sys.stderr,
            )
            return 2
        wealth_rm_ids = match_ids

    # ---- Phase 0 preflight ----------------------------------------------
    # If --skip-natives, drop native objects from the describe set so the
    # preflight isn't slowed by 9 extra describes the runner won't use.
    phase0 = list(PHASE0_OBJECTS)
    if skip_natives:
        native_obj_set = {
            "FinancialAccount",
            "FinancialAccountParty",
            "FinancialGoal",
            "BusinessMilestone",
            "PartyRelationshipGroup",
            "PartyProfile",
            "ContactPointAddress",
            "ContactPointEmail",
            "ContactPointPhone",
        }
        phase0 = [s for s in phase0 if s not in native_obj_set]
    cache = run_preflight(runner, phase0)

    # ---- RecordType resolution ------------------------------------------
    person_rt_id = _resolve_rt_id(
        runner, "Account", "FSC_Person_Accounts",
        label="active FSC_Person_Accounts RecordType",
    )
    if person_rt_id is None:
        return 2

    business_rt_id = None
    for dev_name in (
        "IndustriesBusiness",
        "Business_Account",
        "FSC_Business",
        "FSC_Business_Account",
    ):
        rt = _resolve_rt_id(runner, "Account", dev_name, soft=True)
        if rt:
            business_rt_id = rt
            break
    if business_rt_id is None and ("smb" in selected or "commercial" in selected):
        print(
            "No active Business Account RecordType found in target org "
            "(tried Business_Account, IndustriesBusiness, FSC_Business, "
            "FSC_Business_Account).",
            file=sys.stderr,
        )
        return 2

    household_rt_id = None
    for dev_name in ("IndustriesHousehold", "Household", "FSC_Household"):
        rt = _resolve_rt_id(runner, "Account", dev_name, soft=True)
        if rt:
            household_rt_id = rt
            break

    # ---- External-ID seek pointers --------------------------------------
    retail_seek = compute_next_seq(runner, retail_prefix, "Account")
    wealth_seek = compute_next_seq(runner, wealth_prefix, "Account")
    smb_seek = compute_next_seq(runner, smb_prefix, "Account")
    commercial_seek = compute_next_seq(runner, commercial_prefix, "Account")
    hh_seek = compute_next_seq(runner, household_prefix, "Account")
    fa_seek = compute_next_seq(runner, fa_prefix, "FinServ__FinancialAccount__c")
    far_seek = compute_next_seq(runner, far_prefix, "FinServ__FinancialAccountRole__c")
    card_seek = compute_next_seq(runner, "HYDRATE-CARD", "FinServ__Card__c")
    goal_seek = compute_next_seq(runner, "HYDRATE-GOAL", "FinServ__FinancialGoal__c")
    case_seek = compute_next_seq(runner, "HYDRATE-CASE", "Case")
    task_seek = compute_next_seq(runner, "HYDRATE-TASK", "Task")
    evt_seek = compute_next_seq(runner, "HYDRATE-EVT", "Event")
    opp_seek = compute_next_seq(runner, "HYDRATE-OPP", "Opportunity")
    le_seek = _seek_via_ssid(runner, "HYDRATE-LE", "FinServ__LifeEvent__c")
    hold_seek = _seek_via_ssid(runner, "HYDRATE-HOLD", "FinServ__FinancialHolding__c")
    acr_seek = compute_next_seq(runner, "HYDRATE-ACR", "AccountContactRelation")
    cmpmem_seek = compute_next_seq(runner, "HYDRATE-CMPMEM", "CampaignMember")

    # Native seek pointers — only computed when natives are in scope. The
    # native FinancialAccount in jdo-fw51xz has NO External_ID__c (only
    # LegacyId__c), so we don't seek-by-External_ID for FA — start at 1
    # and rely on the LegacyId__c idempotency to dedupe at upsert time.
    # FinancialGoal and BusinessMilestone DO carry External_ID__c, so we
    # seek normally (defensively swallowing INVALID_FIELD if a future org
    # version drops the field).
    native_fa_seek = 1
    native_goal_seek = 1
    native_ms_seek = 1
    if not skip_natives:
        native_goal_seek = _safe_seek(
            runner, _NATIVE_GOAL_PREFIX, "FinancialGoal",
        )
        native_ms_seek = _safe_seek(
            runner, _NATIVE_MS_PREFIX, "BusinessMilestone",
        )

    # ---- Persona generation ---------------------------------------------
    accounts: list[dict] = []
    financial_accounts: list[dict] = []
    fa_roles: list[dict] = []

    retail_ext_ids: list[str] = []
    wealth_ext_ids: list[str] = []
    smb_ext_ids: list[str] = []
    commercial_ext_ids: list[str] = []
    ext_id_owner: dict[str, str] = {}

    if "retail" in selected and args.retail > 0:
        rb = generate_retail(
            n=args.retail,
            seed=args.seed,
            starting_seq=retail_seek,
            rm_user_ids=retail_rm_ids,
            anchor_date=ANCHOR_DATE,
            person_account_rt_id=person_rt_id,
            checking_product_code=catalog["products"]["pd_chk_evd"]["code"],
        )
        accounts.extend(rb.accounts)
        financial_accounts.extend(rb.financial_accounts)
        fa_roles.extend(rb.financial_account_roles)
        for a in rb.accounts:
            ext_id_owner[a["External_ID__c"]] = a.get("OwnerId", "")
            retail_ext_ids.append(a["External_ID__c"])

    wealth_holding_requests = []
    if "wealth" in selected and args.wealth > 0:
        wb = generate_wealth(
            n=args.wealth,
            seed=args.seed + 1,
            starting_seq=wealth_seek,
            rm_user_ids=wealth_rm_ids,
            anchor_date=ANCHOR_DATE,
            person_account_rt_id=person_rt_id,
        )
        accounts.extend(wb.accounts)
        financial_accounts.extend(wb.financial_accounts)
        fa_roles.extend(wb.financial_account_roles)
        wealth_holding_requests = wb.holding_requests
        for a in wb.accounts:
            ext_id_owner[a["External_ID__c"]] = a.get("OwnerId", "")
            wealth_ext_ids.append(a["External_ID__c"])

    if "smb" in selected and args.smb > 0 and business_rt_id:
        sb = generate_smb(
            n=args.smb,
            seed=args.seed + 2,
            starting_seq=smb_seek,
            rm_user_ids=smb_rm_ids,
            anchor_date=ANCHOR_DATE,
            business_rt_id=business_rt_id,
        )
        accounts.extend(sb.accounts)
        financial_accounts.extend(sb.financial_accounts)
        fa_roles.extend(sb.financial_account_roles)
        for a in sb.accounts:
            ext_id_owner[a["External_ID__c"]] = a.get("OwnerId", "")
            smb_ext_ids.append(a["External_ID__c"])

    if "commercial" in selected and args.commercial > 0 and business_rt_id:
        cb = generate_commercial(
            n=args.commercial,
            seed=args.seed + 3,
            starting_seq=commercial_seek,
            rm_user_ids=commercial_rm_ids,
            anchor_date=ANCHOR_DATE,
            business_rt_id=business_rt_id,
        )
        accounts.extend(cb.accounts)
        financial_accounts.extend(cb.financial_accounts)
        fa_roles.extend(cb.financial_account_roles)
        for a in cb.accounts:
            ext_id_owner[a["External_ID__c"]] = a.get("OwnerId", "")
            commercial_ext_ids.append(a["External_ID__c"])

    # ---- Households + ACR -----------------------------------------------
    households: list[dict] = []
    acrs: list[dict] = []
    # member ext_id -> household ext_id; used by PartyProfile generation.
    household_membership_map: dict[str, str] = {}
    if household_rt_id and (retail_ext_ids or wealth_ext_ids):
        hh_requests = _build_household_requests(
            retail_ext_ids + wealth_ext_ids, accounts,
        )
        if hh_requests:
            hb = generate_households(
                seed=args.seed,
                starting_seq=hh_seek,
                requests=hh_requests,
                household_rt_id=household_rt_id,
                acr_starting_seq=acr_seek,
            )
            households = hb.households
            acrs = hb.acrs
            # Build the member -> household membership map. The
            # HouseholdRequest carries member_external_ids in the same
            # order the bundle's households list was emitted.
            for req, hh in zip(hh_requests, hb.households):
                hh_ext_id = hh["External_ID__c"]
                for member_ext_id in req.member_external_ids:
                    household_membership_map[member_ext_id] = hh_ext_id

    # ---- Cards (1 per retail customer) ----------------------------------
    cards: list[dict] = []
    if retail_ext_ids:
        card_reqs = _build_card_requests(
            retail_ext_ids, financial_accounts, accounts,
            n_per_customer=CARDS_PER_RETAIL,
        )
        if card_reqs:
            cards = generate_cards(
                seed=args.seed,
                starting_seq=card_seek,
                requests=card_reqs,
            ).cards

    # ---- Holdings -------------------------------------------------------
    holdings: list[dict] = []
    if wealth_holding_requests and holding_universe_path.exists():
        holdings = generate_holdings(
            seed=args.seed + 4,
            starting_seq=hold_seek,
            requests=wealth_holding_requests,
            universe_path=holding_universe_path,
        ).holdings

    # ---- Goals ----------------------------------------------------------
    goals: list[dict] = []
    goal_reqs: list[GoalRequest] = []
    for ext_id in retail_ext_ids:
        goal_reqs.append(GoalRequest(
            primary_owner_external_id=ext_id,
            goal_type="Retirement",
            target_amount=500_000.0,
            target_year=2050,
        ))
    for ext_id in wealth_ext_ids:
        goal_reqs.append(GoalRequest(
            primary_owner_external_id=ext_id,
            goal_type="Retirement",
            target_amount=2_500_000.0,
            target_year=2040,
        ))
    for ext_id in smb_ext_ids:
        goal_reqs.append(GoalRequest(
            primary_owner_external_id=ext_id,
            goal_type="New Business Acquisition",
            target_amount=750_000.0,
            target_year=2030,
        ))
    if goal_reqs:
        goals = generate_goals(
            seed=args.seed + 5,
            starting_seq=goal_seek,
            requests=goal_reqs,
        ).goals

    # ---- Life events (wealth only) --------------------------------------
    life_events: list[dict] = []
    if wealth_ext_ids:
        le_reqs = [
            LifeEventRequest(
                client_account_external_id=ext_id,
                event_type="Retirement",
                event_date=ANCHOR_DATE,
            )
            for ext_id in wealth_ext_ids[:int(len(wealth_ext_ids) * LIFEEVENTS_PER_WEALTH)]
        ]
        if le_reqs:
            life_events = generate_life_events(
                seed=args.seed + 6,
                starting_seq=le_seek,
                requests=le_reqs,
            ).life_events

    # ---- Cases / Tasks / Events / Opportunities -------------------------
    case_requests: list[CaseRequest] = []
    task_requests: list[TaskRequest] = []
    event_requests: list[EventRequest] = []
    opp_requests: list[OpportunityRequest] = []

    persona_for_ext: dict[str, str] = {}
    for ext in retail_ext_ids:
        persona_for_ext[ext] = "retail"
    for ext in wealth_ext_ids:
        persona_for_ext[ext] = "wealth"
    for ext in smb_ext_ids:
        persona_for_ext[ext] = "smb"
    for ext in commercial_ext_ids:
        persona_for_ext[ext] = "commercial"

    product_keyword_for_persona = {
        "retail": "Personal Loan",
        "wealth": "Managed Portfolio",
        "smb": "Business Line of Credit",
        "commercial": "Treasury Services",
    }

    for idx, ext_id in enumerate(persona_for_ext):
        persona = persona_for_ext[ext_id]
        owner = ext_id_owner.get(ext_id, "")
        case_requests.append(CaseRequest(
            account_external_id=ext_id,
            contact_id_marker=None,
            persona=persona,
            rm_user_id=owner,
        ))
        task_requests.append(TaskRequest(
            account_external_id=ext_id,
            rm_user_id=owner,
            persona=persona,
        ))
        opp_requests.append(OpportunityRequest(
            account_external_id=ext_id,
            rm_user_id=owner,
            persona=persona,
            product_keyword=product_keyword_for_persona[persona],
        ))
        if idx % 2 == 0:
            event_requests.append(EventRequest(
                account_external_id=ext_id,
                rm_user_id=owner,
                persona=persona,
            ))

    cases = (
        generate_cases(seed=args.seed + 7, starting_seq=case_seek, requests=case_requests).cases
        if case_requests else []
    )
    tasks = (
        generate_tasks(seed=args.seed + 8, starting_seq=task_seek, requests=task_requests).tasks
        if task_requests else []
    )
    events = (
        generate_events(seed=args.seed + 9, starting_seq=evt_seek, requests=event_requests).events
        if event_requests else []
    )
    opportunities = (
        generate_opportunities(
            seed=args.seed + 10, starting_seq=opp_seek, requests=opp_requests,
        ).opportunities
        if opp_requests else []
    )

    # ---- Campaigns + CampaignMembers ------------------------------------
    campaigns = generate_campaigns(seed=args.seed + 11).campaigns

    campaign_members: list[dict] = []
    if persona_for_ext:
        cm_plan = plan_campaign_members(
            seed=args.seed + 12,
            customer_personas=persona_for_ext,
        )
        if cm_plan:
            campaign_members = generate_campaign_members(
                seed=args.seed + 13,
                starting_seq=cmpmem_seek,
                requests=cm_plan,
            ).members

    # ---- Manifest + output dir + checkpoint -----------------------------
    flags = {
        "retail": args.retail,
        "wealth": args.wealth,
        "smb": args.smb,
        "commercial": args.commercial,
        "personas": sorted(selected),
        "rm": args.rm,
        "skip_natives": skip_natives,
        "skip_apex_wireup": bool(args.skip_apex_wireup),
        "skip_data_cloud": bool(args.skip_data_cloud),
        "data_cloud_only": bool(args.data_cloud_only),
        "allow_production": bool(args.allow_production),
        "dry_run": bool(args.dry_run),
        "parallel": int(getattr(args, "parallel", 4) or 4),
        "plan": "p5",
    }
    manifest = new_run_manifest(
        target_org=args.target_org,
        seed=args.seed,
        flags=flags,
    )
    run_dir = Path(args.output_dir) / manifest.run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    checkpoint = new_checkpoint(
        target_org=args.target_org, seed=args.seed, flags=flags,
    )
    checkpoint.run_id = manifest.run_id
    checkpoint_path = run_dir / "checkpoint.json"
    checkpoint.write(checkpoint_path)

    # ---- Legacy CSV writes ----------------------------------------------
    all_accounts = accounts + households

    # Plan 4 Contact CSV is intentionally empty (Plan 4 still doesn't emit
    # business-officer Contact rows; Person Account auto-Contacts come
    # from the platform at Account upsert time). Keep the empty CSV for
    # PartyProfile + ContactPoint generation downstream.
    contacts: list[dict] = []

    csv_specs: list[tuple[str, list[dict], Path]] = [
        ("Account", all_accounts, run_dir / "accounts.csv"),
        ("Contact", contacts, run_dir / "contacts.csv"),
        ("AccountContactRelation", acrs, run_dir / "acrs.csv"),
        ("FinServ__FinancialAccount__c", financial_accounts,
         run_dir / "financial_accounts.csv"),
        ("FinServ__FinancialAccountRole__c", fa_roles,
         run_dir / "fa_roles.csv"),
        ("FinServ__FinancialHolding__c", holdings,
         run_dir / "holdings.csv"),
        ("FinServ__Card__c", cards, run_dir / "cards.csv"),
        ("FinServ__FinancialGoal__c", goals, run_dir / "goals.csv"),
        ("FinServ__LifeEvent__c", life_events, run_dir / "life_events.csv"),
        ("Campaign", campaigns, run_dir / "campaigns.csv"),
        ("CampaignMember", campaign_members, run_dir / "campaign_members.csv"),
        ("Opportunity", opportunities, run_dir / "opportunities.csv"),
        ("Case", cases, run_dir / "cases.csv"),
        ("Task", tasks, run_dir / "tasks.csv"),
        ("Event", events, run_dir / "events.csv"),
    ]

    csv_by_sobject: dict[str, Path] = {sobj: path for sobj, _rows, path in csv_specs}

    for sobject, rows, path in csv_specs:
        write_result = write_csv(rows, sobject, cache, path)
        manifest.object_status[sobject] = {
            "csv_path": str(path),
            "rows_written": write_result.rows_written,
            "dropped_fields": sorted(write_result.dropped_fields),
        }
        checkpoint.update_csv_status(
            sobject,
            csv_path=str(path),
            rows_written=write_result.rows_written,
        )

    # Header rewrites for parent-id external-id reference syntax
    # (Bulk API 2.0). Same set as Plan 3.
    _rewrite_parent_headers(
        run_dir / "financial_accounts.csv",
        {"FinServ__PrimaryOwner__c": "FinServ__PrimaryOwner__r.External_ID__c"},
    )
    _rewrite_parent_headers(
        run_dir / "fa_roles.csv",
        {
            "FinServ__FinancialAccount__c":
                "FinServ__FinancialAccount__r.External_ID__c",
            "FinServ__RelatedAccount__c":
                "FinServ__RelatedAccount__r.External_ID__c",
        },
    )
    _rewrite_parent_headers(
        run_dir / "holdings.csv",
        {
            "FinServ__FinancialAccount__c":
                "FinServ__FinancialAccount__r.External_ID__c",
            "FinServ__PrimaryOwner__c":
                "FinServ__PrimaryOwner__r.External_ID__c",
        },
    )
    _rewrite_parent_headers(
        run_dir / "cards.csv",
        {
            "FinServ__AccountHolder__c":
                "FinServ__AccountHolder__r.External_ID__c",
            "FinServ__FinancialAccount__c":
                "FinServ__FinancialAccount__r.External_ID__c",
        },
    )
    _rewrite_parent_headers(
        run_dir / "goals.csv",
        {"FinServ__PrimaryOwner__c": "FinServ__PrimaryOwner__r.External_ID__c"},
    )
    _rewrite_parent_headers(
        run_dir / "life_events.csv",
        {"FinServ__Client__c": "FinServ__Client__r.External_ID__c"},
    )
    _rewrite_parent_headers(
        run_dir / "cases.csv",
        {"AccountId": "Account.External_ID__c"},
    )
    _rewrite_parent_headers(
        run_dir / "opportunities.csv",
        {"AccountId": "Account.External_ID__c"},
    )
    _rewrite_parent_headers(
        run_dir / "acrs.csv",
        {"AccountId": "Account.External_ID__c"},
    )
    _rewrite_parent_headers(
        run_dir / "campaign_members.csv",
        {"CampaignId": "Campaign.External_ID__c"},
    )

    # ---- Native CSV generation ------------------------------------------
    # We generate native CSVs at this point so they're written and visible
    # in the run dir BEFORE Wave F starts. ``LegacyId__c`` references are
    # filled in post-Wave-D once the legacy resolver knows the legacy FA
    # and Goal Salesforce Ids. We DON'T generate native CSVs at all when
    # --skip-natives is set (per spec — no wasted cycles).
    #
    # For dry-run, we still generate native CSVs but we synthesize a fake
    # legacy_id_map (using the legacy External_ID itself in place of an
    # Sf Id) so reviewers can inspect the shape.
    native_csv_paths: dict[str, Path] = {}
    native_milestone_requests: list[BusinessMilestoneRequest] = []

    if not skip_natives:
        # SMB + Commercial milestones — one Founded milestone per business
        # at the persona's anchor date.
        for ext_id in smb_ext_ids + commercial_ext_ids:
            native_milestone_requests.append(BusinessMilestoneRequest(
                business_external_id=ext_id,
                milestone_type="Founded",
                milestone_date=ANCHOR_DATE,
                description=f"Founding milestone for {ext_id}",
            ))

        # Person Account rows for PartyProfile + ContactPoints. Build by
        # filtering the accumulated accounts list for retail + wealth ext
        # ids, since the bundle structure dropped that distinction.
        person_account_ext_ids = set(retail_ext_ids) | set(wealth_ext_ids)
        person_account_rows = [
            a for a in accounts
            if a.get("External_ID__c") in person_account_ext_ids
        ]

        # Native CSV bundles. legacy_id_map is intentionally empty here —
        # we backfill it after Wave D for live runs OR with a synthesized
        # ext_id->ext_id map for dry-runs (so the rows aren't dropped by
        # the generator's defensive filter).
        native_fa_legacy_map: dict[str, str] = {}
        native_goal_legacy_map: dict[str, str] = {}
        if args.dry_run:
            # Dry-run shape only — use the ext_id as the "id" so the
            # generators don't drop every row. The CSVs aren't loaded.
            for fa in financial_accounts:
                ext = fa.get("External_ID__c")
                if ext:
                    native_fa_legacy_map[ext] = ext
            for goal in goals:
                ext = goal.get("External_ID__c")
                if ext:
                    native_goal_legacy_map[ext] = ext
        # For live runs we fill these in post-Wave-D; placeholder empty
        # maps cause the native FA / Goal generators to skip every row,
        # which is fine — we re-generate after Wave D below.

        if args.dry_run:
            native_fa_bundle = generate_native_financial_accounts(
                starting_seq=native_fa_seek,
                legacy_fa_rows=financial_accounts,
                legacy_id_map=native_fa_legacy_map,
            )
            native_goal_bundle = generate_native_financial_goals(
                starting_seq=native_goal_seek,
                legacy_goal_rows=goals,
                legacy_id_map=native_goal_legacy_map,
            )
            milestone_bundle = generate_business_milestones(
                starting_seq=native_ms_seek,
                requests=native_milestone_requests,
            )
            prg_bundle = generate_party_relationship_groups(
                household_account_rows=households,
            )
            party_profile_bundle = generate_party_profiles(
                person_account_rows=person_account_rows,
                business_contact_rows=contacts,
                household_membership_map=household_membership_map,
            )
            cp_bundle = generate_contact_points(
                person_account_rows=person_account_rows,
                business_contact_rows=contacts,
            )
            fa_party_bundle = generate_native_financial_account_parties(
                legacy_role_rows=fa_roles,
                legacy_fa_to_native_fa=None,
            )

            native_csv_specs: list[tuple[str, list[dict], Path]] = [
                ("FinancialAccount", native_fa_bundle.rows,
                 run_dir / "native_financial_accounts.csv"),
                ("FinancialGoal", native_goal_bundle.rows,
                 run_dir / "native_financial_goals.csv"),
                ("BusinessMilestone", milestone_bundle.rows,
                 run_dir / "business_milestones.csv"),
                ("PartyRelationshipGroup", prg_bundle.rows,
                 run_dir / "party_relationship_groups.csv"),
                ("PartyProfile", party_profile_bundle.rows,
                 run_dir / "party_profiles.csv"),
                ("ContactPointAddress", cp_bundle.addresses,
                 run_dir / "contact_point_addresses.csv"),
                ("ContactPointEmail", cp_bundle.emails,
                 run_dir / "contact_point_emails.csv"),
                ("ContactPointPhone", cp_bundle.phones,
                 run_dir / "contact_point_phones.csv"),
                ("FinancialAccountParty", fa_party_bundle.rows,
                 run_dir / "financial_account_parties.csv"),
            ]
            for sobject, rows, path in native_csv_specs:
                write_result = write_csv(rows, sobject, cache, path)
                manifest.object_status[sobject] = {
                    "csv_path": str(path),
                    "rows_written": write_result.rows_written,
                    "dropped_fields": sorted(write_result.dropped_fields),
                }
                checkpoint.update_csv_status(
                    sobject,
                    csv_path=str(path),
                    rows_written=write_result.rows_written,
                )
                native_csv_paths[sobject] = path

            # Dry-run native CSVs need the same RESOLVE-marker substrate
            # for shape inspection — we leave markers in the CSV bodies
            # untouched (no resolver runs in dry-run).

    if args.dry_run:
        if skip_natives:
            print(
                f"Dry run --skip-natives — wrote 15 legacy CSVs to {run_dir}, "
                f"no native CSVs, no bulk load performed."
            )
        else:
            print(
                f"Dry run — wrote 15 legacy + 9 native CSVs to {run_dir}, "
                f"no bulk load performed."
            )
        manifest.exit_code = 0
        manifest.write(run_dir / "manifest.json")
        checkpoint.exit_code = 0
        checkpoint.write(checkpoint_path)
        return 0

    # ---- Wave loop (live) ------------------------------------------------
    parallel = int(getattr(args, "parallel", 4) or 4)
    retry = RetryPolicy()
    resolver = IdResolver()
    resolved_dir = run_dir / "resolved"

    only_waves: set[str] | None = (
        {w.strip().upper() for w in args.waves} if getattr(args, "waves", None) else None
    )

    # Track which native CSVs we've populated post-Wave-D — populated after
    # legacy FA + Goal Ids are known.
    native_csvs_built = False
    # Map: legacy FA External_ID -> native FA External_ID (post-Wave-F).
    legacy_fa_to_native_fa: dict[str, str] = {}
    # Map: native FA External_ID -> native FA Salesforce Id (post-Wave-F).
    native_fa_id_map: dict[str, str] = {}

    for wave in waves_in_forward_order():
        if only_waves is not None and wave.name not in only_waves:
            continue

        # Skip Wave F + G when --skip-natives. Mark them as skipped in the
        # checkpoint so a future resume doesn't try to enter them.
        if skip_natives and wave.name in ("F", "G"):
            checkpoint.completed_waves.append(f"{wave.name}-skipped")
            checkpoint.write(checkpoint_path)
            print(f"--skip-natives — skipping Wave {wave.name}.")
            continue

        # Pre-wave: resolve markers in this wave's CSVs.
        if wave.name == "C":
            acr_csv = csv_by_sobject.get("AccountContactRelation")
            if acr_csv is not None and acr_csv.exists():
                kept, dropped = rewrite_csv_resolve_markers(
                    acr_csv, {"ContactId": "contact"}, resolver,
                )
                checkpoint.update_csv_status(
                    "AccountContactRelation",
                    rows_written=kept,
                    rows_dropped_unresolved=dropped,
                )
        elif wave.name == "E":
            tasks_csv = csv_by_sobject.get("Task")
            if tasks_csv is not None and tasks_csv.exists():
                kept, dropped = rewrite_csv_resolve_markers(
                    tasks_csv, {"WhatId": "id"}, resolver,
                )
                checkpoint.update_csv_status(
                    "Task", rows_written=kept, rows_dropped_unresolved=dropped,
                )
            events_csv = csv_by_sobject.get("Event")
            if events_csv is not None and events_csv.exists():
                kept, dropped = rewrite_csv_resolve_markers(
                    events_csv, {"WhatId": "id"}, resolver,
                )
                checkpoint.update_csv_status(
                    "Event", rows_written=kept, rows_dropped_unresolved=dropped,
                )
            cm_csv = csv_by_sobject.get("CampaignMember")
            if cm_csv is not None and cm_csv.exists():
                kept, dropped = rewrite_csv_resolve_markers(
                    cm_csv, {"ContactId": "contact"}, resolver,
                )
                checkpoint.update_csv_status(
                    "CampaignMember",
                    rows_written=kept,
                    rows_dropped_unresolved=dropped,
                )
        elif wave.name == "F":
            # Phase 3 query-back is between Wave E and Wave F — see the
            # ``elif wave.name == "E"`` post-wave block below for the
            # legacy-FA / Goal queries. By the time we get here, those
            # maps are populated. Build native CSVs now.
            if not native_csvs_built:
                _build_and_write_native_csvs(
                    runner=runner,
                    cache=cache,
                    run_dir=run_dir,
                    manifest=manifest,
                    checkpoint=checkpoint,
                    checkpoint_path=checkpoint_path,
                    csv_by_sobject=csv_by_sobject,
                    native_csv_paths=native_csv_paths,
                    resolver=resolver,
                    accounts=accounts,
                    households=households,
                    contacts=contacts,
                    financial_accounts=financial_accounts,
                    fa_roles=fa_roles,
                    goals=goals,
                    retail_ext_ids=retail_ext_ids,
                    wealth_ext_ids=wealth_ext_ids,
                    household_membership_map=household_membership_map,
                    milestone_requests=native_milestone_requests,
                    native_fa_seek=native_fa_seek,
                    native_goal_seek=native_goal_seek,
                    native_ms_seek=native_ms_seek,
                )
                native_csvs_built = True
            # Pre-load resolver rewrites for the 5 RESOLVE-bearing native
            # CSVs (BusinessMilestone, PartyRelationshipGroup,
            # PartyProfile, ContactPoint*).
            ms_csv = native_csv_paths.get("BusinessMilestone")
            if ms_csv is not None and ms_csv.exists():
                kept, dropped = rewrite_csv_resolve_markers(
                    ms_csv, {"PrimaryAccountId": "id"}, resolver,
                )
                checkpoint.update_csv_status(
                    "BusinessMilestone", rows_written=kept,
                    rows_dropped_unresolved=dropped,
                )
            prg_csv = native_csv_paths.get("PartyRelationshipGroup")
            if prg_csv is not None and prg_csv.exists():
                kept, dropped = rewrite_csv_resolve_markers(
                    prg_csv, {"AccountId": "id"}, resolver,
                )
                checkpoint.update_csv_status(
                    "PartyRelationshipGroup", rows_written=kept,
                    rows_dropped_unresolved=dropped,
                )
            pp_csv = native_csv_paths.get("PartyProfile")
            if pp_csv is not None and pp_csv.exists():
                kept, dropped = rewrite_csv_resolve_markers(
                    pp_csv,
                    {
                        "AccountId": "id",
                        "ContactId": "contact",
                        "HouseholdAccountId": "id",
                    },
                    resolver,
                )
                checkpoint.update_csv_status(
                    "PartyProfile", rows_written=kept,
                    rows_dropped_unresolved=dropped,
                )
            for native_obj in (
                "ContactPointAddress",
                "ContactPointEmail",
                "ContactPointPhone",
            ):
                cp_csv = native_csv_paths.get(native_obj)
                if cp_csv is not None and cp_csv.exists():
                    kept, dropped = rewrite_csv_resolve_markers(
                        cp_csv, {"ParentId": "id"}, resolver,
                    )
                    checkpoint.update_csv_status(
                        native_obj, rows_written=kept,
                        rows_dropped_unresolved=dropped,
                    )
        elif wave.name == "G":
            # Pre-Wave-G: rewrite RESOLVE-NFA: markers using the
            # legacy-FA -> native-FA -> Sf Id chain. Also rewrite the
            # AccountId / ContactId RESOLVE: markers via the legacy
            # resolver. The RESOLVE-NFA: marker prefix carries the native
            # FA External_ID (HYDRATE-NFA-NNN); we translate to the
            # native FA Salesforce Id via ``native_fa_id_map``.
            fap_csv = native_csv_paths.get("FinancialAccountParty")
            if fap_csv is not None and fap_csv.exists():
                _rewrite_native_fa_markers(fap_csv, native_fa_id_map)
                kept, dropped = rewrite_csv_resolve_markers(
                    fap_csv,
                    {"AccountId": "id", "ContactId": "contact"},
                    resolver,
                )
                checkpoint.update_csv_status(
                    "FinancialAccountParty", rows_written=kept,
                    rows_dropped_unresolved=dropped,
                )

        # Build the spec list — only sobjects with non-empty CSVs and an
        # idempotency field. Native objects without External_ID__c are
        # filtered by ``_NATIVE_INSERT_ONLY`` (see plan-4 / Task 11 wart).
        specs = _build_specs_for_wave(
            wave, csv_by_sobject, native_csv_paths, manifest,
        )

        if not specs:
            checkpoint.mark_wave_started(wave.name)
            checkpoint.write(checkpoint_path)
            checkpoint.mark_wave_completed(wave.name)
            checkpoint.write(checkpoint_path)
            print(f"Wave {wave.name}: no non-empty CSVs, skipping.")
            continue

        checkpoint.mark_wave_started(wave.name)
        for spec in specs:
            checkpoint.update_csv_status(spec.sobject, in_progress=True)
        checkpoint.write(checkpoint_path)
        print(
            f"Wave {wave.name} ({wave.description}) — "
            f"{len(specs)} CSV(s), parallel={parallel}",
        )

        wave_result = run_wave_parallel(
            wave=wave,
            specs=specs,
            target_org=args.target_org,
            parallel=parallel,
            retry=retry,
        )

        for csv_result in wave_result.csv_results:
            checkpoint.update_csv_status(
                csv_result.sobject,
                in_progress=False,
                completed=(csv_result.error is None and csv_result.records_failed == 0),
                records_processed=csv_result.records_processed,
                records_failed=csv_result.records_failed,
                attempts=csv_result.attempts,
                duration_s=round(csv_result.duration_s, 2),
                error=csv_result.error,
            )
            manifest.object_status.setdefault(csv_result.sobject, {}).update({
                "records_processed": csv_result.records_processed,
                "records_failed": csv_result.records_failed,
                "attempts": csv_result.attempts,
                "duration_s": round(csv_result.duration_s, 2),
                "error": csv_result.error,
            })
        checkpoint.write(checkpoint_path)

        if wave_result.failed_csvs:
            for failed in wave_result.failed_csvs:
                print(
                    f"  FAIL {failed.sobject}: "
                    f"records_failed={failed.records_failed} "
                    f"error={failed.error!r}",
                    file=sys.stderr,
                )
            print(
                f"Wave {wave.name} failed — checkpoint written to "
                f"{checkpoint_path}. Re-run with `hydrate.py resume` to "
                f"retry from this wave.",
                file=sys.stderr,
            )
            checkpoint.exit_code = _LOAD_FAILED_EXIT
            checkpoint.write(checkpoint_path)
            manifest.exit_code = _LOAD_FAILED_EXIT
            manifest.completed_waves = list(checkpoint.completed_waves)
            manifest.write(run_dir / "manifest.json")
            return _LOAD_FAILED_EXIT

        checkpoint.mark_wave_completed(wave.name)
        manifest.completed_waves = list(checkpoint.completed_waves)
        checkpoint.write(checkpoint_path)
        print(
            f"Wave {wave.name} ok — "
            f"{wave_result.total_records_processed} processed, "
            f"{wave_result.total_records_failed} failed, "
            f"{wave_result.total_duration_s:.1f}s",
        )

        # Post-wave: refresh resolver / native maps as appropriate.
        if wave.name == "A":
            loaded = resolver.populate_from_org(runner, "Account")
            resolver.save(resolved_dir / "Account.json")
            checkpoint.id_resolution["Account"] = str(resolved_dir / "Account.json")
            checkpoint.write(checkpoint_path)
            print(
                f"  Resolver: populated {loaded} Account(s) and "
                f"{len(resolver.contact_id_by_account_external_id)} "
                f"Person Account auto-Contact(s)",
            )
        elif wave.name == "B":
            loaded = resolver.populate_from_org(
                runner, "Contact", external_id_field="External_Id__c",
            )
            resolver.save(resolved_dir / "Contact.json")
            checkpoint.id_resolution["Contact"] = str(resolved_dir / "Contact.json")
            checkpoint.write(checkpoint_path)
            if loaded:
                print(f"  Resolver: populated {loaded} Contact(s)")
        elif wave.name == "D":
            # Phase 3 query-back: legacy FA + Goal External_ID -> Salesforce Id
            # are needed for the LegacyId__c column on native FA / Goal
            # (a plain Salesforce-Id field, NOT an external-id reference).
            if not skip_natives:
                fa_loaded = resolver.populate_from_org(
                    runner, "FinServ__FinancialAccount__c",
                )
                goal_loaded = resolver.populate_from_org(
                    runner, "FinServ__FinancialGoal__c",
                )
                resolver.save(resolved_dir / "Wave_D.json")
                checkpoint.id_resolution["Wave_D"] = str(resolved_dir / "Wave_D.json")
                checkpoint.write(checkpoint_path)
                print(
                    f"  Resolver: populated {fa_loaded} legacy FA(s) "
                    f"and {goal_loaded} legacy Goal(s) for native bridge"
                )
        elif wave.name == "F" and not skip_natives:
            # Post-Wave-F: build the HYDRATE-NFA-NNN -> native FA Sf Id
            # map Wave G needs. Native FinancialAccount has NO
            # External_ID__c in jdo-fw51xz (only LegacyId__c which holds
            # the legacy FA's Sf Id), so we resolve through a two-hop
            # join: HYDRATE-NFA-NNN -> HYDRATE-FA-NNN (identity rename) ->
            # legacy FA Sf Id (legacy resolver) -> native FA Sf Id (this
            # query, keyed by LegacyId__c).
            native_fa_rows = runner.query(
                "SELECT Id, LegacyId__c FROM FinancialAccount "
                "WHERE LegacyId__c != null"
            )
            # legacy_FA_Sf_Id -> native_FA_Sf_Id
            legacy_id_to_native_id: dict[str, str] = {}
            for row in native_fa_rows:
                legacy_id = row.get("LegacyId__c")
                native_id = row.get("Id")
                if legacy_id and native_id:
                    legacy_id_to_native_id[legacy_id] = native_id

            # Build HYDRATE-NFA-NNN -> native FA Sf Id by chaining:
            # NFA-ext -> FA-ext (identity rename) -> legacy_FA_Sf_Id (resolver)
            # -> native FA Sf Id (legacy_id_to_native_id above).
            for legacy in financial_accounts:
                legacy_ext = legacy.get("External_ID__c")
                if not legacy_ext:
                    continue
                native_ext = legacy_ext.replace(
                    "HYDRATE-FA-", "HYDRATE-NFA-", 1,
                )
                legacy_fa_to_native_fa[legacy_ext] = native_ext
                legacy_sf_id = resolver.by_external_id.get(legacy_ext)
                if legacy_sf_id is None:
                    continue
                native_sf_id = legacy_id_to_native_id.get(legacy_sf_id)
                if native_sf_id is not None:
                    native_fa_id_map[native_ext] = native_sf_id
            print(
                f"  Native resolver: populated {len(native_fa_id_map)} "
                f"native FA Id(s) for Wave G"
            )

    # ---- Phase 5 — Apex post-load wireup ---------------------------------
    if not getattr(args, "skip_apex_wireup", False):
        print("Phase 5: Apex post-load wireup …")
        from customer_hydration.phase5.apex_wireup import execute_phase5
        apex_result = execute_phase5(
            package_root=Path(args.config_dir).parent,  # = Customer_Hydration/
            target_org=args.target_org,
            skip_deploy=False,  # always deploy fresh; sf project deploy is idempotent
        )
        checkpoint.object_status["Apex_PostLoad_Wireup"] = {
            "deployed_force_app": apex_result.deployed_force_app,
            "deploy_id": apex_result.deploy_id,
            "apex_run_succeeded": apex_result.apex_run_succeeded,
            "apex_error": apex_result.apex_error,
        }
        manifest.object_status["Apex_PostLoad_Wireup"] = dict(
            checkpoint.object_status["Apex_PostLoad_Wireup"]
        )
        if apex_result.apex_run_succeeded:
            print("  Apex wireup OK")
        else:
            # Non-fatal — log and continue to Phase 5.5
            print(f"  Apex wireup FAIL: {apex_result.apex_error}")
    else:
        print("Phase 5: Apex wireup SKIPPED (--skip-apex-wireup)")

    # ---- Phase 5.5 — Data Cloud stream refresh ---------------------------
    if not getattr(args, "skip_data_cloud", False):
        print("Phase 5.5: Data Cloud stream refresh …")
        from customer_hydration.phase5.data_cloud import execute_phase5_5
        dc_result = execute_phase5_5(target_org=args.target_org)
        checkpoint.object_status["DataCloud_Stream_Refresh"] = {
            "streams_discovered": dc_result.streams_discovered,
            "streams_matched": dc_result.streams_matched,
            "streams_triggered": dc_result.streams_triggered,
            "stream_runs": [
                {
                    "stream_api_name": sr.stream_api_name,
                    "source_object": sr.source_object,
                    "run_id": sr.run_id,
                    "status": sr.status,
                    "triggered_at": sr.triggered_at,
                    "error": sr.error,
                }
                for sr in dc_result.stream_runs
            ],
            "stream_trigger_failures": dc_result.stream_trigger_failures,
        }
        manifest.object_status["DataCloud_Stream_Refresh"] = dict(
            checkpoint.object_status["DataCloud_Stream_Refresh"]
        )
        print(
            f"  DC stream refresh: {dc_result.streams_triggered}/{dc_result.streams_matched} triggered "
            f"({len(dc_result.stream_trigger_failures)} failures)"
        )
        # Phase 5.5 NEVER raises — failures are logged in manifest only
    else:
        print("Phase 5.5: DC stream refresh SKIPPED (--skip-data-cloud)")

    # ---- Final manifest --------------------------------------------------
    checkpoint.exit_code = 0
    checkpoint.write(checkpoint_path)
    manifest.exit_code = 0
    manifest.completed_waves = list(checkpoint.completed_waves)
    manifest.write(run_dir / "manifest.json")
    print(f"Done. Manifest: {run_dir / 'manifest.json'}")
    return 0


# ---- Resume ---------------------------------------------------------------


def find_resumable_run(output_dir: Path) -> RunCheckpoint | None:
    """Public hook used by ``hydrate.py resume``."""
    return find_latest_resumable(output_dir)


# ---------- Helpers --------------------------------------------------------


def _resolve_rt_id(
    runner: SfRunner,
    sobject: str,
    developer_name: str,
    *,
    label: str | None = None,
    soft: bool = False,
) -> str | None:
    """Resolve an active RecordType.Id by SobjectType + DeveloperName."""
    rows = runner.query(
        f"SELECT Id FROM RecordType WHERE SobjectType='{sobject}' "
        f"AND DeveloperName='{developer_name}' AND IsActive=true "
        f"ORDER BY CreatedDate DESC LIMIT 1"
    )
    if not rows:
        if not soft:
            print(
                f"No {label or developer_name} found in target org.",
                file=sys.stderr,
            )
        return None
    return rows[0]["Id"]


def _safe_seek(runner: SfRunner, prefix: str, sobject: str) -> int:
    """``compute_next_seq`` with a defensive fallback for missing fields.

    If ``External_ID__c`` doesn't exist on the sobject (the native FSC
    objects vary by FSC version — some carry it, some don't), the
    underlying SOQL query raises ``SfCliError`` with INVALID_FIELD. We
    treat that as "no prior records of this prefix" and return 1, letting
    the runner emit fresh ``HYDRATE-Nxxx-NNN`` ext-ids that will be
    silently dropped by the CSV writer's preflight filter.
    """
    try:
        return compute_next_seq(runner, prefix, sobject)
    except Exception as exc:  # noqa: BLE001 — SfCliError is the expected case
        msg = str(exc)
        if "INVALID_FIELD" in msg or "No such column" in msg:
            return 1
        raise


def _seek_via_ssid(runner: SfRunner, prefix: str, sobject: str) -> int:
    """seek-pointer helper for objects keyed by FinServ__SourceSystemId__c."""
    soql = (
        f"SELECT FinServ__SourceSystemId__c FROM {sobject} "
        f"WHERE FinServ__SourceSystemId__c LIKE '{prefix}-%'"
    )
    rows = runner.query(soql)
    seqs = [
        s
        for r in rows
        if (s := parse_seq_from_external_id(r.get("FinServ__SourceSystemId__c"))) is not None
    ]
    return max(seqs, default=0) + 1


def _rewrite_parent_headers(csv_path: Path, replacements: dict[str, str]) -> None:
    """Replace each ``old_col -> new_col`` in the CSV header line."""
    if not csv_path.exists():
        return
    text = csv_path.read_text(encoding="utf-8")
    lines = text.splitlines()
    if not lines:
        return
    header = lines[0]
    if "." in header:
        return  # already rewritten
    new_header = header
    for old, new in replacements.items():
        cols = new_header.split(",")
        new_header = ",".join(new if c == old else c for c in cols)
    if new_header == header:
        return
    csv_path.write_text("\n".join([new_header, *lines[1:]]) + "\n", encoding="utf-8")


def _rewrite_native_fa_markers(
    csv_path: Path, native_fa_id_map: dict[str, str],
) -> None:
    """Replace ``RESOLVE-NFA:HYDRATE-NFA-NNN`` markers with native FA Sf Ids.

    Distinct from ``rewrite_csv_resolve_markers`` because the native FA
    Id map lives outside the standard ``IdResolver`` (which is
    External_ID__c-keyed in legacy maps). Rows whose marker can't be
    resolved are silently dropped.
    """
    if not csv_path.exists():
        return
    import csv as _csv

    text = csv_path.read_text(encoding="utf-8")
    lines = text.splitlines()
    if len(lines) < 2:
        return
    reader = _csv.DictReader(lines)
    fieldnames = list(reader.fieldnames or [])
    kept: list[dict[str, str]] = []
    for row in reader:
        marker = row.get("FinancialAccountId", "")
        if marker.startswith("RESOLVE-NFA:"):
            native_ext = marker[len("RESOLVE-NFA:"):]
            native_id = native_fa_id_map.get(native_ext)
            if native_id is None:
                continue  # drop unresolved
            row["FinancialAccountId"] = native_id
        kept.append(row)
    with csv_path.open("w", encoding="utf-8", newline="") as fh:
        writer = _csv.DictWriter(
            fh, fieldnames=fieldnames, lineterminator="\n",
            quoting=_csv.QUOTE_MINIMAL,
        )
        writer.writeheader()
        for row in kept:
            writer.writerow(row)


def _build_household_requests(
    member_ext_ids: list[str],
    accounts: list[dict],
    *,
    members_per_household: int = 5,
) -> list[HouseholdRequest]:
    """Group Person Account ext-ids into 5-member households."""
    by_ext_id = {a["External_ID__c"]: a for a in accounts}
    requests: list[HouseholdRequest] = []
    for i in range(0, len(member_ext_ids), members_per_household):
        members = member_ext_ids[i:i + members_per_household]
        if len(members) < 2:
            continue
        first = by_ext_id.get(members[0], {})
        surname = first.get("LastName") or "Hydration"
        requests.append(HouseholdRequest(surname=surname, member_external_ids=members))
    return requests


def _build_card_requests(
    retail_ext_ids: list[str],
    financial_accounts: list[dict],
    accounts: list[dict],
    *,
    n_per_customer: int = 1,
) -> list[CardRequest]:
    """Build CardRequests for each retail customer."""
    by_owner_fas: dict[str, list[dict]] = {}
    for fa in financial_accounts:
        owner = fa.get("FinServ__PrimaryOwner__c")
        if owner:
            by_owner_fas.setdefault(owner, []).append(fa)

    by_ext_id = {a["External_ID__c"]: a for a in accounts}
    requests: list[CardRequest] = []
    for ext_id in retail_ext_ids:
        fas = by_owner_fas.get(ext_id, [])
        if not fas:
            continue
        fa = fas[0]
        acct = by_ext_id.get(ext_id, {})
        first = acct.get("FirstName", "Cumulus")
        last = acct.get("LastName", "Customer")
        cardholder = f"{first} {last}".strip()
        for _ in range(n_per_customer):
            requests.append(CardRequest(
                account_external_id=ext_id,
                fa_external_id=fa["External_ID__c"],
                cardholder_name=cardholder,
                card_type="Credit",
                card_product="Cash Rewards",
            ))
    return requests


def _build_specs_for_wave(
    wave: Wave,
    csv_by_sobject: dict[str, Path],
    native_csv_paths: dict[str, Path],
    manifest,
) -> list[CsvLoadSpec]:
    """Filter the wave's sobjects down to non-empty CSVs we know how to load.

    Native objects without External_ID__c (PartyRelationshipGroup,
    PartyProfile, ContactPoint*, FinancialAccountParty) are silently
    skipped — see ``_NATIVE_INSERT_ONLY`` and AGENTS.md / Plan 4 §wart.
    """
    specs: list[CsvLoadSpec] = []
    paths = {**csv_by_sobject, **native_csv_paths}
    for sobject in wave.sobjects:
        if sobject not in paths:
            continue
        if sobject in _NATIVE_INSERT_ONLY:
            continue  # no External_ID__c — skipped per plan-4 wart
        if sobject not in _IDEM_FIELD:
            continue
        path = paths[sobject]
        status = manifest.object_status.get(sobject, {})
        if status.get("rows_written", 0) <= 0:
            continue
        if not path.exists():
            continue
        specs.append(CsvLoadSpec(
            sobject=sobject,
            csv_path=path,
            external_id_field=_IDEM_FIELD[sobject],
        ))
    return specs


def _build_and_write_native_csvs(
    *,
    runner: SfRunner,  # noqa: ARG001 — kept for future query-driven tweaks
    cache,
    run_dir: Path,
    manifest,
    checkpoint: RunCheckpoint,
    checkpoint_path: Path,
    csv_by_sobject: dict[str, Path],  # noqa: ARG001 — symmetry with caller
    native_csv_paths: dict[str, Path],
    resolver: IdResolver,
    accounts: list[dict],
    households: list[dict],
    contacts: list[dict],
    financial_accounts: list[dict],
    fa_roles: list[dict],
    goals: list[dict],
    retail_ext_ids: list[str],
    wealth_ext_ids: list[str],
    household_membership_map: dict[str, str],
    milestone_requests: list[BusinessMilestoneRequest],
    native_fa_seek: int,
    native_goal_seek: int,
    native_ms_seek: int,
) -> None:
    """Generate native bundles and write the 9 native CSVs for live loads.

    Called between Wave E (post-D query-back populated the resolver's
    legacy FA + Goal maps) and Wave F. The legacy_id_map for native FA /
    Goal is built from the resolver's ``by_external_id`` map.
    """
    # legacy_id_map: legacy External_ID -> legacy Salesforce Id, sliced
    # to FA-prefixed and Goal-prefixed entries respectively.
    legacy_fa_id_map = {
        ext: rid for ext, rid in resolver.by_external_id.items()
        if ext.startswith("HYDRATE-FA-")
    }
    legacy_goal_id_map = {
        ext: rid for ext, rid in resolver.by_external_id.items()
        if ext.startswith("HYDRATE-GOAL-")
    }

    person_account_ext_ids = set(retail_ext_ids) | set(wealth_ext_ids)
    person_account_rows = [
        a for a in accounts
        if a.get("External_ID__c") in person_account_ext_ids
    ]

    native_fa_bundle = generate_native_financial_accounts(
        starting_seq=native_fa_seek,
        legacy_fa_rows=financial_accounts,
        legacy_id_map=legacy_fa_id_map,
    )
    native_goal_bundle = generate_native_financial_goals(
        starting_seq=native_goal_seek,
        legacy_goal_rows=goals,
        legacy_id_map=legacy_goal_id_map,
    )
    milestone_bundle = generate_business_milestones(
        starting_seq=native_ms_seek,
        requests=milestone_requests,
    )
    prg_bundle = generate_party_relationship_groups(
        household_account_rows=households,
    )
    party_profile_bundle = generate_party_profiles(
        person_account_rows=person_account_rows,
        business_contact_rows=contacts,
        household_membership_map=household_membership_map,
    )
    cp_bundle = generate_contact_points(
        person_account_rows=person_account_rows,
        business_contact_rows=contacts,
    )
    fa_party_bundle = generate_native_financial_account_parties(
        legacy_role_rows=fa_roles,
        legacy_fa_to_native_fa=None,
    )

    native_csv_specs: list[tuple[str, list[dict], Path]] = [
        ("FinancialAccount", native_fa_bundle.rows,
         run_dir / "native_financial_accounts.csv"),
        ("FinancialGoal", native_goal_bundle.rows,
         run_dir / "native_financial_goals.csv"),
        ("BusinessMilestone", milestone_bundle.rows,
         run_dir / "business_milestones.csv"),
        ("PartyRelationshipGroup", prg_bundle.rows,
         run_dir / "party_relationship_groups.csv"),
        ("PartyProfile", party_profile_bundle.rows,
         run_dir / "party_profiles.csv"),
        ("ContactPointAddress", cp_bundle.addresses,
         run_dir / "contact_point_addresses.csv"),
        ("ContactPointEmail", cp_bundle.emails,
         run_dir / "contact_point_emails.csv"),
        ("ContactPointPhone", cp_bundle.phones,
         run_dir / "contact_point_phones.csv"),
        ("FinancialAccountParty", fa_party_bundle.rows,
         run_dir / "financial_account_parties.csv"),
    ]
    for sobject, rows, path in native_csv_specs:
        write_result = write_csv(rows, sobject, cache, path)
        manifest.object_status[sobject] = {
            "csv_path": str(path),
            "rows_written": write_result.rows_written,
            "dropped_fields": sorted(write_result.dropped_fields),
        }
        checkpoint.update_csv_status(
            sobject,
            csv_path=str(path),
            rows_written=write_result.rows_written,
        )
        native_csv_paths[sobject] = path

    checkpoint.write(checkpoint_path)
