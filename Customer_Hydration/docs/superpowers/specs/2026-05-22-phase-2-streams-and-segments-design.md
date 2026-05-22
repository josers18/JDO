# Phase 2 — DC stream refresh + segment creation

**Status:** Approved through brainstorming on 2026-05-22. Awaiting user review of this written spec before invoking `superpowers:writing-plans`.

**Authors:** Jose Sifontes (product), Claude (drafting partner).

**Goal:** Extend `Customer_Hydration/` with two new CLI subcommands: `refresh-streams` (kicks the existing Data Cloud streams now that Phase 1 records are loaded and streams are configured) and `create-segments` (reads a YAML segment definition file, creates and publishes ~20 persona-driven segments via the Data Cloud REST API). Extend `dc-status` to surface both stream-run state and segment-publication state.

**Non-goal:** Activations (push to Marketing Cloud / Ads / Agentforce skills), Calculated Insights, DLO/DMO mapping changes, stream creation. All of those are either already done on the user's side or explicitly deferred.

**Tech stack:** Python 3.11, stdlib `urllib.request` (no new third-party deps — reuse Phase 5.5 patterns), PyYAML (already a dep), Salesforce CLI v2 for org session token. Target org `jdo-fw51xz`. Anchor date 2026-05-22.

---

## §1 Scope

### What's in

1. **`refresh-streams` subcommand.** Equivalent to the Phase 5.5 `--data-cloud-only` path that's already in `runner_p5.py`, surfaced as a top-level subcommand for clarity. Discovers existing DC streams, filters to those whose source object matches a HYDRATE-* hydrated object, triggers a refresh on each, logs run Ids to the manifest. Fire-and-forget — no waiting on completion. `dc-status` polls run state later.

2. **`create-segments` subcommand.** Reads `Customer_Hydration/config/segments.yaml`, creates and publishes ~20 segments via the Data Cloud REST API. Idempotent: existing segments are PATCHed rather than POSTed; publish is re-runnable. Logs created/published/failed per segment to a per-run manifest. Exits 0 even if some publishes fail (per the Phase 5.5 fire-and-forget convention).

3. **`dc-status` extension.** Currently reports stream-run state from the latest manifest. Extended to also report segment-publication state: per-segment status (`DRAFT` / `PUBLISHING` / `PUBLISHED` / `FAILED`), member count, last-run timestamp. `--watch` flag polls every 30 seconds until all segments reach a terminal state.

4. **`config/segments.yaml`.** ~20 segment definitions covering 4 persona base segments + 6 lifecycle sub-segments + 10 campaign-aligned segments.

5. **Tests.** Unit tests for segment parsing, REST client extensions, CLI subcommand wiring. Integration test via `--dry-run` against the live org.

### What's out

- DC Activations (Marketing Cloud / Ads / Agentforce skill push) — Phase 2.5 if needed
- Calculated Insights — already done on user's side
- DLO/DMO mapping changes — already done on user's side
- Stream creation — only refreshing existing streams, not building new ones
- New runner orchestration — Phase 2 is two standalone subcommands, not a new wave/phase in the hydrate pipeline

---

## §2 File additions and modifications

```
Customer_Hydration/
├── config/
│   └── segments.yaml                                    # NEW
├── customer_hydration/
│   ├── phase5/
│   │   ├── data_cloud.py                                # MODIFIED — add segment CRUD methods
│   │   └── segments.py                                  # NEW — YAML loader, create + publish + query state
│   └── cli.py                                           # MODIFIED — add refresh-streams + create-segments + dc-status segment view
├── tests/
│   ├── test_segments.py                                 # NEW — YAML parsing + REST client tests
│   └── test_cli_phase2.py                               # NEW — CLI dispatch tests for new subcommands
└── docs/
    └── superpowers/specs/2026-05-22-phase-2-streams-and-segments-design.md   ← this file
```

`runner_p5.py` is **not modified.** Phase 2 lives outside the hydrate pipeline. The new subcommands call into `phase5/segments.py` directly.

---

## §3 `config/segments.yaml` shape and contents

### File schema

```yaml
# Phase 2 segment definitions for Customer_Hydration.
# Each entry creates one Data Cloud Segment via the REST API.
# Segment API names are deterministic: HYDRATE_<config_key>__seg
# Members are filtered by External_ID__c LIKE 'HYDRATE-%' to avoid leaking
# non-hydrate accounts into the demo segments.

segments:
  <config_key>:
    name: "<Display Name>"
    description: "<One-sentence description>"
    persona: retail | wealth | smb | commercial | mixed
    publish_schedule: hourly | daily | weekly | manual
    target_dmo: <DMO_API_NAME>
    rule:
      type: sql
      filter: "<DC SQL filter expression>"
    linked_campaign: <HYDRATE-CMP-XXX>     # optional, for campaign-aligned segments
```

### The 20 segments

**4 persona base segments:**

| Config key | Display name | Filter |
|---|---|---|
| `retail_all` | Retail Customers | `FinServ__ClientCategory__c = 'Retail'` |
| `wealth_all` | Wealth Management Clients | `FinServ__ClientCategory__c = 'Wealth Management'` |
| `smb_all` | Small Business Clients | `FinServ__ClientCategory__c = 'Small Business'` |
| `commercial_all` | Commercial Banking Clients | `FinServ__ClientCategory__c = 'Commercial Banking'` |

**6 lifecycle / sub-segments:**

| Config key | Display name | Filter |
|---|---|---|
| `wealth_pre_retiree` | Wealth Pre-Retirees (55-65) | `Wealth Management AND age between 55-65` |
| `retail_family_with_mortgage` | Retail Family-Building with Mortgage | `Retail AND life_stage = family_building AND has Loans FA with HELOC or 30Y mortgage` |
| `retail_heloc_drawn` | Retail HELOC Drawn 50%+ | `Retail AND HELOC FA balance >= 50% of LoanAmount` |
| `smb_with_sba` | SMB Owners with SBA Loan | `Small Business AND has SBA Loan FA` |
| `commercial_with_treasury` | Commercial with Treasury Services | `Commercial AND has Treasury Management FA` |
| `wealth_recent_life_event` | Wealth with Recent Life Event (90d) | `Wealth Management AND LifeEvent.EventDate within last 90 days` |

**10 campaign-aligned segments** (one per existing HYDRATE-CMP-* Campaign):

| Config key | Display name | Linked campaign |
|---|---|---|
| `cmp_heloc_refi_outreach` | HELOC Refi Outreach Q2 audience | HYDRATE-CMP-001 |
| `cmp_auto_loan_rate_drop` | Auto Loan Rate Drop Promo audience | HYDRATE-CMP-002 |
| `cmp_premier_checking_onboarding` | Premier Checking Onboarding cohort | HYDRATE-CMP-003 |
| `cmp_wealth_tax_strategy_webinar` | Wealth Tax Strategy Webinar audience | HYDRATE-CMP-004 |
| `cmp_wealth_estate_planning_roundtable` | Wealth Estate Planning Roundtable audience | HYDRATE-CMP-005 |
| `cmp_sba_awareness` | SBA Awareness audience | HYDRATE-CMP-006 |
| `cmp_treasury_modernization_brief` | Treasury Modernization Brief audience | HYDRATE-CMP-007 |
| `cmp_commercial_rm_roundtable` | Commercial RM Roundtable audience | HYDRATE-CMP-008 |
| `cmp_multi_persona_spring_newsletter` | Multi-Persona Spring Newsletter audience | HYDRATE-CMP-009 |
| `cmp_mobile_banking_adoption` | Mobile Banking Adoption audience | HYDRATE-CMP-010 |

Each campaign-aligned segment's filter mirrors the Phase 1 `plan_campaign_members()` persona-targeting logic. For example, `cmp_heloc_refi_outreach` selects retail customers who are also CampaignMembers of HYDRATE-CMP-001:

```yaml
cmp_heloc_refi_outreach:
  rule:
    type: sql
    filter: |
      FinServ__ClientCategory__c = 'Retail'
      AND External_ID__c IN (
        SELECT Account.External_ID__c FROM CampaignMember
        WHERE Campaign.External_ID__c = 'HYDRATE-CMP-001'
      )
```

### Filter expression notes

- All filters include an implicit `External_ID__c LIKE 'HYDRATE-%'` clause appended at runtime by `segments.py` (no need to repeat it in every YAML entry — the segment loader injects it). This prevents segments from accidentally leaking the org's existing 178 non-hydrate accounts.
- Filter syntax uses the org's Data Cloud SQL dialect. The DMO field names referenced in filters (`FinServ__ClientCategory__c`, `External_ID__c`, `Account.External_ID__c`, etc.) are post-mapping names — i.e., they reference the DMO field names that resulted from the user's already-completed mapping work. The implementation plan's first task validates these against the live DMO schema.

### Target DMO

For Plan 2, all segments target `UnifiedIndividual__dlm` (the standard FSC unified-individual DMO that Person Accounts + business Contacts unify into). The `target_dmo` field in YAML allows override per-segment if a different DMO is more appropriate. The implementation plan's first task confirms the actual DMO API name in the user's org and updates the spec if it differs.

---

## §4 REST client extensions to `phase5/data_cloud.py`

The existing `data_cloud.py` has stream discovery + trigger + run-status. Phase 2 adds segment CRUD methods using the same auth pattern (`get_org_session(target_org)` for instance URL + access token).

### New methods

```python
def list_segments(instance_url, access_token, api_version="v60.0") -> list[SegmentInfo]:
    """List all DC Segments. GET /services/data/{v}/ssot/segments."""

def create_segment(instance_url, access_token, *,
                   api_name: str, display_name: str, description: str,
                   target_dmo: str, filter_sql: str,
                   publish_schedule: str = "manual",
                   api_version="v60.0") -> tuple[bool, str | None]:
    """Create a new segment. POST /services/data/{v}/ssot/segments.
    Returns (success, error_message_or_segment_id)."""

def patch_segment(instance_url, access_token, *,
                  api_name: str, display_name: str, description: str,
                  filter_sql: str, publish_schedule: str,
                  api_version="v60.0") -> tuple[bool, str | None]:
    """Update an existing segment. PATCH /services/data/{v}/ssot/segments/{api_name}."""

def publish_segment(instance_url, access_token, *,
                    api_name: str,
                    api_version="v60.0") -> tuple[bool, str | None]:
    """Trigger a segment publish (membership computation).
    POST /services/data/{v}/ssot/segments/{api_name}/publish."""

def get_segment_status(instance_url, access_token, *,
                       api_name: str,
                       api_version="v60.0") -> SegmentStatus:
    """GET /services/data/{v}/ssot/segments/{api_name}.
    Returns dataclass with status, member_count, last_publish_time."""
```

### New dataclasses

```python
@dataclass
class SegmentInfo:
    api_name: str
    display_name: str
    description: str
    target_dmo: str
    publish_schedule: str

@dataclass
class SegmentStatus:
    api_name: str
    status: str          # DRAFT | PUBLISHING | PUBLISHED | FAILED
    member_count: int | None
    last_publish_time: str | None  # ISO 8601
    error: str | None = None
```

### Auth and error handling

- Reuse `get_org_session(target_org)` from existing `phase5/data_cloud.py`
- All errors NEVER raise — return `(False, error_message)` tuples per the Phase 5.5 fire-and-forget pattern
- HTTP 4xx/5xx are captured and logged in the manifest

---

## §5 `phase5/segments.py` — orchestration

Top-level entry points for the new CLI subcommands.

```python
@dataclass
class SegmentDefinition:
    """Parsed entry from segments.yaml."""
    config_key: str
    api_name: str          # f"HYDRATE_{config_key}__seg" (PascalCase the parts as needed)
    display_name: str
    description: str
    persona: str
    publish_schedule: str
    target_dmo: str
    filter_sql: str        # the user's filter, with HYDRATE-* clause injected
    linked_campaign: str | None = None


@dataclass
class SegmentCreateResult:
    config_key: str
    api_name: str
    created: bool          # True if newly created or successfully patched
    published: bool        # True if publish call succeeded
    member_count: int | None = None
    error: str | None = None


@dataclass
class CreateSegmentsResult:
    segments_processed: int = 0
    segments_created: int = 0
    segments_patched: int = 0
    segments_published: int = 0
    segments_failed: int = 0
    results: list[SegmentCreateResult] = field(default_factory=list)


def load_segment_definitions(yaml_path: Path) -> list[SegmentDefinition]:
    """Parse segments.yaml. Validates required fields. Injects the
    HYDRATE-* filter clause into each rule.filter.
    Raises ValueError on malformed YAML."""


def execute_create_segments(
    *,
    target_org: str,
    yaml_path: Path,
    segment_id: str | None = None,    # None = all; else only this config_key
    skip_publish: bool = False,
    dry_run: bool = False,
) -> CreateSegmentsResult:
    """Create + publish segments. Idempotent: existing segments are PATCHed.

    Idempotency: list_segments() first to find existing HYDRATE_*__seg names,
    then for each YAML entry decide create vs patch. Publish is always called
    (no-op if no changes since last publish; otherwise triggers a new run).

    `dry_run`: parse YAML + list existing segments, print plan, don't make any
    changes. Useful for diffing what would happen.

    `skip_publish`: create + patch, but don't publish. Segments stay DRAFT.

    `segment_id`: if set, only process that one config_key. Useful for debugging
    a single segment or iteratively rolling out.

    Phase 2 fire-and-forget: any per-segment failure is recorded in the result
    but DOES NOT raise. Caller decides whether to exit 0 or non-zero based on
    `result.segments_failed`."""


def execute_refresh_streams(*, target_org: str) -> DataCloudStreamRefreshResult:
    """Thin wrapper around the existing execute_phase5_5() in data_cloud.py.
    Same behavior, just a clearer subcommand name. The function exists so the
    CLI dispatch can call it directly without going through runner_p5."""
```

---

## §6 CLI changes — `cli.py`

### New subcommands

```python
# In build_parser():

p_refresh = sub.add_parser("refresh-streams", help="Refresh DC streams sourcing from hydrated objects")
_add_global_args(p_refresh)
p_refresh.add_argument("--allow-production", action="store_true",
                       help="Required for non-sandbox orgs (per project convention)")

p_segments = sub.add_parser("create-segments", help="Create + publish DC segments from segments.yaml")
_add_global_args(p_segments)
p_segments.add_argument("--allow-production", action="store_true")
p_segments.add_argument("--segment-id", default=None,
                        help="Process only one segment by config key")
p_segments.add_argument("--skip-publish", action="store_true",
                        help="Create/patch but don't publish")
p_segments.add_argument("--dry-run", action="store_true",
                        help="Print what would happen without making changes")
```

### Dispatch in `main()`

```python
if args.subcommand == "refresh-streams":
    return _run_refresh_streams(args)
if args.subcommand == "create-segments":
    return _run_create_segments(args)
```

### Implementations

```python
def _run_refresh_streams(args) -> int:
    """Refresh DC streams sourcing from hydrated objects."""
    if args.target_org is None:
        print("--target-org is required", file=sys.stderr)
        return 2
    # Production guard (same pattern as Plan 5)
    runner = SfRunner(args.target_org)
    org_info = runner._run([
        "sf", "org", "display", "--target-org", args.target_org, "--json"
    ])
    is_sandbox = bool(org_info.get("result", {}).get("isSandbox", False))
    if not is_sandbox and not args.allow_production:
        print(f"Refusing to refresh streams in non-sandbox org {args.target_org}. "
              f"Pass --allow-production to override.", file=sys.stderr)
        return 2

    from customer_hydration.phase5.segments import execute_refresh_streams
    result = execute_refresh_streams(target_org=args.target_org)

    # Write a small manifest in output_dir
    from datetime import datetime, timezone
    manifest_path = (Path(args.output_dir) / f"refresh-streams-{datetime.now(timezone.utc).strftime('%Y-%m-%dT%H%M')}.json")
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps({
        "target_org": args.target_org,
        "streams_discovered": result.streams_discovered,
        "streams_matched": result.streams_matched,
        "streams_triggered": result.streams_triggered,
        "stream_runs": [
            {"stream_api_name": sr.stream_api_name,
             "source_object": sr.source_object,
             "run_id": sr.run_id,
             "status": sr.status,
             "triggered_at": sr.triggered_at,
             "error": sr.error}
            for sr in result.stream_runs
        ],
        "stream_trigger_failures": result.stream_trigger_failures,
    }, indent=2), encoding="utf-8")

    print(f"Refreshed {result.streams_triggered} of {result.streams_matched} matched streams")
    print(f"Manifest: {manifest_path}")
    return 0  # fire-and-forget — failures logged, exit 0


def _run_create_segments(args) -> int:
    """Create + publish DC segments from segments.yaml."""
    if args.target_org is None and not args.dry_run:
        print("--target-org is required (unless --dry-run)", file=sys.stderr)
        return 2
    # Production guard same as above (skip if dry-run)
    if not args.dry_run:
        # ... same production guard pattern ...
        pass

    yaml_path = Path(args.config_dir) / "segments.yaml"
    if not yaml_path.exists():
        print(f"segments.yaml not found at {yaml_path}", file=sys.stderr)
        return 2

    from customer_hydration.phase5.segments import execute_create_segments
    result = execute_create_segments(
        target_org=args.target_org or "DRY-RUN",
        yaml_path=yaml_path,
        segment_id=args.segment_id,
        skip_publish=args.skip_publish,
        dry_run=args.dry_run,
    )

    # Write per-run manifest
    if not args.dry_run:
        from datetime import datetime, timezone
        manifest_path = (Path(args.output_dir) / f"create-segments-{datetime.now(timezone.utc).strftime('%Y-%m-%dT%H%M')}.json")
        # ... write manifest ...

    print(f"Segments processed: {result.segments_processed}")
    print(f"  Created: {result.segments_created}")
    print(f"  Patched: {result.segments_patched}")
    print(f"  Published: {result.segments_published}")
    print(f"  Failed: {result.segments_failed}")
    return 0  # fire-and-forget
```

### `dc-status` extension

Currently shows stream-run state. Extended to also show segment-publication state.

```python
def _run_dc_status(args) -> int:
    # ... existing stream-state logic ...

    # NEW: also poll segment publication state
    if args.target_org:
        try:
            from customer_hydration.phase5.segments import load_segment_definitions
            from customer_hydration.phase5.data_cloud import get_org_session, get_segment_status
            yaml_path = Path(args.config_dir) / "segments.yaml"
            if yaml_path.exists():
                instance_url, access_token = get_org_session(args.target_org)
                definitions = load_segment_definitions(yaml_path)
                print()
                print("=== Segments ===")
                for sd in definitions:
                    status = get_segment_status(instance_url, access_token, api_name=sd.api_name)
                    print(f"  {sd.api_name:50s} {status.status:12s} "
                          f"members={status.member_count or '?':>8} "
                          f"last_run={status.last_publish_time or 'never'}")
        except Exception as exc:
            print(f"Segment polling failed: {exc}", file=sys.stderr)

    # `--watch` extension: poll every 30s until all segments PUBLISHED
    # Already a no-op flag from Plan 5; Phase 2 implements it for both streams + segments
```

---

## §7 Idempotency

### Segment API names

Deterministic format: `HYDRATE_{ConfigKeyInPascalCase}__seg`

Examples:
- `retail_all` → `HYDRATE_RetailAll__seg`
- `wealth_pre_retiree` → `HYDRATE_WealthPreRetiree__seg`
- `cmp_heloc_refi_outreach` → `HYDRATE_CmpHelocRefiOutreach__seg`

The `HYDRATE_` prefix mirrors the Phase 1 `HYDRATE-` External-Id namespace and serves the same purpose: makes Phase 2 segments distinguishable from any other segments in the org. Reset semantics (a future task, not Phase 2 scope) can wipe `HYDRATE_*__seg` cleanly.

### Re-run behavior

`execute_create_segments` is fully idempotent:

1. List existing segments via `list_segments()`
2. For each YAML entry:
   - If `api_name` exists → `patch_segment()` with the YAML's current values (updates description, filter, schedule)
   - If `api_name` doesn't exist → `create_segment()`
3. Always call `publish_segment()` (no-op if the segment hasn't changed; otherwise triggers a fresh computation run)

A re-run with no YAML changes is effectively a "republish all" — useful when the underlying data has changed (e.g., new Phase 1 records loaded) and you want to refresh segment membership.

### Refresh-streams re-run behavior

Already idempotent in Phase 5.5: triggering a stream that's already running is a logged no-op, not an error.

### Reset path

**Out of scope for Phase 2.** A future Phase 3 (or Phase 2.5) could add `python hydrate.py reset --segments` that wipes all `HYDRATE_*__seg` segments via the REST DELETE endpoint. Phase 2 doesn't ship reset for segments — they accumulate as the user iterates on YAML.

---

## §8 Testing strategy

Following the Plan 5 / Plan 6 pattern for Phase 5 + 5.5 tests.

### Unit tests (mocked REST + subprocess)

`tests/test_segments.py` — ~20 tests:
- `load_segment_definitions` — YAML parsing, required-field validation, HYDRATE-* filter injection
- `execute_create_segments` — list/create/patch/publish flow with mocked `urlopen`
- `execute_create_segments --dry-run` — prints plan, makes zero REST calls
- `execute_create_segments --segment-id X` — only processes that one segment
- `execute_create_segments --skip-publish` — calls create/patch but not publish
- Idempotency: existing segment → patch, not create
- Per-segment failure handling: REST 4xx returns failure tuple, doesn't raise

`tests/test_cli_phase2.py` — ~8 tests:
- `refresh-streams` argparse parses
- `create-segments` argparse parses with all flags
- `_run_refresh_streams` requires `--target-org`
- `_run_create_segments` requires `--target-org` (unless dry-run)
- Production guard fires for non-sandbox orgs without `--allow-production`
- `dc-status` segment view formats correctly

### Live verification

Three live smoke tests during implementation, each their own task in the implementation plan:

1. **Refresh streams**: `python hydrate.py refresh-streams --target-org jdo-fw51xz --allow-production` — verify it discovers configured streams + triggers them. Manifest captures run Ids.
2. **Create segments dry-run**: `python hydrate.py create-segments --target-org jdo-fw51xz --dry-run` — parses YAML, lists existing segments, prints plan without REST calls.
3. **Create segments live**: `python hydrate.py create-segments --target-org jdo-fw51xz --allow-production` — full create + publish for all 20 segments. Verify via `dc-status` that segments reach PUBLISHED state with non-zero member counts.

### Test count target

- Phase 1 baseline: 399 tests
- Phase 2 additions: ~28 tests
- Phase 2 final: ~427 tests, all green

---

## §9 Implementation plan structure

This is one cohesive scope (not multi-plan like Phase 1). A single implementation plan is appropriate. Likely 12-15 tasks:

| Task | Component |
|---|---|
| 1 | Pre-flight: confirm DMO API name + filter syntax against jdo-fw51xz |
| 2 | `config/segments.yaml` — write all 20 segment definitions |
| 3 | `phase5/data_cloud.py` — add 5 segment CRUD methods + `SegmentInfo` / `SegmentStatus` dataclasses + tests |
| 4 | `phase5/segments.py` — `load_segment_definitions` + tests |
| 5 | `phase5/segments.py` — `execute_create_segments` (orchestration + idempotency) + tests |
| 6 | `phase5/segments.py` — `execute_refresh_streams` thin wrapper + test |
| 7 | `cli.py` — `refresh-streams` subcommand + tests |
| 8 | `cli.py` — `create-segments` subcommand + tests |
| 9 | `cli.py` — `dc-status` segment view extension + tests |
| 10 | `cli.py` — `--watch` flag implementation (poll every 30s, both streams + segments) |
| 11 | Live smoke: `refresh-streams` against jdo-fw51xz |
| 12 | Live smoke: `create-segments --dry-run` against jdo-fw51xz |
| 13 | Live smoke: `create-segments` (full) against jdo-fw51xz, verify via `dc-status` |
| 14 | README + CHANGELOG closeout for Phase 2 |
| 15 | Final AGENTS.md pass with Phase 2 learnings |

---

## §10 Phase 2 success criteria

- [ ] `python hydrate.py refresh-streams --target-org jdo-fw51xz --allow-production` discovers and triggers configured streams; manifest captures stream run Ids
- [ ] `python hydrate.py create-segments --target-org jdo-fw51xz --dry-run` parses `segments.yaml`, lists existing segments, prints plan without REST calls
- [ ] `python hydrate.py create-segments --target-org jdo-fw51xz --allow-production` creates and publishes all 20 segments
- [ ] Re-running `create-segments` is idempotent (existing segments PATCHed, not duplicated)
- [ ] `python hydrate.py dc-status --target-org jdo-fw51xz` reports both stream-run state and segment-publication state
- [ ] `python hydrate.py dc-status --target-org jdo-fw51xz --watch` polls every 30 seconds until all segments PUBLISHED or one fails
- [ ] `--segment-id` flag scopes `create-segments` to a single segment
- [ ] `--skip-publish` flag creates/patches without publishing
- [ ] All 20 segments reach `PUBLISHED` state with non-zero member counts
- [ ] All 427+ unit tests pass
- [ ] AGENTS.md reflects Phase 2's REST patterns + idempotency model
- [ ] Top-level `CHANGELOG.md` records Phase 2 as a single dated entry under May 2026

---

## §11 Open questions

None. All design decisions resolved during the 2026-05-22 brainstorming session.

## §12 References

- Phase 1 spec: `Customer_Hydration/docs/superpowers/specs/2026-05-19-customer-hydration-design.md` §6 ("Phase 2 explicit non-goals")
- Phase 5.5 design: same spec, §4 ("Phase 5.5 — Data Cloud stream refresh")
- Existing `phase5/data_cloud.py` — REST client patterns Phase 2 extends
- Existing `phase5/__init__.py` — sub-package init Phase 2 reuses
- `Customer_Hydration/config/personas.yaml` — anchor model that drives segment filter logic
- `Customer_Hydration/customer_hydration/generators/campaigns.py` — the 10 hardcoded campaigns the campaign-aligned segments target
