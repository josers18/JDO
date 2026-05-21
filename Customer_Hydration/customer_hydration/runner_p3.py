"""Plan 3 runner: 4-persona generation + 14-CSV multi-wave parallel load.

Replaces ``runner_p2.py``'s sequential bulk-load loop with the wave
orchestrator from ``loader/``. The generation half (Phase 0 preflight,
RecordType resolution, External-ID seek pointers, persona + child
generators) is structurally identical to runner_p2 — Plan 3 leaves that
shape alone on purpose so reviewers can ``diff`` runner_p2.py and
runner_p3.py and see ONLY the load-side changes.

What's new vs runner_p2.py:

  - Generates 14 CSVs (was 12). The new CSVs are:
      * acrs.csv          — AccountContactRelation rows that wire each
                             Person Account into a household (emitted by
                             ``generate_households`` since Plan 3).
      * campaign_members.csv — CampaignMember rows that target each
                             customer at the persona-appropriate
                             campaigns (emitted by
                             ``generate_campaign_members`` since Plan 3).
    Tasks/Events now retain their ``WhatId`` column carrying a
    ``RESOLVE:HYDRATE-…`` marker (Plan 2 dropped the column entirely).

  - Sequential single-CSV bulk load → multi-wave parallel orchestration.
    ``loader.wave.WAVE_DEFS`` defines five waves (A → E); within each
    wave ``loader.parallel.run_wave_parallel`` fans out CSV upserts
    across a thread pool with retry/backoff per spec. Wave-level
    fail-fast: if any CSV in a wave reports ``records_failed > 0`` or
    exhausts retries, the runner writes a checkpoint and exits 2 BEFORE
    starting the next wave.

  - Inter-wave ID resolution. Three of the 14 CSVs carry ``RESOLVE:``
    markers that can't be resolved client-side at generation time:
      * acrs.csv (ContactId)             — auto-Contact for Person Account
      * tasks.csv / events.csv (WhatId)  — polymorphic FK; Bulk API 2.0
                                            can't resolve via external-id
      * campaign_members.csv (ContactId) — same Person Account
                                            auto-Contact pattern as ACR
    After Wave-A loads Accounts, the runner queries the org for
    {External_ID__c → Salesforce Id} maps via ``loader.id_resolver`` and
    rewrites markers in place per CSV before that CSV's wave starts.

  - Checkpoint/resume support. ``RunCheckpoint`` is persisted under
    ``output/run-{ts}/checkpoint.json`` after every wave (and every CSV
    inside a wave finishes). ``hydrate.py resume`` (Plan 3 / Task 11)
    reads it back. Resumes pick up at ``in_progress_wave`` — completed
    waves are NOT re-run.

What stays the same:

  - Phase 0 preflight describes (now extended to include Contact, ACR,
    CampaignMember).
  - RecordType resolution order (FSC_Person_Accounts mandatory;
    IndustriesBusiness preferred over Business_Account; Households
    optional).
  - --rm filter only restricts the wealth persona owner pool.
  - --skip-natives / --skip-apex-wireup / --skip-data-cloud are no-ops
    in Plan 3 (those phases land in Plans 4 / 5 / 5).
  - --data-cloud-only exits 2 (Plan 3 has no DC trigger to run).
  - --personas filters the four persona keys; unknown values reject
    with exit 2.
  - Header rewrites for parent-id external-id reference syntax (Bulk API
    2.0). New rewrites in Plan 3: ``acrs.csv`` and
    ``campaign_members.csv``.
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
from customer_hydration.preflight import run_preflight
from customer_hydration.seek import compute_next_seq, parse_seq_from_external_id
from customer_hydration.sf_runner import SfRunner


# All sObjects Plan 3 touches. Phase 0 describes each so the CSV writer
# can drop unknown columns from generator output. Adds Contact, ACR,
# and CampaignMember vs the Plan 2 list.
PHASE0_OBJECTS = [
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
]

# Default anchor — kept identical to Plan 2 / runner_p2 / activity /
# campaigns generator anchors so age math and calendar bins line up.
ANCHOR_DATE = date(2026, 5, 20)

# All persona keys Plan 3 understands. --personas filters this set.
ALL_PERSONAS = ("retail", "wealth", "smb", "commercial")

# Cross-cutting child volumes per persona — Plan 3 keeps the readable
# 1-per-customer cap from Plan 2; Plan 4 will dial these up.
CARDS_PER_RETAIL = 1
LIFEEVENTS_PER_WEALTH = 1
TASKS_PER_CUSTOMER = 1
CASES_PER_CUSTOMER = 1
OPPS_PER_CUSTOMER = 1
EVENTS_FRAC = 0.5  # half of all customers get an event

# Per-sObject idempotency field. Most use External_ID__c; LifeEvent and
# Holding only carry FinServ__SourceSystemId__c. Contact uses External_Id__c
# (lowercase 'd' — case matters; documented in AGENTS.md).
_IDEM_FIELD: dict[str, str] = {
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
}

# Wave-level fail-fast exit code. Distinct from generic-error 2 so the
# CLI can differentiate a config/preflight failure (2) from a load failure
# that produced a resumable checkpoint (still 2 — the resume command
# distinguishes via checkpoint.is_resumable()).
_LOAD_FAILED_EXIT = 2


def run_all(args: argparse.Namespace) -> int:
    """Plan 3 runner — multi-wave parallel load with checkpoint/resume.

    Returns the process exit code:
      0 — clean completion (or a clean dry run)
      2 — config/preflight error, OR a wave failed and a resumable
          checkpoint was written
    """
    # ---- Argparse / global gates ----------------------------------------
    if args.target_org is None:
        print("--target-org is required", file=sys.stderr)
        return 2

    if args.data_cloud_only:
        print(
            "Plan 3 has no Data Cloud phase yet — use Plan 5 build first.",
            file=sys.stderr,
        )
        return 2

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

    # ---- Configs --------------------------------------------------------
    config_dir = Path(args.config_dir)
    rm_pool = yaml.safe_load((config_dir / "rm_pool.yaml").read_text())
    personas_cfg = yaml.safe_load((config_dir / "personas.yaml").read_text())
    catalog = yaml.safe_load((config_dir / "product_catalog.yaml").read_text())
    holding_universe_path = config_dir / "holding_universe.yaml"

    # External-ID prefixes per persona. retail prefix lives in personas.yaml;
    # the others are fixed by the spec and pinned here.
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
    # Plan 3 simplification: SMB book is owned by the commercial pool —
    # Allen Carter alone today; Plan 4 may split this out.
    smb_rm_ids = list(commercial_rm_ids)

    # --rm flag: only filters wealth in Plan 3. Match by name OR user id.
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
    cache = run_preflight(runner, PHASE0_OBJECTS)

    # ---- RecordType resolution ------------------------------------------
    person_rt_id = _resolve_rt_id(
        runner, "Account", "FSC_Person_Accounts",
        label="active FSC_Person_Accounts RecordType",
    )
    if person_rt_id is None:
        return 2

    # Business RT: prefer FSC-native IndustriesBusiness because
    # Business_Account is sometimes active org-wide but unassigned to user
    # profiles (causing INVALID_CROSS_REFERENCE_KEY on bulk upsert). Order
    # matches runner_p2's verified-good order.
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
    # Households are optional — if the RT isn't present, we just skip
    # household generation (and consequently ACR generation).

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

    # ---- Persona generation ---------------------------------------------
    accounts: list[dict] = []
    financial_accounts: list[dict] = []
    fa_roles: list[dict] = []

    # Track which Account ext_ids belong to which persona so the
    # cross-cutting child generators can fan out per persona.
    retail_ext_ids: list[str] = []
    wealth_ext_ids: list[str] = []
    smb_ext_ids: list[str] = []
    commercial_ext_ids: list[str] = []
    # Mapping ext_id → owner user id; lets activity generators pick a
    # consistent RM rather than redrawing.
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

    # ---- Households + ACR (Plan 3) --------------------------------------
    households: list[dict] = []
    acrs: list[dict] = []
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

    # ---- Holdings (from wealth bundle holding_requests) -----------------
    holdings: list[dict] = []
    if wealth_holding_requests and holding_universe_path.exists():
        holdings = generate_holdings(
            seed=args.seed + 4,
            starting_seq=hold_seek,
            requests=wealth_holding_requests,
            universe_path=holding_universe_path,
        ).holdings

    # ---- Goals -----------------------------------------------------------
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

    # ---- Life events (wealth only — Person Account anchor) --------------
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

    # Plan 3 keeps Tasks/Events ``WhatId`` — the activity generator emits
    # ``RESOLVE:HYDRATE-…`` markers, and IdResolver will rewrite them to
    # real Account Ids before Wave-D / E load. (Plan 2 dropped the column
    # entirely because it had no resolver.)

    # ---- Campaigns + CampaignMembers (Plan 3) ----------------------------
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
        "skip_natives": bool(args.skip_natives),
        "skip_apex_wireup": bool(args.skip_apex_wireup),
        "skip_data_cloud": bool(args.skip_data_cloud),
        "data_cloud_only": bool(args.data_cloud_only),
        "allow_production": bool(args.allow_production),
        "dry_run": bool(args.dry_run),
        "parallel": int(getattr(args, "parallel", 4) or 4),
        "plan": "p3",
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
    # Pin the checkpoint's run_id to the manifest's run_id so both files
    # share the same parent directory and resume can match them.
    checkpoint.run_id = manifest.run_id
    checkpoint_path = run_dir / "checkpoint.json"
    checkpoint.write(checkpoint_path)

    # ---- CSV writes ------------------------------------------------------
    # Combine households into accounts.csv — same RT-bearing sObject and
    # the loader binds upserts by External_ID__c on Account regardless of
    # RecordType. Households go AFTER persona accounts so the row ordering
    # reads naturally in the artifact.
    all_accounts = accounts + households

    # Plan 3 Contact CSV is intentionally empty. The generators today
    # don't emit business-officer Contact rows; Plan 4 owns that. Person
    # Account auto-Contacts are created by the platform at Account upsert
    # time, so this CSV being empty is correct (NOT a bug).
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

    # Map sObject → csv path for downstream wave orchestration.
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

    # Header rewrites for parent-id external-id reference syntax (Bulk
    # API 2.0). New in Plan 3: ACR ``AccountId`` and CampaignMember
    # ``CampaignId``. ACR ``ContactId`` and CampaignMember ``ContactId``
    # are NOT external-id-bound — they hold ``RESOLVE:`` markers that
    # IdResolver replaces with real Salesforce Ids before bulk-upsert.
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

    if args.dry_run:
        print(f"Dry run — CSVs written to {run_dir}, no bulk load performed.")
        manifest.exit_code = 0
        manifest.write(run_dir / "manifest.json")
        # Persist the checkpoint as a clean dry-run terminal state so
        # find_latest_resumable doesn't pick it up.
        checkpoint.exit_code = 0
        checkpoint.write(checkpoint_path)
        return 0

    # ---- Wave loop -------------------------------------------------------
    parallel = int(getattr(args, "parallel", 4) or 4)
    retry = RetryPolicy()
    resolver = IdResolver()
    resolved_dir = run_dir / "resolved"

    # --waves filter (debug aid). When unset, run every wave.
    only_waves: set[str] | None = (
        {w.strip().upper() for w in args.waves} if getattr(args, "waves", None) else None
    )

    for wave in waves_in_forward_order():
        if only_waves is not None and wave.name not in only_waves:
            continue

        # Pre-wave: resolve markers in this wave's CSVs. The resolver was
        # populated post-Wave-A and post-Wave-B (see end of loop body), so
        # by the time we hit Wave-C onwards the maps it needs are loaded.
        if wave.name == "C":
            acr_csv = csv_by_sobject.get("AccountContactRelation")
            if acr_csv is not None and acr_csv.exists():
                kept, dropped = rewrite_csv_resolve_markers(
                    acr_csv, ["ContactId"], resolver,
                )
                checkpoint.update_csv_status(
                    "AccountContactRelation",
                    rows_written=kept,
                    rows_dropped_unresolved=dropped,
                )
        elif wave.name == "D":
            # Tasks/Events live in Wave-E (per WAVE_DEFS), but their
            # WhatId markers point at Account ids resolved post-A. We
            # rewrite them here when Wave-E starts (see "E" block below).
            pass
        elif wave.name == "E":
            tasks_csv = csv_by_sobject.get("Task")
            if tasks_csv is not None and tasks_csv.exists():
                kept, dropped = rewrite_csv_resolve_markers(
                    tasks_csv, ["WhatId"], resolver,
                )
                checkpoint.update_csv_status(
                    "Task", rows_written=kept, rows_dropped_unresolved=dropped,
                )
            events_csv = csv_by_sobject.get("Event")
            if events_csv is not None and events_csv.exists():
                kept, dropped = rewrite_csv_resolve_markers(
                    events_csv, ["WhatId"], resolver,
                )
                checkpoint.update_csv_status(
                    "Event", rows_written=kept, rows_dropped_unresolved=dropped,
                )
            cm_csv = csv_by_sobject.get("CampaignMember")
            if cm_csv is not None and cm_csv.exists():
                kept, dropped = rewrite_csv_resolve_markers(
                    cm_csv, ["ContactId"], resolver,
                )
                checkpoint.update_csv_status(
                    "CampaignMember",
                    rows_written=kept,
                    rows_dropped_unresolved=dropped,
                )

        # Build the spec list for this wave — only sobjects with non-empty
        # CSVs. ``run_wave_parallel`` accepts an empty specs list (it just
        # returns a WaveResult with no csv_results), so this is safe.
        specs = _build_specs_for_wave(wave, csv_by_sobject, manifest)

        if not specs:
            # No-op wave (all CSVs empty). Still mark it complete so resume
            # logic doesn't re-enter.
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

        # Update checkpoint + manifest with per-CSV outcomes.
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
            manifest.object_status[csv_result.sobject].update({
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

        # Post-wave: refresh resolver from newly-loaded objects so the
        # next wave's pre-wave rewrite has the maps it needs. We run this
        # AFTER mark_wave_completed so resume logic sees the wave done
        # before the (potentially slow) query-back.
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
            # Plan 3 doesn't generate Contact rows yet; the call is a
            # no-op when no business-officer Contacts exist. Still wire
            # it in so Plan 4 only has to add the rows.
            loaded = resolver.populate_from_org(
                runner, "Contact", external_id_field="External_Id__c",
            )
            resolver.save(resolved_dir / "Contact.json")
            checkpoint.id_resolution["Contact"] = str(resolved_dir / "Contact.json")
            checkpoint.write(checkpoint_path)
            if loaded:
                print(f"  Resolver: populated {loaded} Contact(s)")

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
    """Public hook used by ``hydrate.py resume`` (Plan 3 / Task 11).

    Returns the most-recent resumable checkpoint under ``output_dir``, or
    ``None`` if nothing resumable is present. Thin wrapper around
    ``find_latest_resumable`` so the CLI doesn't import the loader module
    directly.
    """
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
    """Resolve an active RecordType.Id by SobjectType + DeveloperName.

    Returns the most-recently-created active RT id, or ``None`` when the
    record type is missing. ``soft=True`` suppresses the stderr message so
    callers can probe several developer names quietly.
    """
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


def _seek_via_ssid(runner: SfRunner, prefix: str, sobject: str) -> int:
    """seek-pointer helper for objects whose idempotency key is
    ``FinServ__SourceSystemId__c`` rather than ``External_ID__c``.

    Returns 1 if the org has no matching records; otherwise (max seq) + 1.
    """
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
    """Replace each ``old_col → new_col`` in the CSV header line.

    No-ops when the CSV is missing, empty, or already rewritten (the
    presence of any '.' in a header column is the idempotency tell —
    Salesforce CSV columns are physical field API names which never
    contain '.'). Body rows are NEVER touched.
    """
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
        # Be precise — match only as a whole CSV column, not as a substring
        # of a longer column. This keeps a column called e.g. "FooAccountId"
        # safe when we're only rewriting "AccountId".
        cols = new_header.split(",")
        new_header = ",".join(new if c == old else c for c in cols)
    if new_header == header:
        return
    csv_path.write_text("\n".join([new_header, *lines[1:]]) + "\n", encoding="utf-8")


def _build_household_requests(
    member_ext_ids: list[str],
    accounts: list[dict],
    *,
    members_per_household: int = 5,
) -> list[HouseholdRequest]:
    """Group Person Account ext-ids into 5-member households.

    Surname is taken from the first member's LastName; falls back to
    "Hydration" when the row has no LastName. Last partial group is kept
    only if it has at least 2 members — solo households read poorly in
    the demo.
    """
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
    """Build CardRequests for each retail customer.

    Each retail customer gets ``n_per_customer`` cards bound to their
    first FA (the Checking account in retail.py). Cardholder name is
    rendered from the Account's FirstName + LastName when present.
    """
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
    manifest,
) -> list[CsvLoadSpec]:
    """Filter the wave's sobjects down to non-empty CSVs we know how to load.

    An sobject is included when:
      * It has an entry in ``csv_by_sobject`` (i.e. the runner generated it),
      * The CSV's ``rows_written`` (per the manifest's object_status) is > 0,
      * The CSV file exists on disk (defensive against hand edits).
      * We have an idempotency field for it in ``_IDEM_FIELD``.

    Anything else is silently skipped. ``run_wave_parallel`` accepts an
    empty list and returns a no-op WaveResult, so the caller only needs
    to handle the empty case for logging.
    """
    specs: list[CsvLoadSpec] = []
    for sobject in wave.sobjects:
        if sobject not in csv_by_sobject:
            continue
        if sobject not in _IDEM_FIELD:
            continue
        path = csv_by_sobject[sobject]
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
